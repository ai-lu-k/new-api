package controller

import (
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

const (
	financeOperationsDefaultDays = 30
	financeOperationsMaxDays     = 366
	// A channel balance goes stale quickly; a balance the operator typed in by
	// hand is allowed to stand a little longer but is never trusted forever.
	upstreamChannelBalanceStaleAfter = 24 * time.Hour
	upstreamManualBalanceStaleAfter  = 7 * 24 * time.Hour
)

// GetFinanceOperations returns the operations overview: the ordinary users'
// wallet split, the settled consumption of the period, and the current Token
// Plan cycle. Everything is Root only, like the rest of /finance.
func GetFinanceOperations(c *gin.Context) {
	start, end, err := financeOperationsRange(c)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	summary, _, err := model.BuildWalletSources()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	consumption, err := model.FinanceConsumptionBetween(start, end)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	plan, err := model.GetTokenPlanOverview(c.Request.Context(), time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{
		"wallet":      summary,
		"consumption": consumption,
		"token_plan": gin.H{
			"users":           plan.Users,
			"activated_users": plan.ActivatedUsers,
			"total_quota":     roundCents(model.QuotaToMoney(plan.TotalQuota)),
			"used_quota":      roundCents(model.QuotaToMoney(plan.UsedQuota)),
			"reserved_quota":  roundCents(model.QuotaToMoney(plan.ReservedQuota)),
			"remaining_quota": roundCents(model.QuotaToMoney(plan.RemainingQuota)),
			"wallet_used":     roundCents(model.QuotaToMoney(plan.WalletUsedQuota)),
			"as_of":           plan.AsOf,
			"cycle_note":      "each user's cycle ends on a different day",
		},
	}})
}

// ListFinanceUsers pages through the per-user wallet split so the overview can
// be checked against a specific account.
func ListFinanceUsers(c *gin.Context) {
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset = max(offset, 0)
	limit = min(max(limit, 1), 100)

	_, rows, err := model.BuildWalletSources()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	rows = model.SearchWalletSourceUsers(rows, c.Query("search"))
	total := len(rows)
	if offset > total {
		offset = total
	}
	page := rows[offset:min(offset+limit, total)]
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{
		"items": page,
		"total": total,
	}})
}

// ListUpstreamAccounts returns every independently funded upstream account
// with its reserve figures.
func ListUpstreamAccounts(c *gin.Context) {
	accounts, err := model.ListUpstreamAccounts()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	channels, err := financeChannelBalances()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	views := make([]upstreamAccountView, 0, len(accounts))
	for _, account := range accounts {
		views = append(views, buildUpstreamAccountView(account, channels, time.Now()))
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{
		"items": views,
	}})
}

type upstreamAccountRequest struct {
	Name             string   `json:"name"`
	Provider         string   `json:"provider"`
	BaseUrl          string   `json:"base_url"`
	Credential       string   `json:"credential"`
	BalanceChannelId int      `json:"balance_channel_id"`
	ManualBalance    *float64 `json:"manual_balance"`
	Currency         string   `json:"currency"`
	ExchangeRate     *float64 `json:"exchange_rate"`
}

// CreateUpstreamAccount adds one funding pool. The Admin key is write-only:
// responses say whether one is stored, never what it is.
func CreateUpstreamAccount(c *gin.Context) {
	var request upstreamAccountRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		common.ApiErrorMsg(c, "invalid upstream account")
		return
	}
	request.Credential = strings.TrimSpace(request.Credential)
	if request.Credential == "" && request.Provider != model.UpstreamProviderCommandCode && request.Provider != model.UpstreamProviderWorkBuddy {
		common.ApiErrorMsg(c, "a credential is required")
		return
	}
	account, err := applyUpstreamAccountRequest(model.UpstreamAccount{}, request)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if err := model.CreateUpstreamAccount(&account); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": accountViewFor(c, account)})
}

// UpdateUpstreamAccount edits one funding pool. Leaving the credential empty
// keeps the stored key.
func UpdateUpstreamAccount(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "invalid upstream account")
		return
	}
	existing, err := model.GetUpstreamAccount(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var request upstreamAccountRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		common.ApiErrorMsg(c, "invalid upstream account")
		return
	}
	request.Credential = strings.TrimSpace(request.Credential)
	if request.Credential == "" {
		request.Credential = existing.Credential
	}
	account, err := applyUpstreamAccountRequest(*existing, request)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if err := model.UpdateUpstreamAccount(&account); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": accountViewFor(c, account)})
}

func DeleteUpstreamAccount(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "invalid upstream account")
		return
	}
	if err := model.DeleteUpstreamAccount(id); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}

// RefreshUpstreamAccount reads the provider's official cost report for the
// last seven complete days and stores the result. The same refresh also runs
// on its own every morning, so this endpoint only reports what that work does.
func RefreshUpstreamAccount(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "invalid upstream account")
		return
	}
	account, err := model.GetUpstreamAccount(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	notes, refreshErr := service.RefreshUpstreamAccount(account, time.Now())
	reloaded, reloadErr := model.GetUpstreamAccount(id)
	if reloadErr != nil {
		common.ApiError(c, reloadErr)
		return
	}
	if refreshErr != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": refreshErr.Error(), "data": accountViewFor(c, *reloaded)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": strings.Join(notes, "; "), "data": accountViewFor(c, *reloaded)})
}

// ListUpstreamTopUps returns one gateway account's payment history, so the
// card can show what the annual expense figure was built from.
func ListUpstreamTopUps(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "invalid upstream account")
		return
	}
	if _, err := model.GetUpstreamAccount(id); err != nil {
		common.ApiError(c, err)
		return
	}
	rows, err := model.ListUpstreamTopUps(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{"items": rows}})
}

// accountViewFor renders an account without the stored credential.
func accountViewFor(c *gin.Context, account model.UpstreamAccount) upstreamAccountView {
	channels, _ := financeChannelBalances()
	return buildUpstreamAccountView(account, channels, time.Now())
}

type upstreamAccountView struct {
	Pool *service.CommandCodeFinance `json:"pool,omitempty"`
	// WorkBuddy is the credit-pool reading; its amounts are credits, not money.
	WorkBuddy *service.WorkBuddyFinance `json:"workbuddy,omitempty"`
	model.UpstreamAccount
	Balance          *float64 `json:"balance"`
	BalanceSource    string   `json:"balance_source"`
	BalanceUpdatedAt int64    `json:"balance_updated_at"`
	BalanceStale     bool     `json:"balance_stale"`
	DailyAverage     *float64 `json:"daily_average"`
	Target3d         *float64 `json:"target_3d"`
	Gap              *float64 `json:"gap"`
	HasCredential    bool     `json:"has_credential"`
	TopUpCount       int64    `json:"topup_count"`
	TopUpTotal       float64  `json:"topup_total"`
	TopUpCheckedAt   int64    `json:"topup_checked_at"`
}

func buildUpstreamAccountView(account model.UpstreamAccount, channels map[int]model.Channel, now time.Time) upstreamAccountView {
	view := upstreamAccountView{UpstreamAccount: account, HasCredential: account.Credential != ""}
	nowSeconds := now.Unix()
	if account.RemoteBalance != nil {
		view.Balance = floatPtr(roundCents(*account.RemoteBalance))
		view.BalanceSource = "api"
		view.BalanceUpdatedAt = account.RemoteBalanceAt
		view.BalanceStale = nowSeconds-account.RemoteBalanceAt > int64(upstreamChannelBalanceStaleAfter.Seconds())
	} else if channel, ok := channels[account.BalanceChannelId]; ok && account.BalanceChannelId > 0 && channel.BalanceUpdatedTime > 0 {
		view.Balance = floatPtr(roundCents(channel.Balance))
		view.BalanceSource = "channel"
		view.BalanceUpdatedAt = channel.BalanceUpdatedTime
		view.BalanceStale = nowSeconds-channel.BalanceUpdatedTime > int64(upstreamChannelBalanceStaleAfter.Seconds())
	} else if account.ManualBalance != nil {
		view.Balance = floatPtr(roundCents(*account.ManualBalance))
		view.BalanceSource = "manual"
		view.BalanceUpdatedAt = account.ManualBalanceUpdatedAt
		view.BalanceStale = nowSeconds-account.ManualBalanceUpdatedAt > int64(upstreamManualBalanceStaleAfter.Seconds())
	}
	if summary, err := model.UpstreamTopUpSummaryOf(account.Id); err == nil {
		view.TopUpCount = summary.Count
		view.TopUpTotal = roundCents(summary.Total)
		view.TopUpCheckedAt = summary.CheckedAt
	}
	if account.Provider == model.UpstreamProviderWorkBuddy {
		report, err := service.ReadWorkBuddyFinance(now)
		view.BalanceSource = "pool"
		if err != nil {
			view.BalanceStale = true
			view.UsageStatus = model.UpstreamUsageStatusError
			view.UsageError = err.Error()
			return view
		}
		view.WorkBuddy = report
		view.Balance = floatPtr(roundCents(report.Balance))
		view.BalanceUpdatedAt = report.GeneratedAt
		// A pool with an unreadable account file, or with every account
		// disabled, is not a trustworthy balance.
		view.BalanceStale = report.StaleCount > 0 || report.AccountsEnabled == 0
		view.Usage7d = report.Usage7d
		view.UsageStatus = model.UpstreamUsageStatusOK
		view.UsageCheckedAt = report.GeneratedAt
		view.UsageWindowStart = report.WindowStart
		view.UsageWindowEnd = report.GeneratedAt
		view.DailyAverage = floatPtr(report.Target3d / 3)
		view.Target3d = floatPtr(roundCents(report.Target3d))
		if !view.BalanceStale {
			view.Gap = floatPtr(roundCents(max(report.Target3d-report.Balance, 0)))
		}
		return view
	}
	if account.Provider == model.UpstreamProviderCommandCode {
		report, err := service.ReadCommandCodeFinance(now)
		view.BalanceSource = "pool"
		if err != nil {
			view.BalanceStale = true
			view.UsageStatus = model.UpstreamUsageStatusError
			view.UsageError = err.Error()
			return view
		}
		view.Pool = report
		view.Balance = floatPtr(roundCents(report.Balance))
		view.BalanceUpdatedAt = report.GeneratedAt
		// A fresh report is the balance itself; accounts whose plan or quota
		// cannot be read are listed on the account row, so they do not make the
		// number old and they must not hide the gap.
		view.BalanceStale = report.StaleCount > 0
		view.Usage7d = report.Usage7d
		view.UsageStatus = model.UpstreamUsageStatusOK
		view.UsageCheckedAt = report.GeneratedAt
		view.UsageWindowStart = max(report.FirstObservedAt, now.Add(-7*24*time.Hour).Unix())
		view.UsageWindowEnd = report.GeneratedAt
		view.DailyAverage = floatPtr(report.Target3d / 3)
		view.Target3d = floatPtr(roundCents(report.Target3d))
		if !view.BalanceStale {
			view.Gap = floatPtr(roundCents(max(report.Target3d-report.Balance, 0)))
		}
		return view
	}
	if account.UsageStatus == model.UpstreamUsageStatusOK {
		daily := account.Usage7d / service.UpstreamUsageWindowDays
		target := daily * service.UpstreamReserveDays
		view.DailyAverage = floatPtr(roundCents(daily))
		view.Target3d = floatPtr(roundCents(target))
		if view.Balance != nil && !view.BalanceStale {
			view.Gap = floatPtr(roundCents(max(target-*view.Balance, 0)))
		}
	}
	return view
}

func financeChannelBalances() (map[int]model.Channel, error) {
	var channels []model.Channel
	err := model.DB.Select("id", "balance", "balance_updated_time").Find(&channels).Error
	if err != nil {
		return nil, err
	}
	byId := make(map[int]model.Channel, len(channels))
	for _, channel := range channels {
		byId[channel.Id] = channel
	}
	return byId, nil
}

// isPoolProvider reports whether a provider's figures come from a host-side
// pool report instead of a credential this server calls.
func isPoolProvider(provider string) bool {
	return provider == model.UpstreamProviderCommandCode || provider == model.UpstreamProviderWorkBuddy
}

func applyUpstreamAccountRequest(account model.UpstreamAccount, request upstreamAccountRequest) (model.UpstreamAccount, error) {
	name := strings.TrimSpace(request.Name)
	if name == "" || len(name) > 60 {
		return account, errors.New("the account name must be 1 to 60 characters")
	}
	if account.Id > 0 && (isPoolProvider(account.Provider) != isPoolProvider(request.Provider)) {
		return account, errors.New("a funding pool's provider cannot be changed")
	}
	if isPoolProvider(request.Provider) {
		accounts, err := model.ListUpstreamAccounts()
		if err != nil {
			return account, err
		}
		for _, existing := range accounts {
			if existing.Provider == request.Provider && existing.Id != account.Id {
				return account, errors.New("only one " + request.Provider + " funding account is supported")
			}
		}
		account.Name, account.Provider = name, request.Provider
		account.BaseUrl, account.Credential = "", ""
		account.BalanceChannelId, account.ManualBalance, account.ManualBalanceUpdatedAt = 0, nil, 0
		account.Currency, account.ExchangeRate = "CNY", 1
		return account, nil
	}
	switch request.Provider {
	case model.UpstreamProviderOpenAI, model.UpstreamProviderAnthropic, model.UpstreamProviderNewApi, model.UpstreamProviderOpenLux, model.UpstreamProviderCodex789:
	default:
		return account, errors.New("only OpenAI, Anthropic, new-api, OpenLux and codex789 panels are supported")
	}
	baseUrl := strings.TrimSpace(request.BaseUrl)
	if baseUrl != "" {
		if err := service.CheckUpstreamBaseUrl(baseUrl); err != nil {
			return account, err
		}
	}
	if (request.Provider == model.UpstreamProviderNewApi || request.Provider == model.UpstreamProviderOpenLux) && baseUrl == "" {
		return account, errors.New("the gateway base url is required")
	}
	if request.Provider == model.UpstreamProviderCodex789 {
		if baseUrl == "" {
			return account, errors.New("the codex789 base url is required")
		}
		// The refresh token is the only credential; an existing account may
		// keep the stored one, a new account has nothing to refresh with.
		if account.Id == 0 && strings.TrimSpace(request.Credential) == "" {
			return account, errors.New("the codex789 refresh token is required")
		}
	}
	if request.BalanceChannelId < 0 {
		return account, errors.New("invalid balance channel")
	}
	if request.BalanceChannelId > 0 {
		var channel model.Channel
		if err := model.DB.First(&channel, request.BalanceChannelId).Error; err != nil {
			return account, errors.New("the balance channel does not exist")
		}
	}
	if request.ManualBalance != nil && *request.ManualBalance < 0 {
		return account, errors.New("the manual balance cannot be negative")
	}
	currency := strings.ToUpper(strings.TrimSpace(request.Currency))
	if currency == "" {
		currency = model.UpstreamDefaultCurrency
	}
	// The codex789 panel and OpenLux both price and charge in USD whatever the
	// operator types, so their booking currency is not a choice; only the CNY
	// rate per USD is.
	if request.Provider == model.UpstreamProviderCodex789 || request.Provider == model.UpstreamProviderOpenLux {
		currency = "USD"
	}
	if !validCurrencyCode(currency) {
		return account, errors.New("the currency must be a three-letter code")
	}
	rate := 1.0
	if currency != model.UpstreamDefaultCurrency {
		if request.ExchangeRate == nil || *request.ExchangeRate <= 0 || *request.ExchangeRate > 10000 {
			return account, errors.New("an exchange rate above zero is required when the currency is not CNY")
		}
		rate = *request.ExchangeRate
	}
	account.Name = name
	account.Provider = request.Provider
	account.BaseUrl = baseUrl
	if request.Credential != "" {
		account.Credential = request.Credential
	}
	account.BalanceChannelId = request.BalanceChannelId
	account.Currency = currency
	account.ExchangeRate = rate
	account.ManualBalance = request.ManualBalance
	if request.ManualBalance != nil {
		account.ManualBalanceUpdatedAt = common.GetTimestamp()
	} else {
		account.ManualBalanceUpdatedAt = 0
	}
	return account, nil
}

// financeOperationsRange defaults to the Shanghai days of the last month, so a
// period here starts and ends on the same boundary the daily charts use.
func financeOperationsRange(c *gin.Context) (int64, int64, error) {
	if c.Query("start_timestamp") != "" || c.Query("end_timestamp") != "" {
		return financeTimestampRange(c, financeOperationsDefaultDays, financeOperationsMaxDays)
	}
	// Shanghai days keep the finance period and the daily charts on one
	// boundary.
	shanghai := time.FixedZone("Asia/Shanghai", financeDayLocation)
	now := time.Now().In(shanghai)
	end := now.Unix()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, shanghai).
		AddDate(0, 0, -financeOperationsDefaultDays).Unix()
	return start, end, nil
}

// financeTimestampRange reads an optional [start_timestamp, end_timestamp)
// pair, falling back to the last defaultDays days and refusing anything wider
// than maxDays.
func financeTimestampRange(c *gin.Context, defaultDays int, maxDays int64) (int64, int64, error) {
	end := time.Now().Unix()
	start := end - int64(defaultDays)*86400
	if value := c.Query("start_timestamp"); value != "" {
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err != nil || parsed <= 0 {
			return 0, 0, errors.New("invalid time range")
		}
		start = parsed
	}
	if value := c.Query("end_timestamp"); value != "" {
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err != nil || parsed <= 0 {
			return 0, 0, errors.New("invalid time range")
		}
		end = parsed
	}
	if end <= start || end-start > maxDays*86400 {
		return 0, 0, errors.New("invalid time range")
	}
	return start, end, nil
}

// validCurrencyCode accepts the ISO-style code the payment history is in;
// the gateway's own display type is not trusted.
func validCurrencyCode(code string) bool {
	if len(code) != 3 {
		return false
	}
	for _, letter := range code {
		if letter < 'A' || letter > 'Z' {
			return false
		}
	}
	return true
}

func floatPtr(value float64) *float64 {
	return &value
}

// upstreamBookingView is one synced payment as the ledger page shows it.
type upstreamBookingView struct {
	Id          int     `json:"id"`
	AccountId   int     `json:"account_id"`
	AccountName string  `json:"account_name"`
	Paid        float64 `json:"paid"`
	Currency    string  `json:"currency"`
	Rate        float64 `json:"rate"`
	AmountCny   float64 `json:"amount_cny"`
	Method      string  `json:"method"`
	PaidAt      int64   `json:"paid_at"`
}

// ListUpstreamBookings lists what the monthly totals already count, so the
// ledger can show the booked payments next to the hand-entered lines.
func ListUpstreamBookings(c *gin.Context) {
	topUps, err := model.ListSuccessfulUpstreamTopUps()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	accounts, err := model.ListUpstreamAccounts()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	names := make(map[int]string, len(accounts))
	for _, account := range accounts {
		names[account.Id] = account.Name
	}
	items := make([]upstreamBookingView, 0, len(topUps))
	for _, topUp := range topUps {
		items = append(items, upstreamBookingView{
			Id:          topUp.Id,
			AccountId:   topUp.AccountId,
			AccountName: names[topUp.AccountId],
			Paid:        topUp.Paid,
			Currency:    topUp.Currency,
			Rate:        topUp.Rate,
			AmountCny:   math.Round(topUp.Paid*topUp.Rate*100) / 100,
			Method:      topUp.Method,
			PaidAt:      topUp.PaidAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{"items": items}})
}
