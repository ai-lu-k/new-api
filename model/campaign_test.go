package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCampaignPublicNameMasksDisplayNamesAndFallbackUsernames(t *testing.T) {
	for _, tc := range []struct {
		name string
		user User
		want string
	}{
		{name: "display email", user: User{DisplayName: "alice@example.com", Username: "fallback"}, want: "al***"},
		{name: "username email", user: User{Username: "bob@example.com"}, want: "bo***"},
		{name: "display name", user: User{DisplayName: " Root User ", Username: "fallback"}, want: "Ro***"},
		{name: "phone display name", user: User{DisplayName: "13812345678"}, want: "13***"},
		{name: "unicode", user: User{DisplayName: "中文昵称"}, want: "中文***"},
		{name: "two characters", user: User{DisplayName: "小明"}, want: "小***"},
		{name: "one character", user: User{DisplayName: "唯"}, want: "***"},
		{name: "blank display name", user: User{DisplayName: " ", Username: " player "}, want: "pl***"},
		{name: "empty names", user: User{}, want: "***"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, campaignPublicName(tc.user))
		})
	}
}
