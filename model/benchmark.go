package model

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/benchmark"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var benchmarkOptionMutex sync.Mutex

var ErrBenchmarkMappingConflict = errors.New("benchmark mappings changed; reload before saving")

var ErrBenchmarkSnapshotConflict = errors.New("benchmark snapshot changed; reload before saving")

type BenchmarkMappings struct {
	Revision string            `json:"revision"`
	Models   []benchmark.Model `json:"models"`
}

// BenchmarkSnapshot is one modality's stored payload with the revision it was
// read at; an editor must send that revision back when saving.
type BenchmarkSnapshot struct {
	Revision string `json:"revision"`
	Value    string `json:"value"`
}

// BenchmarkSnapshots is the admin view of both stored payloads.
type BenchmarkSnapshots struct {
	Text  BenchmarkSnapshot `json:"text"`
	Image BenchmarkSnapshot `json:"image"`
}

// InitializeBenchmarkMappings imports defaults once. Restarts never overwrite
// operator edits, including an intentionally empty registry.
func InitializeBenchmarkMappings() error {
	benchmarkOptionMutex.Lock()
	defer benchmarkOptionMutex.Unlock()
	option := Option{Key: benchmark.MappingsOptionKey, Value: benchmark.DefaultMappingsJSON()}
	if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&option).Error; err != nil {
		return err
	}
	return syncBenchmarkMappings()
}

func SyncBenchmarkMappings() error {
	benchmarkOptionMutex.Lock()
	defer benchmarkOptionMutex.Unlock()
	return syncBenchmarkMappings()
}

func syncBenchmarkMappings() error {
	var option Option
	if err := DB.Where(Option{Key: benchmark.MappingsOptionKey}).First(&option).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	return benchmark.Default.SetMappings(option.Value)
}

func GetBenchmarkMappings() (BenchmarkMappings, error) {
	var option Option
	if err := DB.Where(Option{Key: benchmark.MappingsOptionKey}).First(&option).Error; err != nil {
		return BenchmarkMappings{}, err
	}
	models, err := benchmark.ParseMappings(option.Value)
	return BenchmarkMappings{Revision: optionValueRevision(option.Value), Models: models}, err
}

// SaveBenchmarkMapping updates one identity while checking the editor's revision.
// A shared row lock serializes edits across instances; SQLite serializes writers.
func SaveBenchmarkMapping(revision string, mapping *benchmark.Model, deleteID string) error {
	if revision == "" || (mapping == nil && deleteID == "") || (mapping != nil && deleteID != "") {
		return fmt.Errorf("%w: provide a revision and either a mapping or a deletion", benchmark.ErrInvalidMappings)
	}
	benchmarkOptionMutex.Lock()
	defer benchmarkOptionMutex.Unlock()
	err := DB.Transaction(func(tx *gorm.DB) error {
		var option Option
		if err := lockForUpdate(tx).Where(Option{Key: benchmark.MappingsOptionKey}).First(&option).Error; err != nil {
			return err
		}
		if optionValueRevision(option.Value) != revision {
			return ErrBenchmarkMappingConflict
		}
		models, err := benchmark.ParseMappings(option.Value)
		if err != nil {
			return err
		}
		updated := make([]benchmark.Model, 0, len(models)+1)
		found := false
		for _, existing := range models {
			if mapping != nil && existing.ID == mapping.ID {
				updated = append(updated, *mapping)
				found = true
			} else if existing.ID != deleteID {
				updated = append(updated, existing)
			}
		}
		if mapping != nil && !found {
			updated = append(updated, *mapping)
		}
		encoded, err := common.Marshal(updated)
		if err != nil {
			return err
		}
		validated, err := benchmark.ParseMappings(string(encoded))
		if err != nil {
			return err
		}
		encoded, err = common.Marshal(validated)
		if err != nil {
			return err
		}
		return tx.Model(&Option{}).Where(Option{Key: benchmark.MappingsOptionKey}).Update("value", string(encoded)).Error
	})
	if err != nil {
		return err
	}
	return syncBenchmarkMappings()
}

// InitializeBenchmarkSnapshots creates empty snapshots when missing, then
// publishes the stored ones. Restarts never overwrite operator edits.
func InitializeBenchmarkSnapshots() error {
	benchmarkOptionMutex.Lock()
	defer benchmarkOptionMutex.Unlock()
	options := []Option{
		{Key: benchmark.TextSnapshotOptionKey, Value: benchmark.DefaultTextSnapshotJSON()},
		{Key: benchmark.ImageSnapshotOptionKey, Value: benchmark.DefaultImageSnapshotJSON()},
	}
	if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&options).Error; err != nil {
		return err
	}
	if err := syncBenchmarkSnapshots(); err != nil {
		// A stored payload the cache rejects must not block startup; the
		// published payloads keep serving until an operator saves a valid one.
		common.SysError("failed to sync benchmark snapshots: " + err.Error())
	}
	return nil
}

// SyncBenchmarkSnapshots republishes the stored payloads, so edits saved by
// another instance become visible here.
func SyncBenchmarkSnapshots() error {
	benchmarkOptionMutex.Lock()
	defer benchmarkOptionMutex.Unlock()
	return syncBenchmarkSnapshots()
}

func syncBenchmarkSnapshots() error {
	text, err := benchmarkSnapshotOption(benchmark.TextSnapshotOptionKey)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil // initialization inserts both rows
		}
		return err
	}
	image, err := benchmarkSnapshotOption(benchmark.ImageSnapshotOptionKey)
	if err != nil {
		return err
	}
	return benchmark.Default.SetSnapshots(text.Value, image.Value)
}

func benchmarkSnapshotOption(key string) (Option, error) {
	var option Option
	err := DB.Where(Option{Key: key}).First(&option).Error
	return option, err
}

// optionValueRevision is the revision an editor must send back: the hash of the
// stored value, so a concurrent save is detected instead of silently merged.
func optionValueRevision(value string) string {
	return fmt.Sprintf("%x", sha256.Sum256([]byte(value)))
}

func GetBenchmarkSnapshots() (BenchmarkSnapshots, error) {
	text, err := benchmarkSnapshotOption(benchmark.TextSnapshotOptionKey)
	if err != nil {
		return BenchmarkSnapshots{}, err
	}
	image, err := benchmarkSnapshotOption(benchmark.ImageSnapshotOptionKey)
	if err != nil {
		return BenchmarkSnapshots{}, err
	}
	return BenchmarkSnapshots{
		Text:  BenchmarkSnapshot{Revision: optionValueRevision(text.Value), Value: text.Value},
		Image: BenchmarkSnapshot{Revision: optionValueRevision(image.Value), Value: image.Value},
	}, nil
}

// SaveBenchmarkSnapshot replaces one modality's payload while checking the
// editor's revision. A shared row lock serializes edits across instances;
// SQLite serializes writers. The payload is validated together with the stored
// other modality, and published only after the transaction commits.
func SaveBenchmarkSnapshot(modality, revision, value string) error {
	var key, otherKey string
	switch modality {
	case "text":
		key, otherKey = benchmark.TextSnapshotOptionKey, benchmark.ImageSnapshotOptionKey
	case "image":
		key, otherKey = benchmark.ImageSnapshotOptionKey, benchmark.TextSnapshotOptionKey
	default:
		return fmt.Errorf("%w: unknown modality %q", benchmark.ErrInvalidSnapshots, modality)
	}
	if revision == "" || value == "" {
		return fmt.Errorf("%w: provide a revision and a payload", benchmark.ErrInvalidSnapshots)
	}
	benchmarkOptionMutex.Lock()
	defer benchmarkOptionMutex.Unlock()
	err := DB.Transaction(func(tx *gorm.DB) error {
		var option Option
		if err := lockForUpdate(tx).Where(Option{Key: key}).First(&option).Error; err != nil {
			return err
		}
		if optionValueRevision(option.Value) != revision {
			return ErrBenchmarkSnapshotConflict
		}
		var other Option
		if err := tx.Where(Option{Key: otherKey}).First(&other).Error; err != nil {
			return err
		}
		text, image := value, other.Value
		if modality == "image" {
			text, image = other.Value, value
		}
		if err := benchmark.ValidateSnapshots(text, image); err != nil {
			return err
		}
		return tx.Model(&Option{}).Where(Option{Key: key}).Update("value", value).Error
	})
	if err != nil {
		return err
	}
	return syncBenchmarkSnapshots()
}
