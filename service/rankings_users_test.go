package service

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
)

func TestMaskRankingName(t *testing.T) {
	cases := []struct{ in, want string }{
		{"", "***"},
		{"a", "a***"},
		{"ab", "a***"},
		{"abc", "a***c"},
		{"abcd", "a***d"},
		{"abcde", "ab***de"},
		{"kano07", "ka***07"},
		{"大肥鲸", "大***鲸"},
		{"中转站用户", "中转***用户"},
	}
	for _, tc := range cases {
		if got := maskRankingName(tc.in); got != tc.want {
			t.Errorf("maskRankingName(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestPublicRankingNamePrefersDisplayNameThenMasks(t *testing.T) {
	row := model.UserUsageRow{Username: "kano07", DisplayName: "大肥鲸"}
	if got, want := publicRankingName(row), "大***鲸"; got != want {
		t.Errorf("publicRankingName(display name) = %q, want %q", got, want)
	}

	row.DisplayName = "   "
	if got, want := publicRankingName(row), "ka***07"; got != want {
		t.Errorf("publicRankingName(blank display name) = %q, want %q", got, want)
	}

	row.Username = ""
	if got, want := publicRankingName(row), "***"; got != want {
		t.Errorf("publicRankingName(no name at all) = %q, want %q", got, want)
	}
}
