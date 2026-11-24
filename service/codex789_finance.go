package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// The island AI Coding panel is not a new-api gateway: it speaks
// its own REST API under /api/v1 and hands out a 24 hour access token for a
// refresh token. Every exchange rotates the refresh token and invalidates the
// old one, so the newest value has to be stored before the next call starts.
const (
	codex789PageSize = 100
	codex789MaxPages = 40
	codex789Timeout  = 60 * time.Second
)

// RefreshCodex789Token exchanges a refresh token for an access token and the
// refresh token that replaces it.
func RefreshCodex789Token(ctx context.Context, baseUrl, refreshToken string) (string, string, error) {
	var response struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := codex789Call(ctx, http.MethodPost, codex789Endpoint(baseUrl, "/auth/refresh"), "",
		map[string]string{"refresh_token": refreshToken}, &response); err != nil {
		return "", "", err
	}
	if strings.TrimSpace(response.AccessToken) == "" || strings.TrimSpace(response.RefreshToken) == "" {
		return "", "", errors.New("the codex789 refresh returned no usable token")
	}
	return response.AccessToken, response.RefreshToken, nil
}

// FetchCodex789Balance reads the wallet the panel reports for the account.
func FetchCodex789Balance(ctx context.Context, baseUrl, accessToken string) (float64, error) {
	var response struct {
		Balance float64 `json:"balance"`
	}
	if err := codex789Call(ctx, http.MethodGet, codex789Endpoint(baseUrl, "/auth/me"), accessToken, nil, &response); err != nil {
		return 0, err
	}
	return response.Balance, nil
}

// FetchCodex789TopUps reads the redemption codes the account has spent. The
// panel sells credit only through codes, so a spent code is the purchase
// itself. Codes that were never spent are skipped: they are not money spent
// yet.
func FetchCodex789TopUps(ctx context.Context, baseUrl, accessToken string) ([]model.UpstreamTopUp, error) {
	rows := make([]model.UpstreamTopUp, 0)
	for page := 1; page <= codex789MaxPages; page++ {
		var response struct {
			Items []struct {
				Id     int64   `json:"id"`
				Code   string  `json:"code"`
				Value  float64 `json:"value"`
				Status string  `json:"status"`
				UsedAt string  `json:"used_at"`
			} `json:"items"`
		}
		endpoint := fmt.Sprintf("%s?page=%d&page_size=%d", codex789Endpoint(baseUrl, "/redeem/history"), page, codex789PageSize)
		if err := codex789Call(ctx, http.MethodGet, endpoint, accessToken, nil, &response); err != nil {
			return nil, err
		}
		for _, item := range response.Items {
			paidAt := codex789Time(item.UsedAt)
			if paidAt == 0 {
				continue
			}
			tradeNo := strings.TrimSpace(item.Code)
			if tradeNo == "" {
				tradeNo = fmt.Sprintf("id:%d", item.Id)
			}
			rows = append(rows, model.UpstreamTopUp{
				TradeNo: model.UpstreamTopUpMethodRedeem + ":" + tradeNo,
				Paid:    item.Value,
				Method:  model.UpstreamTopUpMethodRedeem,
				Status:  item.Status,
				PaidAt:  paidAt,
			})
		}
		if len(response.Items) < codex789PageSize {
			break
		}
	}
	return rows, nil
}

// FetchCodex789Usage sums the billed cost inside [start, end). The panel's
// stats endpoint ignores every time filter, so the window has to be cut from
// the usage rows, which come newest first.
func FetchCodex789Usage(ctx context.Context, baseUrl, accessToken string, start, end time.Time) (float64, error) {
	total := 0.0
	for page := 1; page <= codex789MaxPages; page++ {
		var response struct {
			Items []struct {
				TotalCost float64 `json:"total_cost"`
				CreatedAt string  `json:"created_at"`
			} `json:"items"`
		}
		endpoint := fmt.Sprintf("%s?page=%d&page_size=%d", codex789Endpoint(baseUrl, "/usage"), page, codex789PageSize)
		if err := codex789Call(ctx, http.MethodGet, endpoint, accessToken, nil, &response); err != nil {
			return 0, err
		}
		oldest := int64(math.MaxInt64)
		for _, item := range response.Items {
			created := codex789Time(item.CreatedAt)
			if created == 0 {
				continue
			}
			oldest = min(oldest, created)
			if created >= start.Unix() && created < end.Unix() {
				total += item.TotalCost
			}
		}
		if len(response.Items) < codex789PageSize || oldest < start.Unix() {
			break
		}
	}
	return total, nil
}

// SyncCodex789Finance refreshes one codex789 funding account: the wallet, the
// redemption payments and the seven complete days of usage. The rotated refresh
// token is stored first, because the panel has already invalidated the old one.
func SyncCodex789Finance(accountId int, now time.Time) error {
	account, err := model.GetUpstreamAccount(accountId)
	if err != nil {
		return err
	}
	baseUrl := strings.TrimRight(strings.TrimSpace(account.BaseUrl), "/")
	if baseUrl == "" {
		return errors.New("the codex789 base url is required")
	}
	refreshToken := strings.TrimSpace(account.Credential)
	if refreshToken == "" {
		return errors.New("the codex789 refresh token is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), codex789Timeout)
	defer cancel()
	accessToken, nextRefreshToken, err := RefreshCodex789Token(ctx, baseUrl, refreshToken)
	if err != nil {
		return err
	}
	if err := model.UpdateUpstreamCredential(accountId, nextRefreshToken); err != nil {
		return err
	}
	checkedAt := common.GetTimestamp()
	// The wallet and the payments are separate readings: a failure in one must
	// not hide the other.
	if balance, err := FetchCodex789Balance(ctx, baseUrl, accessToken); err != nil {
		_ = model.SaveUpstreamBalance(accountId, nil, checkedAt, err.Error())
	} else {
		rounded := math.Round(balance*100) / 100
		_ = model.SaveUpstreamBalance(accountId, &rounded, checkedAt, "")
	}
	var topUpErr error
	if rows, err := FetchCodex789TopUps(ctx, baseUrl, accessToken); err != nil {
		topUpErr = err
	} else if err := model.SyncUpstreamTopUps(accountId, account.Currency, account.ExchangeRate, rows); err != nil {
		topUpErr = err
	}
	start, end := UpstreamUsageWindow(now)
	usage, usageErr := FetchCodex789Usage(ctx, baseUrl, accessToken, start, end)
	if usageErr != nil {
		_ = model.SaveUpstreamUsage(accountId, 0, start.Unix(), end.Unix(), checkedAt, model.UpstreamUsageStatusError, usageErr.Error())
		if topUpErr != nil {
			return topUpErr
		}
		return usageErr
	}
	usage = math.Round(usage*100) / 100
	if err := model.SaveUpstreamUsage(accountId, usage, start.Unix(), end.Unix(), checkedAt, model.UpstreamUsageStatusOK, ""); err != nil {
		return err
	}
	return topUpErr
}

func codex789Endpoint(baseUrl, path string) string {
	return strings.TrimRight(strings.TrimSpace(baseUrl), "/") + "/api/v1" + path
}

// codex789Call performs one panel request and decodes its envelope. It never
// follows a redirect: the credential must not travel to a host the operator
// did not name.
func codex789Call(ctx context.Context, method, endpoint, accessToken string, payload any, out any) error {
	var body io.Reader
	if payload != nil {
		encoded, err := common.Marshal(payload)
		if err != nil {
			return errors.New("the codex789 request could not be encoded")
		}
		body = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return errors.New("invalid codex789 url")
	}
	request.Header.Set("Accept", "application/json")
	if payload != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if accessToken != "" {
		request.Header.Set("Authorization", "Bearer "+accessToken)
	}
	client := &http.Client{
		Timeout: codex789Timeout,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	response, err := client.Do(request)
	if err != nil {
		return errors.New("the codex789 panel did not respond")
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, upstreamUsageMaxBytes))
	if err != nil {
		return errors.New("the codex789 panel response was unreadable")
	}
	if response.StatusCode == http.StatusUnauthorized {
		return errors.New("the codex789 refresh token was rejected, paste a new one into this account")
	}
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("the codex789 panel returned HTTP %d", response.StatusCode)
	}
	var envelope struct {
		Code    any             `json:"code"`
		Message string          `json:"message"`
		Data    json.RawMessage `json:"data"`
	}
	if err := common.Unmarshal(raw, &envelope); err != nil {
		return errors.New("the codex789 panel did not return JSON")
	}
	if message, failed := codex789EnvelopeError(envelope.Code, envelope.Message); failed {
		return errors.New(message)
	}
	if out == nil {
		return nil
	}
	if len(envelope.Data) == 0 {
		return errors.New("the codex789 panel returned no data")
	}
	return common.Unmarshal(envelope.Data, out)
}

// codex789EnvelopeError reports whether the panel answered with a non-zero
// code. The panel sends 0 for success but a string such as "UNAUTHORIZED" for
// its own failures, so both shapes are read.
func codex789EnvelopeError(code any, message string) (string, bool) {
	switch value := code.(type) {
	case float64:
		if value == 0 {
			return "", false
		}
	case string:
		if value == "" || value == "0" {
			return "", false
		}
	default:
		return "", false
	}
	if strings.TrimSpace(message) == "" {
		return "the codex789 panel rejected the request", true
	}
	return "the codex789 panel rejected the request: " + strings.TrimSpace(message), true
}

// codex789Time reads the panel's RFC 3339 timestamps, which carry nanoseconds
// and an Asia/Shanghai offset.
func codex789Time(raw string) int64 {
	value := strings.TrimSpace(raw)
	if value == "" {
		return 0
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return 0
	}
	return parsed.Unix()
}
