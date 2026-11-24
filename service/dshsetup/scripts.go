package dshsetup

import (
	_ "embed"
	"fmt"
	"strings"
)

//go:embed setup.sh
var shellScript string

//go:embed setup.ps1
var powerShellScript string

//go:embed claude-setup.sh
var claudeScript string

//go:embed claude-setup.ps1
var claudePowerShellScript string

// Script returns the setup script for a shell ("sh" or "ps1"), pointed at this
// gateway. The script carries no secret: it is the same for every user and
// asks for the configuration itself once it runs.
func Script(shell string, serverAddress string, siteName string) (string, error) {
	var script string
	switch shell {
	case "sh":
		script = shellScript
	case "ps1":
		script = powerShellScript
	default:
		return "", fmt.Errorf("dsh setup: no script for shell %q", shell)
	}
	return render(script, serverAddress, siteName)
}

// ClaudeScript returns the setup script for Claude Code, pointed at this
// gateway, for a shell ("sh" or "ps1"). Like the DSH script it carries no
// secret: it saves the account's key into the client's own settings file once
// the code is redeemed.
func ClaudeScript(shell string, serverAddress string, siteName string) (string, error) {
	var script string
	switch shell {
	case "sh":
		script = claudeScript
	case "ps1":
		script = claudePowerShellScript
	default:
		return "", fmt.Errorf("dsh setup: no Claude Code script for shell %q", shell)
	}
	return render(script, serverAddress, siteName)
}

// render fills in the two values every setup script is served with.
func render(script string, serverAddress string, siteName string) (string, error) {
	base, err := gatewayBase(serverAddress)
	if err != nil {
		return "", err
	}
	// The name is shown in messages and sits inside a single-quoted string in
	// both shells, where an apostrophe would end the string.
	siteName = strings.Map(func(r rune) rune {
		if r == '\'' || r < ' ' || r == 0x7f {
			return -1
		}
		return r
	}, siteName)
	if siteName == "" {
		siteName = "New API"
	}
	return strings.NewReplacer("__BASE_URL__", base, "__SITE_NAME__", siteName).Replace(script), nil
}
