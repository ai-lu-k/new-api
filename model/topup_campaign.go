package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// TopUpCampaign describes the published online top-up offer. The end is
// exclusive: November 12 at 24:00 in Asia/Shanghai is November 13 at 00:00.
type TopUpCampaign struct {
	Id               string `json:"id"`
	StartsAt         int64  `json:"starts_at"`
	EndsAt           int64  `json:"ends_at"`
	ServerTime       int64  `json:"server_time"`
	Active           bool   `json:"active"`
	BasePercent      int    `json:"base_percent"`
	ThresholdCNY     int    `json:"threshold_cny"`
	ThresholdPercent int    `json:"threshold_percent"`
	Currency         string `json:"currency"`
}

func CurrentTopUpCampaign(now int64) TopUpCampaign {
	// 2026-11-09 23:03:43 through 2026-11-13 00:00:00, Asia/Shanghai.
	campaign := TopUpCampaign{
		Id: "double-11-2026", StartsAt: 1794236623, EndsAt: 1794499200,
		ServerTime: now, BasePercent: 5, ThresholdCNY: 100, ThresholdPercent: 15, Currency: "CNY",
	}
	campaign.Active = now >= campaign.StartsAt && now < campaign.EndsAt
	return campaign
}

// TopUpPayment is payment data from a verified provider notification, never
// the browser's return URL, requested wallet amount, or display currency.
// Amount is in major currency units (yuan for CNY), with exact cent precision.
type TopUpPayment struct {
	Currency string
	Amount   string
}

// CalculateTopUpBonus is shared by payment quotes and settlement, so the
// displayed voucher amount uses the same threshold and quota rounding.
func CalculateTopUpBonus(quota int, payment *TopUpPayment, completedAt int64) (int, error) {
	campaign := CurrentTopUpCampaign(completedAt)
	if !campaign.Active || payment == nil || !strings.EqualFold(strings.TrimSpace(payment.Currency), campaign.Currency) {
		return 0, nil
	}
	cents, err := EpayMoneyCents(payment.Amount)
	if err != nil {
		return 0, err
	}
	if quota <= 0 || common.ValidateWalletQuota(quota) != nil {
		return 0, ErrInvalidTopUpQuota
	}
	percent := campaign.BasePercent
	if cents >= int64(campaign.ThresholdCNY)*100 {
		percent = campaign.ThresholdPercent
	}
	// Multiply the purchased quota, rather than yuan, so existing top-up
	// discounts and group ratios retain their meaning. Round down to one quota
	// unit using decimal arithmetic and the shared strict wallet conversion.
	return common.WalletQuotaFromDecimalStrict(decimal.NewFromInt(int64(quota)).
		Mul(decimal.NewFromInt(int64(percent))).Div(decimal.NewFromInt(100)).Truncate(0))
}

// settleOnlineTopUp commits the purchased balance and optional voucher as one
// entitlement. The conditional state transition also protects SQLite, which
// does not support SELECT FOR UPDATE. Callers own the database transaction.
func settleOnlineTopUp(tx *gorm.DB, topUp *TopUp, quota int, updates map[string]any, payment *TopUpPayment, completedAt int64) error {
	if topUp.Status != common.TopUpStatusPending {
		return ErrTopUpStatusInvalid
	}
	bonus, err := CalculateTopUpBonus(quota, payment, completedAt)
	if err != nil {
		return err
	}
	topUp.BonusQuota = bonus
	topUp.CompleteTime = completedAt
	if err := issueTopUpBonus(tx, topUp); err != nil {
		return err
	}
	result := tx.Model(&TopUp{}).Where("id = ? AND status = ?", topUp.Id, common.TopUpStatusPending).
		Updates(map[string]any{
			"status": common.TopUpStatusSuccess, "complete_time": completedAt,
			"bonus_quota":         topUp.BonusQuota,
			"bonus_redemption_id": topUp.BonusRedemptionId,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrTopUpStatusInvalid
	}
	if err := creditTopUpQuota(tx, topUp.UserId, quota, updates); err != nil {
		return err
	}
	topUp.Status = common.TopUpStatusSuccess
	return nil
}

// issueTopUpBonus is called only by verified online-payment settlement, in the
// same transaction as the pending -> success transition and purchased quota.
// Administrator completion and redemption never enter this path.
func issueTopUpBonus(tx *gorm.DB, topUp *TopUp) error {
	if topUp.BonusQuota <= 0 || topUp.BonusRedemptionId != 0 || !CurrentTopUpCampaign(topUp.CompleteTime).Active {
		return nil
	}
	if err := common.ValidateWalletQuota(topUp.BonusQuota); err != nil {
		return err
	}
	redemption := &Redemption{
		UserId: topUp.UserId, Name: "双11充值赠券", Key: common.GetUUID(),
		Status: common.RedemptionCodeStatusEnabled, Quota: topUp.BonusQuota,
		CreatedTime: topUp.CompleteTime,
	}
	// Preserve the existing redemption-code expiry policy (0 = no expiry).
	if err := tx.Create(redemption).Error; err != nil {
		return err
	}
	topUp.BonusRedemptionId = redemption.Id
	return nil
}

// LoadTopUpBonuses is called after the user-scoped (or administrator-authorized)
// order query. Only those orders' voucher codes can appear in the response.
func LoadTopUpBonuses(topUps []*TopUp) error {
	ids := make([]int, 0, len(topUps))
	for _, topUp := range topUps {
		if topUp.BonusRedemptionId > 0 {
			ids = append(ids, topUp.BonusRedemptionId)
		}
	}
	if len(ids) == 0 {
		return nil
	}
	var redemptions []*Redemption
	if err := DB.Select("id", "key", "quota", "status", "expired_time").Where("id IN ?", ids).Find(&redemptions).Error; err != nil {
		return err
	}
	byId := make(map[int]*Redemption, len(redemptions))
	for _, redemption := range redemptions {
		byId[redemption.Id] = redemption
	}
	for _, topUp := range topUps {
		topUp.BonusRedemption = byId[topUp.BonusRedemptionId]
	}
	return nil
}
