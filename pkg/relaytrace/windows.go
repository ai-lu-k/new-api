package relaytrace

import (
	"context"
	"crypto/sha256"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const MaxScopes = 128
const MaxConcurrent = 32
const MaxEvents = 32
const MaxAttempts = 8
const MaxDetailedPerWindow = 256
const MaxStoredTraces = 10000

type Scope struct {
	Channel int    `json:"channel_id"`
	Model   string `json:"model"`
	Path    string `json:"path"`
}

func (s Scope) Key() string {
	return fmt.Sprintf("%x", sha256.Sum256([]byte(fmt.Sprintf("%d\x00%s\x00%s", s.Channel, s.Model, s.Path))))
}

type Window struct {
	Scope    Scope  `json:"scope"`
	Until    int64  `json:"until"`
	Reason   string `json:"reason"`
	Detailed int    `json:"detailed"`
	Updated  int64  `json:"updated"`
	Disabled bool   `json:"disabled,omitempty"`
}

type Registry struct {
	mu            sync.Mutex
	windows       map[string]Window
	totalDetailed int
	active        int
	dropped       atomic.Uint64
	queue         chan Window
	once          sync.Once
	shared        bool
	credits       map[string]int
}

var Windows = NewRegistry()

func NewRegistry() *Registry {
	return &Registry{windows: make(map[string]Window), credits: make(map[string]int), queue: make(chan Window, 64)}
}

func (r *Registry) Start() { r.once.Do(func() { go r.run() }) }

// Set renews a window without replenishing its event/storage budget. Explicit
// suppression also expires, so automatic diagnostics cannot stay disabled forever.
func (r *Registry) Set(scope Scope, reason string, disabled bool, now time.Time) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.expire(now)
	key := scope.Key()
	current, exists := r.windows[key]
	if !exists && len(r.windows) >= MaxScopes {
		r.dropped.Add(1)
		return false
	}
	if current.Disabled && reason == "timeout" {
		return true
	}
	current.Scope = scope
	current.Reason = reason
	current.Disabled = disabled
	current.Updated = now.UnixMilli()
	current.Until = now.Add(Seconds(configuration.WindowSeconds)).UnixMilli()
	r.windows[key] = current
	select {
	case r.queue <- current:
	default:
		r.dropped.Add(1)
	}
	return true
}

func (r *Registry) expire(now time.Time) {
	for key, window := range r.windows {
		if window.Until <= now.UnixMilli() {
			delete(r.windows, key)
			delete(r.credits, key)
		}
	}
}

func (r *Registry) Admit(scope Scope, requestID string, now time.Time) (bool, string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.expire(now)
	w, exists := r.windows[scope.Key()]
	if !exists || w.Disabled {
		return false, "inactive"
	}
	shared := common.RedisEnabled && common.RDB != nil
	if r.active >= MaxConcurrent || (!shared && (w.Detailed >= MaxDetailedPerWindow || r.totalDetailed >= MaxStoredTraces)) {
		return false, "budget_exhausted"
	}
	// Hash sampling is stable across retries and does not retain request IDs.
	hash := sha256.Sum256([]byte(requestID))
	if int(hash[0])*100/256 >= configuration.SamplePercent {
		return false, "sampled_out"
	}
	if common.RedisEnabled && common.RDB != nil {
		if r.credits[scope.Key()] <= 0 {
			return false, "shared_budget_pending"
		}
		r.credits[scope.Key()]--
	} else {
		w.Detailed++
		r.totalDetailed++
	}
	r.active++
	r.windows[scope.Key()] = w
	return true, "active"
}

func (r *Registry) Release() { r.mu.Lock(); r.active--; r.mu.Unlock() }

func (r *Registry) Status(now time.Time) ([]Window, bool, uint64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.expire(now)
	windows := make([]Window, 0, len(r.windows))
	for _, w := range r.windows {
		windows = append(windows, w)
	}
	return windows, r.shared, r.dropped.Load()
}

// Redis synchronization is confined to this bounded worker. Relay requests never
// wait for Redis. Each Redis DB is one environment; staging must use its own DB.
// A single capped hash holds only safe scope metadata, with expired fields pruned.
func (r *Registry) run() {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case w := <-r.queue:
			r.publish(w)

		case now := <-ticker.C:
			r.sync(now)
		}
	}
}

// publish atomically renews an anomaly window, preserving suppression and leases.
func (r *Registry) publish(w Window) {
	if !common.RedisEnabled || common.RDB == nil {
		return
	}
	data, _ := common.Marshal(w)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	admitted, err := common.RDB.Eval(ctx, `
local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000)
local all=redis.call('HGETALL',KEYS[1])
for i=1,#all,2 do local v=cjson.decode(all[i+1]); if v['until']<=now then redis.call('HDEL',KEYS[1],all[i]) end end
local old=redis.call('HGET',KEYS[1],ARGV[1]); local incoming=cjson.decode(ARGV[2])
if old then
 local v=cjson.decode(old)
 if v.disabled and incoming.reason=='timeout' then return 1 end
 if v.updated>incoming.updated then return 1 end
 incoming.detailed=math.max(v.detailed,incoming.detailed)
 if incoming.reason=='timeout' and v['until']>incoming['until'] then incoming['until']=v['until'] end
elseif redis.call('HLEN',KEYS[1])>=128 then return 0 end
redis.call('HSET',KEYS[1],ARGV[1],cjson.encode(incoming)); redis.call('EXPIRE',KEYS[1],7200); return 1`, []string{"new-api:relay-trace:v1"}, w.Scope.Key(), string(data)).Int()
	cancel()
	if err != nil || admitted == 0 {
		r.dropped.Add(1)
	}
}

func (r *Registry) sync(now time.Time) {
	if !common.RedisEnabled || common.RDB == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	rows, err := common.RDB.HGetAll(ctx, "new-api:relay-trace:v1").Result()
	r.mu.Lock()
	r.shared = err == nil
	r.mu.Unlock()
	if err != nil {
		return
	}
	for key, raw := range rows {
		var w Window
		if common.UnmarshalJsonStr(raw, &w) != nil || w.Until <= now.UnixMilli() {
			continue
		}
		r.mu.Lock()
		local, exists := r.windows[key]
		if (!exists && len(r.windows) >= MaxScopes) || (local.Updated > w.Updated && !(w.Disabled && local.Reason == "timeout")) {
			r.mu.Unlock()
			continue
		}
		r.windows[key] = w
		needsLease := !w.Disabled && r.credits[key] == 0 && w.Detailed < MaxDetailedPerWindow
		r.mu.Unlock()
		if !needsLease {
			continue
		}
		// Reserve batches before admitting requests. All instances together can
		// persist at most 256 detailed attempts per uninterrupted anomaly window.
		granted, leaseErr := common.RDB.Eval(ctx, `
local raw=redis.call('HGET',KEYS[1],ARGV[1]); if not raw then return 0 end
local w=cjson.decode(raw); local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000)
if w.disabled or w['until']<=now then return 0 end
local used=tonumber(redis.call('GET',KEYS[2]) or '0')
local n=math.min(16,256-w.detailed,10000-used); if n<=0 then return 0 end
redis.call('INCRBY',KEYS[2],n); w.detailed=w.detailed+n
redis.call('HSET',KEYS[1],ARGV[1],cjson.encode(w)); return n`, []string{"new-api:relay-trace:v1", "new-api:relay-trace:storage:v1"}, key).Int()
		if leaseErr == nil && granted > 0 {
			r.mu.Lock()
			r.credits[key] += granted
			r.mu.Unlock()
		}
	}
	r.mu.Lock()
	r.expire(now)
	r.mu.Unlock()
}
