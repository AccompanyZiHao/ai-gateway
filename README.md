# AI Gateway

一个 Next.js 全栈项目，部署在 Vercel：多渠道 AI 机器人接入（飞书 / 微信测试号 / 企业微信自建应用）+ 多供应商 LLM 配置层 + 坚果云 WebDAV 入库，以及 Skills 排行榜等前端页面。

## 功能总览

| 功能 | 入口 | 说明 |
|------|------|------|
| 飞书机器人 | `/api/feishu/[slug]` | 验签解析 → LLM 生成回答 → 主动回复（`after()` 异步执行，不阻塞回调） |
| 微信测试号机器人 | `/api/wechat` | 文字/语音/链接收集进坚果云 inbox + 口语化记账；`after()` 异步处理化解微信 5 秒超时 |
| 企业微信自建应用 | `/api/wecom` | 被动回复版：验签解密 → 同步处理 → 回复加密写进响应体（5 秒窗口内），不调主动发消息 API、不依赖可信 IP 白名单。管理员全功能（收集 / `#记` 指令），其他成员仅记账 |
| Skills 排行榜 | `/apps/skills` | 拉取 [skills-leaderboard](https://github.com/AccompanyZiHao/skills-leaderboard) 数据，展示当前榜单 + 近 7 天趋势（数据接口 `/api/skills`） |
| 网页聊天 | `/api/web/[slug]/chat` | 预留，待开发 |

三个消息渠道共用一套 LLM 配置层（`src/lib/ai/`）：`getLLMProvider()` 按环境变量 `LLM_PROVIDER` 创建对应 Provider，OpenAI 兼容协议统一适配 minimax / deepseek / qwen / openai，另支持 claude 与 custom。

## 项目结构

```
src/
├── app/                              # Next.js App Router
│   ├── page.tsx                      #   首页 → 应用合集
│   ├── apps/                         #   前端页面（按应用划分）
│   │   ├── ai/                       #     AI Gateway 首页 + 管理后台（占位）
│   │   ├── blog/                     #     博客（占位）
│   │   └── skills/                   #     Skills 排行榜（page + chart）
│   │
│   └── api/                          #   路由层：只做 HTTP 请求/响应的薄壳
│       ├── feishu/[slug]/route.ts    #     飞书 Webhook          /api/feishu/:slug
│       ├── wechat/route.ts           #     微信测试号回调          /api/wechat
│       ├── wecom/route.ts            #     企业微信回调（被动回复） /api/wecom
│       ├── skills/route.ts           #     排行榜数据接口          /api/skills
│       ├── web/[slug]/chat/route.ts  #     网页聊天（预留）        /api/web/:slug/chat
│       └── admin/projects/route.ts   #     项目管理（预留）        /api/admin/projects
│
├── services/                         #   业务逻辑层（编排 lib，处理具体业务）
│   ├── feishu/bot.ts                 #     飞书机器人完整业务流程
│   ├── wechat/bot.ts                 #     测试号：收集入库 + 记账
│   └── wecom/bot.ts                  #     企微应用：收集 / #记 / 记账（被动回复）
│
└── lib/                              #   基础设施层：客户端、工具函数、类型
    ├── ai/                           #     LLM 多供应商配置层（presets + Provider 工厂）
    ├── feishu/                       #     飞书 API 客户端 / 解析 / 验签 / 类型
    ├── wechat/                       #     测试号验签 / 解析 / 口语记账解析与分类
    ├── wecom/                        #     企微消息加解密（AES） / XML 解析
    ├── skills/                       #     排行榜数据拉取与加工
    └── webdav.ts                     #     坚果云 WebDAV 客户端（MKCOL/PUT/GET 最小实现）

docs/plans/                           #   设计文档（如企微问答机器人设计）
```

## 新增应用

### 新增前端页面

在 `src/app/apps/` 下新建文件夹即可：

```
src/app/apps/portfolio/
└── page.tsx    # → 访问路径 /apps/portfolio
```

然后在 `src/app/page.tsx` 的 `apps` 数组中添加一条。

### 新增后端接口

在 `src/app/api/` 下新建路由即可：

```
src/app/api/xxx/route.ts    # GET/POST /api/xxx
```

### 新增业务逻辑

在 `src/services/` 下按模块建文件夹：

```
src/services/your-feature/
└── xxx.ts                      # 编排 lib 中的能力，处理具体业务
```

### 新增共享工具

在 `src/lib/` 下按模块建文件夹（放纯工具、客户端、类型，不涉及业务）：

```
src/lib/your-module/
├── client.ts
├── types.ts
└── utils.ts
```

### 三层职责划分

| 层 | 目录 | 职责 | 示例 |
|---|------|------|------|
| 路由层 | `app/api/` | HTTP 请求/响应，参数校验，返回状态码 | 读 body、返回 401 |
| 业务层 | `services/` | 编排多个 lib，处理完整业务流程 | 验签→解析→调 AI→回复 |
| 基础设施层 | `lib/` | 可复用的客户端、工具函数、类型定义 | 飞书 API 封装、签名验证 |

## 开发

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 构建
npm run build

# 类型检查
npx tsc --noEmit
```

## 环境变量

复制 `.env.local.example` 为 `.env.local` 并填写，Vercel 上配置同名变量：

```bash
cp .env.local.example .env.local
```

### LLM（三个机器人共用）

| 变量 | 说明 |
|------|------|
| `LLM_PROVIDER` | 模型提供商：minimax（默认）/ deepseek / qwen / openai / claude / custom |
| `LLM_API_KEY` | API Key（必填） |
| `LLM_MODEL` | 自定义模型名（可选，覆盖预设） |
| `LLM_BASE_URL` | 自定义 API 地址（可选，custom 时必填） |

### 飞书

| 变量 | 说明 |
|------|------|
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` | 飞书应用凭证 |
| `FEISHU_VERIFICATION_TOKEN` / `FEISHU_ENCRYPT_KEY` | 验证 Token / 加密 Key（可选） |

### 微信测试号

| 变量 | 说明 |
|------|------|
| `WECHAT_TOKEN` | 服务器配置 Token |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 测试号凭证 |
| `WECHAT_ADMIN_OPENID` | 管理员 openid；不配则所有人可用收集功能，首次发消息回复里会附带 openid |

### 企业微信自建应用

| 变量 | 说明 |
|------|------|
| `WECOM_TOKEN` / `WECOM_ENCODING_AES_KEY` | 回调配置的 Token / 43 位 AESKey（被动回复必填，仅此两项） |
| `WECOM_ADMIN_USERID` | 管理员 userid；不配则所有成员可用收集功能，首次发消息回复里会附带 userid |
| `WECOM_CORP_ID` / `WECOM_AGENT_ID` / `WECOM_AGENT_SECRET` | ⚠️ 旧主动回复版遗留，当前代码未使用 |

### 坚果云 WebDAV（消息入库）

| 变量 | 说明 |
|------|------|
| `WEBDAV_BASE` | 根地址 `https://dav.jianguoyun.com/dav/<文件夹名>`，文件夹需网页端先建好 |
| `WEBDAV_USER` | 坚果云账号（邮箱） |
| `WEBDAV_PASSWORD` | 应用密码（账户信息 → 安全选项生成），非登录密码 |

## 部署

部署到 Vercel，在项目设置中配置上述环境变量即可。函数区域建议新加坡（sin1），缓解微信/企微回调跨境超时。

设计与实施文档见 `docs/plans/`。
