package service

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
)

// CheckModelDailyTokenBudget runs before channel dispatch or financial reservation.
// Realtime is checked per generation, not per idle connection.
func CheckModelDailyTokenBudget(c *gin.Context, requested string) *types.NewAPIError {
	if c.Request.URL.Path == "/v1/realtime" {
		return nil
	}
	ctx, err := model.AdmitModelDailyTokens(c.Request.Context(), c.GetInt("id"), requested)
	if err == nil {
		c.Request = c.Request.WithContext(ctx)
		return nil
	}
	return ModelDailyTokenAPIError(c, err)
}

func ModelDailyTokenAPIError(c *gin.Context, err error) *types.NewAPIError {
	var exceeded *model.ModelDailyTokenLimitError
	if errors.As(err, &exceeded) {
		c.Header("Retry-After", strconv.FormatInt(max(1, exceeded.ResetsAt-time.Now().Unix()), 10))
		return types.NewErrorWithStatusCode(err, types.ErrorCode("model_daily_token_limit_exceeded"), http.StatusTooManyRequests, types.ErrOptionWithSkipRetry())
	}
	return types.NewErrorWithStatusCode(errors.New("Unable to verify model daily token usage; please retry"), types.ErrorCode("model_daily_token_limit_unavailable"), http.StatusServiceUnavailable, types.ErrOptionWithSkipRetry())
}

func ModelDailyRequestedName(c *gin.Context, fallback string) string {
	if requested := common.GetContextKeyString(c, constant.ContextKeyRequestedModel); requested != "" {
		return requested
	}
	return fallback
}

// ModelDailyTokenCount counts physical tokens, never quota or price-weighted
// quantities. OpenAI cache counts are subsets; native Anthropic input excludes
// cache reads/writes. Split cache-write buckets must not be counted twice.
func ModelDailyTokenCount(usage *dto.Usage, anthropic bool) int64 {
	if usage == nil {
		return 0
	}
	input := max(int64(usage.PromptTokens), 0)
	if anthropic {
		cacheWrite := max(int64(usage.PromptTokensDetails.CacheCreationTokensTotal()), model.AddModelDailyTokens(int64(usage.ClaudeCacheCreation5mTokens), int64(usage.ClaudeCacheCreation1hTokens)))
		input = model.AddModelDailyTokens(input, int64(usage.PromptTokensDetails.CachedTokens), cacheWrite)
	}
	input = max(input, int64(usage.InputTokens))
	total := model.AddModelDailyTokens(input, max(int64(usage.CompletionTokens), int64(usage.OutputTokens)))
	if total == 0 {
		return model.AddModelDailyTokens(int64(usage.TotalTokens))
	}
	return total
}

// ModelDailyTextTokenCount normalizes provider facts before pricing mutations.
// Legacy OpenRouter chat counts include caches even when tagged anthropic;
// canonical BillingUsage and native Claude facts carry exclusive cache input.
func ModelDailyTextTokenCount(info *relaycommon.RelayInfo, usage *dto.Usage) int64 {
	effective := effectiveBillingUsage(usage)
	exclusive := usageSemanticFromUsage(info, effective) == "anthropic" || isLegacyClaudeDerivedOpenAIUsage(info, effective)
	if info != nil && info.ChannelMeta != nil && info.ChannelType == constant.ChannelTypeOpenRouter && usage != nil && usage.BillingUsage == nil {
		exclusive = false
	}
	return ModelDailyTokenCount(effective, exclusive)
}
