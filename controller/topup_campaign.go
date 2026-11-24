package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func GetTopUpCampaign(c *gin.Context) {
	common.ApiSuccess(c, model.CurrentTopUpCampaign(common.GetTimestamp()))
}
