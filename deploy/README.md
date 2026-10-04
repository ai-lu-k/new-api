# 部署手册（LUK 自建分支）

这个目录是这台 new-api 的**部署面**：构建、发布、回滚，以及那些不在应用代码里、
但线上跑起来缺一不可的服务器配置。

分支关系：`ai-lu-k/new-api` 是 `QuantumNous/new-api` 的 fork。`tavern` 是**生产分支
兼基础设施分支**（部署脚本、CI 配置都在这），`staging` 是**测试分支**（`tavern` 加上
待验证的功能改动），`main` 只用来跟上游，不部署。

想验证新功能：把它提交到 `staging` 并 push —— 剩下服务器自己会做。

## 一、线上长什么样

| 组件 | 位置 | 说明 |
|---|---|---|
| `new-api` 容器 | 镜像 `luk/new-api:<tag>`，`127.0.0.1:3000` | 应用本体，二进制内嵌前端 |
| `new-api-mysql` | `mysql:8.4`，仅容器网络 | 业务数据，不对宿主开 3306 |
| compose 目录 | `/www/wwwroot/new-api` | `docker-compose.yml` + `.env` + `data/` |
| 脚本目录 | `/opt/new-api-src/deploy/` | 只放这些脚本；由开发机 `git push server tavern` 更新 |
| 镜像 tag | `<日期>-<short sha>` | 例如 `20260929-29944e3`，即「线上跑的是哪个 commit」 |

`.env` 里除了数据库 DSN 和密钥，还有一个 `NEWAPI_TAG`，它是**当前部署的版本号**；
compose 里写的是 `image: luk/new-api:${NEWAPI_TAG:-tavern}`。回滚就是把这一行改回旧值。

## 二、发布

日常只有一句话：**推到分支，剩下自动**。

```
推送到 GitHub 的 staging 分支
   ↓  GitHub Actions 跑检查（LUK CI：前端 typecheck + 构建、后端编译）
   ↓  服务器的 systemd 定时器每 2 分钟盯一次 api.github.com
   ↓  tip 变了 → build.sh 拉源码包构建 → 部署测试环境 → 冒烟 → 失败自动回滚
   ↓
你用 SSH 隧道看过、满意了 → promote.sh <tag> → 生产
```

生产**故意不自动**：只有人工 `promote.sh` 才会动生产，实验性改动不会自己跑上去。

### build.sh：为什么不走 git

因为这张网络不允许：

- `github.com` 的 HTTPS git 端点在这里直接超时；SSH 能连，但 GitHub 对 **fork 仓库
  禁用了 deploy key**，服务器要拉代码就只能挂账号级密钥 —— 等于把整个账号的读权限
  放到生产机上。
- 镜像走 registry 也不行：实测从 `ghcr.io` 拉一个几 MB 的小镜像要 **3 分 25 秒**，
  330MB 的镜像根本等不起。

而 `codeload.github.com` 的源码包很快（实测整包 5.4MB / 3.3 秒，约 1.6 MB/s），
`api.github.com` 也快（0.8 秒），公开仓库**不需要任何凭据**。所以：

- 构建留在服务器上 —— 跨境只传 5.4MB 源码，不传 330MB 镜像；
- 构建上下文就是源码包解出来的快照，天然干净，与工作区无关；
- 版本号取自 GitHub API 的提交日期 + short sha（如 `20260929-29944e3`），同时进
  `-ldflags` 和镜像 tag，所以「线上跑的是哪个提交」对得上；
- 服务器上**没有任何 GitHub 凭据**。

### 手动发一次

```bash
# 发到测试环境
NEWAPI_ENV=staging /opt/new-api-src/deploy/release.sh staging

# 发到生产（一般走 promote.sh，见第七节）
NEWAPI_ENV=production /opt/new-api-src/deploy/release.sh tavern

# 单跑一次盯梢（测试环境的定时器就是这么干的）
/opt/new-api-src/deploy/watch.sh staging
```

### 脚本本身怎么更新

`deploy/` 下的脚本在服务器上的 `/opt/new-api-src`，**只由开发机的
`git push server tavern` 更新** —— 不让部署器跟着被部署的代码自我更新，那是个隐患。
日常发版完全不需要这一步。

## 三、回滚

```bash
cd /www/wwwroot/new-api
sed -i 's|^NEWAPI_TAG=.*|NEWAPI_TAG=<旧 tag>|' .env
docker compose up -d --force-recreate new-api
```

旧镜像还在本地（`docker images | grep luk/new-api`），所以回滚是秒级。
定期 `docker image prune` 时留意别把还想回滚的 tag 清掉。

## 四、跟进上游

```bash
cd <本地 checkout>
git fetch upstream          # upstream = QuantumNous/new-api
git rebase upstream/main
git push --force-with-lease origin tavern
git push server tavern
```

两条规矩：

- **不要手改 `web/src/routeTree.gen.ts`。** 它是 TanStack Router 在构建时自动
  生成的（文件头写着会被覆盖）。rebase 撞它的时候不要手工 merge，取上游版本后
  重新构建即可。
- 我们的改动尽量是**新增文件**（`features/guide/`、`routes/*`），
  对共用文件只做加法（导航注册项），这样每次 rebase 的冲突面很小。

## 五、不在仓库里的依赖

应用代码之外，线上还有几处服务器配置是 new-api 跑起来必需的（vhost 配置不放在仓库里）。

| 位置 | 作用 |
|---|---|
| `location ^~ /` → `127.0.0.1:3000` | SPA 与全部管理接口 |
| `location ^~ /img/` → `/www/wwwroot/luk-brand` | 「快速开始」页的教程截图 `/img/dsh-custom-provider.png` |
| `location ^~ /tavern`、`^~ /tieba` | 已下线的酒馆页面与旧无鉴权代理，一律返回 410 |
| `location ^~ /v1/` | 调用入口，流式，不缓冲 |

改完 nginx 记得 `nginx -t` 再 reload。

**不要加回无鉴权的上游反代。** 任何把浏览器请求直通上游的 location，都等于对全网
开放那个上游（不需要 API Key、不需要登录）。页面要用上游就走 new-api 的渠道，
由它做鉴权和计费，不要在 nginx 层直接转发。

## 六、已知坑

- **首页文案不在代码里。** 首页是 `options` 表里的 `HomePageContent`（HTML + `<style>`），
  按环境存库，推代码不会带过去。仓库里的 `deploy/home-page-content.html` 是它的副本，
  改完要手动写回：后台「系统设置 → 站点与品牌 → 系统信息 → 首页内容」粘贴保存即时生效；
  走 SQL 的话 `mysql` 读写都要加 `--raw --default-character-set=utf8mb4`（批处理默认会把
  换行转义成 `\n`，把内容写坏），写完重启对应容器（options 在内存里有缓存）。这段 HTML
  渲染在 shadow root 里，能用 `var(--foreground)`、`var(--primary)`、`var(--radius)` 这类
  主题 token，但用不了 Tailwind 工具类（构建时扫描不到），样式只能靠它自带的 `<style>`。
  这段 HTML 现在**只有首屏**（标题、一句话、两个按钮）；它下面那排「使用 xx 开始」和各客户端的
  接入步骤是代码里的组件（见第八节），紧跟在这段 HTML 后面渲染，推代码就会更新。
- **支出公开和「关于」都在排行榜那一页（导航里叫「公开信息」）。** 页面顶部切换三个栏目：模型排行、
  支出公开（`/rankings?section=expenses`）、关于（`/rankings?section=about`，旧的 `/about` 会跳过来）。
  支出只列支出，按月逐项手填：超级管理员在控制台「支出公开管理」（`/expenses`）里添加、编辑月份，
  存在 `options` 表的 `expense_ledger.months` 里，不用发版；公开页只读，顶部有按月的柱状图。
  按年付的服务器、域名这类支出在同一页的「预付摊销」里只填一次（总额、起始月份、月数，存在
  `expense_ledger.prepaid`），覆盖到的每个月开始时自动多出均摊的一行，尾差算在最后一个月。首屏副标题里的「每一项成本」链到支出公开。
  「关于」栏目的内容是 `options` 表里的 `About`（HTML、Markdown 或一个网址都行），后台
  「系统设置 → 关于」可以直接改；仓库副本是 `deploy/about-page-content.html`。
  `HeaderNavModules.about` 现在决定这一页有没有「关于」栏目，导航里不再有单独的「关于」入口。
- **首屏写的是「成本透明，代码开源」，上线前这两句都得先成立。** 成本页要先填上真实的明细；
  代码的说法以实际公开的仓库为准，页面上链到的是网关的仓库。
- **`github.com` 的 git-over-HTTPS 在这个网络里是断的**（`info/refs` 直接超时），
  但 SSH 正常。所以远端一律用 `git@github.com:...`，别用 https。
- **GitHub 对 fork 仓库禁用 deploy key**，所以服务器不能自己拉 fork。部署镜像
  `/opt/new-api.git` 由开发机推送；服务器只跟它同步。
- `/opt/new-api.git` 是从旧的浅克隆播种的，历史止于 `996adff`。部署够用，
  但别拿它当完整历史用。
- **别再回到 `/tmp/new-api.inspect` 那套。** 那是浅克隆 ＋ 手工 patch 的工作区，
  没有版本记录，而且多个会话共用同一棵树；`/tmp/rebuild_newapi.sh` 会从这棵
  脏树直接构建并覆盖 `:tavern`，是颗地雷。
- **`proxy.golang.org` 在这个网络里不通**（`go mod download` 会 `i/o timeout`）。
  Dockerfile 里因此有一个可覆盖的 `GOPROXY`，默认值与上游一致，`build.sh` 传的是
  `https://goproxy.cn,direct`。npm registry 没问题。
- 首次构建约 15 分钟，几乎全花在最终阶段从 `deb.debian.org` 拉那几个 apt 包上；
  基础镜像按 digest 固定，该层之后永远命中缓存，所以只有第一次慢。
- **在这台机器上构建会和生产抢内存。** 机器 7.7G，生产的 MySQL 也在上面，前端打包
  那一步的 node 进程自己要 1.6G 以上。2026-10-02 一次测试环境构建触发了内核 OOM，
  被杀的是生产的 `mysqld`（约 30 秒后自动恢复）。所以 `build.sh` 会先看可用内存加
  空闲 swap，低于 `NEWAPI_BUILD_MIN_FREE_MB`（默认 3072）就直接放弃，watcher 下一轮
  再试。看到"放弃这次构建"不是脚本坏了，是机器上没余量：腾内存或加 swap，别调低
  阈值硬上。

## 七、生产 / 测试隔离

两个环境共用同一份源码和同一个镜像仓库，区别只在**部署哪个 tag**：

| | 生产 | 测试 |
|---|---|---|
| compose 目录 | `/www/wwwroot/new-api` | `/www/wwwroot/new-api-staging` |
| 容器 | `new-api` | `new-api-staging` |
| 端口 | `127.0.0.1:3000` | `127.0.0.1:3001`（只绑本机） |
| 对外入口 | `ai.lu-k.cn` | 不对外，走 SSH 隧道 |
| 数据库 | 同一 MySQL 实例内的 `new_api` | 同实例内的 `new_api_staging` |
| 应用密钥 | 生产 `.env` | staging `.env`，两个 secret 与生产不同 |

staging 的 compose 在 `deploy/staging/docker-compose.yml`。三个注意点：

- **服务名不能和生产一样叫 `new-api`。** 两个环境共用 `new-api_new-api-net` 这张
  网络，compose 会把服务名注册成网络别名；同名时 `new-api` 同时解析到两个容器，
  而 `/v1/` 的入口是按 `http://new-api:3000` 这个名字找网关的 —— 线上请求就会有一部分
  落到测试环境，用测试库鉴权、计费、记日志（新建的令牌在那边不存在，直接 401）。
  2026-09-29 到 10-02 有 1955 个线上请求是这样被测试环境处理的。现在测试服务叫
  `new-api-staging`，`release.sh` 起容器后还会再查一遍，发现重名就把测试容器停掉。
  核对方法：在那张网络上的任意容器里 `getent hosts new-api`，只应返回一个地址。
- 测试环境**不能设 `SESSION_COOKIE_TRUSTED_URL`**：new-api 认为它与
  `SESSION_COOKIE_SECURE=false` 互斥，会直接拒绝启动（日志反复打印
  `SESSION_COOKIE_TRUSTED_URL requires SESSION_COOKIE_SECURE=true`）。隧道走 http，
  所以只能关掉 Secure 并且不设 trusted url。
- 两个 `SESSION_SECRET` / `CRYPTO_SECRET` 必须不同，否则会话和加密数据会在两边互通。

访问测试环境：

```bash
ssh -N -L 3001:127.0.0.1:3001 root@<host>     # 然后打开 http://127.0.0.1:3001
```

**测试环境是自动的**：`new-api-watch.timer` 每两分钟拉起 `deploy/watch.sh staging`，
发现 `staging` 分支的 tip 变了就构建并部署过去。手动跑一次或看它的日志：

```bash
systemctl start new-api-watch.service
journalctl -u new-api-watch.service -n 30
systemctl list-timers new-api-watch.timer
```

想临时部署别的分支到测试环境（不走自动流程）：

```bash
NEWAPI_ENV=staging /opt/new-api-src/deploy/release.sh <branch>
```

验证通过后**提升到生产**（同一个镜像 digest，不重新构建）：

```bash
/opt/new-api-src/deploy/promote.sh <tag>
```

`promote.sh` 会确认该 tag 在本机存在，写进生产 `.env`、重建容器、探活，失败自动回滚。

**规矩：实验性改动一律先上测试环境，生产只接受在测试环境看过的 tag。** 测试库是
生产库的全量拷贝（含真实用户和 API 令牌），所以它绝不能对外暴露 —— 端口只绑
`127.0.0.1`，入口只有 SSH 隧道。在测试环境改数据、跑迁移都不会碰到生产库。

## 八、快速开始与 DSH 一键配置

首页首屏下面（以及 `/guide`）是同一个「快速开始」组件：一排居中的子导航，每个客户端一栏，选中的那栏
记在网址的 `#` 后面（如 `/#codex`），可以直接发链接。组件在 `web/src/features/guide/components/quick-start.tsx`，
要加客户端就在 `web/src/features/guide/lib/agents.ts` 里加一项，再在 `agent-configs.ts` 里写它的配置格式。

| 栏 | 怎么接入 |
|---|---|
| DSH | 一段提示词全自动，或手动运行同一条命令（本节后半）；`dsh_setup.enabled` 没开时只显示在 DSH 表单里手填的那套步骤 |
| Claude Code / Codex / OpenCode / OpenClaw | 半自动：页面上直接有 CC Switch 的表单，填好点「打开 CC Switch」，由它导入并切换；或者手动：按页面给的配置文件内容粘贴 |
| 直接调用 API | 自己写代码调用：创建密钥、选模型，再给出 cURL / Python / Node.js / Go / Java 的请求示例 |

后四栏的说明：

- 模型列表来自 `GET /api/dsh_setup/models`（不用登录；登录后按账号的分组算）。每个客户端只列它那种协议
  能调的模型：Claude Code 走 `/v1/messages`，Codex 走 `/v1/responses`，OpenCode 和 OpenClaw 走
  `/v1/chat/completions`。显示名、上下文长度这些取自 `dsh_setup.models`，和 DSH 用的是同一份清单。
- 自动分组开着时，页面会替登录用户准备一把以客户端命名的密钥（`Claude Code`、`Codex`……，分组 `auto`，
  开跨分组重试；已有同名且没加限制的就复用），所以用户不用自己建。自动分组没开时页面不建密钥，改为
  指路去控制台的「API 密钥」。
- CC Switch 的表单和「API 密钥」页每行菜单里的是同一套（字段在
  `web/src/features/keys/components/dialogs/cc-switch-dialog.tsx` 的 `CCSwitchFields`，应用表和链接生成在
  `web/src/features/keys/lib/cc-switch.ts`）：密钥页是弹窗、要自己选应用；快速开始里直接摆在页面上，应用就是所在的那一栏。
  表单里选的主模型同时也是下面「手动配置」用的模型。应用表里有 Claude、Codex、Gemini、OpenCode、OpenClaw 五个。
- CC Switch 一次只导入一个主模型（Claude 另外可以填 Haiku / Sonnet / Opus 三档），手动配置里 OpenCode 和 OpenClaw 会写上全部模型。
- 配置里的站点地址取 `ServerAddress`。
- **这四种客户端的配置格式是照各家官方文档（2026-10-02 查的）写的，没有在真实客户端上跑过。** 上线前
  每种至少实际试一次；格式变了就改 `agent-configs.ts` 和它的测试。

「直接调用 API」一栏（`web/src/features/guide/components/api-guide.tsx`，示例在 `lib/api-examples.ts`）：

- 示例跟着所选模型走：网关能用 `/v1/chat/completions` 提供的模型给 OpenAI 格式的示例，只走 `/v1/messages` 的
  （比如 Claude）给 Anthropic 格式的示例。cURL、Go、Java 是不依赖任何库的原始请求，Python 和 Node.js 用对应格式的官方 SDK，
  把地址指到网关。
- 自动分组开着时，「创建并复制 API 密钥」会准备一把名为 `Quick Start` 的 auto 密钥，示例里随即带上它（屏幕上打码，复制出来是完整的）；
  没开时改为说明怎么在控制台自己建。
- 要加一种语言：在 `API_LANGUAGES` 里加一项，再写它在两种格式下的示例。

### DSH：一段提示词，或手动运行命令

DSH 一栏有两张卡片，登录用户一打开就都是现成的（不用点任何按钮）；访客看到的是「请先登录」，登录后回到原处。
代码在 `service/dshsetup/`（脚本、配置码、下发内容）和 `controller/dsh_setup.go`，页面在
`web/src/features/guide/components/dsh-quick-setup.tsx`。

1. **提示词**：复制后发给 DSH，它按提示词里的四步做——先问用户想用哪个模型（有 `ask_user_question` 工具就用它，
   选项是这个账号能调的模型）；运行配置命令，把提供方、全部模型和密钥写进 `~/.dsh/settings.yaml` 和
   `~/.dsh/.credentials.yaml`；把用户选的模型设成默认模型，并**自己去查这个模型的官方规格**（上下文、最大输出、
   是否支持图片、思考等级），照 DSH 的「配置模型」文档写进该模型的条目；最后汇报，并让用户确认模型列表还在。
   密钥不经过对话，提示词里只有一次性配置码。
2. **手动配置**：同一条命令（macOS / Linux 和 Windows 各一条），用户自己粘到终端运行。DSH 里还没有可用模型、
   收不了提示词的人走这条路；运行后在 DSH 的模型列表里选模型。

**规格由 DSH 自己查，站点不维护。** 手动添加进 DSH 的模型默认只有文本输入、没有思考等级，所以要对齐。这件事交给
提示词里的 DSH 去做，以后站点加模型不用跟着改任何东西。代价有两条：对齐只发生在走提示词的那一次、只针对用户选的那个
模型（手动运行命令的不会对齐，重新运行命令也会把提供方条目换回站点下发的样子）；DSH 写错的话整个提供方会从它的
模型列表里消失，所以提示词要求它先备份、写完让用户确认、出错就恢复。`dsh_setup.models` 里仍然可以给某个模型写死
`context_window` / `max_tokens` / `input` / `reasoning_efforts` / `compat`，脚本会原样下发，但不是必须的。

流程：

1. 网页 `POST /api/dsh_setup/code`（要登录）拿一个一次性配置码。页面每次打开、每次复制之后、以及码快过期时
   都会自己再要一个，所以这一步很轻：只检查能不能配（自动分组可用、有模型、密钥没满），**不建密钥、不记审计**，
   也不走登录接口共用的那个按 IP 的限流额度。
2. 提示词里带两条命令，DSH 按所在系统运行其中一条：`curl -fsSL <站点>/api/dsh_setup/setup.sh | sh -s -- <配置码>`，
   或 Windows 的 `setup.ps1`（配置码放在 `LUK_SETUP_CODE` 环境变量里）。脚本本身不含任何密钥，人人相同。
3. 脚本先确认能写 DSH 的目录，再 `POST /api/dsh_setup/redeem`（配置码放在 `X-Setup-Code` 请求头）换回配置。
   **密钥是这一步才准备的**：账号里已有名为 `DSH`、分组 `auto`、没加限制的密钥就复用，没有就新建一把
   （开跨分组重试）。所以只是打开过页面的人不会多出一把密钥。
4. 脚本只改自己管的那几项：`llm-pi-ai.providers` 下的 `lu-k` / `lu-k-messages` / `lu-k-responses`，
   以及密钥引用 `LU_K_API_KEY`。别的提供方、别的密钥、注释都不动；改之前先备份；遇到看不懂的写法就不动，
   改为把要粘贴的内容打印出来。

配置码的规矩（对照 OWASP ASVS 5.0）：192 位随机、只存 SHA-256、只能用一次、10 分钟过期；同一用户最多同时有
5 个没用过的码，再多就挤掉最早的（页面一打开就发码，新码不能让刚复制走的那个失效）；不出现在 URL 里；
兑换接口限流、响应禁止缓存；无论码不存在、用过还是过期，回答都一样；兑换记审计日志，日志里没有码也没有密钥。
兑换时账号的密钥数已满会回 409，脚本会提示先去删一把。配置码存在进程内存里，所以**只适用于单节点部署**，
重启后未用的码作废。

**前提：自动分组要开。** 这个功能靠 `auto` 分组让一把密钥通所有模型：

| 选项 | 值 |
|---|---|
| `AutoGroups` | 分组顺序，便宜的在前，如 `["国庆福利","特惠","稳定","Claude","GPT"]` |
| `UserUsableGroups` | 原有内容上加一项 `"auto":"自动选择"` |
| `DefaultUseAutoGroup` | `true`（控制台里新建密钥也默认用 auto） |

以上三项在后台系统设置的分组倍率表单里都能改。下面这几项没有界面，写 `options` 表（改完等一分钟同步，或重启容器）：

| 选项 | 说明 |
|---|---|
| `dsh_setup.enabled` | `true` 才开放提示词配置；默认关：脚本和兑换接口返回 404，申请配置码的接口回答「未开放」，DSH 一栏只显示手动步骤（模型列表接口不受它影响） |
| `dsh_setup.provider_id` | DSH 里的提供方 ID，默认 `lu-k`。**定了就别改**：DSH 用它认提供方和密钥 |
| `dsh_setup.display_name` | DSH 里显示的名字，默认 `LUK` |
| `dsh_setup.default_model` | 新装的 DSH 默认用哪个模型 |
| `dsh_setup.models` | 模型清单（JSON），仓库里的副本是 `deploy/dsh-setup-models.json` |
| `ServerAddress` | 提示词、脚本和各客户端配置里的站点地址都取它，必须是用户能访问到的那个 |

`dsh_setup.models` 的键是模型名，值里的字段都可省：`name`（显示名）、`context_window`、`max_tokens`、
`input`（`text` / `image`）、`reasoning_efforts`、`compat`（后两项原样写进 DSH 配置，含义见 DSH 的
providers 文档）、`hidden`（不是对话模型的，比如生图和 `jev`，设 `true`）。清单里没写的模型照样会下发，
只是用 DSH 的默认值（262144 上下文、32768 输出、仅文本）。模型按它支持的协议分到三个提供方：能走
`/v1/chat/completions` 的进 `lu-k`，只能走 `/v1/messages` 的（Claude）进 `lu-k-messages`，只能走
`/v1/responses` 的进 `lu-k-responses`，共用同一把密钥。

脚本的测试在 `service/dshsetup/dshsetup_test.go`：用真的 `sh` 对着几种现有配置跑一遍，逐字节比对结果；
机器上有 `pwsh` 时同一批用例也会跑 PowerShell 版。**PowerShell 版到 2026-10-02 为止没有实际运行过**
（开发机上没有 PowerShell），上线前要在一台真的 Windows 上试一次。

## 九、不分组：模型名带价格倍率，旧名字用映射表兜底

站点只用一个 `default` 分组（倍率 1，界面上不再出现分组）。同一个模型在不同线路上的价格写进模型名：
`deepseek-v4.1-flash-x0.25` 就是 `deepseek-v4.1-flash` 按官方价的 0.25 倍计费。渠道里填带倍率的名字，再用
「模型重定向」映射到上游真实的模型名；路由仍然按模型名选渠道。一把密钥能调所有模型，模型广场一行一个价。

| 选项 | 说明 |
|---|---|
| `model_naming.price_suffix_enabled` | `true` 才认名字里的 `-x倍率`；默认关，关着时这种名字就是普通模型名 |
| `model_naming.aliases` | 默认名称映射（JSON），旧名字 → 现在的名字，例如 `{"deepseek/deepseek-v4.1-flash":"deepseek-v4.1-flash-x0.25"}` |

两项在后台「系统设置 → 模型 → 模型名称与价格倍率」里都能改。规则：

- **计费**：名字以 `-x` 加数字结尾时，按去掉后缀的那个名字查价格（价格表达式、倍率、按次价格都一样），再乘这个数字。
  倍率乘在原来分组倍率的位置上，所以日志里的「分组倍率」一栏显示的就是它。没配价格的基础名照样报「价格未配置」。
  一个名字自己配了价格、而去掉后缀的名字没有，就当成真的模型名（比如某个叫 `xxx-x4` 的上游模型），不拆。
- **改价就换名字**：名字承诺了价格。调价时新开一个名字，旧名字在映射表里指过去或者保留一段时间再下线。
- **映射表**：请求左边的名字时，从选渠道开始就按右边的名字处理（路由、计费、日志、排行榜都算在右边），
  日志的管理员信息里记着 `requested_model`（调用方实际发来的名字），可以据此判断旧名字什么时候能下线。
  令牌的「可用模型」限制按新旧名字任一放行。映射表里的名字不出现在模型列表和 `/v1/models` 里。
- **便宜的线路失败不会自动换到贵的线路**：名字定了线路，想要稳定就用倍率高的那个名字。
- 模型广场：带倍率的名字沿用基础名的描述、图标和厂商；列表是 OpenRouter 那样的表格（模型、周 Token、输入、输出、延迟、吞吐），
  低于官方价的标「x 折」。只有一个分组时，广场、密钥列表、新建密钥表单、模型详情里的分组都不显示。
- 快速开始 / DSH 一键配置：没有自动分组时，准备的密钥分组留空（跟随账号分组）。`dsh_setup.models`、`dsh_setup.default_model`
  里写的旧名字会通过映射表自动套到新名字上，不用重配。

迁移现有分组：`_ops/naming_migrate.py`（不在仓库里）读出渠道、价格和模型元数据，生成把各分组渠道改名、建映射、
保持每个旧名字价格不变的 SQL；同一个基础名在两个旧名字下价格不一致时会拒绝生成，要先人工定价。

## 十、搜索引擎：页面自己带标题和正文

所有页面都是同一个 HTML 外壳，正文由前端启动后从 `/api/` 拉数据再画出来。对爬虫来说这有三个坑，都实测过：

- 不跑脚本的爬虫（以及各种 AI 抓取）拿到的是空壳，只有标题没有正文。
- 跑脚本但被 `robots.txt` 挡在 `/api/` 外面的爬虫，拉不到首页内容，前端会退回 new-api 自带的默认首页，
  被收录的就是那个模板页。
- 界面语言跟着浏览器走，而爬虫的浏览器是英文的，中文站被收录的是英文界面。

所以这些事现在由服务端自己做（`service/sitepage`、`controller/site_page.go`），不再靠 nginx 往页面里塞东西：

| 地址 | 行为 |
|---|---|
| `/robots.txt` | 应用生成。全部放行，**不屏蔽 `/api/`**；带 `Sitemap:` 一行（需要配了「服务器地址」） |
| `/sitemap.xml` | 应用生成：首页、模型广场、每个模型一页、排行榜、关于页。只列未登录访客打得开的页面，模型增减自动跟着变。关于页只要有内容就算（导航开关只是藏入口，页面照样打得开） |
| 公开页面的 HTML | 标题、描述、canonical、og 标签按页面生成；正文以纯文本结构放在 `#root` 里，前端启动后整体替换 |
| 其它页面（控制台、登录、不存在的模型……） | 带 `<meta name="robots" content="noindex">` |
| `/api/*` | 响应带 `X-Robots-Tag: noindex`：爬虫可以读，但接口本身不进搜索结果 |

| 选项 | 说明 |
|---|---|
| `site_page.default_language` | 访客没选过语言时看到的语言（`zh-CN`、`en` 等）。留空则跟随浏览器，爬虫看到的就是英文界面 |
| `site_page.home_title` | 首页标题。留空用「系统名称 · 首页的大标题」 |
| `site_page.home_description` | 首页描述。留空用首页开头的几段文字 |

三项都在后台「系统设置 → 站点 → 搜索引擎」里改。规则：

- 首页和关于页的正文取自后台存的内容，只保留标题、段落、列表、代码和链接，脚本、样式和所有属性都丢掉。
- 页面里的那份正文平时不可见（前端一般在它出现之前就接管了）；脚本加载慢、被拦或者被关掉时，3 秒后显示出来。
- 模型页的正文只有名称、描述和供应商。**价格不写进这份正文**：计价规则（分时、分档、显示货币）只在前端算，
  服务端再算一遍迟早对不上。跑脚本的爬虫能看到完整价格。
- 页面标题前后端各有一份规则（`service/sitepage` 与 `web/src/lib/page-title.ts`），改一边要改另一边。
- 不要在 `robots.txt` 里屏蔽 `/api/`，也不要再用 nginx 的静态文件顶替这两个地址。

**上生产时 nginx 要跟着改**（2026-10-03 上线时已按下面几步改完）：

1. 删掉 `location = /robots.txt`、`= /sitemap.xml`、`= /seo.css`、`= /luk-seo.js` 四段。不删的话，nginx 上那份
   带 `Disallow: /api/` 的旧 robots.txt 会盖住应用生成的。
2. `location = /`、`location ~ ^/pricing/?$`、`location ~ ^/guide/?$` 三段整段删掉，交给最后的 `location /`。
3. 最后的 `location /` 里去掉全部 `sub_filter`（标题、描述、`</head>`、`</body>` 那几行）。标题那几条在新版本上
   已经匹配不到，`</head>`、`</body>` 两条还会生效，会塞进重复的描述和 `noindex`。
4. 验证文件、IndexNow 密钥、`/img/`、`/v1/` 几段不动。
5. 后台把默认语言设成 `zh-CN`，按需要填首页标题和描述；然后在 Search Console 里重新提交 sitemap，
   用「网址检查 → 测试实际网址」看一眼渲染出来的页面。

## 十一、模型规格与模型广场的筛选

模型广场左边的筛选照 OpenRouter 的做法：每组一行、默认折叠，点开是勾选框或滑块。能筛什么取决于模型自己带了什么信息，
所以每个模型在后台多了五项「规格信息」（`models` 表的五个新列，新版本启动时自动加上，只增不改）：

| 字段 | 列 | 说明 |
|---|---|---|
| 输入模态 | `input_modalities` | 文本、图片、文件、音频、视频，多选，至少一项，逗号分隔存储 |
| 上下文长度 | `context_length` | token 数，大于 0 |
| 支持的参数 | `supported_parameters` | 工具调用、推理、结构化输出、JSON 模式，多选，可以一项都不选 |
| 发布时间 | `release_date` | 年-月，例如 `2026-09` |
| 系列 | `series` | 例如 DeepSeek、GPT、Claude |

规则：

- **手工保存模型时必填。** 后台「模型管理」里新建或编辑模型，前四项必填项没填完不让保存，接口也会拒绝（只改显示 / 隐藏状态不受影响）。
  上游同步之类自动建出来的记录可以先没有，下次手工编辑时要补上。
- **每个名字各填各的，带倍率的名字也一样。** `deepseek-v4.1-flash-x0.25` 和 `-x0.5` 走的渠道不同、能力可能不同，所以各有一条自己的记录。
  描述、图标、厂商在没有自己记录时仍然沿用去掉倍率的那个名字，规格信息不沿用。
- 筛选组（顺序同 OpenRouter）：输入模态、折扣、上下文长度、输入价格、系列、支持的参数、输出价格、发布时间、模型厂商，外加我们自己的端点类型；
  站点有多个分组时最上面多一组「分组」。某一组只有在模型带了对应信息时才出现；没填规格的模型在按规格筛选时不会出现。
- 价格滑块的刻度取自当前列表里实际出现的价格，所以不用管显示货币；上下文和发布时间用固定刻度。
- 模型详情页原本就留了上下文、模态、发布时间的位置，现在有数据了会显示出来。
- 筛选逻辑在 `web/src/features/pricing/lib/model-filters.ts`；后端校验在 `model/model_catalog.go`。
