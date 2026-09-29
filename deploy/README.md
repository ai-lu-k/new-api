# 部署手册（LUK 自建分支）

这个目录是这台 new-api 的**部署面**：构建、发布、回滚，以及那些不在应用代码里、
但线上跑起来缺一不可的服务器配置。

分支关系：`ai-lu-k/new-api` 是 `QuantumNous/new-api` 的 fork，生产分支是 `tavern`。
`main` 只用来跟上游，不部署。

## 一、线上长什么样

| 组件 | 位置 | 说明 |
|---|---|---|
| `new-api` 容器 | 镜像 `luk/new-api:<tag>`，`127.0.0.1:3000` | 应用本体，二进制内嵌前端 |
| `new-api-mysql` | `mysql:8.4`，仅容器网络 | 业务数据，不对宿主开 3306 |
| compose 目录 | `/www/wwwroot/new-api` | `docker-compose.yml` + `.env` + `data/` |
| 部署镜像（裸仓库） | `/opt/new-api.git` | 由开发机 `git push server tavern` 更新 |
| 构建用 checkout | `/opt/new-api-src` | 常驻，`HEAD` = `origin/tavern` |
| 镜像 tag | `<git describe>` | 例如 `baseline-live-2026-09-27`，即「线上跑的是哪个 commit」 |

`.env` 里除了数据库 DSN 和密钥，还有一个 `NEWAPI_TAG`，它是**当前部署的版本号**；
compose 里写的是 `image: luk/new-api:${NEWAPI_TAG:-tavern}`。回滚就是把这一行改回旧值。

## 二、发布

```bash
# 1) 开发机：把要发的提交推到部署镜像
cd <本地 checkout>
git push server tavern
git push server --tags

# 2) 服务器：同步 → 构建 → 部署 → 冒烟 → 失败自动回滚
/opt/new-api-src/deploy/release.sh
```

`release.sh` 做的事，按顺序：

1. `git fetch --tags` + `git reset --hard origin/tavern`；
2. `deploy/build.sh` —— 见下；
3. 把新 tag 写回 `/www/wwwroot/new-api/.env` 的 `NEWAPI_TAG`；
4. `docker compose up -d --force-recreate new-api`；
5. 轮询 `http://127.0.0.1:3000/api/status`，最多 60 秒；
6. 不通过就写回上一个 tag 并重新拉起，然后以非零码退出。

### build.sh 为什么这么写

构建上下文是 `git archive <commit>` 导出的**干净快照**，不是工作区。这有两个后果：

- 镜像是哪个 commit 就永远是哪个 commit —— 工作区被别的东西改脏了也不会混进去；
- `VERSION` 按该 commit 的 `git describe` 写进去，同时进 `-ldflags` 和镜像 tag，
  所以「线上跑的是哪个 commit」不需要靠记忆。

第一次构建要下 bun 依赖和 Go module（几分钟）；之后 Docker 层缓存命中，
改前端只有几秒到几十秒。

只打不可变的 `luk/new-api:<git describe>`，**不动** `:tavern`（旧脚本还在用它）。

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
- **首页文案不在仓库里。** 首页是 `options` 表里的 `HomePageContent`（约 7KB 的
  HTML + `<style>`），在后台「首页内容」里编辑。仓库里的
  `deploy/home-page-content.html` 是它的副本，改完样式要手动写回数据库：
  ```bash
  PW=$(docker inspect new-api-mysql --format '{{range .Config.Env}}{{println .}}{{end}}' \
       | grep '^MYSQL_ROOT_PASSWORD=' | cut -d= -f2-)
  docker exec -i new-api-mysql mysql -uroot -p"$PW" --default-character-set=utf8mb4 new_api < update.sql
  ```
  生成 `update.sql` 时注意两点：值里含单引号/反斜杠要转义；`mysql` 批处理默认会把
  换行转义成 `\n`，**读取时务必加 `--raw`**，否则写回的内容会被破坏。这段 HTML 能
  用 `var(--foreground)`、`var(--radius)`、`var(--font-display)` 这类 token，但用不了
  Tailwind 工具类（构建时扫描不到），所以样式只能靠内联或它自带的 `<style>`。

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
