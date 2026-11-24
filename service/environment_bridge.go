package service

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	EnvironmentBridgeLoginMethod = model.EnvironmentBridgeLoginMethod
	EnvironmentConfigContextKey  = "environment_bridge_config"
	EnvironmentClaimsContextKey  = "environment_bridge_claims"
	environmentRequestUse        = "environment_request"
	environmentIssuer            = "new-api-production-bridge"
	environmentAudience          = "new-api-environment-bridge"
)

var ErrEnvironmentBridge = errors.New("environment bridge access denied")

type EnvironmentConfig struct {
	Role     string
	Upstream *url.URL
	Origin   string
	UserMap  map[string]string
	secret   []byte
	mu       sync.Mutex
	used     map[string]int64
}

type EnvParent struct {
	Identity  AuthIdentity `json:"identity"`
	Username  string       `json:"username"`
	Role      int          `json:"role"`
	ExpiresAt int64        `json:"expires_at"`
}

type EnvironmentRequestClaims struct {
	Parent            EnvParent `json:"parent"`
	StagingUsername   string    `json:"staging_username"`
	TokenUse          string    `json:"token_use"`
	Method            string    `json:"method"`
	RequestURI        string    `json:"request_uri"`
	BodyHash          string    `json:"body_hash"`
	AuthorizationHash string    `json:"authorization_hash"`
	Origin            string    `json:"origin"`
	verified          bool
	jwt.RegisteredClaims
}

// LoadEnvironmentConfig is opt-in and rejects partial or unsafe configuration.
// The staging endpoint requires HTTPS with a verified certificate.
func LoadEnvironmentConfig() (*EnvironmentConfig, error) {
	role := os.Getenv("APP_ENVIRONMENT_ROLE")
	if role == "" {
		for _, name := range []string{"APP_ENVIRONMENT_UPSTREAM", "APP_ENVIRONMENT_ORIGIN", "APP_ENVIRONMENT_BRIDGE_SECRET", "APP_ENVIRONMENT_USER_MAP"} {
			if os.Getenv(name) != "" {
				return nil, ErrEnvironmentBridge
			}
		}
		return nil, nil
	}
	if role != "production" && role != "staging" {
		return nil, ErrEnvironmentBridge
	}
	secret := os.Getenv("APP_ENVIRONMENT_BRIDGE_SECRET")
	if len(secret) < 32 || secret == common.SessionSecret || secret == common.CryptoSecret {
		return nil, ErrEnvironmentBridge
	}
	origin, err := url.Parse(os.Getenv("APP_ENVIRONMENT_ORIGIN"))
	if err != nil || origin.Host == "" || origin.User != nil || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" || origin.Opaque != "" || origin.ForceQuery {
		return nil, ErrEnvironmentBridge
	}
	ip := net.ParseIP(origin.Hostname())
	if origin.Scheme != "https" && !(origin.Scheme == "http" && (origin.Hostname() == "localhost" || ip != nil && ip.IsLoopback())) {
		return nil, ErrEnvironmentBridge
	}
	normalizedOrigin, err := common.NormalizeOrigin(origin.String())
	if err != nil {
		return nil, ErrEnvironmentBridge
	}
	config := &EnvironmentConfig{Role: role, Origin: normalizedOrigin, secret: []byte(secret), used: make(map[string]int64)}
	upstream := os.Getenv("APP_ENVIRONMENT_UPSTREAM")
	if role == "production" {
		target, err := url.Parse(upstream)
		if err != nil || target.Scheme != "https" || target.Hostname() == "" || target.User != nil ||
			target.Path != "" || target.RawQuery != "" || target.ForceQuery ||
			target.Fragment != "" || target.Opaque != "" || strings.Contains(upstream, "#") {
			return nil, ErrEnvironmentBridge
		}
		config.Upstream = target
		if err := common.UnmarshalJsonStr(os.Getenv("APP_ENVIRONMENT_USER_MAP"), &config.UserMap); err != nil || len(config.UserMap) == 0 {
			return nil, ErrEnvironmentBridge
		}
		for source, target := range config.UserMap {
			if source == "" || target == "" || strings.TrimSpace(source) != source || strings.TrimSpace(target) != target {
				return nil, ErrEnvironmentBridge
			}
		}
	} else if upstream != "" || os.Getenv("APP_ENVIRONMENT_USER_MAP") != "" {
		return nil, ErrEnvironmentBridge
	}
	return config, nil
}

func environmentKey(config *EnvironmentConfig, purpose string) []byte {
	mac := hmac.New(sha256.New, config.secret)
	_, _ = mac.Write([]byte("new-api/environment-bridge/v1/" + purpose))
	return mac.Sum(nil)
}

func environmentDigest(value []byte) string {
	digest := sha256.Sum256(value)
	return hex.EncodeToString(digest[:])
}

// SignEnvironmentRequest accepts an identity already authenticated against the
// production session store by the gateway. It is never a client-facing signer.
func SignEnvironmentRequest(config *EnvironmentConfig, request *http.Request, body []byte, parent EnvParent) (string, error) {
	if config == nil || config.Role != "production" || config.Upstream == nil ||
		config.Upstream.Scheme != "https" || request == nil || request.URL == nil || !validEnvironmentParent(parent) {
		return "", ErrEnvironmentBridge
	}
	username := config.UserMap[parent.Username]
	if username == "" {
		return "", ErrEnvironmentBridge
	}
	now := time.Now()
	claims := &EnvironmentRequestClaims{Parent: parent, StagingUsername: username, TokenUse: environmentRequestUse, Origin: config.Origin, Method: request.Method, RequestURI: request.URL.RequestURI(), BodyHash: environmentDigest(body), AuthorizationHash: environmentDigest([]byte(request.Header.Get("Authorization"))), RegisteredClaims: jwt.RegisteredClaims{Issuer: environmentIssuer, Audience: jwt.ClaimStrings{environmentAudience}, Subject: strconv.Itoa(parent.Identity.UserID), IssuedAt: jwt.NewNumericDate(now), NotBefore: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(time.Unix(min(now.Unix()+15, parent.ExpiresAt), 0)), ID: uuid.NewString()}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(environmentKey(config, environmentRequestUse))
}

func validEnvironmentParent(parent EnvParent) bool {
	return parent.Identity.UserID > 0 && parent.Identity.SessionID != "" && parent.Identity.UserAuthVersion > 0 && parent.Identity.SessionVersion > 0 && parent.Username != "" && (parent.Role == common.RoleAdminUser || parent.Role == common.RoleRootUser) && parent.ExpiresAt > time.Now().Unix() && parent.ExpiresAt <= time.Now().Add(LoginSessionTTL).Unix()
}

func VerifyEnvironmentRequest(config *EnvironmentConfig, request *http.Request, body []byte, raw string) (*EnvironmentRequestClaims, error) {
	if config == nil || config.Role != "staging" || request == nil || request.URL == nil || len(raw) > 8192 {
		return nil, ErrEnvironmentBridge
	}
	claims := &EnvironmentRequestClaims{}
	parsed, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) { return environmentKey(config, environmentRequestUse), nil }, jwt.WithValidMethods([]string{"HS256"}), jwt.WithIssuer(environmentIssuer), jwt.WithAudience(environmentAudience), jwt.WithExpirationRequired(), jwt.WithIssuedAt())
	if err != nil || !parsed.Valid || claims.TokenUse != environmentRequestUse || claims.ID == "" || len(claims.Audience) != 1 || claims.IssuedAt == nil || claims.NotBefore == nil || claims.ExpiresAt == nil || claims.ExpiresAt.Unix()-claims.IssuedAt.Unix() > 15 || claims.ExpiresAt.Unix() > claims.Parent.ExpiresAt || claims.Subject != strconv.Itoa(claims.Parent.Identity.UserID) || claims.StagingUsername == "" || !validEnvironmentParent(claims.Parent) {
		return nil, ErrEnvironmentBridge
	}
	if claims.Origin != config.Origin || claims.Method != request.Method || claims.RequestURI != request.URL.RequestURI() || !hmac.Equal([]byte(claims.BodyHash), []byte(environmentDigest(body))) || !hmac.Equal([]byte(claims.AuthorizationHash), []byte(environmentDigest([]byte(request.Header.Get("Authorization"))))) {
		return nil, ErrEnvironmentBridge
	}
	config.mu.Lock()
	defer config.mu.Unlock()
	now := time.Now().Unix()
	for nonce, expires := range config.used {
		if expires <= now {
			delete(config.used, nonce)
		}
	}
	if _, exists := config.used[claims.ID]; exists || len(config.used) >= 8192 {
		return nil, ErrEnvironmentBridge
	}
	config.used[claims.ID] = claims.ExpiresAt.Unix()
	claims.verified = true
	return claims, nil
}

// The shadow SID deliberately excludes the staging auth version: a staging
// password/security change must invalidate its existing session, not mint a
// fresh session. Production session/version changes establish a new binding.
func environmentSessionID(config *EnvironmentConfig, parent EnvParent, userID int) string {
	payload, _ := common.Marshal(struct {
		Identity    AuthIdentity
		StageUserID int
	}{parent.Identity, userID})
	mac := hmac.New(sha256.New, environmentKey(config, "shadow-session"))
	_, _ = mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}

func GetEnvironmentAuthBundle(config *EnvironmentConfig, claims *EnvironmentRequestClaims) (*AuthBundle, *model.UserBase, error) {
	if config == nil || config.Role != "staging" || claims == nil || !claims.verified || !validEnvironmentParent(claims.Parent) {
		return nil, nil, ErrEnvironmentBridge
	}
	user, err := model.GetEnvironmentUser(claims.StagingUsername)
	if err != nil {
		return nil, nil, ErrEnvironmentBridge
	}
	sid := environmentSessionID(config, claims.Parent, user.Id)
	var inaccessibleRefresh [32]byte
	if _, err := rand.Read(inaccessibleRefresh[:]); err != nil {
		return nil, nil, err
	}
	session, user, err := model.GetOrCreateEnvironmentSession(sid, claims.StagingUsername, environmentDigest(inaccessibleRefresh[:]), claims.Parent.Role, min(claims.Parent.ExpiresAt, time.Now().Add(LoginSessionTTL).Unix()))
	if err != nil {
		return nil, nil, err
	}
	if err := ValidateEnvironmentSession(config, claims, session, user); err != nil {
		return nil, nil, err
	}
	now := time.Now()
	expires := min(now.Add(AccessTokenTTL).Unix(), session.ExpiresAt, claims.Parent.ExpiresAt)
	accessClaims := &authClaims{TokenUse: accessTokenUse, SessionID: session.SID, UserAuthVersion: session.UserAuthVersion, SessionVersion: session.Version, RegisteredClaims: jwt.RegisteredClaims{Issuer: authTokenIssuer, Audience: jwt.ClaimStrings{authTokenAudience}, Subject: strconv.Itoa(user.Id), IssuedAt: jwt.NewNumericDate(now), NotBefore: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(time.Unix(expires, 0)), ID: uuid.NewString()}}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims).SignedString(authSigningKey(accessTokenUse))
	if err != nil {
		return nil, nil, err
	}
	return &AuthBundle{AccessToken: token, TokenType: "Bearer", AccessExpiresAt: expires, Session: sessionView(session, true)}, user, nil
}

func ValidateEnvironmentSession(config *EnvironmentConfig, claims *EnvironmentRequestClaims, session *model.UserSession, user *model.UserBase) error {
	if config == nil || config.Role != "staging" || claims == nil || !claims.verified || session == nil || user == nil || !validEnvironmentParent(claims.Parent) || claims.StagingUsername != user.Username || user.Status != common.UserStatusEnabled || !common.IsValidateRole(user.Role) || user.Role < common.RoleAdminUser || user.Role > claims.Parent.Role || session.LoginMethod != EnvironmentBridgeLoginMethod || session.UserID != user.Id || session.Status != model.UserSessionStatusActive || session.RevokedAt != 0 || session.ExpiresAt <= time.Now().Unix() || session.UserAuthVersion != user.AuthVersion || session.SID != environmentSessionID(config, claims.Parent, user.Id) {
		return ErrEnvironmentBridge
	}
	return nil
}

func RevokeEnvironmentSession(config *EnvironmentConfig, claims *EnvironmentRequestClaims) error {
	if config == nil || config.Role != "staging" || claims == nil || !claims.verified || !validEnvironmentParent(claims.Parent) {
		return ErrEnvironmentBridge
	}
	user, err := model.GetEnvironmentUser(claims.StagingUsername)
	if err != nil || user.Role < common.RoleAdminUser || user.Role > claims.Parent.Role {
		return ErrEnvironmentBridge
	}
	_, err = model.RevokeUserSession(user.Id, environmentSessionID(config, claims.Parent, user.Id), "environment_logout")
	return err
}
