package relayobs

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSummarizeChainsCountsEachChannelOnce(t *testing.T) {
	requests := []Request{
		{
			Model:   "retail",
			Outcome: "success",
			Candidates: []Candidate{
				{ChannelID: 22, Result: "admitted"},
			},
			Attempts: []Attempt{
				{Number: 1, ChannelID: 22, UpstreamModel: "deepseek-v4.1-flash", Outcome: "success"},
			},
		},
		{
			Model:   "retail",
			Outcome: "success",
			Candidates: []Candidate{
				{ChannelID: 22, Result: "admitted"},
				{ChannelID: 15, Result: "admitted"},
			},
			Attempts: []Attempt{
				{Number: 1, ChannelID: 22, UpstreamModel: "deepseek-v4.1-flash", Outcome: "timeout"},
				{Number: 2, ChannelID: 15, UpstreamModel: "deepseek-v4.1-flash-1017", Outcome: "success"},
			},
		},
		{
			Model:   "retail",
			Outcome: "delivery_error",
			Candidates: []Candidate{
				{ChannelID: 22, Result: "capacity_skipped"},
				{ChannelID: 15, Result: "capacity_skipped"},
			},
			Attempts: []Attempt{},
		},
	}

	report := Summarize(requests)
	require.Len(t, report.Chains, 1)

	chain := report.Chains[0]
	assert.Equal(t, "retail", chain.Model)
	assert.Equal(t, int64(3), chain.Requests)
	assert.Equal(t, int64(2), chain.Completed)
	assert.Equal(t, int64(1), chain.Failed)

	// One row per channel: the two requests that started on 22 both count there
	// even though the second one failed over to 15.
	require.Len(t, chain.Channels, 2)
	primary := chain.Channels[0]
	assert.Equal(t, 22, primary.ChannelID)
	assert.Equal(t, int64(3), primary.Reached)
	assert.Equal(t, int64(2), primary.Attempted)
	assert.Equal(t, int64(1), primary.Succeeded)
	assert.Equal(t, int64(1), primary.Failed)
	assert.Equal(t, int64(1), primary.Skipped)
	assert.Equal(t, int64(0), primary.Terminated)
	assert.Equal(t, "deepseek-v4.1-flash", primary.UpstreamModel)

	backup := chain.Channels[1]
	assert.Equal(t, 15, backup.ChannelID)
	assert.Equal(t, int64(2), backup.Reached)
	assert.Equal(t, int64(1), backup.Attempted)
	assert.Equal(t, int64(1), backup.Succeeded)
	assert.Equal(t, int64(1), backup.Skipped)
	// The router stopped on 15 for the request that ended in a delivery error.
	assert.Equal(t, int64(1), backup.Terminated)
}

func TestOrderChainChannelsFollowsConfiguredPriorityThenWeight(t *testing.T) {
	channels := []ChainChannel{
		{ChannelID: 3, Reached: 90},
		{ChannelID: 9, Priority: 0, Weight: 10, Reached: 10},
		{ChannelID: 5, Priority: 10, Weight: 20, Reached: 1},
		{ChannelID: 7, Priority: 10, Weight: 50, Reached: 2},
	}

	OrderChainChannels(channels)

	ids := make([]int, 0, len(channels))
	for _, channel := range channels {
		ids = append(ids, channel.ChannelID)
	}
	assert.Equal(t, []int{7, 5, 9, 3}, ids)
}

func TestSummarizeChainsOrdersByRequestVolumeAndCapsHops(t *testing.T) {
	long := Request{Model: "busy", Outcome: "success", Candidates: []Candidate{}, Attempts: []Attempt{}}
	for i := range 12 {
		long.Candidates = append(long.Candidates, Candidate{ChannelID: i + 1, Result: "capacity_skipped"})
	}
	quiet := Request{Model: "quiet", Outcome: "success",
		Candidates: []Candidate{{ChannelID: 5, Result: "admitted"}},
		Attempts:   []Attempt{{Number: 1, ChannelID: 5, UpstreamModel: "glm-4.6", Outcome: "success"}},
	}

	report := Summarize([]Request{long, quiet, long})
	require.Len(t, report.Chains, 2)
	assert.Equal(t, "busy", report.Chains[0].Model)
	assert.Len(t, report.Chains[0].Channels, maxChainCandidates)
	assert.Equal(t, "quiet", report.Chains[1].Model)
}
