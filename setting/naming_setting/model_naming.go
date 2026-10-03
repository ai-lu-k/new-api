// Package naming_setting lets a site sell one upstream model at several price
// tiers without token groups. The tier is spelled in the model name itself:
// "deepseek-v4.1-flash-x0.25" is deepseek-v4.1-flash at a quarter of its
// price. Names callers already depend on stay callable as aliases.
package naming_setting

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	hostreasoning "github.com/QuantumNous/new-api/setting/reasoning"
	"github.com/QuantumNous/new-api/types"
)

// maxAliasHops bounds how far a chain of aliases is followed.
const maxAliasHops = 8

// priceSuffixPattern matches the tier that ends a name: "-x0.25", "-x1",
// "-x12.5". The digits are bounded so that an arbitrary number cannot be read
// as a multiplier.
var priceSuffixPattern = regexp.MustCompile(`^(.+)-x(\d{1,4}(?:\.\d{1,6})?)$`)

// ModelNamingSetting is managed by config.GlobalConfig.Register.
// DB keys: model_naming.price_suffix_enabled, model_naming.aliases
type ModelNamingSetting struct {
	// PriceSuffixEnabled makes a trailing "-x<multiplier>" of a model name
	// scale that model's price. Off by default: a name that ends that way is
	// then an ordinary model name.
	PriceSuffixEnabled bool `json:"price_suffix_enabled"`
	// Aliases maps a name callers send to the name that is routed, billed and
	// logged in its place, such as "deepseek/deepseek-v4.1-flash" to
	// "deepseek-v4.1-flash-x0.25".
	Aliases *types.RWMap[string, string] `json:"aliases"`
}

var modelNamingSetting = ModelNamingSetting{
	Aliases: types.NewRWMap[string, string](),
}

func init() {
	config.GlobalConfig.Register("model_naming", &modelNamingSetting)
}

func GetModelNamingSetting() *ModelNamingSetting {
	return &modelNamingSetting
}

// GetAliasesCopy returns the configured aliases; the caller owns the map.
func GetAliasesCopy() map[string]string {
	if modelNamingSetting.Aliases == nil {
		return map[string]string{}
	}
	return modelNamingSetting.Aliases.ReadAll()
}

// CheckAliases validates the aliases option before it is saved: a JSON
// object of names, none empty, padded or pointing at itself.
func CheckAliases(jsonStr string) error {
	aliases := map[string]string{}
	if err := common.Unmarshal([]byte(jsonStr), &aliases); err != nil {
		return fmt.Errorf("model aliases must be a JSON object of names: %w", err)
	}
	for from, to := range aliases {
		if from == "" || to == "" || strings.TrimSpace(from) != from || strings.TrimSpace(to) != to {
			return fmt.Errorf("model alias %q -> %q: names must not be empty or padded", from, to)
		}
		if from == to {
			return fmt.Errorf("model alias %q points at itself", from)
		}
	}
	return nil
}

// ResolveAlias returns the name a request for name is served under. Request
// modifiers ("@effort:high", a legacy "-thinking" tail) carry over to the
// target. A name that is no alias, or whose aliases loop, comes back as is.
func ResolveAlias(name string) string {
	aliases := modelNamingSetting.Aliases
	if name == "" || aliases == nil || aliases.Len() == 0 {
		return name
	}
	seen := map[string]struct{}{name: {}}
	current := name
	for range maxAliasHops {
		next, ok := aliasTarget(aliases, current)
		if !ok {
			return current
		}
		if _, loop := seen[next]; loop {
			return name
		}
		seen[next] = struct{}{}
		current = next
	}
	return name
}

func aliasTarget(aliases *types.RWMap[string, string], name string) (string, bool) {
	if target, ok := aliases.Get(name); ok {
		target = strings.TrimSpace(target)
		return target, target != "" && target != name
	}
	base, tail, ok := splitModifiers(name)
	if !ok || tail == "" {
		return "", false
	}
	target, ok := aliases.Get(base)
	target = strings.TrimSpace(target)
	if !ok || target == "" || target == base {
		return "", false
	}
	return target + tail, true
}

// splitModifiers separates a name from the request modifiers that follow it.
func splitModifiers(name string) (base string, tail string, ok bool) {
	base = hostreasoning.BaseModelName(name)
	if base == name {
		return name, "", true
	}
	if base == "" || !strings.HasPrefix(name, base) {
		return name, "", false
	}
	return base, name[len(base):], true
}

// SplitPriceSuffix reads "<model>-x<multiplier>" as the model and its
// multiplier, keeping request modifiers on the model. It only parses the name;
// whether the site honours the suffix is for BillingName and PriceMultiplier.
func SplitPriceSuffix(name string) (model string, multiplier float64, ok bool) {
	base, tail, split := splitModifiers(name)
	if !split {
		return name, 1, false
	}
	match := priceSuffixPattern.FindStringSubmatch(base)
	if match == nil {
		return name, 1, false
	}
	multiplier, err := strconv.ParseFloat(match[2], 64)
	if err != nil || math.IsNaN(multiplier) || math.IsInf(multiplier, 0) {
		return name, 1, false
	}
	return match[1] + tail, multiplier, true
}

// priceTier reports the model a name is billed as and the multiplier on its
// price. A model that has a price of its own under a name that merely ends
// like a tier, while the shorter name has none, is a real model and is left
// alone.
func priceTier(name string) (string, float64, bool) {
	if !modelNamingSetting.PriceSuffixEnabled {
		return name, 1, false
	}
	model, multiplier, ok := SplitPriceSuffix(name)
	if !ok {
		return name, 1, false
	}
	base, _, _ := splitModifiers(name)
	pricedBase, _, _ := splitModifiers(model)
	if hasOwnPrice(base) && !hasOwnPrice(pricedBase) {
		return name, 1, false
	}
	return model, multiplier, true
}

func hasOwnPrice(name string) bool {
	if _, ok := ratio_setting.GetModelPrice(name, false); ok {
		return true
	}
	if ratio_setting.HasConfiguredModelRatio(name) {
		return true
	}
	return billing_setting.GetBillingMode(ratio_setting.FormatMatchingModelName(name)) == billing_setting.BillingModeTieredExpr
}

// BillingName returns the name whose price applies to name: the name without
// its price tier. Names that carry no tier are returned unchanged.
func BillingName(name string) string {
	model, _, _ := priceTier(name)
	return model
}

// PriceMultiplier returns the factor a name's tier puts on the price of its
// model, or 1 when the name carries no tier.
func PriceMultiplier(name string) float64 {
	_, multiplier, _ := priceTier(name)
	return multiplier
}

// WithTier names a billed model the way logs and statistics should show it:
// a billing name such as "deepseek-v4.1-flash" for a request that came in
// through a tier gets the tier back ("deepseek-v4.1-flash-x0.25").
func WithTier(billingName string, origin string) string {
	model, _, ok := priceTier(origin)
	if !ok || billingName == "" {
		return billingName
	}
	base, _, _ := splitModifiers(origin)
	pricedBase, _, _ := splitModifiers(model)
	return billingName + strings.TrimPrefix(base, pricedBase)
}

// HasPriceTier reports whether name is billed through a price tier.
func HasPriceTier(name string) bool {
	_, _, ok := priceTier(name)
	return ok
}
