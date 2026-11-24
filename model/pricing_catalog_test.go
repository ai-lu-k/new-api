package model

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The model square sorts models by what they produce, so the pricing payload
// carries both modality lists entered on the model.
func TestPricingCarriesCatalogModalities(t *testing.T) {
	resetPricingEndpointTestTables(t)

	insertPricingEndpointChannel(t, 401, constant.ChannelTypeAdvancedCustom, dto.ChannelOtherSettings{})
	insertPricingEndpointAbility(t, 401, "gpt-image-2")
	require.NoError(t, DB.Create(&Model{
		ModelName:        "gpt-image-2",
		Status:           1,
		NameRule:         NameRuleExact,
		InputModalities:  "text,image",
		OutputModalities: "image",
		ContextLength:    128000,
		ReleaseDate:      "2026-05",
		Series:           "GPT",
	}).Error)

	var listed *Pricing
	pricings := GetPricing()
	for i := range pricings {
		if pricings[i].ModelName == "gpt-image-2" {
			listed = &pricings[i]
			break
		}
	}
	require.NotNil(t, listed, "the priced model is listed")
	assert.Equal(t, []string{"text", "image"}, listed.InputModalities)
	assert.Equal(t, []string{"image"}, listed.OutputModalities)
}
