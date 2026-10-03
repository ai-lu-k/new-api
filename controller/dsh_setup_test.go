package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A setup code may name a key to hand out. Only an enabled key of the same
// user qualifies, when the code is issued and again when it is redeemed.
func TestDshSetupUsesOnlyTheUsersOwnEnabledKey(t *testing.T) {
	database := modelManagementDB(t, "sqlite", "")
	require.NoError(t, database.AutoMigrate(&model.Token{}))

	own := model.Token{UserId: 7, Name: "mine", Key: "own-key", Status: common.TokenStatusEnabled}
	disabled := model.Token{UserId: 7, Name: "off", Key: "disabled-key", Status: common.TokenStatusDisabled}
	foreign := model.Token{UserId: 8, Name: "theirs", Key: "foreign-key", Status: common.TokenStatusEnabled}
	for _, token := range []*model.Token{&own, &disabled, &foreign} {
		require.NoError(t, database.Create(token).Error)
	}

	found := dshSetupOwnToken(7, own.Id)
	require.NotNil(t, found)
	assert.Equal(t, "own-key", found.Key)

	assert.Nil(t, dshSetupOwnToken(7, disabled.Id), "a disabled key")
	assert.Nil(t, dshSetupOwnToken(7, foreign.Id), "another user's key")
	assert.Nil(t, dshSetupOwnToken(7, 999999), "a key that does not exist")
	assert.Nil(t, dshSetupOwnToken(7, 0), "no key named")
	assert.Nil(t, dshSetupOwnToken(7, -1))

	// Deleted after the code was issued: gone by the time it is redeemed.
	require.NoError(t, database.Delete(&own).Error)
	assert.Nil(t, dshSetupOwnToken(7, own.Id), "a key deleted in the meantime")
}
