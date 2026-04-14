# AI Gateway

一个 Next.js 全栈项目，包含多个应用（飞书 AI 机器人、博客等），部署在 Vercel 上。

## 项目结构

```
src/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # 首页 → 应用合集
│   ├── layout.tsx                # 根布局
│   ├── globals.css               # 全局样式
│   │
│   ├── apps/                     # 👉 前端页面（按应用划分）
│   │   ├── ai/
│   │   │   ├── page.tsx          #     AI Gateway 首页        /apps/ai
│   │   │   └── admin/page.tsx    #     AI 管理后台（占位）    /apps/ai/admin
│   │   └── blog/
│   │       └── page.tsx          #     博客（占位）           /apps/blog
│   │
│   └── api/                      # 路由层：只做 HTTP 请求/响应的薄壳
│       ├── feishu/
│       │   └── [slug]/route.ts   #     飞书 Webhook           /api/feishu/:slug
│       ├── web/
│       │   └── [slug]/chat/route.ts  # 网页聊天（预留）       /api/web/:slug/chat
│       └── admin/
│           └── projects/route.ts #     项目管理（预留）        /api/admin/projects
│
├── services/                     # 👉 业务逻辑层（编排 lib，处理具体业务）
│   └── feishu/
│       └── bot.ts               #     飞书机器人完整业务流程
│
└── lib/                          # 基础设施层：客户端、工具函数、类型
    ├── ai/
    │   └── claude.ts             #     Claude API 调用封装
    └── feishu/
        ├── types.ts              #     飞书类型定义
        ├── client.ts             #     飞书 API 客户端（发消息、获取 token）
        ├── parser.ts             #     飞书消息解析
        └── verify.ts             #     飞书签名验证
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

复制 `.env.local.example` 为 `.env.local` 并填写：

```bash
cp .env.local.example .env.local
```

| 变量 | 说明 |
|------|------|
| `FEISHU_APP_ID` | 飞书应用 ID |
| `FEISHU_APP_SECRET` | 飞书应用 Secret |
| `FEISHU_VERIFICATION_TOKEN` | 飞书验证 Token（可选） |
| `FEISHU_ENCRYPT_KEY` | 飞书加密 Key（可选） |
| `ANTHROPIC_API_KEY` | Anthropic Claude API Key |

## 部署

部署到 Vercel，在 Vercel 项目设置中配置环境变量即可。
