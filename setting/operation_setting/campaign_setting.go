package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// CampaignSetting is the operator-facing window of the campaign this build can
// run. Dates are calendar days on the site's Asia/Shanghai boundary; an empty
// date leaves that boundary unset. The campaign stays closed until an operator
// fills in the window and enables it.
//
// The persisted option prefix is still "ctf_setting": it is the archived 1024
// run's stored window, and renaming the keys would orphan those options. A
// later campaign registers its own setting struct under its own prefix.
type CampaignSetting struct {
	Enabled       bool   `json:"enabled"`
	StartDate     string `json:"start_date"`     // YYYY-MM-DD, opens at 00:00:00
	EndDate       string `json:"end_date"`       // YYYY-MM-DD, closes at 23:59:59
	ClaimDeadline string `json:"claim_deadline"` // YYYY-MM-DD, last day to settle guest progress
	RewardSlots   int    `json:"reward_slots"`
	// Excluded accounts retain progress and past awards but do not rank or receive ranking prizes.
	ExcludedUserIds []int `json:"excluded_user_ids"`
}

var campaignSetting = CampaignSetting{
	Enabled:     false,
	RewardSlots: 100,
}

func init() {
	config.GlobalConfig.Register("ctf_setting", &campaignSetting)
}

func GetCampaignSetting() *CampaignSetting {
	return &campaignSetting
}
