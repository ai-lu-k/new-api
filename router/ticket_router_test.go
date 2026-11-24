package router

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/QuantumNous/new-api/controller"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The dashboard reads the administrator queue from GET /api/ticket/, in the
// same group as the ticket pages. The handler shipped without a route, so the
// page could only ever retry a missing path and never showed a ticket.
func TestAdministratorTicketQueueServesItsHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetApiRouter(engine)

	// Another handler behind the same administrator check would answer the
	// request as well, so name the handler and not only the status code.
	expected := reflect.ValueOf(controller.GetAllTickets).Pointer()
	for _, path := range []string{"/api/ticket", "/api/ticket/"} {
		registered := false
		for _, route := range engine.Routes() {
			if route.Method != http.MethodGet || route.Path != path {
				continue
			}
			registered = true
			assert.Equal(t, expected, reflect.ValueOf(route.HandlerFunc).Pointer(), "GET %s must serve the queue", path)
		}
		require.True(t, registered, "GET %s must be registered", path)

		// An anonymous caller is stopped by the administrator check, which only
		// runs once the request reaches the queue route: an unregistered path
		// answers 404, and the slash form is redirected away first.
		recorder := httptest.NewRecorder()
		engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
		assert.Equal(t, http.StatusUnauthorized, recorder.Code, "GET %s must reach the administrator queue", path)
	}
}
