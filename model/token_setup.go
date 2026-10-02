package model

import "github.com/QuantumNous/new-api/common"

// GetUnrestrictedUserToken returns the user's newest enabled token with this
// name and group that carries no limit of its own (expiry, quota, model list,
// IP list), or nil when the user has none.
func GetUnrestrictedUserToken(userId int, name string, group string) (*Token, error) {
	var tokens []*Token
	err := DB.Where(&Token{UserId: userId, Name: name, Group: group, Status: common.TokenStatusEnabled}).
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
