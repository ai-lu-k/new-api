package controller

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

// GetFinanceReserves compares the cumulative historical balance with two
// three-day reserve targets: the seven-day average upstream cost, and the
// whole consumable stock converted at the site's cost share. Root only.
func GetFinanceReserves(c *gin.Context) {
	now := time.Now()
	start, end := service.UpstreamUsageWindow(now)
	cost, err := model.BuildUpstreamReserveCost(now)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	wallet, _, err := model.BuildWalletSources()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	plan, err := model.GetTokenPlanOverview(c.Request.Context(), now)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	// The comparison basis is the same all-history figure the summary shows:
	// money received minus money spent, gifts left out.
	total, err := buildFinanceTotal(now, operation_setting.GetFinanceExcludedUserIds())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	targets := model.BuildReserveTargets(model.ReserveInputs{
		Now:           now,
		WindowDays:    service.UpstreamUsageWindowDays,
		WindowStart:   start.Unix(),
		WindowEnd:     end.Unix(),
		Balance:       total.OnlineTopUp + total.ManualTopUp - total.Expenses,
		Wallet:        wallet.Balance,
		PlanRemaining: model.QuotaToMoney(plan.RemainingQuota),
		Cost:          cost,
	})
	common.ApiSuccess(c, targets)
}
