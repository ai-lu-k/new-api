package controller

import (
	"bytes"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type ticketCall struct {
	method      string
	target      string
	body        []byte
	contentType string
	userId      int
	role        int
	username    string
	params      gin.Params
}

func performTicketCall(t *testing.T, handler gin.HandlerFunc, call ticketCall) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(call.method, call.target, bytes.NewReader(call.body))
	if call.contentType != "" {
		context.Request.Header.Set("Content-Type", call.contentType)
	}
	context.Set("id", call.userId)
	context.Set("role", call.role)
	context.Set("username", call.username)
	context.Params = call.params
	handler(context)
	return recorder
}

type ticketRecordResponse struct {
	Success bool
	Message string
	Data    model.Ticket
}

type ticketDetailResponse struct {
	Success bool
	Message string
	Data    struct {
		Ticket   model.Ticket
		Messages []model.TicketMessage
		Events   []model.TicketEvent
	}
}

type ticketQueueResponse struct {
	Success bool
	Message string
	Data    struct {
		Items []model.Ticket
		Total int
	}
	Open   int64
	Counts map[string]int64
}

type ticketAssigneesResponse struct {
	Success bool
	Message string
	Data    []model.TicketAssignee
}

type ticketUpdateResponse struct {
	Success bool
	Message string
	Data    struct {
		Ticket model.Ticket
		Events []model.TicketEvent
	}
}

func decodeTicketResponse(t *testing.T, recorder *httptest.ResponseRecorder, target any) {
	t.Helper()
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), target), recorder.Body.String())
}

func createTicketAs(t *testing.T, userId int, username, body string) ticketRecordResponse {
	t.Helper()
	recorder := performTicketCall(t, CreateTicket, ticketCall{
		method:      http.MethodPost,
		target:      "/api/ticket/",
		body:        []byte(body),
		contentType: "application/json",
		userId:      userId,
		role:        common.RoleCommonUser,
		username:    username,
	})
	var response ticketRecordResponse
	decodeTicketResponse(t, recorder, &response)
	return response
}

func readTicketAs(t *testing.T, ticketId, userId, role int, username string) ticketDetailResponse {
	t.Helper()
	recorder := performTicketCall(t, GetTicketDetail, ticketCall{
		method:   http.MethodGet,
		target:   fmt.Sprintf("/api/ticket/%d", ticketId),
		userId:   userId,
		role:     role,
		username: username,
		params:   gin.Params{{Key: "id", Value: fmt.Sprint(ticketId)}},
	})
	var response ticketDetailResponse
	decodeTicketResponse(t, recorder, &response)
	return response
}

func replyToTicketAs(t *testing.T, ticketId, userId, role int, username, content string) ticketRecordResponse {
	t.Helper()
	payload, err := common.Marshal(map[string]string{"content": content})
	require.NoError(t, err)
	recorder := performTicketCall(t, AddTicketMessage, ticketCall{
		method:      http.MethodPost,
		target:      fmt.Sprintf("/api/ticket/%d/messages", ticketId),
		body:        payload,
		contentType: "application/json",
		userId:      userId,
		role:        role,
		username:    username,
		params:      gin.Params{{Key: "id", Value: fmt.Sprint(ticketId)}},
	})
	var response ticketRecordResponse
	decodeTicketResponse(t, recorder, &response)
	return response
}

func updateTicketAs(t *testing.T, ticketId int, body string) ticketUpdateResponse {
	t.Helper()
	recorder := performTicketCall(t, UpdateTicket, ticketCall{
		method:      http.MethodPut,
		target:      fmt.Sprintf("/api/ticket/%d", ticketId),
		body:        []byte(body),
		contentType: "application/json",
		userId:      1,
		role:        common.RoleRootUser,
		username:    "root",
		params:      gin.Params{{Key: "id", Value: fmt.Sprint(ticketId)}},
	})
	var response ticketUpdateResponse
	decodeTicketResponse(t, recorder, &response)
	return response
}

type ticketMineResponse struct {
	Success bool
	Message string
	Data    struct {
		Items []model.Ticket
		Total int
	}
}

func listMyTicketsAs(t *testing.T, userId int, username, query string) ticketMineResponse {
	t.Helper()
	recorder := performTicketCall(t, GetOwnTickets, ticketCall{
		method:   http.MethodGet,
		target:   "/api/ticket/self" + query,
		userId:   userId,
		role:     common.RoleCommonUser,
		username: username,
	})
	var response ticketMineResponse
	decodeTicketResponse(t, recorder, &response)
	return response
}

func listTicketAssigneesAs(t *testing.T) ticketAssigneesResponse {
	t.Helper()
	recorder := performTicketCall(t, GetTicketAssignees, ticketCall{
		method:   http.MethodGet,
		target:   "/api/ticket-assignees",
		userId:   1,
		role:     common.RoleRootUser,
		username: "root",
	})
	var response ticketAssigneesResponse
	decodeTicketResponse(t, recorder, &response)
	return response
}

func listTicketQueueAs(t *testing.T, query string) ticketQueueResponse {
	t.Helper()
	recorder := performTicketCall(t, GetAllTickets, ticketCall{
		method:   http.MethodGet,
		target:   "/api/ticket/" + query,
		userId:   1,
		role:     common.RoleRootUser,
		username: "root",
	})
	var response ticketQueueResponse
	decodeTicketResponse(t, recorder, &response)
	return response
}

// ticketTestDatabase returns a migrated database of the requested dialect.
func ticketTestDatabase(t *testing.T, kind string) *gorm.DB {
	t.Helper()
	t.Setenv("TEST_MANAGE_USER_DIALECT", kind)
	db := setupManageUserTestDB(t)
	tables := []any{
		&model.User{},
		&model.Ticket{},
		&model.TicketMessage{},
		&model.TicketAttachment{},
		&model.TicketEvent{},
	}
	require.NoError(t, db.AutoMigrate(tables...))
	// A restart migrates again; it must neither fail nor rewrite the schema.
	require.NoError(t, db.AutoMigrate(tables...))
	return db
}

func seedTicketAdmins(t *testing.T, db *gorm.DB) (model.User, model.User, model.User) {
	t.Helper()
	owner := model.User{Username: "mei", DisplayName: "Mei", Password: strings.Repeat("p", 32), Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "aff-mei"}
	ada := model.User{Username: "ada", DisplayName: "Ada", Password: strings.Repeat("p", 32), Role: common.RoleAdminUser, Status: common.UserStatusEnabled, AffCode: "aff-ada"}
	bob := model.User{Username: "bob", Password: strings.Repeat("p", 32), Role: common.RoleAdminUser, Status: common.UserStatusEnabled, AffCode: "aff-bob"}
	require.NoError(t, db.Create(&owner).Error)
	require.NoError(t, db.Create(&ada).Error)
	require.NoError(t, db.Create(&bob).Error)
	return owner, ada, bob
}

// TestTicketThreadDatabaseMatrix protects the conversation contract: an
// administrator answers in the same thread, status only moves forward, and
// the history records who changed what.
func TestTicketThreadDatabaseMatrix(t *testing.T) {
	for _, dialect := range []struct{ kind, env string }{
		{"sqlite", ""},
		{"mysql", "TEST_MYSQL_DSN"},
		{"postgres", "TEST_POSTGRES_DSN"},
	} {
		t.Run(dialect.kind, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env + " to run this database")
			}
			t.Setenv("TICKET_ATTACHMENT_DIR", t.TempDir())
			db := ticketTestDatabase(t, dialect.kind)
			owner, ada, bob := seedTicketAdmins(t, db)

			created := createTicketAs(t, owner.Id, owner.Username, `{"subject":"Channel errors","category":2,"priority":3,"content":"grok returns 500 since this morning"}`)
			require.True(t, created.Success, created.Message)
			ticketId := created.Data.Id
			assert.Equal(t, model.TicketStatusOpen, created.Data.Status)
			assert.Equal(t, 1, created.Data.MessageCount)
			assert.Equal(t, owner.Username, created.Data.Username)

			// Lengths and enumerations are enforced on the server.
			assert.False(t, createTicketAs(t, owner.Id, owner.Username, `{"subject":"x","category":2,"priority":3,"content":"grok returns 500"}`).Success)
			assert.False(t, createTicketAs(t, owner.Id, owner.Username, `{"subject":"Channel errors","category":9,"priority":3,"content":"grok returns 500"}`).Success)
			assert.False(t, createTicketAs(t, owner.Id, owner.Username, `{"subject":"Channel errors","category":2,"priority":3,"content":"no"}`).Success)

			// The user's own list filters by the tabs on the page.
			assert.Len(t, listMyTicketsAs(t, owner.Id, owner.Username, "?p=1&page_size=20&status=open").Data.Items, 1)
			assert.Empty(t, listMyTicketsAs(t, owner.Id, owner.Username, "?p=1&page_size=20&status=resolved").Data.Items)
			assert.Empty(t, listMyTicketsAs(t, owner.Id, owner.Username, "?p=1&page_size=20&keyword=refund").Data.Items)
			assert.Len(t, listMyTicketsAs(t, owner.Id, owner.Username, "?p=1&page_size=20&keyword=Channel").Data.Items, 1)
			assert.Empty(t, listMyTicketsAs(t, 99, "other", "?p=1&page_size=20").Data.Items)

			// A thread belongs to its author and to administrators.
			assert.False(t, readTicketAs(t, ticketId, 99, common.RoleCommonUser, "other").Success)
			mine := readTicketAs(t, ticketId, owner.Id, common.RoleCommonUser, owner.Username)
			require.True(t, mine.Success)
			require.Len(t, mine.Data.Messages, 1)
			assert.Equal(t, model.TicketAuthorUser, mine.Data.Messages[0].AuthorRole)

			// An administrator answers without ending the thread.
			answered := replyToTicketAs(t, ticketId, ada.Id, common.RoleAdminUser, ada.Username, "We are looking at that channel now.")
			require.True(t, answered.Success, answered.Message)
			assert.Equal(t, model.TicketStatusInProgress, answered.Data.Status)
			assert.Equal(t, 2, answered.Data.MessageCount)

			queue := listTicketQueueAs(t, "?p=1&page_size=10")
			require.True(t, queue.Success)
			require.Len(t, queue.Data.Items, 1)
			assert.Equal(t, int64(1), queue.Open)
			assert.Equal(t, int64(1), queue.Counts[fmt.Sprint(model.TicketStatusInProgress)])
			assignees := listTicketAssigneesAs(t)
			require.Len(t, assignees.Data, 2, "both administrators can own a ticket")
			assert.Empty(t, listTicketQueueAs(t, "?p=1&page_size=10&category=1").Data.Items)
			assert.Len(t, listTicketQueueAs(t, "?p=1&page_size=10&category=2").Data.Items, 1)
			assert.Len(t, listTicketQueueAs(t, "?p=1&page_size=10&keyword=grok").Data.Items, 0, "the subject, not the message body, is searchable")
			assert.Len(t, listTicketQueueAs(t, "?p=1&page_size=10&keyword=Channel").Data.Items, 1)

			// One request may change several fields; each change is recorded.
			updated := updateTicketAs(t, ticketId, fmt.Sprintf(`{"status":3,"priority":1,"assignee_id":%d}`, ada.Id))
			require.True(t, updated.Success, updated.Message)
			assert.Equal(t, model.TicketStatusResolved, updated.Data.Ticket.Status)
			assert.Equal(t, ada.DisplayName, updated.Data.Ticket.AssigneeName)
			assert.NotZero(t, updated.Data.Ticket.ResolvedAt)
			require.Len(t, updated.Data.Events, 3)
			kinds := []string{updated.Data.Events[0].Kind, updated.Data.Events[1].Kind, updated.Data.Events[2].Kind}
			assert.ElementsMatch(t, []string{model.TicketEventStatus, model.TicketEventPriority, model.TicketEventAssignment}, kinds)
			assert.Equal(t, "root", updated.Data.Events[0].ActorName)

			// A user answer reopens a resolved ticket.
			reopened := replyToTicketAs(t, ticketId, owner.Id, common.RoleCommonUser, owner.Username, "It works again, but the latency is still high.")
			require.True(t, reopened.Success, reopened.Message)
			assert.Equal(t, model.TicketStatusOpen, reopened.Data.Status)
			assert.Zero(t, reopened.Data.ResolvedAt)

			// Only an enabled administrator can be assigned.
			assert.False(t, updateTicketAs(t, ticketId, fmt.Sprintf(`{"assignee_id":%d}`, owner.Id)).Success)
			assert.False(t, updateTicketAs(t, ticketId, `{"priority":7}`).Success)

			// Closing is terminal: no new messages and no status change.
			assert.True(t, updateTicketAs(t, ticketId, `{"status":4}`).Success)
			assert.False(t, replyToTicketAs(t, ticketId, owner.Id, common.RoleCommonUser, owner.Username, "One more thing.").Success)
			assert.False(t, updateTicketAs(t, ticketId, `{"status":1}`).Success)

			// The assignee list never includes ordinary accounts.
			assert.NotContains(t, fmt.Sprint(listTicketAssigneesAs(t).Data), "mei")
			assert.Equal(t, 3, len(readTicketAs(t, ticketId, bob.Id, common.RoleAdminUser, bob.Username).Data.Messages))
		})
	}
}

type ticketTestFile struct {
	name string
	data []byte
}

var onePixelPNG = []byte{
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
	0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
	0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
	0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
	0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
	0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
}

func ticketMultipartForm(t *testing.T, fields map[string]string, files ...ticketTestFile) ([]byte, string) {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	for name, value := range fields {
		require.NoError(t, writer.WriteField(name, value))
	}
	for _, file := range files {
		part, err := writer.CreateFormFile("files", file.name)
		require.NoError(t, err)
		_, err = part.Write(file.data)
		require.NoError(t, err)
	}
	require.NoError(t, writer.Close())
	return body.Bytes(), writer.FormDataContentType()
}

// TestTicketAttachmentAccess protects where a screenshot goes and who may read
// it back.
func TestTicketAttachmentAccess(t *testing.T) {
	attachmentDir := t.TempDir()
	t.Setenv("TICKET_ATTACHMENT_DIR", attachmentDir)
	db := ticketTestDatabase(t, "sqlite")
	owner, ada, _ := seedTicketAdmins(t, db)

	body, contentType := ticketMultipartForm(t, map[string]string{
		"subject":  "Key rejected",
		"category": "3",
		"priority": "2",
		"content":  "The key page rejects my new key.",
	}, ticketTestFile{name: "screen.png", data: onePixelPNG})
	recorder := performTicketCall(t, CreateTicket, ticketCall{
		method:      http.MethodPost,
		target:      "/api/ticket/",
		body:        body,
		contentType: contentType,
		userId:      owner.Id,
		role:        common.RoleCommonUser,
		username:    owner.Username,
	})
	var created ticketRecordResponse
	decodeTicketResponse(t, recorder, &created)
	require.True(t, created.Success, created.Message)

	detailRecorder := performTicketCall(t, GetTicketDetail, ticketCall{
		method:   http.MethodGet,
		target:   fmt.Sprintf("/api/ticket/%d", created.Data.Id),
		userId:   owner.Id,
		role:     common.RoleCommonUser,
		username: owner.Username,
		params:   gin.Params{{Key: "id", Value: fmt.Sprint(created.Data.Id)}},
	})
	var detail ticketDetailResponse
	decodeTicketResponse(t, detailRecorder, &detail)
	require.Len(t, detail.Data.Messages, 1)
	require.Len(t, detail.Data.Messages[0].Attachments, 1)
	attachment := detail.Data.Messages[0].Attachments[0]
	assert.Equal(t, "image/png", attachment.MimeType)
	assert.Equal(t, "screen.png", attachment.FileName)

	// The file lives on disk and its path never reaches the client.
	var stored model.TicketAttachment
	require.NoError(t, db.First(&stored, attachment.Id).Error)
	require.NotEmpty(t, stored.StorageKey)
	assert.NotContains(t, detailRecorder.Body.String(), stored.StorageKey)
	_, err := os.Stat(fmt.Sprintf("%s/%s", attachmentDir, stored.StorageKey))
	require.NoError(t, err)

	downloadAs := func(userId, role int) *httptest.ResponseRecorder {
		return performTicketCall(t, DownloadTicketAttachment, ticketCall{
			method:   http.MethodGet,
			target:   fmt.Sprintf("/api/ticket-attachment/%d", attachment.Id),
			userId:   userId,
			role:     role,
			username: "reader",
			params:   gin.Params{{Key: "id", Value: fmt.Sprint(attachment.Id)}},
		})
	}
	signed := downloadAs(owner.Id, common.RoleCommonUser)
	assert.Equal(t, http.StatusOK, signed.Code)
	assert.Equal(t, "image/png", signed.Header().Get("Content-Type"))
	assert.Equal(t, "nosniff", signed.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, onePixelPNG, signed.Body.Bytes())
	administrator := downloadAs(ada.Id, common.RoleAdminUser)
	assert.Equal(t, http.StatusOK, administrator.Code)
	assert.Equal(t, onePixelPNG, administrator.Body.Bytes())
	assert.Contains(t, downloadAs(99, common.RoleCommonUser).Body.String(), `"success":false`)

	// Anything that is not a raster image is refused.
	textBody, textType := ticketMultipartForm(t, map[string]string{
		"subject":  "Script upload",
		"category": "4",
		"priority": "2",
		"content":  "This should never be accepted.",
	}, ticketTestFile{name: "run.html", data: []byte("<html><script>alert(1)</script></html>")})
	rejected := performTicketCall(t, CreateTicket, ticketCall{
		method:      http.MethodPost,
		target:      "/api/ticket/",
		body:        textBody,
		contentType: textType,
		userId:      owner.Id,
		role:        common.RoleCommonUser,
		username:    owner.Username,
	})
	assert.Contains(t, rejected.Body.String(), `"success":false`)

	// At most three screenshots per message.
	manyFiles := []ticketTestFile{
		{name: "1.png", data: onePixelPNG},
		{name: "2.png", data: onePixelPNG},
		{name: "3.png", data: onePixelPNG},
		{name: "4.png", data: onePixelPNG},
	}
	tooManyBody, tooManyType := ticketMultipartForm(t, map[string]string{
		"subject":  "Four shots",
		"category": "4",
		"priority": "2",
		"content":  "One of these must be refused.",
	}, manyFiles...)
	tooMany := performTicketCall(t, CreateTicket, ticketCall{
		method:      http.MethodPost,
		target:      "/api/ticket/",
		body:        tooManyBody,
		contentType: tooManyType,
		userId:      owner.Id,
		role:        common.RoleCommonUser,
		username:    owner.Username,
	})
	assert.Contains(t, tooMany.Body.String(), `"success":false`)
}

// The dashboard reads a ticket's events and each message's screenshots
// directly, so a fresh ticket has to answer with empty arrays. A null there
// breaks the page before anything renders.
func TestTicketDetailKeepsEmptyListsAsArrays(t *testing.T) {
	t.Setenv("TICKET_ATTACHMENT_DIR", t.TempDir())
	db := ticketTestDatabase(t, "sqlite")
	owner, _, _ := seedTicketAdmins(t, db)

	created := createTicketAs(t, owner.Id, owner.Username, `{"subject":"Nothing attached","category":4,"priority":2,"content":"no screenshot and no changes yet"}`)
	require.True(t, created.Success, created.Message)

	recorder := performTicketCall(t, GetTicketDetail, ticketCall{
		method:   http.MethodGet,
		target:   fmt.Sprintf("/api/ticket/%d", created.Data.Id),
		userId:   owner.Id,
		role:     common.RoleCommonUser,
		username: owner.Username,
		params:   gin.Params{{Key: "id", Value: fmt.Sprint(created.Data.Id)}},
	})
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	body := recorder.Body.String()
	assert.Contains(t, body, `"events":[]`)
	assert.Contains(t, body, `"attachments":[]`)
	assert.NotContains(t, body, `null`)
}
