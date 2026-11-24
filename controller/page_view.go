package controller

import (
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// pageViewRankLimit bounds how many ranked pages the menu can choose from.
// The client shows four and keeps only entries it can actually route to, so
// the limit is generous enough that paths nobody navigates to cannot crowd
// the real pages out of the response.
const pageViewRankLimit = 100

type pageViewRequest struct {
	Page string `json:"page"`
}

// RecordPageView counts one visit to a page. The client reports only stable
// route keys, so the stored data never carries query strings or ids.
func RecordPageView(c *gin.Context) {
	var req pageViewRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	page := strings.TrimSpace(req.Page)
	if !model.IsValidPageViewKey(page) {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if err := model.RecordPageView(page, time.Now()); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// GetPopularPageViews ranks the site-wide visits of the last rolling week.
func GetPopularPageViews(c *gin.Context) {
	totals, err := model.PopularPageViews(time.Now(), pageViewRankLimit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, totals)
}
