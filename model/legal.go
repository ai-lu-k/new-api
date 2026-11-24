package model

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const legalCurrentOption = "legal.current_version"

var ErrLegalConsentRequired = errors.New("Please review and accept the current legal documents")
var ErrLegalVersionChanged = errors.New("Legal documents changed. Please review them again")

// LegalVersion is an immutable pair of documents. RequiredVersion changes only
// for material updates; every edit still receives its own version and digest.
type LegalVersion struct {
	Id            int64  `json:"id" gorm:"primaryKey"`
	UserAgreement string `json:"user_agreement" gorm:"type:text;not null"`
	PrivacyPolicy string `json:"privacy_policy" gorm:"type:text;not null"`
	// The English pair is optional: a version published before the site had one
	// keeps serving the document above to every reader.
	UserAgreementEn string `json:"user_agreement_en" gorm:"type:text"`
	PrivacyPolicyEn string `json:"privacy_policy_en" gorm:"type:text"`
	Digest          string `json:"digest" gorm:"type:varchar(64);not null"`
	RequiredVersion int64  `json:"required_version" gorm:"not null"`
	PublishedAt     int64  `json:"published_at" gorm:"not null"`
	PublishedBy     int    `json:"-" gorm:"not null"`
}

type LegalConsent struct {
	Id         int64 `json:"id" gorm:"primaryKey"`
	UserId     int   `json:"user_id" gorm:"uniqueIndex:idx_legal_user_version;not null"`
	VersionId  int64 `json:"version_id" gorm:"uniqueIndex:idx_legal_user_version;not null"`
	AcceptedAt int64 `json:"accepted_at" gorm:"not null"`
}

// documentText picks the reader's language out of the pair a version carries. A
// missing translation is not an error: the reader gets the document that was
// published, and the version they accept is the same revision either way.
func documentText(base, translated, language string) string {
	if translated == "" || !isEnglishLanguage(language) {
		return base
	}
	return translated
}

func isEnglishLanguage(language string) bool {
	language = strings.ToLower(strings.TrimSpace(language))
	return language == "en" || strings.HasPrefix(language, "en-")
}

// UserAgreementText is the agreement as the reader's language should see it.
func (version *LegalVersion) UserAgreementText(language string) string {
	return documentText(version.UserAgreement, version.UserAgreementEn, language)
}

// PrivacyPolicyText is the privacy policy as the reader's language should see it.
func (version *LegalVersion) PrivacyPolicyText(language string) string {
	return documentText(version.PrivacyPolicy, version.PrivacyPolicyEn, language)
}

type LegalAcceptance struct {
	Accepted  bool  `json:"accepted"`
	VersionId int64 `json:"version_id"`
}

func CurrentLegalVersion(tx *gorm.DB, lock bool) (*LegalVersion, error) {
	query := tx
	if lock {
		query = lockForUpdate(query)
	}
	var head Option
	if err := query.Where(Option{Key: legalCurrentOption}).First(&head).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	id, err := strconv.ParseInt(head.Value, 10, 64)
	if err != nil || id < 0 {
		return nil, errors.New("invalid legal version configuration")
	}
	if id == 0 {
		return nil, nil
	}
	var version LegalVersion
	if err := tx.First(&version, id).Error; err != nil {
		return nil, err
	}
	return &version, nil
}

// InitializeLegalVersions archives existing inline documents without inventing
// consent for existing accounts. Called after migrations, before serving traffic.
func InitializeLegalVersions() error {
	if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&Option{Key: legalCurrentOption, Value: "0"}).Error; err != nil {
		return err
	}
	current, err := CurrentLegalVersion(DB, false)
	if err != nil || current != nil {
		return err
	}
	var options []Option
	if err := DB.Where(clause.IN{Column: "key", Values: []any{"legal.user_agreement", "legal.privacy_policy"}}).Find(&options).Error; err != nil {
		return err
	}
	values := map[string]string{}
	for _, option := range options {
		values[option.Key] = option.Value
	}
	if strings.TrimSpace(values["legal.user_agreement"]) == "" && strings.TrimSpace(values["legal.privacy_policy"]) == "" {
		return nil
	}
	_, err = PublishLegalVersion(values, true, 0, 0)
	return err
}

// PublishLegalVersion serializes publications and acceptances on the same option
// row. expectedVersion prevents one editor from overwriting another's changes.
func PublishLegalVersion(values map[string]string, material bool, publisher int, expectedVersion int64) (*LegalVersion, error) {
	var published *LegalVersion
	err := DB.Transaction(func(tx *gorm.DB) error {
		current, err := CurrentLegalVersion(tx, true)
		if err != nil {
			return err
		}
		currentID := int64(0)
		agreement, privacy := "", ""
		agreementEn, privacyEn := "", ""
		required := int64(0)
		if current != nil {
			currentID, agreement, privacy, required = current.Id, current.UserAgreement, current.PrivacyPolicy, current.RequiredVersion
			agreementEn, privacyEn = current.UserAgreementEn, current.PrivacyPolicyEn
		}
		if currentID != expectedVersion {
			return ErrLegalVersionChanged
		}
		if value, ok := values["legal.user_agreement"]; ok {
			agreement = strings.TrimSpace(value)
		}
		if value, ok := values["legal.privacy_policy"]; ok {
			privacy = strings.TrimSpace(value)
		}
		if value, ok := values["legal.user_agreement_en"]; ok {
			agreementEn = strings.TrimSpace(value)
		}
		if value, ok := values["legal.privacy_policy_en"]; ok {
			privacyEn = strings.TrimSpace(value)
		}
		for _, content := range []string{agreement, privacy, agreementEn, privacyEn} {
			if len(content) > 1<<20 {
				return errors.New("legal document exceeds 1 MiB")
			}
			if strings.HasPrefix(strings.ToLower(content), "http://") || strings.HasPrefix(strings.ToLower(content), "https://") {
				return errors.New("publish inline legal text so the accepted content can be archived")
			}
		}
		if current != nil && agreement == current.UserAgreement && privacy == current.PrivacyPolicy &&
			agreementEn == current.UserAgreementEn && privacyEn == current.PrivacyPolicyEn && !material {
			published = current
			return nil
		}
		// The digest covers every language, so a re-translated document is its own
		// revision even when the other language did not change.
		data, err := common.Marshal([]string{agreement, privacy, agreementEn, privacyEn})
		if err != nil {
			return err
		}
		published = &LegalVersion{UserAgreement: agreement, PrivacyPolicy: privacy, UserAgreementEn: agreementEn, PrivacyPolicyEn: privacyEn, Digest: fmt.Sprintf("%x", sha256.Sum256(data)), RequiredVersion: required, PublishedAt: time.Now().Unix(), PublishedBy: publisher}
		if err := tx.Create(published).Error; err != nil {
			return err
		}
		// Adding a document also requires consent even if marked a minor edit.
		if material || required == 0 || (current != nil && ((current.UserAgreement == "" && agreement != "") || (current.PrivacyPolicy == "" && privacy != ""))) {
			published.RequiredVersion = published.Id
		}
		if err := tx.Model(published).Update("required_version", published.RequiredVersion).Error; err != nil {
			return err
		}
		for key, value := range map[string]string{legalCurrentOption: strconv.FormatInt(published.Id, 10), "legal.user_agreement": agreement, "legal.privacy_policy": privacy} {
			if err := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "key"}}, DoUpdates: clause.AssignmentColumns([]string{"value"})}).Create(&Option{Key: key, Value: value}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	// The public status/settings keep their existing shape. Enforcement reads the
	// database head, never the periodically refreshed options cache.
	if err := updateOptionMap("legal.user_agreement", published.UserAgreement); err != nil {
		return nil, err
	}
	if err := updateOptionMap("legal.privacy_policy", published.PrivacyPolicy); err != nil {
		return nil, err
	}
	return published, nil
}

// ValidateLegalAcceptance checks the displayed revision before account creation.
// RecordLegalConsentWithTx rechecks it under the publication lock at commit.
func ValidateLegalAcceptance(version *LegalVersion, acceptance *LegalAcceptance) error {
	if version == nil || (version.UserAgreement == "" && version.PrivacyPolicy == "") {
		return nil
	}
	if acceptance == nil || !acceptance.Accepted {
		return ErrLegalConsentRequired
	}
	if acceptance.VersionId != version.Id {
		return ErrLegalVersionChanged
	}
	return nil
}

func RecordLegalConsentWithTx(tx *gorm.DB, userID int, acceptance *LegalAcceptance) error {
	version, err := CurrentLegalVersion(tx, true)
	if err != nil {
		return err
	}
	if err := ValidateLegalAcceptance(version, acceptance); err != nil {
		return err
	}
	if version == nil || (version.UserAgreement == "" && version.PrivacyPolicy == "") {
		return nil
	}
	if userID <= 0 {
		return errors.New("invalid consent user")
	}
	// Replays are idempotent and preserve the first server-recorded timestamp.
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&LegalConsent{UserId: userID, VersionId: version.Id, AcceptedAt: time.Now().Unix()}).Error
}

func NeedsLegalConsent(userID int) (bool, error) {
	version, err := CurrentLegalVersion(DB, false)
	if err != nil || version == nil {
		return false, err
	}
	if version.UserAgreement == "" && version.PrivacyPolicy == "" {
		return false, nil
	}
	var count int64
	err = DB.Model(&LegalConsent{}).Where("user_id = ? AND version_id >= ?", userID, version.RequiredVersion).Count(&count).Error
	return count == 0, err
}
