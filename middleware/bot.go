package middleware

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/gin-gonic/gin"
)

const (
	// BotTokenEnv holds the credential of the external support bot. Several
	// comma-separated values are allowed so a rotation can accept the old and the
	// new credential at the same time; an empty value keeps the bot surface off.
	BotTokenEnv = "BOT_API_TOKEN"
	// BotTokenHeader is the only credential header the bot surface reads. A user
	// API key or a session cookie must never authenticate a bot request, so
	// neither is inspected here.
	BotTokenHeader = "X-Bot-Token"
	// BotTokenRefContextKey carries a fingerprint of the presented credential, so
	// handlers can audit which credential version was used without the secret.
	BotTokenRefContextKey = "bot_token_ref"

	botTokenLimitPerMinute = 60
	botTokenLimitWindow    = 60
)

// botTokenDigests parses the configured credentials into fixed-length digests.
// Comparing digests keeps the check independent of the presented length, so a
// short guess and a full-length value take the same path.
func botTokenDigests() [][sha256.Size]byte {
	var digests [][sha256.Size]byte
	for token := range strings.SplitSeq(os.Getenv(BotTokenEnv), ",") {
		token = strings.TrimSpace(token)
		if token == "" {
			continue
		}
		digests = append(digests, sha256.Sum256([]byte(token)))
	}
	return digests
}

func rejectBotCredential(c *gin.Context, reason string) {
	logger.LogWarn(c.Request.Context(), fmt.Sprintf("bot credential rejected (ip=%s, path=%s): %s", c.ClientIP(), c.Request.URL.Path, reason))
	// No detail and no challenge header: a caller cannot tell a missing
	// credential from a wrong one.
	c.AbortWithStatus(http.StatusUnauthorized)
}

// BotTokenAuth guards the support-bot API with a shared credential that is not a
// user API key, a personal access token or a session. It only authenticates the
// caller; authorization stays with the single read-only route it protects.
func BotTokenAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		digests := botTokenDigests()
		if len(digests) == 0 {
			// Unconfigured: answer as if the route did not exist rather than
			// advertising that a bot surface is switched off.
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		presented := strings.TrimSpace(c.GetHeader(BotTokenHeader))
		if presented == "" {
			rejectBotCredential(c, "missing credential")
			return
		}
		digest := sha256.Sum256([]byte(presented))
		matched := false
		// Every configured digest is compared without an early exit so the
		// response time does not reveal how close a guess was.
		for _, configured := range digests {
			if subtle.ConstantTimeCompare(digest[:], configured[:]) == 1 {
				matched = true
			}
		}
		if !matched {
			rejectBotCredential(c, "invalid credential")
			return
		}
		c.Set(BotTokenRefContextKey, hex.EncodeToString(digest[:]))
	}
}

// BotTokenRateLimit bounds one credential version per minute. The bot token is
// shared, so this is the effective ceiling for the whole bot, and it keeps an
// account-id sweep from walking the log table.
func BotTokenRateLimit() gin.HandlerFunc {
	if common.RedisEnabled {
		return func(c *gin.Context) {
			key := fmt.Sprintf("%s:bot:%s", redisRateLimitNamespace, c.GetString(BotTokenRefContextKey))
			allowed, _, ttlSeconds, err := redisFixedWindowTake(c.Request.Context(), key, botTokenLimitPerMinute, botTokenLimitWindow)
			if err != nil {
				logger.LogError(c.Request.Context(), fmt.Sprintf("bot rate limit check failed: %v", err))
				c.AbortWithStatus(http.StatusInternalServerError)
				return
			}
			rejectBotRateLimited(c, allowed, ttlSeconds)
		}
	}
	// It's safe to call multi times.
	inMemoryRateLimiter.Init(common.RateLimitKeyExpirationDuration)
	return func(c *gin.Context) {
		key := "BOT:" + c.GetString(BotTokenRefContextKey)
		allowed := inMemoryRateLimiter.Request(key, botTokenLimitPerMinute, botTokenLimitWindow)
		rejectBotRateLimited(c, allowed, botTokenLimitWindow)
	}
}

// rejectBotRateLimited reports an exhausted budget as the documented bot error
// code, with a back-off hint and without letting a proxy cache the rejection.
func rejectBotRateLimited(c *gin.Context, allowed bool, retryAfterSeconds int64) {
	if allowed {
		return
	}
	if retryAfterSeconds > 0 {
		c.Header("Retry-After", strconv.FormatInt(retryAfterSeconds, 10))
	}
	c.Header("Cache-Control", "no-store")
	c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"success": false, "code": "rate_limited"})
}
