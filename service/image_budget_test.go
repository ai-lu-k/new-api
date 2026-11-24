package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"math/rand"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/require"
)

// makeNoiseImage renders a seeded, incompressible raster so encoded payloads
// are big and byte-stable across runs.
func makeNoiseImage(width, height int) *image.NRGBA {
	src := image.NewNRGBA(image.Rect(0, 0, width, height))
	rnd := rand.New(rand.NewSource(42))
	for y := 0; y < height; y++ {
		off := src.PixOffset(0, y)
		for x := 0; x < width*4; x++ {
			src.Pix[off+x] = byte(rnd.Intn(256))
		}
	}
	return src
}

func pngBytes(t *testing.T, width, height int) []byte {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, makeNoiseImage(width, height)))
	return buf.Bytes()
}

func jpegBytes(t *testing.T, width, height int) []byte {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, jpeg.Encode(&buf, makeNoiseImage(width, height), &jpeg.Options{Quality: 100}))
	return buf.Bytes()
}

func animatedGifBytes(t *testing.T, width, height int) []byte {
	t.Helper()
	animation := &gif.GIF{}
	for i := 0; i < 2; i++ {
		animation.Image = append(animation.Image, makeNoisePaletted(width, height))
		animation.Delay = append(animation.Delay, 10)
	}
	var buf bytes.Buffer
	require.NoError(t, gif.EncodeAll(&buf, animation))
	return buf.Bytes()
}

// makeNoisePaletted renders a seeded, incompressible paletted frame for GIF.
func makeNoisePaletted(width, height int) *image.Paletted {
	palette := make(color.Palette, 256)
	for i := range palette {
		palette[i] = color.RGBA{R: byte(i), G: byte(255 - i), B: byte(i / 2), A: 255}
	}
	src := image.NewPaletted(image.Rect(0, 0, width, height), palette)
	rnd := rand.New(rand.NewSource(42))
	for y := 0; y < height; y++ {
		off := src.PixOffset(0, y)
		for x := 0; x < width; x++ {
			src.Pix[off+x] = byte(rnd.Intn(256))
		}
	}
	return src
}

func dataURL(mime string, raw []byte) string {
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(raw)
}

func imageMessage(raw []byte, mime string) dto.Message {
	return dto.Message{Role: "user", Content: []any{
		map[string]any{"type": "text", "text": "look"},
		map[string]any{"type": "image_url", "image_url": map[string]any{"url": dataURL(mime, raw), "detail": "high"}},
	}}
}

func textMessage(text string) dto.Message {
	return dto.Message{Role: "user", Content: text}
}

// imagePayloads returns the raw decoded payload bytes of every data-URL image.
func imagePayloads(t *testing.T, request *dto.GeneralOpenAIRequest) map[int][]byte {
	t.Helper()
	out := make(map[int][]byte)
	for i, message := range request.Messages {
		content, ok := message.Content.([]any)
		if !ok {
			continue
		}
		for _, item := range content {
			part, ok := item.(map[string]any)
			if !ok || part["type"] != dto.ContentTypeImageURL {
				continue
			}
			urlMap, ok := part["image_url"].(map[string]any)
			require.True(t, ok)
			url, _ := urlMap["url"].(string)
			if !strings.HasPrefix(url, "data:") {
				continue
			}
			idx := strings.Index(url, ";base64,")
			require.GreaterOrEqual(t, idx, 0)
			raw, err := base64.StdEncoding.DecodeString(url[idx+len(";base64,"):])
			require.NoError(t, err)
			out[i] = raw
		}
	}
	return out
}

func budgetInfo(budgetMB int) *relaycommon.RelayInfo {
	return &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{
		ChannelId:         22,
		UpstreamModelName: "test-model",
		ChannelSetting:    dto.ChannelSettings{ImageBudgetMB: budgetMB},
	}}
}

func TestApplyChatImageBudget(t *testing.T) {
	t.Parallel()

	t.Run("disabled budget leaves the request untouched", func(t *testing.T) {
		request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{imageMessage(pngBytes(t, 64, 64), "image/png")}}
		before := imagePayloads(t, request)

		require.NoError(t, ApplyChatImageBudget(context.Background(), budgetInfo(0), request))
		require.Equal(t, before, imagePayloads(t, request))
	})

	t.Run("under budget leaves the request untouched", func(t *testing.T) {
		request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{imageMessage(pngBytes(t, 64, 64), "image/png")}}
		before := imagePayloads(t, request)

		require.NoError(t, ApplyChatImageBudget(context.Background(), budgetInfo(10), request))
		require.Equal(t, before, imagePayloads(t, request))
	})

	t.Run("compresses oversized images deterministically", func(t *testing.T) {
		build := func() *dto.GeneralOpenAIRequest {
			request := &dto.GeneralOpenAIRequest{}
			for i := 0; i < 4; i++ {
				request.Messages = append(request.Messages, imageMessage(pngBytes(t, 500, 500), "image/png"))
			}
			return request
		}
		request := build()
		before := 0
		for _, payload := range imagePayloads(t, request) {
			before += len(payload)
		}

		require.NoError(t, ApplyChatImageBudget(context.Background(), budgetInfo(2), request))

		total := 0
		for _, payload := range imagePayloads(t, request) {
			total += len(payload)
		}
		require.LessOrEqual(t, total, 2*1024*1024)
		require.Less(t, total, before, "compression must shrink the payload")

		// Deterministic output: an identical request must produce identical bytes.
		second := build()
		require.NoError(t, ApplyChatImageBudget(context.Background(), budgetInfo(2), second))
		first := imagePayloads(t, request)
		replay := imagePayloads(t, second)
		require.Len(t, replay, len(first))
		for i := range first {
			require.Equal(t, first[i], replay[i])
		}
	})

	t.Run("drops oldest images and keeps the newest message", func(t *testing.T) {
		request := &dto.GeneralOpenAIRequest{}
		for i := 0; i < 8; i++ {
			request.Messages = append(request.Messages, imageMessage(jpegBytes(t, 300, 300), "image/jpeg"))
		}

		require.NoError(t, ApplyChatImageBudget(context.Background(), budgetInfo(1), request))

		total := 0
		dropped := 0
		for i, message := range request.Messages {
			content, ok := message.Content.([]any)
			require.True(t, ok)
			if payload, hasImage := imagePayloads(t, request)[i]; hasImage {
				total += len(payload)
				continue
			}
			require.Len(t, content, 2)
			text, _ := content[1].(map[string]any)
			require.Equal(t, dto.ContentTypeText, text["type"])
			require.Equal(t, imageDroppedPlaceholder, text["text"])
			dropped++
		}
		require.Positive(t, dropped)
		require.LessOrEqual(t, total, 1024*1024)

		// The newest message keeps its image untouched.
		last := request.Messages[len(request.Messages)-1]
		payload := imagePayloads(t, request)[len(request.Messages)-1]
		require.Equal(t, jpegBytes(t, 300, 300), payload)
		content, ok := last.Content.([]any)
		require.True(t, ok)
		urlMap := content[1].(map[string]any)["image_url"].(map[string]any)
		require.Equal(t, "high", urlMap["detail"])
	})

	t.Run("leaves remote image URLs alone", func(t *testing.T) {
		remote := "https://example.com/pic.png"
		request := &dto.GeneralOpenAIRequest{
			Messages: []dto.Message{
				{Role: "user", Content: []any{map[string]any{"type": "image_url", "image_url": map[string]any{"url": remote}}}},
				imageMessage(pngBytes(t, 500, 500), "image/png"),
			},
		}

		require.NoError(t, ApplyChatImageBudget(context.Background(), budgetInfo(1), request))

		content := request.Messages[0].Content.([]any)
		require.Equal(t, remote, content[0].(map[string]any)["image_url"].(map[string]any)["url"])
	})

	t.Run("accounting uses compressed sizes across phases", func(t *testing.T) {
		// Eight ~1MB PNGs against a 1MB budget: phase 1 compresses all of them
		// (~150KB JPEGs each), and the compressed total still exceeds the
		// budget, so phase 2 must drop the oldest — charged at their compressed
		// size, not the original bytes — until the request actually fits.
		request := &dto.GeneralOpenAIRequest{}
		for i := 0; i < 8; i++ {
			request.Messages = append(request.Messages, imageMessage(pngBytes(t, 500, 500), "image/png"))
		}

		require.NoError(t, ApplyChatImageBudget(context.Background(), budgetInfo(1), request))

		total := 0
		dropped := 0
		for i := range request.Messages {
			if payload, hasImage := imagePayloads(t, request)[i]; hasImage {
				total += len(payload)
				continue
			}
			dropped++
		}
		require.Positive(t, dropped, "phase 2 must drop despite phase 1 compression")
		require.LessOrEqual(t, total, 1024*1024, "final request must actually fit the budget")
	})

	t.Run("programmatic MediaContent slices are rewritten too", func(t *testing.T) {
		request := &dto.GeneralOpenAIRequest{}
		for i := 0; i < 3; i++ {
			request.Messages = append(request.Messages, dto.Message{Role: "user", Content: []dto.MediaContent{
				{Type: dto.ContentTypeImageURL, ImageUrl: map[string]any{"url": dataURL("image/jpeg", jpegBytes(t, 450, 450))}},
			}})
		}

		require.NoError(t, ApplyChatImageBudget(context.Background(), budgetInfo(1), request))

		old := request.Messages[0].Content.([]dto.MediaContent)
		require.Equal(t, dto.ContentTypeText, old[0].Type, "oldest image dropped")
		require.Equal(t, imageDroppedPlaceholder, old[0].Text)
		newest := request.Messages[1].Content.([]dto.MediaContent)
		require.Equal(t, dto.ContentTypeImageURL, newest[0].Type, "newest image kept")
	})

	t.Run("corrupt base64 payload is left untouched", func(t *testing.T) {
		corrupt := "data:image/png;base64,####not-base64####"
		request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{
			{Role: "user", Content: []any{map[string]any{"type": "image_url", "image_url": map[string]any{"url": corrupt}}}},
			imageMessage(pngBytes(t, 500, 500), "image/png"),
		}}

		require.NoError(t, ApplyChatImageBudget(context.Background(), budgetInfo(1), request))

		content := request.Messages[0].Content.([]any)
		require.Equal(t, corrupt, content[0].(map[string]any)["image_url"].(map[string]any)["url"])
	})

	t.Run("deep copy isolation and marshal visibility", func(t *testing.T) {
		orig := &dto.GeneralOpenAIRequest{Messages: []dto.Message{
			imageMessage(pngBytes(t, 64, 64), "image/png"), // will be url-replaced
			imageMessage(pngBytes(t, 64, 64), "image/png"), // will be dropped
		}}
		copied, err := common.DeepCopy(orig)
		require.NoError(t, err)

		// Mutate the copy the way ApplyChatImageBudget does.
		copied.Messages[0].Content.([]any)[1].(map[string]any)["image_url"].(map[string]any)["url"] =
			dataURL("image/jpeg", []byte("mutated"))
		copied.Messages[1].Content.([]any)[1] = map[string]any{"type": dto.ContentTypeText, "text": "dropped"}

		// The original request stays intact for later channel retries.
		for _, m := range orig.Messages {
			part := m.Content.([]any)[1].(map[string]any)
			url := part["image_url"].(map[string]any)["url"].(string)
			require.True(t, strings.HasPrefix(url, "data:image/png;base64,"))
		}

		// Mutations are visible in the marshaled copy; replace keeps detail.
		marshaled, err := json.Marshal(copied)
		require.NoError(t, err)
		require.Contains(t, string(marshaled), base64.StdEncoding.EncodeToString([]byte("mutated")))
		require.Contains(t, string(marshaled), "dropped")
		require.Equal(t, 1, strings.Count(string(marshaled), "detail"), "replaced image keeps detail, dropped one has none")

		origMarshaled, err := json.Marshal(orig)
		require.NoError(t, err)
		require.Equal(t, 2, strings.Count(string(origMarshaled), "detail"))
		require.NotContains(t, string(origMarshaled), base64.StdEncoding.EncodeToString([]byte("mutated")))
	})

	t.Run("animated gif is never re-encoded and a hopeless request fails clearly", func(t *testing.T) {
		animation := animatedGifBytes(t, 800, 800)
		require.Greater(t, len(animation), 1024*1024, "fixture must exceed the 1MB budget")

		request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{imageMessage(animation, "image/gif")}}
		err := ApplyChatImageBudget(context.Background(), budgetInfo(1), request)

		require.Error(t, err)
		require.Contains(t, err.Error(), "image budget of 1MB")
		require.Equal(t, animation, imagePayloads(t, request)[0])
	})
}
