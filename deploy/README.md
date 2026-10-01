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

应用代码之外，线上还有几处服务器配置是 new-api 跑起来必需的。完整 vhost 备份在
`deploy/nginx/ai.lu-k.cn.conf`，改 nginx 时请同步更新这份备份。

| 位置 | 作用 |
|---|---|
| `location ^~ /` → `127.0.0.1:3000` | SPA 与全部管理接口 |
| `location ^~ /img/` → `/www/wwwroot/luk-brand` | 「快速开始」页的教程截图 `/img/dsh-custom-provider.png` |
| `location ~ ^/guide/?$` | 教程页的 SEO 入口 |
| `location ^~ /tavern`、`^~ /tieba` | 已下线的酒馆页面与旧无鉴权代理，一律返回 410 |
| `location ^~ /v1/` → `llm_evidence_ingress` | 调用入口（经审计链路） |

改完 nginx 记得 `nginx -t` 再 reload。

**不要加回无鉴权的上游反代。** 任何把浏览器请求直通上游的 location，都等于对全网
开放那个上游（不需要 API Key、不需要登录）。页面要用上游就走 new-api 的渠道，
由它做鉴权和计费，不要在 nginx 层直接转发。

## 六、已知坑

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
  而 `/v1/` 的审计入口正是用 `http://new-api:3000` 找上游的 —— 线上请求就会有一部分
  落到测试环境，用测试库鉴权、计费、记日志（新建的令牌在那边不存在，直接 401）。
  2026-09-29 到 10-02 有 1955 个线上请求是这样被测试环境处理的。现在测试服务叫
  `new-api-staging`，`release.sh` 起容器后还会再查一遍，发现重名就把测试容器停掉。
  核对方法：`docker exec llm-evidence-audit-1 getent hosts new-api` 只应返回一个地址。
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
