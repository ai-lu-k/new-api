package controller

import (
	"context"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/relayobs"
	"github.com/gin-gonic/gin"
)

// Root-only operational observations are deliberately separate from customer
// consumption APIs: procurement prices and failover identities are private.
// observationChannelNames resolves every channel id the summary mentions to
// its operator-facing name; deleted channels are simply left unnamed.
func observationChannelNames(summary relayobs.Report) map[int]string {
	seen := make(map[int]bool)
	for _, channel := range summary.ByChannel {
		seen[channel.ChannelID] = true
	}
	for _, chain := range summary.Chains {
		for _, channel := range chain.Channels {
			seen[channel.ChannelID] = true
		}
	}
	ids := make([]int, 0, len(seen))
	for id := range seen {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	channels, err := model.GetChannelsByIds(ids)
	if err != nil {
		return nil
	}
	names := make(map[int]string, len(channels))
	for _, channel := range channels {
		names[channel.Id] = channel.Name
	}
	return names
}

// applyChainChannelOrder fills each row with the configured priority and
// weight and re-sorts the rows, so the funnel reads in the order the router
// actually follows instead of the order requests happened to try channels.
func applyChainChannelOrder(chains []relayobs.ModelChain) {
	models := make([]string, 0, len(chains))
	for _, chain := range chains {
		models = append(models, chain.Model)
	}
	order, err := model.GetChannelOrderByModels(models)
	if err != nil {
		return
	}
	for index := range chains {
		configured := order[chains[index].Model]
		for channelIndex := range chains[index].Channels {
			channel := &chains[index].Channels[channelIndex]
			if place, ok := configured[channel.ChannelID]; ok {
				channel.Priority, channel.Weight = place.Priority, place.Weight
			}
		}
		relayobs.OrderChainChannels(chains[index].Channels)
	}
}

func GetRelayObservations(c *gin.Context) {
	query := model.RelayObservationQuery{Model: c.Query("model"), RequestID: c.Param("request_id")}
	query.End = time.Now().Unix() + 1
	query.Start = query.End - 24*3600
	for key, target := range map[string]*int64{"start": &query.Start, "end": &query.End} {
		if raw := c.Query(key); raw != "" {
			value, err := strconv.ParseInt(raw, 10, 64)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid observation time range"})
				return
			}
			*target = value
		}
	}
	if query.Start <= 0 || query.End <= query.Start || query.End-query.Start > 7*24*3600 || len(query.Model) > 200 || len(query.RequestID) > 64 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Observation range must be at most seven days"})
		return
	}
	kind := c.DefaultQuery("traffic_kind", "user")
	if kind != "user" && kind != "probe" && kind != "all" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid observation traffic kind"})
		return
	}
	limit := 1000
	list := strings.HasSuffix(c.FullPath(), "/requests")
	maximum := 10000
	if list {
		limit, maximum = 50, 100
	}
	if raw := c.Query("limit"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > maximum {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid observation scan limit"})
			return
		}
		limit = value
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()
	requests, truncated, err := model.ReadRelayObservations(ctx, query, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Unable to read relay observations"})
		return
	}
	if query.RequestID != "" {
		if len(requests) == 0 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Relay observation not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": requests[0]})
		return
	}
	scanned := len(requests)
	filtered := make([]relayobs.Request, 0, len(requests))
	for _, request := range requests {
		if kind == "all" || kind == request.TrafficKind {
			filtered = append(filtered, request)
		}
	}
	summary := relayobs.Summarize(filtered)
	applyChainChannelOrder(summary.Chains)
	data := gin.H{"schema_version": relayobs.SchemaVersion, "scope": "common_http_relay", "collection_phase": "finished_requests",
		"start": query.Start, "end": query.End, "traffic_kind": kind, "scan_limit": limit,
		"scanned_requests": scanned, "matched_requests": len(filtered), "scan_truncated": truncated,
		"writes": model.RelayObservationWriteStats(), "write_stats_scope": "instance_since_start",
		"summary": summary}
	if names := observationChannelNames(summary); len(names) > 0 {
		data["channel_names"] = names
	}
	if list {
		data["requests"] = filtered
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}
