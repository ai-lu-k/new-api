package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// GeeTestValidateURL is the provider's second-step validation endpoint. It is a
// variable so tests can point it at a local server instead of the real service.
var GeeTestValidateURL = "https://gcaptcha4.geetest.com/validate"

var (
	// ErrGeeTestRejected means the provider answered and refused this solution.
	ErrGeeTestRejected = errors.New("human verification rejected")
	// ErrGeeTestUnavailable means the provider could not be reached or its
	// account-level configuration no longer works, so nothing was decided.
	ErrGeeTestUnavailable = errors.New("human verification unavailable")
)

// The provider answers these codes when the captcha id itself is missing,
// illegal, deleted, paused or otherwise unusable for the whole account.
var geeTestAccountCodes = map[string]bool{
	"-50101": true, // missing captcha_id
	"-50102": true, // illegal captcha_id
	"-50103": true, // unknown validation id
	"-50104": true, // validation id deleted
	"-50105": true, // validation id paused
}

const geeTestProbeTTL = 30 * time.Second

type geeTestValidateResponse struct {
	Result string `json:"result"`
	Reason string `json:"reason"`
	Status string `json:"status"`
	Code   string `json:"code"`
}

var geeTestHealth struct {
	mu        sync.Mutex
	checkedAt time.Time
	healthy   bool
	observed  bool
}

// postGeeTestValidate calls the provider. It returns an error only when no
// answer could be read, never for a solution the provider rejected.
func postGeeTestValidate(ctx context.Context, captchaId, captchaKey, lotNumber, captchaOutput, passToken, genTime string) (geeTestValidateResponse, error) {
	mac := hmac.New(sha256.New, []byte(captchaKey))
	mac.Write([]byte(lotNumber))
	endpoint := GeeTestValidateURL + "?captcha_id=" + url.QueryEscape(captchaId)
	form := url.Values{
		"lot_number":     {lotNumber},
		"captcha_output": {captchaOutput},
		"pass_token":     {passToken},
		"gen_time":       {genTime},
		"sign_token":     {hex.EncodeToString(mac.Sum(nil))},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return geeTestValidateResponse{}, err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := &http.Client{Timeout: 3 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return geeTestValidateResponse{}, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 64<<10))
	if err != nil {
		return geeTestValidateResponse{}, err
	}
	if response.StatusCode != http.StatusOK {
		return geeTestValidateResponse{}, fmt.Errorf("geetest validate http %d", response.StatusCode)
	}
	var result geeTestValidateResponse
	if common.Unmarshal(body, &result) != nil {
		return geeTestValidateResponse{}, errors.New("geetest validate response is not JSON")
	}
	return result, nil
}

// VerifyGeeTestSolution revalidates one browser solution with the provider. The
// signing key never leaves the server, so a client cannot forge a pass.
func VerifyGeeTestSolution(ctx context.Context, captchaId, captchaKey, lotNumber, captchaOutput, passToken, genTime string) error {
	captchaId = strings.TrimSpace(captchaId)
	captchaKey = strings.TrimSpace(captchaKey)
	if captchaId == "" || captchaKey == "" {
		return ErrGeeTestUnavailable
	}
	if lotNumber == "" || captchaOutput == "" || passToken == "" || genTime == "" {
		return ErrGeeTestRejected
	}
	result, err := postGeeTestValidate(ctx, captchaId, captchaKey, lotNumber, captchaOutput, passToken, genTime)
	if err != nil {
		return ErrGeeTestUnavailable
	}
	if geeTestAccountCodes[result.Code] || result.Status == "error" {
		return ErrGeeTestUnavailable
	}
	if result.Result != "success" {
		return ErrGeeTestRejected
	}
	return nil
}

// ResetGeeTestHealth drops the cached probe result. Credential changes and
// tests must call it so the next decision uses the current endpoint.
func ResetGeeTestHealth() {
	geeTestHealth.mu.Lock()
	defer geeTestHealth.mu.Unlock()
	geeTestHealth.observed = false
	geeTestHealth.healthy = false
	geeTestHealth.checkedAt = time.Time{}
}

// GeeTestProviderHealthy asks the provider about a synthetic solution. A live
// account answers with a validation failure, while a revoked or unreachable
// account answers nothing usable. The answer is cached briefly so a degraded
// provider cannot be turned into one outbound call per request.
func GeeTestProviderHealthy(ctx context.Context, captchaId, captchaKey string) bool {
	captchaId = strings.TrimSpace(captchaId)
	captchaKey = strings.TrimSpace(captchaKey)
	if captchaId == "" || captchaKey == "" {
		return false
	}
	geeTestHealth.mu.Lock()
	defer geeTestHealth.mu.Unlock()
	if geeTestHealth.observed && time.Since(geeTestHealth.checkedAt) < geeTestProbeTTL {
		return geeTestHealth.healthy
	}
	result, err := postGeeTestValidate(ctx, captchaId, captchaKey, "geetest-health-probe", "probe", "probe", strconv.FormatInt(time.Now().Unix(), 10))
	healthy := err == nil && !geeTestAccountCodes[result.Code] && result.Status != "error"
	if !geeTestHealth.observed || geeTestHealth.healthy != healthy {
		common.SysError(fmt.Sprintf("geetest provider healthy=%v (code=%q status=%q err=%v)", healthy, result.Code, result.Status, err))
	}
	geeTestHealth.observed = true
	geeTestHealth.healthy = healthy
	geeTestHealth.checkedAt = time.Now()
	return healthy
}
