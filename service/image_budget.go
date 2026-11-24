package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"math"
	"strings"

	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"

	_ "image/png"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

// A channel-level image budget keeps chat-completions requests inside an
// upstream body-size limit (several gateways answer oversized bodies with an
// opaque 413). The budget applies to data-URL images only: those are the
// payloads that inflate the request body. Remote http(s) image URLs are left
// untouched because the upstream fetches them itself.
//
// Treatment order when the budget is exceeded:
//  1. Re-encode oversized raster images in place (downscale to the pixel cap,
//     then a deterministic JPEG quality ladder). Deterministic so the same
//     input always yields the same bytes, keeping retries and prompt caches
//     stable.
//  2. Replace the oldest images (never the newest message's) with a text
//     placeholder until the request fits.
//  3. As a last resort re-encode the newest message's images with a tighter
//     cap. If the request still does not fit, fail with a message that names
//     the actual problem instead of forwarding a 413 the client cannot act on.
const (
	imageBudgetPerImageTargetBytes   = 512 * 1024
	imageBudgetPixelCap              = 1024 * 1024
	imageBudgetLastResortPixelCap    = 384 * 384
	imageBudgetLastResortTargetBytes = 160 * 1024
	imageDroppedPlaceholder          = "[earlier image removed to fit the request size limit]"
)

// imageBudgetJpegQualities is the re-encode ladder, highest quality first.
var imageBudgetJpegQualities = [4]int{80, 62, 46, 32}

// imageOccurrence points at one data-URL image inside a message's content
// slice. Mutating through it rewrites the original request (already a deep
// copy owned by the relay handler). payload tracks the bytes currently in the
// request: re-encoding swaps the URL and must update it, or later phases would
// account dropped images at their original size.
type imageOccurrence struct {
	message *dto.Message
	mime    string
	payload []byte
	// onDrop replaces the whole content part with the placeholder text.
	onDrop func()
	// onReplace swaps the data URL for a re-encoded one.
	onReplace func(dataURL string)
}

// ApplyChatImageBudget enforces the channel image budget on a chat-completions
// request. The request must be a disposable copy; images are rewritten in
// place. A zero budget (the default) leaves the request untouched.
func ApplyChatImageBudget(ctx context.Context, info *relaycommon.RelayInfo, request *dto.GeneralOpenAIRequest) error {
	if request == nil || info.ChannelSetting.ImageBudgetMB <= 0 {
		return nil
	}
	budget := info.ChannelSetting.ImageBudgetMB * 1024 * 1024
	images := collectImageOccurrences(request.Messages)
	total := 0
	for _, img := range images {
		total += len(img.payload)
	}
	if total <= budget {
		return nil
	}
	before := total

	// Phase 1: re-encode oversized rasters in place, oldest to newest.
	compressed := 0
	for _, img := range images {
		if total <= budget {
			break
		}
		raw, mime, changed := compressDataImage(img.mime, img.payload, imageBudgetPixelCap, imageBudgetPerImageTargetBytes)
		if !changed {
			continue
		}
		total += len(raw) - len(img.payload)
		img.onReplace(buildDataURL(mime, raw))
		img.mime, img.payload = mime, raw
		compressed++
	}

	// Phase 2: drop the oldest images, never the newest message's.
	dropped := 0
	if total > budget {
		newest := lastMessage(request.Messages)
		for _, img := range images {
			if total <= budget {
				break
			}
			if img.message == newest {
				continue
			}
			img.onDrop()
			total -= len(img.payload)
			dropped++
		}
	}

	// Phase 3: squeeze the newest message's images, then give up with a clear
	// error instead of forwarding an opaque upstream 413.
	if total > budget {
		newest := lastMessage(request.Messages)
		for _, img := range images {
			if total <= budget {
				break
			}
			if img.message != newest {
				continue
			}
			raw, mime, changed := compressDataImage(img.mime, img.payload, imageBudgetLastResortPixelCap, imageBudgetLastResortTargetBytes)
			if !changed {
				continue
			}
			total += len(raw) - len(img.payload)
			img.onReplace(buildDataURL(mime, raw))
			img.mime, img.payload = mime, raw
			compressed++
		}
	}
	logger.LogInfo(ctx, fmt.Sprintf("image budget (channel %d, model %s): %d images %.2fMB -> %.2fMB (budget %dMB), compressed %d, dropped %d",
		info.ChannelId, info.UpstreamModelName, len(images), float64(before)/(1024*1024), float64(total)/(1024*1024), info.ChannelSetting.ImageBudgetMB, compressed, dropped))
	if total > budget {
		return fmt.Errorf("request still exceeds the channel image budget of %dMB after compressing and dropping images; please remove some images or shorten the history", info.ChannelSetting.ImageBudgetMB)
	}
	return nil
}

func lastMessage(messages []dto.Message) *dto.Message {
	if len(messages) == 0 {
		return nil
	}
	return &messages[len(messages)-1]
}

// collectImageOccurrences walks every message content slice and returns the
// data-URL images in request order. Content arrives as []any of maps straight
// from JSON decoding; a []MediaContent slice (set programmatically) is handled
// the same way so both shapes stay editable.
func collectImageOccurrences(messages []dto.Message) []*imageOccurrence {
	var result []*imageOccurrence
	for mi := range messages {
		message := &messages[mi]
		switch content := message.Content.(type) {
		case []any:
			for ci, item := range content {
				part, ok := item.(map[string]any)
				if !ok || part["type"] != dto.ContentTypeImageURL {
					continue
				}
				img := parseImageMap(part["image_url"])
				if img == nil {
					continue
				}
				occ := &imageOccurrence{message: message, mime: img.mime, payload: img.payload}
				occ.onReplace = func(dataURL string) {
					if urlMap, ok := part["image_url"].(map[string]any); ok {
						urlMap["url"] = dataURL
						return
					}
					part["image_url"] = map[string]any{"url": dataURL}
				}
				occ.onDrop = func() { content[ci] = map[string]any{"type": dto.ContentTypeText, "text": imageDroppedPlaceholder} }
				result = append(result, occ)
			}
		case []dto.MediaContent:
			for ci, mediaPart := range content {
				if mediaPart.Type != dto.ContentTypeImageURL {
					continue
				}
				img := parseImageMap(mediaPart.ImageUrl)
				if img == nil {
					continue
				}
				occ := &imageOccurrence{message: message, mime: img.mime, payload: img.payload}
				switch field := mediaPart.ImageUrl.(type) {
				case *dto.MessageImageUrl:
					occ.onReplace = func(dataURL string) { field.Url = dataURL }
				case map[string]any:
					occ.onReplace = func(dataURL string) { field["url"] = dataURL }
				default:
					continue
				}
				occ.onDrop = func() { content[ci] = dto.MediaContent{Type: dto.ContentTypeText, Text: imageDroppedPlaceholder} }
				result = append(result, occ)
			}
		}
	}
	return result
}

type parsedImage struct {
	mime    string
	payload []byte
}

func parseImageMap(field any) *parsedImage {
	switch v := field.(type) {
	case map[string]any:
		url, _ := v["url"].(string)
		return parseDataURL(url)
	case *dto.MessageImageUrl:
		return parseDataURL(v.Url)
	case dto.MessageImageUrl:
		return parseDataURL(v.Url)
	default:
		return nil
	}
}

// parseDataURL decodes "data:<mime>;base64,<payload>". Anything else (remote
// URLs, percent-encoded data URLs, empty values) returns nil and stays
// untouched.
func parseDataURL(url string) *parsedImage {
	if !strings.HasPrefix(url, "data:") {
		return nil
	}
	idx := strings.Index(url, ";base64,")
	if idx < 0 {
		return nil
	}
	mime := url[len("data:"):idx]
	if mime == "" {
		mime = "application/octet-stream"
	}
	payload, err := base64.StdEncoding.DecodeString(url[idx+len(";base64,"):])
	if err != nil {
		payload, err = base64.RawStdEncoding.DecodeString(url[idx+len(";base64,"):])
		if err != nil {
			return nil
		}
	}
	return &parsedImage{mime: mime, payload: payload}
}

func buildDataURL(mime string, raw []byte) string {
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(raw)
}

// compressDataImage downscales one image to fit pixelCap and re-encodes it as
// JPEG at the first ladder quality that fits byteTarget. Animated images and
// anything that fails to decode come back unchanged; callers then fall through
// to dropping. The output is deterministic for a given input.
func compressDataImage(mime string, raw []byte, pixelCap, byteTarget int) ([]byte, string, bool) {
	if animatedDataImage(mime, raw) {
		return nil, "", false
	}
	src, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, "", false
	}
	bounds := src.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width <= 0 || height <= 0 {
		return nil, "", false
	}
	if width*height <= pixelCap && len(raw) <= byteTarget {
		return nil, "", false
	}
	dstWidth, dstHeight := width, height
	if width*height > pixelCap {
		scale := math.Sqrt(float64(pixelCap) / float64(width*height))
		dstWidth = max(1, int(float64(width)*scale))
		dstHeight = max(1, int(float64(height)*scale))
	}
	// JPEG has no alpha: composite onto white first so transparent regions
	// stay readable instead of turning black.
	dst := image.NewRGBA(image.Rect(0, 0, dstWidth, dstHeight))
	draw.Draw(dst, dst.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, bounds, draw.Over, nil)
	best := bytes.Buffer{}
	for _, quality := range imageBudgetJpegQualities {
		var buf bytes.Buffer
		if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: quality}); err != nil {
			return nil, "", false
		}
		if best.Len() == 0 || buf.Len() < best.Len() {
			best = buf
		}
		if buf.Len() <= byteTarget {
			break
		}
	}
	return best.Bytes(), "image/jpeg", true
}

// animatedDataImage reports whether the payload is an animation, which the
// single-frame pipeline must not flatten. GIF is checked by decoding all
// frames; WebP by sniffing the VP8X animation flag.
func animatedDataImage(mime string, raw []byte) bool {
	switch mime {
	case "image/gif":
		animation, err := gif.DecodeAll(bytes.NewReader(raw))
		return err == nil && len(animation.Image) > 1
	case "image/webp":
		return webpAnimated(raw)
	default:
		return false
	}
}

func webpAnimated(raw []byte) bool {
	if len(raw) < 21 || string(raw[0:4]) != "RIFF" || string(raw[8:12]) != "WEBP" {
		return false
	}
	if string(raw[12:16]) != "VP8X" {
		return false
	}
	return raw[16]&0x02 != 0
}
