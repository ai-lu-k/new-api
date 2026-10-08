package service

// UsageLevel is derived from settled, net consumed quota. Credit origin,
// current balance and top-ups do not participate in its calculation.
type UsageLevel struct {
	Level          int     `json:"level"`
	NextLevelQuota *int    `json:"next_level_quota"`
	RemainingQuota int     `json:"remaining_quota"`
	Progress       float64 `json:"progress"`
}

func CalculateUsageLevel(usedQuota int, thresholds [7]int) UsageLevel {
	usedQuota = max(0, usedQuota)
	level := 0
	for i := 1; i < len(thresholds); i++ {
		if usedQuota < thresholds[i] {
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
	result.RemainingQuota = next - usedQuota
	// LV1's progress starts at zero consumption, rather than the tiny quota
	// unit that distinguishes it from a brand-new account.
	floor := thresholds[level]
	if level == 1 {
		floor = 0
	}
	result.Progress = float64(usedQuota-floor) / float64(next-floor) * 100
	return result
}
