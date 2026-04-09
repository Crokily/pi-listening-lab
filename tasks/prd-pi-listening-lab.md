# PRD: Pi Listening Lab

## Introduction
Pi Listening Lab 是一个基于 Next.js 的英语听力练习网站。用户可以直接和一个嵌入网站中的 pi agent 对话，自由讨论自己想练习的英语场景、难度、角色、口音、语速和关键词语料，不依赖预设 workflow。Agent 仍然保留 pi 的默认 coding-agent 能力（bash/read/write/edit），并额外获得一个调用 Kokoro-FastAPI 的 TTS 工具，用于在用户选定语料后直接生成并播放音频。

## Goals
- 提供一个可用的 Web 聊天界面，让用户能和 pi agent 连续对话
- 使用 pi-mono 的 `@mariozechner/pi-coding-agent` SDK 嵌入 agent session
- 新增一个 Kokoro-FastAPI TTS 工具，让 agent 可按需合成英语语料音频
- 让网页内可直接播放 agent 生成的音频
- 提供清晰的本地运行说明，便于连接现成的 Kokoro-FastAPI 服务

## User Stories

### US-001: 项目基础与会话骨架
As a learner, I want a stable web app foundation and a persistent pi conversation session, so that I can start talking to the agent immediately.

Acceptance Criteria:
- Next.js App Router 项目已配置好基础元信息、首页框架和必要依赖
- 服务端封装了 pi session 创建逻辑，并能为新用户会话分配唯一 sessionId
- 提供创建会话和发送消息的 API 骨架，能够返回可用响应
- 会话工作目录与应用数据目录隔离，便于 agent 使用默认工具
- Typecheck / lint passes

### US-002: pi agent + Kokoro TTS 工具
As a learner, I want the embedded pi agent to be able to synthesize selected corpus into speech, so that I can practice listening directly in the website.

Acceptance Criteria:
- 服务端使用 `createAgentSession()` 创建 pi agent，并保留默认 coding tools
- 新增一个 TTS custom tool，调用 Kokoro-FastAPI OpenAI-compatible speech endpoint
- TTS 工具会保存生成的音频，并返回可被网页播放的 URL 与元数据
- 聊天接口能把 agent 文本回复和新生成音频一起返回给前端
- 对 Kokoro 未配置或请求失败的情况给出友好错误信息
- Typecheck / lint passes

### US-003: 听力练习聊天 UI
As a learner, I want an intuitive chat interface with audio cards, so that I can discuss corpus and listen to the generated material in one place.

Acceptance Criteria:
- 首页包含产品介绍、聊天记录区、输入框和发送状态反馈
- 前端可创建 session、发送消息、展示 assistant / user 对话
- 前端能展示 agent 生成的音频卡片，并支持网页内播放
- 提供 Kokoro voice 选择与推荐提示词，帮助用户开始对话
- Verify in browser
- Typecheck / lint passes

### US-004: 部署与使用说明
As a developer, I want clear setup documentation, so that I can run the site with pi auth and Kokoro-FastAPI quickly.

Acceptance Criteria:
- README 说明项目目标、技术栈、环境变量、启动方式
- 提供 `.env.example`，说明 pi / Kokoro 所需配置
- 提供本地联调 Kokoro-FastAPI 的建议方式（包括 docker 示例）
- 说明当前限制与后续可扩展方向
- Typecheck / lint passes

## Functional Requirements
- 使用 Next.js + React + TypeScript 实现网站
- 使用 pi-mono 的 `@mariozechner/pi-coding-agent` SDK 在服务端创建 agent session
- 保留 pi 默认 coding tools，并新增 `synthesize_speech` 工具
- TTS 默认通过 `KOKORO_BASE_URL` 指向 Kokoro-FastAPI 服务
- 前端需要在一次消息交互后同时接收文本结果和生成音频列表
- 会话需支持至少单进程内持续存在的连续聊天
- 音频文件应通过 Next.js route handler 安全暴露，而不是直接暴露磁盘路径

## Non-Goals
- 不实现复杂的用户登录/账户系统
- 不实现多租户数据库持久化
- 不实现课程编排或固定步骤式 workflow
- 不对 pi 做额外预设流程控制，只提供轻量场景引导

## Technical Considerations
- Next.js API Route / Route Handler 需使用 Node runtime，避免 Edge 环境与 pi SDK 冲突
- `@mariozechner/pi-coding-agent` 依赖 Node 文件系统与本地状态，需放在 server-only 代码中
- 自定义 TTS 工具需要处理音频存储、文件命名与返回元数据
- 建议使用全局单例 session store，避免开发环境热更新导致重复初始化
- 需要兼容 pi 现有 authStorage / modelRegistry 机制，优先复用当前机器已有登录或 API key

## Success Metrics
- 用户可以在首页创建会话并与 pi agent 连续对话
- 用户可以要求 agent 为选定语料调用 TTS 并在页面内播放音频
- 本地开发环境下 `npm run lint`、`npm run typecheck`、`npm run build` 通过
- README 足够让开发者在 10 分钟内完成本地启动
