package dshsetup

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"sync"
	"time"
)

// CodeLifetime is how long a setup code can be redeemed. It follows the ten
// minute ceiling OWASP ASVS 5.0 sets for out-of-band codes (6.5.5).
const CodeLifetime = 10 * time.Minute

// Grant is what a setup code stands for: one user's key.
type Grant struct {
	UserID  int
	TokenID int
}

type pendingGrant struct {
	Grant
	expires time.Time
}

// CodeStore keeps the setup codes that have been handed out and not yet used.
// A code is 192 random bits, is stored only as its SHA-256 digest, can be
// redeemed once, and is replaced when the same user asks for another.
//
// Codes live in this process's memory: they do not survive a restart and are
// not shared between nodes, so the feature assumes a single-node deployment.
type CodeStore struct {
	mu      sync.Mutex
	pending map[[sha256.Size]byte]pendingGrant
	byUser  map[int][sha256.Size]byte
	now     func() time.Time
}

func NewCodeStore() *CodeStore {
	return &CodeStore{
		pending: make(map[[sha256.Size]byte]pendingGrant),
		byUser:  make(map[int][sha256.Size]byte),
		now:     time.Now,
	}
}

// Codes holds the setup codes of the running gateway.
var Codes = NewCodeStore()

// Issue creates a setup code for the grant and withdraws any code the same
// user still had outstanding.
func (s *CodeStore) Issue(grant Grant) (code string, expires time.Time, err error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return "", time.Time{}, err
	}
	code = base64.RawURLEncoding.EncodeToString(raw)
	digest := sha256.Sum256([]byte(code))

	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	for other, grant := range s.pending {
		if !now.Before(grant.expires) {
			delete(s.pending, other)
			delete(s.byUser, grant.UserID)
		}
	}
	if previous, ok := s.byUser[grant.UserID]; ok {
		delete(s.pending, previous)
	}
	expires = now.Add(CodeLifetime)
	s.pending[digest] = pendingGrant{Grant: grant, expires: expires}
	s.byUser[grant.UserID] = digest
	return code, expires, nil
}

// Redeem uses a code up and returns its grant. A code that is unknown, already
// used or expired yields false; the three cases are deliberately not told apart.
func (s *CodeStore) Redeem(code string) (Grant, bool) {
	digest := sha256.Sum256([]byte(code))

	s.mu.Lock()
	defer s.mu.Unlock()
	grant, ok := s.pending[digest]
	if !ok {
		return Grant{}, false
	}
	delete(s.pending, digest)
	delete(s.byUser, grant.UserID)
	if !s.now().Before(grant.expires) {
		return Grant{}, false
	}
	return grant.Grant, true
}
