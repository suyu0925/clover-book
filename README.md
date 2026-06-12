# 🍀 Clover Book

家庭记账本 —— 以 **Beancount 文件为唯一真相源**的多人协作记账应用。

## 功能特性

| 功能 | 说明 |
|------|------|
| 多账本管理 | 创建多个账本，各账本独立隔离 |
| 账本协作 | 邀请成员加入账本，支持 Owner/Member 角色 |
| 收支记录 | 支持支出、收入、转账、报销、借入/借出六种类型 |
| 两级分类 | 自定义父子两级分类，带图标 |
| 账户管理 | 管理资产/负债/收入/支出/权益五类账户 |
| 预算管理 | 按月设置分类预算，实时追踪执行进度 |
| 定期任务 | 设置周期性交易（日/周/月/年），支持自动执行 |
| 报表统计 | 收支汇总、分类饼图、月度趋势折线图 |
| 附件管理 | 为交易上传凭证图片/文件 |
| CSV 导入 | 批量导入历史交易数据 |
| Beancount 同步 | 所有交易双向同步到 `.beancount` 文件 |
| 用户设置 | 修改个人资料和密码 |

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| **前端** | Vite + React + TailwindCSS 4 | React 19, Vite 6 |
| **前端状态** | TanStack Query + tRPC React | tRPC v11 |
| **后端** | Bun + Hono | Bun 1.x, Hono 4.x |
| **API** | tRPC v11 + superjson | 端到端类型安全 |
| **ORM** | Drizzle ORM + drizzle-kit | PostgreSQL dialect |
| **数据库** | PostgreSQL 16 | 查询缓存层 |
| **会计核心** | Beancount（纯 TS 实现） | parser + writer |
| **认证** | JWT（jose 库）| Bearer Token |
| **部署** | Docker + docker-compose | 多阶段构建 |

## 项目结构

```
clover-book/
├── packages/
│   ├── core/                   # 共享包（前后端复用）
│   │   └── src/
│   │       ├── beancount/      # Beancount parser / writer
│   │       ├── schemas/        # Zod 校验 schemas（auth/ledger/transaction）
│   │       └── constants/      # 枚举常量（AccountType, TransactionType 等）
│   │
│   ├── server/                 # 后端服务（Bun + Hono + tRPC）
│   │   └── src/
│   │       ├── index.ts        # Hono app 入口，文件上传/下载路由，静态文件服务
│   │       ├── db/
│   │       │   ├── schema.ts   # Drizzle 表定义（所有 DB 表结构）
│   │       │   └── index.ts    # DB 连接实例
│   │       ├── beancount/
│   │       │   └── file-manager.ts  # Beancount 文件读写与数据库同步
│   │       └── trpc/
│   │           ├── index.ts    # tRPC 初始化（router, procedure, middleware）
│   │           ├── context.ts  # tRPC context（JWT 解析、用户注入）
│   │           ├── router.ts   # 根 Router（汇总所有子 Router）
│   │           └── routers/    # 各业务 Router
│   │               ├── auth.ts          # 注册、登录、修改密码/资料
│   │               ├── ledger.ts        # 账本 CRUD
│   │               ├── transaction.ts   # 交易 CRUD + Beancount 同步
│   │               ├── account.ts       # 账户管理
│   │               ├── category.ts      # 两级分类管理
│   │               ├── budget.ts        # 预算管理
│   │               ├── recurring.ts     # 定期任务
│   │               ├── stats.ts         # 报表统计
│   │               ├── import.ts        # CSV 批量导入
│   │               ├── attachment.ts    # 附件 tRPC 接口
│   │               └── member.ts        # 账本成员管理
│   │
│   └── web/                    # 前端应用（Vite + React）
│       └── src/
│           ├── App.tsx         # 路由配置（React Router）
│           ├── lib/trpc.ts     # tRPC 客户端初始化
│           └── pages/          # 页面组件
│               ├── LoginPage.tsx
│               ├── LedgerListPage.tsx
│               ├── TransactionPage.tsx
│               ├── TransactionDetailPage.tsx
│               ├── AccountPage.tsx
│               ├── CategoryPage.tsx
│               ├── BudgetPage.tsx
│               ├── RecurringPage.tsx
│               ├── StatsPage.tsx
│               ├── ImportPage.tsx
│               ├── MemberPage.tsx
│               └── SettingsPage.tsx
│
├── docs/
│   ├── requirements.md         # 产品需求文档
│   ├── technical-design.md     # 技术方案设计文档
│   └── development-guide.md    # 开发指南（本地环境 + 代码规范 + 功能扩展）
│
├── Dockerfile                  # 多阶段生产构建
├── docker-compose.yml          # 生产环境编排（app + postgres）
├── docker-compose.dev.yml      # 开发环境编排（仅 postgres）
└── docker-entrypoint.sh        # 容器启动脚本
```

## 快速开始

### 方式一：Docker 部署（推荐）

```bash
# 1. 克隆项目
git clone <repo-url> clover-book
cd clover-book

# 2. 启动（首次会自动构建镜像并推送 DB schema）
docker compose up -d

# 3. 访问
open http://localhost:3000
```

自定义配置（可选）：
```bash
# 创建 .env 文件覆盖默认值
cat > .env << 'EOF'
JWT_SECRET=your-strong-secret-here
CORS_ORIGIN=https://your-domain.com
EOF
docker compose up -d
```

### 方式二：本地开发

**前置条件：** Bun 1.x、PostgreSQL 16

```bash
# 1. 安装依赖
bun install

# 2. 启动 PostgreSQL（推荐用 Docker）
docker compose -f docker-compose.dev.yml up -d

# 3. 推送数据库 schema
cd packages/server && bun run db:push && cd ../..

# 4. 启动后端（端口 3000，支持热重载）
bun run dev:server

# 5. 启动前端（另开终端，端口 5173，支持热更新）
bun run dev:web

# 6. 访问
open http://localhost:5173
```

**环境变量**（开发时可在 `packages/server/.env` 中设置）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | `postgresql://clover:clover@localhost:5432/cloverbook` | PostgreSQL 连接串 |
| `JWT_SECRET` | `clover-book-dev-secret-key` | JWT 签名密钥（生产必改） |
| `CORS_ORIGIN` | `http://localhost:5173` | 允许的前端来源 |
| `PORT` | `3000` | 服务监听端口 |
| `DATA_DIR` | `/app/data` | 数据根目录（Beancount 文件存放位置） |
| `UPLOAD_DIR` | `/app/data/uploads` | 附件上传目录 |

## 架构概览

```
浏览器
  │  tRPC over HTTP (superjson)
  ▼
Hono Server (Bun)
  ├── /trpc/*    → tRPC Router（业务逻辑）
  ├── /api/attachments/upload   → 文件上传
  ├── /api/attachments/:id      → 文件下载
  └── /* (notFound)             → 静态文件 + SPA fallback
         │
         ├── Drizzle ORM ──► PostgreSQL（查询缓存）
         └── Beancount FileManager ──► .beancount 文件（真相源）
```

**数据流原则：**
- 所有写操作：先更新 PostgreSQL，再同步写入 Beancount 文件
- 所有读操作：从 PostgreSQL 查询（性能优先）
- Beancount 文件是真相源：若出现不一致，可通过导入功能重新同步

## 常用命令

```bash
# 开发
bun run dev:server      # 启动后端（热重载）
bun run dev:web         # 启动前端（热更新）

# 数据库
cd packages/server
bun run db:push         # 推送 schema 变更（开发用）
bun run db:generate     # 生成迁移文件
bun run db:migrate      # 执行迁移

# 构建
bun run build           # 构建所有包

# Docker
docker compose up -d --build    # 重新构建并启动
docker compose logs app         # 查看应用日志
docker compose down             # 停止并移除容器
```

## 数据持久化

Docker 部署时，数据存储在两个 named volume：

| Volume | 内容 |
|--------|------|
| `pgdata` | PostgreSQL 数据文件 |
| `appdata` | Beancount `.beancount` 文件 + 附件上传文件 |

升级镜像时数据不会丢失：
```bash
docker compose pull   # 或重新 build
docker compose up -d  # 数据 volume 自动保留
```

## 文档

- [产品需求文档](docs/requirements.md)
- [技术方案设计文档](docs/technical-design.md)
- [开发指南](docs/development-guide.md)

## License

MIT
