// Package dshsetup turns a gateway account into a ready-made configuration for
// the DSH desktop agent. The website hands out a short-lived setup code; a
// small script on the user's machine exchanges it for the provider entries and
// the API key, and writes both into DSH's own files.
package dshsetup

import (
	"errors"
	"fmt"
	"maps"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting/naming_setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// GatewayModel is one model a key can call, with the wire protocols the
// gateway serves it on.
type GatewayModel struct {
	ID        string
	Endpoints []constant.EndpointType
}

// A DSH provider speaks exactly one protocol, so the gateway appears in DSH as
// up to three providers that share one key. Routes are listed in order of
// preference: a model served on several protocols lands on the first.
var routes = []struct {
	endpoint constant.EndpointType
	api      string
	idSuffix string
	label    string
	path     string
}{
	{constant.EndpointTypeOpenAI, "openai-completions", "", "", "/v1"},
	// The Anthropic client appends /v1/messages to the base URL itself.
	{constant.EndpointTypeAnthropic, "anthropic-messages", "-messages", " (Messages)", ""},
	{constant.EndpointTypeOpenAIResponse, "openai-responses", "-responses", " (Responses)", "/v1"},
}

var (
	providerIDPattern = regexp.MustCompile(`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`)
	// Model ids and keys are pasted into YAML and passed through two shells,
	// so only ids that need no escaping anywhere are offered.
	modelIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$`)
	keyPattern     = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
	compatKey      = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9]*$`)
	nonRefChars    = regexp.MustCompile(`[^A-Z0-9]+`)
	originPattern  = regexp.MustCompile(`^https?://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~-]+)*$`)
	effortLevels   = []string{"off", "minimal", "low", "medium", "high", "xhigh", "max"}
)

// ErrNoModels means the account cannot call a single model DSH could use.
var ErrNoModels = errors.New("no model available for the DSH client")

// ProviderIDs lists every provider id the setup may write, whether or not the
// current catalogue fills it, so that a rerun clears entries it no longer needs.
func ProviderIDs(base string) []string {
	ids := make([]string, 0, len(routes))
	for _, route := range routes {
		ids = append(ids, base+route.idSuffix)
	}
	return ids
}

// CredentialRef names the entry in DSH's credential store that holds the key.
// It is the name DSH's own settings page derives for the same provider id, so
// a key saved there and one written by the setup script are the same entry.
func CredentialRef(providerID string) string {
	return nonRefChars.ReplaceAllString(strings.ToUpper(providerID), "_") + "_API_KEY"
}

// ClientModel is one gateway model as a coding client should be told about it.
type ClientModel struct {
	ID string `json:"id"`
	// Name is the display name; empty means the client shows the id.
	Name string `json:"name,omitempty"`
	// Protocols are the wire protocols the model is served on, in the names
	// DSH uses for them and in order of preference.
	Protocols     []string `json:"protocols"`
	ContextWindow int      `json:"context_window,omitempty"`
	MaxTokens     int      `json:"max_tokens,omitempty"`
	Input         []string `json:"input,omitempty"`
}

// ClientModels lists, sorted by id, the models a coding client can be pointed
// at: those served on a chat protocol, minus the ones the catalogue hides and
// the ones whose id could not be written into a config file unescaped.
func ClientModels(setting operation_setting.DshSetupSetting, models []GatewayModel) []ClientModel {
	offered := make([]ClientModel, 0, len(models))
	for _, model := range models {
		entry := modelEntry(setting, model.ID)
		if !modelIDPattern.MatchString(model.ID) || entry.Hidden {
			continue
		}
		var protocols []string
		for _, route := range routes {
			if slices.Contains(model.Endpoints, route.endpoint) {
				protocols = append(protocols, route.api)
			}
		}
		if len(protocols) == 0 {
			continue
		}
		offered = append(offered, ClientModel{
			ID:            model.ID,
			Name:          entry.Name,
			Protocols:     protocols,
			ContextWindow: entry.ContextWindow,
			MaxTokens:     entry.MaxTokens,
			Input:         inputModalities(entry.Input),
		})
	}
	slices.SortFunc(offered, func(a, b ClientModel) int { return strings.Compare(a.ID, b.ID) })
	return offered
}

// modelEntry finds how a model is to be presented. A model whose name now
// carries a price tier ("-x0.25") keeps what was configured for it under its
// old name or under its base name, so renaming models needs no new entries.
func modelEntry(setting operation_setting.DshSetupSetting, id string) operation_setting.DshSetupModel {
	if entry, ok := setting.Models[id]; ok {
		return entry
	}
	base := naming_setting.BillingName(id)
	if entry, ok := setting.Models[base]; ok {
		return entry
	}
	names := slices.Sorted(maps.Keys(setting.Models))
	for _, name := range names {
		if naming_setting.BillingName(naming_setting.ResolveAlias(name)) == base {
			return setting.Models[name]
		}
	}
	return operation_setting.DshSetupModel{}
}

// DefaultModel is the configured default model under the name it is served as
// now: a default set before a rename follows its alias.
func DefaultModel(setting operation_setting.DshSetupSetting) string {
	return naming_setting.ResolveAlias(setting.DefaultModel)
}

// inputModalities keeps the modalities DSH knows, in its own order.
func inputModalities(declared []string) []string {
	var input []string
	for _, modality := range []string{"text", "image"} {
		if slices.Contains(declared, modality) {
			input = append(input, modality)
		}
	}
	return input
}

// BuildPayload renders what a redeemed setup code delivers: the credential,
// the provider entries as YAML, and the default-model section. The format is
// line-based so that a shell script can take it apart without a parser.
func BuildPayload(setting operation_setting.DshSetupSetting, serverAddress string, key string, models []GatewayModel) (string, error) {
	if !providerIDPattern.MatchString(setting.ProviderID) {
		return "", fmt.Errorf("dsh setup: provider id %q is not a valid DSH provider id", setting.ProviderID)
	}
	base, err := gatewayBase(serverAddress)
	if err != nil {
		return "", err
	}
	if !keyPattern.MatchString(key) {
		return "", errors.New("dsh setup: the API key contains characters that cannot be written safely")
	}
	displayName := setting.DisplayName
	if displayName == "" {
		displayName = setting.ProviderID
	}

	// A DSH provider speaks one protocol, so each model goes to the first
	// route it is served on.
	offered := make([][]string, len(routes))
	for _, model := range ClientModels(setting, models) {
		for i, route := range routes {
			if model.Protocols[0] == route.api {
				offered[i] = append(offered[i], model.ID)
			}
		}
	}

	var providers strings.Builder
	defaultProvider, defaultModel := "", ""
	for i, route := range routes {
		if len(offered[i]) == 0 {
			continue
		}
		id := setting.ProviderID + route.idSuffix
		if wanted := DefaultModel(setting); slices.Contains(offered[i], wanted) {
			defaultProvider, defaultModel = id, wanted
		} else if defaultModel == "" {
			defaultProvider, defaultModel = id, offered[i][0]
		}
		fmt.Fprintf(&providers, "%s:\n", id)
		fmt.Fprintf(&providers, "  displayName: %s\n", quote(displayName+route.label))
		fmt.Fprintf(&providers, "  apiKeyEnv: %s\n", CredentialRef(setting.ProviderID))
		fmt.Fprintf(&providers, "  api: %s\n", route.api)
		fmt.Fprintf(&providers, "  baseURL: %s\n", quote(base+route.path))
		providers.WriteString("  models:\n")
		for _, modelID := range offered[i] {
			writeModel(&providers, modelID, modelEntry(setting, modelID))
		}
	}
	if defaultModel == "" {
		return "", ErrNoModels
	}

	var payload strings.Builder
	payload.WriteString("luk-dsh-setup 1\n")
	fmt.Fprintf(&payload, "ref %s\n", CredentialRef(setting.ProviderID))
	fmt.Fprintf(&payload, "key %s\n", key)
	fmt.Fprintf(&payload, "ids %s\n", strings.Join(ProviderIDs(setting.ProviderID), " "))
	payload.WriteString("@@providers\n")
	payload.WriteString(providers.String())
	payload.WriteString("@@default-model\n")
	payload.WriteString("agent-default-model:\n")
	fmt.Fprintf(&payload, "  provider: %s\n", defaultProvider)
	fmt.Fprintf(&payload, "  model: %s\n", quote(defaultModel))
	payload.WriteString("@@end\n")
	return payload.String(), nil
}

// gatewayBase is the configured server address without a trailing slash. It
// is pasted into scripts and commands, so anything but a plain http(s) origin
// with an optional path prefix is refused rather than escaped.
func gatewayBase(serverAddress string) (string, error) {
	base := strings.TrimRight(strings.TrimSpace(serverAddress), "/")
	if !originPattern.MatchString(base) {
		return "", fmt.Errorf("dsh setup: server address %q is not a plain http(s) origin", serverAddress)
	}
	return base, nil
}

func writeModel(out *strings.Builder, id string, entry operation_setting.DshSetupModel) {
	fmt.Fprintf(out, "    - id: %s\n", quote(id))
	if entry.Name != "" {
		fmt.Fprintf(out, "      name: %s\n", quote(entry.Name))
	}
	if entry.ContextWindow > 0 {
		fmt.Fprintf(out, "      contextWindow: %d\n", entry.ContextWindow)
	}
	if entry.MaxTokens > 0 {
		fmt.Fprintf(out, "      maxTokens: %d\n", entry.MaxTokens)
	}
	if input := inputModalities(entry.Input); len(input) > 0 {
		fmt.Fprintf(out, "      input: [%s]\n", strings.Join(input, ", "))
	}

	// DSH refuses a reasoning map that offers nothing but "off", and any level
	// other than "off" that has no wire spelling.
	var efforts []string
	thinks := false
	for _, level := range effortLevels {
		spelling, ok := entry.ReasoningEfforts[level]
		switch {
		case !ok:
		case spelling != "":
			efforts = append(efforts, fmt.Sprintf("        %s: %s\n", level, quote(spelling)))
			thinks = thinks || level != "off"
		case level == "off":
			efforts = append(efforts, "        off:\n")
		}
	}
	if thinks {
		out.WriteString("      reasoningEfforts:\n")
		out.WriteString(strings.Join(efforts, ""))
	}

	var compat []string
	for _, name := range slices.Sorted(maps.Keys(entry.Compat)) {
		if !compatKey.MatchString(name) {
			continue
		}
		switch value := entry.Compat[name].(type) {
		case bool:
			compat = append(compat, fmt.Sprintf("        %s: %t\n", name, value))
		case string:
			compat = append(compat, fmt.Sprintf("        %s: %s\n", name, quote(value)))
		case float64:
			compat = append(compat, fmt.Sprintf("        %s: %s\n", name, strconv.FormatFloat(value, 'f', -1, 64)))
		}
	}
	if len(compat) > 0 {
		out.WriteString("      compat:\n")
		out.WriteString(strings.Join(compat, ""))
	}
}

// quote writes a string as a JSON string, which is also a YAML double-quoted
// scalar, so no value can change the structure of the document around it.
func quote(value string) string {
	encoded, err := common.Marshal(value)
	if err != nil {
		return `""`
	}
	return string(encoded)
}
