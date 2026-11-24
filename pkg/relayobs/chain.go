package relayobs

import (
	"cmp"
	"slices"
)

// A routing chain is what one site model actually does under load: every
// channel the router evaluated for it, and what happened there. Candidates
// beyond the cap are dropped so a pathological candidate list cannot blow up
// the report.
//
// The rows are channels, not attempt positions. The router picks by channel
// configuration — highest priority tier first, weighted random inside a tier —
// so "the third attempt" is not a stable axis: the same position carries
// different channels for different requests. Counting per channel lets the
// report order rows the way the configuration does and still tell the truth.
const maxChainCandidates = 8

type ChainChannel struct {
	ChannelID     int    `json:"channel_id"`
	UpstreamModel string `json:"upstream_model"`
	// Priority and Weight are the configured ordering, filled from the ability
	// table by the caller; zero means the channel is no longer configured.
	Priority   int64 `json:"priority"`
	Weight     int64 `json:"weight"`
	Reached    int64 `json:"reached"`
	Attempted  int64 `json:"attempted"`
	Succeeded  int64 `json:"succeeded"`
	Failed     int64 `json:"failed"`
	Skipped    int64 `json:"skipped"`
	Rejected   int64 `json:"rejected"`
	Terminated int64 `json:"terminated"`
}

type ModelChain struct {
	Model     string         `json:"model"`
	Requests  int64          `json:"requests"`
	Completed int64          `json:"completed"`
	Failed    int64          `json:"failed"`
	Channels  []ChainChannel `json:"channels"`
}

type chainAccumulator struct {
	model     string
	requests  int64
	completed int64
	failed    int64
	channels  map[int]*ChainChannel
}

// Add folds one request into the chain of its site model. Candidates carry the
// router's evaluation order and only an admitted candidate owns an upstream
// attempt, so they are paired by position; the counts land on the channel.
func (c *chainAccumulator) Add(request Request) {
	c.requests++
	if request.Outcome == "success" {
		c.completed++
	} else {
		c.failed++
	}
	attempt := 0
	lastChannelID := 0
	for index := range min(len(request.Candidates), maxChainCandidates) {
		candidate := request.Candidates[index]
		channel := c.channel(candidate.ChannelID)
		channel.Reached++
		lastChannelID = candidate.ChannelID
		switch candidate.Result {
		case "admitted":
			channel.Attempted++
			if attempt >= len(request.Attempts) {
				continue
			}
			current := request.Attempts[attempt]
			attempt++
			if current.UpstreamModel != "" {
				channel.UpstreamModel = current.UpstreamModel
			}
			if current.Outcome == "success" {
				channel.Succeeded++
			} else {
				channel.Failed++
			}
		case "capacity_skipped":
			channel.Skipped++
		default:
			channel.Rejected++
		}
	}
	// The last candidate is where the router stopped: without a success the
	// request died on that channel's row, whichever position it held.
	if lastChannelID != 0 && request.Outcome != "success" {
		c.channel(lastChannelID).Terminated++
	}
}

func (c *chainAccumulator) channel(channelID int) *ChainChannel {
	channel := c.channels[channelID]
	if channel == nil {
		channel = &ChainChannel{ChannelID: channelID}
		c.channels[channelID] = channel
	}
	return channel
}

func (c *chainAccumulator) result() ModelChain {
	chain := ModelChain{Model: c.model, Requests: c.requests, Completed: c.completed, Failed: c.failed}
	chain.Channels = make([]ChainChannel, 0, len(c.channels))
	for _, channel := range c.channels {
		chain.Channels = append(chain.Channels, *channel)
	}
	OrderChainChannels(chain.Channels)
	return chain
}

// OrderChainChannels puts rows in configuration order: the highest priority
// tier first, then the heaviest channel inside it. Rows without a configured
// priority stay last and fall back to the traffic they saw.
func OrderChainChannels(channels []ChainChannel) {
	slices.SortFunc(channels, func(a, b ChainChannel) int {
		if a.Priority != b.Priority {
			return cmp.Compare(b.Priority, a.Priority)
		}
		if a.Weight != b.Weight {
			return cmp.Compare(b.Weight, a.Weight)
		}
		if a.Reached != b.Reached {
			return cmp.Compare(b.Reached, a.Reached)
		}
		return cmp.Compare(a.ChannelID, b.ChannelID)
	})
}

func summarizeChains(requests []Request) []ModelChain {
	chains := make(map[string]*chainAccumulator)
	order := make([]string, 0, 16)
	for _, request := range requests {
		chain := chains[request.Model]
		if chain == nil {
			chain = &chainAccumulator{model: request.Model, channels: make(map[int]*ChainChannel)}
			chains[request.Model] = chain
			order = append(order, request.Model)
		}
		chain.Add(request)
	}
	result := make([]ModelChain, 0, len(order))
	for _, model := range order {
		chain := chains[model]
		if len(chain.channels) == 0 {
			continue
		}
		result = append(result, chain.result())
	}
	slices.SortFunc(result, func(a, b ModelChain) int {
		if a.Requests == b.Requests {
			return cmp.Compare(a.Model, b.Model)
		}
		return cmp.Compare(b.Requests, a.Requests)
	})
	return result
}
