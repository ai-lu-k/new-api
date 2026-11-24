<div align="center">

![new-api](/web/public/logo.png)

# New API

**An AI gateway for models, applications, and agents**

<p align="center">
  <a href="./README.zh_CN.md">简体中文</a> |
  <a href="./README.zh_TW.md">繁體中文</a> |
  <strong>English</strong> |
  <a href="./README.fr.md">Français</a> |
  <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="https://raw.githubusercontent.com/Calcium-Ion/new-api/main/LICENSE">
    <img src="https://img.shields.io/github/license/Calcium-Ion/new-api?color=brightgreen" alt="license">
  </a><!--
  --><a href="https://github.com/Calcium-Ion/new-api/releases/latest">
    <img src="https://img.shields.io/github/v/release/Calcium-Ion/new-api?color=brightgreen&include_prereleases" alt="release">
  </a><!--
  --><a href="https://hub.docker.com/r/CalciumIon/new-api">
    <img src="https://img.shields.io/badge/docker-dockerHub-blue" alt="docker">
  </a>
  <a href="https://atomgit.com/QuantumNous/new-api" target="_blank">
    <img alt="AtomGit G-Star" src="https://atomgit.com/QuantumNous/new-api/star/badge.svg"/>
  </a>
</p>

<p align="center">
  <a href="https://trendshift.io/repositories/20180" target="_blank">
    <img src="https://trendshift.io/api/badge/repositories/20180" alt="QuantumNous%2Fnew-api | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/>
  </a>
  <br>
  <a href="https://hellogithub.com/repository/QuantumNous/new-api" target="_blank">
    <img src="https://api.hellogithub.com/v1/widgets/recommend.svg?rid=539ac4217e69431684ad4a0bab768811&claim_uid=tbFPfKIDHpc4TzR" alt="Featured｜HelloGitHub" style="width: 250px; height: 54px;" width="250" height="54" />
  </a><!--
  -->
  <a href="https://atomgit.com/QuantumNous/new-api" target="_blank">
    <img alt="AtomGit G-Star" src="https://atomgit.com/QuantumNous/new-api/star/new_badge.svg" width="250" height="55" />
  </a>
</p>

<p align="center">
  <a href="#capabilities">Capabilities</a> •
  <a href="#quick-start">Quick start</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#development">Development</a> •
  <a href="#documentation">Documentation</a>
</p>

</div>

---

## 📝 Project Description

New API is a self-hosted AI gateway for applications, agents, and teams. Connect upstream model services, expose a consistent API to your clients, and manage routing, access, usage, and costs in one place.

Use it to share authorized model access across a team, switch providers without configuring every client again, or operate a private multi-model service with a web console. Upstreams include OpenAI, Anthropic, Google Gemini, Azure OpenAI, AWS Bedrock, Vertex AI, DeepSeek, Qwen, and other compatible services.

> [!IMPORTANT]
> - This project is intended solely for lawful and authorized AI API gateway, organization-level authentication, multi-model management, usage analytics, cost accounting, and private deployment scenarios.
> - Users must lawfully obtain upstream API keys, accounts, model services, and interface permissions, and must comply with upstream terms of service and applicable laws and regulations.
> - Users should ensure their use complies with upstream terms of service and applicable laws and regulations.
> - When providing generative AI services to the public, users should comply with applicable regulatory requirements and fulfill all filing, licensing, content safety, real-name verification, log retention, tax, and upstream authorization obligations required by their jurisdiction.

<!-- -->

> [!WARNING]
> When operating this project as a public generative AI service or API resale service, users should first complete all required filing, licensing, content safety, real-name verification, log retention, tax, payment, and upstream authorization obligations.

### Model benchmarks

Model Square can display text and image evaluations supplied by the deployment
administrator. In **Model management → Benchmark mappings**, import snapshots
you are authorized to use and set up mappings from model aliases to text
evaluation source names and tiers. Scores and mappings are stored in the primary
database. Restarts preserve edits and deletions, and other instances reload them
through option synchronization.

Each modality displays its imported `version`, `source_url`, and
`license_url` as attribution. Older image snapshots may omit these fields.

A fresh instance starts with empty snapshots. To clear a modality, save
`{"dimensions":[],"models":[]}` for it.

---

## 🤝 Trusted Partners

<p align="center">
  <em>No particular order</em>
</p>

<p align="center">
  <a href="https://www.cherry-ai.com/" target="_blank">
    <img src="./docs/images/cherry-studio.png" alt="Cherry Studio" height="80" />
  </a><!--
  --><a href="https://github.com/iOfficeAI/AionUi/" target="_blank">
    <img src="./docs/images/aionui.png" alt="Aion UI" height="80" />
  </a><!--
  --><a href="https://bda.pku.edu.cn/" target="_blank">
    <img src="./docs/images/pku.png" alt="Peking University" height="80" />
  </a><!--
  --><a href="https://www.compshare.cn/?ytag=GPU_yy_gh_newapi" target="_blank">
    <img src="./docs/images/ucloud.png" alt="UCloud" height="80" />
  </a><!--
  --><a href="https://www.aliyun.com/" target="_blank">
    <img src="./docs/images/aliyun.png" alt="Alibaba Cloud" height="80" />
  </a><!--
  --><a href="https://io.net/" target="_blank">
    <img src="./docs/images/io-net.png" alt="IO.NET" height="80" />
  </a>
</p>

---

## 🙏 Special Thanks

<p align="center">
  <a href="https://www.jetbrains.com/?from=new-api" target="_blank">
    <img src="https://resources.jetbrains.com/storage/products/company/brand/logos/jb_beam.png" alt="JetBrains Logo" width="120" />
  </a>
</p>

<p align="center">
  <strong>Thanks to <a href="https://www.jetbrains.com/?from=new-api">JetBrains</a> for providing free open-source development license for this project</strong>
</p>

---

<a id="capabilities"></a>

## Capabilities

| Area | What you can do |
| --- | --- |
| Model access | Use OpenAI Chat Completions, Responses, Anthropic Messages, and Gemini APIs; stream responses and use tools, reasoning, and multimodal inputs where supported |
| Routing | Configure model mappings, channel priorities and weights, retries, channel affinity, and multiple upstream keys |
| Usage and costs | Manage quotas, subscriptions, usage logs, cache accounting, and expression-based pricing for different usage tiers |
| Usage levels | Progress from LV0 to LV6 through cumulative consumption, including gifted wallet balance but excluding Token Plan's free allowance and coupon-multiplied allowance. With Token Plan balance continuation, only settled wallet spending counts; refunds reverse that wallet portion. View badges and milestone progress, and configure thresholds under System Settings → Site → Usage levels |
| Token Plan | One permanent, rotatable key per user for listed models. Weekly allowances for LV0–LV6 are 0, 0.5, 1, 2, 4, 8 and 16 balance units; refresh Monday 00:00 Asia/Shanghai until the first reset coupon. Coupons (×1/×3/×5/×10) replace the current allowance with base × multiplier and start a personal seven-day cycle; the multiplier returns to ×1 at expiry. Old remaining quota does not roll over, and in-flight requests settle against their original cycle. Optional balance continuation is off by default; when enabled, free quota is used first and excess is charged to the wallet. Pending reservations are excluded from displayed usage |
| Token Plan usage statistics | Administrator-only `/token-plan-statistics` page with current-cycle totals, searchable paginated user details and daily free-plan/wallet usage in Asia/Shanghai. Pending reservations are separate. Daily figures use first-settlement dates; later refunds revise the original day. Undated historical usage is explicitly marked and is not backfilled |
| Token Plan reset coupons | Administrator-issued, expiring, single-use coupons. The admin Reset coupons page previews a fixed snapshot of enabled ordinary users or specified users, tracks resumable issuance and allows voiding unused coupons. Users confirm the loss of old quota/multiplier with a ticket-tearing gesture or accessible confirmation button. Existing API keys, wallet and cumulative usage are preserved |
| Access control | Manage users, groups, fine-grained permissions, and API key restrictions; use OAuth/OIDC, passkeys, two-factor authentication, and login session management |
| Channel concurrency | Set an optional generation limit on each channel's advanced settings; 0 or empty leaves the channel unlimited. The limit applies per user: every account, with all of its tokens and keys, may run that many generations on the channel at once, and one account's generations never consume another account's slots. Streams hold a slot until they end, and asynchronous tasks hold it until terminal status. Reaching your own limit returns 429 with Retry-After instead of queuing and is not redirected to another channel. A channel that serves a shared upstream account pool can also set a pool status URL: the gateway reads its JSON `accounts_ready` and caps the whole channel at accounts_ready × generations per pool account (default 2), cached about 30 seconds. Capacity is never treated as an upstream fault. Instances share the primary database for atomic admission, with or without Redis |
| Model daily token limits | Configure multiple model budgets under System Settings → Request policies → Model daily token limits. The initial rule is 200,000,000 tokens per account per day for `deepseek-v4.1-flash-x0.1`. Users share usage across all keys; the user editor supports inheritance, custom caps, and unlimited exemptions. The overview shows remaining tokens, the next reset, and the last update |
| Asynchronous tasks | Extend image, video, and other task APIs with JavaScript plugins, including task status and output retrieval |
| Web console | Configure channels and models, inspect usage and audit logs, and try models in the playground; available in English, Simplified Chinese, Traditional Chinese, French, Japanese, Russian, and Vietnamese |

Daily model budgets reset at 00:00 Asia/Shanghai. Input and output tokens include cache tokens once and never use price multipliers. Admission checks settled usage: work already admitted can finish above the cap, after which new requests receive 429 with the model, used tokens, effective limit, reset time, and a suggestion to use another model. Usage is attributed to the admission day, including streams that finish after midnight. New model rules start counting when enabled without backfilling historical logs. Durable counters and idempotent receipts live in the primary database independently of consumption logs and Redis; old records are pruned after seven complete days. Removing a global rule disables that model's budget; saved user overrides do not create a separate global rule.

### Protocols and endpoints

| Interface | Common endpoints |
| --- | --- |
| OpenAI Chat / Responses | `POST /v1/chat/completions`, `POST /v1/responses` |
| Anthropic Messages | `POST /v1/messages` |
| Gemini | `POST /v1beta/models/{model}:generateContent`, `POST /v1beta/models/{model}:streamGenerateContent` |
| Realtime / Responses WebSocket | `GET /v1/realtime`, `GET /v1/responses` (WebSocket upgrade) |
| Images / audio | `/v1/images/generations`, `/v1/images/edits`, `/v1/audio/speech`, `/v1/audio/transcriptions`, `/v1/audio/translations` |
| Embeddings / rerank | `POST /v1/embeddings`, `POST /v1/rerank` |
| Task plugins | `POST /v1/tasks/{pluginKey}`, `GET /v1/tasks/{taskId}`, plus routes declared by each plugin |

[RelayKit](./relaykit/README.md) provides request, response, and streaming conversion between the four text protocols. Available features depend on the channel, upstream model, and conversion path; protocol-specific tools and fields may not map exactly. WebSocket support also requires a compatible upstream and channel configuration.

When account concurrency or a daily token budget for the Realtime model is enabled, the gateway controls Realtime `response.create` events and VAD responses; idle connections do not occupy slots. Realtime `idle_timeout_ms` is rejected with an explicit error in this mode. Realtime sessions opened before enabling the policy must reconnect. Live request leases renew every 20 seconds and expire after two minutes if the process exits; renewal failure cancels the request. Before asynchronous submission, the lease uses the configured task timeout (24 hours by default) to cover a crash before task persistence. If an accepted task cannot be persisted, its slot remains reserved until that deadline. Durable asynchronous tasks remain counted until the existing poller or timeout sweep marks them terminal.

This README describes the current source tree. Check the release notes for the version you deploy.

<a id="quick-start"></a>

## Quick start

### Try locally with Docker

This starts a single instance with SQLite and binds it to localhost:

```bash
mkdir -p data
docker run --name new-api -d --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e TZ=Asia/Shanghai \
  -v "$(pwd)/data:/data" \
  calciumion/new-api:latest
```

Open [http://localhost:3000](http://localhost:3000) and complete the setup wizard to create the administrator account. The `data` directory persists the SQLite database across container replacements.

### Make your first request

1. Add a channel with your upstream API key, available models, and group assignment; run a channel test.
2. Configure model pricing and ensure the user has quota or a valid subscription.
3. Create an API key in the console with access to the same group and models.
4. Set your client's base URL to `http://localhost:3000/v1` for OpenAI-compatible clients and use the **New API-issued key**.

Set `NEW_API_KEY` in your shell to that key. List the models accessible to it:

```bash
curl --fail-with-body http://localhost:3000/v1/models \
  -H "Authorization: Bearer ${NEW_API_KEY}"
```

Then call Responses, replacing `your-enabled-model` with an enabled model that supports this interface:

```bash
curl --fail-with-body http://localhost:3000/v1/responses \
  -H "Authorization: Bearer ${NEW_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"your-enabled-model","input":"Hello!"}'
```

<a id="deployment"></a>

## Deployment

### Docker Compose

The repository's [Compose configuration](./docker-compose.yml) starts **New API + PostgreSQL + Redis** by default. It also contains examples for MySQL and a separate ClickHouse log database.

```bash
git clone https://github.com/QuantumNous/new-api.git
cd new-api
```

Before starting, edit `docker-compose.yml`: replace the database and Redis example passwords in both the services and connection strings, and set a persistent random `SESSION_SECRET` (generate one with `openssl rand -hex 32`). For an HTTPS console, configure `SESSION_COOKIE_SECURE=true` and `SESSION_COOKIE_TRUSTED_URL` with its exact public HTTPS origin.

```bash
docker compose up -d
docker compose logs -f new-api
```

### Storage and configuration

| Component | Options |
| --- | --- |
| Main database | SQLite, MySQL ≥ 5.7.8, or PostgreSQL ≥ 9.6 |
| Separate log database | Configure with `LOG_SQL_DSN`; also supports ClickHouse |
| Cache | Optional Redis plus in-memory caching; use shared Redis when application nodes need shared rate limits |
| Container platforms | Linux amd64 / arm64 |

| Variable | Purpose |
| --- | --- |
| `SQL_DSN` | Main database connection; unset uses SQLite |
| `SQLITE_PATH` | SQLite database path or DSN. WAL, a 30-second busy timeout and immediate transactions are defaults. Explicit DSN options take precedence |
| `LOG_SQL_DSN` | Optional separate log database connection |
| `REDIS_CONN_STRING` | Redis connection string |
| `SESSION_SECRET` | Persistent authentication secret; all nodes must use the same value |
| `CRYPTO_SECRET` | Defaults to `SESSION_SECRET`; nodes sharing Redis must use the same effective value. Token Plan requires a persistent random secret of at least 32 bytes to encrypt retrievable keys; retain it across restarts |
| `SESSION_COOKIE_SECURE` | Set to `true` for an HTTPS console; enables Secure refresh cookies and strict refresh/logout origin checks |
| `SESSION_COOKIE_TRUSTED_URL` | Required in Secure mode: comma-separated exact HTTPS origins, without paths or wildcards; leave unset for local HTTP |
| `REGISTRATION_REWARD_IP_THRESHOLD` | Require extra email and local security verification starting with this registration per IP in 24 hours (default `3`, minimum `1`) |
| `REGISTRATION_REWARD_DEVICE_THRESHOLD` | Require extra verification starting with this registration per browser in 30 days (default `2`, minimum `1`) |
| `TRUSTED_PROXIES` | Trusted reverse-proxy IPs/CIDRs, or `none`; explicitly configure for your network |

Relay diagnostics are available in call-log details. The common outbound HTTP relay and shared SSE scanner provide these observations; SDK-owned, WebSocket and task-polling transports retain their existing timeout semantics and may have no transport observations. Ordinary users receive an outcome summary; administrators can inspect effective budgets, transport stages and retry attempts; root can inspect content-free event timelines and start or suppress temporary tracing for a channel/model/API scope. Missing observations are shown as unavailable. Header-byte arrival, body-byte arrival, protocol events, output text, reasoning text, upstream heartbeats and downstream pings are separate observations. Unknown or large stream events remain unclassified; tracing never retains prompts, generated text, images, request headers or URL queries, and does not make additional model calls.

For OpenAI-compatible chat streams, a transport `[DONE]` is separate from a successful response. Error envelopes, `finish_reason:error`, unsupported finish reasons and missing finish reasons remain visible as failures or incomplete responses in call logs. Reported cumulative usage survives later metadata/error frames. Without upstream usage, an unsuccessful stream with no generated text, reasoning or tool-call output does not charge an estimated prompt; partial generated output retains local estimation, and successful empty completions retain normal prompt billing. Failed chat streams release the expression's fixed request fee while retaining separately observed tool charges. These decisions apply to new requests and do not rewrite historical balances or logs.

Set `RELAY_PHASE_TIMEOUT_ENABLED=true` to use request-level response-header, first-body-byte, upstream-idle and total deadlines. Otherwise existing global timeouts remain effective. High reasoning effort multiplies the default waiting budgets by two; xhigh/max/ultra multiplies them by three, bounded by `RELAY_PHASE_TIMEOUT_MAX_SECONDS` (default 3600, maximum 7200). Exact channel/model/effective-effort overrides are configured in `RELAY_TIMEOUT_RULES`; the most specific rule wins and later rules break ties. Budget fields must be positive and within the safety limit. First-byte timing begins after headers; upstream byte arrivals refresh idle timing, including fragmented events. Total timing starts at the original request and is never refreshed by heartbeats, downstream pings or retries. Local budgets cannot extend an upstream/CDN's own timeout.

Timeouts (including upstream 408/504/524) capture a bounded first-failure timeline through the rate/storage-limited diagnostic writer and enable scope-specific detailed tracing for `RELAY_TRACE_WINDOW_SECONDS` (default 600 seconds) after the most recent anomaly. `RELAY_TRACE_SAMPLE_PERCENT` defaults to 25. Limits are 128 active scopes, 32 concurrent detailed traces per instance, 8 attempts per request, 32 events per detailed attempt, and 256 detailed attempts per uninterrupted anomaly window. A bounded background worker writes standalone timeout records even when `ERROR_LOG_ENABLED` is disabled; its queue holds 128 records, accepts at most 120 writes per minute per instance and 32 KiB per record, and stops admitting records after 10,000 stored reservations. Root can see dropped/failed counts through `GET /api/relay-diagnostics`; manual scope control uses `PUT /api/relay-diagnostics` and follows root authorization and trusted-origin checks.

Adaptive first-output budgets are opt-in: `RELAY_LATENCY_ENABLED=true` collects content-free observations and fits functions; additionally set `RELAY_LATENCY_ENFORCE=true` to enforce them. Each function belongs to one channel ID and its final mapped upstream model name, shared by all public aliases and failover positions. Features are effective reasoning effort and request-time estimated input tokens. Price tiers and whole-chain deadlines are excluded. Streaming HTTP chat, Messages, Responses and Gemini generation use the budget; SDK-owned, task, image, audio, non-streaming and WebSocket transports retain existing behavior. First meaningful output includes reasoning, text or tool-call output; roles, lifecycle events and heartbeats do not satisfy it. An unknown event conservatively commits the attempt and prevents adaptive replay. Before meaningful output, bounded protocol preludes are buffered; an adaptive timeout cancels the upstream attempt and enters the existing retry policy before settlement. Retry count, channel priority, capacity, explicit retry exclusions and client cancellation still apply.

To limit the initial rollout, set `RELAY_LATENCY_ENFORCE_SCOPES` to a JSON array of exact `channel_id`/`upstream_model` pairs. Outside that set, enabled collection and fitting continue without adaptive cancellation or adaptive keepalive. An unset or empty list permits enforcement on every eligible scope when the global enforcement switch is on. Public aliases do not participate in this runtime scope match.

The master fits the preceding seven days at 00:00 Asia/Shanghai and catches up on startup. Separate primary-database tables hold observations and versioned functions; existing diagnostic summaries can bootstrap observations from the configured log database. A censored log-normal AFT model uses chronological training/calibration/validation partitions and Kaplan–Meier tail calibration. Timeouts and client disconnects before output are lower bounds, not exact response times; hard upstream errors and unclassified output are excluded. Insufficient samples, an unidentified tail or failed validation preserve the previous accepted function. Missing features, unsupported effort/context or a function older than eight days use `RELAY_LATENCY_FALLBACK_SECONDS` (default 60). The target quantile is P99, not an absolute maximum or a guaranteed service level. Runtime bounds (`RELAY_LATENCY_MIN_SECONDS=10`, `RELAY_LATENCY_MAX_SECONDS=600`) are applied after prediction; existing transport/client deadlines can end requests sooner.

`RELAY_LATENCY_REFERENCE_PERCENT=1` preselects a small, outcome-independent fraction of original requests to use `RELAY_LATENCY_REFERENCE_SECONDS=600`, replenishing observable tail data without duplicate or detached upstream work. These requests still hold their normal channel capacity and follow client cancellation. `RELAY_LATENCY_KEEPALIVE_SECONDS=10` sends SSE comment heartbeats while waiting; zero disables adaptive keepalive, and channel `DisablePing` is respected. Heartbeats cannot extend a client's absolute timeout. Root diagnostics expose active function counts, latest acceptance/rejection reports and observation queue/drop/write-failure counters. Observations expire after eight days; fit reports after fourteen. Fit input is bounded to 20,000 reservoir-sampled observations per channel/model, with a default minimum of 500. All nodes should share the same settings and primary database. For offline replay without database access, run `go run ./cmd/relay-latency -input /absolute/path/observations.jsonl -output /absolute/path/report.json -cutoff 2026-01-01T00:00:00Z`; rows contain only `channel_id`, `upstream_model`, `observed_at`, `effort`, `input_tokens`, `elapsed_ms` and `censored`.

A channel can opt into failover on every upstream error by setting `"retry_all_upstream_errors":true` inside its `setting` JSON (default false). For the common HTTP relay, this overrides status/code retry exclusions, including upstream 400/408/504/524, malformed responses and errors carried in HTTP 200. Shared text SSE handlers buffer protocol preludes independently of adaptive latency enforcement; recognized error envelopes, `event: error` and `finish_reason:error` before output immediately abort that attempt and try another eligible channel before settlement. The failed channel is excluded for the request, and selection starts at the highest remaining priority without resetting the request attempt budget. Local validation/accounting failures, client cancellation, total deadlines, explicit channel pins and strict session bindings remain authoritative. Meaningful or unclassified output commits a stream and prevents this replay; SDK-owned, task and WebSocket flows retain their existing retry behavior. This setting does not enable adaptive timeouts or keepalive by itself.

Nodes in the same environment must share a Redis database for trace-window propagation and atomic detailed-storage leases. Propagation normally takes up to two seconds; Redis failures degrade to summaries rather than blocking model calls. Staging requires a separate Redis database. Without Redis, windows and detailed admission budgets are local to one process. Redis-backed detailed tracing admits at most 10,000 storage reservations across restarts, independently of the 10,000 standalone timeout record budget. Normal log cleanup still applies; reservation counters deliberately do not replenish automatically on failures or cleanup. After explicitly cleaning diagnostic history, an operator may reset `new-api:relay-trace:storage:v1` and `new-api:relay-diagnostics:storage:v1` in that environment's Redis database to restore its finite diagnostic allowance.

### Request chain observations

At controller completion, the common HTTP relay records one content-free observation per finished request, with its selected/admitted or capacity-skipped candidates and each actual upstream HTTP attempt. Root can open **Request funnel** in the common request logs and inspect **Request chain** in an individual log. The funnel uses its time and model filters, excludes probes by default, and is independent of consumption/error-log switches. Requests rejected before entering the relay controller, asynchronous jobs and WebSocket sessions are outside this collection scope; SDK-owned/uninstrumented transports are marked incomplete when an admitted request has no HTTP-attempt record; older requests are not fabricated from incomplete consumption logs.

Attempt identity is configured channel ID plus final mapped upstream model name, shared across retail aliases. Records measure accepted-request duration from request-ID middleware entry, distinguish upstream first reasoning/answer from successful downstream writes, exclude SSE heartbeats and role/usage frames from meaningful output, and retain failed/partial attempts. Counters are payload body sizes, not network-billing measurements, and exclude headers, TLS and compression overhead; sent request size stays unknown unless a known-length body was written successfully. Output TPS uses reported upstream output tokens and the interval between first and last observed output; one-chunk or missing-usage responses have unknown TPS. Cache request hit rate uses attempts with reported cache reads; token hit rate uses paired cache/input observations, with Anthropic additive input and OpenAI inclusive input kept distinct. Missing fields stay unknown. Independent route-policy versions remain unset until a versioned routing policy exists.

Procurement costs never reuse retail prices or channel used quota. A numeric `usage.cost` with explicit `usage.cost_currency` is an upstream-reported amount, not an invoice reconciliation. Otherwise an optional `RELAY_OBSERVATION_COST_PROFILES` JSON array supplies estimated token procurement rates, keyed by `channel_id` and `upstream_model`; `currency`, `input_per_million` and `output_per_million` are required decimal strings. Optional `cache_read_per_million` and `cache_write_per_million` inherit the input rate when omitted. For example, use your own verified prices in the shape `[{"channel_id":1,"upstream_model":"example-model","currency":"USD","input_per_million":"1","output_per_million":"2"}]`. Missing usage or cache counts needed by a rate keep cost unknown. Invalid optional procurement configuration is logged without stopping model service; unconfigured costs remain unknown. Each estimate preserves its rate snapshot. All attempts contribute to request totals, with reported/estimated amounts separate, original currencies preserved and unknown-attempt counts visible. No customer billing, retry, cancellation or generation-capacity behavior is changed.

Observations use a dedicated primary-database table with a seven-day cleanup target; the separately configured log database is unchanged. A bounded 256-item writer queue uses two-second database deadlines and reports dropped/failed writes through `/api/relay-diagnostics` and the observation API (per instance since startup). Graceful shutdown drains for up to five seconds. Per-request limits are 64 attempts, 128 candidate checks and 64 KiB stored JSON; oversized records fail visibly in writer counters. SSE envelopes are inspected up to 16 KiB, non-SSE JSON usage up to 64 KiB, and implausible raw token counters over 10^12 remain unavailable. Payloads, prompts, answers, headers and credentials are not persisted.

Root-only read APIs are `GET /api/relay-observations` (funnel and channel/model aggregates), `GET /api/relay-observations/requests` (recent request records), and `GET /api/relay-observations/:request_id` (detail). Range filters `start`/`end` are Unix seconds with an exclusive end, at most seven days; `model` is the retail name and `traffic_kind` is `user`, `probe` or `all`. Summary scans stop at `limit` (default 1,000, maximum 10,000) or 16 MiB of payload and return `scan_truncated`; list scans default to 50 with maximum 100. Narrow the period to obtain complete totals. Queue losses, truncated chains and unknown costs must not be read as successful or free requests.

Registration risk checks cover password, OAuth and WeChat account creation. Visit the sign-up page to complete extra verification when prompted. Risky registrations wait until both checks succeed; an unavailable verification service pauses registration. Existing accounts can still log in. The human check uses GeeTest CAPTCHA v4. The browser solves the challenge served by the provider and the server revalidates every solution against the signing key before the verification email is sent, so a client-side result alone never authorizes registration. Set the captcha id and key in the system options; the key stays server-side. Each solution is claimable once in the primary database, so a replay fails on every node. Challenge traffic reaches the provider, which sees the visitor's IP and browser signals, so review its privacy terms before enabling the check. A provider that cannot answer at all degrades instead of locking visitors out: the server probes the provider itself and lets the request through only while that probe fails, logging the transition, so omitting the solution cannot bypass a working provider. A provider that answers and refuses a solution still blocks the request. Serve the application over HTTPS (localhost works for development). After email verification, the one-use registration credential expires after 10 minutes and is bound to the observed IP and browser. Successful verification permits the original rewards without manual approval. The gateway stores HMAC digests of IPs and a signed random browser cookie, rather than hardware fingerprints; stored registration signals are cleared after 30 days by the master node. Clearing cookies or changing networks can evade these signals, so these controls do not establish one person per account. Configure trusted proxies and persist the same authentication/encryption secrets on every node. Administrators can inspect verification reasons and issuance results under Reset coupons, and anonymous verification successes/failures in the audit log. These audit events exclude IPs, browser identifiers and verification credentials.


Administrator environment switching is optional. It keeps one public console origin and one production login: administrators choose the test environment from their profile menu, and the test page shows its version and a return button. Configure both applications with `APP_ENVIRONMENT_ROLE` (`production` or `staging`), the same exact `APP_ENVIRONMENT_ORIGIN`, and a dedicated random `APP_ENVIRONMENT_BRIDGE_SECRET` of at least 32 bytes. Production additionally requires `APP_ENVIRONMENT_UPSTREAM` (an HTTPS staging origin with a trusted certificate such as `https://staging.example.test`) and an explicit username mapping such as `APP_ENVIRONMENT_USER_MAP='{"production-admin":"staging-admin"}'`. The mapped account must already exist, be enabled, and have an administrator role no higher than the production account. Missing configuration hides the switch; incomplete configuration prevents startup.

Keep staging private and give it separate databases, application/session secrets, caches and side-effect integrations. The bridge secret is shared only by these two applications and must differ from either application's session/encryption secrets. Browser requests carry `X-App-Environment`, but the server also verifies the production session and a signed routing grant; a header alone does not permit test access. Test credentials and refresh cookies are not shared with production. External model API routes such as `/v1` always use production. Switching reloads all browser tabs without replaying pending requests. Console documents (including `/dashboard/overview`) and static assets follow the selected environment; the compatibility API endpoints `/dashboard/billing/subscription` and `/dashboard/billing/usage` remain on production. If staging is offline, API requests fail instead of falling back to production; a failed document navigation returns to production. An environment conflict triggers at most one automatic reload until a successful management response confirms recovery. Persistent conflicts or unavailable staging stop background requests and show a return-to-production action, including when authentication bootstrap has not completed.

This mode trusts test JavaScript with the same browser origin as production. Use it only for trusted builds; it does not provide browser origin isolation. The request replay cache supports a single staging receiver; multiple receivers require shared replay storage before enabling this mode.

See the [environment example](./.env.example), [environment reference](https://docs.newapi.ai/en/docs/installation/config-maintenance/environment-variables), and [authentication and session guide](./docs/authentication.md) for full configuration. Configure container variables in Compose's `environment` or `env_file`; copying `.env.example` alone does not inject variables into the container.

For production, put the console behind HTTPS and configure your reverse proxy for streaming and WebSocket upgrades. Persist and back up the database and mounted data. Multi-node deployments must share the main database and authentication secrets; separate Redis instances or in-memory rate limiters count limits independently per node. The session guide describes propagation behavior for each topology.

Pin an image version from [Releases](https://github.com/QuantumNous/new-api/releases), review its upgrade notes, and back up before upgrading. The `latest` tag follows published builds and can change; migrations and compatibility must be assessed for your existing installation.

<a id="development"></a>

## Development and extensions

The backend uses Go and Gin. The web console uses React 19, TypeScript, Rsbuild, TanStack, and Tailwind CSS 4. Use Bun for frontend dependencies and scripts; see [go.mod](./go.mod) for the Go language baseline and [Dockerfile](./Dockerfile) for the container build toolchain.

Build the frontend before starting the backend, which embeds `web/dist`:

```bash
# Repository root
cd web
bun install --frozen-lockfile
bun run build
cd ..
go run .
```

In a second terminal, start the frontend development server:

```bash
cd web
bun run dev -- --port 5173
```

Open [http://localhost:5173](http://localhost:5173); the development server proxies API requests to the backend on port 3000. For a containerized development backend, see [docker-compose.dev.yml](./docker-compose.dev.yml) and the `make dev` target in [makefile](./makefile).

| Location | Responsibility |
| --- | --- |
| `router/`, `middleware/`, `controller/` | HTTP routes, access checks, and API handlers |
| `relay/` | Upstream adapters and request routing |
| `service/`, `model/` | Business logic and persistence |
| [relaykit/](./relaykit/README.md) | Independently buildable Go module for protocol DTOs and conversions |
| [plugins/tasks/](./plugins/tasks/) | JavaScript task plugins; see [Task Plugin API v1](./docs/plugin-api/v1.md) for authoring and host boundaries |
| `web/` | Web console; see [frontend conventions](./web/AGENTS.md) |
| [electron/](./electron/README.md) | Desktop wrapper and packaging |

Read [AGENTS.md](./AGENTS.md) before contributing. Run checks appropriate to your change, including `make test` for the Go modules and `bun run typecheck`, `bun run lint`, `bun run test`, and `bun run build` in `web/` for frontend changes. Changes to RelayKit must also pass `GOWORK=off go build ./...` from `relaykit/`.

<a id="documentation"></a>

## Documentation and community

| Resource | Link |
| --- | --- |
| Official documentation | [Guides](https://docs.newapi.ai/en/docs) · [Installation](https://docs.newapi.ai/en/docs/installation) · [API reference](https://docs.newapi.ai/en/docs/api) |
| Project exploration | [DeepWiki](https://deepwiki.com/QuantumNous/new-api) |
| Questions and discussion | [FAQ](https://docs.newapi.ai/en/docs/support/faq) · [Community](https://docs.newapi.ai/en/docs/support/community-interaction) |
| Bugs and feature requests | [GitHub Issues](https://github.com/QuantumNous/new-api/issues) |
| Security reports | Follow the [security policy](./.github/SECURITY.md) for private reporting |

For bug reports, include the version, deployment method, reproduction steps, and redacted logs. Documentation, translations, provider integrations, and focused regression tests are all welcome contributions.

---

## 🔗 Related Projects

### Upstream Projects

| Project | Description |
|------|------|
| [One API](https://github.com/songquanpeng/one-api) | Original project base |
| [Midjourney-Proxy](https://github.com/novicezk/midjourney-proxy) | Midjourney interface support |

### Supporting Tools

| Project | Description |
|------|------|
| [new-api-key-tool](https://github.com/Calcium-Ion/new-api-key-tool) | Key quota query tool |
| [new-api-horizon](https://github.com/Calcium-Ion/new-api-horizon) | New API high-performance optimized version |

---

## Model capabilities and quick import

Administrators configure context length and input modalities in the model's Specifications, and maximum output tokens, output modalities, reasoning levels and client compatibility in Quick import settings. Each model name has its own profile; renaming its metadata record preserves these settings. Quick import reads the currently callable catalog and the user's permitted groups instead of requiring a separate model list.

At startup, existing `dsh_setup.models` profiles are imported once into model metadata. Existing catalog context/input facts take precedence. The old option remains a compatibility fallback for callable models that have no metadata; subsequent catalog edits, including an explicitly empty reasoning map, take precedence over it. Exported configurations include public model capabilities only. DSH, OpenCode and OpenClaw receive the fields supported by their respective formats; capability metadata does not change gateway pricing or upstream routing. Existing installed client configurations must be imported again to receive updates.

## 📜 License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPLv3)](./LICENSE).

Additional terms under AGPLv3 Section 7 apply. Modified versions must preserve
the author attribution notice `Frontend design and development by New API
contributors.` in the appropriate legal notices and in any prominent about,
legal, footer, or attribution location presented by the user interface.

Modified versions that present a user interface must also preserve a visible
link to the original project: <https://github.com/QuantumNous/new-api>.

This is an open-source project developed based on [One API](https://github.com/songquanpeng/one-api) (MIT License).

If your organization's policies do not permit the use of AGPLv3-licensed software, or if you wish to avoid the open-source obligations of AGPLv3, please contact us at: [support@quantumnous.com](mailto:support@quantumnous.com)

See [NOTICE](./NOTICE) and [third-party licenses](./THIRD-PARTY-LICENSES.md) for attribution and dependency notices.
Run `./new-api licenses` to read the license texts and notices embedded in the standalone binary.

---

## 🌟 Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=Calcium-Ion/new-api&type=Date)](https://star-history.com/#Calcium-Ion/new-api&Date)

</div>

---

<div align="center">

### 💖 Thank you for using New API

If this project is helpful to you, welcome to give us a ⭐️ Star！

**[Official Documentation](https://docs.newapi.ai/en/docs)** • **[Issue Feedback](https://github.com/Calcium-Ion/new-api/issues)** • **[Latest Release](https://github.com/Calcium-Ion/new-api/releases)**

<sub>Built with ❤️ by QuantumNous</sub>

</div>
