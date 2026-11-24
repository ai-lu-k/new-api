package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"errors"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const EnvironmentHeader = "X-App-Environment"
const EnvironmentTicketHeader = "X-New-Api-Environment-Ticket"

// EnvironmentSelection authorizes browser navigation, not login. Every use
// must also validate Parent against the production session and current role.
type EnvironmentSelection struct {
	Parent   EnvParent `json:"parent"`
	StageSID string    `json:"stage_sid"`
	Version  string    `json:"version"`
	jwt.RegisteredClaims
}

func environmentSelectionKey() []byte {
	mac := hmac.New(sha256.New, []byte(common.SessionSecret))
	mac.Write([]byte("new-api/environment-selection/v1"))
	return mac.Sum(nil)
}

func IssueEnvironmentSelection(parent EnvParent, stageSID, version, origin string) (string, int64, error) {
	if parent.Identity.SessionID == "" || stageSID == "" || parent.Role < common.RoleAdminUser {
		return "", 0, ErrAuthTokenInvalid
	}
	now := time.Now()
	expires := min(now.Add(12*time.Hour).Unix(), parent.ExpiresAt)
	if expires <= now.Unix() {
		return "", 0, ErrAuthTokenExpired
	}
	claims := EnvironmentSelection{Parent: parent, StageSID: stageSID, Version: version,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer: "new-api-environment-selection", Audience: jwt.ClaimStrings{origin},
			IssuedAt: jwt.NewNumericDate(now), NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(time.Unix(expires, 0)), ID: uuid.NewString(),
		}}
	raw, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(environmentSelectionKey())
	return raw, expires, err
}

func ParseEnvironmentSelection(raw, origin string) (*EnvironmentSelection, error) {
	claims := &EnvironmentSelection{}
	parsed, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		return environmentSelectionKey(), nil
	}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithIssuer("new-api-environment-selection"),
		jwt.WithAudience(origin), jwt.WithExpirationRequired(), jwt.WithIssuedAt())
	if err != nil || !parsed.Valid || claims.ID == "" || claims.IssuedAt == nil || claims.NotBefore == nil || claims.StageSID == "" {
		return nil, ErrAuthTokenInvalid
	}
	return claims, nil
}

func ValidateEnvironmentParent(parent EnvParent) (*EnvParent, error) {
	session, user, err := ValidateLoginSession(parent.Identity)
	if err != nil {
		return nil, err
	}
	if user.Role < common.RoleAdminUser || user.Username != parent.Username || parent.ExpiresAt <= time.Now().Unix() {
		return nil, errors.New("environment access is not authorized")
	}
	parent.Role = user.Role
	parent.ExpiresAt = min(parent.ExpiresAt, session.ExpiresAt)
	return &parent, nil
}
