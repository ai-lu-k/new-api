package controller

import "time"

// WorkBuddy hub calls the console may forward. Each entry is one console key and
// the single hub path behind it: the console can name a key, never a path, so a
// compromised dashboard session cannot walk the hub's API.
//
// Methods are not listed because they follow the caller (GET reads, POST
// writes); the hub itself rejects a method it does not serve.
const workbuddyHubSlowTimeout = 180 * time.Second

func init() {
	routes := map[string]string{
		// Accounts
		"accounts":                "/accounts",
		"accounts.credits":        "/accounts/credits",
		"accounts.credits.detail": "/accounts/credits/detail",
		"accounts.credits.grants": "/accounts/credits/grants",
		"accounts.product":        "/accounts/product",
		"accounts.export":         "/accounts/export",
		"accounts.set":            "/accounts/set",
		"accounts.set-all":        "/accounts/set-all",
		"accounts.delete":         "/accounts/delete",
		"accounts.import":         "/accounts/import",
		"accounts.import.desktop": "/accounts/import/desktop",
		"accounts.refresh":        "/accounts/refresh",
		"accounts.test":           "/accounts/test",
		"accounts.credits.fetch":  "/accounts/credits/fetch",
		"accounts.sync-profile":   "/accounts/sync-profile",
		"accounts.add-api-key":    "/accounts/add-api-key",
		"accounts.checkin":        "/accounts/checkin",
		"accounts.daily-chat":     "/accounts/daily-chat",
		"accounts.daily-chat-web": "/accounts/daily-chat-web",
		"accounts.login.start":    "/accounts/login/start",
		"accounts.login.poll":     "/accounts/login/poll",
		"accounts.login.cancel":   "/accounts/login/cancel",
		// Usage and analytics
		"usage":              "/usage",
		"usage.analytics":    "/usage/analytics",
		"usage.by-account":   "/usage/by-account",
		"usage.perf":         "/usage/perf",
		"usage.recent":       "/usage/recent",
		"usage.remaining":    "/usage/remaining",
		"usage.timeseries":   "/usage/timeseries",
		"v1.usage":           "/v1/usage",
		"v1.balance-summary": "/v1/balance-summary",
		// Tasks, activity and welfare
		"tasks":              "/tasks",
		"tasks.claim":        "/tasks/claim",
		"tasks.run":          "/tasks/run",
		"tasks.streak-bonus": "/tasks/streak-bonus",
		"tasks.travel":       "/tasks/travel",
		"activity.history":   "/activity/history",
		"scheduler":          "/scheduler",
		"scheduler.toggle":   "/scheduler/toggle",
		"scheduler.trigger":  "/scheduler/trigger",
		// Gateway, pricing and updates
		"health":           "/health",
		"realm":            "/realm",
		"pricing":          "/pricing",
		"pricing.mapping":  "/pricing/mapping",
		"pricing.refresh":  "/pricing/refresh",
		"catalog.refresh":  "/catalog/refresh",
		"quota-scan.run":   "/quota-scan/run",
		"updates":          "/updates",
		"updates.backups":  "/updates/backups",
		"updates.check":    "/updates/check",
		"updates.install":  "/updates/install",
		"updates.rollback": "/updates/rollback",
		"console.state":    "/console/state",
		"console.toggle":   "/console/toggle",
		// Settings, proxy slots, agents and logs
		"settings":               "/settings",
		"settings.save":          "/settings/save",
		"settings.reveal":        "/settings/reveal",
		"panel.status":           "/panel/status",
		"panel.password":         "/panel/password",
		"proxy.discover":         "/proxy/discover",
		"proxy.slots":            "/proxy/slots",
		"proxy.slots.save":       "/proxy/slots/save",
		"proxy.slots.test":       "/proxy/slots/test",
		"agents":                 "/agents",
		"agents.available":       "/agents/available",
		"agents.cli":             "/agents/cli",
		"agents.apply":           "/agents/apply",
		"agents.restore":         "/agents/restore",
		"agents.model-selection": "/agents/model-selection",
		"logs":                   "/logs",
		"logs.clear":             "/logs/clear",
		"logs.export":            "/logs/export",
	}
	slow := map[string]bool{
		"accounts.refresh":        true,
		"accounts.test":           true,
		"accounts.credits.fetch":  true,
		"accounts.import":         true,
		"accounts.import.desktop": true,
		"accounts.checkin":        true,
		"accounts.daily-chat":     true,
		"accounts.daily-chat-web": true,
		"accounts.login.poll":     true,
		"tasks.run":               true,
		"tasks.travel":            true,
		"pricing.refresh":         true,
		"catalog.refresh":         true,
		"quota-scan.run":          true,
		"updates.check":           true,
		"updates.install":         true,
		"updates.rollback":        true,
		"proxy.discover":          true,
		"proxy.slots.test":        true,
		"agents.available":        true,
	}
	for key, path := range routes {
		timeout := time.Duration(0)
		if slow[key] {
			timeout = workbuddyHubSlowTimeout
		}
		registerWorkbuddyHubRoute(key, path, timeout)
	}
}
