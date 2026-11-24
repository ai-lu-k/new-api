package controller

import (
	"context"
	"net/http"
	"os"
	"slices"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/benchmark"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const sampleBenchmarkText = `{"source_url":"https://benchmark.example.test/text",
  "license_url":"https://benchmark.example.test/terms","version":"Example results","updated_at":"2026-01-01",
  "dimensions":[{"id":"overall","label_key":"Overall"}],
  "models":[{"id":"example-evaluation","aliases":["example-evaluation"],"highest_tier":"default",
    "tiers":[{"id":"default","source_name":"Example evaluation","scores":{"overall":{"rating":42,"date":"2026-01-01"}}}]}]}`
const sampleBenchmarkMappings = `[{"id":"example-model","aliases":["example-discount"],"highest_tier":"high",
  "tiers":[{"id":"high","source_name":"Example evaluation"}]}]`

func TestBenchmarkMappingDatabaseMatrix(t *testing.T) {
	for _, dialect := range []struct{ name, env string }{{"sqlite", ""}, {"mysql", "TEST_MYSQL_DSN"}, {"postgres", "TEST_POSTGRES_DSN"}} {
		t.Run(dialect.name, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env + " to run this database")
			}
			db, _ := newAuditTestDatabase(t, dialect.name, os.Getenv(dialect.env))
			previousDB, previousCache := model.DB, benchmark.Default
			previousType := common.MainDatabaseType()
			model.DB, benchmark.Default = db, benchmark.NewCache()
			common.SetMainDatabaseType(common.DatabaseType(dialect.name))
			t.Cleanup(func() {
				model.DB, benchmark.Default = previousDB, previousCache
				common.SetMainDatabaseType(previousType)
			})
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			benchmark.Default.Start(ctx)
			require.NoError(t, db.AutoMigrate(&model.Option{}))
			// Existing option rows represent the unchanged, previously released schema.
			require.NoError(t, db.Create(&model.Option{Key: "ExistingOption", Value: "preserve"}).Error)
			require.NoError(t, db.Create(&model.Option{Key: benchmark.MappingsOptionKey, Value: sampleBenchmarkMappings}).Error)
			require.NoError(t, db.Create(&model.Option{Key: benchmark.TextSnapshotOptionKey, Value: sampleBenchmarkText}).Error)
			require.NoError(t, model.InitializeBenchmarkSnapshots())
			for range 2 {
				require.NoError(t, model.InitializeBenchmarkMappings())
			}
			var version string
			query := "SELECT version()"
			if dialect.name == "sqlite" {
				query = "SELECT sqlite_version()"
			}
			require.NoError(t, db.Raw(query).Scan(&version).Error)
			t.Logf("database version: %s", version)

			var response struct {
				Success bool                    `json:"success"`
				Data    model.BenchmarkMappings `json:"data"`
			}
			recorder := modelManagementRequest(t, GetBenchmarkMappings, http.MethodGet, "/api/models/benchmark", nil, &response)
			require.Equal(t, http.StatusOK, recorder.Code)
			require.True(t, response.Success)
			require.NotEmpty(t, response.Data.Revision)
			initialRevision := response.Data.Revision
			var mappedModel benchmark.Model
			for _, item := range response.Data.Models {
				if item.ID == "example-model" {
					mappedModel = item
				}
			}
			require.NotEmpty(t, mappedModel.ID)
			mappedModel.Aliases = []string{"custom-discount"}
			// Administrators can associate identities, but cannot fabricate ratings.
			mappedModel.Tiers[0].Scores = map[string]benchmark.Score{"overall": {Rating: 100, Date: "fake"}}
			recorder = modelManagementRequest(t, SaveBenchmarkMapping, http.MethodPut, "/api/models/benchmark", map[string]any{"revision": initialRevision, "model": mappedModel}, &response)
			require.Equal(t, http.StatusOK, recorder.Code)
			require.True(t, response.Success)
			assert.NotEqual(t, initialRevision, response.Data.Revision)
			var public struct {
				Data benchmark.Snapshot `json:"data"`
			}
			modelManagementRequest(t, GetBenchmarkScores, http.MethodGet, "/api/benchmark", nil, &public)
			require.Len(t, public.Data.Models, 1)
			assert.Equal(t, mappedModel.ID, public.Data.Models[0].ID)
			assert.Equal(t, []string{"custom-discount"}, public.Data.Models[0].Aliases)
			assert.Equal(t, 42.0, public.Data.Models[0].Tiers[0].Scores["overall"].Rating)
			savedRevision := response.Data.Revision
			recorder = modelManagementRequest(t, SaveBenchmarkMapping, http.MethodPut, "/api/models/benchmark", map[string]any{"revision": initialRevision, "model": mappedModel}, nil)
			assert.Equal(t, http.StatusConflict, recorder.Code, "stale editors must not overwrite another save")
			invalid := mappedModel
			invalid.ID = "different-model"
			recorder = modelManagementRequest(t, SaveBenchmarkMapping, http.MethodPut, "/api/models/benchmark", map[string]any{"revision": savedRevision, "model": invalid}, nil)
			assert.Equal(t, http.StatusBadRequest, recorder.Code, "an alias must not identify two models")
			unchanged, err := model.GetBenchmarkMappings()
			require.NoError(t, err)
			assert.Equal(t, savedRevision, unchanged.Revision, "failed writes must leave the registry intact")
			assert.Error(t, model.UpdateOption(benchmark.MappingsOptionKey, "[]"))
			assert.Error(t, model.UpdateOptionsBulk(map[string]string{benchmark.MappingsOptionKey: "[]"}))

			// Restart with a fresh in-memory cache, retaining database edits.
			benchmark.Default = benchmark.NewCache()
			benchmark.Default.Start(ctx)
			for range 2 {
				require.NoError(t, model.InitializeBenchmarkMappings())
			}
			reloaded, err := model.GetBenchmarkMappings()
			require.NoError(t, err)
			assert.Equal(t, savedRevision, reloaded.Revision)
			recorder = modelManagementRequest(t, SaveBenchmarkMapping, http.MethodPut, "/api/models/benchmark", map[string]any{"revision": reloaded.Revision, "delete_id": mappedModel.ID}, &response)
			require.Equal(t, http.StatusOK, recorder.Code)
			require.NoError(t, model.InitializeBenchmarkMappings())
			for _, item := range benchmark.Default.Get().Models {
				assert.NotEqual(t, mappedModel.ID, item.ID, "deletions must survive initialization")
			}
			var existing model.Option
			require.NoError(t, db.Where(model.Option{Key: "ExistingOption"}).First(&existing).Error)
			assert.Equal(t, "preserve", existing.Value)
		})
	}
}

func TestBenchmarkSnapshotDatabaseMatrix(t *testing.T) {
	for _, dialect := range []struct{ name, env string }{{"sqlite", ""}, {"mysql", "TEST_MYSQL_DSN"}, {"postgres", "TEST_POSTGRES_DSN"}} {
		t.Run(dialect.name, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env + " to run this database")
			}
			db, _ := newAuditTestDatabase(t, dialect.name, os.Getenv(dialect.env))
			previousDB, previousCache := model.DB, benchmark.Default
			previousType := common.MainDatabaseType()
			model.DB, benchmark.Default = db, benchmark.NewCache()
			common.SetMainDatabaseType(common.DatabaseType(dialect.name))
			t.Cleanup(func() {
				model.DB, benchmark.Default = previousDB, previousCache
				common.SetMainDatabaseType(previousType)
			})
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			benchmark.Default.Start(ctx)
			require.NoError(t, db.AutoMigrate(&model.Option{}))
			for range 2 {
				require.NoError(t, model.InitializeBenchmarkSnapshots())
			}

			var response struct {
				Success bool                     `json:"success"`
				Data    model.BenchmarkSnapshots `json:"data"`
			}
			recorder := modelManagementRequest(t, GetBenchmarkSnapshot, http.MethodGet, "/api/models/benchmark/snapshot", nil, &response)
			require.Equal(t, http.StatusOK, recorder.Code)
			require.True(t, response.Success)
			initial := response.Data
			require.NotEmpty(t, initial.Text.Revision)
			require.NotEmpty(t, initial.Image.Revision)
			assert.JSONEq(t, `{"dimensions":[],"models":[]}`, initial.Text.Value)
			assert.JSONEq(t, `{"dimensions":[],"models":[]}`, initial.Image.Value)
			assert.Empty(t, benchmark.Default.Get().Models)

			require.NoError(t, db.Create(&model.Option{Key: benchmark.MappingsOptionKey, Value: sampleBenchmarkMappings}).Error)
			require.NoError(t, model.InitializeBenchmarkMappings())

			// Import synthetic text scores while the image snapshot is empty.
			var text benchmark.Snapshot
			require.NoError(t, common.UnmarshalJsonStr(sampleBenchmarkText, &text))
			text.Models[0].Tiers[0].Scores["overall"] = benchmark.Score{Rating: 12.5, Date: "2026-01-01"}
			value, err := common.Marshal(text)
			require.NoError(t, err)

			recorder = modelManagementRequest(t, SaveBenchmarkSnapshot, http.MethodPut, "/api/models/benchmark/snapshot", map[string]any{"modality": "text", "revision": initial.Text.Revision, "value": string(value)}, &response)
			require.Equal(t, http.StatusOK, recorder.Code)
			assert.Equal(t, initial.Image.Revision, response.Data.Image.Revision, "a text save must not rewrite the image payload")
			savedRevision := response.Data.Text.Revision
			assert.NotEqual(t, initial.Text.Revision, savedRevision)

			var public struct {
				Data benchmark.Snapshot `json:"data"`
			}
			modelManagementRequest(t, GetBenchmarkScores, http.MethodGet, "/api/benchmark", nil, &public)
			assert.True(t, slices.ContainsFunc(public.Data.Models, func(item benchmark.Model) bool {
				return slices.ContainsFunc(item.Tiers, func(tier benchmark.Tier) bool { return tier.Scores["overall"].Rating == 12.5 })
			}), "a saved snapshot rating must be published without a restart")

			// A stale editor must not overwrite the newer payload.
			recorder = modelManagementRequest(t, SaveBenchmarkSnapshot, http.MethodPut, "/api/models/benchmark/snapshot", map[string]any{"modality": "text", "revision": initial.Text.Revision, "value": string(value)}, nil)
			assert.Equal(t, http.StatusConflict, recorder.Code)
			// Rejected payloads and unknown modalities never reach the row.
			recorder = modelManagementRequest(t, SaveBenchmarkSnapshot, http.MethodPut, "/api/models/benchmark/snapshot", map[string]any{"modality": "text", "revision": savedRevision, "value": `{"source_url":""}`}, nil)
			assert.Equal(t, http.StatusBadRequest, recorder.Code)
			recorder = modelManagementRequest(t, SaveBenchmarkSnapshot, http.MethodPut, "/api/models/benchmark/snapshot", map[string]any{"modality": "video", "revision": savedRevision, "value": string(value)}, nil)
			assert.Equal(t, http.StatusBadRequest, recorder.Code)
			assert.Error(t, model.UpdateOption(benchmark.TextSnapshotOptionKey, string(value)), "the generic option endpoint must not bypass validation")
			unchanged, err := model.GetBenchmarkSnapshots()
			require.NoError(t, err)
			assert.Equal(t, savedRevision, unchanged.Text.Revision, "failed writes must leave the payload intact")

			// Restarts never overwrite an edited payload.
			benchmark.Default = benchmark.NewCache()
			benchmark.Default.Start(ctx)
			for range 2 {
				require.NoError(t, model.InitializeBenchmarkSnapshots())
				require.NoError(t, model.InitializeBenchmarkMappings())
			}
			reloaded, err := model.GetBenchmarkSnapshots()
			require.NoError(t, err)
			assert.Equal(t, savedRevision, reloaded.Text.Revision, "initialization must retain an edited snapshot")
			assert.True(t, slices.ContainsFunc(benchmark.Default.Get().Models, func(item benchmark.Model) bool {
				return slices.ContainsFunc(item.Tiers, func(tier benchmark.Tier) bool { return tier.Scores["overall"].Rating == 12.5 })
			}), "a restart must serve the edited snapshot")
		})
	}
}
