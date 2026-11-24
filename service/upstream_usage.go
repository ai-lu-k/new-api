package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// The reserve target covers three days of the seven complete days before
// today, in the site's own Asia/Shanghai calendar.
const (
	UpstreamUsageWindowDays = 7
	UpstreamReserveDays     = 3

	// Bounded, but large enough for a real gateway: /api/status can carry
	// announcements and pricing teasers and already exceeds 500 KiB on one
	// self-hosted upstream, which used to be truncated mid-JSON.
	upstreamUsageMaxBytes = 4 << 20
	upstreamUsageTimeout  = 20 * time.Second
)

var upstreamDayLocation = time.FixedZone("Asia/Shanghai", 8*60*60)

// ErrUpstreamUnsupportedProvider means no official cost report exists for the
// provider, so the account must stay "unknown" instead of showing a guess.
var ErrUpstreamUnsupportedProvider = errors.New("upstream provider has no official cost report")

// UpstreamUsageWindow is the last seven complete Asia/Shanghai calendar days.
// Today is excluded because it is still running.
func UpstreamUsageWindow(now time.Time) (time.Time, time.Time) {
	local := now.In(upstreamDayLocation)
	end := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, upstreamDayLocation)
	return end.AddDate(0, 0, -UpstreamUsageWindowDays), end
}

// UpstreamUsageRequest is everything needed to read one provider's official
// cost report.
type UpstreamUsageRequest struct {
	Provider   string
	BaseUrl    string
	Credential string
	Start      time.Time
	End        time.Time
}

// CheckUpstreamBaseUrl refuses addresses the server should not call. A
// provider may run on a private https host, but plain http is only allowed on
// loopback so a typo cannot send the Admin key over the network in clear text.
func CheckUpstreamBaseUrl(raw string) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" {
		return errors.New("invalid base url")
	}
	if parsed.Scheme == "https" {
		return nil
	}
	if parsed.Scheme != "http" {
		return errors.New("base url must use http or https")
	}
	host := parsed.Hostname()
	if host == "localhost" {
		return nil
	}
	if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		return nil
	}
	return errors.New("plain http is only allowed for localhost")
}

// FetchUpstreamUsage reads the amount actually billed in [start, end) from the
// provider's official cost report. Providers are billed in USD; any other
// currency is refused rather than converted by guesswork.
func FetchUpstreamUsage(ctx context.Context, req UpstreamUsageRequest) (float64, error) {
	var endpoint string
	var header http.Header
	switch req.Provider {
	case model.UpstreamProviderOpenAI:
		base := strings.TrimRight(req.BaseUrl, "/")
		if base == "" {
			base = "https://api.openai.com"
		}
		endpoint = fmt.Sprintf("%s/v1/organization/costs?start_time=%d&end_time=%d&bucket_width=1d&limit=31",
			base, req.Start.Unix(), req.End.Unix())
		header = http.Header{"Authorization": {"Bearer " + req.Credential}}
	case model.UpstreamProviderAnthropic:
		base := strings.TrimRight(req.BaseUrl, "/")
		if base == "" {
			base = "https://api.anthropic.com"
		}
		endpoint = fmt.Sprintf("%s/v1/organizations/cost_report?starting_at=%s&ending_at=%s&bucket_width=1d&limit=31",
			base, url.QueryEscape(req.Start.Format(time.RFC3339)), url.QueryEscape(req.End.Format(time.RFC3339)))
		header = http.Header{
			"X-Api-Key":         {req.Credential},
			"Anthropic-Version": {"2023-06-01"},
		}
	case model.UpstreamProviderNewApi:
		return fetchNewApiUsage(ctx, req)
	case model.UpstreamProviderOpenLux:
		return fetchOpenLuxUsage(ctx, req)
	default:
		return 0, ErrUpstreamUnsupportedProvider
	}

	body, err := upstreamGetKind(ctx, endpoint, header, "cost report")
	if err != nil {
		return 0, err
	}
	if req.Provider == model.UpstreamProviderOpenAI {
		return sumOpenAICosts(body)
	}
	return sumAnthropicCosts(body)
}

// fetchNewApiUsage reads the usage a new-api gateway records for the token's
// own account in [start, end). The gateway reports quota units, so the site's
// quota_per_unit from its public status decides the USD amount; a gateway
// without that unit is refused rather than guessed.
func fetchNewApiUsage(ctx context.Context, req UpstreamUsageRequest) (float64, error) {
	base := strings.TrimRight(strings.TrimSpace(req.BaseUrl), "/")
	if base == "" {
		return 0, errors.New("the new-api base url is required")
	}
	quotaPerUnit, err := newApiQuotaPerUnit(ctx, base)
	if err != nil {
		return 0, err
	}
	header := http.Header{"Authorization": {"Bearer " + req.Credential}}
	endpoint := fmt.Sprintf("%s/api/data/self?start_timestamp=%d&end_timestamp=%d",
		base, req.Start.Unix(), req.End.Unix())
	body, err := upstreamGetKind(ctx, endpoint, header, "usage report")
	if err != nil {
		return 0, err
	}
	var response struct {
		Success bool `json:"success"`
		Data    []struct {
			Quota int64 `json:"quota"`
		} `json:"data"`
	}
	if err := common.Unmarshal(body, &response); err != nil {
		return 0, errors.New("the usage report was not valid JSON")
	}
	total := int64(0)
	for _, row := range response.Data {
		total += row.Quota
	}
	return float64(total) / quotaPerUnit, nil
}

// FetchNewApiBalance reads the wallet the gateway reports for the token's own
// account. A token without profile:read is told exactly what to grant.
func FetchNewApiBalance(ctx context.Context, baseUrl string, credential string) (float64, error) {
	base := strings.TrimRight(strings.TrimSpace(baseUrl), "/")
	if base == "" {
		return 0, errors.New("the new-api base url is required")
	}
	quotaPerUnit, err := newApiQuotaPerUnit(ctx, base)
	if err != nil {
		return 0, err
	}
	header := http.Header{"Authorization": {"Bearer " + credential}}
	body, err := upstreamGetKind(ctx, base+"/api/user/self", header, "balance")
	if err != nil {
		return 0, err
	}
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Quota int64 `json:"quota"`
		} `json:"data"`
	}
	if err := common.Unmarshal(body, &response); err != nil {
		return 0, errors.New("the balance was not valid JSON")
	}
	return float64(response.Data.Quota) / quotaPerUnit, nil
}

// GatewayTopUp is one payment a new-api family gateway recorded for the bound
// account, in the currency that gateway charges in.
type GatewayTopUp struct {
	TradeNo string
	Paid    float64
	Method  string
	Status  string
	PaidAt  int64
}

// FetchNewApiTopUps reads the payment history a new-api gateway keeps for the
// token's own account. Records are identified by their trade number, so
// syncing them again is safe.
func FetchNewApiTopUps(ctx context.Context, baseUrl string, credential string) ([]GatewayTopUp, error) {
	base := strings.TrimRight(strings.TrimSpace(baseUrl), "/")
	if base == "" {
		return nil, errors.New("the new-api base url is required")
	}
	header := http.Header{"Authorization": {"Bearer " + credential}}
	const pageSize = 100
	all := make([]GatewayTopUp, 0)
	for page := range 20 {
		endpoint := fmt.Sprintf("%s/api/user/topup/self?p=%d&page_size=%d", base, page, pageSize)
		body, err := upstreamGetKind(ctx, endpoint, header, "top-up history")
		if err != nil {
			return nil, err
		}
		var response struct {
			Success bool `json:"success"`
			Data    struct {
				Total int `json:"total"`
				Items []struct {
					Id          int64   `json:"id"`
					Amount      float64 `json:"amount"`
					Money       float64 `json:"money"`
					TradeNo     string  `json:"trade_no"`
					Method      string  `json:"payment_method"`
					Status      string  `json:"status"`
					CreatedAt   int64   `json:"create_time"`
					CompletedAt int64   `json:"complete_time"`
				} `json:"items"`
			} `json:"data"`
		}
		if err := common.Unmarshal(body, &response); err != nil {
			return nil, errors.New("the top-up history was not valid JSON")
		}
		if len(response.Data.Items) == 0 {
			break
		}
		for _, item := range response.Data.Items {
			topUp := GatewayTopUp{
				TradeNo: item.TradeNo,
				Paid:    item.Money,
				Method:  item.Method,
				Status:  item.Status,
				PaidAt:  item.CompletedAt,
			}
			if topUp.Paid <= 0 {
				topUp.Paid = item.Amount
			}
			if topUp.PaidAt == 0 {
				topUp.PaidAt = item.CreatedAt
			}
			if topUp.TradeNo == "" {
				topUp.TradeNo = fmt.Sprintf("id:%d", item.Id)
			}
			all = append(all, topUp)
		}
		if len(all) >= response.Data.Total || len(response.Data.Items) < pageSize {
			break
		}
	}
	return all, nil
}

// newApiQuotaPerUnit reads the public status of a new-api gateway to learn how
// many quota units one USD is worth.
func newApiQuotaPerUnit(ctx context.Context, base string) (float64, error) {
	body, err := upstreamGetKind(ctx, base+"/api/status", nil, "status")
	if err != nil {
		return 0, err
	}
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			QuotaPerUnit float64 `json:"quota_per_unit"`
		} `json:"data"`
	}
	if err := common.Unmarshal(body, &response); err != nil {
		return 0, errors.New("the upstream status was not valid JSON")
	}
	if response.Data.QuotaPerUnit <= 0 {
		return 0, errors.New("the upstream did not report its quota unit")
	}
	return response.Data.QuotaPerUnit, nil
}

// openLuxCredential splits the stored OpenLux credential into the account id
// and the access token. Its user APIs answer the token alone with "New-Api-User
// missing", so a malformed credential is refused here with a readable reason.
func openLuxCredential(credential string) (string, string, error) {
	accountId, token, found := strings.Cut(strings.TrimSpace(credential), ":")
	accountId, token = strings.TrimSpace(accountId), strings.TrimSpace(token)
	if !found || accountId == "" || token == "" {
		return "", "", errors.New("the openlux credential must be <account id>:<access token>")
	}
	if strings.Trim(accountId, "0123456789") != "" {
		return "", "", errors.New("the openlux account id must be a number")
	}
	return accountId, token, nil
}

// openLuxHeader is the pair every OpenLux user API expects: the access token
// and the account id it belongs to.
func openLuxHeader(accountId, token string) http.Header {
	return http.Header{
		"Authorization": {"Bearer " + token},
		"New-Api-User":  {accountId},
	}
}

// fetchOpenLuxUsage sums the quota OpenLux recorded for the bound account in
// [start, end). The gateway reports quota units, so its public quota_per_unit
// decides the USD amount, exactly as for any new-api gateway.
func fetchOpenLuxUsage(ctx context.Context, req UpstreamUsageRequest) (float64, error) {
	base := strings.TrimRight(strings.TrimSpace(req.BaseUrl), "/")
	if base == "" {
		return 0, errors.New("the openlux base url is required")
	}
	accountId, token, err := openLuxCredential(req.Credential)
	if err != nil {
		return 0, err
	}
	quotaPerUnit, err := newApiQuotaPerUnit(ctx, base)
	if err != nil {
		return 0, err
	}
	endpoint := fmt.Sprintf("%s/api/data/self?start_timestamp=%d&end_timestamp=%d",
		base, req.Start.Unix(), req.End.Unix())
	body, err := upstreamGetKind(ctx, endpoint, openLuxHeader(accountId, token), "usage report")
	if err != nil {
		return 0, err
	}
	var response struct {
		Success bool `json:"success"`
		Data    []struct {
			Quota int64 `json:"quota"`
		} `json:"data"`
	}
	if err := common.Unmarshal(body, &response); err != nil {
		return 0, errors.New("the usage report was not valid JSON")
	}
	total := int64(0)
	for _, row := range response.Data {
		total += row.Quota
	}
	return float64(total) / quotaPerUnit, nil
}

// FetchOpenLuxBalance reads the wallet OpenLux reports for the bound account.
func FetchOpenLuxBalance(ctx context.Context, baseUrl string, credential string) (float64, error) {
	base := strings.TrimRight(strings.TrimSpace(baseUrl), "/")
	if base == "" {
		return 0, errors.New("the openlux base url is required")
	}
	accountId, token, err := openLuxCredential(credential)
	if err != nil {
		return 0, err
	}
	quotaPerUnit, err := newApiQuotaPerUnit(ctx, base)
	if err != nil {
		return 0, err
	}
	body, err := upstreamGetKind(ctx, base+"/api/user/self", openLuxHeader(accountId, token), "balance")
	if err != nil {
		return 0, err
	}
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Quota int64 `json:"quota"`
		} `json:"data"`
	}
	if err := common.Unmarshal(body, &response); err != nil {
		return 0, errors.New("the balance was not valid JSON")
	}
	return float64(response.Data.Quota) / quotaPerUnit, nil
}

// FetchOpenLuxTopUps reads the payment history OpenLux keeps for the bound
// account. Orders that were never paid are carried as they are; only a
// successful payment is booked as an expense.
func FetchOpenLuxTopUps(ctx context.Context, baseUrl string, credential string) ([]GatewayTopUp, error) {
	base := strings.TrimRight(strings.TrimSpace(baseUrl), "/")
	if base == "" {
		return nil, errors.New("the openlux base url is required")
	}
	accountId, token, err := openLuxCredential(credential)
	if err != nil {
		return nil, err
	}
	header := openLuxHeader(accountId, token)
	const pageSize = 100
	all := make([]GatewayTopUp, 0)
	for page := range 20 {
		endpoint := fmt.Sprintf("%s/api/user/topuprecords?page=%d&page_size=%d", base, page+1, pageSize)
		body, err := upstreamGetKind(ctx, endpoint, header, "top-up history")
		if err != nil {
			return nil, err
		}
		var response struct {
			Success bool `json:"success"`
			Data    struct {
				Total   int `json:"total"`
				Records []struct {
					Id          int64   `json:"id"`
					Amount      float64 `json:"amount"`
					Money       float64 `json:"money"`
					TradeNo     string  `json:"trade_no"`
					Method      string  `json:"payment_method"`
					Status      string  `json:"status"`
					CreatedAt   int64   `json:"create_time"`
					CompletedAt int64   `json:"complete_time"`
				} `json:"records"`
			} `json:"data"`
		}
		if err := common.Unmarshal(body, &response); err != nil {
			return nil, errors.New("the top-up history was not valid JSON")
		}
		if len(response.Data.Records) == 0 {
			break
		}
		for _, item := range response.Data.Records {
			topUp := GatewayTopUp{
				TradeNo: item.TradeNo,
				Paid:    item.Money,
				Method:  item.Method,
				Status:  item.Status,
				PaidAt:  item.CompletedAt,
			}
			if topUp.Paid <= 0 {
				topUp.Paid = item.Amount
			}
			if topUp.PaidAt == 0 {
				topUp.PaidAt = item.CreatedAt
			}
			if topUp.TradeNo == "" {
				topUp.TradeNo = fmt.Sprintf("id:%d", item.Id)
			}
			all = append(all, topUp)
		}
		if len(all) >= response.Data.Total || len(response.Data.Records) < pageSize {
			break
		}
	}
	return all, nil
}

func upstreamGet(ctx context.Context, endpoint string, header http.Header) ([]byte, error) {
	return upstreamGetKind(ctx, endpoint, header, "cost report")
}

// upstreamGetKind names the resource in errors so the operator knows which
// request failed without seeing a response body.
func upstreamGetKind(ctx context.Context, endpoint string, header http.Header, kind string) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, errors.New("invalid cost report url")
	}
	for key, values := range header {
		for _, value := range values {
			request.Header.Add(key, value)
		}
	}
	request.Header.Set("Accept", "application/json")
	client := &http.Client{
		Timeout: upstreamUsageTimeout,
		// A cost report must not chase redirects, which could point anywhere.
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, errors.New("cost report request failed")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		// The body may echo request details; only the error code is read to
		// tell a missing token scope apart from a plain rejection.
		scopeDenied := response.StatusCode == http.StatusForbidden && upstreamScopeDenied(response.Body)
		switch response.StatusCode {
		case http.StatusUnauthorized:
			if kind == "balance" || kind == "usage report" || kind == "top-up history" {
				return nil, errors.New("the access token was rejected")
			}
			return nil, errors.New("the credential was rejected; an Admin key is required")
		case http.StatusForbidden:
			if scopeDenied {
				if kind == "balance" {
					return nil, errors.New("the access token needs the profile:read scope to read the balance")
				}
				if kind == "top-up history" {
					return nil, errors.New("the access token needs permission to read the top-up history")
				}
				return nil, errors.New("the access token needs the usage:read scope to read the usage")
			}
			return nil, fmt.Errorf("the credential is not allowed to read the %s", kind)
		case http.StatusNotFound:
			if kind == "balance" {
				return nil, errors.New("the upstream does not expose a wallet")
			}
			if kind == "top-up history" {
				return nil, errors.New("the upstream does not expose its top-up history")
			}
			return nil, fmt.Errorf("the provider does not expose this %s", kind)
		case http.StatusTooManyRequests:
			return nil, fmt.Errorf("the provider rate limited the %s", kind)
		default:
			return nil, fmt.Errorf("the provider answered HTTP %d", response.StatusCode)
		}
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, upstreamUsageMaxBytes))
	if err != nil {
		return nil, errors.New("could not read the cost report")
	}
	return body, nil
}

// upstreamScopeDenied reports whether a new-api gateway refused a request
// because the access token lacks a scope.
func upstreamScopeDenied(body io.Reader) bool {
	data, err := io.ReadAll(io.LimitReader(body, 8<<10))
	if err != nil {
		return false
	}
	var response struct {
		Code string `json:"code"`
	}
	if common.Unmarshal(data, &response) != nil {
		return false
	}
	return response.Code == "ACCESS_TOKEN_SCOPE_DENIED"
}

func sumOpenAICosts(body []byte) (float64, error) {
	var response struct {
		Data []struct {
			Results []struct {
				Amount struct {
					Value    string `json:"value"`
					Currency string `json:"currency"`
				} `json:"amount"`
			} `json:"results"`
		} `json:"data"`
	}
	if err := common.Unmarshal(body, &response); err != nil {
		return 0, errors.New("the cost report was not valid JSON")
	}
	total := 0.0
	for _, bucket := range response.Data {
		for _, result := range bucket.Results {
			if !strings.EqualFold(result.Amount.Currency, "usd") {
				return 0, errors.New("the cost report is not in USD")
			}
			value, err := strconv.ParseFloat(result.Amount.Value, 64)
			if err != nil {
				return 0, errors.New("the cost report holds a non-numeric amount")
			}
			total += value
		}
	}
	return total, nil
}

func sumAnthropicCosts(body []byte) (float64, error) {
	var response struct {
		Data []struct {
			Results []struct {
				Amount   string `json:"amount"`
				Currency string `json:"currency"`
			} `json:"results"`
		} `json:"data"`
	}
	if err := common.Unmarshal(body, &response); err != nil {
		return 0, errors.New("the cost report was not valid JSON")
	}
	total := 0.0
	for _, bucket := range response.Data {
		for _, result := range bucket.Results {
			if !strings.EqualFold(result.Currency, "usd") {
				return 0, errors.New("the cost report is not in USD")
			}
			value, err := strconv.ParseFloat(result.Amount, 64)
			if err != nil {
				return 0, errors.New("the cost report holds a non-numeric amount")
			}
			total += value
		}
	}
	return total, nil
}
