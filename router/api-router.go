package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/service/authz"

	// Import oauth package to register providers via init()
	_ "github.com/QuantumNous/new-api/oauth"

	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

func SetApiRouter(router *gin.Engine) {
	apiRouter := router.Group("/api")
	apiRouter.Use(middleware.RouteTag("api"))
	apiRouter.Use(middleware.NoIndex())
	apiRouter.Use(gzip.Gzip(gzip.DefaultCompression))
	apiRouter.Use(middleware.AccessTokenAudit())
	apiRouter.Use(middleware.BodyStorageCleanup()) // 清理请求体存储
	apiRouter.Use(middleware.GlobalAPIRateLimit())
	anonymousRequestBodyLimit := middleware.AnonymousRequestBodyLimit()
	{
		apiRouter.GET("/setup", controller.GetSetup)
		apiRouter.POST("/setup", anonymousRequestBodyLimit, controller.PostSetup)
		apiRouter.GET("/status", controller.GetStatus)
		apiRouter.GET("/uptime/status", controller.GetUptimeKumaStatus)
		apiRouter.GET("/models", middleware.UserAuth(), controller.DashboardListModels)
		apiRouter.GET("/status/test", middleware.AdminAuth(), controller.TestStatus)
		apiRouter.GET("/notice", controller.GetNotice)
		apiRouter.GET("/topup/campaign", middleware.DisableCache(), controller.GetTopUpCampaign)
		apiRouter.GET("/user-agreement", controller.GetUserAgreement)
		apiRouter.GET("/privacy-policy", controller.GetPrivacyPolicy)
		apiRouter.GET("/legal/current", controller.GetLegalVersion)
		apiRouter.GET("/legal/versions/:version", controller.GetLegalVersion)
		apiRouter.GET("/about", controller.GetAbout)
		apiRouter.GET("/expense_ledger", controller.GetExpenseLedger)
		//apiRouter.GET("/midjourney", controller.GetMidjourney)
		apiRouter.GET("/home_page_content", controller.GetHomePageContent)
		apiRouter.GET("/dsh_setup/models", middleware.TryUserAuth(), controller.GetDshSetupModels)
		apiRouter.GET("/dsh_setup/:script", controller.GetDshSetupScript)
		// The setup page asks for a code each time it is opened, so this must not
		// draw on the per-address budget that sign-in shares; unused codes are
		// capped per user instead.
		apiRouter.POST("/dsh_setup/code", middleware.UserAuth(), middleware.DisableCache(), controller.CreateDshSetupCode)
		apiRouter.POST("/dsh_setup/redeem", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, controller.RedeemDshSetupCode)
		apiRouter.GET("/pricing", middleware.HeaderNavModuleAuth("pricing"), controller.GetPricing)
		apiRouter.GET("/benchmark", middleware.HeaderNavModuleAuth("pricing"), controller.GetBenchmarkScores)
		perfMetricsRoute := apiRouter.Group("/perf-metrics")
		perfMetricsRoute.Use(middleware.HeaderNavModulePublicOrUserAuth("pricing"))
		{
			perfMetricsRoute.GET("/summary", controller.GetPerfMetricsSummary)
			perfMetricsRoute.GET("", controller.GetPerfMetrics)
		}
		apiRouter.GET("/rankings", middleware.HeaderNavModuleAuth("rankings"), controller.GetRankings)

		// Campaign: open to visitors, rewarded after sign-in. The guard answers
		// 404 for every route while no campaign is being served, so switching a
		// campaign off takes it offline instead of leaving a corpse that still
		// publishes statistics.
		campaignRoute := apiRouter.Group("/campaign")
		campaignRoute.Use(middleware.DisableCache(), middleware.CampaignEnabled())
		{
			campaignRoute.GET("", middleware.TryUserAuth(), controller.GetCampaignStatus)
			campaignRoute.GET("/files/:name", controller.GetCampaignFile)
			campaignRoute.POST("/submit", middleware.TryUserAuth(), middleware.CampaignSubmitRateLimit(), controller.SubmitCampaignAnswer)
			campaignRoute.POST("/claim", middleware.UserAuth(), controller.ClaimCampaignGuestProgress)
			campaignRoute.POST("/share", middleware.UserAuth(), controller.ClaimCampaignShare)
			campaignRoute.POST("/admin/settle", middleware.AdminAuth(), controller.SettleCampaignRankingRewards)
		}
		apiRouter.GET("/verification", middleware.EmailVerificationRateLimit(), middleware.TurnstileCheck(), controller.SendEmailVerification)
		apiRouter.GET("/reset_password", middleware.CriticalRateLimit(), middleware.TurnstileCheck(), controller.SendPasswordResetEmail)
		apiRouter.POST("/user/reset", middleware.CriticalRateLimit(), anonymousRequestBodyLimit, controller.ResetPassword)
		// OAuth routes - specific routes must come before :provider wildcard
		apiRouter.POST("/oauth/state", middleware.CriticalRateLimit(), middleware.DisableCache(), middleware.TryUserAuth(), anonymousRequestBodyLimit, controller.GenerateOAuthCode)
		apiRouter.POST("/oauth/email/bind/start", middleware.UserAuth(), middleware.CriticalRateLimit(), middleware.UserCriticalRateLimit("account-security"), middleware.EmailVerificationRateLimit(), middleware.DisableCache(), controller.EmailBindStart)
		apiRouter.POST("/oauth/email/bind/resend", middleware.UserAuth(), middleware.CriticalRateLimit(), middleware.UserCriticalRateLimit("account-security"), middleware.EmailVerificationRateLimit(), middleware.DisableCache(), controller.EmailBindResend)
		apiRouter.POST("/oauth/email/bind", middleware.UserAuth(), middleware.CriticalRateLimit(), middleware.UserCriticalRateLimit("account-security"), middleware.DisableCache(), controller.EmailBind)
		// WeChat uses its existing authorization-code service.
		apiRouter.POST("/oauth/wechat", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, controller.WeChatAuth)
		apiRouter.GET("/oauth/wechat", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.WeChatAuth)
		apiRouter.POST("/oauth/wechat/bind", middleware.UserAuth(), middleware.CriticalRateLimit(), controller.WeChatBind)
		apiRouter.GET("/oauth/telegram/login", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.TelegramLegacyAuth)
		apiRouter.POST("/oauth/telegram/bind/start", middleware.UserAuth(), middleware.CriticalRateLimit(), middleware.DisableCache(), controller.TelegramLegacyAuth)
		apiRouter.GET("/oauth/telegram/bind/:flow_token", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.TelegramLegacyAuth)
		// Standard OAuth providers (GitHub, Discord, OIDC, LinuxDO, Telegram) - unified route
		apiRouter.GET("/oauth/:provider", middleware.CriticalRateLimit(), middleware.DisableCache(), middleware.TryUserAuth(), controller.HandleOAuth)
		apiRouter.GET("/ratio_config", middleware.CriticalRateLimit(), controller.GetRatioConfig)

		apiRouter.POST("/stripe/webhook", anonymousRequestBodyLimit, controller.StripeWebhook)
		apiRouter.POST("/creem/webhook", anonymousRequestBodyLimit, controller.CreemWebhook)
		apiRouter.POST("/waffo/webhook", anonymousRequestBodyLimit, controller.WaffoWebhook)
		// :env separates test vs prod URLs so the operator can register each
		// in Pancake's matching webhook slot; handler enforces env match.
		apiRouter.POST("/waffo-pancake/webhook/:env", anonymousRequestBodyLimit, controller.WaffoPancakeWebhook)

		// Universal secure verification routes
		apiRouter.GET("/verify/methods", middleware.UserAuth(), middleware.DisableCache(), controller.GetVerificationMethods)
		apiRouter.POST("/verify", middleware.UserAuth(), middleware.CriticalRateLimit(), middleware.UserCriticalRateLimit("security-verification"), middleware.DisableCache(), controller.UniversalVerify)

		userRoute := apiRouter.Group("/user")
		{
			userRoute.POST("/auth/refresh", middleware.SessionCookieOriginGuard(), middleware.CriticalRateLimit(), middleware.DisableCache(), controller.RefreshAuth)
			userRoute.POST("/auth/logout", middleware.SessionCookieOriginGuard(), middleware.CriticalRateLimit(), middleware.DisableCache(), controller.AuthLogout)
			userRoute.GET("/registration-device", middleware.DisableCache(), controller.RegistrationRewardDevice)
			userRoute.POST("/registration-verification/code", middleware.SessionCookieOriginGuard(), middleware.CriticalRateLimit(), anonymousRequestBodyLimit, controller.SendRegistrationRewardCode)
			userRoute.POST("/registration-verification/verify", middleware.SessionCookieOriginGuard(), middleware.CriticalRateLimit(), anonymousRequestBodyLimit, controller.VerifyRegistrationReward)
			userRoute.POST("/register", middleware.CriticalRateLimit(), anonymousRequestBodyLimit, middleware.TurnstileCheck(), controller.Register)
			userRoute.GET("/login/encryption-key", middleware.DisableCache(), controller.GetPasswordEncryptionKey)
			userRoute.POST("/login", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, middleware.TurnstileCheck(), controller.Login)
			userRoute.POST("/login/2fa", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, controller.Verify2FALogin)
			userRoute.POST("/login/verify", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, controller.VerifyLogin)
			userRoute.POST("/login/passkey/begin", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, controller.LoginPasskeyBegin)
			userRoute.POST("/login/passkey/finish", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, controller.LoginPasskeyFinish)
			userRoute.POST("/passkey/login/begin", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, controller.PasskeyLoginBegin)
			userRoute.POST("/passkey/login/finish", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, controller.PasskeyLoginFinish)
			//userRoute.POST("/tokenlog", middleware.CriticalRateLimit(), controller.TokenLog)
			userRoute.POST("/epay/notify", anonymousRequestBodyLimit, controller.EpayNotify)
			userRoute.GET("/epay/notify", controller.EpayNotify)
			userRoute.GET("/groups", controller.GetUserGroups)

			selfRoute := userRoute.Group("/")
			selfRoute.Use(middleware.DisableCache(), middleware.UserAuth())
			{
				selfRoute.GET("/sessions", middleware.DisableCache(), controller.GetLoginSessions)
				selfRoute.DELETE("/sessions/:sid", middleware.DisableCache(), controller.DeleteLoginSession)
				selfRoute.POST("/sessions/revoke-others", middleware.DisableCache(), controller.RevokeOtherLoginSessions)
				selfRoute.GET("/self/groups", controller.GetUserGroups)
				selfRoute.GET("/self/usage-source", controller.GetSelfUsageSource)
				selfRoute.GET("/self", controller.GetSelf)
				selfRoute.GET("/self/model-daily-tokens", controller.GetModelDailyTokenBudgets)
				selfRoute.GET("/legal-consent", controller.GetLegalConsent)
				selfRoute.POST("/legal-consent", middleware.UserCriticalRateLimit("legal-consent"), controller.AcceptLegalConsent)
				selfRoute.GET("/registration-reward", controller.GetRegistrationReward)
				selfRoute.POST("/registration-reward/retry", middleware.SessionCookieOriginGuard(), middleware.UserCriticalRateLimit("reward-retry"), controller.RetryRegistrationReward)
				selfRoute.GET("/referral", controller.GetReferralOverview)
				selfRoute.POST("/referral/banner", middleware.DisableCache(), controller.DismissReferralBanner)
				selfRoute.GET("/models", controller.GetUserModels)
				selfRoute.PUT("/self", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.UpdateSelf)
				selfRoute.DELETE("/self", middleware.DisableCache(), controller.DeleteSelf)
				selfRoute.GET("/token", middleware.CriticalRateLimit(), middleware.UserCriticalRateLimit("access-token"), middleware.DisableCache(), controller.GenerateAccessToken)
				selfRoute.GET("/token/status", middleware.DisableCache(), controller.GetAccessTokenStatus)
				selfRoute.POST("/token", middleware.CriticalRateLimit(), middleware.UserCriticalRateLimit("access-token"), middleware.DisableCache(), controller.GenerateAccessToken)
				selfRoute.DELETE("/token", middleware.CriticalRateLimit(), middleware.UserCriticalRateLimit("access-token"), middleware.DisableCache(), controller.RevokeAccessToken)
				selfRoute.GET("/passkey", controller.PasskeyStatus)
				selfRoute.POST("/passkey/register/begin", middleware.UserCriticalRateLimit("security-verification"), middleware.DisableCache(), controller.PasskeyRegisterBegin)
				selfRoute.POST("/passkey/register/finish", middleware.UserCriticalRateLimit("security-verification"), middleware.DisableCache(), controller.PasskeyRegisterFinish)
				selfRoute.POST("/passkey/verify/begin", middleware.UserCriticalRateLimit("security-verification"), middleware.DisableCache(), controller.PasskeyVerifyBegin)
				selfRoute.POST("/passkey/verify/finish", middleware.UserCriticalRateLimit("security-verification"), middleware.DisableCache(), controller.PasskeyVerifyFinish)
				selfRoute.DELETE("/passkey", middleware.DisableCache(), controller.PasskeyDelete)
				selfRoute.GET("/aff", controller.GetAffCode)
				selfRoute.GET("/topup/info", controller.GetTopUpInfo)
				selfRoute.GET("/topup/self", controller.GetUserTopUps)
				selfRoute.POST("/topup", middleware.CriticalRateLimit(), controller.TopUp)
				selfRoute.POST("/pay", middleware.CriticalRateLimit(), controller.RequestEpay)
				selfRoute.POST("/amount", controller.RequestAmount)
				selfRoute.POST("/stripe/pay", middleware.CriticalRateLimit(), controller.RequestStripePay)
				selfRoute.POST("/stripe/amount", controller.RequestStripeAmount)
				selfRoute.POST("/creem/pay", middleware.CriticalRateLimit(), controller.RequestCreemPay)
				selfRoute.POST("/waffo/amount", controller.RequestWaffoAmount)
				selfRoute.POST("/waffo/pay", middleware.CriticalRateLimit(), controller.RequestWaffoPay)
				selfRoute.POST("/waffo-pancake/amount", controller.RequestWaffoPancakeAmount)
				selfRoute.POST("/waffo-pancake/pay", middleware.CriticalRateLimit(), controller.RequestWaffoPancakePay)
				selfRoute.POST("/aff_transfer", middleware.UserCriticalRateLimit("aff-transfer"), controller.TransferAffQuota)
				selfRoute.PUT("/setting", controller.UpdateUserSetting)

				// Vouchers: money an administrator handed out that the owner
				// still has to open. Opening is what credits the wallet.
				selfRoute.GET("/vouchers", controller.GetMyVouchers)
				selfRoute.GET("/vouchers/pending", middleware.DisableCache(), controller.GetPendingVouchers)
				selfRoute.POST("/vouchers/open", middleware.UserCriticalRateLimit("voucher.open"), controller.OpenVouchers)
				selfRoute.POST("/vouchers/acknowledge", controller.AcknowledgeVouchers)

				// 2FA routes
				selfRoute.GET("/2fa/status", controller.Get2FAStatus)
				selfRoute.POST("/2fa/setup", middleware.UserCriticalRateLimit("security-verification"), middleware.DisableCache(), controller.Setup2FA)
				selfRoute.POST("/2fa/enable", middleware.UserCriticalRateLimit("security-verification"), middleware.DisableCache(), controller.Enable2FA)
				selfRoute.POST("/2fa/disable", middleware.DisableCache(), controller.Disable2FA)
				selfRoute.POST("/2fa/backup_codes", middleware.DisableCache(), controller.RegenerateBackupCodes)

				// Check-in routes
				selfRoute.GET("/checkin", controller.GetCheckinStatus)
				selfRoute.POST("/checkin", middleware.DisableCache(), controller.DoCheckin)

				// Custom OAuth bindings
				selfRoute.GET("/oauth/bindings", controller.GetUserOAuthBindings)
				selfRoute.DELETE("/oauth/bindings/:provider_id", controller.UnbindCustomOAuth)
			}

			adminRoute := userRoute.Group("/")
			adminRoute.Use(middleware.AdminAuth())
			{
				adminRoute.GET("/", controller.GetAllUsers)
				adminRoute.GET("/topup", controller.GetAllTopUps)
				adminRoute.POST("/topup/complete", controller.AdminCompleteTopUp)
				adminRoute.GET("/search", controller.SearchUsers)
				adminRoute.GET("/:id/oauth/bindings", controller.GetUserOAuthBindingsByAdmin)
				adminRoute.DELETE("/:id/oauth/bindings/:provider_id", controller.UnbindCustomOAuthByAdmin)
				adminRoute.DELETE("/:id/bindings/:binding_type", controller.AdminClearUserBinding)
				adminRoute.GET("/:id", controller.GetUser)
				adminRoute.POST("/", controller.CreateUser)
				adminRoute.POST("/manage", controller.ManageUser)
				adminRoute.PUT("/", controller.UpdateUser)
				adminRoute.DELETE("/:id", controller.DeleteUser)
				adminRoute.DELETE("/:id/reset_passkey", controller.AdminResetPasskey)

				// Admin 2FA routes
				adminRoute.GET("/2fa/stats", controller.Admin2FAStats)
				adminRoute.DELETE("/:id/2fa", controller.AdminDisable2FA)
			}
		}

		// Subscription billing (plans, purchase, admin management)
		subscriptionRoute := apiRouter.Group("/subscription")
		subscriptionRoute.Use(middleware.UserAuth())
		{
			subscriptionRoute.GET("/plans", controller.GetSubscriptionPlans)
			subscriptionRoute.GET("/self", controller.GetSubscriptionSelf)
			subscriptionRoute.PUT("/self/preference", controller.UpdateSubscriptionPreference)
			subscriptionRoute.POST("/balance/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestBalancePay)
			subscriptionRoute.POST("/epay/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestEpay)
			subscriptionRoute.POST("/stripe/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestStripePay)
			subscriptionRoute.POST("/creem/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestCreemPay)
			subscriptionRoute.POST("/waffo-pancake/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestWaffoPancakePay)
		}
		subscriptionAdminRoute := apiRouter.Group("/subscription/admin")
		subscriptionAdminRoute.Use(middleware.AdminAuth())
		{
			subscriptionAdminRoute.GET("/plans", controller.AdminListSubscriptionPlans)
			subscriptionAdminRoute.POST("/plans", controller.AdminCreateSubscriptionPlan)
			subscriptionAdminRoute.PUT("/plans/:id", controller.AdminUpdateSubscriptionPlan)
			subscriptionAdminRoute.PATCH("/plans/:id", controller.AdminUpdateSubscriptionPlanStatus)
			subscriptionAdminRoute.POST("/bind", controller.AdminBindSubscription)
			subscriptionAdminRoute.POST("/plans/:id/subscriptions/reset", controller.AdminResetPlanSubscriptions)

			// User subscription management (admin)
			subscriptionAdminRoute.GET("/users/:id/subscriptions", controller.AdminListUserSubscriptions)
			subscriptionAdminRoute.POST("/users/:id/subscriptions", controller.AdminCreateUserSubscription)
			subscriptionAdminRoute.POST("/users/:id/subscriptions/reset", controller.AdminResetUserSubscriptionsByPlan)
			subscriptionAdminRoute.POST("/user_subscriptions/:id/invalidate", controller.AdminInvalidateUserSubscription)
			subscriptionAdminRoute.DELETE("/user_subscriptions/:id", controller.AdminDeleteUserSubscription)
		}

		// Subscription payment callbacks (no auth)
		apiRouter.POST("/subscription/epay/notify", anonymousRequestBodyLimit, controller.SubscriptionEpayNotify)
		apiRouter.GET("/subscription/epay/notify", controller.SubscriptionEpayNotify)
		apiRouter.GET("/subscription/epay/return", controller.SubscriptionEpayReturn)
		apiRouter.POST("/subscription/epay/return", anonymousRequestBodyLimit, controller.SubscriptionEpayReturn)
		optionRoute := apiRouter.Group("/option")
		optionRoute.Use(middleware.RootAuth())
		{
			optionRoute.GET("/", controller.GetOptions)
			optionRoute.GET("/request_policy", controller.GetRequestPolicy)
			optionRoute.PATCH("/request_policy", controller.UpdateRequestPolicy)
			optionRoute.PUT("/", controller.UpdateOption)
			optionRoute.POST("/legal", controller.PublishLegal)
			optionRoute.PUT("/passkey/domains", controller.UpdatePasskeyDomains)
			optionRoute.GET("/model_pricing", controller.GetModelPricingConfig)
			optionRoute.PATCH("/model_pricing", controller.UpdateModelPricingConfig)
			optionRoute.POST("/model_pricing/convert", controller.PreviewModelPricingConversion)
			optionRoute.POST("/model_pricing/preview", controller.PreviewModelPricing)
			optionRoute.POST("/payment_compliance", controller.ConfirmPaymentCompliance)
			optionRoute.GET("/channel_affinity_cache", controller.GetChannelAffinityCacheStats)
			optionRoute.DELETE("/channel_affinity_cache", controller.ClearChannelAffinityCache)
			optionRoute.POST("/rest_model_ratio", controller.ResetModelRatio)
			optionRoute.GET("/waffo-pancake/catalog", controller.ListWaffoPancakeCatalog)
			optionRoute.POST("/waffo-pancake/pair", controller.CreateWaffoPancakePair)
			optionRoute.POST("/waffo-pancake/save", controller.SaveWaffoPancake)
			optionRoute.POST("/waffo-pancake/subscription-product", controller.CreateWaffoPancakeSubscriptionProduct)
			optionRoute.GET("/waffo-pancake/subscription-product-options", controller.ListWaffoPancakeSubscriptionProductOptions)
		}

		// Custom OAuth provider management (root only)
		customOAuthRoute := apiRouter.Group("/custom-oauth-provider")
		customOAuthRoute.Use(middleware.RootAuth())
		{
			customOAuthRoute.POST("/discovery", controller.FetchCustomOAuthDiscovery)
			customOAuthRoute.GET("/", controller.GetCustomOAuthProviders)
			customOAuthRoute.GET("/:id", controller.GetCustomOAuthProvider)
			customOAuthRoute.POST("/", controller.CreateCustomOAuthProvider)
			customOAuthRoute.PUT("/:id", controller.UpdateCustomOAuthProvider)
			customOAuthRoute.DELETE("/:id", controller.DeleteCustomOAuthProvider)
		}
		performanceRoute := apiRouter.Group("/performance")
		performanceRoute.Use(middleware.RootAuth())
		{
			performanceRoute.GET("/stats", controller.GetPerformanceStats)
			performanceRoute.DELETE("/disk_cache", controller.ClearDiskCache)
			performanceRoute.POST("/reset_stats", controller.ResetPerformanceStats)
			performanceRoute.POST("/gc", controller.ForceGC)
			performanceRoute.GET("/logs", controller.GetLogFiles)
			performanceRoute.DELETE("/logs", controller.CleanupLogFiles)
		}
		ratioSyncRoute := apiRouter.Group("/ratio_sync")
		ratioSyncRoute.Use(middleware.RootAuth())
		{
			ratioSyncRoute.GET("/channels", controller.GetSyncableChannels)
			ratioSyncRoute.POST("/fetch", controller.FetchUpstreamRatios)
		}
		taskPluginRoute := apiRouter.Group("/plugin/task")
		taskPluginRoute.Use(middleware.RootAuth())
		{
			taskPluginRoute.GET("", controller.ListTaskPlugins)
			taskPluginRoute.POST("", controller.UploadTaskPlugin)
			taskPluginRoute.PUT("", controller.UploadTaskPlugin)
			taskPluginRoute.GET("/runtime/status", controller.GetTaskPluginRuntime)
			taskPluginRoute.GET("/marketplace/sources", controller.GetTaskPluginMarketplaceSources)
			taskPluginRoute.PUT("/marketplace/sources", controller.UpdateTaskPluginMarketplaceSources)
			taskPluginRoute.GET("/:key", controller.GetTaskPlugin)
			taskPluginRoute.GET("/:key/icon", controller.GetTaskPluginIcon)
			taskPluginRoute.GET("/:key/versions", controller.GetTaskPluginVersions)
			taskPluginRoute.POST("/:key/activate", controller.ActivateTaskPlugin)
			taskPluginRoute.POST("/:key/status", controller.SetTaskPluginStatus)
			taskPluginRoute.POST("/:key/dryrun", controller.DryRunTaskPlugin)
			taskPluginRoute.DELETE("/:key/versions/:version", controller.DeleteTaskPluginVersion)
		}
		apiRouter.GET("/task_plugin_options", middleware.AdminAuth(), middleware.RequirePermission(authz.TaskPluginBind), controller.GetTaskPluginOptions)
		registerChannelRoutes(apiRouter)
		registerAuthzRoutes(apiRouter)
		tokenRoute := apiRouter.Group("/token")
		tokenRoute.Use(middleware.UserAuth())
		tokenRoute.Use(middleware.TokenOperationAudit())
		{
			tokenRoute.GET("/", controller.GetAllTokens)
			tokenRoute.GET("/search", middleware.SearchRateLimit(), controller.SearchTokens)
			tokenRoute.GET("/auto-groups", controller.GetTokenAutoGroups)
			tokenRoute.GET("/plan", middleware.DisableCache(), controller.GetTokenPlan)
			tokenRoute.GET("/plan/coupons", controller.GetTokenPlanCoupons)
			tokenRoute.GET("/plan/coupons/pending", middleware.DisableCache(), controller.GetPendingTokenPlanCoupons)
			tokenRoute.POST("/plan/coupons/acknowledge", controller.AcknowledgeTokenPlanCoupons)
			tokenRoute.POST("/plan/coupons/preview", middleware.UserCriticalRateLimit("token_plan.coupon"), controller.PreviewTokenPlanCoupon)
			tokenRoute.POST("/plan/coupons/use", middleware.UserCriticalRateLimit("token_plan.coupon"), controller.UseTokenPlanCoupon)
			tokenRoute.GET("/plan/operations/:id", controller.GetTokenPlanResetOperation)
			tokenRoute.POST("/plan", middleware.UserCriticalRateLimit("token_plan.create"), controller.CreateTokenPlan)
			tokenRoute.POST("/plan/key", middleware.UserCriticalRateLimit("token_plan.key"), middleware.DisableCache(), controller.ReadTokenPlanKey)
			tokenRoute.PATCH("/plan/settings", middleware.UserCriticalRateLimit("token_plan.settings"), middleware.DisableCache(), controller.UpdateTokenPlanSettings)
			tokenRoute.POST("/plan/rotate", middleware.UserCriticalRateLimit("token_plan.key"), middleware.DisableCache(), controller.ResetTokenPlanKey)
			tokenRoute.GET("/:id", controller.GetToken)
			tokenRoute.POST("/:id/key", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.GetTokenKey)
			tokenRoute.POST("/", controller.AddToken)
			tokenRoute.PUT("/", controller.UpdateToken)
			tokenRoute.DELETE("/:id", controller.DeleteToken)
			tokenRoute.POST("/batch", controller.DeleteTokenBatch)
			tokenRoute.POST("/batch/keys", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.GetTokenKeysBatch)
		}

		usageRoute := apiRouter.Group("/usage")
		usageRoute.Use(middleware.CORS(), middleware.CriticalRateLimit())
		{
			tokenUsageRoute := usageRoute.Group("/token")
			tokenUsageRoute.Use(middleware.TokenAuthReadOnly())
			{
				tokenUsageRoute.GET("/", controller.GetTokenUsage)
			}
		}

		planStatistics := apiRouter.Group("/token-plan/statistics")
		planStatistics.Use(middleware.DisableCache(), middleware.AdminAuth())
		planStatistics.GET("/overview", controller.GetTokenPlanStatisticsOverview)
		planStatistics.GET("/users", controller.GetTokenPlanStatisticsUsers)
		planStatistics.GET("/trend", controller.GetTokenPlanStatisticsTrend)

		couponRoute := apiRouter.Group("/reset-coupons")
		couponRoute.Use(middleware.AdminAuth(), middleware.UserCriticalRateLimit("token_plan.coupon.admin"))
		couponRoute.GET("/batches", controller.ListTokenPlanCouponGrants)
		couponRoute.POST("/preview", controller.PreviewTokenPlanCouponGrant)
		couponRoute.POST("/batches", controller.CreateTokenPlanCouponGrant)
		couponRoute.POST("/batches/:id/continue", controller.ContinueTokenPlanCouponGrant)
		couponRoute.POST("/batches/:id/void", controller.VoidTokenPlanCouponGrant)
		couponRoute.GET("/coupons", func(c *gin.Context) { c.Set("coupon_admin", true); controller.GetTokenPlanCoupons(c) })
		couponRoute.GET("/registration-rewards", middleware.DisableCache(), controller.ListRegistrationRewards)
		couponRoute.GET("/referrals", controller.ListReferralRewards)
		couponRoute.POST("/referrals/:id/reissue", controller.ReissueReferralReward)

		// Administrator side of vouchers: preview an audience, grant, and read
		// the batches already issued.
		voucherRoute := apiRouter.Group("/admin/vouchers")
		voucherRoute.Use(middleware.DisableCache(), middleware.AdminAuth(), middleware.UserCriticalRateLimit("voucher.admin"))
		voucherRoute.GET("/batches", controller.ListVoucherBatches)
		voucherRoute.POST("/preview", controller.PreviewVoucherGrant)
		voucherRoute.POST("/grant", controller.CreateVoucherGrant)
		redemptionRoute := apiRouter.Group("/redemption")
		redemptionRoute.Use(middleware.AdminAuth())
		{
			redemptionRoute.GET("/", controller.GetAllRedemptions)
			redemptionRoute.GET("/search", controller.SearchRedemptions)
			redemptionRoute.GET("/:id", controller.GetRedemption)
			redemptionRoute.POST("/", controller.AddRedemption)
			redemptionRoute.POST("/batch", controller.DeleteRedemptionBatch)
			redemptionRoute.PUT("/", controller.UpdateRedemption)
			redemptionRoute.DELETE("/invalid", controller.DeleteInvalidRedemption)
			redemptionRoute.DELETE("/:id", controller.DeleteRedemption)
		}
		apiRouter.GET("/audit", middleware.DisableCache(), middleware.AdminAuth(), middleware.RequirePermission(authz.AuditRead), controller.GetAuditLogs)
		apiRouter.GET("/audit/self", middleware.DisableCache(), middleware.UserAuth(), controller.GetAuditLogs)
		logRoute := apiRouter.Group("/log")
		logRoute.GET("/", middleware.AdminAuth(), controller.GetAllLogs)
		logRoute.GET("/stat", middleware.AdminAuth(), controller.GetLogsStat)
		logRoute.GET("/self/stat", middleware.UserAuth(), controller.GetLogsSelfStat)
		logRoute.GET("/channel_affinity_usage_cache", middleware.AdminAuth(), controller.GetChannelAffinityUsageCacheStats)
		logRoute.GET("/search", middleware.AdminAuth(), controller.SearchAllLogs)
		logRoute.GET("/self", middleware.UserAuth(), controller.GetUserLogs)
		logRoute.GET("/self/search", middleware.UserAuth(), middleware.SearchRateLimit(), controller.SearchUserLogs)

		systemTaskRoute := apiRouter.Group("/system-task")
		systemTaskRoute.Use(middleware.RootAuth())
		{
			systemTaskRoute.POST("/log-cleanup", controller.CreateLogCleanupSystemTask)
			systemTaskRoute.GET("/list", controller.ListSystemTasks)
			systemTaskRoute.DELETE("/history", controller.DeleteSystemTaskHistory)
			systemTaskRoute.GET("/current", controller.GetCurrentSystemTask)
			systemTaskRoute.GET("/:task_id", controller.GetSystemTask)
		}
		pageViewRoute := apiRouter.Group("/page_views")
		pageViewRoute.Use(middleware.UserAuth())
		{
			pageViewRoute.POST("/", middleware.DisableCache(), controller.RecordPageView)
			pageViewRoute.GET("/popular", middleware.DisableCache(), controller.GetPopularPageViews)
		}
		ticketRoute := apiRouter.Group("/ticket")
		{
			ticketRoute.POST("/", middleware.UserAuth(), middleware.UserCriticalRateLimit("ticket"), controller.CreateTicket)
			// The administrator queue: every ticket on the site. The dashboard
			// asks for the trailing-slash form, and a bare path is the same
			// resource, so both are served instead of leaving the slash form to
			// a redirect that ends on the relay catch-all.
			ticketRoute.GET("", middleware.AdminAuth(), controller.GetAllTickets)
			ticketRoute.GET("/", middleware.AdminAuth(), controller.GetAllTickets)
			ticketRoute.GET("/self", middleware.UserAuth(), controller.GetOwnTickets)
			ticketRoute.POST("/:id/messages", middleware.UserAuth(), middleware.UserCriticalRateLimit("ticket"), controller.AddTicketMessage)
			ticketRoute.GET("/:id", middleware.UserAuth(), controller.GetTicketDetail)
			ticketRoute.PUT("/:id", middleware.AdminAuth(), controller.UpdateTicket)
		}
		apiRouter.GET("/ticket-assignees", middleware.AdminAuth(), controller.GetTicketAssignees)
		ticketAttachmentRoute := apiRouter.Group("/ticket-attachment")
		{
			ticketAttachmentRoute.GET("/:id", middleware.UserAuth(), controller.DownloadTicketAttachment)
		}
		// Support-bot surface: a shared service credential reads one account's
		// usage rows. The path is registered for every method so the handler can
		// answer 405 for the ones it does not serve.
		botLogRoute := apiRouter.Group("/bot/logs")
		botLogRoute.Use(middleware.DisableCache(), middleware.BotTokenAuth(), middleware.BotTokenRateLimit())
		{
			botLogRoute.Any("", controller.GetBotLogs)
		}
		// Support-bot account surface: one account's balance and usage summary, and
		// the QQ binding the bot maintains on a member's spoken claim. Same service
		// credential as the log surface; the paths stay read-only apart from the
		// binding write pair, which the handler enforces by method.
		botRoute := apiRouter.Group("/bot")
		botRoute.Use(middleware.DisableCache(), middleware.BotTokenAuth(), middleware.BotTokenRateLimit())
		{
			botRoute.Any("/account", controller.GetBotAccount)
			botRoute.Any("/usage", controller.GetBotUsage)
			botRoute.Any("/bindings", controller.HandleBotBinding)
		}
		financeRoute := apiRouter.Group("/finance")
		financeRoute.Use(middleware.RootAuth())
		{
			financeRoute.GET("/summary", controller.GetFinanceSummary)
			financeRoute.GET("/daily", controller.GetFinanceDaily)
			financeRoute.GET("/operations", controller.GetFinanceOperations)
			financeRoute.GET("/reserves", controller.GetFinanceReserves)
			financeRoute.GET("/users", controller.ListFinanceUsers)
			financeRoute.GET("/expense_ledger", controller.GetFinanceExpenseLedger)
			financeRoute.GET("/upstream_bookings", controller.ListUpstreamBookings)
			financeRoute.GET("/upstream_accounts", controller.ListUpstreamAccounts)
			financeRoute.POST("/upstream_accounts", controller.CreateUpstreamAccount)
			financeRoute.PUT("/upstream_accounts/:id", controller.UpdateUpstreamAccount)
			financeRoute.DELETE("/upstream_accounts/:id", controller.DeleteUpstreamAccount)
			financeRoute.GET("/upstream_accounts/:id/topups", controller.ListUpstreamTopUps)
			financeRoute.POST("/upstream_accounts/:id/refresh", controller.RefreshUpstreamAccount)
		}
		// WorkBuddy console: new-api's own page for the WorkBuddy hub. Every
		// forwarded call is named in controller/workbuddy_hub*.go; the hub is
		// never reachable through an arbitrary path from here.
		//
		// Reads and writes are registered separately because the write path can
		// disable or delete a live account, so it also demands the browser origin
		// that session-cookie requests must carry.
		workbuddyRoute := apiRouter.Group("/workbuddy")
		workbuddyRoute.Use(middleware.RootAuth(), middleware.DisableCache())
		{
			workbuddyRoute.GET("/status", controller.GetWorkbuddyHubStatus)
			workbuddyRoute.GET("/config", controller.GetWorkbuddyHubConfig)
			workbuddyRoute.GET("/call/:key", controller.WorkbuddyHubCall)
			workbuddyRoute.PUT("/config", middleware.SessionCookieOriginGuard(), controller.UpdateWorkbuddyHubConfig)
			workbuddyRoute.POST("/call/:key", middleware.SessionCookieOriginGuard(), controller.WorkbuddyHubCall)
		}
		// CommandCode console: new-api's own page for a CommandCode proxy.
		// The proxy admin API is reachable inside the private docker network and
		// carries no credential of its own, so every route below names exactly one
		// proxy path; the browser can never address an arbitrary one.
		//
		// Writes can disable or delete a live upstream key, so they also demand
		// the browser origin that session-cookie requests must carry.
		commandCodePoolRoute := apiRouter.Group("/commandcode-pool")
		commandCodePoolRoute.Use(middleware.RootAuth(), middleware.DisableCache())
		{
			commandCodePoolRoute.GET("/status", controller.GetCommandCodePoolStatus)
			commandCodePoolRoute.GET("/config", controller.GetCommandCodePoolConfig)
			commandCodePoolRoute.GET("/overview", controller.GetCommandCodePoolOverview)
			commandCodePoolRoute.GET("/pool", controller.GetCommandCodePoolState)
			commandCodePoolRoute.GET("/lb", controller.GetCommandCodePoolLB)
			commandCodePoolRoute.GET("/settings", controller.GetCommandCodePoolSettings)
			commandCodePoolRoute.GET("/keys/:id/credits", controller.GetCommandCodePoolKeyCredits)
			commandCodePoolRoute.PUT("/config", middleware.SessionCookieOriginGuard(), controller.UpdateCommandCodePoolConfig)
			commandCodePoolRoute.PUT("/lb", middleware.SessionCookieOriginGuard(), controller.UpdateCommandCodePoolLB)
			commandCodePoolRoute.PUT("/settings", middleware.SessionCookieOriginGuard(), controller.UpdateCommandCodePoolSettings)
			commandCodePoolRoute.POST("/keys", middleware.SessionCookieOriginGuard(), controller.CreateCommandCodePoolKey)
			commandCodePoolRoute.POST("/keys/refresh-credits", middleware.SessionCookieOriginGuard(), controller.RefreshCommandCodePoolCredits)
			commandCodePoolRoute.PATCH("/keys/:id", middleware.SessionCookieOriginGuard(), controller.UpdateCommandCodePoolKey)
			commandCodePoolRoute.DELETE("/keys/:id", middleware.SessionCookieOriginGuard(), controller.DeleteCommandCodePoolKey)
		}
		diagnosticRoute := apiRouter.Group("/relay-diagnostics")
		diagnosticRoute.Use(middleware.RootAuth(), middleware.DisableCache())
		diagnosticRoute.GET("", controller.GetRelayDiagnostics)
		diagnosticRoute.PUT("", middleware.SessionCookieOriginGuard(), middleware.CriticalRateLimit(), controller.UpdateRelayDiagnostics)
		observationRoute := apiRouter.Group("/relay-observations")
		observationRoute.Use(middleware.RootAuth(), middleware.DisableCache())
		observationRoute.GET("", controller.GetRelayObservations)
		observationRoute.GET("/requests", controller.GetRelayObservations)
		observationRoute.GET("/:request_id", controller.GetRelayObservations)
		systemInfoRoute := apiRouter.Group("/system-info")
		systemInfoRoute.Use(middleware.RootAuth())
		{
			systemInfoRoute.GET("/instances", controller.ListSystemInstances)
			systemInfoRoute.DELETE("/stale-instances", controller.DeleteStaleSystemInstances)
			systemInfoRoute.DELETE("/instances/:node_name", controller.DeleteStaleSystemInstance)
		}

		dataRoute := apiRouter.Group("/data")
		dataRoute.GET("/", middleware.AdminAuth(), controller.GetAllQuotaDates)
		dataRoute.GET("/users", middleware.AdminAuth(), controller.GetQuotaDatesByUser)
		dataRoute.GET("/self", middleware.UserAuth(), controller.GetUserQuotaDates)
		dataRoute.GET("/self/daily", middleware.UserAuth(), controller.GetUserDailyQuotaDates)
		dataRoute.GET("/flow", middleware.AdminAuth(), controller.GetAllFlowQuotaDates)
		dataRoute.GET("/flow/self", middleware.UserAuth(), controller.GetUserFlowQuotaDates)

		logRoute.Use(middleware.CORS(), middleware.CriticalRateLimit())
		{
			logRoute.GET("/token", middleware.TokenAuthReadOnly(), controller.GetLogByKey)
		}
		groupRoute := apiRouter.Group("/group")
		groupRoute.Use(middleware.AdminAuth())
		{
			groupRoute.GET("/", controller.GetGroups)
		}

		prefillGroupRoute := apiRouter.Group("/prefill_group")
		prefillGroupRoute.Use(middleware.AdminAuth())
		{
			prefillGroupRoute.GET("/", controller.GetPrefillGroups)
			prefillGroupRoute.POST("/", controller.CreatePrefillGroup)
			prefillGroupRoute.PUT("/", controller.UpdatePrefillGroup)
			prefillGroupRoute.DELETE("/:id", controller.DeletePrefillGroup)
		}

		mjRoute := apiRouter.Group("/mj")
		mjRoute.GET("/self", middleware.UserAuth(), controller.GetUserMidjourney)
		mjRoute.GET("/", middleware.AdminAuth(), controller.GetAllMidjourney)

		taskRoute := apiRouter.Group("/task")
		{
			taskRoute.GET("/self", middleware.UserAuth(), controller.GetUserTask)
			taskRoute.GET("", middleware.AdminAuth(), controller.GetAllTask)
			taskRoute.GET("/:task_id/artifacts", middleware.UserAuth(), controller.GetDashboardTaskArtifacts)
		}

		vendorRoute := apiRouter.Group("/vendors")
		vendorRoute.Use(middleware.AdminAuth())
		{
			vendorRoute.POST("/operations/preview", controller.PreviewVendorOperation)
			vendorRoute.POST("/operations", controller.ApplyVendorOperation)
			vendorRoute.GET("/", controller.GetAllVendors)
			vendorRoute.GET("/search", controller.SearchVendors)
			vendorRoute.GET("/:id", controller.GetVendorMeta)
			vendorRoute.POST("/", controller.CreateVendorMeta)
			vendorRoute.PUT("/", controller.UpdateVendorMeta)
			vendorRoute.DELETE("/:id", controller.DeleteVendorMeta)
		}

		modelsRoute := apiRouter.Group("/models")
		modelsRoute.Use(middleware.AdminAuth())
		{
			modelsRoute.GET("/benchmark", controller.GetBenchmarkMappings)
			modelsRoute.PUT("/benchmark", controller.SaveBenchmarkMapping)
			modelsRoute.GET("/benchmark/snapshot", controller.GetBenchmarkSnapshot)
			modelsRoute.PUT("/benchmark/snapshot", controller.SaveBenchmarkSnapshot)
			modelsRoute.GET("/sync_upstream/preview", controller.SyncUpstreamPreview)
			modelsRoute.POST("/sync_upstream", controller.SyncUpstreamModels)
			modelsRoute.POST("/delete", controller.BatchDeleteModelMeta)
			modelsRoute.GET("/missing", controller.GetMissingModels)
			modelsRoute.GET("/", controller.GetAllModelsMeta)
			modelsRoute.GET("/search", controller.SearchModelsMeta)
			modelsRoute.GET("/:id", controller.GetModelMeta)
			modelsRoute.POST("/", controller.CreateModelMeta)
			modelsRoute.PUT("/", controller.UpdateModelMeta)
			modelsRoute.DELETE("/:id", controller.DeleteModelMeta)
		}

		// Deployments (model deployment management)
		deploymentsRoute := apiRouter.Group("/deployments")
		deploymentsRoute.Use(middleware.AdminAuth())
		{
			deploymentsRoute.GET("/settings", controller.GetModelDeploymentSettings)
			deploymentsRoute.POST("/settings/test-connection", controller.TestIoNetConnection)
			deploymentsRoute.GET("/", controller.GetAllDeployments)
			deploymentsRoute.GET("/search", controller.SearchDeployments)
			deploymentsRoute.POST("/test-connection", controller.TestIoNetConnection)
			deploymentsRoute.GET("/hardware-types", controller.GetHardwareTypes)
			deploymentsRoute.GET("/locations", controller.GetLocations)
			deploymentsRoute.GET("/available-replicas", controller.GetAvailableReplicas)
			deploymentsRoute.POST("/price-estimation", controller.GetPriceEstimation)
			deploymentsRoute.GET("/check-name", controller.CheckClusterNameAvailability)
			deploymentsRoute.POST("/", controller.CreateDeployment)

			deploymentsRoute.GET("/:id", controller.GetDeployment)
			deploymentsRoute.GET("/:id/logs", controller.GetDeploymentLogs)
			deploymentsRoute.GET("/:id/containers", controller.ListDeploymentContainers)
			deploymentsRoute.GET("/:id/containers/:container_id", controller.GetContainerDetails)
			deploymentsRoute.PUT("/:id", controller.UpdateDeployment)
			deploymentsRoute.PUT("/:id/name", controller.UpdateDeploymentName)
			deploymentsRoute.POST("/:id/extend", controller.ExtendDeployment)
			deploymentsRoute.DELETE("/:id", controller.DeleteDeployment)
		}
	}
}
