package model

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/relayobs"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// RelayObservation lives in the primary database independently of consumption
// logs and their sampling/retention. Payload contains safe scalar facts only.
type RelayObservation struct {
	RequestID string `json:"request_id" gorm:"primaryKey;size:64"`
	StartedAt int64  `json:"started_at" gorm:"index:idx_relay_observation_started"`
	ModelKey  string `json:"-" gorm:"size:64;index:idx_relay_observation_model_time,priority:1"`
	ModelTime int64  `json:"-" gorm:"index:idx_relay_observation_model_time,priority:2"`
	Payload   string `json:"-" gorm:"type:text"`
}

func observationModelKey(name string) string {
	hash := sha256.Sum256([]byte(name))
	return hex.EncodeToString(hash[:])
}

func StoreRelayObservation(ctx context.Context, db *gorm.DB, request relayobs.Request) error {
	if request.RequestID == "" || len(request.RequestID) > 64 || request.StartedAtMS <= 0 {
		return errors.New("invalid relay observation identity")
	}
	var attempts relayobs.AttemptMetrics
	for _, attempt := range request.Attempts {
		attempts.Add(attempt)
	}
	request.ProcurementCosts, request.UnknownCostAttempts = attempts.Costs, attempts.UnknownCostAttempts
	request.CostComplete = !request.Truncated && attempts.UnknownCostAttempts == 0
	data, err := common.Marshal(request)
	if err != nil {
		return err
	}
	if len(data) > 65535 {
		return errors.New("relay observation exceeds storage budget")
	}
	row := RelayObservation{RequestID: request.RequestID, StartedAt: request.StartedAtMS / 1000,
		ModelTime: request.StartedAtMS / 1000, ModelKey: observationModelKey(request.Model), Payload: string(data)}
	// A retried metadata write must not turn one user request into two samples.
	return db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error
}

type RelayObservationQuery struct {
	Start     int64
	End       int64
	Model     string
	RequestID string
}

// ReadRelayObservations returns a bounded, explicitly marked scan. No dialect
// JSON operators or silently sampled totals are used.
func ReadRelayObservations(ctx context.Context, query RelayObservationQuery, limit int) ([]relayobs.Request, bool, error) {
	limit = min(max(1, limit), 10000)
	db := DB.WithContext(ctx).Model(&RelayObservation{})
	if query.RequestID != "" {
		db = db.Where("request_id = ?", query.RequestID)
	} else {
		db = db.Where("started_at >= ? AND started_at < ?", query.Start, query.End)
	}
	if query.Model != "" {
		db = db.Where("model_key = ?", observationModelKey(query.Model))
	}
	requests := make([]relayobs.Request, 0, min(limit, 100))
	var beforeTime int64
	beforeID := ""
	payloadBytes := 0
	for {
		batchLimit := min(100, limit+1-len(requests))
		batchQuery := db.Session(&gorm.Session{}).Order("started_at DESC, request_id DESC").Limit(batchLimit)
		if beforeID != "" {
			batchQuery = batchQuery.Where("started_at < ? OR (started_at = ? AND request_id < ?)", beforeTime, beforeTime, beforeID)
		}
		var rows []RelayObservation
		if err := batchQuery.Find(&rows).Error; err != nil {
			return nil, false, err
		}
		for _, row := range rows {
			if len(requests) == limit || payloadBytes+len(row.Payload) > 16*1024*1024 {
				return requests, true, nil
			}
			payloadBytes += len(row.Payload)
			var request relayobs.Request
			if err := common.UnmarshalJsonStr(row.Payload, &request); err != nil {
				return nil, false, errors.New("stored relay observation is unreadable")
			}
			requests = append(requests, request)
		}
		if len(rows) < batchLimit {
			return requests, false, nil
		}
		last := rows[len(rows)-1]
		beforeTime, beforeID = last.StartedAt, last.RequestID
	}
}

func DeleteRelayObservationsBefore(ctx context.Context, db *gorm.DB, cutoff int64) error {
	for {
		var ids []string
		if err := db.WithContext(ctx).Model(&RelayObservation{}).Where("started_at < ?", cutoff).
			Limit(1000).Pluck("request_id", &ids).Error; err != nil || len(ids) == 0 {
			return err
		}
		if err := db.WithContext(ctx).Where("request_id IN ?", ids).Delete(&RelayObservation{}).Error; err != nil {
			return err
		}
		if len(ids) < 1000 {
			return nil
		}
	}
}

type relayObservationWrite struct {
	db      *gorm.DB
	request relayobs.Request
	done    chan struct{}
}

var observationWriter = struct {
	once    sync.Once
	queue   chan relayObservationWrite
	dropped atomic.Uint64
	failed  atomic.Uint64
	written atomic.Uint64
}{queue: make(chan relayObservationWrite, 256)}

func RelayObservationWriteStats() map[string]uint64 {
	return map[string]uint64{"dropped": observationWriter.dropped.Load(), "failed": observationWriter.failed.Load(),
		"written": observationWriter.written.Load(), "queued": uint64(len(observationWriter.queue))}
}

func EnqueueRelayObservation(request relayobs.Request) bool {
	if DB == nil {
		observationWriter.failed.Add(1)
		return false
	}
	observationWriter.once.Do(func() { go writeRelayObservations() })
	select {
	case observationWriter.queue <- relayObservationWrite{db: DB, request: request}:
		return true
	default:
		observationWriter.dropped.Add(1)
		return false
	}
}

func writeRelayObservations() {
	lastCleanup := time.Time{}
	for item := range observationWriter.queue {
		if item.done != nil {
			close(item.done)
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		if err := StoreRelayObservation(ctx, item.db, item.request); err != nil {
			observationWriter.failed.Add(1)
		} else {
			observationWriter.written.Add(1)
		}
		if time.Since(lastCleanup) >= time.Hour {
			if DeleteRelayObservationsBefore(ctx, item.db, time.Now().Add(-7*24*time.Hour).Unix()) == nil {
				lastCleanup = time.Now()
			}
		}
		cancel()
	}
}

func WaitRelayObservationWrites(ctx context.Context) error {
	observationWriter.once.Do(func() { go writeRelayObservations() })
	done := make(chan struct{})
	select {
	case observationWriter.queue <- relayObservationWrite{done: done}:
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
