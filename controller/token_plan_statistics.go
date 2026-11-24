package controller

import (
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func GetTokenPlanStatisticsOverview(c *gin.Context) {
	result, err := model.GetTokenPlanOverview(c.Request.Context(), time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func GetTokenPlanStatisticsUsers(c *gin.Context) {
	page, pageErr := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, sizeErr := strconv.Atoi(c.DefaultQuery("size", "20"))
	minLevel, levelErr := strconv.Atoi(c.DefaultQuery("min_level", "0"))
	search := strings.TrimSpace(c.Query("search"))
	if pageErr != nil || sizeErr != nil || levelErr != nil || minLevel < 0 || minLevel > 6 || page < 1 || page > 1000000 || size < 1 || size > 100 || len(search) > 100 {
		c.JSON(400, gin.H{"success": false, "message": "Invalid statistics pagination, search or level filter"})
		return
	}
	items, total, err := model.ListTokenPlanUsers(c.Request.Context(), search, minLevel, (page-1)*size, size, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": items, "total": total, "page": page, "size": size})
}

func GetTokenPlanStatisticsTrend(c *gin.Context) {
	zone := time.FixedZone("Asia/Shanghai", 8*60*60)
	today := time.Now().In(zone)
	start, startErr := time.ParseInLocation(time.DateOnly, c.DefaultQuery("start_date", today.AddDate(0, 0, -29).Format(time.DateOnly)), zone)
	last, endErr := time.ParseInLocation(time.DateOnly, c.DefaultQuery("end_date", today.Format(time.DateOnly)), zone)
	userId, userErr := strconv.Atoi(c.DefaultQuery("user_id", "0"))
	if startErr != nil || endErr != nil || userErr != nil || userId < 0 || start.Unix() <= 0 || last.Before(start) || last.Sub(start) > 92*24*time.Hour || last.Format(time.DateOnly) > today.Format(time.DateOnly) {
		c.JSON(400, gin.H{"success": false, "message": "Select up to 93 days through today (Asia/Shanghai) and a valid user ID"})
		return
	}
	result, err := model.GetTokenPlanUsageTrend(c.Request.Context(), start, last.AddDate(0, 0, 1), userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}
