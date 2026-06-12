# Clover Book 开发指南

本文档面向需要接手、维护或扩展 Clover Book 的开发者（包括 Coding Agent）。

---

## 目录

1. [本地开发环境](#1-本地开发环境)
2. [代码架构详解](#2-代码架构详解)
3. [数据库 Schema](#3-数据库-schema)
4. [tRPC Router 规范](#4-trpc-router-规范)
5. [前端页面规范](#5-前端页面规范)
6. [Beancount 同步机制](#6-beancount-同步机制)
7. [如何新增一个功能模块](#7-如何新增一个功能模块)
8. [常见模式与代码片段](#8-常见模式与代码片段)
9. [Docker 构建细节](#9-docker-构建细节)
10. [已知问题与经验教训](#10-已知问题与经验教训)

---

## 1. 本地开发环境

### 前置条件

- **Bun** >= 1.0（[安装](https://bun.sh)）
- **Docker Desktop**（用于本地 PostgreSQL）
- Node.js 不需要——项目完全基于 Bun

### 初次启动

```bash
# 克隆并进入项目
git clone <repo> clover-book && cd clover-book

# 安装所有包（workspace 一键安装）
bun install

# 启动 PostgreSQL（仅数据库，用开发 compose 文件）
docker compose -f docker-compose.dev.yml up -d

# 推送数据库表结构（首次或 schema 变更后执行）
cd packages/server && bun run db:push && cd ../..

# 终端 1：启动后端（端口 3000，--watch 热重载）
bun run dev:server

# 终端 2：启动前端（端口 5173，Vite HMR）
bun run dev:web
```

后端环境变量放在 `packages/server/.env`（不提交到 git）：
```dotenv
DATABASE_URL=postgresql://clover:clover@localhost:5432/cloverbook
JWT_SECRET=dev-secret
CORS_ORIGIN=http://localhost:5173
DATA_DIR=./data
UPLOAD_DIR=./data/uploads
```

### VSCode 推荐配置

项目使用 TypeScript，推荐安装：
- **Biome**（格式化/Lint，如有 biome.json）
- **Tailwind CSS IntelliSense**（前端开发）
- **Bun for Visual Studio Code**（Bun 运行时支持）

---

## 2. 代码架构详解

### Monorepo 结构

项目使用 Bun Workspace，三个包：

```
packages/
├── core      (@clover-book/core)    # 纯逻辑，无框架依赖
├── server    (@clover-book/server)  # 后端服务
└── web       (@clover-book/web)     # 前端 SPA
```

包间依赖关系：
```
web ──depends──► server (仅导入 AppRouter 类型)
web ──depends──► core
server ──depends──► core
```

**关键规则：** `web` 只导入 `server` 的 TypeScript 类型（`AppRouter`），不导入运行时代码，保证前后端物理隔离。

### 后端请求处理流程

```
HTTP Request
    │
    ▼ Hono middleware: CORS
    │
    ├─ /trpc/*  ──► tRPC Server
    │                  │
    │                  ▼ context.ts: 解析 JWT → 注入 userId
    │                  │
    │                  ▼ 各 Router 业务逻辑
    │                       │
    │                       ├── Drizzle ORM → PostgreSQL
    │                       └── BeancountFileManager → .beancount 文件
    │
    ├─ /api/attachments/upload  ──► 文件上传（multipart/form-data）
    ├─ /api/attachments/:id     ──► 文件下载（Stream）
    │
    └─ /* (notFound handler)    ──► 静态文件 or SPA index.html
```

### tRPC Context

每个请求都会经过 `packages/server/src/trpc/context.ts`：
- 从 `Authorization: Bearer <token>` 解析 JWT
- 注入 `ctx.userId`（未登录为 `null`）
- `protectedProcedure` 会自动检查 `ctx.userId`，未登录抛 `UNAUTHORIZED`

---

## 3. 数据库 Schema

Schema 定义在 `packages/server/src/db/schema.ts`，使用 Drizzle ORM。

### 核心表关系

```
users
  │
  ├──(owner)──► ledgers ──► ledger_members ──► users (多对多)
                  │
                  ├──► accounts
                  ├──► categories (自引用，parentId)
                  ├──► transactions ──► postings ──► accounts
                  │                 └──► transaction_tags
                  │                 └──► attachments
                  ├──► budgets ──► categories
                  └──► recurring_transactions
```

### 关键设计决策

| 表 | 重要字段 | 说明 |
|----|----------|------|
| `ledgers` | `filePath` | 对应 Beancount 文件路径（相对 `DATA_DIR`） |
| `transactions` | `id` | 写入 Beancount 元数据 `id`，用于定位修改和缓存重建 |
| `postings` | `accountId`, `amount` | 复式记账借贷分录，一笔交易至少两条 posting |
| `categories` | `parentId` | 自引用实现两级分类，`parentId=null` 为一级 |

### 修改 Schema

```bash
# 修改 packages/server/src/db/schema.ts 后

# 开发环境（直接 push，无需迁移文件）
cd packages/server && bun run db:push

# 生产环境（生成迁移文件，走正式迁移流程）
cd packages/server && bun run db:generate && bun run db:migrate
```

---

## 4. tRPC Router 规范

### Router 文件结构

每个 Router 文件（`packages/server/src/trpc/routers/*.ts`）遵循以下模式：

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../index';
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';

export const xxxRouter = router({
  // 查询（幂等）用 query
  list: protectedProcedure
    .input(z.object({ ledgerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // ctx.userId 已保证非 null（protectedProcedure）
      // 先检查用户对 ledger 的权限
      const member = await db.query.ledgerMembers.findFirst({
        where: and(
          eq(schema.ledgerMembers.ledgerId, input.ledgerId),
          eq(schema.ledgerMembers.userId, ctx.userId),
        ),
      });
      if (!member) throw new TRPCError({ code: 'FORBIDDEN' });
      // ... 业务逻辑
    }),

  // 写操作用 mutation
  create: protectedProcedure
    .input(createXxxSchema)
    .mutation(async ({ ctx, input }) => {
      // ...
    }),
});
```

### 注册新 Router

在 `packages/server/src/trpc/router.ts` 中添加：
```typescript
import { xxxRouter } from './routers/xxx';

export const appRouter = router({
  // ...已有 routers
  xxx: xxxRouter,  // 新增这行
});
```

### 权限检查模式

每个操作都应检查用户是否有权限访问目标账本：
```typescript
// 工具函数（可复用）
async function assertLedgerMember(ledgerId: string, userId: string) {
  const member = await db.query.ledgerMembers.findFirst({
    where: and(
      eq(schema.ledgerMembers.ledgerId, ledgerId),
      eq(schema.ledgerMembers.userId, userId),
    ),
  });
  if (!member) throw new TRPCError({ code: 'FORBIDDEN', message: '无权访问此账本' });
  return member;
}

async function assertLedgerOwner(ledgerId: string, userId: string) {
  const member = await assertLedgerMember(ledgerId, userId);
  if (member.role !== 'owner') throw new TRPCError({ code: 'FORBIDDEN', message: '仅 Owner 可操作' });
}
```

---

## 5. 前端页面规范

### 路由结构（App.tsx）

```
/login              → LoginPage（未登录跳转到这里）
/                   → LedgerListPage（账本列表，主入口）
/ledger/:id         → TransactionPage（账本详情，交易列表）
/ledger/:id/stats   → StatsPage
/ledger/:id/accounts → AccountPage
/ledger/:id/categories → CategoryPage
/ledger/:id/budgets → BudgetPage
/ledger/:id/recurring → RecurringPage
/ledger/:id/import  → ImportPage
/ledger/:id/members → MemberPage
/transaction/:id    → TransactionDetailPage
/settings           → SettingsPage
```

### tRPC 查询模式

前端统一使用 tRPC React hooks，配合 TanStack Query：

```typescript
// 查询
const { data, isLoading } = trpc.transaction.list.useQuery({ ledgerId });

// 变更（含乐观更新/自动 invalidate）
const utils = trpc.useUtils();
const createMutation = trpc.transaction.create.useMutation({
  onSuccess: () => {
    utils.transaction.list.invalidate();  // 刷新列表
  },
});

// 调用
createMutation.mutate({ ledgerId, ... });
```

### 认证状态管理

Token 存在 `localStorage.getItem('accessToken')`。在 `lib/trpc.ts` 的 `headers()` 中自动附带。

登录后需要刷新 tRPC client（`App.tsx` 中通过 state 控制）。

---

## 6. Beancount 同步机制

### 核心类：BeancountFileManager

`packages/server/src/beancount/file-manager.ts`

每个账本对应一个 `.beancount` 文件，路径存在 `ledgers.filePath`。

**主要方法：**

| 方法 | 触发时机 | 说明 |
|------|----------|------|
| `appendTransaction()` | 创建交易 | 追加到文件末尾，返回行号 |
| `updateTransaction()` | 更新交易 | 按行号定位，替换对应行 |
| `deleteTransaction()` | 删除交易 | 按行号删除对应行 |
| `rebuildLedgerCache()` | 导入/修复 | 解析整个文件，同步到账本的 DB 缓存 |

### 数据流

```
创建交易：
  前端 → trpc.transaction.create
    → BeancountFileManager.appendTransaction()
    → 写入 PostgreSQL 查询缓存（transactions + postings + tags）
    → 更新 ledgers.version

修改交易：
  前端 → trpc.transaction.update
    → 计算目标交易和分录
    → BeancountFileManager.updateTransaction(transactionId, newContent)
    → 更新 PostgreSQL 查询缓存

删除交易：
  前端 → trpc.transaction.delete
    → BeancountFileManager.deleteTransaction(transactionId)
    → 删除 PostgreSQL 查询缓存记录

缓存重建：
  前端/维护工具 → trpc.ledger.rebuildCache
    → 解析 Beancount 文件
    → 重建该账本的 accounts / transactions / postings / transaction_tags 缓存
    → 保留附件等非 Beancount 源数据
```

### Beancount 文件格式

```beancount
; 账本名称: 家庭记账
; 货币: CNY

2024-01-15 * "超市" "日用品采购"
  Expenses:日常:购物    150.00 CNY
  Assets:储蓄卡        -150.00 CNY
```

---

## 7. 如何新增一个功能模块

以"新增标签管理功能"为例，完整步骤：

### Step 1：更新数据库 Schema

`packages/server/src/db/schema.ts`：
```typescript
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  ledgerId: uuid('ledger_id').references(() => ledgers.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  color: varchar('color', { length: 20 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

```bash
cd packages/server && bun run db:push
```

### Step 2：在 core 包添加 Zod Schema（可选）

`packages/core/src/schemas/tag.ts`：
```typescript
import { z } from 'zod';
export const createTagSchema = z.object({
  ledgerId: z.string().uuid(),
  name: z.string().min(1).max(50),
  color: z.string().optional(),
});
```

在 `packages/core/src/index.ts` 中导出。

### Step 3：创建后端 Router

`packages/server/src/trpc/routers/tag.ts`：
```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../index';
import { db, schema } from '../../db';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { createTagSchema } from '@clover-book/core';

export const tagRouter = router({
  list: protectedProcedure
    .input(z.object({ ledgerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // 检查权限
      const member = await db.query.ledgerMembers.findFirst({
        where: and(
          eq(schema.ledgerMembers.ledgerId, input.ledgerId),
          eq(schema.ledgerMembers.userId, ctx.userId),
        ),
      });
      if (!member) throw new TRPCError({ code: 'FORBIDDEN' });
      
      return db.select().from(schema.tags)
        .where(eq(schema.tags.ledgerId, input.ledgerId));
    }),

  create: protectedProcedure
    .input(createTagSchema)
    .mutation(async ({ ctx, input }) => {
      // ... 同上权限检查
      const [tag] = await db.insert(schema.tags)
        .values({ ...input })
        .returning();
      return tag;
    }),
});
```

### Step 4：注册到根 Router

`packages/server/src/trpc/router.ts`：
```typescript
import { tagRouter } from './routers/tag';
export const appRouter = router({
  // ... 已有
  tag: tagRouter,
});
```

### Step 5：创建前端页面

`packages/web/src/pages/TagPage.tsx`：
```typescript
import { trpc } from '../lib/trpc';

export function TagPage({ ledgerId }: { ledgerId: string }) {
  const { data: tags } = trpc.tag.list.useQuery({ ledgerId });
  const utils = trpc.useUtils();
  const createTag = trpc.tag.create.useMutation({
    onSuccess: () => utils.tag.list.invalidate(),
  });
  // ... 渲染
}
```

### Step 6：添加路由

`packages/web/src/App.tsx`：
```tsx
<Route path="/ledger/:id/tags" element={<TagPage ledgerId={id} />} />
```

---

## 8. 常见模式与代码片段

### 分页查询

```typescript
import { desc, count } from 'drizzle-orm';

list: protectedProcedure
  .input(z.object({
    ledgerId: z.string().uuid(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(20),
  }))
  .query(async ({ input }) => {
    const offset = (input.page - 1) * input.pageSize;
    const [items, [{ total }]] = await Promise.all([
      db.select().from(schema.transactions)
        .where(eq(schema.transactions.ledgerId, input.ledgerId))
        .orderBy(desc(schema.transactions.date))
        .limit(input.pageSize)
        .offset(offset),
      db.select({ total: count() }).from(schema.transactions)
        .where(eq(schema.transactions.ledgerId, input.ledgerId)),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }),
```

### 前端加载状态处理

```tsx
function MyPage() {
  const { data, isLoading, error } = trpc.xxx.list.useQuery({ ledgerId });

  if (isLoading) return <div className="flex justify-center p-8"><Spinner /></div>;
  if (error) return <div className="text-red-500">加载失败：{error.message}</div>;
  if (!data?.length) return <div className="text-gray-500 text-center p-8">暂无数据</div>;

  return <div>{/* 正常渲染 */}</div>;
}
```

### 表单提交模式

```tsx
const [loading, setLoading] = useState(false);
const mutation = trpc.xxx.create.useMutation({
  onSuccess: () => {
    toast('创建成功');
    onClose();
  },
  onError: (err) => toast.error(err.message),
});

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  mutation.mutate({ ...formData });
};
```

---

## 9. Docker 构建细节

### 多阶段构建流程

```
Stage 1: deps
  - 复制所有 package.json（workspace 要求全部成员都要有）
  - bun install --frozen-lockfile

Stage 2: build
  - 复制源码
  - bun run build（web → dist/，server → dist/index.js）
  - 服务端用 bun bundler，将所有代码打包成单个 JS 文件

Stage 3: production
  - 重新 bun install（需要包含 devDeps，因 drizzle-kit 在 devDeps）
  - 复制 server/dist → /app/server/
  - 复制 web/dist   → /app/web/
  - 复制 drizzle 配置和 db schema（容器启动时执行 db:push）
```

### 关键注意事项

1. **bun install 不能加 `--production`**：`drizzle-kit` 在 `devDependencies`，但容器启动时 `bunx drizzle-kit push` 需要本地安装，所以必须完整安装。

2. **不要对 `postgres` 包使用 `--external`**：`postgres` 是纯 JS 包，可以被 bun bundler 打包进 `index.js`，使用 external 会导致运行时找不到包。

3. **不要用 `bun run` 启动服务**：`bun run` 会强制覆盖 `process.env.NODE_ENV` 为 `development`。用 `bun /app/server/index.js` 直接执行。

4. **静态文件服务不依赖 NODE_ENV**：检测 `/app/web/index.html` 是否存在来决定是否启用，避免 Bun 覆盖环境变量的问题。

### 本地测试生产构建

```bash
# 完整重建（无缓存）
docker compose build --no-cache

# 启动并实时查看日志
docker compose up

# 只查看应用日志
docker compose logs -f app
```

---

## 10. 已知问题与经验教训

### Bun 运行时覆盖 NODE_ENV

**问题：** `bun run`、`bun` 命令都会将 `process.env.NODE_ENV` 强制设为 `"development"`，即使 Docker 环境变量设置了 `production`。

**解决方案：** 不依赖 `NODE_ENV`，改为检测业务文件是否存在（如检查 `web/index.html`）。

### Bun Workspace Lockfile 完整性

**问题：** 在 Docker 构建中，如果 `bun install --frozen-lockfile` 时 `packages/` 下的任何一个 `package.json` 缺失，会报 `lockfile had changes` 错误。

**解决方案：** Dockerfile 中必须 COPY 所有 workspace 成员的 `package.json`，包括不直接使用的包。

### tRPC + superjson 日期序列化

tRPC 配置了 superjson transformer，`Date` 类型可以正确序列化/反序列化。但 Drizzle 的 `date` 类型字段（非 `timestamp`）返回的是字符串（`"2024-01-15"`），前端需要用 `new Date(dateStr)` 转换。

### Drizzle 自引用（categories.parentId）

`categories` 表的 `parentId` 是自引用，Drizzle 目前不支持 `.references()` 链式调用来定义自引用外键（会导致循环引用错误）。字段定义时省略 `.references()`，改在查询层面手动处理关联。

### 文件上传路由

文件上传（`/api/attachments/upload`）没有走 tRPC，而是直接在 Hono 上注册了 `app.post()` 路由，原因是 tRPC 不支持 multipart/form-data。文件下载同理。这两个路由在 `packages/server/src/index.ts` 中定义。
