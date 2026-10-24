# HAS 公司网络兼容：免费方案

Firebase 继续只部署静态 Hosting，不需要 Blaze、Cloud Functions、Cloud Build 或 Artifact Registry。新增转发使用 **Cloudflare Workers Free**，不选择 Workers Paid，不开通付费绑定、数据库或存储。现有域名和后端继续使用原来的服务；这里的零费用是新增转发功能不增加服务费用，不代表原有服务的费用被取消。

## 免费额度与限制

Workers Free 目前是整个账户每天 100,000 次请求，UTC 午夜重置。达到免费上限会限制服务，而不是自动购买额外额度。必须在 Cloudflare 控制台确认账户的 Workers 方案是 Free；配置文件不能把一个已经付费的账户自动降级。不要升级付费方案。

正常同步优先使用 SSE 长连接，转发不缓存、不缓冲事件，避免每三秒请求两次接口。只有公司网络拒绝或中断长连接时才退回三秒轮询；轮询会更快消耗免费额度。Dashboard 保留 30 秒刷新。免费不等于无限使用。

## 首次配置（必须先完成，再发布网页）

1. 使用 Cloudflare 免费账户添加 `mufcapp.net`，选择网站 Free 方案和 Workers Free。若域名还不在 Cloudflare，需要按提示在注册商修改 nameserver。先完整核对原有 DNS 记录，保留网站、API、邮件等全部记录。
2. 保留 `www.mufcapp.net` 原来的 Firebase Hosting 目标，不修改为 Worker 域名；只将这个 DNS 记录设为 Proxied（橙色云）。保留 Firebase 已绑定的自定义域名。SSL/TLS 选择 Full (strict)，确认网页和 Firebase 登录正常。不要对 `/has-network/*` 设置 Cache Everything 或浏览器挑战。
3. 在 Cloudflare **Workers & Pages** 确认 Workers 账户为 Free。以下命令从仓库根目录执行：

   ```powershell
   npx wrangler login
   npx wrangler deploy --config deploy/has-network/wrangler.jsonc
   ```

   配置仅注册 `www.mufcapp.net/has-network/*` 路由，其他网页仍由 Firebase 提供。没有 Workers 开发子域名、数据库、存储或定时任务。也可以在控制台创建 Worker，粘贴 `deploy/has-network/worker.mjs`，并添加同样的路由。确认路由的额度耗尽行为为 Fail closed（限制使用），不要升级套餐。
4. 浏览器访问 `https://www.mufcapp.net/has-network/has-pbb-api/context`。未登录请求应显示 JSON `Sign in to continue.`（HTTP 401）。若显示 Firebase 404 或 HTML，说明 Worker 路由尚未生效，先不要发布网页。
5. 在 `public` 目录仅部署 Hosting：

   ```powershell
   firebase deploy --only hosting --project china-eastern
   ```

   不再执行 `--only functions`，不需要在 `public/functions` 安装依赖。Worker 与 Firebase Hosting 分别发布；只发布 Worker 不会更新 Firebase 网页。上述命令不修改域名 nameserver，也不升级计费方案。

## 验证

在公司电脑验证登录、账号切换、两个角色的检查单、登机口同步、Dashboard 筛选、配置保存和 PDF 下载。阻止浏览器直接访问 `https://api.mufcapp.net/**` 后，这些操作应继续通过同域 `/has-network/**` 完成。后端仍校验 Firebase token 和各账号权限，Worker 只向固定 API 转发，不透传 Cookie，不跟随上游重定向，不缓存个人数据。

公司电脑的具体拦截策略尚未确认。如果主域名或 Firebase 认证本身也被阻止，本次改动不能绕过这些策略。只有网页文件无法让 Firebase 免费静态 Hosting 自己执行服务端转发；Cloudflare DNS 代理和 Worker 路由是这个免费方案的必要条件。

参考：[Workers 免费方案](https://developers.cloudflare.com/workers/platform/pricing/)、[每日上限](https://developers.cloudflare.com/workers/platform/limits/)、[域名路由要求](https://developers.cloudflare.com/workers/configuration/routing/routes/)。
