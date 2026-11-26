<div align="center">

<img src="./icon.svg" width="60" height="60" alt="Mail Assistant 图标" />

# Mail Assistant 邮箱助理（`@local/dsh-exchange`）

**面向 DeepSeek Harness `0.2.0-rc.1` 的隐私优先、仅保存草稿的企业自建 Microsoft Exchange（EWS + NTLM）邮箱插件**

[English](./README.md) | **简体中文**

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek_Harness-0.2.0--rc.1-2563eb?style=flat-square)](#环境要求)
[![Node.js](https://img.shields.io/badge/Node.js-%5E22.19_%7C%7C_%3E%3D24-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Exchange](https://img.shields.io/badge/Exchange-EWS_%2B_NTLM-0078d4?style=flat-square)](#环境要求)

[![安全保障](https://img.shields.io/badge/%E5%AE%89%E5%85%A8%E4%BF%9D%E9%9A%9C-%E4%BB%85%E8%8D%89%E7%A8%BF%E4%B8%8D%E5%8F%91%E9%80%81-16a34a?style=flat-square)](#安全与隐私保障)
[![删除保护](https://img.shields.io/badge/%E5%88%A0%E9%99%A4%E4%BF%9D%E6%8A%A4-%E7%A6%81%E6%AD%A2%E6%B0%B8%E4%B9%85%E5%88%A0%E9%99%A4-d97706?style=flat-square)](#安全与隐私保障)
[![隐私隔离](https://img.shields.io/badge/%E9%9A%90%E7%A7%81%E9%9A%94%E7%A6%BB-%E7%9B%AE%E5%BD%95%E7%99%BD%E9%BB%91%E5%90%8D%E5%8D%95_%C2%B7_0600-4f46e5?style=flat-square)](#安全与隐私保障)
[![按需触发](https://img.shields.io/badge/%E6%8C%89%E9%9C%80%E8%A7%A6%E5%8F%91-%40mail_%E4%BC%9A%E8%AF%9D%E9%9A%94%E7%A6%BB-7c3aed?style=flat-square)](#日常使用示例)
[![内置工具](https://img.shields.io/badge/%E5%86%85%E7%BD%AE%E5%B7%A5%E5%85%B7-15_%E4%B8%AA_EWS_%E8%83%BD%E5%8A%9B-0ea5e9?style=flat-square)](#工具能力速查表15-个工具)

</div>

---

专为企业日常邮件处理及认证项目管理工作流（如 Widevine、AirPlay2、DTS、Dolby 等）打造：提供目录级隐私权限隔离、邮件精准检索与正文阅读、往来会话线程重建、启发式 Jira 工单与待办事项提取、项目排期进展汇总、可视化 **Agent 操作历史记录**，以及通过 `@mail` 按需触发的 **仅草稿箱起草** 能力。

---

## 核心特性

- **左上角全局快捷入口**：在 DeepSeek Harness 左上角全局面板区（`插件`、`自动化任务` 与 `更多` 之间）提供一键直达的 **Mail Assistant** 入口，并支持在设置页、插件详情页或主页面内随时一键隐藏或恢复。
- **Agent 操作历史面板**：在页面内直接查看 Agent 最近读了哪些邮件（主题、发件人、所在目录）、写了或改了哪些草稿（草稿主题、收件人、字数）、发起过哪些搜索与分析、以及被拦截的敏感访问（`PERM_001`），支持统计概览、分类筛选、关键词搜索与二次确认清空。
- **架构级防误发与防永久删除**：代码与工具层面均不存在发送邮件能力，所有撰写/回复仅保存至 Exchange 草稿箱，由人工在 Outlook/OWA 复核后发送；删除邮件严格禁止永久删除。
- **目录级白/黑名单与一键紧急锁定**：文件夹权限策略修改后即时生效无需重启，页面顶部常驻 **紧急访问锁定** 开关，随时一键切断 Agent 的全部邮箱访问权限。

---

## 安全与隐私保障

- **仅草稿箱（架构级防误发）**：插件未注册任何 `exchange_send_email` 工具，源码中不存在任何 EWS `Send` / `SendAndSaveCopy` 调用路径，所有草稿仅保存至 Exchange「草稿箱」，需由用户在 Outlook/OWA 人工确认后发送。
- **禁止永久删除**：调用 `exchange_delete_email` 并传入 `permanent: true` 时，会在发起任何 EWS 请求前无条件拒绝并返回 `PERM_001`；支持的删除操作仅移至「已删除项目」，保留可恢复性。
- **`@mail` 会话按需激活**：全部 15 个 `exchange_*` 工具与邮箱系统提示词默认对模型完全隐藏，仅在用户输入独立的 `@mail` 触发词后（严格词边界校验，自动忽略 `@mail2`、`user@mail.company.com` 以及助手/工具消息）才在当前会话激活。
- **文件夹级权限隔离**：支持 **白名单**（严格精确匹配目录路径，绝不隐式继承子目录）与 **黑名单**（禁用目录及其全部子目录），搭配顶部常驻 **紧急访问锁定**。每次工具调用均实时读取磁盘 `state.json`（`0600` 原子写入），策略变更立即生效、无需重启 DSH。
- **凭据严格隔离**：Exchange 密码仅存储于 DSH 宿主凭据服务（`ctx.credentials` → `$DSH_HOME/.credentials.yaml`，权限 `0600`）或通过环境变量 `DSH_EXCHANGE_PASSWORD` 注入，绝不落盘至 `state.json`、配置文件、日志或 HTTP 接口响应。
- **强制 HTTPS**：保存配置与建立 EWS 连接两处均严格拦截明文 `http://` 地址（返回 `NET_001`）。
- **双层本地审计与操作历史（`0600` 仅存本机）**：
  - **底层脱敏审计日志（`$DSH_HOME/dsh-exchange/audit.jsonl`，仅追加，`0600`）**：严格遵循元数据白名单，仅记录 `ts`、`action`、`folder`、`emailId`、`outcome`、`code`、`count`、`elapsedMs`——绝不记录邮件主题、正文或密码，且不受前端清空历史操作影响。
  - **Agent 操作历史（`$DSH_HOME/dsh-exchange/activity.jsonl`，滚动保留最新 500 条，`0600`）**：用于页面可视化展示 Agent 看过的邮件主题/发件人、起草的草稿主题/收件人/字数、搜索词、Jira 工单号及附件名等安全摘要，同样**绝不保存密码、邮件正文（`body_text`/`body_html`）或附件二进制内容（`content_base64`）**；被权限拦截（`PERM_001`）的读邮件请求绝不记录受限邮件的主题或发件人。
- **附件大小上限与路径安全**：附件下载严格限制在 **25 MiB**（`26,214,400` 字节）以内，下载前与落盘前双重校验（超限返回 `ATT_001`），并对文件名进行安全清洗防止路径穿越。

---

## 环境要求

- **DeepSeek Harness (DSH)**：`0.2.0-rc.1`
- **Node.js**：`^22.19.0 || >=24`
- **Exchange 服务器**：企业自建 Microsoft Exchange Server，开启 HTTPS EWS 与 NTLM 认证（已实测通过 Exchange Server SE 15.2.2562.49；EWS 协议协商版本为 Exchange 2013，兼容 2013/2016/2019/SE）。不包含 Microsoft 365 / OAuth2。

---

## 安装方式

设置和操作历史页面需要 Web profile。下面以 DSH 自带的 `web` profile 为例。通过 CLI 安装时，`pnpm` 需要在 `PATH` 上。

在本地插件仓库切换到 `0.2.0-rc1` 分支，并按锁文件安装依赖。

```bash
git switch 0.2.0-rc1
npm ci
```

### 方式一　打包后安装

```bash
npm pack
dsh plugin --profile web add ./local-dsh-exchange-1.4.0.tgz
```

### 方式二　链接本地源码目录

```bash
dsh plugin --profile web add "$(pwd)"
```

你也可以直接在 DSH Web 端点击 **插件 → 添加插件**，选择本地源码目录或 `.tgz` 插件包完成安装。

### 验证插件装配

```bash
dsh --profile web --dump-config
```

在输出中应能看到 `# == @local/dsh-exchange` 配置层及其默认的限流与触发词参数。

---

## 配置指南与操作历史页面

你可以通过以下任意一种方式打开 **Mail Assistant 邮箱助理** 页面：
- 左上角全局面板直接点击 **Mail Assistant** 快捷入口（位于 `插件` / `自动化任务` 下方）
- 左下角 **更多 → 设置 → Mail Assistant**
- 左上角 **插件 → 已安装插件 → Mail Assistant 邮箱助理**

### 1.「配置与权限」标签页

1. **顶部紧急访问锁定栏（跨标签页常驻）**：点击 **立即紧急锁定** 后立即阻断 Agent 所有邮箱工具调用（返回 `PERM_001`），随时可解除。
2. **Exchange 连接配置**：填写 HTTPS **EWS 地址**（如 `https://exchange.company.com/EWS/Exchange.asmx`）、**邮箱地址**、**域**（使用邮箱登录时可留空）、**用户名** 与 **密码**（也可通过环境变量 `DSH_EXCHANGE_PASSWORD` 提供）。
3. **连接并加载文件夹**：验证连通性并拉取完整的 Exchange 邮件文件夹目录树。
4. **文件夹权限控制**：切换 **白名单** 或 **黑名单** 模式并勾选目标文件夹（勾选父目录时界面会自动级联勾选子目录，保证保存的目录路径明确透明）。
5. **快捷入口开关**：随时开启或隐藏左上角全局面板中的 **Mail Assistant** 快捷入口，跨设置/插件/主页面实时同步。
6. **保存**：配置原子写入（`0600`），下一次 Agent 工具调用即刻生效。

### 2.「Agent 操作历史」标签页

切换到 **Agent 操作历史** 标签页即可随时回溯 Agent 对邮箱执行的每一步操作：

- **概览指标卡**：一目了然展示总操作数、阅读邮件次数、草稿操作次数及拦截/失败次数。
- **分类筛选与搜索**：支持按 `全部`、`阅读邮件`、`草稿箱`、`搜索浏览`、`智能分析`、`整理操作`、`拦截 / 失败` 一键过滤，并支持按主题、发件人、文件夹、项目名或工单号搜索。
- **平滑兼容旧版审计记录**：升级后自动合并展示历史 `audit.jsonl` 中的既有记录（标注 `基础审计`），新产生的操作展示完整可读摘要。
- **二次确认清空历史**：点击 **清空历史** 仅通过 `clearedAt` 水位线隐藏界面展示记录，底层 `audit.jsonl` 安全审计日志保持完好无损。

### 3. 运行时上限配置（`~/.dsh/profiles/<profile>/cordis.patch.yml`）

```yaml
- insert:
    - id: dsh-exchange
      name: '@local/dsh-exchange'
      config:
        limits:
          max_search_results: 100
          max_attachment_mb: 25
          max_body_chars: 20000
          request_timeout_seconds: 30
        trigger:
          explicit_prefix: '@mail'
```

---

## 日常使用示例

在任意 DSH 对话框中输入 `@mail`（或从 `@` 快捷菜单选择 `mail`）：

- `@mail 看下最近 Widevine 的邮件，support 三天没回，帮我起草一封温柔客气的提醒草稿`
- `@mail 看下最近 AirPlay2 周期情况的邮件，汇总当前项目的计划排期`
- `@mail 看下最近 Jira 有没有什么和我相关的工单通知`
- `@mail 汇总最近 7 天的邮件，列出我的待办事项`

同一会话的后续追问会自动保持 `exchange_*` 工具可用；未输入 `@mail` 的其他会话完全隔离，不会暴露任何邮箱工具。

---

## 工具能力速查表（15 个工具）

| 工具名称 | 优先级 | 功能说明 |
| --- | --- | --- |
| `exchange_list_folders` | P0 | 列出邮箱文件夹目录树（仅返回 `path`、`name`、`readable`，不暴露内部 ID 或未读数） |
| `exchange_search_emails` | P0 | 在单个有权限的文件夹内搜索邮件（发起 EWS 请求前先做权限校验） |
| `exchange_read_email` | P0 | 读取邮件完整正文（纯文本/HTML）、头部与附件元信息（读取前实时复核所属目录权限） |
| `exchange_list_recent_emails` | P0 | 跨所有可读文件夹聚合近期邮件并按时间倒序合并（支持 1–90 天） |
| `exchange_save_draft` | P0 | 保存新草稿至 Exchange 草稿箱（支持 `in_reply_to` 关联原线程，绝不发送） |
| `exchange_update_draft` | P0 | 按字段局部更新已有草稿 |
| `exchange_delete_draft` | P0 | 删除已有草稿（移至「已删除项目」） |
| `exchange_get_thread` | P1 | 按时间与 `References` 重建完整邮件会话线程（若线程中任一邮件处于受限目录则整体拒绝） |
| `exchange_parse_jira_notifications` | P1 | 启发式提取近期 Jira 通知邮件中的工单号、状态流转、负责人、优先级与最新评论 |
| `exchange_extract_todos` | P1 | 启发式提取待办事项、截止日期、回复诉求及原文上下文 `context` |
| `exchange_summarize_project` | P1 | 汇总认证项目时间线、阻塞问题与下一步行动，每条结论均关联可追溯的 `source_email_id` |
| `exchange_download_attachment` | P1 | 下载 ≤ 25 MiB 附件并清洗文件名（≤ 1 MiB 时同时返回 `content_base64`） |
| `exchange_move_email` | P1 | 在两个均有权限的文件夹之间移动邮件 |
| `exchange_mark_email` | P1 | 标记邮件为已读/未读，或添加/取消星标 |
| `exchange_delete_email` | P1 | 将邮件移至「已删除项目」（传入 `permanent: true` 永远拒绝并返回 `PERM_001`） |

---

## 错误码说明

| 错误码 | 含义 | 重试策略 |
| --- | --- | --- |
| `AUTH_001` | 凭据无效、密码过期或账号被锁定 | 不重试 |
| `EMAIL_001` | 邮件、附件或文件夹不存在 | 不重试 |
| `PERM_001` | 文件夹无权限、已开启紧急锁定、路径存在歧义或尝试永久删除 | 不重试 |
| `NET_001` | 非 HTTPS 地址、DNS 解析失败、TLS 证书校验失败、连接异常或超时 | 不重试 |
| `RATE_001` | Exchange 服务器繁忙或触发限流（`429` / `503` / `ErrorServerBusy`） | 指数退避重试 3 次（`1s` / `2s` / `4s`） |
| `ATT_001` | 附件体积超过 25 MiB 上限 | 不重试 |

---

## 本地开发与测试

```bash
# 安装依赖
npm ci

# 运行完整单元测试（node --test）
npm test

# 运行本地 HTTPS + NTLM + gzip + SOAP 协议级集成测试
npm run test:integration
```

如需运行可选的真实企业 Exchange 服务器联调测试：

```bash
DSH_EXCHANGE_TEST_URL="https://exchange.company.com/EWS/Exchange.asmx" \
DSH_EXCHANGE_TEST_EMAIL="user@company.com" \
DSH_EXCHANGE_TEST_DOMAIN="COMPANY" \
DSH_EXCHANGE_TEST_USERNAME="user123" \
DSH_EXCHANGE_PASSWORD="your-password" \
npm run test:integration
```
