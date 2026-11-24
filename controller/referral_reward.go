package controller

import (
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func GetReferralOverview(c *gin.Context) {
	overview, err := model.GetUserReferralOverview(c.GetInt("id"), 50, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, overview)
}

// DismissReferralBanner hides the promotion banner for the current campaign on
// every device of this user.
func DismissReferralBanner(c *gin.Context) {
	if err := model.DismissReferralBanner(c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func ListReferralRewards(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	size, _ := strconv.Atoi(c.Query("size"))
	page = max(1, min(100000, page))
	size = min(100, max(1, size))
	items, total, err := model.ListAdminReferralRewards(c.Query("status"), (page-1)*size, size, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": items, "total": total})
}

// ReissueReferralReward retries the missing side of a reward and never replaces
// or extends a voucher that was already granted.
func ReissueReferralReward(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(400, gin.H{"success": false, "message": "invalid referral reward"})
		return
	}
	reward, err := model.ReissueReferralReward(id, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordUserSecurityAudit(c, c.GetInt("id"), "referral.reward.reissue", map[string]any{"reward_id": reward.Id, "invitee_id": reward.InviteeId, "status": reward.Status})
	common.ApiSuccess(c, reward)
}
