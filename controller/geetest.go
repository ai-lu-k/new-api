package controller

import (
	"errors"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

const geeTestProofTTL = 10 * time.Minute

// geeTestProof is the solution GeeTest hands back to the browser. It proves
// nothing on its own; the server revalidates it with the provider.
type geeTestProof struct {
	LotNumber     string `json:"lot_number"`
	CaptchaOutput string `json:"captcha_output"`
	PassToken     string `json:"pass_token"`
	GenTime       string `json:"gen_time"`
}

func geeTestAvailable() bool {
	return common.CryptoSecret != "" && common.GeeTestCaptchaId != "" && common.GeeTestCaptchaKey != ""
}

// Solutions are bounded before the outbound call, revalidated with the signing
// key, and then claimed once in the database so replays fail on every node.
func verifyGeeTest(c *gin.Context, proof *geeTestProof, purpose string) bool {
	if !geeTestAvailable() {
		return false
	}
	if proof == nil || len(proof.LotNumber) > 256 || len(proof.CaptchaOutput) > 4096 || len(proof.PassToken) > 4096 || len(proof.GenTime) > 32 {
		return geeTestDegraded(c)
	}
	if _, err := strconv.ParseInt(proof.GenTime, 10, 64); err != nil {
		return false
	}
	err := service.VerifyGeeTestSolution(c.Request.Context(), common.GeeTestCaptchaId, common.GeeTestCaptchaKey,
		proof.LotNumber, proof.CaptchaOutput, proof.PassToken, proof.GenTime)
	if err != nil {
		// A solution the provider refused is the visitor's problem; a provider
		// that cannot answer at all must not lock every visitor out.
		if errors.Is(err, service.ErrGeeTestRejected) {
			return false
		}
		return geeTestDegraded(c)
	}
	assertion := common.GenerateHMACWithKey([]byte("geetest-human:"+common.CryptoSecret), proof.LotNumber)
	return model.ClaimExternalAuthAssertion(purpose, assertion, time.Now().Add(geeTestProofTTL)) == nil
}

// geeTestDegraded allows the request only while the provider itself answers
// nothing usable. The decision comes from a server-side probe, never from the
// client, so omitting the solution cannot bypass a working provider.
func geeTestDegraded(c *gin.Context) bool {
	return !service.GeeTestProviderHealthy(c.Request.Context(), common.GeeTestCaptchaId, common.GeeTestCaptchaKey)
}
