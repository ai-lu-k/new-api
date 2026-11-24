package service

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/relaytrace"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
)

// AppendTransportDiagnostics uses existing visibility projections. Users receive
// one outcome only; admins see bounded attempt summaries; event timelines are root-only.
func AppendTransportDiagnostics(info *relaycommon.RelayInfo, other *model.LogOther, includeFirstFailure ...bool) {
	if info == nil || info.TransportTrace == nil || other == nil {
		return
	}
	other.SetPublic("relay_outcome", relaytrace.PublicSummary(info.TransportTrace))
	attempts := make([]relaytrace.Summary, 0, len(info.TransportAttempts))
	timelines := make([]map[string]any, 0, len(info.TransportAttempts))
	for _, trace := range info.TransportAttempts {
		summary := trace.Snapshot()
		if len(summary.Timeline) > 0 && (summary.Detailed || len(includeFirstFailure) > 0 && includeFirstFailure[0]) {
			timelines = append(timelines, map[string]any{"attempt": summary.Attempt, "events": summary.Timeline})
		}
		summary.Timeline = nil
		attempts = append(attempts, summary)
	}
	other.SetAdmin("relay_diagnostics", map[string]any{"attempts": attempts, "truncated": info.TransportAttemptsTruncated})
	if len(timelines) > 0 {
		other.SetRoot("relay_timeline", timelines)
	}
}

// QueueRelayTimeoutLog snapshots only safe scalar identifiers and diagnostics.
// The worker never retains a Gin context, request body, headers, URL query, or
// upstream error text. Queue/storage failure is observable without blocking relay.
func QueueRelayTimeoutLog(c *gin.Context, info *relaycommon.RelayInfo) bool {
	if info == nil || info.TransportTrace == nil || !relaytrace.IsTimeout(info.TransportTrace.Snapshot()) {
		return false
	}
	if info.TransportTimeoutLog == info.TransportTrace {
		return true
	}
	info.TransportTimeoutLog = info.TransportTrace
	other := model.NewLogOther()
	AppendTransportDiagnostics(info, other, true)
	s := info.TransportTrace.Snapshot()
	other.SetPublic("request_path", s.Scope.Path)
	other.SetPublic("status_code", s.Status)
	log := &model.Log{UserId: info.UserId, Username: c.GetString("username"), CreatedAt: common.GetTimestamp(), Type: model.LogTypeError, Content: "Relay timeout diagnostics", TokenName: c.GetString("token_name"), ModelName: info.OriginModelName, ChannelId: s.Scope.Channel, TokenId: info.TokenId, UseTime: int(time.Since(info.StartTime).Seconds()), IsStream: info.IsStream, Group: info.UserGroup, RequestId: c.GetString(common.RequestIdKey), Other: other.JSONString()}
	model.EnqueueRelayDiagnostic(log)
	return true
}
