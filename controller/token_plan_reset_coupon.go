package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"strconv"
	"time"
)

func GetTokenPlanCoupons(c *gin.Context) {
	userId := c.GetInt("id")
	batchId := 0
	if c.GetBool("coupon_admin") {
		userId = 0
		batchId, _ = strconv.Atoi(c.Query("batch_id"))
	}
	page, _ := strconv.Atoi(c.Query("page"))
	size, _ := strconv.Atoi(c.Query("size"))
	page = max(1, min(100000, page))
	size = min(100, max(1, size))
	rows, total, err := model.ListTokenPlanCoupons(userId, batchId, (page-1)*size, size, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": rows, "total": total})
}

func PreviewTokenPlanCoupon(c *gin.Context) {
	var body struct {
		CouponId int `json:"coupon_id"`
	}
	if err := common.DecodeJson(c.Request.Body, &body); err != nil || body.CouponId <= 0 {
		c.JSON(400, gin.H{"success": false, "message": "invalid coupon"})
		return
	}
	result, err := model.PreviewTokenPlanReset(c.GetInt("id"), body.CouponId, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func UseTokenPlanCoupon(c *gin.Context) {
	var body struct {
		OperationId string `json:"operation_id"`
		Confirmed   bool   `json:"confirmed"`
	}
	if err := common.DecodeJson(c.Request.Body, &body); err != nil || len(body.OperationId) != 32 {
		c.JSON(400, gin.H{"success": false, "message": "invalid reset operation"})
		return
	}
	result, err := model.UseTokenPlanReset(c.GetInt("id"), body.OperationId, body.Confirmed, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordUserSecurityAudit(c, c.GetInt("id"), "token_plan.coupon.use", map[string]any{"coupon_id": result.CouponId, "week_id": result.WeekId, "multiplier": result.NewMultiplier})
	common.ApiSuccess(c, result)
}

func GetTokenPlanResetOperation(c *gin.Context) {
	result, err := model.TokenPlanResetOperationStatus(c.GetInt("id"), c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func GetPendingTokenPlanCoupons(c *gin.Context) {
	rows, err := model.ListPendingTokenPlanCoupons(c.GetInt("id"), time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": rows})
}

func AcknowledgeTokenPlanCoupons(c *gin.Context) {
	var body struct {
		CouponIds []int `json:"coupon_ids"`
	}
	valid := common.DecodeJson(c.Request.Body, &body) == nil &&
		len(body.CouponIds) > 0 && len(body.CouponIds) <= 50
	for _, id := range body.CouponIds {
		valid = valid && id > 0
	}
	if !valid {
		c.JSON(400, gin.H{"success": false, "message": "invalid coupons"})
		return
	}
	acknowledged, err := model.AcknowledgeTokenPlanCoupons(c.GetInt("id"), body.CouponIds, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"acknowledged": acknowledged})
}

func PreviewTokenPlanCouponGrant(c *gin.Context) {
	var grant model.TokenPlanCouponGrant
	if err := common.DecodeJson(c.Request.Body, &grant); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := grant.Validate(time.Now()); err != nil {
		common.ApiError(c, err)
		return
	}
	ids, err := model.TokenPlanCouponRecipients(model.DB, grant)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"recipients": len(ids), "coupons": len(ids) * grant.PerUser, "audience_digest": model.TokenPlanCouponAudienceDigest(ids)})
}

func CreateTokenPlanCouponGrant(c *gin.Context) {
	var grant model.TokenPlanCouponGrant
	if err := common.DecodeJson(c.Request.Body, &grant); err != nil {
		common.ApiError(c, err)
		return
	}
	batch, err := model.CreateTokenPlanCouponBatch(c.GetInt("id"), grant, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordUserSecurityAudit(c, c.GetInt("id"), "token_plan.coupon.issue", map[string]any{"batch_id": batch.Id, "multiplier": batch.Multiplier, "recipients": batch.RecipientCount, "per_user": batch.PerUser})
	common.ApiSuccess(c, batch)
}

func ContinueTokenPlanCouponGrant(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(400, gin.H{"success": false, "message": "invalid batch"})
		return
	}
	batch, err := model.ContinueTokenPlanCouponBatch(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, batch)
}

func VoidTokenPlanCouponGrant(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(400, gin.H{"success": false, "message": "invalid batch"})
		return
	}
	if err := model.VoidTokenPlanCouponBatch(id); err != nil {
		common.ApiError(c, err)
		return
	}
	recordUserSecurityAudit(c, c.GetInt("id"), "token_plan.coupon.void", map[string]any{"batch_id": id})
	common.ApiSuccess(c, nil)
}

func ListTokenPlanCouponGrants(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	page = max(1, min(100000, page))
	var rows []model.TokenPlanCouponBatch
	var total int64
	if err := model.DB.Model(&model.TokenPlanCouponBatch{}).Count(&total).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DB.Order("id DESC").Offset((page - 1) * 20).Limit(20).Find(&rows).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": rows, "total": total})
}
