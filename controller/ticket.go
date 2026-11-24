package controller

import (
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

const (
	ticketMinSubjectLen = 2
	ticketMaxSubjectLen = 120
	ticketMinContentLen = 5
	ticketMaxContentLen = 4000
)

type ticketCreateRequest struct {
	Subject  string `json:"subject"`
	Category int    `json:"category"`
	Priority int    `json:"priority"`
	Content  string `json:"content"`
}

type ticketMessageRequest struct {
	Content string `json:"content"`
}

type ticketUpdateRequest struct {
	Status     *int `json:"status"`
	Category   *int `json:"category"`
	Priority   *int `json:"priority"`
	AssigneeId *int `json:"assignee_id"`
}

type ticketForm struct {
	subject  string
	content  string
	category int
	priority int
	files    []*multipart.FileHeader
}

// isTicketAdministrator reports whether the signed-in account may see and
// change every ticket.
func isTicketAdministrator(c *gin.Context) bool {
	return c.GetInt("role") >= common.RoleAdminUser
}

// ticketCanSee reports whether the caller owns the ticket or administers the
// site. Anyone else must not learn that the ticket exists.
func ticketCanSee(c *gin.Context, ticket *model.Ticket) bool {
	return isTicketAdministrator(c) || (ticket.UserId > 0 && ticket.UserId == c.GetInt("id"))
}

// readTicketForm reads the message either from the web form, which may carry
// screenshots, or from plain JSON for scripts.
func readTicketForm(c *gin.Context) (*ticketForm, bool) {
	form := &ticketForm{}
	if strings.HasPrefix(c.ContentType(), "multipart/form-data") {
		parsed, err := c.MultipartForm()
		if err != nil {
			return nil, false
		}
		form.subject = c.PostForm("subject")
		form.content = c.PostForm("content")
		form.category, _ = strconv.Atoi(c.PostForm("category"))
		form.priority, _ = strconv.Atoi(c.PostForm("priority"))
		if parsed != nil {
			form.files = parsed.File["files"]
		}
		return form, true
	}
	var request ticketCreateRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		return nil, false
	}
	form.subject = request.Subject
	form.content = request.Content
	form.category = request.Category
	form.priority = request.Priority
	return form, true
}

// ticketFormError checks a message. creating also checks the ticket fields
// that only the opening message carries.
func ticketFormError(form *ticketForm, creating bool) string {
	contentLength := utf8.RuneCountInString(strings.TrimSpace(form.content))
	if contentLength < ticketMinContentLen || contentLength > ticketMaxContentLen {
		return i18n.MsgTicketContentInvalid
	}
	if !creating {
		if len(form.files) > service.TicketAttachmentMaxCount {
			return i18n.MsgTicketAttachmentInvalid
		}
		return ""
	}
	subjectLength := utf8.RuneCountInString(strings.TrimSpace(form.subject))
	if subjectLength < ticketMinSubjectLen || subjectLength > ticketMaxSubjectLen {
		return i18n.MsgTicketContentInvalid
	}
	if !validTicketCategory(form.category) || !validTicketPriority(form.priority) {
		return i18n.MsgInvalidParams
	}
	if len(form.files) > service.TicketAttachmentMaxCount {
		return i18n.MsgTicketAttachmentInvalid
	}
	return ""
}

func validTicketCategory(category int) bool {
	return category >= model.TicketCategoryBilling && category <= model.TicketCategoryOther
}

func validTicketPriority(priority int) bool {
	return priority >= model.TicketPriorityLow && priority <= model.TicketPriorityHigh
}

func validTicketStatus(status int) bool {
	return status >= model.TicketStatusOpen && status <= model.TicketStatusClosed
}

// saveTicketUploads stores the screenshots of one message.
func saveTicketUploads(c *gin.Context, form *ticketForm) ([]model.TicketAttachment, bool) {
	attachments, err := service.SaveTicketAttachments(form.files)
	if err == nil {
		return attachments, true
	}
	if errors.Is(err, service.ErrTicketAttachmentType) ||
		errors.Is(err, service.ErrTicketAttachmentSize) ||
		errors.Is(err, service.ErrTicketAttachmentCount) {
		common.ApiErrorI18n(c, i18n.MsgTicketAttachmentInvalid)
		return nil, false
	}
	common.ApiError(c, err)
	return nil, false
}

// CreateTicket opens a new support thread for the signed-in user.
func CreateTicket(c *gin.Context) {
	form, ok := readTicketForm(c)
	if !ok {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if key := ticketFormError(form, true); key != "" {
		common.ApiErrorI18n(c, key)
		return
	}
	attachments, ok := saveTicketUploads(c, form)
	if !ok {
		return
	}
	userId := c.GetInt("id")
	username := c.GetString("username")
	ticket := model.Ticket{
		UserId:   userId,
		Username: username,
		Subject:  strings.TrimSpace(form.subject),
		Category: form.category,
		Priority: form.priority,
	}
	message := model.TicketMessage{
		AuthorId:   userId,
		AuthorName: username,
		AuthorRole: model.TicketAuthorUser,
		Content:    strings.TrimSpace(form.content),
	}
	if err := model.CreateTicket(&ticket, &message, attachments); err != nil {
		service.RemoveTicketAttachments(attachments)
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": ticket})
}

// GetOwnTickets lists the tickets the signed-in user opened. status accepts
// all, open (open and in progress), resolved or closed.
func GetOwnTickets(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	status, ok := ticketStatusFromQuery(c.Query("status"))
	if !ok {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	tickets, total, err := model.ListTicketsOfUser(model.TicketListFilter{
		UserId:   c.GetInt("id"),
		Status:   status,
		Category: queryInt(c, "category"),
		Priority: queryInt(c, "priority"),
		Keyword:  strings.TrimSpace(c.Query("keyword")),
		StartIdx: pageInfo.GetStartIdx(),
		Num:      pageInfo.GetPageSize(),
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(tickets)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": pageInfo})
}

// GetAllTickets is the administrator queue.
func GetAllTickets(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	filter := model.TicketFilter{
		Status:     queryInt(c, "status"),
		Category:   queryInt(c, "category"),
		Priority:   queryInt(c, "priority"),
		AssigneeId: queryInt(c, "assignee_id"),
		Keyword:    strings.TrimSpace(c.Query("keyword")),
		StartIdx:   pageInfo.GetStartIdx(),
		Num:        pageInfo.GetPageSize(),
	}
	tickets, total, err := model.ListTickets(filter)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	counts, err := model.CountTicketsByStatus()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(tickets)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    pageInfo,
		"counts":  counts,
		"open":    counts[model.TicketStatusOpen] + counts[model.TicketStatusInProgress],
	})
}

// ticketStatusFromQuery maps the page filter to a status number. all is any,
// open keeps open and in progress together.
func ticketStatusFromQuery(value string) (int, bool) {
	switch strings.TrimSpace(value) {
	case "", "all":
		return 0, true
	case "open":
		return model.TicketStatusOpenGroup, true
	case "resolved":
		return model.TicketStatusResolved, true
	case "closed":
		return model.TicketStatusClosed, true
	}
	return 0, false
}

func queryInt(c *gin.Context, key string) int {
	value, err := strconv.Atoi(c.Query(key))
	if err != nil {
		return 0
	}
	return value
}

// GetTicketAssignees lists the administrators a ticket can be assigned to.
func GetTicketAssignees(c *gin.Context) {
	assignees, err := model.ListTicketAssignees()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": assignees})
}

// GetTicketDetail returns one thread with its whole conversation.
func GetTicketDetail(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	ticket, messages, events, err := model.GetTicketDetail(id)
	if err != nil {
		if model.IsTicketNotFound(err) {
			common.ApiErrorI18n(c, i18n.MsgNotFound)
			return
		}
		common.ApiError(c, err)
		return
	}
	if !ticketCanSee(c, ticket) {
		common.ApiErrorI18n(c, i18n.MsgForbidden)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"ticket":   ticket,
			"messages": messages,
			"events":   events,
		},
	})
}

// AddTicketMessage appends a turn to a thread. A user replying to a resolved
// ticket reopens it; an administrator reply takes an open ticket in progress.
func AddTicketMessage(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	ticket, err := model.GetTicketById(id)
	if err != nil {
		if model.IsTicketNotFound(err) {
			common.ApiErrorI18n(c, i18n.MsgNotFound)
			return
		}
		common.ApiError(c, err)
		return
	}
	if !ticketCanSee(c, ticket) {
		common.ApiErrorI18n(c, i18n.MsgForbidden)
		return
	}
	if model.IsTicketClosed(ticket.Status) {
		common.ApiErrorI18n(c, i18n.MsgTicketClosed)
		return
	}
	form, ok := readTicketForm(c)
	if !ok {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if key := ticketFormError(form, false); key != "" {
		common.ApiErrorI18n(c, key)
		return
	}
	attachments, ok := saveTicketUploads(c, form)
	if !ok {
		return
	}
	administrator := isTicketAdministrator(c)
	authorRole := model.TicketAuthorUser
	nextStatus := 0
	if administrator {
		authorRole = model.TicketAuthorAdmin
		if ticket.Status == model.TicketStatusOpen {
			nextStatus = model.TicketStatusInProgress
		}
	} else if ticket.Status == model.TicketStatusResolved {
		nextStatus = model.TicketStatusOpen
	}
	message := model.TicketMessage{
		AuthorId:   c.GetInt("id"),
		AuthorName: c.GetString("username"),
		AuthorRole: authorRole,
		Content:    strings.TrimSpace(form.content),
	}
	updated, err := model.AppendTicketMessage(id, &message, attachments, nextStatus)
	if err != nil {
		service.RemoveTicketAttachments(attachments)
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": updated})
}

// UpdateTicket applies an administrator change: status, category, priority or
// the assignee.
func UpdateTicket(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	var request ticketUpdateRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if (request.Status != nil && !validTicketStatus(*request.Status)) ||
		(request.Category != nil && !validTicketCategory(*request.Category)) ||
		(request.Priority != nil && !validTicketPriority(*request.Priority)) ||
		(request.AssigneeId != nil && *request.AssigneeId < 0) {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	ticket, events, err := model.UpdateTicketFields(id, model.TicketUpdate{
		Status:     request.Status,
		Category:   request.Category,
		Priority:   request.Priority,
		AssigneeId: request.AssigneeId,
		ActorId:    c.GetInt("id"),
		ActorName:  c.GetString("username"),
	})
	if err != nil {
		switch {
		case model.IsTicketNotFound(err):
			common.ApiErrorI18n(c, i18n.MsgNotFound)
		case errors.Is(err, model.ErrTicketClosed):
			common.ApiErrorI18n(c, i18n.MsgTicketClosed)
		default:
			common.ApiError(c, err)
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    gin.H{"ticket": ticket, "events": events},
	})
}

// DownloadTicketAttachment serves a stored screenshot to the ticket owner and
// to administrators only.
func DownloadTicketAttachment(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	attachment, err := model.GetTicketAttachment(id)
	if err != nil {
		if model.IsTicketNotFound(err) {
			common.ApiErrorI18n(c, i18n.MsgNotFound)
			return
		}
		common.ApiError(c, err)
		return
	}
	ticket, err := model.GetTicketById(attachment.TicketId)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgNotFound)
		return
	}
	if !ticketCanSee(c, ticket) {
		common.ApiErrorI18n(c, i18n.MsgForbidden)
		return
	}
	file, err := service.OpenTicketAttachment(attachment)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgNotFound)
		return
	}
	defer func() { _ = file.Close() }()
	info, err := file.Stat()
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgNotFound)
		return
	}
	mimeType := attachment.MimeType
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	c.Header("Content-Type", mimeType)
	c.Header("X-Content-Type-Options", "nosniff")
	// A screenshot is untrusted content: it renders alone, with no script.
	c.Header("Content-Security-Policy", "default-src 'none'; sandbox")
	c.Header("Cache-Control", "private, max-age=300")
	if attachment.FileName != "" {
		c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", attachment.FileName))
	}
	http.ServeContent(c.Writer, c.Request, attachment.FileName, info.ModTime(), file)
}
