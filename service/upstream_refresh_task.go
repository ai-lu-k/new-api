package service

import (
	"context"
	"fmt"
	"math"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
)

// upstreamRefreshHour is when the daily refresh runs, on the site's own clock.
const upstreamRefreshHour = 9

var upstreamRefreshOnce sync.Once

// StartUpstreamAccountRefreshTask refreshes every funding account once a day
// and mails configured recipients when an account no longer covers its
// three-day reserve. A failed refresh is reported the same way, because a stale
// number is what an operator would otherwise keep trusting.
func StartUpstreamAccountRefreshTask() {
	upstreamRefreshOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(func() {
			logger.LogInfo(context.Background(), "upstream account refresh task started: daily at 09:00 Asia/Shanghai")
			for {
				time.Sleep(time.Until(nextUpstreamRefreshAt(time.Now())))
				runUpstreamAccountRefreshOnce()
			}
		})
	})
}

// nextUpstreamRefreshAt is the next 09:00 on the site's own calendar.
func nextUpstreamRefreshAt(now time.Time) time.Time {
	local := now.In(upstreamDayLocation)
	next := time.Date(local.Year(), local.Month(), local.Day(), upstreamRefreshHour, 0, 0, 0, upstreamDayLocation)
	if !next.After(local) {
		next = next.AddDate(0, 0, 1)
	}
	return next
}

func runUpstreamAccountRefreshOnce() {
	accounts, err := model.ListUpstreamAccounts()
	if err != nil {
		common.SysError("upstream refresh: could not list accounts: " + err.Error())
		return
	}
	if len(accounts) == 0 {
		return
	}
	now := time.Now()
	problems := make([]string, 0, len(accounts))
	for _, account := range accounts {
		notes, refreshErr := RefreshUpstreamAccount(&account, now)
		if refreshErr != nil {
			problems = append(problems, fmt.Sprintf("%s：%s", account.Name, refreshErr.Error()))
			continue
		}
		if len(notes) > 0 {
			problems = append(problems, fmt.Sprintf("%s：%s", account.Name, strings.Join(notes, "; ")))
			continue
		}
		reloaded, err := model.GetUpstreamAccount(account.Id)
		if err != nil {
			continue
		}
		if gap := upstreamReserveGap(*reloaded); gap > 0 {
			problems = append(problems, fmt.Sprintf("%s：余额 %s，三天储备目标 %s，缺 %s",
				account.Name, moneyText(*reloaded.RemoteBalance), moneyText(upstreamReserveTarget(*reloaded)), moneyText(gap)))
		}
	}
	if len(problems) == 0 {
		return
	}
	notifyUpstreamAlert("上游资金账户需要补充",
		"<p>以下上游资金账户在今天的自动刷新后不满足三天储备目标，或读取失败：</p><ul><li>"+
			strings.Join(problems, "</li><li>")+"</li></ul><p>请登录管理后台的运营信息页面查看。</p>")
}

// upstreamReserveTarget is three days of the seven-day average the account
// actually spent. A report that never succeeded has no target.
func upstreamReserveTarget(account model.UpstreamAccount) float64 {
	if account.UsageStatus != model.UpstreamUsageStatusOK {
		return 0
	}
	return account.Usage7d / UpstreamUsageWindowDays * UpstreamReserveDays
}

// upstreamReserveGap is how much more the account needs. A balance that was
// never read is not a gap: the refresh already reported that failure.
func upstreamReserveGap(account model.UpstreamAccount) float64 {
	if account.RemoteBalance == nil {
		return 0
	}
	return math.Max(upstreamReserveTarget(account)-*account.RemoteBalance, 0)
}

func moneyText(amount float64) string {
	return fmt.Sprintf("$%.2f", amount)
}

// notifyUpstreamAlert mails the funding alert to configured operators. Alerts
// are best effort: a mail failure is logged and never stops the refresh.
func notifyUpstreamAlert(subject string, content string) {
	recipients := strings.TrimSpace(os.Getenv("UPSTREAM_ALERT_RECIPIENTS"))
	if recipients == "" {
		return
	}
	if err := common.SendEmail(subject, recipients, content); err != nil {
		common.SysError("upstream alert failed: " + err.Error())
	}
}
