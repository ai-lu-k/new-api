package model

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

var ErrRegistrationVerificationRequired = errors.New("Complete email and human verification before registering. Open the sign-up page to continue.")

var ErrRegistrationVerificationResendWait = errors.New("Please wait one minute before requesting another verification code.")

const registrationVerificationPurpose = "registration_verification"

type registrationVerificationState struct {
	IPHash     string `json:"ip_hash"`
	DeviceHash string `json:"device_hash"`
	Email      string `json:"email"`
	CodeHash   string `json:"code_hash"`
	Attempts   int    `json:"attempts"`
}

type RegistrationProof struct {
	IPHash     string `json:"ip_hash"`
	DeviceHash string `json:"device_hash"`
	Email      string `json:"email"`
	ExpiresAt  int64  `json:"expires_at"`
	Nonce      string `json:"nonce"`
}

// The signed proof is bound to the server-observed signals and is claimed
// atomically with account creation. It authorizes only one registration.
func RegistrationProofWithTx(tx *gorm.DB, risk *RegistrationRisk, now time.Time) (*RegistrationProof, error) {
	payload, signature, ok := strings.Cut(risk.ProofToken, ".")
	expected := common.GenerateHMACWithKey([]byte("registration-proof:"+common.CryptoSecret), payload)
	if !ok || subtle.ConstantTimeCompare([]byte(signature), []byte(expected)) != 1 {
		return nil, ErrRegistrationVerificationRequired
	}
	data, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return nil, ErrRegistrationVerificationRequired
	}
	var proof RegistrationProof
	if common.Unmarshal(data, &proof) != nil || proof.IPHash != risk.IPHash || proof.DeviceHash != risk.DeviceHash || proof.ExpiresAt <= now.Unix() || proof.Email == "" || proof.Nonce == "" {
		return nil, ErrRegistrationVerificationRequired
	}
	var count int64
	if err := tx.Model(&AuthFlow{}).Where("token_hash = ? AND purpose = ?", authFlowTokenHash("external:registration_reward_proof:"+risk.ProofToken), "registration_reward_proof").Count(&count).Error; err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, ErrRegistrationVerificationRequired
	}
	return &proof, nil
}

func StartRegistrationVerification(risk *RegistrationRisk, email, code string, now time.Time) (string, error) {
	var token string
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockRegistrationRewards(tx); err != nil {
			return err
		}
		// Locking read sees the latest commits under MySQL REPEATABLE READ.
		var recent []AuthFlow
		emailHash := common.GenerateHMACWithKey([]byte("registration-email:"+common.CryptoSecret), email)
		if err := lockForUpdate(tx).Where("purpose = ? AND created_at > ? AND (provider = ? OR session_id = ?)", registrationVerificationPurpose, now.Add(-time.Minute), risk.IPHash, emailHash).Find(&recent).Error; err != nil {
			return err
		}
		if len(recent) > 0 {
			return ErrRegistrationVerificationResendWait
		}
		state := registrationVerificationState{IPHash: risk.IPHash, DeviceHash: risk.DeviceHash, Email: email, CodeHash: common.GenerateHMACWithKey([]byte("registration-code:"+common.CryptoSecret), email+":"+code)}
		data, err := common.Marshal(state)
		if err != nil {
			return err
		}
		token, _, err = createAuthFlowWithTx(tx, AuthFlowCreate{Purpose: registrationVerificationPurpose, Provider: risk.IPHash, SessionId: emailHash, Payload: string(data), ExpiresAt: now.Add(10 * time.Minute)})
		return err
	})
	return token, err
}

func CompleteRegistrationVerification(risk *RegistrationRisk, token, code string, now time.Time) (string, error) {
	var proofToken string
	err := DB.Transaction(func(tx *gorm.DB) error {
		match := AuthFlowMatch{Purpose: registrationVerificationPurpose}
		if err := applyAuthFlowMatch(tx.Model(&AuthFlow{}), token, match).UpdateColumn("payload", gorm.Expr("payload")).Error; err != nil {
			return err
		}
		var flow AuthFlow
		if err := applyAuthFlowMatch(tx, token, match).First(&flow).Error; err != nil {
			return ErrRewardVerification
		}
		var state registrationVerificationState
		if flow.ConsumedAt != nil || !flow.ExpiresAt.After(now) || common.UnmarshalJsonStr(flow.Payload, &state) != nil || state.Attempts >= 5 || state.IPHash != risk.IPHash || state.DeviceHash != risk.DeviceHash {
			return ErrRewardVerification
		}
		expected := common.GenerateHMACWithKey([]byte("registration-code:"+common.CryptoSecret), state.Email+":"+code)
		if len(code) != 6 || subtle.ConstantTimeCompare([]byte(expected), []byte(state.CodeHash)) != 1 {
			state.Attempts++
			payload, err := common.Marshal(state)
			if err != nil {
				return err
			}
			return tx.Model(&flow).Update("payload", string(payload)).Error
		}
		if err := ensureEmailAvailableWithTx(tx, state.Email, 0); err != nil {
			return err
		}
		nonce := make([]byte, 32)
		if _, err := rand.Read(nonce); err != nil {
			return err
		}
		proof := RegistrationProof{IPHash: risk.IPHash, DeviceHash: risk.DeviceHash, Email: state.Email, ExpiresAt: now.Add(10 * time.Minute).Unix(), Nonce: base64.RawURLEncoding.EncodeToString(nonce)}
		data, err := common.Marshal(proof)
		if err != nil {
			return err
		}
		payload := base64.RawURLEncoding.EncodeToString(data)
		proofToken = payload + "." + common.GenerateHMACWithKey([]byte("registration-proof:"+common.CryptoSecret), payload)
		// Discard OTP and email even during the auth artifact retention period.
		return tx.Model(&flow).Updates(map[string]any{"consumed_at": now, "payload": ""}).Error
	})
	if err != nil {
		return "", err
	}
	if proofToken == "" {
		return "", ErrRewardVerification
	}
	return proofToken, nil
}
