package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/benchmark"
	"github.com/gin-gonic/gin"
)

func GetBenchmarkScores(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"success": true, "data": benchmark.Default.Get()})
}

func GetBenchmarkMappings(c *gin.Context) {
	data, err := model.GetBenchmarkMappings()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to load benchmark mappings"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"revision": data.Revision, "models": data.Models, "sources": benchmark.Default.SourceNames()}})
}

func SaveBenchmarkMapping(c *gin.Context) {
	var request struct {
		Revision string           `json:"revision"`
		Model    *benchmark.Model `json:"model"`
		DeleteID string           `json:"delete_id"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20)
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid benchmark mapping"})
		return
	}
	if err := model.SaveBenchmarkMapping(request.Revision, request.Model, request.DeleteID); err != nil {
		status := http.StatusInternalServerError
		message := "Failed to save benchmark mappings"
		if errors.Is(err, model.ErrBenchmarkMappingConflict) {
			status, message = http.StatusConflict, err.Error()
		} else if errors.Is(err, benchmark.ErrInvalidMappings) {
			status, message = http.StatusBadRequest, err.Error()
		}
		c.JSON(status, gin.H{"success": false, "message": message})
		return
	}
	GetBenchmarkMappings(c)
}

// GetBenchmarkSnapshot returns both stored payloads with the revision each was
// read at: {"text":{"revision":"…","value":"…"},"image":{"revision":"…","value":"…"}}.
// The value is the exact JSON an editor sends back to SaveBenchmarkSnapshot.
func GetBenchmarkSnapshot(c *gin.Context) {
	data, err := model.GetBenchmarkSnapshots()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to load benchmark snapshots"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

func SaveBenchmarkSnapshot(c *gin.Context) {
	var request struct {
		Modality string `json:"modality"`
		Revision string `json:"revision"`
		Value    string `json:"value"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4<<20)
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid benchmark snapshot"})
		return
	}
	if err := model.SaveBenchmarkSnapshot(request.Modality, request.Revision, request.Value); err != nil {
		status := http.StatusInternalServerError
		message := "Failed to save benchmark snapshot"
		if errors.Is(err, model.ErrBenchmarkSnapshotConflict) {
			status, message = http.StatusConflict, err.Error()
		} else if errors.Is(err, benchmark.ErrInvalidSnapshots) {
			status, message = http.StatusBadRequest, err.Error()
		}
		c.JSON(status, gin.H{"success": false, "message": message})
		return
	}
	GetBenchmarkSnapshot(c)
}
