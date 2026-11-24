package router

import (
	"embed"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// WebAssets holds the embedded dashboard frontend assets.
type WebAssets struct {
	BuildFS   embed.FS
	IndexPage []byte
}

func SetWebRouter(router *gin.Engine, assets WebAssets, pluginDispatcher gin.HandlerFunc) {
	setWebRouter(router, common.EmbedFolder(assets.BuildFS, "web/dist"), assets.IndexPage, pluginDispatcher)
}

func setWebRouter(router *gin.Engine, frontendFS static.ServeFileSystem, indexPage []byte, pluginDispatcher gin.HandlerFunc) {
	router.GET("/robots.txt", middleware.RouteTag("web"), middleware.GlobalWebRateLimit(), controller.GetRobotsTxt)
	router.GET("/sitemap.xml", middleware.RouteTag("web"), middleware.GlobalWebRateLimit(), controller.GetSitemap)

	router.NoRoute(
		pluginDispatcher,
		middleware.RouteTag("web"),
		gzip.Gzip(gzip.DefaultCompression),
		middleware.AccessTokenAudit(),
		middleware.Cache(),
		// Content-hashed bundles are immutable and one page load fetches dozens
		// of them, so they are served before the per-IP web limit. Charging them
		// to it locked normal readers out after a few reloads.
		static.Serve("/", frontendFS),
		middleware.GlobalWebRateLimit(),
		func(c *gin.Context) {
			if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") || strings.HasPrefix(c.Request.RequestURI, "/static") {
				controller.RelayNotFound(c)
				return
			}
			// Retired campaign payloads used to live under /ctf. Those URLs must
			// stay 404 instead of falling through to the single-page app, which
			// would answer 200 with the index HTML for a payload nobody serves.
			// Live payloads come from /api/campaign/files/<name>.
			if strings.HasPrefix(c.Request.URL.Path, "/ctf/") {
				c.Status(http.StatusNotFound)
				return
			}
			c.Header("Cache-Control", "no-cache")
			c.Data(http.StatusOK, "text/html; charset=utf-8", controller.SitePage(c, indexPage))
		},
	)
}
