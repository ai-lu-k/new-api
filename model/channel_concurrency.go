package model

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
)

const channelGenerationLeaseTTL = 2 * time.Minute
const channelGenerationHeartbeatInterval = 20 * time.Second

// channelGenerationAdmissionAttempts bounds how often one admission replays a
// transaction the database rolled back for a lock wait or deadlock. A rolled
// back attempt inserted nothing, so a replay observes the same ledger and cannot
// count one generation twice.
const channelGenerationAdmissionAttempts = 2

// channelGenerationCleanupInterval bounds how often one process sweeps one
// channel's expired slots. Expired rows never change an admission count, so this
// is table hygiene rather than a capacity rule.
const channelGenerationCleanupInterval = time.Minute

// ErrChannelGenerationConcurrency is the sentinel matched with errors.Is.
// Rejections carry a *ChannelGenerationConcurrencyError with the observed
// numbers.
var ErrChannelGenerationConcurrency = errors.New("channel generation concurrency limit reached")
var ErrChannelGenerationLeaseLost = errors.New("channel generation concurrency lease lost")

// ChannelGenerationConcurrencyError reports one user's usage against the
// channel's per-user limit at rejection. Both numbers come from the same
// admission read, so a limit lowered below current usage still reports the
// truth: InUse may exceed Limit. The message never names a channel, a key or
// another request's identity.
type ChannelGenerationConcurrencyError struct {
	ChannelID int
	UserId    int
	InUse     int
	Limit     int
	// ChannelTotal marks a rejection by the channel-wide pool cap instead of
	// the caller's own per-user limit.
	ChannelTotal bool
}

func (rejection *ChannelGenerationConcurrencyError) Error() string {
	if rejection.ChannelTotal {
		return fmt.Sprintf(
			"channel generation capacity reached: %d of %d generations in use on the channel; retry after a running generation finishes",
			rejection.InUse, rejection.Limit,
		)
	}
	return fmt.Sprintf(
		"channel generation concurrency limit reached: %d of %d generations in use for this user; retry after a running generation finishes",
		rejection.InUse, rejection.Limit,
	)
}

func (rejection *ChannelGenerationConcurrencyError) Is(target error) bool {
	return target == ErrChannelGenerationConcurrency
}

type channelGenerationLeaseContextKey struct{}

// ChannelGenerationSlot covers live requests only. Durable non-terminal Task
// and Midjourney rows are counted directly, so process restarts cannot free
// jobs. The primary database is authoritative even when Redis is unavailable.
type ChannelGenerationSlot struct {
	Key       string `gorm:"type:varchar(64);primaryKey"`
	ChannelID int    `gorm:"index"`
	UserId    int    `gorm:"index"`
	ExpiresAt int64  `gorm:"index"`
}

type ChannelGenerationLease struct {
	mu           sync.Mutex
	slot         ChannelGenerationSlot
	db           *gorm.DB
	cancel       context.CancelFunc
	lost         context.Context
	lostCancel   context.CancelFunc
	stop         chan struct{}
	stopped      chan struct{}
	stopOnce     sync.Once
	transferred  bool
	released     bool
	ttl          time.Duration
	acceptedTask bool
	admittedAt   time.Time
}

// channelGenerationSlotProbeThreshold keeps the slot log quiet for ordinary
// requests while still recording every generation that could explain a
// rejection.
const channelGenerationSlotProbeThreshold = time.Minute

func ChannelGenerationLeaseFromContext(ctx context.Context) *ChannelGenerationLease {
	lease, _ := ctx.Value(channelGenerationLeaseContextKey{}).(*ChannelGenerationLease)
	return lease
}

// lockChannelGeneration serializes admission and the live-to-durable handoff
// for one channel. SQLite needs a write before any read to avoid a
// deferred-transaction upgrade race. Other dialects use the shared row-lock
// helper.
func lockChannelGeneration(tx *gorm.DB, channelID int) error {
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		if err := tx.Model(&Channel{}).Where("id = ?", channelID).UpdateColumn("id", gorm.Expr("id")).Error; err != nil {
			return err
		}
	}
	var channel Channel
	return lockForUpdate(tx).Select("id").First(&channel, channelID).Error
}

// generationUsage is one admission read: the live leases, non-terminal
// asynchronous tasks and accepted Midjourney jobs a scope currently holds.
// Repeat references to one Midjourney job count once.
type generationUsage struct {
	Live       int64
	Tasks      int64
	Midjourney int64
}

func (usage generationUsage) total() int64 {
	return usage.Live + usage.Tasks + usage.Midjourney
}

// countGenerations counts one user's units on the channel, or the whole
// channel's units when userID is 0.
func countGenerations(tx *gorm.DB, channelID, userID int, now int64) (usage generationUsage, err error) {
	slots := tx.Model(&ChannelGenerationSlot{}).Where("channel_id = ? AND expires_at > ?", channelID, now)
	tasks := tx.Model(&Task{}).Where("channel_id = ? AND (status IS NULL OR status NOT IN ?)", channelID, []TaskStatus{TaskStatusSuccess, TaskStatusFailure})
	mjJobs := tx.Model(&Midjourney{}).Select("mj_id").Where("channel_id = ? AND code IN ? AND (progress IS NULL OR progress <> ?) AND (status IS NULL OR status NOT IN ?) AND mj_id <> ?", channelID, []int{1, 21, 22}, "100%", []string{"SUCCESS", "FAILURE"}, "").Group("mj_id")
	if userID > 0 {
		slots = slots.Where("user_id = ?", userID)
		tasks = tasks.Where("user_id = ?", userID)
		mjJobs = mjJobs.Where("user_id = ?", userID)
	}
	if err = slots.Count(&usage.Live).Error; err != nil {
		return
	}
	if err = tasks.Count(&usage.Tasks).Error; err != nil {
		return
	}
	if err = tx.Table("(?) AS generation_jobs", mjJobs).Count(&usage.Midjourney).Error; err != nil {
		return
	}
	return usage, nil
}

// StartChannelGeneration admits one generation for this user on the channel,
// returning a context cancelled if its renewable lease is lost. Callers MUST
// use that context for upstream work and defer Release, including on panic. A
// nil lease means the resolved limits leave the channel unlimited. Both limits
// are the ones routing resolved for this attempt, so an edit applies on the same
// channel cache refresh as the routing decision itself.
//
// userLimit counts only this user's generations; totalLimit, when positive,
// additionally caps every user's generations on the channel together, so a pool
// of shared upstream accounts cannot be oversubscribed by many callers.
func StartChannelGeneration(ctx context.Context, channelID int, userID int, userLimit int, totalLimit int) (context.Context, *ChannelGenerationLease, error) {
	if channelID <= 0 || userLimit <= 0 && totalLimit <= 0 {
		return ctx, nil, nil
	}
	if userLimit > dto.MaxChannelConcurrency || totalLimit > dto.MaxChannelConcurrency {
		return ctx, nil, fmt.Errorf("invalid concurrency limit %d/%d for channel %d", userLimit, totalLimit, channelID)
	}
	if userID <= 0 {
		// Anonymous admissions would share one slot bucket with every other
		// caller, so fail closed instead of silently pooling them.
		return ctx, nil, fmt.Errorf("channel generation admission requires a user on channel %d", channelID)
	}
	admissionCtx, cancelAdmission := context.WithTimeout(ctx, 5*time.Second)
	defer cancelAdmission()
	slot := ChannelGenerationSlot{Key: common.GetRandomString(32), ChannelID: channelID, UserId: userID}
	var err error
	for attempt := range channelGenerationAdmissionAttempts {
		err = admitChannelGeneration(admissionCtx, &slot, channelID, userID, userLimit, totalLimit)
		if err == nil {
			break
		}
		if !isTransientLockError(err) || attempt == channelGenerationAdmissionAttempts-1 {
			break
		}
		common.SysLog(fmt.Sprintf(
			"channel generation admission retried after a transient lock error: channel=%d user=%d attempt=%d err=%s",
			channelID, userID, attempt+1, err,
		))
	}
	if err != nil {
		return ctx, nil, err
	}
	cleanupExpiredChannelGenerationSlots(channelID)
	child, cancel := context.WithCancel(ctx)
	lost, lostCancel := context.WithCancel(context.Background())
	lease := &ChannelGenerationLease{lost: lost, lostCancel: lostCancel, ttl: channelGenerationLeaseTTL, slot: slot, db: DB, cancel: cancel, stop: make(chan struct{}), stopped: make(chan struct{}), admittedAt: time.Now()}
	child = context.WithValue(child, channelGenerationLeaseContextKey{}, lease)
	go lease.maintain()
	return child, lease, nil
}

// admitChannelGeneration runs one admission attempt inside the transaction that
// serializes this channel's ledger. Expired slots are swept outside it: the
// range DELETE took a gap lock on the channel_id index, and a concurrent INSERT
// then waited on that gap while its own insert-intention lock made the first
// transaction wait, which is the deadlock MySQL reported for requests that never
// reached an upstream. Every count below requires expires_at > now, so skipped
// sweeps cannot inflate or deflate a limit check.
func admitChannelGeneration(ctx context.Context, slot *ChannelGenerationSlot, channelID, userID, userLimit, totalLimit int) error {
	return DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockChannelGeneration(tx, channelID); err != nil {
			return err
		}
		now, err := databaseClockMilliseconds(tx)
		if err != nil {
			return err
		}
		mine, err := countGenerations(tx, channelID, userID, now)
		if err != nil {
			return err
		}
		if userLimit > 0 && mine.total() >= int64(userLimit) {
			// One line per rejection is the probe for "the limit fired while
			// nothing was running": it separates the three sources.
			common.SysLog(fmt.Sprintf(
				"channel generation concurrency rejected: channel=%d user=%d scope=user in_use=%d live=%d tasks=%d midjourney=%d limit=%d",
				channelID, userID, mine.total(), mine.Live, mine.Tasks, mine.Midjourney, userLimit,
			))
			return &ChannelGenerationConcurrencyError{ChannelID: channelID, UserId: userID, InUse: int(mine.total()), Limit: userLimit}
		}
		if totalLimit > 0 {
			channelWide, countErr := countGenerations(tx, channelID, 0, now)
			if countErr != nil {
				return countErr
			}
			if channelWide.total() >= int64(totalLimit) {
				common.SysLog(fmt.Sprintf(
					"channel generation concurrency rejected: channel=%d user=%d scope=channel in_use=%d live=%d tasks=%d midjourney=%d limit=%d",
					channelID, userID, channelWide.total(), channelWide.Live, channelWide.Tasks, channelWide.Midjourney, totalLimit,
				))
				return &ChannelGenerationConcurrencyError{ChannelID: channelID, UserId: userID, InUse: int(channelWide.total()), Limit: totalLimit, ChannelTotal: true}
			}
		}
		slot.ExpiresAt = now + channelGenerationLeaseTTL.Milliseconds()
		return tx.Create(slot).Error
	})
}

// channelGenerationCleanupMarks is per process. Two instances may sweep the same
// channel at once; the DELETE is idempotent, so the mark only keeps the index
// scan off every admission.
var channelGenerationCleanupMarks sync.Map

// cleanupExpiredChannelGenerationSlots sweeps one channel's expired slots in the
// background, at most once per interval. The sweep no longer shares a
// transaction with an admission, so it cannot hold a gap open while an INSERT
// waits for it, and its deadline comes from the database clock so a skewed
// gateway clock cannot delete a lease the primary still considers valid. A
// single statement can still lose a lock race and roll back on its own; that
// leaves expired rows for the next sweep, and every count requires
// expires_at > now, so a skipped sweep never changes a limit check.
func cleanupExpiredChannelGenerationSlots(channelID int) {
	now := time.Now().UnixMilli()
	if last, ok := channelGenerationCleanupMarks.Load(channelID); ok && now-last.(int64) < channelGenerationCleanupInterval.Milliseconds() {
		return
	}
	channelGenerationCleanupMarks.Store(channelID, now)
	db := DB
	// Keep the expiry clock in the DELETE. A standalone clock read could
	// reserve the same prepared statement as admission while still waiting
	// for the only connection, which admission already holds.
	expiryCondition := "channel_id = ? AND expires_at <= " + databaseClockMillisecondsExpression()
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		var err error
		for range channelGenerationAdmissionAttempts {
			err = db.WithContext(ctx).Where(expiryCondition, channelID).Delete(&ChannelGenerationSlot{}).Error
			if err == nil {
				return
			}
			if !isTransientLockError(err) {
				break
			}
		}
		// Hygiene only: a lost sweep waits for the next interval instead of
		// surfacing an error the operator cannot act on.
		common.SysLog(fmt.Sprintf("expired channel generation slots stayed for the next sweep: channel=%d err=%s", channelID, err))
	}()
}

// isTransientLockError reports a lock wait or deadlock that the database rolled
// back, leaving no partial write behind.
func isTransientLockError(err error) bool {
	var mysqlErr *mysql.MySQLError
	if errors.As(err, &mysqlErr) {
		return mysqlErr.Number == 1205 || mysqlErr.Number == 1213
	}
	return false
}

func (lease *ChannelGenerationLease) maintain() {
	defer close(lease.stopped)
	ticker := time.NewTicker(channelGenerationHeartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-lease.stop:
			return
		case <-ticker.C:
		}
		// Keep reserving while a cancelled handler unwinds its upstream work.
		if err := lease.Renew(); err != nil {
			lease.cancel()
			return
		}
	}
}

// Renew never resurrects an expired or transferred lease.
func (lease *ChannelGenerationLease) Renew() (err error) {
	if lease != nil {
		defer func() {
			if err != nil {
				lease.lostCancel()
				lease.cancel()
			}
		}()
	}
	if lease == nil {
		return nil
	}
	lease.mu.Lock()
	defer lease.mu.Unlock()
	if lease.transferred || lease.released {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	db := lease.db.WithContext(ctx)
	now, err := databaseClockMilliseconds(db)
	if err != nil {
		return err
	}
	var result *gorm.DB
	for attempt := range channelGenerationAdmissionAttempts {
		result = db.Model(&ChannelGenerationSlot{}).Where(map[string]any{"key": lease.slot.Key}).Where("expires_at > ?", now).Update("expires_at", now+lease.ttl.Milliseconds())
		if result.Error == nil {
			break
		}
		// A lock wait or deadlock rolled the renewal back; retrying keeps the
		// lease instead of cancelling the upstream work that still holds it.
		err = result.Error
		if !isTransientLockError(err) || attempt == channelGenerationAdmissionAttempts-1 {
			return err
		}
	}
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		err = ErrChannelGenerationLeaseLost
		return err
	}
	return nil
}

func (lease *ChannelGenerationLease) Release() {
	if lease == nil {
		return
	}
	lease.stopOnce.Do(func() { close(lease.stop) })
	<-lease.stopped
	lease.cancel()
	lease.lostCancel()
	lease.mu.Lock()
	defer lease.mu.Unlock()
	if lease.released || lease.transferred {
		return
	}
	if lease.acceptedTask {
		// The provider accepted a job but persistence failed. Keep its conservative
		// submission deadline instead of freeing capacity while that job still runs.
		lease.released = true
		common.SysError(fmt.Sprintf("unpersisted asynchronous generation retains a concurrency slot on channel %d for user %d until its task deadline", lease.slot.ChannelID, lease.slot.UserId))
		return
	}
	lease.released = true
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	db := lease.db.WithContext(ctx)
	var err error
	for range channelGenerationAdmissionAttempts {
		err = db.Where(map[string]any{"key": lease.slot.Key}).Delete(&ChannelGenerationSlot{}).Error
		if err == nil || !isTransientLockError(err) {
			break
		}
	}
	if err != nil {
		common.SysError(fmt.Sprintf("release channel generation slot: %s", err))
	}
	// A generation that held capacity for a long time is the other half of a
	// later rejection, so record it with the elapsed time.
	if held := time.Since(lease.admittedAt); held >= channelGenerationSlotProbeThreshold {
		common.SysLog(fmt.Sprintf("channel generation concurrency slot released: channel=%d user=%d held_seconds=%d", lease.slot.ChannelID, lease.slot.UserId, int(held.Seconds())))
	}
}

// persistTask atomically replaces the live slot with the task row. The new row
// itself holds capacity until terminal status, including after client
// disconnect or gateway restart. No poller heartbeat or cache reconstruction
// is needed. The durable row must belong to the same user and channel as the
// lease, otherwise the per-user accounting would credit the wrong account.
func (lease *ChannelGenerationLease) persistTask(ctx context.Context, channelID int, userID int, nonTerminal bool, create func(*gorm.DB) error) error {
	lease.mu.Lock()
	defer lease.mu.Unlock()
	if lease.transferred || lease.released || channelID != lease.slot.ChannelID || userID != lease.slot.UserId {
		return ErrChannelGenerationLeaseLost
	}
	lease.acceptedTask = nonTerminal
	err := lease.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockChannelGeneration(tx, channelID); err != nil {
			return err
		}
		now, err := databaseClockMilliseconds(tx)
		if err != nil {
			return err
		}
		var slot ChannelGenerationSlot
		if err := tx.Where(map[string]any{"key": lease.slot.Key}).Where("expires_at > ?", now).First(&slot).Error; err != nil {
			return ErrChannelGenerationLeaseLost
		}
		if err := create(tx); err != nil {
			return err
		}
		return tx.Where(map[string]any{"key": lease.slot.Key}).Delete(&ChannelGenerationSlot{}).Error
	})
	if err == nil {
		lease.transferred = true
		lease.stopOnce.Do(func() { close(lease.stop) })
	}
	return err
}

// WithChannelGenerationLeaseCancellation preserves loss-of-lease cancellation
// when a durable submission intentionally detaches from the client's
// cancellation.
func WithChannelGenerationLeaseCancellation(ctx context.Context) (context.Context, context.CancelFunc) {
	child, cancel := context.WithCancel(ctx)
	lease := ChannelGenerationLeaseFromContext(ctx)
	if lease == nil {
		return child, cancel
	}
	stop := context.AfterFunc(lease.lost, cancel)
	return child, func() { stop(); cancel() }
}

// ProtectTaskSubmission extends the crash-recovery deadline before a provider
// can accept asynchronous work. A crash between acceptance and persistence must
// not free potentially long-running capacity after the ordinary HTTP lease TTL.
// A normal rejected submission still releases its slot immediately.
func (lease *ChannelGenerationLease) ProtectTaskSubmission() error {
	if lease == nil {
		return nil
	}
	lease.mu.Lock()
	minutes := constant.TaskTimeoutMinutes
	if minutes <= 0 {
		minutes = 1440
	}
	lease.ttl = time.Duration(min(minutes, 365*24*60)) * time.Minute
	lease.mu.Unlock()
	return lease.Renew()
}

// MarkTaskAccepted preserves an accepted asynchronous job's crash reservation
// if a later billing adjustment or persistence step prevents its durable row.
func (lease *ChannelGenerationLease) MarkTaskAccepted() {
	if lease == nil {
		return
	}
	lease.mu.Lock()
	defer lease.mu.Unlock()
	lease.acceptedTask = true
}

// Use the primary database clock for admission deadlines so a skewed gateway
// clock cannot expire another instance's live request. Each expression is
// supported by the project's SQLite, MySQL 5.7 and PostgreSQL 9.6 baselines.
func databaseClockMilliseconds(tx *gorm.DB) (int64, error) {
	var now int64
	err := tx.Raw("SELECT " + databaseClockMillisecondsExpression()).Scan(&now).Error
	return now, err
}

func databaseClockMillisecondsExpression() string {
	switch common.MainDatabaseType() {
	case common.DatabaseTypeMySQL:
		return "CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS SIGNED)"
	case common.DatabaseTypePostgreSQL:
		return "CAST(EXTRACT(EPOCH FROM clock_timestamp()) * 1000 AS BIGINT)"
	default:
		return "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)"
	}
}
