package model

// UsageLevel is derived from paid consumption (users.level_quota): the part of
// the charges the user's own money covered. Token Plan's free allowance is
// excluded by never entering used_quota, and gifted balance (check-in, codes,
// event prizes, registration/invitation rewards, hand-outs) is excluded
// because it is spent from users.bonus_quota before any real money is
// touched. Current balance and top-ups do not participate in its calculation.
type UsageLevel struct {
	Level          int     `json:"level"`
	NextLevelQuota *int    `json:"next_level_quota"`
	RemainingQuota int     `json:"remaining_quota"`
	Progress       float64 `json:"progress"`
}

func CalculateUsageLevel(levelQuota int, thresholds [7]int) UsageLevel {
	levelQuota = max(0, levelQuota)
	level := 0
	for i := 1; i < len(thresholds); i++ {
		if levelQuota < thresholds[i] {
			break
		}
		level = i
	}
	result := UsageLevel{Level: level, Progress: 100}
	if level == 6 {
		return result
	}
	next := thresholds[level+1]
	result.NextLevelQuota = &next
	result.RemainingQuota = next - levelQuota
	// LV1's progress starts at zero consumption, rather than the tiny quota
	// unit that distinguishes it from a brand-new account.
	floor := thresholds[level]
	if level == 1 {
		floor = 0
	}
	result.Progress = float64(levelQuota-floor) / float64(next-floor) * 100
	return result
}
