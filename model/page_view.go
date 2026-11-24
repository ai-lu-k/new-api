package model

import (
	"regexp"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	// PageViewRankDays is the rolling window used for the popularity ranking.
	PageViewRankDays = 7
	// pageViewRetentionDays keeps only the rows the ranking can still reach,
	// with a margin so a stale process cannot shrink the window.
	pageViewRetentionDays = 30
	pageViewMaxKeyLen     = 128
	pageViewDayLayout     = "2006-01-02"
)

// A page key is a route path without query strings, ids, or user data.
var pageViewKeyPattern = regexp.MustCompile(`^/[A-Za-z0-9/_-]*$`)

// PageViewDaily counts how often one page was opened on one day. Only the
// stable page key is stored: no query strings, resource ids, or user identity,
// so the table cannot be used to reconstruct what a person looked at.
type PageViewDaily struct {
	Id      int    `json:"id"`
	Page    string `json:"page" gorm:"type:varchar(128);not null;uniqueIndex:idx_page_view_daily_page_day"`
	ViewDay string `json:"view_day" gorm:"type:varchar(10);not null;uniqueIndex:idx_page_view_daily_page_day"`
	Views   int64  `json:"views" gorm:"not null;default:0"`
}

func (PageViewDaily) TableName() string {
	return "page_view_daily"
}

// PageViewTotal is one row of the aggregated ranking.
type PageViewTotal struct {
	Page  string `json:"page"`
	Views int64  `json:"views"`
}

// IsValidPageViewKey reports whether a value can be stored as a page key.
// The narrow alphabet keeps query strings, fragments, and ids out.
func IsValidPageViewKey(page string) bool {
	return len(page) <= pageViewMaxKeyLen && pageViewKeyPattern.MatchString(page)
}

// RecordPageView adds one visit to the page's counter for the given day.
func RecordPageView(page string, now time.Time) error {
	err := DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "page"}, {Name: "view_day"}},
		// PostgreSQL treats a bare "views" in the SET clause as ambiguous
		// against the inserted row, so the target column is table-qualified.
		DoUpdates: clause.Assignments(map[string]any{"views": gorm.Expr("page_view_daily.views + 1")}),
	}).Create(&PageViewDaily{Page: page, ViewDay: now.Format(pageViewDayLayout), Views: 1}).Error
	if err != nil {
		return err
	}
	prunePageViewsOnceADay(now)
	return nil
}

// PopularPageViews returns the most visited pages inside the rolling window
// ending at now. Equal counts fall back to the page key so the order is stable.
func PopularPageViews(now time.Time, limit int) ([]PageViewTotal, error) {
	since := now.AddDate(0, 0, -(PageViewRankDays - 1)).Format(pageViewDayLayout)
	totals := make([]PageViewTotal, 0, limit)
	err := DB.Model(&PageViewDaily{}).
		Select("page, SUM(views) AS views").
		Where("view_day >= ?", since).
		Group("page").
		Order("SUM(views) DESC").
		Order("page ASC").
		Limit(limit).
		Scan(&totals).Error
	return totals, err
}

var pageViewPrune struct {
	sync.Mutex
	day string
}

// prunePageViewsOnceADay drops expired rows at most once per process per day,
// so the table stays bounded without adding a write to every page view.
func prunePageViewsOnceADay(now time.Time) {
	day := now.Format(pageViewDayLayout)
	pageViewPrune.Lock()
	alreadyPruned := pageViewPrune.day == day
	pageViewPrune.day = day
	pageViewPrune.Unlock()
	if alreadyPruned {
		return
	}
	cutoff := now.AddDate(0, 0, -pageViewRetentionDays).Format(pageViewDayLayout)
	if err := DB.Where("view_day < ?", cutoff).Delete(&PageViewDaily{}).Error; err != nil {
		common.SysError("failed to prune page views: " + err.Error())
	}
}
