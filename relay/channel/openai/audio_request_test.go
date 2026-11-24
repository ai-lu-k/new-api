package openai

import (
	"io"
	"net/http/httptest"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A speech request that carries a reference recording must reach the provider
// with that recording intact: the gateway re-serializes the parsed request, so
// any field missing from the DTO silently changes what the user asked for.
func speechInfo() *relaycommon.RelayInfo {
	return &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeAudioSpeech}
}

func TestConvertAudioRequestForwardsReferenceAudio(t *testing.T) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	adaptor := &Adaptor{}

	request := dto.AudioRequest{
		Model:           "heygen-voice-1",
		Input:           "你好",
		ResponseFormat:  "pcm",
		InputReferences: []byte(`[{"type":"input_audio","input_audio":{"data":"data:audio/wav;base64,UklGRg=="}}]`),
		Provider:        []byte(`{"options":{"heygen":{"language":"zh"}}}`),
	}

	body, err := adaptor.ConvertAudioRequest(c, speechInfo(), request)
	require.NoError(t, err)
	raw, err := io.ReadAll(body)
	require.NoError(t, err)

	assert.Contains(t, string(raw), `"input_references":[{"type":"input_audio"`)
	assert.Contains(t, string(raw), `"provider":{"options":{"heygen":{"language":"zh"}}}`)
	assert.Contains(t, string(raw), `"input":"你好"`)
}

// Without a reference recording the fields stay absent, so ordinary text to
// speech requests keep the exact shape providers already accept.
func TestConvertAudioRequestOmitsAbsentReferenceAudio(t *testing.T) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	adaptor := &Adaptor{}

	body, err := adaptor.ConvertAudioRequest(c, speechInfo(), dto.AudioRequest{Model: "heygen-voice-1", Input: "hi"})
	require.NoError(t, err)
	raw, err := io.ReadAll(body)
	require.NoError(t, err)

	assert.NotContains(t, string(raw), "input_references")
	assert.NotContains(t, string(raw), `"provider"`)
}
