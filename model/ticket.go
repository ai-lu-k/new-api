package model

import (
	"errors"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// Ticket status values. A ticket starts open, moves to in progress while an
// administrator works on it, and ends resolved or closed. Closed is terminal.
const (
	TicketStatusOpen       = 1
	TicketStatusInProgress = 2
	TicketStatusResolved   = 3
	TicketStatusClosed     = 4
)

const (
	TicketCategoryBilling = 1
	TicketCategoryChannel = 2
	TicketCategoryAccount = 3
	TicketCategoryOther   = 4
)

const (
	TicketPriorityLow    = 1
	TicketPriorityNormal = 2
	TicketPriorityHigh   = 3
)

// Who wrote a message.
const (
	TicketAuthorUser  = 1
	TicketAuthorAdmin = 2
)

// Kinds of change recorded in a ticket's event trail.
const (
	TicketEventStatus     = "status"
	TicketEventCategory   = "category"
	TicketEventPriority   = "priority"
	TicketEventAssignment = "assignee"
)

// Ticket is a support thread between one user and the administrators.
type Ticket struct {
	Id              int    `json:"id"`
	UserId          int    `json:"user_id" gorm:"index"`
	Username        string `json:"username" gorm:"type:varchar(64);default:''"`
	Subject         string `json:"subject" gorm:"type:varchar(200);default:''"`
	Category        int    `json:"category" gorm:"default:4;index"`
	Priority        int    `json:"priority" gorm:"default:2;index"`
	Status          int    `json:"status" gorm:"default:1;index"`
	AssigneeId      int    `json:"assignee_id" gorm:"default:0;index"`
	AssigneeName    string `json:"assignee_name" gorm:"type:varchar(64);default:''"`
	StatusUpdatedBy string `json:"status_updated_by" gorm:"type:varchar(64);default:''"`
	StatusUpdatedAt int64  `json:"status_updated_at" gorm:"bigint;default:0"`
	ResolvedAt      int64  `json:"resolved_at" gorm:"bigint;default:0"`
	MessageCount    int    `json:"message_count" gorm:"default:0"`
	LastReplyAt     int64  `json:"last_reply_at" gorm:"bigint;default:0;index"`
	CreatedAt       int64  `json:"created_at" gorm:"bigint;index"`
	UpdatedAt       int64  `json:"updated_at" gorm:"bigint;default:0;index"`
}

func (Ticket) TableName() string {
	return "tickets"
}

// TicketMessage is one turn of a ticket's conversation, written by its author
// or by an administrator.
type TicketMessage struct {
	Id          int                `json:"id"`
	TicketId    int                `json:"ticket_id" gorm:"index"`
	AuthorId    int                `json:"author_id" gorm:"default:0"`
	AuthorName  string             `json:"author_name" gorm:"type:varchar(64);default:''"`
	AuthorRole  int                `json:"author_role" gorm:"default:1"`
	Content     string             `json:"content" gorm:"type:text"`
	CreatedAt   int64              `json:"created_at" gorm:"bigint;index"`
	Attachments []TicketAttachment `json:"attachments" gorm:"-:all"`
}

func (TicketMessage) TableName() string {
	return "ticket_messages"
}

// TicketAttachment is a screenshot stored on the local disk. StorageKey is the
// path below the attachment directory and never leaves the server.
type TicketAttachment struct {
	Id         int    `json:"id"`
	TicketId   int    `json:"ticket_id" gorm:"index"`
	MessageId  int    `json:"message_id" gorm:"index"`
	FileName   string `json:"file_name" gorm:"type:varchar(255);default:''"`
	MimeType   string `json:"mime_type" gorm:"type:varchar(100);default:''"`
	Size       int64  `json:"size" gorm:"bigint;default:0"`
	StorageKey string `json:"-" gorm:"type:varchar(255);default:'';uniqueIndex"`
	CreatedAt  int64  `json:"created_at" gorm:"bigint;default:0"`
}

func (TicketAttachment) TableName() string {
	return "ticket_attachments"
}

// TicketEvent records one administrator change so the thread shows who moved
// the ticket and when.
type TicketEvent struct {
	Id        int    `json:"id"`
	TicketId  int    `json:"ticket_id" gorm:"index"`
	ActorId   int    `json:"actor_id" gorm:"default:0"`
	ActorName string `json:"actor_name" gorm:"type:varchar(64);default:''"`
	Kind      string `json:"kind" gorm:"type:varchar(32);default:''"`
	FromValue string `json:"from_value" gorm:"type:varchar(64);default:''"`
	ToValue   string `json:"to_value" gorm:"type:varchar(64);default:''"`
	CreatedAt int64  `json:"created_at" gorm:"bigint;default:0;index"`
}

func (TicketEvent) TableName() string {
	return "ticket_events"
}

// TicketAssignee is the administrator list a ticket may be assigned to.
type TicketAssignee struct {
	Id   int    `json:"id"`
	Name string `json:"name"`
}

// TicketFilter narrows the administrator queue. Zero values mean "any";
// AssigneeId -1 selects the tickets nobody owns yet.
type TicketFilter struct {
	Status     int
	Category   int
	Priority   int
	AssigneeId int
	Keyword    string
	StartIdx   int
	Num        int
}

// TicketUpdate carries the administrator changes; nil fields stay untouched.
type TicketUpdate struct {
	Status     *int
	Category   *int
	Priority   *int
	AssigneeId *int
	ActorId    int
	ActorName  string
}

// ErrTicketClosed rejects any change to a closed ticket: closed is terminal.
var ErrTicketClosed = errors.New("ticket is closed")

func IsTicketNotFound(err error) bool {
	return errors.Is(err, gorm.ErrRecordNotFound)
}

func IsTicketClosed(status int) bool {
	return status == TicketStatusClosed
}

// CreateTicket stores a ticket together with its opening message.
func CreateTicket(ticket *Ticket, message *TicketMessage, attachments []TicketAttachment) error {
	now := common.GetTimestamp()
	ticket.Id = 0
	ticket.Status = TicketStatusOpen
	ticket.MessageCount = 1
	ticket.CreatedAt = now
	ticket.UpdatedAt = now
	ticket.LastReplyAt = now
	ticket.StatusUpdatedBy = ticket.Username
	ticket.StatusUpdatedAt = now
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(ticket).Error; err != nil {
			return err
		}
		message.Id = 0
		message.TicketId = ticket.Id
		message.CreatedAt = now
		if err := tx.Create(message).Error; err != nil {
			return err
		}
		if len(attachments) == 0 {
			return nil
		}
		for i := range attachments {
			attachments[i].Id = 0
			attachments[i].TicketId = ticket.Id
			attachments[i].MessageId = message.Id
			attachments[i].CreatedAt = now
		}
		return tx.Create(&attachments).Error
	})
}

func GetTicketById(id int) (*Ticket, error) {
	var ticket Ticket
	if err := DB.First(&ticket, id).Error; err != nil {
		return nil, err
	}
	return &ticket, nil
}

// GetTicketDetail returns the ticket with its whole conversation and the
// administrator changes, oldest first.
func GetTicketDetail(id int) (*Ticket, []*TicketMessage, []*TicketEvent, error) {
	ticket, err := GetTicketById(id)
	if err != nil {
		return nil, nil, nil, err
	}
	var messages []*TicketMessage
	if err := DB.Where("ticket_id = ?", id).Order("id asc").Find(&messages).Error; err != nil {
		return nil, nil, nil, err
	}
	if err := loadTicketAttachments(messages); err != nil {
		return nil, nil, nil, err
	}
	var events []*TicketEvent
	if err := DB.Where("ticket_id = ?", id).Order("id asc").Find(&events).Error; err != nil {
		return nil, nil, nil, err
	}
	return ticket, messages, events, nil
}

func loadTicketAttachments(messages []*TicketMessage) error {
	if len(messages) == 0 {
		return nil
	}
	ids := make([]int, 0, len(messages))
	for i := range messages {
		ids = append(ids, messages[i].Id)
	}
	var attachments []TicketAttachment
	if err := DB.Where("message_id IN ?", ids).Order("id asc").Find(&attachments).Error; err != nil {
		return err
	}
	byMessage := make(map[int][]TicketAttachment, len(messages))
	for i := range attachments {
		byMessage[attachments[i].MessageId] = append(byMessage[attachments[i].MessageId], attachments[i])
	}
	for i := range messages {
		// A message without screenshots still answers with an empty list: the
		// conversation reads every message's attachments directly, and a null
		// there breaks the page before it renders.
		attachments := byMessage[messages[i].Id]
		if attachments == nil {
			attachments = []TicketAttachment{}
		}
		messages[i].Attachments = attachments
	}
	return nil
}

// TicketStatusOpenGroup is the filter value that means "still being worked on":
// open and in progress together.
const TicketStatusOpenGroup = -1

// TicketListFilter narrows the tickets a user opened. Zero values mean "any";
// Status TicketStatusOpenGroup keeps open and in progress together.
type TicketListFilter struct {
	UserId   int
	Status   int
	Category int
	Priority int
	Keyword  string
	StartIdx int
	Num      int
}

// ListTicketsOfUser returns the tickets a user opened, most recently active
// first.
func ListTicketsOfUser(filter TicketListFilter) ([]*Ticket, int64, error) {
	query := DB.Model(&Ticket{}).Where("user_id = ?", filter.UserId)
	if filter.Status == TicketStatusOpenGroup {
		query = query.Where("status IN ?", []int{TicketStatusOpen, TicketStatusInProgress})
	} else if filter.Status != 0 {
		query = query.Where("status = ?", filter.Status)
	}
	if filter.Category != 0 {
		query = query.Where("category = ?", filter.Category)
	}
	if filter.Priority != 0 {
		query = query.Where("priority = ?", filter.Priority)
	}
	if filter.Keyword != "" {
		query = query.Where("subject LIKE ?", "%"+filter.Keyword+"%")
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var tickets []*Ticket
	err := query.Order("updated_at desc, id desc").Limit(filter.Num).Offset(filter.StartIdx).Find(&tickets).Error
	return tickets, total, err
}

// ListTickets returns the administrator queue.
func ListTickets(filter TicketFilter) ([]*Ticket, int64, error) {
	query := DB.Model(&Ticket{})
	if filter.Status != 0 {
		query = query.Where("status = ?", filter.Status)
	}
	if filter.Category != 0 {
		query = query.Where("category = ?", filter.Category)
	}
	if filter.Priority != 0 {
		query = query.Where("priority = ?", filter.Priority)
	}
	if filter.AssigneeId > 0 {
		query = query.Where("assignee_id = ?", filter.AssigneeId)
	} else if filter.AssigneeId < 0 {
		query = query.Where("assignee_id = ?", 0)
	}
	if filter.Keyword != "" {
		keyword := "%" + filter.Keyword + "%"
		condition := "subject LIKE ? OR username LIKE ?"
		args := []any{keyword, keyword}
		if id, err := strconv.Atoi(filter.Keyword); err == nil && id > 0 {
			condition += " OR id = ?"
			args = append(args, id)
		}
		query = query.Where(condition, args...)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var tickets []*Ticket
	err := query.Order("updated_at desc, id desc").Limit(filter.Num).Offset(filter.StartIdx).Find(&tickets).Error
	return tickets, total, err
}

// CountOpenTickets counts the tickets an administrator still has to work on.
func CountOpenTickets() (int64, error) {
	var total int64
	err := DB.Model(&Ticket{}).
		Where("status IN ?", []int{TicketStatusOpen, TicketStatusInProgress}).
		Count(&total).Error
	return total, err
}

// CountTicketsByStatus groups the whole queue for the administrator summary.
func CountTicketsByStatus() (map[int]int64, error) {
	type statusCount struct {
		Status int
		Total  int64
	}
	var rows []statusCount
	err := DB.Model(&Ticket{}).
		Select("status, COUNT(*) AS total").
		Group("status").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	counts := make(map[int]int64, len(rows))
	for i := range rows {
		counts[rows[i].Status] = rows[i].Total
	}
	return counts, nil
}

// AppendTicketMessage adds a turn to the conversation. nextStatus is applied
// when it differs from the current status, so a user replying to a resolved
// ticket reopens it.
func AppendTicketMessage(ticketId int, message *TicketMessage, attachments []TicketAttachment, nextStatus int) (*Ticket, error) {
	var ticket Ticket
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).First(&ticket, ticketId).Error; err != nil {
			return err
		}
		now := common.GetTimestamp()
		message.Id = 0
		message.TicketId = ticketId
		message.CreatedAt = now
		if err := tx.Create(message).Error; err != nil {
			return err
		}
		if len(attachments) > 0 {
			for i := range attachments {
				attachments[i].Id = 0
				attachments[i].TicketId = ticketId
				attachments[i].MessageId = message.Id
				attachments[i].CreatedAt = now
			}
			if err := tx.Create(&attachments).Error; err != nil {
				return err
			}
		}
		updates := map[string]any{
			"message_count": gorm.Expr("message_count + 1"),
			"last_reply_at": now,
			"updated_at":    now,
		}
		if nextStatus != 0 && nextStatus != ticket.Status {
			updates["status"] = nextStatus
			updates["status_updated_by"] = message.AuthorName
			updates["status_updated_at"] = now
			updates["resolved_at"] = resolvedAtForStatus(nextStatus)
			event := TicketEvent{
				TicketId:  ticketId,
				ActorId:   message.AuthorId,
				ActorName: message.AuthorName,
				Kind:      TicketEventStatus,
				FromValue: strconv.Itoa(ticket.Status),
				ToValue:   strconv.Itoa(nextStatus),
				CreatedAt: now,
			}
			if err := tx.Create(&event).Error; err != nil {
				return err
			}
		}
		if err := tx.Model(&Ticket{}).Where("id = ?", ticketId).Updates(updates).Error; err != nil {
			return err
		}
		return tx.First(&ticket, ticketId).Error
	})
	if err != nil {
		return nil, err
	}
	return &ticket, nil
}

func resolvedAtForStatus(status int) int64 {
	if status == TicketStatusResolved || status == TicketStatusClosed {
		return common.GetTimestamp()
	}
	return 0
}

// UpdateTicketFields applies the administrator changes and records one event
// per changed field. A closed ticket is terminal and cannot be reopened.
func UpdateTicketFields(id int, update TicketUpdate) (*Ticket, []*TicketEvent, error) {
	var ticket Ticket
	events := make([]*TicketEvent, 0, 4)
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).First(&ticket, id).Error; err != nil {
			return err
		}
		now := common.GetTimestamp()
		updates := map[string]any{"updated_at": now}
		addEvent := func(kind, from, to string) {
			events = append(events, &TicketEvent{
				TicketId:  id,
				ActorId:   update.ActorId,
				ActorName: update.ActorName,
				Kind:      kind,
				FromValue: from,
				ToValue:   to,
				CreatedAt: now,
			})
		}
		if update.Status != nil && *update.Status != ticket.Status {
			if IsTicketClosed(ticket.Status) {
				return ErrTicketClosed
			}
			updates["status"] = *update.Status
			updates["status_updated_by"] = update.ActorName
			updates["status_updated_at"] = now
			updates["resolved_at"] = resolvedAtForStatus(*update.Status)
			addEvent(TicketEventStatus, strconv.Itoa(ticket.Status), strconv.Itoa(*update.Status))
		}
		if update.Category != nil && *update.Category != ticket.Category {
			updates["category"] = *update.Category
			addEvent(TicketEventCategory, strconv.Itoa(ticket.Category), strconv.Itoa(*update.Category))
		}
		if update.Priority != nil && *update.Priority != ticket.Priority {
			updates["priority"] = *update.Priority
			addEvent(TicketEventPriority, strconv.Itoa(ticket.Priority), strconv.Itoa(*update.Priority))
		}
		if update.AssigneeId != nil && *update.AssigneeId != ticket.AssigneeId {
			assignee := TicketAssignee{}
			if *update.AssigneeId > 0 {
				var err error
				assignee, err = findTicketAssignee(tx, *update.AssigneeId)
				if err != nil {
					return err
				}
			}
			updates["assignee_id"] = *update.AssigneeId
			updates["assignee_name"] = assignee.Name
			addEvent(TicketEventAssignment, ticket.AssigneeName, assignee.Name)
		}
		if len(events) == 0 {
			return nil
		}
		if err := tx.Create(&events).Error; err != nil {
			return err
		}
		if err := tx.Model(&Ticket{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return err
		}
		return tx.First(&ticket, id).Error
	})
	if err != nil {
		return nil, nil, err
	}
	return &ticket, events, nil
}

func findTicketAssignee(tx *gorm.DB, id int) (TicketAssignee, error) {
	var user User
	if err := tx.Select("id", "username", "display_name").
		Where("id = ? AND role >= ? AND status = ?", id, common.RoleAdminUser, common.UserStatusEnabled).
		First(&user).Error; err != nil {
		return TicketAssignee{}, err
	}
	return TicketAssignee{Id: user.Id, Name: ticketAssigneeName(&user)}, nil
}

func ticketAssigneeName(user *User) string {
	name := strings.TrimSpace(user.DisplayName)
	if name != "" {
		return name
	}
	return user.Username
}

// ListTicketAssignees returns the administrators a ticket can be assigned to.
func ListTicketAssignees() ([]TicketAssignee, error) {
	var users []User
	err := DB.Select("id", "username", "display_name").
		Where("role >= ? AND status = ?", common.RoleAdminUser, common.UserStatusEnabled).
		Order("role desc, id asc").
		Find(&users).Error
	if err != nil {
		return nil, err
	}
	assignees := make([]TicketAssignee, 0, len(users))
	for i := range users {
		assignees = append(assignees, TicketAssignee{Id: users[i].Id, Name: ticketAssigneeName(&users[i])})
	}
	return assignees, nil
}

func GetTicketAttachment(id int) (*TicketAttachment, error) {
	var attachment TicketAttachment
	if err := DB.First(&attachment, id).Error; err != nil {
		return nil, err
	}
	return &attachment, nil
}
