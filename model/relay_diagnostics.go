package model

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
)

const DiagnosticQueueSize = 128
const DiagnosticWritesPerMinute = 120
const DiagnosticMaxBytes = 32768
const DiagnosticStoredRows = 10000

type diagnosticItem struct {
	log  *Log
	done chan struct{}
}

var diagnosticWriter = struct {
	once    sync.Once
	queue   chan diagnosticItem
	dropped atomic.Uint64
	failed  atomic.Uint64
}{queue: make(chan diagnosticItem, DiagnosticQueueSize)}

func DiagnosticWriteStats() map[string]uint64 {
	return map[string]uint64{"dropped": diagnosticWriter.dropped.Load(), "failed": diagnosticWriter.failed.Load(), "queued": uint64(len(diagnosticWriter.queue))}
}

// EnqueueRelayDiagnostic has fixed memory and write-rate budgets. It deliberately
// uses the existing log table and cleanup lifecycle; no per-event writes occur.
func EnqueueRelayDiagnostic(log *Log) bool {
	if log == nil || len(log.Other) > DiagnosticMaxBytes {
		diagnosticWriter.dropped.Add(1)
		return false
	}
	diagnosticWriter.once.Do(func() { go writeRelayDiagnostics() })
	select {
	case diagnosticWriter.queue <- diagnosticItem{log: log}:
		return true
	default:
		diagnosticWriter.dropped.Add(1)
		return false
	}
}

func writeRelayDiagnostics() {
	minute := time.Now()
	count := 0
	var stored int64
	initialized := false
	var currentDB any
	for item := range diagnosticWriter.queue {
		if item.done != nil {
			close(item.done)
			continue
		}
		log := item.log
		if currentDB != LOG_DB {
			currentDB = LOG_DB
			initialized = false
			stored = 0
		}
		if time.Since(minute) >= time.Minute {
			minute = time.Now()
			count = 0
		}
		if count >= DiagnosticWritesPerMinute {
			diagnosticWriter.dropped.Add(1)
			continue
		}
		count++
		// Bound a failed/stalled database write; do not fan out goroutines on failure.
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		if !initialized {
			if err := LOG_DB.WithContext(ctx).Model(&Log{}).Where("content = ?", "Relay timeout diagnostics").Count(&stored).Error; err != nil {
				cancel()
				diagnosticWriter.failed.Add(1)
				continue
			}
			initialized = true
		}
		if stored >= DiagnosticStoredRows {
			cancel()
			diagnosticWriter.dropped.Add(1)
			continue
		}
		if common.RedisEnabled && common.RDB != nil {
			admitted, err := common.RDB.Eval(ctx, `
local count=tonumber(redis.call('GET',KEYS[1]) or '0'); count=math.max(count,tonumber(ARGV[1]))
if count>=10000 then return 0 end
redis.call('SET',KEYS[1],count+1);return 1`, []string{"new-api:relay-diagnostics:storage:v1"}, stored).Int()
			if err != nil || admitted != 1 {
				cancel()
				diagnosticWriter.dropped.Add(1)
				continue
			}
		}
		stored++
		ensureLogRequestId(log)
		err := LOG_DB.WithContext(ctx).Create(log).Error
		cancel()
		if err != nil {
			diagnosticWriter.failed.Add(1)
			// Driver messages may contain SQL values; keep the operational warning safe.
			logger.LogWarn(context.Background(), "relay diagnostic log write failed")
		}
	}
}

// At most 10,000 standalone diagnostic rows are admitted. With Redis this
// budget survives restart and is shared; unused/failing reservations are not
// recycled. The existing log cleanup policy still controls normal log retention.

// WaitRelayDiagnosticWrites drains queued work for graceful shutdown and test
// fixtures before their database connections are released.
func WaitRelayDiagnosticWrites(ctx context.Context) error {
	diagnosticWriter.once.Do(func() { go writeRelayDiagnostics() })
	done := make(chan struct{})
	select {
	case diagnosticWriter.queue <- diagnosticItem{done: done}:
	case <-ctx.Done():
		return ctx.Err()
	}
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
