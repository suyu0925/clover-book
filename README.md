# Clover Book

家庭记账本 —— 以 Beancount 为唯一真相源的多人协作记账应用。

## 特性

- 多用户协作，支持账本分享
- Beancount 文件作为会计数据唯一真相源
- PostgreSQL 缓存加速查询
- 响应式 Web 界面，适配手机/平板/桌面
- Docker 一键部署，单目录持久化

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vite + React 19 + TailwindCSS 4 + tRPC Client |
| 后端 | Bun + Hono + tRPC v11 + Drizzle ORM |
| 数据库 | PostgreSQL 16（查询缓存） |
| 核心 | Beancount（纯 TS 实现 parser/writer） |
| 部署 | Docker + docker-compose |

## 项目结构

```
clover-book/
├── packages/
│   ├── core/       # 共享：Beancount parser/writer、Zod schemas、枚举常量
│   ├── server/     # 后端服务
│   └── web/        # 前端应用
├── docker/         # Docker 配置
└── docs/           # 需求文档、技术方案
```

## 快速开始

```bash
# 安装依赖
bun install

# 启动后端（需要 PostgreSQL）
bun run dev:server

# 启动前端
bun run dev:web
```

## 文档

- [需求文档](docs/requirements.md)
- [技术方案](docs/technical-design.md)

## License

MIT
