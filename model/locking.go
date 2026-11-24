package model

import (
	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// lockForUpdate makes the next query emit SELECT ... FOR UPDATE so the matched
// rows stay locked until the surrounding transaction ends.
//
// GORM v2 silently ignores the legacy `Set("gorm:query_option", "FOR UPDATE")`
// from GORM v1, so that form does not lock anything. Always use this helper
// instead.
//
// SQLite has no FOR UPDATE syntax (the clause would be a syntax error), so it
// is skipped there; SQLite's single-writer model makes one of two conflicting
// transactions fail instead of both committing.
func lockForUpdate(tx *gorm.DB) *gorm.DB {
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		return tx
	}
	return tx.Clauses(clause.Locking{Strength: "UPDATE"})
}

// lockUserRow serializes per-account accounting across gateway instances.
// SQLite needs a write before any read to avoid a deferred-transaction upgrade
// race; other dialects use the shared row-lock helper.
func lockUserRow(tx *gorm.DB, userID int) error {
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		if err := tx.Model(&User{}).Where("id = ?", userID).UpdateColumn("id", gorm.Expr("id")).Error; err != nil {
			return err
		}
	}
	var user User
	return lockForUpdate(tx).Select("id").First(&user, userID).Error
}
