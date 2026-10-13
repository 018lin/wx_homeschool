# 家校共育系统（微信小程序 + 后端）

微信小程序端 + Node 后端。后端连接 Neon PostgreSQL，提供账号、班级、任务、提交、点评、AI 分析等接口。

## 目录

| 路径 | 说明 |
| --- | --- |
| `server.js` / `database.js` | 后端服务与数据模型 |
| `miniprogram/` | 微信小程序 |
| `test/` | 后端接口测试（`npm test`，使用临时 SQLite 库） |
| `scripts/` | 结构检查、SQLite→Neon 迁移脚本 |
| `render.yaml` | Render 部署配置（Blueprint） |

## 本地启动

```bash
npm install
npm start          # 默认 http://localhost:3123
```

Windows 也可以直接双击 `start-backend.bat`。

数据库连接写在 `.env.local`（**不入库**）：

```
DATABASE_URL=postgresql://...
ZHIPU_API_KEY=...
DEEPSEEK_API_KEY=...
```

小程序本地联调：

1. 启动本机后端
2. `miniprogram/utils/api.js` 中 `AUTO_LOCAL_IN_DEV` 保持 `true`
3. 微信开发者工具 → 详情 → 本地设置 → 勾选「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」

小程序会自动按环境切换地址：开发版 / 体验版 → `http://localhost:3123`，正式版 → `REMOTE_BASE`（线上域名）。

## 部署到 Render

1. Render → New → Blueprint，选择本仓库（读取 `render.yaml`）
2. 在服务页手动填入环境变量：
   - `DATABASE_URL`（Neon 连接串）
   - `ZHIPU_API_KEY`
   - `DEEPSEEK_API_KEY`
3. 部署完成后，把服务域名填到 `miniprogram/utils/api.js` 的 `REMOTE_BASE`
4. 微信小程序后台 → 开发管理 → 服务器域名 → request 合法域名，加上该 HTTPS 域名

## 注意事项

- **不要用 Render 免费实例的域名做长期正式环境**：冷启动约 15 秒，会休眠。
- 数据库变更要同时考虑 SQLite（测试）与 PostgreSQL（生产）：现有 Postgres 库不会因为 `CREATE TABLE IF NOT EXISTS` 自动补列，新增字段必须显式 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`。
- 新增自增表务必加入 `database.js` 的 `SERIAL_TABLES`，否则 Postgres 下取不到自增 id。

## 测试账号

- 管理员：`admin` / `018admin`
- 教师：`018` / `018018`
