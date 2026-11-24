package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	kitdto "github.com/QuantumNous/new-api/relaykit/dto"
)

const (
	// channelPoolStatusTimeout bounds the pool status read so admission never
	// waits on a slow endpoint.
	channelPoolStatusTimeout = 3 * time.Second
	// channelPoolDefaultGenerationsPerAccount is how many live generations one
	// pooled upstream account serves unless the channel overrides it.
	channelPoolDefaultGenerationsPerAccount = 2
	channelPoolStatusMaxBytes               = 64 << 10
)

// channelPoolStatusTTL keeps admission from reading the pool on every attempt
// while still following accounts that come back or go away. It is a variable so
// tests can force a refresh.
var channelPoolStatusTTL = 30 * time.Second

type channelPoolCapacity struct {
	ready     int
	fetchedAt time.Time
}

var (
	channelPoolCapacityMu    sync.Mutex
	channelPoolCapacityCache = map[string]channelPoolCapacity{}
)

// ChannelPoolGenerationLimit resolves the channel-wide generation cap: an
// explicit ConcurrencyTotalLimit wins, otherwise it comes from the channel's
// pool status endpoint as accounts_ready × per-account generations. Zero means
// the channel has no channel-wide cap. The raw account count is cached briefly
// by status URL because admission runs on every attempt, and a failed read keeps
// the last good value so a flaky status endpoint cannot silently remove a live
// cap. The per-account factor stays out of the cache so channels sharing one
// pool can weight it differently.
func ChannelPoolGenerationLimit(ctx context.Context, setting kitdto.ChannelSettings) int {
	if setting.ConcurrencyTotalLimit > 0 {
		// A fixed cap describes capacity the pool status cannot express, so it
		// never reads the endpoint and never inherits a stale pool reading.
		return min(setting.ConcurrencyTotalLimit, kitdto.MaxChannelConcurrency)
	}
	url := strings.TrimSpace(setting.ConcurrencyTotalUrl)
	if url == "" {
		return 0
	}
	perAccount := setting.ConcurrencyTotalPerAccount
	if perAccount <= 0 {
		perAccount = channelPoolDefaultGenerationsPerAccount
	}
	now := time.Now()
	channelPoolCapacityMu.Lock()
	cached, found := channelPoolCapacityCache[url]
	channelPoolCapacityMu.Unlock()
	cachedReady := 0
	if found {
		cachedReady = cached.ready
	}
	if found && now.Sub(cached.fetchedAt) < channelPoolStatusTTL {
		return min(cached.ready*perAccount, kitdto.MaxChannelConcurrency)
	}
	ready, err := readChannelPoolReadyAccounts(ctx, url)
	if err == nil && ready == 0 {
		// A pool that reports no ready accounts is fully busy or down. Keeping
		// the last known constraint beats both collapse to zero (the channel
		// would answer 429 forever) and collapse to unlimited.
		common.SysLog(fmt.Sprintf("channel pool reports no ready accounts, keeping the previous reading: url=%s previous=%d", url, cachedReady))
		err = fmt.Errorf("accounts_ready is 0")
	}
	if err != nil {
		common.SysError(fmt.Sprintf("channel pool capacity read failed: url=%s err=%s", url, err))
		// Negative caching: an unreachable or empty endpoint must not turn
		// every admission into a synchronous timeout, and the last good
		// reading keeps covering the channel until the endpoint recovers.
		channelPoolCapacityMu.Lock()
		channelPoolCapacityCache[url] = channelPoolCapacity{ready: cachedReady, fetchedAt: now}
		channelPoolCapacityMu.Unlock()
		return min(cachedReady*perAccount, kitdto.MaxChannelConcurrency)
	}
	channelPoolCapacityMu.Lock()
	channelPoolCapacityCache[url] = channelPoolCapacity{ready: ready, fetchedAt: now}
	channelPoolCapacityMu.Unlock()
	return min(ready*perAccount, kitdto.MaxChannelConcurrency)
}

func readChannelPoolReadyAccounts(ctx context.Context, url string) (int, error) {
	ctx, cancel := context.WithTimeout(ctx, channelPoolStatusTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("status %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, channelPoolStatusMaxBytes))
	if err != nil {
		return 0, err
	}
	var status struct {
		AccountsReady *int `json:"accounts_ready"`
	}
	if err := common.Unmarshal(body, &status); err != nil {
		return 0, err
	}
	if status.AccountsReady == nil || *status.AccountsReady < 0 {
		return 0, fmt.Errorf("accounts_ready missing")
	}
	return *status.AccountsReady, nil
}
