package service

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type realtimeGeneration struct {
	eventID      string
	originalID   any
	dailyContext context.Context
}

// RealtimeGenerationGate keeps VAD enabled while moving automatic response
// creation into the gateway, where admission can happen before upstream work.
// Both send callbacks must serialize websocket writes. Close the upstream before
// calling Close so a disconnect cannot free slots while it still generates.
type RealtimeGenerationGate struct {
	mu              sync.Mutex
	ctx             context.Context
	userID          int
	modelName       string
	target          func([]byte) error
	client          func([]byte) error
	ready           chan struct{}
	readyOnce       sync.Once
	initialized     bool
	managed         bool
	lastPolicyCheck time.Time
	configuring     bool
	automatic       bool
	vadEnabled      bool
	vadTurn         bool
	closed          bool
	pending         []*realtimeGeneration
	active          map[string]*realtimeGeneration
}

func NewRealtimeGenerationGate(ctx context.Context, userID int, target, client func([]byte) error, modelNames ...string) *RealtimeGenerationGate {
	name := ""
	if len(modelNames) > 0 {
		name = modelNames[0]
	}
	return &RealtimeGenerationGate{modelName: name, ctx: ctx, userID: userID, target: target, client: client, ready: make(chan struct{}), active: make(map[string]*realtimeGeneration)}
}

func (gate *RealtimeGenerationGate) hasDailyPolicy() (bool, error) {
	if gate.modelName == "" {
		return false, nil
	}
	ctx, err := model.AdmitModelDailyTokens(gate.ctx, gate.userID, gate.modelName)
	var exceeded *model.ModelDailyTokenLimitError
	if errors.As(err, &exceeded) {
		return true, nil
	}
	if err != nil {
		return false, err
	}
	admission := model.ModelDailyTokenAdmissionFromContext(ctx)
	return admission != nil && len(admission.Models) > 0, nil
}

func (gate *RealtimeGenerationGate) SendClientMessage(message []byte) error {
	select {
	case <-gate.ready:
	case <-gate.ctx.Done():
		return gate.ctx.Err()
	}
	gate.mu.Lock()
	defer gate.mu.Unlock()
	if gate.closed {
		return context.Canceled
	}
	var event map[string]any
	if err := common.Unmarshal(message, &event); err != nil {
		return err
	}
	if !gate.managed {
		// Sessions opened while the switch was off reconnect when it is enabled.
		// Throttle this check for audio frames; response.created always rechecks.
		if time.Since(gate.lastPolicyCheck) >= time.Second {
			daily, dailyErr := gate.hasDailyPolicy()
			if dailyErr != nil {
				return dailyErr
			}
			if daily {
				return fmt.Errorf("generation limits changed; reconnect the realtime session")
			}
			gate.lastPolicyCheck = time.Now()
		}
		return gate.target(message)
	}
	switch event["type"] {
	case "session.update":
		if session, ok := event["session"].(map[string]any); ok {
			owners := []map[string]any{session}
			if audio, ok := session["audio"].(map[string]any); ok {
				if input, ok := audio["input"].(map[string]any); ok {
					owners = append(owners, input)
				}
			}
			for _, owner := range owners {
				if vad, ok := owner["turn_detection"].(map[string]any); ok {
					if timeout, ok := vad["idle_timeout_ms"].(float64); ok && timeout > 0 {
						payload, _ := common.Marshal(map[string]any{"type": "error", "error": map[string]any{"type": "invalid_request_error", "code": "unsupported_realtime_idle_timeout", "event_id": event["event_id"], "message": "Realtime idle_timeout_ms is unavailable while model daily token budgets are enabled; omit it or set it to null", "status": 400}})
						return gate.client(payload)
					}
				}
			}
			gate.controlVAD(session)
			rewritten, err := common.Marshal(event)
			if err != nil {
				return err
			}
			return gate.target(rewritten)
		}
	case "response.create":
		return gate.create(event)
	}
	return gate.target(message)
}

// controlVAD accepts both the GA audio.input shape and the legacy top-level
// shape, preserving thresholds and unrelated session fields. The upstream
// retains interruption handling; only creation is moved behind admission.
func (gate *RealtimeGenerationGate) controlVAD(session map[string]any) bool {
	owner := session
	if audio, ok := session["audio"].(map[string]any); ok {
		if input, ok := audio["input"].(map[string]any); ok {
			owner = input
		}
	}
	value, present := owner["turn_detection"]
	if !present {
		return false
	}
	vad, ok := value.(map[string]any)
	if !ok {
		gate.automatic = false
		gate.vadEnabled = false
		return false
	}
	if !gate.vadEnabled {
		gate.automatic = true
	}
	gate.vadEnabled = true
	if configured, ok := vad["create_response"].(bool); ok {
		gate.automatic = configured
	}
	vad["create_response"] = false
	// Upstream idle timeouts generate independently of create_response. Disable
	// them rather than admitting work after it has already started.
	if timeout, present := vad["idle_timeout_ms"]; present && timeout != nil {
		vad["idle_timeout_ms"] = nil
	}
	return true
}

func (gate *RealtimeGenerationGate) create(event map[string]any) error {
	dailyContext := gate.ctx
	if gate.modelName != "" {
		var err error
		dailyContext, err = model.AdmitModelDailyTokens(gate.ctx, gate.userID, gate.modelName)
		if err != nil {
			code, message, status, retry := "model_daily_token_limit_unavailable", "Unable to verify model daily token usage; please retry", 503, int64(1)
			var exceeded *model.ModelDailyTokenLimitError
			if errors.As(err, &exceeded) {
				code, message, status, retry = "model_daily_token_limit_exceeded", exceeded.Error(), 429, max(1, exceeded.ResetsAt-time.Now().Unix())
			}
			payload, _ := common.Marshal(map[string]any{"type": "error", "error": map[string]any{"type": "rate_limit_error", "code": code, "message": message, "status": status, "retry_after": retry, "event_id": event["event_id"]}})
			return gate.client(payload)
		}
	}
	generation := &realtimeGeneration{dailyContext: dailyContext, eventID: "newapi-generation-" + common.GetRandomString(16), originalID: event["event_id"]}
	event["event_id"] = generation.eventID
	encoded, err := common.Marshal(event)
	if err != nil {
		return err
	}
	gate.pending = append(gate.pending, generation)
	if err := gate.target(encoded); err != nil {
		gate.pending = gate.pending[:len(gate.pending)-1]
		return err
	}
	return nil
}

// RecordUnfinishedDailyUsage persists the existing local token estimate when a
// provider omits response usage or a connection ends before its final event.
// All generations on a connection use the same model; use the oldest active
// admission day for an interrupted turn that straddles midnight.
func (gate *RealtimeGenerationGate) RecordUnfinishedDailyUsage(tokens int64) error {
	gate.mu.Lock()
	defer gate.mu.Unlock()
	if gate.modelName == "" || tokens <= 0 {
		return nil
	}
	var selected *realtimeGeneration
	for _, generation := range gate.active {
		if selected == nil || model.ModelDailyTokenAdmissionFromContext(generation.dailyContext).DayStart < model.ModelDailyTokenAdmissionFromContext(selected.dailyContext).DayStart {
			selected = generation
		}
	}
	if selected == nil && len(gate.pending) > 0 {
		selected = gate.pending[0]
	}
	if selected == nil {
		return nil
	}
	return model.RecordModelDailyTokens(selected.dailyContext, tokens)
}

// ObserveServerMessage runs before publishing an upstream event. A response
// that cannot be paired with an admitted create is fatal rather than a bypass.
func (gate *RealtimeGenerationGate) ObserveServerMessage(message []byte) ([]byte, error) {
	gate.mu.Lock()
	defer gate.mu.Unlock()
	if gate.closed {
		return nil, context.Canceled
	}
	var event map[string]any
	if err := common.Unmarshal(message, &event); err != nil {
		return nil, err
	}
	if gate.initialized && !gate.managed {
		if event["type"] == "response.created" {
			daily, dailyErr := gate.hasDailyPolicy()
			if dailyErr != nil {
				return nil, dailyErr
			}
			if daily {
				return nil, fmt.Errorf("generation limits changed; reconnect the realtime session")
			}
		}
		return message, nil
	}
	switch event["type"] {
	case "session.created":
		if gate.initialized {
			return nil, fmt.Errorf("duplicate realtime session")
		}
		gate.initialized = true
		daily, dailyErr := gate.hasDailyPolicy()
		if dailyErr != nil {
			return nil, dailyErr
		}
		gate.managed = daily
		if !gate.managed {
			gate.lastPolicyCheck = time.Now()
			gate.readyOnce.Do(func() { close(gate.ready) })
			return message, nil
		}
		session, _ := event["session"].(map[string]any)
		// Configure from the provider's actual defaults before forwarding any client
		// audio. This also supports providers with VAD disabled by default.
		cloned := map[string]any{}
		if _, present := session["turn_detection"]; present {
			cloned["turn_detection"] = session["turn_detection"]
		}
		if audio, ok := session["audio"].(map[string]any); ok {
			if input, ok := audio["input"].(map[string]any); ok {
				if vad, present := input["turn_detection"]; present {
					cloned = map[string]any{"type": "realtime", "audio": map[string]any{"input": map[string]any{"turn_detection": vad}}}
				}
			}
		}
		if gate.controlVAD(cloned) {
			gate.configuring = true
			payload, _ := common.Marshal(map[string]any{"type": "session.update", "event_id": "newapi-generation-vad", "session": cloned})
			if err := gate.target(payload); err != nil {
				return nil, err
			}
		} else {
			gate.readyOnce.Do(func() { close(gate.ready) })
		}
	case "session.updated":
		if gate.configuring {
			gate.configuring = false
			gate.readyOnce.Do(func() { close(gate.ready) })
		}
	case "input_audio_buffer.speech_stopped":
		gate.vadTurn = true
	case "input_audio_buffer.cleared":
		gate.vadTurn = false
	case "input_audio_buffer.committed":
		automatic := gate.automatic && gate.vadTurn
		gate.vadTurn = false
		if automatic {
			if err := gate.create(map[string]any{"type": "response.create"}); err != nil {
				return nil, err
			}
		}
	case "input_audio_buffer.timeout_triggered":
		return nil, fmt.Errorf("upstream generated an unadmitted realtime idle response")
	case "response.created":
		response, _ := event["response"].(map[string]any)
		id, _ := response["id"].(string)
		if id == "" || len(gate.pending) == 0 || gate.active[id] != nil {
			return nil, fmt.Errorf("upstream realtime generation has no admission")
		}
		gate.active[id] = gate.pending[0]
		gate.pending = gate.pending[1:]
	case "response.done":
		response, _ := event["response"].(map[string]any)
		id, _ := response["id"].(string)
		if generation := gate.active[id]; generation != nil {
			if usage, ok := response["usage"].(map[string]any); ok {
				raw, err := common.Marshal(usage)
				if err != nil {
					return nil, err
				}
				var counts struct {
					Input  int64 `json:"input_tokens"`
					Output int64 `json:"output_tokens"`
				}
				if err := common.Unmarshal(raw, &counts); err != nil {
					return nil, err
				}
				if err := model.RecordModelDailyTokens(generation.dailyContext, model.AddModelDailyTokens(counts.Input, counts.Output)); err != nil {
					return nil, err
				}
			}
			delete(gate.active, id)
		}
	case "error":
		if gate.configuring {
			return nil, fmt.Errorf("upstream rejected realtime generation admission setup")
		}
		detail, _ := event["error"].(map[string]any)
		eventID, _ := detail["event_id"].(string)
		for index, generation := range gate.pending {
			if eventID != generation.eventID {
				continue
			}
			gate.pending = append(gate.pending[:index], gate.pending[index+1:]...)
			detail["event_id"] = generation.originalID
			return common.Marshal(event)
		}
		// An uncorrelated error cannot safely prove a pending create has stopped.
		if len(gate.pending) > 0 && eventID == "" {
			return nil, fmt.Errorf("uncorrelated realtime creation error")
		}
	}
	return message, nil
}

func (gate *RealtimeGenerationGate) Close() {
	gate.mu.Lock()
	defer gate.mu.Unlock()
	gate.closed = true
	gate.readyOnce.Do(func() { close(gate.ready) })
	gate.pending = nil
	clear(gate.active)
}
