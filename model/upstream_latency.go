package model

import (
	"context"
	"crypto/sha256"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/relaylatency"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Identity is the configured channel and the final, mapped upstream model.
// Hash keys avoid dialect/index-length restrictions without normalizing aliases.
func UpstreamLatencyKey(channelID int, upstreamModel string) string {
	return fmt.Sprintf("%x", sha256.Sum256(fmt.Appendf(nil, "%d\x00%s", channelID, upstreamModel)))
}

type UpstreamLatencyObservation struct {
	ID            string `gorm:"type:varchar(64);primaryKey"`
	FitKey        string `gorm:"type:varchar(64);index:idx_latency_window,priority:1"`
	ObservedAt    int64  `gorm:"index:idx_latency_window,priority:2;index"`
	ChannelID     int
	UpstreamModel string `gorm:"type:text"`
	Effort        string `gorm:"type:varchar(16)"`
	InputTokens   int
	ElapsedMS     int64
	Censored      bool
	Reason        string `gorm:"type:varchar(32)"`
	Reference     bool
}

// Versions are append-only. Failed training leaves the previous version intact;
// concurrent trainers publishing the same UTC instant are idempotent.
type UpstreamLatencyFunction struct {
	FitKey        string `gorm:"type:varchar(64);primaryKey"`
	Cutoff        int64  `gorm:"primaryKey;autoIncrement:false;index"`
	ChannelID     int
	UpstreamModel string `gorm:"type:text"`
	Parameters    string `gorm:"type:text"`
	Rejection     string `gorm:"type:text"`
}

func RecordUpstreamLatencyFitRejection(ctx context.Context, channel int, upstream string, cutoff int64, reason string) error {
	if len(reason) > 512 {
		reason = reason[:512]
	}
	row := UpstreamLatencyFunction{FitKey: UpstreamLatencyKey(channel, upstream), ChannelID: channel, UpstreamModel: upstream, Cutoff: cutoff, Rejection: reason}
	return DB.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error
}

func SaveUpstreamLatencyObservations(ctx context.Context, observations []UpstreamLatencyObservation) error {
	if len(observations) == 0 {
		return nil
	}
	for _, s := range observations {
		if len(s.ID) != 64 || s.ChannelID <= 0 || s.UpstreamModel == "" || len(s.UpstreamModel) > 200 || strings.ContainsAny(s.UpstreamModel, "\r\n") || s.InputTokens <= 0 || s.ElapsedMS <= 0 || s.ElapsedMS > 86400000 || s.FitKey != UpstreamLatencyKey(s.ChannelID, s.UpstreamModel) {
			return fmt.Errorf("invalid upstream latency observation")
		}
	}
	return DB.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).CreateInBatches(observations, 100).Error
}

func PublishUpstreamLatencyFunction(ctx context.Context, channel int, upstream string, cutoff int64, function relaylatency.Function) error {
	if channel <= 0 || upstream == "" || len(upstream) > 200 || cutoff <= 0 || function.Version != relaylatency.Version || function.TailScale <= 0 {
		return fmt.Errorf("invalid upstream latency function")
	}
	encoded, err := common.Marshal(function)
	if err != nil {
		return err
	}
	row := UpstreamLatencyFunction{FitKey: UpstreamLatencyKey(channel, upstream), ChannelID: channel, UpstreamModel: upstream, Cutoff: cutoff, Parameters: string(encoded)}
	result := DB.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&row)
	if result.Error != nil || result.RowsAffected > 0 {
		return result.Error
	}
	// A startup run can see a partially imported window. A later validated
	// result may replace that day's rejection, never a published function.
	return DB.WithContext(ctx).Model(&UpstreamLatencyFunction{}).Where("fit_key = ? AND cutoff = ? AND parameters = ?", row.FitKey, row.Cutoff, "").Updates(map[string]any{"parameters": row.Parameters, "rejection": ""}).Error
}

func LoadUpstreamLatencyFunctions(ctx context.Context, since int64) ([]UpstreamLatencyFunction, error) {
	var rows []UpstreamLatencyFunction
	err := DB.WithContext(ctx).Where("cutoff >= ?", since).Order("cutoff DESC").Limit(10000).Find(&rows).Error
	return rows, err
}

func UpstreamLatencyTrainingKeys(ctx context.Context, start, end int64) ([]UpstreamLatencyObservation, error) {
	var rows []UpstreamLatencyObservation
	err := DB.WithContext(ctx).Model(&UpstreamLatencyObservation{}).Select("fit_key, channel_id, upstream_model").Where("observed_at >= ? AND observed_at < ?", start, end).Group("fit_key, channel_id, upstream_model").Limit(2000).Find(&rows).Error
	return rows, err
}

func ReadUpstreamLatencySamples(ctx context.Context, key string, start, end int64, visit func([]UpstreamLatencyObservation)) error {
	var batch []UpstreamLatencyObservation
	return DB.WithContext(ctx).Where("fit_key = ? AND observed_at >= ? AND observed_at < ?", key, start, end).Order("id").FindInBatches(&batch, 500, func(_ *gorm.DB, _ int) error { visit(batch); return nil }).Error
}
