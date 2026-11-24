package relay

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
)

// PrepareRequestBilling estimates and reserves one request's charge. Transports
// provide the current request body through BodyStorage or BillingRequestInput;
// channel retries retain the resulting billing session and pricing snapshot.
func PrepareRequestBilling(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
	if apiErr := service.CheckModelDailyTokenBudget(c, service.ModelDailyRequestedName(c, info.OriginModelName)); apiErr != nil {
		return apiErr
	}

	if info.TokenPlan {
		if err := prepareTokenPlanOutputLimit(c, info); err != nil {
			return types.NewErrorWithStatusCode(err, types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
		}
	}
	needSensitiveCheck := setting.ShouldCheckPromptSensitive()
	meta := &types.TokenCountMeta{TokenType: types.TokenTypeTokenizer}
	if info.Request != nil && (needSensitiveCheck || constant.CountToken || info.TokenPlan) {
		meta = info.Request.GetTokenCountMeta()
	} else {
		// Avoid building CombineText when only the pricing quantities are needed.
		switch request := info.Request.(type) {
		case *dto.GeneralOpenAIRequest:
			meta.MaxTokens = int(max(lo.FromPtr(request.MaxTokens), lo.FromPtr(request.MaxCompletionTokens)))
		case *dto.OpenAIResponsesRequest:
			meta.MaxTokens = int(lo.FromPtr(request.MaxOutputTokens))
		case *dto.ClaudeRequest:
			meta.MaxTokens = int(lo.FromPtr(request.MaxTokens))
		case *dto.ImageRequest:
			meta = request.GetTokenCountMeta()
		}
	}

	if needSensitiveCheck && meta != nil {
		if contains, words := service.CheckSensitiveText(meta.CombineText); contains {
			service.RequestPolicy(c).AddEvent(service.PolicyEvent{ErrorCode: string(types.ErrorCodeSensitiveWordsDetected), ErrorSource: "local", Decision: service.PolicyDecision{Action: "stop", Reason: "local_rejection", Source: "global"}, Health: "unchanged"})
			message := fmt.Sprintf("user sensitive words detected: %s", strings.Join(words, ", "))
			logger.LogWarn(c, message)
			return types.NewError(errors.New(message), types.ErrorCodeSensitiveWordsDetected)
		}
	}

	tokens, err := service.EstimateRequestToken(c, meta, info)
	if info.TokenPlan {
		tokens, err = service.CountRequestToken(c, meta, info)
	}
	if err != nil {
		return types.NewError(err, types.ErrorCodeCountTokenFailed)
	}
	info.SetEstimatePromptTokens(tokens)

	priceData, err := helper.ModelPriceHelper(c, info, tokens, meta)
	if err != nil {
		return types.NewError(err, types.ErrorCodeModelPriceError, types.ErrOptionWithStatusCode(http.StatusBadRequest))
	}
	if info.TokenPlan && meta.MaxTokens > 0 {
		// Reserve 10% of the output-ceiling estimate, retaining the ordinary
		// input-cost floor. Output limits and final pricing remain unchanged.
		if snap := info.TieredBillingSnapshot; snap != nil {
			input, inputErr := helper.ResolveIncomingBillingExprRequestInput(c, info)
			if inputErr != nil {
				return types.NewError(inputErr, types.ErrorCodeModelPriceError)
			}
			result, computeErr := billingexpr.ComputeTieredQuotaWithRequest(snap, billingexpr.TokenParams{P: float64(tokens), Len: float64(tokens), C: float64(meta.MaxTokens), CC: float64(tokens), CC1h: float64(tokens)}, input)
			if computeErr != nil {
				return types.NewError(computeErr, types.ErrorCodeModelPriceError)
			}
			if result.Clamp != nil {
				return types.NewError(errors.New("Token Plan request charge exceeds safe limits"), types.ErrorCodeModelPriceError)
			}
			reservation, err := common.QuotaRoundStrict(float64(result.ActualQuotaAfterGroup) * 0.1)
			if err != nil {
				return types.NewError(err, types.ErrorCodeModelPriceError)
			}
			priceData.QuotaToPreConsume = max(priceData.QuotaToPreConsume, reservation)
		} else if !priceData.UsePrice {
			quota, quotaErr := common.QuotaRoundStrict((float64(tokens)*max(1, priceData.CacheCreation1hRatio) + float64(meta.MaxTokens)*priceData.CompletionRatio) * priceData.ModelRatio * priceData.GroupRatioInfo.GroupRatio)
			if quotaErr != nil {
				return types.NewError(quotaErr, types.ErrorCodeModelPriceError)
			}
			reservation, err := common.QuotaRoundStrict(float64(quota) * 0.1)
			if err != nil {
				return types.NewError(err, types.ErrorCodeModelPriceError)
			}
			priceData.QuotaToPreConsume = max(priceData.QuotaToPreConsume, reservation)
		}
	}
	if priceData.FreeModel && !info.TokenPlan {
		logger.LogInfo(c, fmt.Sprintf("模型 %s 免费，跳过预扣费", info.OriginModelName))
		return nil
	}
	return service.PreConsumeBilling(c, priceData.QuotaToPreConsume, info)
}

// RefundFailedRequestBilling applies the common final-failure policy after all
// eligible attempts have ended. A settled BillingSession never refunds again.
func RefundFailedRequestBilling(c *gin.Context, info *relaycommon.RelayInfo, apiErr *types.NewAPIError) *types.NewAPIError {
	if apiErr == nil {
		return nil
	}
	apiErr = service.NormalizeViolationFeeError(apiErr)
	if info.Billing != nil {
		info.Billing.Refund(c)
	}
	service.ChargeViolationFeeIfNeeded(c, info, apiErr)
	return apiErr
}

// Token Plan bounds missing output limits for ordinary coding clients. Keep
// unknown fields in passthrough bodies instead of re-marshaling the entire DTO.
func prepareTokenPlanOutputLimit(c *gin.Context, info *relaycommon.RelayInfo) error {
	const defaultOutput = uint(4096)
	field := ""
	var limit *uint
	switch request := info.Request.(type) {
	case *dto.GeneralOpenAIRequest:
		if info.RelayMode == relayconstant.RelayModeEmbeddings || info.RelayMode == relayconstant.RelayModeModerations || info.RelayMode == relayconstant.RelayModeRerank {
			return nil
		}
		if request.N != nil && *request.N > 1 {
			return errors.New("Token Plan supports one completion per request")
		}
		limit, field = request.MaxCompletionTokens, "max_completion_tokens"
		if limit == nil {
			limit, field = request.MaxTokens, "max_tokens"
		}
		if limit == nil {
			value := defaultOutput
			request.MaxTokens, request.MaxCompletionTokens = &value, nil
			field, limit = "max_tokens", &value
		}
	case *dto.OpenAIResponsesRequest:
		field, limit = "max_output_tokens", request.MaxOutputTokens
		if limit == nil {
			value := defaultOutput
			request.MaxOutputTokens = &value
			limit = &value
		}
	case *dto.ClaudeRequest:
		field, limit = "max_tokens", request.MaxTokens
		if limit == nil {
			value := defaultOutput
			request.MaxTokens = &value
			limit = &value
		}
	case *dto.GeminiChatRequest:
		if len(request.Requests) > 0 || request.GenerationConfig.CandidateCount != nil && *request.GenerationConfig.CandidateCount > 1 {
			return errors.New("Token Plan supports one generation per request")
		}
		field, limit = "generationConfig", request.GenerationConfig.MaxOutputTokens
		if limit == nil {
			value := defaultOutput
			request.GenerationConfig.MaxOutputTokens = &value
			limit = &value
		}
	default:
		return nil
	}
	if *limit == 0 {
		return errors.New("Token Plan output limit must be positive")
	}
	info.TokenPlanOutputLimit = *limit
	input, err := helper.ResolveIncomingBillingExprRequestInput(c, info)
	if err != nil {
		return err
	}
	var body map[string]json.RawMessage
	if len(input.Body) > 0 {
		if err := common.Unmarshal(input.Body, &body); err != nil {
			return err
		}
	} else {
		encoded, err := common.Marshal(info.Request)
		if err != nil {
			return err
		}
		if err := common.Unmarshal(encoded, &body); err != nil {
			return err
		}
	}
	if body == nil {
		return errors.New("invalid Token Plan request body")
	}
	if field == "generationConfig" {
		var config map[string]json.RawMessage
		raw := body[field]
		if len(raw) == 0 {
			raw = body["generation_config"]
		}
		if len(raw) > 0 {
			if err := common.Unmarshal(raw, &config); err != nil {
				return err
			}
		}
		if config == nil {
			config = make(map[string]json.RawMessage)
		}
		config["maxOutputTokens"], err = common.Marshal(*limit)
		if err != nil {
			return err
		}
		delete(config, "max_output_tokens")
		body[field], err = common.Marshal(config)
		delete(body, "generation_config")
	} else {
		body[field], err = common.Marshal(*limit)
	}
	if err != nil {
		return err
	}
	input.Body, err = common.Marshal(body)
	if err != nil {
		return err
	}
	info.BillingRequestInput = &input
	if c != nil && c.Request != nil {
		storage, err := common.CreateBodyStorage(input.Body)
		if err != nil {
			return err
		}
		common.CleanupBodyStorage(c)
		c.Set(common.KeyBodyStorage, storage)
	}
	return nil
}
