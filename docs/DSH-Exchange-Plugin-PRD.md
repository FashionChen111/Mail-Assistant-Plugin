# Mail Assistant — DSH Harness 企业邮箱插件 PRD

## Product Requirements Document

**插件名称**：Mail Assistant（npm 包名 `@local/dsh-exchange`，工具前缀 `exchange_`，触发词 `@mail`）  
**版本**：v1.1.0  
**目标内核版本**：DSH 0.2.2-rc.3（已对照该 tag 的工具编写、输入触发器、打包三份文档，见 11.1；`settings.section`、`ctx.credentials` 等其余接口待在该版本上联调确认）  
**运行时要求**：Node `^22.19.0 || >=24`（与 DSH 宿主一致）  
**邮箱系统**：自建 Microsoft Exchange Server Subscription Edition (构建号 15.2.2562.49)  
**文档日期**：2026-11-23（v1.1.0 修订于 2026-11-24）  
**负责人**：[待定]

---

## v1.1.0 修订说明

v1.0.0 按「Python SDK 由 DSH 直接 import」设计。核对 DSH 的插件契约后，该设想不成立：DSH 插件是 Node/cordis 组合包（`apply(ctx)` + `cordis.patch.yml`），没有 import Python 的集成点；从插件触达外部 Python 进程的唯一官方路径是 MCP over stdio，而不是直连。

v1.1.0 保留 v1.0.0 的全部**产品需求**（场景、工具语义、权限模型、安全边界、性能与验收），把**技术实现**改为与运行时一致：

| 项目 | v1.0.0（不成立） | v1.1.0（本机已核实） |
| --- | --- | --- |
| 交付形态 | Python SDK `dsh_exchange` | Node 组合包 `@local/dsh-exchange` |
| Agent 调用方式 | `from dsh_exchange import search_emails` | 模型调用 `exchange_*` 工具（`defineTool` 注册） |
| 工具命名 | `dsh_exchange.search_emails` | `exchange_search_emails` |
| Exchange 客户端 | `exchangelib` 5.4.0（Python） | `ews-javascript-api` 0.15.3（Node） |
| NTLM | `exchangelib` 内置 | `@ewsjs/xhr` + `@ewsjs/ntlm-client`（须 `gzip: true`） |
| 语言/运行时 | Python 3.9+ | Node `^22.19.0 \|\| >=24` |
| 数据模型 | Pydantic `BaseModel` | 纯 JS 对象（工具 output schema 校验） |
| 凭证存储 | 自管 AES-256-GCM + `config.json` | 宿主 `ctx.credentials`（私有文件，权限 600） |
| 配置位置 | `~/.dsh/plugins/exchange/config.json` | profile patch 层 `config` + `state.json` |
| 设置界面 | 独立弹窗描述 | `settings.section` 自带页 + 3 条本地 HTTP 路由 |
| 触发方式 | 解析 `@mail assistant` + 关键词 | `inputTriggers` 注册 `@mail` 候选 |
| 测试工具 | pytest / pytest-benchmark | `node --test` |
| OAuth2 | 「待确认」，列为阶段 3 交付 | 移出本期（服务器已开 OAuth 标志，但未验证接入条件） |

**v1.1.0 后续勘误**：统一文件夹以路径标识（`path/name/readable`，无 ID 与未读数）；明确待办/Jira/项目汇总均为启发式候选；兼容性表区分已实测与理论兼容；状态文件 `version` 升为 `1.1.0`；明确近期邮件视角仅遍历可读文件夹；补充单账号与不支持 Microsoft 365 的非目标。

**未变的部分**：只有草稿没有发送、不永久删除、文件夹级权限、25MB 附件上限、错误码体系、日志脱敏。这些是产品约束，与实现语言无关。

---

## 公司邮箱系统现状

### 已验证信息

- **Exchange 版本**：Exchange Server Subscription Edition RTM Sep26SU（X-OWA-Version: 15.2.2562.49，观察于 2026-11-12）
- **接入方式**：HTTPS EWS (Exchange Web Services)
- **认证方式**：
  - ✅ **已验证并可交付**：NTLM 认证（使用邮箱地址作为登录名）
  - ⏸ **未验证，移出本期**：OAuth2 和 SSO。服务器响应包含 Negotiate、NTLM 和 OAuth 标志，但 Azure AD 应用注册、租户策略与回调流程都未验证；本期只交付 NTLM
- **已验证功能**：
  - ✅ 列出邮箱文件夹
  - ✅ 查询指定文件夹
  - ✅ 读取邮件主题、发件人、接收时间、正文、已读状态
  - ✅ 服务器端收件规则（按发件人/收件人匹配，移至指定文件夹，支持停止后续规则）
- **客户端兼容性**：✅ Outlook 已确认可连接

### 技术验证日期

- EWS + NTLM 验证：已完成
- 服务器端规则核实：2026-11-22
- 版本号观察：2026-11-12

---

## 一、产品概述

### 1.1 产品定位

DSH Harness 企业邮箱插件是面向**认证项目管理**场景的智能邮件助理，使 AI Agent 能够自动感知邮箱上下文，无需用户手动提供邮件文件，从而实现：

- **认证项目追踪**：自动汇总 Widevine、AirPlay2 等认证项目的周期邮件和进度
- **待办事项提取**：从邮件中识别 deadline、待回复事项、action item
- **Jira 通知关联**：解析 Jira 邮件通知，提取工单状态变更和评论
- **智能草稿生成**：起草温柔客气的催促邮件、项目汇报邮件（需人工审核后发送）

### 1.2 核心价值

| 角色         | 痛点                               | 价值                                   |
| ---------- | -------------------------------- | ------------------------------------ |
| **认证项目经理** | Widevine support 几天没回复，需要手动写催促邮件 | Agent 自动起草温柔客气的提醒邮件，保存为草稿            |
| **项目追踪**   | AirPlay2 周期邮件散落各处，难以汇总排期         | Agent 自动按项目分组邮件，提取计划排期               |
| **工单管理**   | Jira 邮件通知太多，不知道哪些工单有更新           | Agent 解析 Jira 通知，列出相关工单的最新动态         |
| **待办梳理**   | 每天邮件太多，不知道有什么待办事项                | Agent 自动提取待回复邮件、deadline、action item |

### 1.3 非目标（Anti-Goals）

- ❌ **不支持直接发送邮件**：Agent 只能保存草稿，发送必须由用户在邮箱客户端完成
- ❌ **不做完整邮箱客户端**：不实现日历、联系人、任务等非邮件功能
- ❌ **不支持多租户 SaaS 模式**：仅支持企业内部自建 Exchange
- ❌ **不做邮件客户端 UI**：不替代 Outlook，只提供 Agent 能力
- ❌ **不提供通用 EWS 调用入口**：只有 7.1 列出的 15 个工具，模型无法自行拼装 EWS 请求
- ❌ **不永久删除邮件**：只支持移到「已删除项目」，保留可恢复性
- ❌ **不支持多邮箱账号**：每个 profile 只配置一个 Exchange 账号
- ❌ **不支持 Microsoft 365 / Online**：其接入依赖 OAuth2，本期不做

### 1.4 目标用户画像

**典型用户**：认证项目管理人员

- 管理多个认证项目（Widevine、AirPlay2、DTS、杜比等）
- 需要追踪 support 回复进度、项目周期邮件
- 每天收到大量 Jira 通知邮件
- 需要快速识别待办事项和 deadline

### 1.5 插件调用机制

**设计目标**：按需加载，避免 Agent 在不需要时频繁查询邮箱。

**触发方式**：

1. **显式触发**（推荐）：
   ```
   用户："@mail 看下最近 Widevine 的邮件"
   DSH Harness：由 inputTriggers 的 @mail 候选项路由到邮箱插件
   Agent：调用 exchange_search_emails(folder="收件箱", query="Widevine")
   ```

2. **会话内后续提问**：
   ```
   用户："那这封具体说了什么"
   Agent：沿用本会话已放开的 exchange_* 工具，调用 exchange_read_email
   ```

3. **不触发情况**：
   ```
   用户："帮我写段代码"
   Agent：本会话未出现 @mail，exchange_* 工具被 restrict 隐藏，正常回复
   ```

**激活规则**：邮件工具**默认对所有会话隐藏**。用户在消息里出现独立的 `@mail`（按词边界，不匹配 `@mail2`）时，本会话放开全部 `exchange_*` 工具；写成 `@mail assistant` 时只认其中的 `@mail` 部分。助手回复或工具返回里出现 `@mail` 不构成授权。

**配置位置**：触发前缀与其余可调项都写在 profile 的 patch 层（`~/.dsh/profiles/<profile>/cordis.patch.yml`），随该 profile 持久化并由宿主统一加载：

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

`trigger.auto_keywords`（把「邮件」「邮箱」这类词也当作自动触发）在 v1.1.0 **不实现**：靠关键词猜用户意图会让 Agent 在无关对话里查邮箱，与「按需加载」的目标相反。需要时由用户显式 `@mail`。

**工作流程**：

```
用户输入
   ↓
DSH Harness 解析
   ↓
是否含独立 @mail？
   ↓ 是                    ↓ 否
本会话放开 exchange_*    工具保持隐藏
   ↓                       ↓
Agent 调用邮箱工具        Agent 正常回复
```

---

## 二、用户角色与使用场景

### 2.1 目标用户

**认证项目管理人员**，需要通过邮件管理多个认证项目（Widevine、AirPlay2 等），追踪 support 回复、Jira 工单和待办事项。

### 2.2 核心使用场景

#### 场景 1：催促 Support 温柔提醒

**用户故事**：作为认证项目经理，当 Widevine 认证的 support 好几天没有回复我时，我希望 Agent 帮我起草一封温柔客气的提醒邮件。

**对话示例**：

```
用户："Widevine 的 support 三天没回我了，帮我写个温柔客气点的提醒邮件"
```

**流程**：

1. Agent 搜索最近与 Widevine support 的往来邮件
2. Agent 识别最后一封发送给 support 的邮件（3 天前）
3. Agent 分析邮件内容，了解问题背景
4. Agent 生成温柔客气的催促邮件草稿：
   - 礼貌地提及之前的邮件
   - 询问是否需要补充信息
   - 表达理解对方工作繁忙
5. Agent 保存草稿到 Exchange，提示用户在 Outlook 中审核后发送

**生成草稿示例**：

```
主题：Re: Widevine Certification - Issue #12345

Hi [Support Name],

Hope this email finds you well. I wanted to follow up on my previous 
email from Nov 20th regarding the Widevine certification issue #12345.

I understand you might be quite busy, and there's no rush. I just wanted 
to check if there's any update or if you need any additional information 
from our side to help move things forward.

Looking forward to hearing from you when you have a moment.

Best regards,
[Your Name]
```

**价值**：

- 省去手动查找原始邮件的时间
- Agent 自动生成礼貌专业的措辞
- 保留人工审核环节，确保邮件得体

#### 场景 2：认证项目周期汇总

**用户故事**：作为认证项目经理，我希望 Agent 帮我看一下最近 AirPlay2 认证的周期邮件，汇总当前项目的计划排期。

**对话示例**：

```
用户："看下最近 AirPlay2 周期情况的邮件，汇总下当前项目的计划排期"
```

**流程**：

1. Agent 搜索包含"AirPlay2"关键词的邮件（最近 30 天）
2. Agent 识别周期邮件（如"Week 47 Status"、"AirPlay2 Timeline Update"）
3. Agent 提取关键信息：
   - 当前阶段（如"Testing Phase"）
   - 预计完成时间
   - 阻塞问题
   - 下一步行动
4. Agent 生成结构化汇总

**汇总输出示例**：

```
📋 AirPlay2 认证项目排期汇总（最近 30 天）

🗓 时间线：
- 2026-11-15: 提交初始认证申请
- 2026-11-20: Apple 回复初审通过，进入测试阶段
- 2026-11-22: 发现音频同步问题（邮件：Apple Support #67890）
- 预计 2026-12-10: 完成所有测试

⚠️ 当前阻塞问题：
1. 音频同步延迟 50ms（Apple 要求 <30ms）
   - 来源：Apple 邮件 Nov 22
   - 状态：已排查，等待固件更新
   
2. 测试设备不足
   - 来源：内部邮件 Nov 18
   - 状态：已申请采购

📅 下一步行动：
- [ ] 本周五前提交音频同步修复方案（Deadline: Nov 25）
- [ ] 下周一安排回归测试（Nov 28）

📧 相关邮件（3 封）：
- Nov 22: "AirPlay2 Audio Sync Issue" - Apple Support
- Nov 20: "Re: AirPlay2 Certification - Initial Review Passed"
- Nov 18: "测试设备采购申请" - 内部邮件
```

**价值**：

- 快速了解项目全貌，无需逐封翻阅邮件
- 自动识别 deadline 和待办事项
- 结构化输出便于向上汇报

#### 场景 3：Jira 邮件通知解析

**用户故事**：作为工单跟踪人员，我希望 Agent 帮我看一下最近 Jira 有没有什么邮件提醒通知，和我相关的工单做了什么。

**对话示例**：

```
用户："看下最近我的 Jira 有没有什么邮件提醒通知，和我相关的工单做了什么"
```

**流程**：

1. Agent 搜索发件人为"<jira@company.com>"或主题包含"[JIRA]"的邮件（最近 7 天）
2. Agent 解析 Jira 通知邮件，提取：
   - 工单号（如"CERT-1234"）
   - 状态变更（如"Open → In Progress"）
   - 评论内容摘要
   - 指派人变更
3. Agent 筛选与用户相关的工单（指派给我、我创建的、我关注的）
4. Agent 按优先级排序并输出

**汇总输出示例**：

```
🔔 Jira 工单更新汇总（最近 7 天）

🔴 高优先级（2 个）：
1. [CERT-1234] Widevine 认证失败 - Level 3 测试
   - 状态：Open → In Progress（Nov 23 10:30）
   - 指派人：张三
   - 最新评论："已定位到密钥交换问题，预计今天下班前修复"
   - 邮件：Nov 23 "CERT-1234 状态更新"

2. [CERT-5678] AirPlay2 音频同步延迟
   - 状态：In Progress → Blocked（Nov 22 15:00）
   - 阻塞原因："等待硬件团队提供新固件"
   - 指派人：你（待处理）
   - 邮件：Nov 22 "CERT-5678 被阻塞"

🟡 中优先级（1 个）：
3. [CERT-9012] DTS 认证文档更新
   - 状态：To Do → In Progress（Nov 21 09:00）
   - 指派人：李四
   - 最新评论："文档已更新 80%，明天完成"
   - 邮件：Nov 21 "CERT-9012 进展更新"

✅ 已完成（1 个）：
4. [CERT-3456] 杜比认证报告提交
   - 状态：In Progress → Done（Nov 20 16:00）
   - 完成人：你
   - 邮件：Nov 20 "CERT-3456 已完成"

📌 需要你处理的：
- CERT-5678: 联系硬件团队确认固件交付时间
```

**价值**：

- 自动过滤 Jira 垃圾通知，只看重要更新
- 快速识别需要自己处理的工单
- 避免遗漏关键状态变更

#### 场景 4：待办事项智能提取

**用户故事**：作为认证项目经理，我希望 Agent 汇总一下最近的邮件，告诉我有什么待办的事项。

**对话示例**：

```
用户："汇总下最近的邮件，我有什么待办的事项"
```

**流程**：

1. Agent 搜索最近 7 天的未读邮件和标记为重要的邮件
2. Agent 调用 `exchange_extract_todos`（内置规则启发式，产出带原句 `context` 的**候选**），再由模型结合邮件原文核对并识别：
   - Deadline 关键词（"本周五前"、"11月25日前"、"as soon as possible"）
   - Action item（"请提供"、"需要你"、"waiting for your"）
   - 问题邮件（包含"?"且未回复超过 2 天）
3. Agent 按紧急程度排序
4. Agent 生成待办清单

**待办清单输出示例**：

```
📝 待办事项清单（最近 7 天）

🔥 紧急（需今天处理）：
1. 【Deadline Today】回复 Apple Support 关于 AirPlay2 音频问题
   - 来源：Nov 23 "Re: AirPlay2 Audio Sync - Need Your Input"
   - 对方询问："Can you provide the audio latency test report by EOD today?"
   - 建议操作：准备测试报告 → 回复邮件

2. 【待回复 3 天】Widevine Support 询问测试环境配置
   - 来源：Nov 20 "Widevine Cert - Environment Setup Question"
   - 对方询问："What's your Android version and DRM library version?"
   - 建议操作：收集环境信息 → 回复邮件

⏰ 本周内（Nov 25 前）：
3. 【Deadline Friday】提交 DTS 认证申请文档
   - 来源：Nov 21 内部邮件 "DTS Cert Timeline"
   - 要求："请在本周五前提交初稿"
   - 建议操作：完成文档 → 内部审核 → 提交

4. 【待确认】AirPlay2 测试设备采购进度
   - 来源：Nov 18 "测试设备采购申请"
   - 状态：已提交申请，等待采购部门反馈
   - 建议操作：联系采购部门催进度

📅 下周（Nov 28 - Dec 2）：
5. 【Scheduled】杜比认证回归测试
   - 来源：Nov 20 "杜比认证排期"
   - 计划时间：Nov 28（下周一）
   - 建议操作：提前准备测试环境

📧 未读重要邮件（2 封）：
- Nov 23: "Q4 认证项目进度汇报" - 领导询问整体进度
- Nov 22: "HDR10+ 认证新要求" - 认证标准更新通知

✅ 总结：
- 今天必须处理：2 项
- 本周内处理：2 项
- 下周计划：1 项
- 未读重要邮件：2 封
```

**价值**：

- 自动识别 deadline，避免遗漏
- 优先级排序，聚焦最重要的事
- 节省每天梳理邮件的时间（从 30 分钟降到 5 分钟）

---

## 三、功能需求

### 3.1 功能优先级分级

| 优先级 | 功能模块 | 描述 | 对应工具 |
| --- | --- | --- | --- |
| **P0（必须有）** | 邮件读取与搜索 | 核心能力，Agent 必须能读取邮件 | `list_folders` / `search_emails` / `read_email` / `list_recent_emails` |
| **P0** | Exchange 认证 | NTLM 认证（已验证），支持企业邮箱账号 | — |
| **P0** | 草稿保存 | 安全边界，Agent 只能保存草稿 | `save_draft` / `update_draft` / `delete_draft` |
| **P0** | 权限控制 | 文件夹级别的访问控制，防止 Agent 读取敏感邮件 | — |
| **P0** | `@mail` 入口 | 按会话放开工具，避免无关对话查邮箱 | — |
| **P1** | 待办事项提取 | 识别 deadline、待回复邮件、action item | `extract_todos` |
| **P1** | 认证项目追踪 | 识别周期邮件，汇总项目排期和阻塞问题 | `summarize_project` |
| **P1** | Jira 通知解析 | 从 Jira 邮件通知提取工单状态变更与评论 | `parse_jira_notifications` |
| **P1** | 邮件线程重建 | 重建完整讨论链（如 support 往来邮件） | `get_thread` |
| **P1** | 附件下载 | 支持读取邮件附件（如测试报告、日志） | `download_attachment` |
| **P1** | 文件夹管理 | 移动、标记、删除（仅移到已删除） | `move_email` / `mark_email` / `delete_email` |

### 3.2 P0 功能详细设计

#### 3.2.1 邮件读取与搜索

**工具集**：

1. `exchange_list_folders`：列出所有文件夹
   - **输入**：`readable_only`（可选，默认 false，详见 7.3.1）
   - **输出**：文件夹列表（完整路径、末级名称、是否可读）。文件夹以路径标识，不暴露 Exchange 内部 ID，也不返回未读数（见 5.3）
   - **示例**：
     ```json
     {
       "folders": [
         {"path": "收件箱", "name": "收件箱", "readable": true},
         {"path": "认证项目/Widevine", "name": "Widevine", "readable": true}
       ]
     }
     ```
2. `exchange_search_emails`：搜索邮件
   - **输入**：
     - `folder` (string)：完整文件夹路径，如 `收件箱`、`认证项目/Widevine`（必填，必须不在禁止范围内）
     - `query` (string, optional)：关键词
     - `from` (string, optional)：发件人筛选
     - `to` (string, optional)：收件人筛选
     - `subject` (string, optional)：主题筛选
     - `days` (int, optional)：最近 N 天，优先于 `date_from`/`date_to`
     - `date_from` / `date_to` (string, optional)：`YYYY-MM-DD`
     - `unread_only` (bool, default=false)
     - `important_only` (bool, default=false)
     - `limit` (int, default=20)：返回数量上限，被配置的 `max_search_results` 夹住
   - **输出**：邮件列表（ID、发件人、收件人、主题、摘要、时间、是否已读、是否有附件）
   - **说明**：一次搜索只针对一个文件夹。跨文件夹的近期视角用 `exchange_list_recent_emails`（见 3.3.3）。
   - **示例**：
     ```json
     {
       "emails": [
         {
           "id": "AAMkAG...",
           "from": "jenkins@company.com",
           "to": "dev@company.com",
           "subject": "Build Failed: Project-X #123",
           "snippet": "Build failed with error: NullPointerException...",
           "received_time": "2026-11-23T10:30:00Z",
           "is_read": false,
           "has_attachments": true
         }
       ],
       "total": 42
     }
     ```
3. `exchange_read_email`：读取完整邮件
   - **输入**：
     - `email_id` (string)：邮件 ID
     - `mark_as_read` (bool, default=false)：是否标记为已读
   - **输出**：完整邮件内容（纯文本正文、HTML 正文、附件列表、Message-ID、References）
   - **正文口径**：`body_text` 优先取邮件自带的纯文本；只有 HTML 时转为纯文本。超过 `max_body_chars`（默认 20000）时截断，并置 `body_truncated=true`、`body_chars` 给出原始长度。
   - **权限**：读取前按邮件**当前所属文件夹**复核授权，撤销白名单后用旧 `email_id` 读取必须被拒绝。
   - **示例**：
     ```json
     {
       "id": "AAMkAG...",
       "from": "jenkins@company.com",
       "to": ["dev@company.com"],
       "cc": [],
       "subject": "Build Failed: Project-X #123",
       "body_text": "Build failed with error:\nNullPointerException at line 42...",
       "body_html": "<html>...</html>",
       "body_chars": 120,
       "body_truncated": false,
       "received_time": "2026-11-23T10:30:00Z",
       "message_id": "<abc123@jenkins.company.com>",
       "references": ["<def456@jenkins.company.com>"],
       "folder": "收件箱",
       "attachments": [
         {"id": "AAMkAH...", "name": "build.log", "size": 1024, "content_type": "text/plain"}
       ]
     }
     ```
4. `exchange_get_thread`：重建邮件线程
   - **输入**：
     - `email_id` (string)：任意一封线程内邮件的 ID
   - **输出**：完整线程（按发送时间正序，重复邮件按 Message-ID 去重）
   - **实现**：取锚点邮件的 `ConversationId` 拉取同会话邮件，再用 `Message-ID`/`References` 校订顺序
   - **权限**：线程中任一成员位于禁止范围时整条线程拒绝，不返回残缺结果

#### 3.2.2 Exchange 认证

**认证方式：NTLM（本期唯一支持）**

- 用户名：`DOMAIN\username`
- 密码：存入宿主的凭据服务（`ctx.credentials`），不写进插件配置文件，也不进入会话文本
- EWS 地址：`https://exchange.company.com/EWS/Exchange.asmx`
- 传输：`ews-javascript-api` + `@ewsjs/xhr`（NTLM 走 `@ewsjs/ntlm-client`），进程内直连

**OAuth2 不在本期范围**。服务器响应确实包含 OAuth 标志，但 Azure AD 应用注册、租户策略与回调流程都未验证；在无法验证的情况下写进交付范围会给出一个没跑通的承诺。需要时作为独立一期，按「先验证再实现」处理。

**配置与状态**：

账号资料与访问策略存两份，各司其职：

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| 服务器地址、邮箱、域、用户名 | 插件状态文件 `state.json` | 可回显，不含秘密 |
| 密码 | 宿主凭据服务 | 只返回「已设置」状态，不可回读明文 |
| 访问模式、文件夹列表、紧急锁定 | 插件状态文件 `state.json` | 设置页读写 |
| 上限（条数/附件/正文/超时） | profile patch 层 `config` | 由 `Config` schema 校验，用户可改 |

状态文件位于宿主 home 下的插件目录，写入用「临时文件 + rename」的原子写并设权限 `0600`。

**安全要求**：

- 密码只走宿主凭据服务，插件任何输出路径都不返回明文；
- 强制 HTTPS：保存与连接两处都拒绝 `http://` 端点，不做自动降级；
- 支持环境变量覆盖密码（`DSH_EXCHANGE_PASSWORD`），便于容器化部署；
- 连接失败按错误码区分：凭据问题 `AUTH_001`，网络问题 `NET_001`，不得混为一谈。


#### 3.2.3 草稿保存

**工具**：

1. `exchange_save_draft`：保存草稿
   - **输入**：
     - `to` (list[string])：收件人列表（至少一项）
     - `cc` / `bcc` (list[string], optional)：抄送、密送列表
     - `subject` (string)：主题（去空白后非空）
     - `body_text` (string)：纯文本正文
     - `body_html` (string, optional)：HTML 正文
     - `in_reply_to` (string, optional)：被回复的邮件 ID，自动补 `In-Reply-To` 与 `References`
   - **输出**：草稿 ID
   - **说明**：`in_reply_to` 指向的邮件取不到时（已删除或已移走）降级为普通草稿，不因回复对象缺失而让整次起草失败。
   - **示例**：
     ```json
     {
       "draft_id": "AAMkAI...",
       "saved_time": "2026-11-23T11:00:00Z"
     }
     ```

2. `exchange_update_draft`：更新已有草稿
   - **输入**：
     - `draft_id` (string)：草稿 ID
     - 其余字段同 `exchange_save_draft`，只写传入的字段
3. `exchange_delete_draft`：删除草稿
   - **输入**：
     - `draft_id` (string)：草稿 ID

**权限限制**：

- ❌ **不提供** `exchange_send_email` 工具
- ✅ **仅提供** 草稿保存功能
- 用户在 Outlook/OWA 中审核草稿后手动发送

**实现约束**：发送能力不是「暂时没做」，而是**结构上不存在**——插件没有任何能触发 EWS `Send` 的执行路径，也没有通用 EWS 调用入口。这样即使模型被提示词诱导，也没有可调用的发送面。

#### 3.2.4 权限控制

**设计目标**：防止 Agent 访问用户不希望暴露的敏感邮件（如客户隐私资料、财务信息、人事邮件等）。

**控制粒度**：文件夹级别，路径用 `/` 分隔（如 `收件箱/项目A`）。

**配置方式**：设置页勾选，写进插件状态文件。

**状态结构**：

```json
{
  "version": "1.1.0",
  "account": {
    "serverUrl": "https://exchange.company.com/EWS/Exchange.asmx",
    "email": "user@company.com",
    "domain": "COMPANY",
    "username": "user123"
  },
  "access": {
    "mode": "whitelist",
    "folders": ["收件箱", "已发送", "认证项目/Widevine"],
    "emergencyLock": false
  }
}
```

**两种模式的语义**：

| 模式 | 域内路径 | 域外路径 |
| --- | --- | --- |
| `whitelist` | 只允许 `folders` 里**精确列出**的路径 | 一律拒绝 |
| `blacklist` | 命中 `folders` 的路径拒绝，其子目录也拒绝 | 一律允许 |

白名单**不做隐式继承**：勾选 `收件箱` 不会连带放开 `收件箱/项目A`。设置页在勾选父目录时把全部下级邮件目录一并写进 `folders`，由界面完成联动，服务侧只按保存的完整路径逐条校验。这样「用户看到勾了什么」和「服务放行什么」始终一致。

**工作流程**：

1. **文件夹列表显示权限状态**

   `exchange_list_folders` 返回每个目录的 `readable` 标记。被禁止的目录**仍然列出**（用户需要看到它存在、并知道它被禁止），只是不给计数、不可搜索。

   ```json
   {
     "folders": [
       {"path": "收件箱", "name": "收件箱", "readable": true},
       {"path": "人事资料", "name": "人事资料", "readable": false}
     ]
   }
   ```

2. **搜索前校验，不做事后过滤**

   权限判定发生在调用 EWS 之前：目标文件夹不在允许范围就直接返回 `PERM_001`，不发起请求。白名单模式下不提供「搜全部文件夹」入口，因为逐目录搜索再合并的语义会让结果条数与排序变得不可预测。

3. **访问被禁止的文件夹时拒绝**

   ```json
   {
     "error": "PERM_001",
     "message": "该文件夹被设置为隐私保护，Agent 无权访问",
     "details": {"folder": "人事资料"}
   }
   ```

**设置界面**（`settings.section` 自带页）：

```
┌─────────────────────────────────────────────────────┐
│  Mail Assistant                                     │
├─────────────────────────────────────────────────────┤
│  EWS 地址  [https://exchange.company.com/EWS/...]   │
│  邮箱地址  [user@company.com          ]             │
│  域        [COMPANY]   用户名 [user123]             │
│  密码      [已设置]  [修改]                          │
│                                                      │
│  [连接并加载文件夹]                                  │
│                                                      │
│  访问模式：● 白名单（仅允许勾选的文件夹）            │
│           ○ 黑名单（禁止勾选的文件夹）               │
│                                                      │
│  文件夹权限：                                        │
│  ☑ 收件箱                           [允许]           │
│  ☑ 已发送                           [允许]           │
│    ☑ 认证项目                       [允许]           │
│      ☑ Widevine                     [允许]           │
│  ☐ 客户隐私资料                     [禁止]           │
│  ☐ 财务报表                         [禁止]           │
│  ☐ 人事资料                         [禁止]           │
│  ☑ 草稿箱                           [允许]           │
│                                                      │
│  ☐ 紧急锁定（禁止 Agent 访问所有文件夹）             │
│                                                      │
│  [保存]  [重置为默认]                                │
└─────────────────────────────────────────────────────┘
```

页面通过三条本地接口工作：`GET /dsh-exchange/api/status` 读状态、`POST /dsh-exchange/api/probe` 用当前表单临时连一次 Exchange 拿目录、`POST /dsh-exchange/api/save` 落盘。状态接口**只返回密码是否已设置**，不返回密码本身。

**默认行为**：

- 初次安装：黑名单模式、`folders` 为空，即所有文件夹可读。
- 推荐路径：首次进入设置页引导用户先把敏感目录加进黑名单，或直接切到白名单只放开需要的几个。

**安全增强**：

1. **审计日志**：每次权限检查记一行 JSON，含时间、动作、文件夹、邮件 ID、结果、错误码、耗时。**不记主题、不记正文、不记凭据**。
   ```json
   {"ts":"2026-11-24T10:30:15.000Z","action":"read_email","folder":"人事资料","emailId":"AAMk01","outcome":"denied","code":"PERM_001","elapsedMs":2}
   ```

2. **权限变更即时生效**：状态文件每次调用前读取，不缓存在进程内，改完下一次调用就按新策略判定，不需要重启。

3. **紧急锁定**：`emergencyLock=true` 时所有文件夹一律拒绝，用于临时停用 Agent 的邮箱访问。

**验收标准**：

1. ✅ Agent 无法读取被禁止文件夹中的邮件
2. ✅ 被禁止文件夹不出现在可搜索范围内（搜索前置拒绝，非事后过滤）
3. ✅ 权限配置持久化保存，重启后保持
4. ✅ 权限变更即时生效，无需重启宿主
5. ✅ 审计日志记录所有权限检查，且不含正文与凭据


### 3.3 P1 功能设计

#### 3.3.1 附件下载

**工具**：

1. `exchange_download_attachment`：下载附件
   - **输入**：
     - `email_id` (string)：邮件 ID
     - `attachment_id` (string)：附件 ID
     - `save_path` (string, optional)：保存路径（默认：临时目录）
   - **输出**：
     - `file_path` (string)：本地文件路径
     - `size` (int)：字节数
     - `content_base64` (string, optional)：小文件（≤1MB）直接返回 Base64
   - **限制**：单个附件最大 25MB，超出返回 `ATT_001`，且在写盘前判定
   - **文件名处理**：附件名只取基名，剔除路径分隔符、盘符与 `..`，避免写到预期目录之外

#### 3.3.2 文件夹管理

**工具**：

1. `exchange_move_email`：移动邮件
   - **输入**：
     - `email_id` (string)
     - `target_folder` (string)：目标文件夹完整路径
   - **权限**：源文件夹与目标文件夹都必须通过授权判定
2. `exchange_mark_email`：标记邮件
   - **输入**：
     - `email_id` (string)
     - `is_read` (bool, optional)：标记为已读/未读
     - `is_flagged` (bool, optional)：加星标
3. `exchange_delete_email`：删除邮件（移动到已删除项目）
   - **输入**：
     - `email_id` (string)
     - `permanent` (bool, default=false)
   - **限制**：`permanent=true` 一律拒绝（`PERM_001`）。本期只支持移到「已删除项目」，因此可恢复。

#### 3.3.3 近期邮件视角

**工具**：`exchange_list_recent_emails`

- **输入**：`days`（1–90，默认 7）、`unread_only`（默认 false）、`limit`
- **输出**：跨所有可读文件夹的邮件摘要合并后按接收时间倒序，每条带 `folder`
- **范围**：只遍历 `readable=true` 的文件夹（黑名单模式下为未被禁止的全部文件夹，白名单模式下为白名单内的文件夹）；每个文件夹各取最近 N 天，合并后按接收时间倒序再截断到 `limit`。这是「近期视角」，不是对任意文件夹的搜索，与白名单模式下「不提供搜全部文件夹」并不冲突：被禁止的文件夹从不被访问。
- **理由**：场景 3（Jira 通知）与场景 4（待办提取）都需要「最近 N 天有什么」，逐文件夹搜索再合并既慢又会漏。这条是这两类场景的实际取数入口。

---

## 四、技术架构设计

### 4.1 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                        DSH Harness                            │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              AI Agent（模型）                            │ │
│  └───────────────────┬─────────────────────────────────────┘ │
│                      │ 调用 exchange_* 工具                  │
│  ┌───────────────────▼─────────────────────────────────────┐ │
│  │   组合包 @local/dsh-exchange（Node ESM）                 │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │ │
│  │  │ 工具注册  │ │ 本地路由  │ │ 会话隔离  │ │ 设置页      │  │ │
│  │  │ tools/   │ │ routes   │ │ scope    │ │ client.js  │  │ │
│  │  └────┬─────┘ └──────────┘ └──────────┘ └────────────┘  │ │
│  │       │                                                  │ │
│  │  ┌────▼─────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │ │
│  │  │ 搜索/读取 │ │ 草稿      │ │ 权限判定  │ │ NLP 解析    │  │ │
│  │  │ ews/     │ │ ews/     │ │ security/│ │ nlp/       │  │ │
│  │  └────┬─────┘ └────┬─────┘ └──────────┘ └────────────┘  │ │
│  │       └────────────┴──────────────┐                      │ │
│  │  ┌────────────────────────────────▼───────────────────┐  │ │
│  │  │ EWS 客户端 ews-javascript-api + @ewsjs/xhr (NTLM)  │  │ │
│  │  └────────────────────────────────┬───────────────────┘  │ │
│  └───────────────────────────────────┼──────────────────────┘ │
│         宿主服务：ctx.tools / webServer / settings /          │
│                  credentials / systemPrompt                  │
└───────────────────────────────────┼──────────────────────────┘
                                    │ HTTPS + NTLM（EWS）
                                    ▼
              ┌──────────────────────────────────┐
              │  Exchange Server（自建）          │
              │  - EWS Endpoint                  │
              │  - NTLM 认证（已验证）            │
              └──────────────────────────────────┘
```

关键点：**没有中间服务进程**。EWS 调用发生在宿主进程内，插件不额外起子进程，也不需要 Python 运行时。

### 4.2 技术选型

| 组件 | 技术栈 | 理由 |
| --- | --- | --- |
| **交付形态** | DSH 组合包（`dsh.bundle.patch`） | 宿主原生插件形态，唯一能被 DSH 加载的方式 |
| **集成方式** | `defineTool` 注册工具 | 工具自动进入模型可调用面，权限与取消由宿主统一处理 |
| **Exchange API** | EWS (Exchange Web Services) | 自建 Exchange 的标准接口（已验证） |
| **认证** | NTLM（已验证） | 企业域认证；OAuth2 未验证，移出本期 |
| **语言/运行时** | Node `^22.19.0 \|\| >=24`，纯 ESM | 与宿主运行时一致，无需额外运行时 |
| **EWS 客户端** | `ews-javascript-api` 0.15.3 | 成熟的 EWS 封装，支持 NTLM 与流式附件 |
| **NTLM 传输** | `@ewsjs/xhr` + `@ewsjs/ntlm-client` | 随 EWS 客户端配套；须开 `gzip`，否则 NTLM 响应会乱码 |
| **凭据存储** | 宿主 `ctx.credentials` | 私有文件 + 权限 600；密钥不进插件配置与会话文本 |
| **配置** | profile patch 层 `config` + `Config` schema | 用户可在 patch 层改上限，随升级保留 |
| **状态** | 原子写 JSON（`0600`） | 账号资料与访问策略需可回显 |
| **数据模型** | 纯 JS 对象 + 工具 output schema | 无需引入校验库；边界由宿主 schema 校验兜住 |
| **NLP 能力** | 内置正则启发式 | 识别 deadline、action item、工单号；不依赖外部服务 |
| **测试** | `node --test` | 与运行时同栈，不需要额外测试框架 |

### 4.3 核心依赖

```json
{
  "dependencies": {
    "ews-javascript-api": "0.15.3"
  },
  "peerDependencies": {
    "@deepseek-ai/dsh-tools": ">=0.2.2-rc.3",
    "@deepseek-ai/schemastery": "^3.18.2"
  }
}
```

`package.json` 同时用 `engines.dsh` 声明支持范围：`"engines": { "dsh": ">=0.2.2-rc.3 <0.3.0" }`。安装与 profile 启动会拒绝不满足范围的 DSH；缺省时才退回检查 `@deepseek-ai/dsh*` peer 范围。

宿主已提供 `@deepseek-ai/cordis`、React 等共享实例，按 peer 声明，**不打包进插件**。

### 4.4 包结构

```
@local/dsh-exchange/
├── package.json          # dsh.bundle.patch + dsh.client 声明
├── cordis.patch.yml      # 插入行与 limits/trigger 配置
├── index.js              # Host 入口：apply(ctx, config)、Config、inject
├── client.js             # Client 入口：设置页 + @mail 候选
├── src/
│   ├── config.js         # Config schema 与上限解析
│   ├── state.js          # 状态文件原子读写
│   ├── errors.js         # ExchangeError 与错误码
│   ├── routes.js         # 设置页三条本地接口
│   ├── mention.js        # @mail 识别
│   ├── scope.js          # 会话级工具隔离
│   ├── ews/
│   │   ├── connection.js # 连接、NTLM、超时、重试、错误映射
│   │   ├── folders.js    # 目录树与路径解析
│   │   ├── search.js     # 搜索与读取正文
│   │   ├── draft.js      # 草稿
│   │   ├── thread.js     # 线程重建
│   │   ├── attachment.js # 附件下载
│   │   └── mutate.js     # 移动/标记/删除
│   ├── security/
│   │   ├── permissions.js# 白/黑名单与紧急锁定
│   │   └── audit.js      # 脱敏审计日志
│   ├── nlp/
│   │   ├── todo.js       # 待办提取
│   │   ├── jira.js       # Jira 通知解析
│   │   └── summary.js    # 项目汇总
│   └── tools/index.js    # 全部工具定义
├── locale/               # 插件标题与描述
└── tests/
    ├── unit/             # node --test
    └── integration/      # 真实邮箱联调，默认 skip
```

### 4.5 数据流示例

**场景：Agent 搜索 Widevine 相关邮件**

```
1. 用户在消息里输入 @mail → inputTriggers 候选被选中 → 本会话放开 exchange_*
2. Agent 调用 exchange_search_emails(folder="收件箱", query="Widevine", days=7)
3. 插件按顺序做四件事：
   a. 读状态文件 → 白名单里有「收件箱」→ 通过
   b. 解析路径「收件箱」→ 得到该目录句柄（缺失或歧义则报错并给候选）
   c. 构造 EWS 过滤条件 → 发起 FindItems
   d. 写一行审计日志（文件夹、条数、耗时，不含主题与正文）
4. 返回摘要列表给模型
```

**场景：Agent 起草催办邮件**

```
1. Agent 调 exchange_search_emails 找到 3 天前那封邮件，拿到 email_id
2. Agent 调 exchange_read_email 取上下文
3. Agent 生成正文，调 exchange_save_draft(to, subject, body_text, in_reply_to)
4. 插件补 In-Reply-To / References 后写入草稿箱，返回 draft_id
5. 插件提示「草稿已保存，请在 Outlook 中审核后发送」
```

**场景：提取待办**

```
1. Agent 调 exchange_extract_todos(days=7)，插件内部取近期邮件并用规则启发式产出待办候选（含 context 原句）
2. 对存疑的候选，Agent 再调 exchange_read_email 核对原文（按需，不预读全部）
3. Agent 核对后归纳 deadline 与 action item；启发式结果只是候选，不作权威数据
（只需浏览近期邮件而不提取待办时，用 exchange_list_recent_emails）
```


---

## 五、数据模型

数据模型以**工具 output schema** 为准：宿主按声明的 schema 校验返回结构，字段缺失或类型不符会被拦在工具边界。以下为各对象的字段约定。

### 5.1 邮件对象（Email）

搜索返回摘要，读取返回详情；两者共用同一身份字段。

| 字段 | 类型 | 摘要 | 详情 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | string | ✓ | ✓ | Exchange 邮件唯一 ID |
| `conversation_id` | string | | ✓ | 会话 ID，用于线程重建 |
| `message_id` | string | | ✓ | RFC 2822 Message-ID |
| `references` | string[] | | ✓ | 引用的 Message-ID 列表 |
| `from` | string | ✓ | ✓ | 发件人邮箱 |
| `to` | string[] | | ✓ | 收件人列表 |
| `cc` | string[] | | ✓ | 抄送列表 |
| `subject` | string | ✓ | ✓ | 主题 |
| `snippet` | string | ✓ | | 正文前 200 字符，用于摘要 |
| `body_text` | string | | ✓ | 纯文本正文（HTML 已转纯文本） |
| `body_html` | string \| null | | ✓ | 原始 HTML 正文 |
| `body_chars` | int | | ✓ | 正文原始字符数 |
| `body_truncated` | bool | | ✓ | 是否因超 `max_body_chars` 被截断 |
| `received_time` | string (ISO 8601) | ✓ | ✓ | 接收时间 |
| `is_read` | bool | ✓ | ✓ | 是否已读 |
| `has_attachments` | bool | ✓ | | 是否有附件 |
| `attachments` | Attachment[] | | ✓ | 附件列表 |
| `folder` | string | ✓ | ✓ | 所在文件夹完整路径 |

**摘要与详情分开的理由**：摘要用于列表渲染与筛选，字段少、体积小；详情按需读取，正文与附件只在用户真要看某封时才取。两者共用 `id` 作为身份，模型先用摘要定位再取详情。

### 5.2 附件对象（Attachment）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 附件 ID，用于下载 |
| `name` | string | 文件名（不含路径） |
| `size` | int | 字节数 |
| `content_type` | string | MIME 类型 |
| `is_inline` | bool | 是否内嵌图片 |

读取邮件时只返回元数据，**不下正文**。需要内容时显式调 `exchange_download_attachment`。

### 5.3 文件夹对象（Folder）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `path` | string | 完整路径，`/` 分隔，如 `认证项目/Widevine` |
| `name` | string | 末级名称 |
| `readable` | bool | 是否在当前授权范围内 |

**用路径而非 ID 标识文件夹**：ID 是 Exchange 内部标识，用户在设置页看到的是路径，模型也只能引用路径。服务侧把路径解析成句柄，并在解析时处理重名与缺失。

### 5.4 待办对象（TodoItem）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | 待办标题 |
| `source_email_id` | string | 来源邮件 ID |
| `source_subject` | string | 来源邮件主题 |
| `deadline` | string (ISO 8601) \| null | 识别到的截止时间，无则 null |
| `priority` | `urgent` \| `high` \| `medium` \| `low` | 紧急程度 |
| `action_type` | `reply_required` \| `follow_up` \| `review` \| `submit` | 动作类型 |
| `context` | string | 判定依据的一句原文 |

### 5.5 Jira 通知对象（JiraNotification）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `issue_key` | string | 工单号，如 `CERT-1234` |
| `summary` | string | 工单标题 |
| `status_from` / `status_to` | string \| null | 状态流转 |
| `assignee` | string \| null | 指派人 |
| `priority` | string \| null | 优先级 |
| `latest_comment` | string \| null | 最新评论摘要 |
| `updated_at` | string (ISO 8601) | 通知时间 |
| `source_email_id` | string | 来源邮件 ID |

---

## 六、安全与权限设计

### 6.1 认证安全

| 威胁 | 防护措施 |
| --- | --- |
| **凭证泄露** | 密码存宿主凭据服务（私有文件，权限 600）；不进插件配置文件、不进状态文件、不进会话文本；支持 `DSH_EXCHANGE_PASSWORD` 环境变量覆盖 |
| **中间人攻击** | 只接受 `https://` 端点，保存与连接两处都拒绝 `http://`，不做自动降级；由运行时校验证书 |
| **令牌劫持** | 本期不使用长期令牌；OAuth2 未启用，故无刷新令牌需要保管 |

**关于不自行加密密码**：v1.0.0 曾要求用 AES-256-GCM 自行加密存盘。自建密钥意味着把密钥放在同一台机器上，攻击者若能读到密文也能读到密钥，实际防护力接近零，却引入一套需要维护的密钥轮换。宿主凭据服务复用同一 threat model 下已验证的存储（私有文件 + 权限位），并已由其他插件在生产使用。要「用同一 OS 用户身份的进程也读不到」这类隔离，需要的是外部密钥服务，不是自管 AES。

### 6.2 操作权限

| 操作 | 是否允许 | 备注 |
| --- | --- | --- |
| 读取邮件 | ✅ | 核心功能，读前按当前文件夹复核授权 |
| 搜索邮件 | ✅ | 核心功能，搜索前校验 |
| 下载附件 | ✅ | 限制 25MB |
| 保存草稿 | ✅ | 仅草稿箱 |
| **发送邮件** | ❌ | 必须人工审核；工具集中不存在发送面 |
| **删除邮件** | ⚠️   | 仅移动到已删除项目，可恢复 |
| **永久删除** | ❌    | 高风险操作，不支持     |

### 6.3 数据隐私

- **本地处理**：邮件内容只在宿主进程与会话之间流动，不上传第三方服务；不新增任何外部依赖服务
- **日志脱敏**：运行日志与审计日志都不记录邮件正文，仅记录元数据（文件夹路径、邮件 ID、条数、耗时、错误码）；连主题也不记
- **凭据隔离**：密码只存宿主凭据服务，插件不落盘、不回显、不进会话文本
- **会话隔离**：工具可用性按会话控制，未 `@mail` 的会话看不到邮件工具

---

## 七、工具接口规范

### 7.1 工具清单

全部 15 个工具，均为只读或受限写；**没有任何发送能力**。

| 工具 | 优先级 | 描述 |
| --- | --- | --- |
| `exchange_list_folders` | P0 | 列出文件夹与可读状态 |
| `exchange_search_emails` | P0 | 在单个可读文件夹内搜索 |
| `exchange_read_email` | P0 | 读取完整邮件 |
| `exchange_list_recent_emails` | P0 | 跨可读文件夹取最近 N 天 |
| `exchange_save_draft` | P0 | 保存草稿 |
| `exchange_update_draft` | P0 | 更新草稿 |
| `exchange_delete_draft` | P0 | 删除草稿 |
| `exchange_get_thread` | P1 | 重建邮件线程 |
| `exchange_parse_jira_notifications` | P1 | 解析 Jira 通知 |
| `exchange_extract_todos` | P1 | 提取待办事项 |
| `exchange_summarize_project` | P1 | 按项目汇总邮件 |
| `exchange_download_attachment` | P1 | 下载附件（≤25MB） |
| `exchange_move_email` | P1 | 移动邮件 |
| `exchange_mark_email` | P1 | 标记已读/星标 |
| `exchange_delete_email` | P1 | 移到已删除项目（不可永久删除） |

**命名约定**：全部以 `exchange_` 前缀注册。Agent 可见的完整名称即上表，模型按这个名字调用。

### 7.2 通用约定

**参数校验**：宿主按工具声明的 schema 校验参数，非法输入在进入业务逻辑前就被拦下。业务层再校验语义边界（收件人非空、主题非空、日期格式 `YYYY-MM-DD`、`limit` 夹到上限）。

**取消**：每个工具都接收宿主传入的取消信号，长耗时操作（附件下载、多封读取）在每步之间检查，取消能传到实际执行方。取消触发时，让 signal 的 reason 或依赖抛出的 `AbortError` 直接传播，不得包装成普通 `Error`（宿主据此记录 `TOOL_ABORTED`）。

**权限前置**：所有涉及文件夹或邮件的工具，先判定授权再发起 EWS 请求。判定失败返回 `PERM_001`，不产生任何网络调用。

**输出形状**：成功返回结构化对象；失败由宿主按 `ExchangeError.code` 生成错误结果，模型能看到错误码与可读消息。

### 7.3 P0 工具详细接口

#### 7.3.1 `exchange_list_folders`

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `readable_only` | bool | 否 | false | 只返回授权范围内的文件夹 |

**返回**：`{ folders: [{ path, name, readable }] }`。默认模式列出全部文件夹并标出 `readable`；`readable_only=true` 时只返回可读的。

#### 7.3.2 `exchange_search_emails`

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `folder` | string | 是 | — | 完整路径 |
| `query` | string | 否 | — | 关键词 |
| `from` / `to` / `subject` | string | 否 | — | 三个独立筛选，部分匹配 |
| `days` | int | 否 | — | 最近 N 天，优先于日期区间 |
| `date_from` / `date_to` | string | 否 | — | `YYYY-MM-DD` |
| `unread_only` | bool | 否 | false | 仅未读 |
| `important_only` | bool | 否 | false | 仅重要 |
| `limit` | int | 否 | 20 | 夹到 `max_search_results` |

**返回**：`{ emails: [摘要], total }`，按接收时间倒序。

#### 7.3.3 `exchange_read_email`

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `email_id` | string | 是 | — | 摘要里的 ID |
| `mark_as_read` | bool | 否 | false | 读后是否标记已读 |

**返回**：邮件详情（见 5.1）。读前按邮件当前文件夹复核授权。

#### 7.3.4 `exchange_list_recent_emails`

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `days` | int | 否 | 7 | 1–90，含今天 |
| `unread_only` | bool | 否 | false | 仅未读 |
| `limit` | int | 否 | 20 | 合并后的上限 |

**返回**：`{ emails: [摘要 + folder] }`，跨可读文件夹合并后倒序。

#### 7.3.5 草稿工具

`exchange_save_draft`

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `to` | string[] | 是 | 至少一项 |
| `cc` / `bcc` | string[] | 否 | 抄送、密送 |
| `subject` | string | 是 | 去空白后非空 |
| `body_text` | string | 是 | 纯文本正文 |
| `body_html` | string | 否 | HTML 正文 |
| `in_reply_to` | string | 否 | 被回复邮件 ID，自动补 `In-Reply-To`/`References` |

**返回**：`{ draft_id, saved_time }`。

`exchange_update_draft`：`draft_id` 必填，其余字段同 `exchange_save_draft`，只写传入的。
`exchange_delete_draft`：`draft_id` 必填。

### 7.4 P1 工具详细接口

| 工具 | 主要参数 | 返回 |
| --- | --- | --- |
| `exchange_get_thread` | `email_id` | `{ emails: [详情] }`，发送时间正序 |
| `exchange_parse_jira_notifications` | `days=7`, `filter_by_user=true` | `{ notifications: [JiraNotification] }` |
| `exchange_extract_todos` | `days=7`, `include_unread=true`, `include_important=true` | `{ todos: [TodoItem] }`，按紧急度排序 |
| `exchange_summarize_project` | `project`, `days=30`, `include_threads=true` | `{ project, time_range, timeline, blocking_issues, next_actions, related_emails }` |
| `exchange_download_attachment` | `email_id`, `attachment_id`, `save_path?` | `{ file_path, size, content_base64? }` |
| `exchange_move_email` | `email_id`, `target_folder` | `{ moved: true }` |
| `exchange_mark_email` | `email_id`, `is_read?`, `is_flagged?` | `{ updated: true }` |
| `exchange_delete_email` | `email_id`, `permanent=false` | `{ deleted: true }` |

### 7.5 错误处理

**异常与错误码**：

```js
// DSH 0.2.2-rc.3 要求：预期失败须抛出带稳定 code 的 HarnessError 子类，
// 只有 HarnessError 会让工具结果保留 error.name / error.code。
export class ExchangeError extends HarnessError {
  constructor(code, message, details = {}) {
    super(`[${code}] ${message}`);
    this.code = code;
    this.message = message;
    this.details = details;
  }
}
```

| 错误码 | 含义 | 典型触发 |
| --- | --- | --- |
| `AUTH_001` | 认证失败 | 密码错误、密码过期、账号被锁 |
| `EMAIL_001` | 邮件不存在 | ID 失效、邮件已被删除 |
| `PERM_001` | 权限不足 | 文件夹不在授权范围、永久删除、路径歧义 |
| `NET_001` | 网络错误 | 端点不可达、超时、使用了非 HTTPS 端点 |
| `RATE_001` | 速率限制 | 服务端限流，重试后仍失败 |
| `ATT_001` | 附件超限 | 超过 25MB |

**错误分类原则**：认证问题与网络问题必须分开。凭据过期报 `AUTH_001` 让用户去改密码；报 `NET_001` 会把用户引向排查网络，白费时间。

**模型侧用法**：模型看到错误码后可据此决定下一步（`AUTH_001` 提示用户检查配置，`PERM_001` 提示用户调整授权范围，`RATE_001` 稍后重试）。

---


## 八、非功能需求

### 8.1 性能要求

| 指标 | 目标值 |
| --- | --- |
| **邮件搜索延迟** | < 2 秒（单次搜索 100 封以内） |
| **邮件读取延迟** | < 1 秒（不含附件下载） |
| **并发用户** | 支持 50 个并发用户 |
| **附件下载速度** | > 1 MB/s（内网环境） |

该指标为容量说明，不纳入自动化验收（见 12.2）。「并发用户」指多个宿主进程各自连接同一 Exchange，不是单进程内 50 个并发请求：插件不做连接池，每进程维持一条 EWS 会话。

### 8.2 可靠性要求

- **服务端繁忙重试**：自动重试 3 次，退避 1s / 2s / 4s
- **请求超时**：默认 30 秒，可配置（1–300 秒）
- **不缓存降级**：Exchange 不可用时如实返回错误，**不返回缓存邮件**。返回过期邮件会让用户以为看到的是最新状态，比直接报错更危险。
- **认证失败不重试**：凭据错误立即返回 `AUTH_001`，重试只会浪费时间并可能触发账号锁定

### 8.3 兼容性要求

| 组件 | 版本要求 |
| --- | --- |
| **Exchange Server** | 已实测：Exchange Server SE（15.2.2562.49）；理论兼容（EWS 按 2013 协商，未实测）：2013 / 2016 / 2019。Microsoft 365 / Online 依赖 OAuth2，本期不支持 |
| **DSH Harness** | >= 0.2.2-rc.3 |
| **Node 运行时** | `^22.19.0 \|\| >=24` |
| **操作系统** | Linux / macOS / Windows |

`ews-javascript-api` 的 EWS 版本按 Exchange 2013 协商，向上兼容更新版本。

### 8.4 可观测性

**日志分级**：

- `DEBUG`：API 调用参数（脱敏，不含正文与凭据）
- `INFO`：用户操作记录（如「搜索邮件：文件夹=收件箱，条数=12，耗时=340ms」）
- `WARN`：认证失败、网络超时、限流
- `ERROR`：未捕获异常

**审计日志**：独立于运行日志，每个工具调用一行 JSON，字段固定为时间、动作、文件夹、邮件 ID、结果、错误码、耗时。**不记主题、不记正文、不记凭据**。

**监控指标**（可由宿主遥测采集）：

- 工具调用次数（按工具名统计）
- 调用延迟（P50 / P95 / P99）
- 认证失败率
- 附件下载流量

---

## 九、实施路线图

路线图按**可独立验收的里程碑**划分，不对阶段标注工期：工期取决于执行者，写死在文档里只会过期。

### 里程碑 1：骨架可加载

组合包能被宿主装上，插件页与设置页出现，空实现不报错。

**交付**：`package.json` / `cordis.patch.yml` / `index.js` / `client.js` / locale / icon。
**验收**：装好后插件行状态为 active，设置页能打开，控制台无 slot 崩溃。

### 里程碑 2：第一条可用链路

用真实账号列出目录、搜索邮件、读正文。

**交付**：NTLM 连接与错误映射、目录树与路径解析、搜索、读正文、权限模型（白/黑名单 + 紧急锁定）、审计日志，以及 `exchange_list_folders` / `exchange_search_emails` / `exchange_read_email`。
**验收**：

- 能连接自建 Exchange 并列出真实目录
- 能搜索并读取邮件正文
- 被禁止的文件夹前置拒绝，不发起请求
- 撤销授权后旧 `email_id` 读取被拒

### 里程碑 3：P0 闭环

补上草稿与设置页，形成「查到 → 读 → 起草 → 人工发送」的完整可用流程。

**交付**：草稿三工具、设置页三条本地接口、文件夹勾选 UI、`@mail` 入口与会话级工具隔离。
**验收**：

- 草稿能在 Outlook 草稿箱看到并正常编辑发送
- 撤销白名单后重连，用该目录搜索被拒
- 未 `@mail` 的会话看不到 `exchange_*` 工具

### 里程碑 4：P1 能力

**交付**：`exchange_get_thread`、`exchange_download_attachment`、`exchange_move_email` / `exchange_mark_email` / `exchange_delete_email`、`exchange_parse_jira_notifications`、`exchange_extract_todos`、`exchange_summarize_project`。
**验收**：

- 能重建含 10 封邮件的线程并按时间正序
- 25MB 附件边界正确（等于允许，超 1 字节拒绝）
- 永久删除一律拒绝

### 里程碑 5：交付收口

**交付**：完整单元测试、真实邮箱联调记录、README（安装、配置、工具清单、边界说明）。
**验收**：全量测试通过；四个核心场景在真实邮箱上跑通并留证。

### 不在本期范围

- **OAuth2 认证**：服务器已开 OAuth 标志，但 Azure AD 应用注册与回调流程未验证。作为独立一期，先验证再实现。
- **关键词自动触发**：会导致无关对话里查邮箱，与按需加载目标相反。
- **高级搜索 AND/OR/NOT**：现有筛选组合已覆盖绝大多数查询；引入表达式语法会增加模型误用概率。
- **附件类型白名单**：本期只做大小与文件名净化。是否阻止可执行文件另议——下载到用户自己的机器，风险由用户环境承担。

---

## 十、风险与缓解措施

| 风险 | 影响 | 概率 | 缓解措施 |
| --- | --- | --- | --- |
| **Exchange 版本兼容性问题** | 高 | 中 | 按 Exchange 2013 协商 EWS 版本；里程碑 2 用真实服务器验证后再继续 |
| **企业防火墙阻断 EWS** | 高 | 低 | 设置页的「连接并加载文件夹」即连通性检查，失败时给出具体原因（DNS / 端口 / 证书 / 凭据） |
| **Node EWS 客户端成熟度** | 中 | 中 | 选定库为社区维护（最近发布 2024-05），核心读取路径先验证；NTLM 必须开 `gzip`，否则响应乱码 |
| **大附件下载耗尽内存** | 中 | 中 | 写盘前判定 25MB 上限；超限直接拒绝，不做部分下载 |
| **邮件数量过多导致搜索慢** | 中 | 中 | 默认返回 20 条、上限 100；一次搜索限定单个文件夹 |
| **正则启发式解析不准** | 中 | 高 | 待办、Jira 解析与项目汇总（`timeline` / `blocking_issues` / `next_actions`）只作为**候选**，输出带来源邮件 ID 与原句供模型核对；不把它当权威数据，验收只检查结构与来源可追溯，不检查语义准确率 |
| **速率限制（RATE_001）** | 中 | 低 | 服务端繁忙自动重试 3 次（退避 1s/2s/4s），仍失败返回 `RATE_001`，由模型提示用户稍后重试 |

---

## 十一、附录

### 11.1 参考资料

- [Exchange Web Services (EWS) 官方文档](https://learn.microsoft.com/en-us/exchange/client-developer/exchange-web-services/explore-the-ews-managed-api-ews-and-web-services-in-exchange)
- [ews-javascript-api](https://github.com/gautamsi/ews-javascript-api)（Node EWS 客户端）
- [@ewsjs/xhr](https://github.com/ewsjs/xhr)（NTLM / FBA 传输）
- [DSH 工具编写参考](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/docs/cookbook/adding-a-tool.zh.md)
- [DSH 输入触发器](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/packages/client/ui-input-trigger/README.zh.md)
- [DSH 插件打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/docs/user/develop/basic/publish.zh.md)

### 11.2 术语表

| 术语 | 定义 |
| --- | --- |
| **EWS** | Exchange Web Services，Exchange 的 SOAP/REST API |
| **NTLM** | NT LAN Manager，Windows 域认证协议 |
| **组合包（bundle）** | 带 `dsh.bundle.patch` 的 npm 包，宿主据此插入插件行 |
| **cordis patch** | profile 的 YAML 配置层，叠加在官方包之上，随升级保留 |
| **Message-ID** | RFC 2822 定义的邮件唯一标识符 |
| **References** | 邮件头字段，记录回复链中的前序邮件 |
| **OWA** | Outlook Web App，Exchange 的 Web 界面 |
| **工具（tool）** | 经 `defineTool` 注册、模型可调用的类型化能力 |

### 11.3 配置示例

**patch 层**（`~/.dsh/profiles/<profile>/cordis.patch.yml`）：

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

**状态文件**（由设置页写入，勿手工编辑）：

```json
{
  "version": "1.1.0",
  "account": {
    "serverUrl": "https://exchange.company.com/EWS/Exchange.asmx",
    "email": "user@company.com",
    "domain": "COMPANY",
    "username": "user123"
  },
  "access": {
    "mode": "whitelist",
    "folders": ["收件箱", "已发送", "认证项目/Widevine"],
    "emergencyLock": false
  }
}
```

密码不在此文件中，由宿主凭据服务单独保管。

---

## 十二、验收标准

### 12.1 功能验收

| 测试场景 | 预期结果 |
| --- | --- |
| **搜索包含「code review」的邮件** | 返回匹配邮件列表，按接收时间倒序 |
| **读取邮件并展示正文** | 纯文本与 HTML 均正确；纯 HTML 邮件转为可读纯文本 |
| **保存草稿到 Exchange** | 草稿在 Outlook 草稿箱可见、可编辑、可手动发送 |
| **下载 5MB 日志附件** | 文件完整下载，大小与原附件一致 |
| **重建包含 10 封邮件的线程** | 按发送时间正序，无重复、无遗漏 |
| **访问被禁止的文件夹** | 返回 `PERM_001`，且不发起任何 EWS 请求 |
| **撤销授权后读旧邮件** | 用原 `email_id` 读取返回 `PERM_001` |
| **未 `@mail` 的会话** | 模型看不到任何 `exchange_*` 工具 |
| **尝试调用发送** | 工具集中不存在该能力，调用无从发起 |
| **附件 25MB 边界** | 恰好 25MB 通过；超 1 字节返回 `ATT_001` |
| **永久删除邮件** | 返回 `PERM_001`，邮件未被删除 |

### 12.2 性能验收

| 指标 | 目标值 | 测试方法 |
| --- | --- | --- |
| **搜索 100 封邮件** | < 2 秒 | `node --test` 计时，联调环境实测 |
| **读取单封邮件** | < 1 秒 | 平均 100 次读取 |

「并发 50 用户」不在自动化验收范围：它取决于 Exchange 服务端容量与网络，不是插件能自证的指标。需要时单独压测并记录环境。

### 12.3 安全验收

| 检查项 | 通过标准 |
| --- | --- |
| **凭据保管** | 密码只存宿主凭据服务；插件配置文件、状态文件、工具输出、日志均无明文 |
| **状态文件权限** | 写入后为 `0600` |
| **HTTPS 强制** | 保存与连接两处都拒绝 `http://`，无自动降级 |
| **日志脱敏** | 日志与审计中无密码、无令牌、无邮件正文；审计只记元数据 |
| **权限绕过** | 被禁止文件夹的搜索与读取均前置拒绝；`permanent=true` 一律拒绝 |

---

**文档结束**

**审批签字栏**：

| 角色 | 姓名 | 日期 | 签名 |
| --- | --- | --- | --- |
| 产品经理 | | | |
| 技术负责人 | | | |
| 安全负责人 | | | |
| 用户代表 | | | |
