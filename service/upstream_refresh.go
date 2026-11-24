package service

import (
	"context"
	"math"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// RefreshUpstreamAccount reads one funding account from its own provider and
// stores what it reports. The notes carry non-fatal problems (a wallet or a
// payment history that could not be read) so a good cost reading still lands;
// the returned error means the cost report itself failed.
func RefreshUpstreamAccount(account *model.UpstreamAccount, now time.Time) ([]string, error) {
	switch account.Provider {
	case model.UpstreamProviderCommandCode:
		return nil, SyncCommandCodeFinance(account.Id, now)
	case model.UpstreamProviderWorkBuddy:
		return nil, SyncWorkBuddyFinance(account.Id, now)
	case model.UpstreamProviderCodex789:
		return nil, SyncCodex789Finance(account.Id, now)
	}

	start, end := UpstreamUsageWindow(now)
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	checkedAt := common.GetTimestamp()
	usage, fetchErr := FetchUpstreamUsage(ctx, UpstreamUsageRequest{
		Provider:   account.Provider,
		BaseUrl:    account.BaseUrl,
		Credential: account.Credential,
		Start:      start,
		End:        end,
	})
	// A gateway also reports its own wallet and payment history, and neither
	// failure may hide a good usage reading.
	notes := make([]string, 0, 2)
	if err := refreshGatewayWallet(ctx, account, checkedAt); err != nil {
		notes = append(notes, err.Error())
	}
	if err := refreshGatewayTopUps(ctx, account); err != nil {
		notes = append(notes, err.Error())
	}
	if fetchErr != nil {
		_ = model.SaveUpstreamUsage(account.Id, 0, start.Unix(), end.Unix(), checkedAt, model.UpstreamUsageStatusError, fetchErr.Error())
		return notes, fetchErr
	}
	rounded := math.Round(usage*100) / 100
	if err := model.SaveUpstreamUsage(account.Id, rounded, start.Unix(), end.Unix(), checkedAt, model.UpstreamUsageStatusOK, ""); err != nil {
		return notes, err
	}
	return notes, nil
}

// refreshGatewayWallet reads the wallet a gateway reports for its own account.
// Providers without such an endpoint are skipped.
func refreshGatewayWallet(ctx context.Context, account *model.UpstreamAccount, checkedAt int64) error {
	var balance float64
	var err error
	switch account.Provider {
	case model.UpstreamProviderNewApi:
		balance, err = FetchNewApiBalance(ctx, account.BaseUrl, account.Credential)
	case model.UpstreamProviderOpenLux:
		balance, err = FetchOpenLuxBalance(ctx, account.BaseUrl, account.Credential)
	default:
		return nil
	}
	if err != nil {
		_ = model.SaveUpstreamBalance(account.Id, nil, checkedAt, err.Error())
		return err
	}
	rounded := math.Round(balance*100) / 100
	return model.SaveUpstreamBalance(account.Id, &rounded, checkedAt, "")
}

// refreshGatewayTopUps reads the payment history a gateway keeps for its own
// account. Syncing again updates the booked rate instead of adding the same
// payment twice.
func refreshGatewayTopUps(ctx context.Context, account *model.UpstreamAccount) error {
	var rows []GatewayTopUp
	var err error
	switch account.Provider {
	case model.UpstreamProviderNewApi:
		rows, err = FetchNewApiTopUps(ctx, account.BaseUrl, account.Credential)
	case model.UpstreamProviderOpenLux:
		rows, err = FetchOpenLuxTopUps(ctx, account.BaseUrl, account.Credential)
	default:
		return nil
	}
	if err != nil {
		return err
	}
	records := make([]model.UpstreamTopUp, 0, len(rows))
	for _, row := range rows {
		records = append(records, model.UpstreamTopUp{
			TradeNo: row.TradeNo,
			Paid:    row.Paid,
			Method:  row.Method,
			Status:  row.Status,
			PaidAt:  row.PaidAt,
		})
	}
	return model.SyncUpstreamTopUps(account.Id, account.Currency, account.ExchangeRate, records)
}
