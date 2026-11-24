package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	kitdto "github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChannelPoolGenerationLimit(t *testing.T) {
	t.Run("ready accounts times the per-account factor", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(`{"ok":true,"accounts":13,"accounts_ready":3}`))
		}))
		t.Cleanup(server.Close)

		assert.Equal(t, 6, ChannelPoolGenerationLimit(context.Background(), kitdto.ChannelSettings{ConcurrencyTotalUrl: server.URL}),
			"the default is two generations per ready account")
		assert.Equal(t, 9, ChannelPoolGenerationLimit(context.Background(), kitdto.ChannelSettings{ConcurrencyTotalUrl: server.URL, ConcurrencyTotalPerAccount: 3}))
	})

	t.Run("a channel without a pool status URL has no channel-wide cap", func(t *testing.T) {
		assert.Zero(t, ChannelPoolGenerationLimit(context.Background(), kitdto.ChannelSettings{ConcurrencyLimit: 5}))
	})

	t.Run("an unreadable pool leaves the channel without a channel-wide cap", func(t *testing.T) {
		failing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))
		t.Cleanup(failing.Close)
		assert.Zero(t, ChannelPoolGenerationLimit(context.Background(), kitdto.ChannelSettings{ConcurrencyTotalUrl: failing.URL}))

		missing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(`{"ok":true,"accounts":13}`))
		}))
		t.Cleanup(missing.Close)
		require.Zero(t, ChannelPoolGenerationLimit(context.Background(), kitdto.ChannelSettings{ConcurrencyTotalUrl: missing.URL}),
			"a status page without accounts_ready must not read as zero capacity")
	})

	t.Run("a pool reporting zero ready accounts keeps the last known cap", func(t *testing.T) {
		originalTTL := channelPoolStatusTTL
		channelPoolStatusTTL = 0
		t.Cleanup(func() { channelPoolStatusTTL = originalTTL })

		var zeroReady bool
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if zeroReady {
				_, _ = w.Write([]byte(`{"accounts_ready":0}`))
				return
			}
			_, _ = w.Write([]byte(`{"accounts_ready":2}`))
		}))
		t.Cleanup(server.Close)
		setting := kitdto.ChannelSettings{ConcurrencyTotalUrl: server.URL}

		require.Equal(t, 4, ChannelPoolGenerationLimit(context.Background(), setting))
		zeroReady = true
		assert.Equal(t, 4, ChannelPoolGenerationLimit(context.Background(), setting),
			"an empty pool keeps the last known cap instead of dropping it")
	})

	t.Run("an endpoint that is down from the start is remembered briefly", func(t *testing.T) {
		var reads int
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			reads++
			w.WriteHeader(http.StatusInternalServerError)
		}))
		t.Cleanup(server.Close)
		setting := kitdto.ChannelSettings{ConcurrencyTotalUrl: server.URL}

		require.Zero(t, ChannelPoolGenerationLimit(context.Background(), setting))
		require.Zero(t, ChannelPoolGenerationLimit(context.Background(), setting))
		assert.Equal(t, 1, reads, "a failing endpoint is negative-cached for the refresh interval")
	})

	t.Run("a fixed channel-wide cap wins over the pool algorithm", func(t *testing.T) {
		var reads int
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			reads++
			_, _ = w.Write([]byte(`{"accounts_ready":3}`))
		}))
		t.Cleanup(server.Close)
		setting := kitdto.ChannelSettings{ConcurrencyTotalUrl: server.URL, ConcurrencyTotalLimit: 5}

		assert.Equal(t, 5, ChannelPoolGenerationLimit(context.Background(), setting),
			"an explicit cap replaces accounts_ready times the per-account factor")
		assert.Zero(t, reads, "a fixed cap never reads the pool status")
		assert.Equal(t, kitdto.MaxChannelConcurrency, ChannelPoolGenerationLimit(context.Background(), kitdto.ChannelSettings{ConcurrencyTotalLimit: kitdto.MaxChannelConcurrency + 1}),
			"an out-of-range stored value still yields a bounded cap")
	})

	t.Run("the reading is reused before it is refreshed", func(t *testing.T) {
		var reads int
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			reads++
			_, _ = w.Write([]byte(`{"accounts_ready":2}`))
		}))
		t.Cleanup(server.Close)
		setting := kitdto.ChannelSettings{ConcurrencyTotalUrl: server.URL}

		require.Equal(t, 4, ChannelPoolGenerationLimit(context.Background(), setting))
		require.Equal(t, 4, ChannelPoolGenerationLimit(context.Background(), setting))
		assert.Equal(t, 1, reads, "admission must not read the pool on every attempt")
	})
}
