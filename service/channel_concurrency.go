package service

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	kitdto "github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
)

// StartChannelGeneration admits one relay attempt for this user on the selected
// channel and installs its lease in the request context so asynchronous task
// persistence can replace the live reservation atomically. The channel limit is
// per user: other accounts' generations on the same channel never consume this
// user's slots. A channel that reads its pool status also gets a channel-wide
// cap, so many accounts cannot oversubscribe the shared upstream accounts.
// Callers must invoke the returned release when the attempt ends; releasing
// before a retry keeps each user's capacity independent. The release is always
// non-nil so callers can defer it immediately. A 429 rejection is a capacity
// state, never a channel fault: it is marked non-retryable and must not disable
// the channel. A channel-wide rejection additionally carries the capacity
// fallback hint, because another eligible channel may still have room for the
// same request while this user's own limit never moves anywhere.
func StartChannelGeneration(c *gin.Context, channelID int, userID int, setting kitdto.ChannelSettings, modelName string) (func(), *types.NewAPIError) {
	requestCtx := c.Request.Context()
	totalLimit := ChannelPoolGenerationLimit(requestCtx, setting)
	ctx, lease, err := model.StartChannelGeneration(requestCtx, channelID, userID, setting.ConcurrencyLimit, totalLimit)
	if err != nil {
		var rejection *model.ChannelGenerationConcurrencyError
		if !errors.As(err, &rejection) {
			// The user-facing message cannot carry the root cause, so record
			// the exact admission failure (deadlock, timeout, bad connection…)
			// with the request id for later diagnosis.
			common.SysError(fmt.Sprintf(
				"channel generation admission failed: request=%s channel=%d user=%d model=%s err=%s",
				c.GetString(common.RequestIdKey), channelID, userID, modelName, err.Error(),
			))
		}
		c.Header("Retry-After", "1")
		return nil, channelGenerationError(c, err, modelName)
	}
	if lease == nil {
		return func() {}, nil
	}
	c.Request = c.Request.WithContext(ctx)
	return func() {
		lease.Release()
		// Release cancels this attempt's lease context. The next attempt must
		// inherit the original request, including real client cancellation.
		c.Request = c.Request.WithContext(requestCtx)
	}, nil
}

func channelGenerationError(c *gin.Context, err error, modelName string) *types.NewAPIError {
	var rejection *model.ChannelGenerationConcurrencyError
	if errors.As(err, &rejection) {
		message := i18n.MsgChannelConcurrencyExceeded
		options := []types.NewAPIErrorOptions{types.ErrOptionWithSkipRetry()}
		if rejection.ChannelTotal {
			// The channel-wide cap says nothing about this account: another
			// eligible channel may still have room, so the rejection is marked
			// as a fallback the caller may take. The 429 itself is unchanged.
			message = i18n.MsgChannelCapacityExceeded
			options = append(options, types.ErrOptionWithChannelCapacityFallback())
		}
		return types.NewErrorWithStatusCode(
			errors.New(i18n.T(c, message, map[string]any{
				"Model": modelName,
				"InUse": rejection.InUse,
				"Limit": rejection.Limit,
			})),
			types.ErrorCodeChannelConcurrencyExceeded,
			http.StatusTooManyRequests,
			options...,
		)
	}
	return types.NewErrorWithStatusCode(
		errors.New(i18n.T(c, i18n.MsgChannelConcurrencyUnavailable, map[string]any{"Model": modelName})),
		types.ErrorCodeChannelConcurrencyUnavailable,
		http.StatusServiceUnavailable,
		types.ErrOptionWithSkipRetry(),
	)
}
