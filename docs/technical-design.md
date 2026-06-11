# Clover Book 技术方案设计

## 1. 系统整体架构

### 1.1 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                      Docker Container                     │
│                                                          │
│  ┌──────────┐    tRPC     ┌───────────┐                 │
│  │  前端     │◄──────────►│  后端      │                 │
│  │  Vite +   │   HTTP     │  Bun +     │                 │
│  │  React    │            │  TypeScript │                 │
│  │  :5173    │            │  :3000      │                 │
│  └──────────┘            └─────┬───────┘                 │
│                                │                         │
│                     ┌──────────┼──────────┐              │
│                     │          │          │              │
│                     ▼          ▼          ▼              │
│              ┌───────────┐ ┌────────┐ ┌────────┐        │
│              │PostgreSQL │ │Beancount│ │ 附件   │        │
│              │  (缓存)   │ │  文件   │ │ 文件   │        │
│              │  :5432    │ │(真相源) │ │        │        │
│              └───────────┘ └────────┘ └────────┘        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 1.2 核心数据流

**写入流程**（创建/修改交易）：
```
用户操作 → tRPC API → 获取文件写锁 → 写入 Beancount 文件 → 更新 PostgreSQL 缓存 → 释放锁 → 返回结果
```

**读取流程**（查询交易/报表）：
```
用户操作 → tRPC API → 查询 PostgreSQL 缓存 → 返回结果
```

**缓存重建流程**：
```
触发重建 → 解析 Beancount 文件 → 清空相关缓存表 → 批量写入 PostgreSQL → 完成
```

### 1.3 设计原则

1. **单一真相源**：Beancount 文件是唯一的数据真相，数据库仅为缓存
2. **可恢复性**：数据库可随时从 Beancount 文件完全重建
3. **可移植性**：单一数据目录包含所有状态，复制即迁移
4. **类型安全**：tRPC + Zod 实现端到端类型安全

---

## 2. 技术栈明细

### 2.1 后端

| 组件 | 技术 | 说明 |
|------|------|------|
| 运行时 | Bun | 高性能 TS/JS 运行时，内置打包器 |
| API 框架 | tRPC v11 | 端到端类型安全的 RPC 框架 |
| HTTP 服务 | Hono | 轻量高性能，承载 tRPC 适配器和静态文件 |
| ORM | Drizzle ORM | 类型安全、轻量级、SQL-like 的 ORM |
| 数据库 | PostgreSQL 16 | 查询缓存 |
| 认证 | JWT (jose) | access token + refresh token |
| 密码哈希 | argon2 | 安全的密码哈希算法 |
| 校验 | Zod | schema 定义与运行时校验 |
| 文件锁 | proper-lockfile | 文件级写锁 |

### 2.2 前端

| 组件 | 技术 | 说明 |
|------|------|------|
| 构建工具 | Vite | 快速开发和构建 |
| UI 框架 | React 19 | 组件化 UI |
| 路由 | TanStack Router | 类型安全的文件路由 |
| 数据管理 | TanStack Query + tRPC | 服务端状态管理 |
| 样式 | TailwindCSS 4 | 原子化 CSS |
| 组件库 | shadcn/ui | 可定制的无头组件 |
| 图表 | Recharts | React 图表库 |
| 表单 | React Hook Form + Zod | 表单管理与校验 |
| 图标 | Lucide React | 图标库 |
| 代码编辑器 | CodeMirror 6 | Beancount 源文件编辑器 |

### 2.3 共享层 (packages/core)

| 组件 | 说明 |
|------|------|
| Zod Schemas | API 入参/出参的类型定义，前后端共享 |
| Beancount Parser | 纯 TS 实现的 Beancount 文件解析器 |
| Beancount Writer | 结构化数据 → Beancount 格式文本 |
| 常量与枚举 | 交易类型、账户类型、预设分类等 |

### 2.4 开发与部署

| 组件 | 技术 | 说明 |
|------|------|------|
| 包管理 | Bun workspace | Monorepo 管理 |
| 容器 | Docker + docker-compose | 生产部署 |
| 数据库迁移 | Drizzle Kit | Schema 迁移工具 |

---

## 3. 项目目录结构

```
clover-book/
├── packages/
│   ├── server/                    # 后端服务
│   │   ├── src/
│   │   │   ├── index.ts           # 入口：Hono 服务 + tRPC 适配器
│   │   │   ├── trpc/
│   │   │   │   ├── index.ts       # tRPC 初始化、context
│   │   │   │   ├── router.ts      # 根路由
│   │   │   │   └── routers/       # 各业务路由
│   │   │   │       ├── auth.ts
│   │   │   │       ├── ledger.ts
│   │   │   │       ├── transaction.ts
│   │   │   │       ├── account.ts
│   │   │   │       ├── category.ts
│   │   │   │       ├── budget.ts
│   │   │   │       ├── recurring.ts
│   │   │   │       ├── report.ts
│   │   │   │       ├── import.ts
│   │   │   │       └── attachment.ts
│   │   │   ├── db/
│   │   │   │   ├── schema.ts      # Drizzle schema 定义
│   │   │   │   ├── index.ts       # 数据库连接
│   │   │   │   └── migrations/    # 迁移文件
│   │   │   ├── services/          # 业务逻辑层
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── ledger.service.ts
│   │   │   │   ├── transaction.service.ts
│   │   │   │   └── sync.service.ts
│   │   │   ├── beancount/         # Beancount 文件操作
│   │   │   │   ├── file-manager.ts   # 文件读写 + 锁管理
│   │   │   │   └── sync.ts          # 文件 → DB 同步
│   │   │   └── middleware/
│   │   │       └── auth.ts        # JWT 鉴权中间件
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── web/                       # 前端应用
│   │   ├── src/
│   │   │   ├── main.tsx           # 入口
│   │   │   ├── App.tsx
│   │   │   ├── routes/            # TanStack Router 文件路由
│   │   │   │   ├── __root.tsx
│   │   │   │   ├── login.tsx
│   │   │   │   ├── register.tsx
│   │   │   │   └── _app/          # 需要认证的布局
│   │   │   │       ├── dashboard.tsx
│   │   │   │       ├── transactions.tsx
│   │   │   │       ├── accounts.tsx
│   │   │   │       ├── categories.tsx
│   │   │   │       ├── budgets.tsx
│   │   │   │       ├── reports.tsx
│   │   │   │       ├── recurring.tsx
│   │   │   │       ├── import.tsx
│   │   │   │       ├── settings.tsx
│   │   │   │       └── beancount-editor.tsx
│   │   │   ├── components/        # 通用组件
│   │   │   │   ├── ui/            # shadcn/ui 组件
│   │   │   │   ├── layout/        # 布局组件
│   │   │   │   ├── transaction/   # 交易相关组件
│   │   │   │   └── charts/        # 图表组件
│   │   │   ├── lib/
│   │   │   │   ├── trpc.ts        # tRPC 客户端
│   │   │   │   └── utils.ts
│   │   │   └── styles/
│   │   │       └── globals.css
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   │
│   └── core/                      # 共享包
│       ├── src/
│       │   ├── index.ts
│       │   ├── schemas/           # Zod schemas
│       │   │   ├── auth.ts
│       │   │   ├── ledger.ts
│       │   │   ├── transaction.ts
│       │   │   ├── account.ts
│       │   │   └── budget.ts
│       │   ├── beancount/         # Beancount parser/writer
│       │   │   ├── parser.ts
│       │   │   ├── writer.ts
│       │   │   ├── validator.ts
│       │   │   └── types.ts
│       │   ├── constants/         # 常量
│       │   │   ├── categories.ts  # 预设分类
│       │   │   └── enums.ts       # 枚举定义
│       │   └── types/             # TypeScript 类型
│       │       └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── docs/
│   ├── requirements.md
│   └── technical-design.md
│
├── package.json                   # workspace 根配置
├── bunfig.toml                    # Bun 配置
└── tsconfig.json                  # 根 TS 配置
```

---

## 4. 数据库 Schema 设计

### 4.1 ER 关系图

```
users 1──N ledger_members N──1 ledgers
                                  │
                    ┌──────────────┼──────────────┐
                    │              │              │
                accounts    transactions    categories
                              │       │
                          postings  attachments
                                      │
                                    tags (交易-标签多对多)
```

### 4.2 表结构定义

#### users（用户表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| username | varchar(50) | 用户名，唯一 |
| password_hash | varchar(255) | argon2 哈希后的密码 |
| display_name | varchar(100) | 显示名称 |
| avatar_url | varchar(500) | 头像URL（可选） |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

#### ledgers（账本表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| name | varchar(100) | 账本名称 |
| description | text | 描述（可选） |
| owner_id | uuid | FK → users.id，所有者 |
| file_path | varchar(500) | Beancount 文件相对路径 |
| version | integer | 乐观锁版本号 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

#### ledger_members（账本成员表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| ledger_id | uuid | FK → ledgers.id |
| user_id | uuid | FK → users.id |
| role | enum('owner','member') | 角色 |
| joined_at | timestamp | 加入时间 |

#### accounts（账户表 - 缓存）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| ledger_id | uuid | FK → ledgers.id |
| name | varchar(200) | 账户全名（如 Assets:Bank:CMB） |
| type | enum('assets','liabilities','income','expenses','equity') | 账户类型 |
| display_name | varchar(100) | 显示名称（如 招商银行） |
| currency | varchar(10) | 币种（固定 CNY） |
| is_closed | boolean | 是否已关闭 |
| opening_date | date | 开户日期 |
| created_at | timestamp | 创建时间 |

#### transactions（交易表 - 缓存）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| ledger_id | uuid | FK → ledgers.id |
| date | date | 交易日期 |
| type | enum('expense','income','transfer','reimbursement','borrow_in','borrow_out') | 交易类型 |
| payee | varchar(200) | 交易对方/商家 |
| narration | text | 摘要/备注 |
| created_by | uuid | FK → users.id，记录人 |
| category_id | uuid | FK → categories.id（可选） |
| amount | decimal(15,2) | 主金额（正数） |
| beancount_line | integer | 在 Beancount 文件中的行号 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

#### postings（分录表 - 缓存）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| transaction_id | uuid | FK → transactions.id |
| account_id | uuid | FK → accounts.id |
| amount | decimal(15,2) | 金额（有正负） |
| currency | varchar(10) | 币种 |

#### categories（分类表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| ledger_id | uuid | FK → ledgers.id |
| name | varchar(50) | 分类名称 |
| parent_id | uuid | FK → categories.id（一级为 null） |
| icon | varchar(50) | 图标标识 |
| sort_order | integer | 排序权重 |
| created_at | timestamp | 创建时间 |

#### transaction_tags（交易-标签关联表）

| 字段 | 类型 | 说明 |
|------|------|------|
| transaction_id | uuid | FK → transactions.id |
| tag | varchar(50) | 标签名 |

> 注：标签不单独建表，直接在关联表存储标签名文本，简化管理。

#### budgets（预算表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| ledger_id | uuid | FK → ledgers.id |
| category_id | uuid | FK → categories.id（null 表示总预算） |
| year_month | varchar(7) | 预算月份（如 2024-01） |
| amount | decimal(15,2) | 预算金额 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

#### recurring_transactions（周期性交易模板）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| ledger_id | uuid | FK → ledgers.id |
| name | varchar(100) | 模板名称 |
| type | enum('expense','income','transfer') | 交易类型 |
| amount | decimal(15,2) | 金额 |
| from_account_id | uuid | 来源账户 |
| to_account_id | uuid | 目标账户 |
| category_id | uuid | 分类 |
| narration | text | 摘要 |
| frequency | enum('daily','weekly','monthly','yearly') | 频率 |
| start_date | date | 开始日期 |
| end_date | date | 结束日期（可选） |
| total_count | integer | 总期数（可选） |
| executed_count | integer | 已执行次数 |
| next_execution | date | 下次执行日期 |
| auto_execute | boolean | 是否自动执行 |
| is_active | boolean | 是否启用 |
| created_at | timestamp | 创建时间 |

#### attachments（附件表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| transaction_id | uuid | FK → transactions.id |
| ledger_id | uuid | FK → ledgers.id |
| file_name | varchar(255) | 原始文件名 |
| file_path | varchar(500) | 存储相对路径 |
| file_size | integer | 文件大小（字节） |
| mime_type | varchar(100) | MIME 类型 |
| created_at | timestamp | 创建时间 |

---

## 5. Beancount 模块设计

### 5.1 Beancount 文件格式示例

```beancount
; Clover Book Ledger: 家庭账本
; Version: 3
; Last Modified: 2024-01-15T10:30:00Z

option "title" "家庭账本"
option "operating_currency" "CNY"

; === 账户定义 ===
2024-01-01 open Assets:Bank:CMB CNY            ; 招商银行
2024-01-01 open Assets:Cash CNY                ; 现金
2024-01-01 open Assets:Alipay CNY              ; 支付宝
2024-01-01 open Liabilities:CreditCard:CMB CNY ; 招商信用卡
2024-01-01 open Income:Salary CNY              ; 工资
2024-01-01 open Expenses:Food:Lunch CNY        ; 午餐

; === 交易记录 ===
2024-01-15 * "公司食堂" "午餐" #工作餐
  ; created_by: user-uuid-here
  ; category: 餐饮/午餐
  ; id: txn-uuid-here
  Expenses:Food:Lunch    35.00 CNY
  Assets:Alipay         -35.00 CNY

2024-01-15 * "公司" "1月工资"
  ; created_by: user-uuid-here
  ; category: 工资
  ; id: txn-uuid-here
  Assets:Bank:CMB      15000.00 CNY
  Income:Salary       -15000.00 CNY
```

### 5.2 元数据设计

在 Beancount 注释中存储系统元数据：
- `id`: 交易唯一ID（UUID），用于关联数据库缓存
- `created_by`: 创建者用户ID
- `category`: 分类路径
- `tags`: 通过 Beancount 原生 `#tag` 语法

文件头部注释存储：
- `Version`: 乐观锁版本号
- `Last Modified`: 最后修改时间

### 5.3 Parser 模块

```typescript
// packages/core/src/beancount/types.ts

interface BeancountFile {
  options: Record<string, string>;
  accounts: AccountDirective[];
  transactions: TransactionDirective[];
  version: number;
}

interface AccountDirective {
  date: string;           // YYYY-MM-DD
  action: 'open' | 'close';
  account: string;        // 如 Assets:Bank:CMB
  currencies?: string[];
  comment?: string;       // 显示名称
}

interface TransactionDirective {
  date: string;
  flag: '*' | '!';        // * 已确认, ! 待确认
  payee?: string;
  narration: string;
  tags: string[];
  meta: Record<string, string>;  // id, created_by, category
  postings: Posting[];
}

interface Posting {
  account: string;
  amount: number;
  currency: string;
}
```

**Parser 职责**：
- 逐行解析 Beancount 文件
- 提取账户指令、交易指令
- 解析元数据注释
- 输出结构化的 `BeancountFile` 对象

### 5.4 Writer 模块

**Writer 职责**：
- 将结构化数据序列化为标准 Beancount 格式
- 支持追加模式（新增交易追加到文件末尾）
- 支持全量重写模式（修改/删除后重新生成整个文件）
- 保持格式美观，对齐金额列

**操作模式**：
- `appendTransaction(filePath, transaction)` - 追加交易
- `removeTransaction(filePath, transactionId)` - 删除交易（重写文件）
- `updateTransaction(filePath, transactionId, newData)` - 更新交易（重写文件）
- `addAccount(filePath, account)` - 追加账户
- `rewriteFile(filePath, beancountFile)` - 全量重写

### 5.5 Validator 模块

**校验内容**：
- 语法格式正确性（日期、金额、账户名格式）
- 交易平衡检查（借贷平衡）
- 账户是否已开启
- 日期合理性（不能早于账户开启日期）

### 5.6 Syncer 模块

**全量同步**：
```
解析 Beancount 文件 → 清空缓存表 → 批量写入 accounts/transactions/postings → 更新版本号
```

**增量同步**（写操作后）：
```
写入成功 → 仅更新/插入相关记录到缓存表
```

---

## 6. 并发控制策略

### 6.1 文件级写锁

```typescript
// 使用 proper-lockfile 实现文件锁
import lockfile from 'proper-lockfile';

async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>
): Promise<T> {
  const release = await lockfile.lock(filePath, {
    retries: { retries: 5, factor: 2, minTimeout: 100, maxTimeout: 2000 },
    stale: 30000, // 30秒后自动释放（防死锁）
  });
  try {
    return await fn();
  } finally {
    await release();
  }
}
```

### 6.2 乐观并发控制

1. 客户端请求修改时携带 `version` 号
2. 服务端检查当前文件版本是否匹配
3. 匹配则执行写入并递增版本号
4. 不匹配则返回冲突错误，客户端需要重新加载数据

### 6.3 并发场景处理

| 场景 | 处理方式 |
|------|----------|
| 两人同时新增交易 | 文件锁串行化，两个都会成功 |
| 两人同时修改同一交易 | 乐观锁检测冲突，后者需重新加载 |
| 读取时正在写入 | 读走缓存不受影响 |
| 源文件编辑器修改 | 保存时全量重建缓存 |

---

## 7. 认证与鉴权

### 7.1 认证流程

```
注册：username + password → argon2 hash → 存储到 users 表

登录：username + password → 验证 hash → 签发 JWT
    ├── access_token  (有效期: 15分钟)
    └── refresh_token (有效期: 7天, httpOnly cookie)

刷新：refresh_token → 验证有效性 → 签发新 access_token
```

### 7.2 Token 设计

```typescript
// Access Token Payload
interface AccessTokenPayload {
  sub: string;       // user id
  username: string;
  iat: number;
  exp: number;       // 15分钟
}

// Refresh Token Payload
interface RefreshTokenPayload {
  sub: string;       // user id
  iat: number;
  exp: number;       // 7天
}
```

### 7.3 tRPC 鉴权中间件

```typescript
// 公开路由：auth.login, auth.register, auth.refresh
// 受保护路由：其他所有路由

const isAuthenticated = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { user: ctx.user } });
});

const protectedProcedure = t.procedure.use(isAuthenticated);
```

### 7.4 账本权限校验

```typescript
// 检查用户是否有权访问某账本
const hasLedgerAccess = t.middleware(async ({ ctx, input, next }) => {
  const member = await db.query.ledgerMembers.findFirst({
    where: and(
      eq(ledgerMembers.ledgerId, input.ledgerId),
      eq(ledgerMembers.userId, ctx.user.id)
    ),
  });
  if (!member) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx: { ...ctx, member } });
});
```

---

## 8. 前端架构

### 8.1 路由设计

```
/login                    # 登录
/register                 # 注册
/app                      # 认证后布局（含侧边栏/底部导航）
  /app/dashboard          # 仪表盘
  /app/transactions       # 交易列表
  /app/transactions/new   # 新增交易
  /app/accounts           # 账户管理
  /app/categories         # 分类管理
  /app/budgets            # 预算管理
  /app/reports            # 统计报表
  /app/recurring          # 周期性交易
  /app/import             # 数据导入
  /app/settings           # 账本设置
  /app/beancount          # Beancount 编辑器
  /app/profile            # 个人设置
```

### 8.2 状态管理策略

| 数据类型 | 管理方式 | 说明 |
|----------|----------|------|
| 服务端数据 | TanStack Query + tRPC | 交易、账户、分类等 |
| 全局UI状态 | React Context | 当前账本、主题、侧边栏状态 |
| 表单状态 | React Hook Form | 表单内局部状态 |
| URL状态 | TanStack Router | 筛选条件、分页参数 |

### 8.3 tRPC 客户端配置

```typescript
// packages/web/src/lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@clover-book/server/src/trpc/router';

export const trpc = createTRPCReact<AppRouter>();
```

### 8.4 响应式布局设计

```
桌面端 (>1024px):
┌────────────────────────────────────────┐
│ Header (logo, 当前账本, 用户头像)       │
├──────┬─────────────────────────────────┤
│ Side │           Content               │
│ bar  │                                 │
│      │                                 │
│      │                                 │
└──────┴─────────────────────────────────┘

移动端 (<768px):
┌────────────────────────────────────────┐
│ Header (hamburger, 标题, 头像)          │
├────────────────────────────────────────┤
│                                        │
│              Content                   │
│                                        │
│                                        │
├────────────────────────────────────────┤
│ BottomNav (首页/记账/报表/我的)         │
└────────────────────────────────────────┘
```

### 8.5 关键页面组件结构

**仪表盘 (Dashboard)**:
- 当月收支概览卡片
- 预算进度条（总预算 + Top 3 分类预算）
- 最近 5 笔交易
- 快速记账按钮

**交易列表 (Transactions)**:
- 顶部筛选栏（日期范围、分类、标签、成员）
- 交易列表（虚拟滚动）
- 每条交易：日期、分类图标、摘要、金额
- 底部悬浮"记一笔"按钮

---

## 9. 数据导入模块设计

### 9.1 通用 CSV 模板

**标准字段**：

| 字段名 | 必填 | 说明 |
|--------|------|------|
| date | 是 | 日期，格式 YYYY-MM-DD |
| type | 是 | 类型：expense/income/transfer |
| amount | 是 | 金额（正数） |
| category_l1 | 否 | 一级分类 |
| category_l2 | 否 | 二级分类 |
| account_from | 否 | 来源账户 |
| account_to | 否 | 目标账户 |
| payee | 否 | 商家/交易对方 |
| narration | 否 | 备注 |
| tags | 否 | 标签（逗号分隔） |

### 9.2 适配器接口

```typescript
interface ImportAdapter {
  /** 适配器标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 支持的文件格式 */
  supportedFormats: string[];  // ['csv', 'xls', 'xlsx']
  /** 解析文件为标准格式 */
  parse(fileContent: Buffer, fileName: string): Promise<ImportRecord[]>;
  /** 获取分类映射建议 */
  suggestCategoryMapping(records: ImportRecord[]): CategoryMapping[];
}

interface ImportRecord {
  date: string;
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  categoryL1?: string;
  categoryL2?: string;
  accountFrom?: string;
  accountTo?: string;
  payee?: string;
  narration?: string;
  tags?: string[];
}

interface CategoryMapping {
  source: string;      // 源系统分类名
  targetId?: string;   // 映射到的系统分类ID
  confidence: number;  // 映射置信度 0-1
}
```

### 9.3 导入流程

```
上传文件 → 选择适配器 → 解析预览 → 分类映射调整 → 确认导入 → 写入 Beancount → 同步缓存
```

### 9.4 随手记适配器

随手记导出 CSV 典型字段：
- 日期、类型（支出/收入）、金额、分类、子分类、账户、备注、商家

适配器负责：
- 解析随手记的 CSV 格式（处理编码、日期格式差异）
- 将随手记分类映射到系统预设分类
- 处理转账类型的识别

---

## 10. 部署与运维

### 10.1 Docker 构建

```dockerfile
# docker/Dockerfile
# 阶段1：构建
FROM oven/bun:1 AS builder
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun run build    # 构建前端 + 后端

# 阶段2：运行
FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/packages/server/dist ./server
COPY --from=builder /app/packages/web/dist ./web
EXPOSE 3000
CMD ["bun", "run", "./server/index.js"]
```

### 10.2 Docker Compose

```yaml
# docker/docker-compose.yml
version: '3.8'
services:
  clover-book:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ${DATA_DIR:-./clover-data}:/data
    environment:
      - DATABASE_URL=postgresql://clover:${DB_PASSWORD}@postgres:5432/cloverbook
      - DATA_DIR=/data
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=clover
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=cloverbook
    volumes:
      - ${DATA_DIR:-./clover-data}/pg:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U clover"]
      interval: 5s
      timeout: 3s
      retries: 5
```

### 10.3 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| DATABASE_URL | 是 | - | PostgreSQL 连接字符串 |
| DATA_DIR | 是 | /data | 持久化数据根目录 |
| JWT_SECRET | 是 | - | JWT 签名密钥 |
| PORT | 否 | 3000 | 服务端口 |

### 10.4 持久化目录

```
${DATA_DIR}/
├── ledgers/             # Beancount 文件（真相源）
│   ├── <ledger-uuid>/
│   │   └── main.beancount
│   └── .../
├── attachments/         # 附件文件
│   └── <ledger-uuid>/
│       └── <year>/<month>/
│           └── <hash>.<ext>
└── pg/                  # PostgreSQL 数据文件
```

### 10.5 备份与恢复

**备份**：
```bash
# 方式1：直接复制整个数据目录
cp -r ./clover-data ./clover-data-backup-$(date +%Y%m%d)

# 方式2：仅备份 Beancount 文件（数据库可重建）
cp -r ./clover-data/ledgers ./ledgers-backup
cp -r ./clover-data/attachments ./attachments-backup
```

**恢复**：
```bash
# 将备份目录放回，启动 Docker 即可
# 如果数据库损坏，启动后触发缓存重建即可恢复
```

### 10.6 生产环境后端服务架构

生产部署时，后端同时承担 API 服务和静态文件服务：
- `/api/trpc/*` → tRPC API 路由
- `/uploads/*` → 附件文件静态服务
- `/*` → 前端 SPA 静态文件（Vite 构建产物）

这样只需要暴露一个端口（3000），简化部署和反向代理配置。
