package service

import (
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/google/uuid"
)

const (
	TicketAttachmentMaxBytes = 5 << 20
	TicketAttachmentMaxCount = 3
)

var (
	ErrTicketAttachmentType  = errors.New("ticket attachment type is not allowed")
	ErrTicketAttachmentSize  = errors.New("ticket attachment is too large")
	ErrTicketAttachmentCount = errors.New("too many ticket attachments")
	ErrTicketAttachmentPath  = errors.New("ticket attachment path is invalid")
)

// Raster image types are the only screenshots a ticket accepts. Formats a
// browser would execute in place, such as SVG or HTML, are deliberately absent.
var ticketAttachmentExtensions = map[string]string{
	"image/png":  ".png",
	"image/jpeg": ".jpg",
	"image/gif":  ".gif",
	"image/webp": ".webp",
}

// TicketAttachmentDir is the directory screenshots are stored in. It points at
// a mounted volume in containers, so the files survive a restart.
func TicketAttachmentDir() string {
	dir := strings.TrimSpace(common.GetEnvOrDefaultString("TICKET_ATTACHMENT_DIR", "./ticket-attachments"))
	if abs, err := filepath.Abs(dir); err == nil {
		return abs
	}
	return dir
}

// SaveTicketAttachments writes the uploaded screenshots of one message to
// disk and returns the rows to store. Files written before a failure are
// removed again, so a rejected upload leaves nothing behind.
func SaveTicketAttachments(files []*multipart.FileHeader) ([]model.TicketAttachment, error) {
	if len(files) == 0 {
		return nil, nil
	}
	if len(files) > TicketAttachmentMaxCount {
		return nil, ErrTicketAttachmentCount
	}
	folder := uuid.NewString()
	dir := filepath.Join(TicketAttachmentDir(), folder)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}
	attachments := make([]model.TicketAttachment, 0, len(files))
	for _, file := range files {
		attachment, err := saveTicketAttachment(dir, folder, file)
		if err != nil {
			RemoveTicketAttachments(attachments)
			return nil, err
		}
		attachments = append(attachments, attachment)
	}
	return attachments, nil
}

func saveTicketAttachment(dir, folder string, file *multipart.FileHeader) (model.TicketAttachment, error) {
	source, err := file.Open()
	if err != nil {
		return model.TicketAttachment{}, err
	}
	defer func() { _ = source.Close() }()
	data, err := io.ReadAll(io.LimitReader(source, TicketAttachmentMaxBytes+1))
	if err != nil {
		return model.TicketAttachment{}, err
	}
	if len(data) > TicketAttachmentMaxBytes {
		return model.TicketAttachment{}, ErrTicketAttachmentSize
	}
	mimeType := http.DetectContentType(data)
	extension, ok := ticketAttachmentExtensions[mimeType]
	if !ok {
		return model.TicketAttachment{}, ErrTicketAttachmentType
	}
	name := uuid.NewString() + extension
	if err := os.WriteFile(filepath.Join(dir, name), data, 0644); err != nil {
		return model.TicketAttachment{}, err
	}
	return model.TicketAttachment{
		FileName:   ticketAttachmentFileName(file.Filename),
		MimeType:   mimeType,
		Size:       int64(len(data)),
		StorageKey: folder + "/" + name,
	}, nil
}

// ticketAttachmentFileName keeps the upload readable in the thread: base name
// only, no control characters, bounded length.
func ticketAttachmentFileName(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	name = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, name)
	if runes := []rune(name); len(runes) > 120 {
		name = string(runes[:120])
	}
	if name == "." || name == string(filepath.Separator) {
		return ""
	}
	return name
}

// OpenTicketAttachment opens a stored screenshot. The key comes from the
// database, and the resolved path still has to stay below the attachment
// directory before anything is read.
func OpenTicketAttachment(attachment *model.TicketAttachment) (*os.File, error) {
	key := filepath.FromSlash(attachment.StorageKey)
	if key == "" || filepath.IsAbs(key) || strings.HasPrefix(key, "..") {
		return nil, ErrTicketAttachmentPath
	}
	base := TicketAttachmentDir()
	path := filepath.Join(base, filepath.Clean(key))
	if !strings.HasPrefix(path, base+string(os.PathSeparator)) {
		return nil, ErrTicketAttachmentPath
	}
	return os.Open(path)
}

// RemoveTicketAttachments deletes the stored files of attachments that will
// not be referenced by a message.
func RemoveTicketAttachments(attachments []model.TicketAttachment) {
	base := TicketAttachmentDir()
	for _, attachment := range attachments {
		key := filepath.FromSlash(attachment.StorageKey)
		if key == "" {
			continue
		}
		path := filepath.Join(base, filepath.Clean(key))
		if !strings.HasPrefix(path, base+string(os.PathSeparator)) {
			continue
		}
		_ = os.Remove(path)
	}
}
