package dshsetup

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"slices"
	"sync"
	"time"
)

// CodeLifetime is how long a setup code can be redeemed. It follows the ten
// minute ceiling OWASP ASVS 5.0 sets for out-of-band codes (6.5.5).
const CodeLifetime = 10 * time.Minute

// MaxPendingPerUser is how many unused codes one user can hold at a time. The
// website asks for a code whenever its setup page is opened, so opening it
// again must not void the code the user has just copied; past this number the
// oldest one goes.
const MaxPendingPerUser = 5

type codeDigest = [sha256.Size]byte

type pendingCode struct {
	userID  int
	expires time.Time
}

// CodeStore keeps the setup codes that have been handed out and not yet used.
// A code is 192 random bits, is stored only as its SHA-256 digest, and can be
// redeemed once. It stands for a user, not for a key: the key is looked up or
// created when the code is redeemed.
//
// Codes live in this process's memory: they do not survive a restart and are
// not shared between nodes, so the feature assumes a single-node deployment.
type CodeStore struct {
	mu      sync.Mutex
	pending map[codeDigest]pendingCode
	// byUser lists each user's unused codes, oldest first.
	byUser map[int][]codeDigest
	now    func() time.Time
}

func NewCodeStore() *CodeStore {
	return &CodeStore{
		pending: make(map[codeDigest]pendingCode),
		byUser:  make(map[int][]codeDigest),
		now:     time.Now,
	}
}

// Codes holds the setup codes of the running gateway.
var Codes = NewCodeStore()

// Issue creates a setup code for the user. Codes the user got earlier stay
// valid, up to MaxPendingPerUser of them.
func (s *CodeStore) Issue(userID int) (code string, expires time.Time, err error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return "", time.Time{}, err
	}
	code = base64.RawURLEncoding.EncodeToString(raw)
	digest := sha256.Sum256([]byte(code))

	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	for other, pending := range s.pending {
		if !now.Before(pending.expires) {
			s.forget(other, pending.userID)
		}
	}
	for len(s.byUser[userID]) >= MaxPendingPerUser {
		s.forget(s.byUser[userID][0], userID)
	}
	expires = now.Add(CodeLifetime)
	s.pending[digest] = pendingCode{userID: userID, expires: expires}
	s.byUser[userID] = append(s.byUser[userID], digest)
	return code, expires, nil
}

// Redeem uses a code up and returns the user it was issued to. A code that is
// unknown, already used or expired yields false; the three cases are
// deliberately not told apart.
func (s *CodeStore) Redeem(code string) (userID int, ok bool) {
	digest := sha256.Sum256([]byte(code))

	s.mu.Lock()
	defer s.mu.Unlock()
	pending, ok := s.pending[digest]
	if !ok {
		return 0, false
	}
	s.forget(digest, pending.userID)
	if !s.now().Before(pending.expires) {
		return 0, false
	}
	return pending.userID, true
}

// forget drops one code. The caller holds the lock.
func (s *CodeStore) forget(digest codeDigest, userID int) {
	delete(s.pending, digest)
	codes := slices.DeleteFunc(s.byUser[userID], func(other codeDigest) bool { return other == digest })
	if len(codes) == 0 {
		delete(s.byUser, userID)
		return
	}
	s.byUser[userID] = codes
}
