package benchmark

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"unicode"

	"github.com/QuantumNous/new-api/common"
)

const MappingsOptionKey = "BenchmarkMappings"

var ErrInvalidMappings = errors.New("invalid benchmark mappings")

// DefaultMappingsJSON is used only to initialize a database without mappings.
func DefaultMappingsJSON() string { return `[]` }

// ParseMappings validates operator-managed identities and discards supplied scores.
// Only the independent leaderboard can supply ratings.
func ParseMappings(data string) (models []Model, err error) {
	defer func() {
		if err != nil {
			err = fmt.Errorf("%w: %v", ErrInvalidMappings, err)
		}
	}()
	if len(data) > 1<<20 {
		return nil, errors.New("benchmark mappings exceed size limit")
	}
	if err := common.UnmarshalJsonStr(data, &models); err != nil {
		return nil, err
	}
	if models == nil || len(models) > 1000 {
		return nil, errors.New("benchmark mappings must be an array of at most 1000 models")
	}
	ids, aliases := make(map[string]bool), make(map[string]bool)
	for i := range models {
		model := &models[i]
		if model.Aliases == nil {
			model.Aliases = []string{}
		}
		if !validName(model.ID) || ids[model.ID] || len(model.Aliases) > 1000 || len(model.Tiers) == 0 || len(model.Tiers) > 20 {
			return nil, fmt.Errorf("invalid or duplicate benchmark model: %s", model.ID)
		}
		ids[model.ID] = true
		for _, alias := range model.Aliases {
			if !validName(alias) || aliases[alias] {
				return nil, fmt.Errorf("invalid or duplicate benchmark alias: %s", alias)
			}
			aliases[alias] = true
		}
		tiers := make(map[string]bool)
		for j := range model.Tiers {
			tier := &model.Tiers[j]
			if !slices.Contains([]string{"max", "xhigh", "high", "medium", "low", "minimal", "off", "default"}, tier.ID) || tiers[tier.ID] || (tier.SourceName != "" && !validName(tier.SourceName)) {
				return nil, fmt.Errorf("invalid benchmark tier for %s", model.ID)
			}
			tiers[tier.ID] = true
			tier.Scores = map[string]Score{}
		}
		if !tiers[model.HighestTier] {
			return nil, fmt.Errorf("highest evaluation tier is missing for %s", model.ID)
		}
	}
	return models, nil
}

func validName(name string) bool {
	return name != "" && len(name) <= 200 && name == strings.TrimSpace(name) && !strings.ContainsFunc(name, unicode.IsControl)
}

// SetMappings publishes a validated registry immediately; static snapshots
// supply the ratings.
func (c *Cache) SetMappings(data string) error {
	models, err := ParseMappings(data)
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.mappings = models
	c.data.Models = c.publishedModels(applyScores(models, c.scores))
	return nil
}

func (c *Cache) SourceNames() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	names := make([]string, 0, len(c.scores))
	for name := range c.scores {
		names = append(names, name)
	}
	slices.Sort(names)
	return names
}

func applyScores(models []Model, scores map[string]map[string]Score) []Model {
	result := slices.Clone(models)
	for i := range result {
		result[i].Tiers = slices.Clone(models[i].Tiers)
		for j := range result[i].Tiers {
			tier := &result[i].Tiers[j]
			tier.Scores = scores[tier.SourceName]
			if tier.Scores == nil {
				tier.Scores = map[string]Score{}
			}
		}
	}
	return result
}
