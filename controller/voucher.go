package controller

import (
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// GetPendingVouchers returns the arrival notice's data: the owner's unopened,
// unexpired, not yet acknowledged vouchers.
func GetPendingVouchers(c *gin.Context) {
	rows, err := model.ListPendingVouchers(c.GetInt("id"), time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": rows})
}

// OpenVouchers opens one voucher or every voucher the owner still holds. The
// body carries the ids the console showed, so a retried request cannot open a
// voucher the owner never saw.
func OpenVouchers(c *gin.Context) {
	var body struct {
		VoucherIds []int64 `json:"voucher_ids"`
	}
	valid := common.DecodeJson(c.Request.Body, &body) == nil &&
		len(body.VoucherIds) > 0 && len(body.VoucherIds) <= model.MaxVouchersPerOpen
	for _, id := range body.VoucherIds {
		valid = valid && id > 0
	}
	if !valid {
		c.JSON(400, gin.H{"success": false, "message": "invalid vouchers"})
		return
	}
	result, err := model.OpenVouchers(c.GetInt("id"), body.VoucherIds, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordUserSecurityAudit(c, c.GetInt("id"), "voucher.open", map[string]any{
		"vouchers": len(result.Opened),
		"quota":    result.OpenedQuota,
	})
	common.ApiSuccess(c, result)
}

// GetMyVouchers lists every voucher the owner has, opened and lapsed included.
func GetMyVouchers(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	size, _ := strconv.Atoi(c.Query("size"))
	page = max(1, min(100000, page))
	size = min(100, max(1, size))
	rows, total, err := model.ListVouchers(c.GetInt("id"), (page-1)*size, size, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": rows, "total": total})
}

// AcknowledgeVouchers marks the arrival notice as seen so it stops reappearing.
// It only records that the notice was read; the voucher keeps its state.
func AcknowledgeVouchers(c *gin.Context) {
	var body struct {
		VoucherIds []int64 `json:"voucher_ids"`
	}
	valid := common.DecodeJson(c.Request.Body, &body) == nil &&
		len(body.VoucherIds) > 0 && len(body.VoucherIds) <= model.MaxVouchersPerOpen
	for _, id := range body.VoucherIds {
		valid = valid && id > 0
	}
	if !valid {
		c.JSON(400, gin.H{"success": false, "message": "invalid vouchers"})
		return
	}
	acknowledged, err := model.AcknowledgeVouchers(c.GetInt("id"), body.VoucherIds, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"acknowledged": acknowledged})
}

// PreviewVoucherGrant reports the audience, the face value and the total before
// the administrator confirms the grant.
func PreviewVoucherGrant(c *gin.Context) {
	var grant model.VoucherGrant
	if err := common.DecodeJson(c.Request.Body, &grant); err != nil {
		common.ApiError(c, err)
		return
	}
	preview, err := model.PreviewVoucherGrant(grant, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, preview)
}

// CreateVoucherGrant issues one voucher per recipient. The request ID makes a
// resubmitted grant return the batch already issued.
func CreateVoucherGrant(c *gin.Context) {
	var grant model.VoucherGrant
	if err := common.DecodeJson(c.Request.Body, &grant); err != nil {
		common.ApiError(c, err)
		return
	}
	batch, err := model.CreateVoucherBatch(c.GetInt("id"), grant, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordUserSecurityAudit(c, c.GetInt("id"), "voucher.grant", map[string]any{
		"batch_id":   batch.Id,
		"recipients": batch.RecipientCount,
		"face_value": batch.FaceValue,
	})
	common.ApiSuccess(c, batch)
}

// ListVoucherBatches lists administrator grants, newest first.
func ListVoucherBatches(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	size, _ := strconv.Atoi(c.Query("size"))
	page = max(1, min(100000, page))
	size = min(100, max(1, size))
	rows, total, err := model.ListVoucherBatches((page-1)*size, size)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": rows, "total": total})
}
