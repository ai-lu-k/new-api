package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/model"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestApplyUpstreamAccountRequestKeepsCodex789PaymentsInUSD(t *testing.T) {
	rate := 1.03
	account, err := applyUpstreamAccountRequest(model.UpstreamAccount{}, upstreamAccountRequest{
		Name:         "island AI Coding",
		Provider:     model.UpstreamProviderCodex789,
		BaseUrl:      "https://provider.example.test",
		Credential:   "rt_first",
		Currency:     "CNY", // the panel bills in USD whatever is picked here
		ExchangeRate: &rate,
	})
	require.NoError(t, err)
	assert.Equal(t, model.UpstreamProviderCodex789, account.Provider)
	assert.Equal(t, "USD", account.Currency)
	assert.InDelta(t, 1.03, account.ExchangeRate, 1e-9)
	assert.Equal(t, "rt_first", account.Credential)
}

func TestApplyUpstreamAccountRequestRejectsCodex789WithoutAddressTokenOrRate(t *testing.T) {
	rate := 1.03
	_, err := applyUpstreamAccountRequest(model.UpstreamAccount{}, upstreamAccountRequest{
		Name: "island", Provider: model.UpstreamProviderCodex789,
		Credential: "rt_first", ExchangeRate: &rate,
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "base url is required")

	_, err = applyUpstreamAccountRequest(model.UpstreamAccount{}, upstreamAccountRequest{
		Name: "island", Provider: model.UpstreamProviderCodex789,
		BaseUrl: "https://provider.example.test", ExchangeRate: &rate,
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "refresh token is required")

	// The payments are booked in CNY, so the rate is what makes the expense
	// right; without it the account would silently book 1:1.
	_, err = applyUpstreamAccountRequest(model.UpstreamAccount{}, upstreamAccountRequest{
		Name: "island", Provider: model.UpstreamProviderCodex789,
		BaseUrl: "https://provider.example.test", Credential: "rt_first",
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "exchange rate")
}
