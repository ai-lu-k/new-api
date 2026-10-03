package model

import "github.com/QuantumNous/new-api/common"

// GetUnrestrictedUserToken returns the user's newest enabled token with this
// name and group that carries no limit of its own (expiry, quota, model list,
// IP list), or nil when the user has none.
func GetUnrestrictedUserToken(userId int, name string, group string) (*Token, error) {
	var tokens []*Token
	// The group goes in its own condition: a struct condition skips an empty
	// group, and an empty group is a real choice (the key follows the user's).
	err := DB.Where(&Token{UserId: userId, Name: name, Status: common.TokenStatusEnabled}).
		Where(commonGroupCol+" = ?", group).
		Order("id desc").Find(&tokens).Error
	if err != nil {
		return nil, err
	}
	for _, token := range tokens {
		if token.ExpiredTime == -1 && token.UnlimitedQuota && !token.ModelLimitsEnabled && len(token.GetIpLimits()) == 0 {
			return token, nil
		}
	}
	return nil, nil
}
