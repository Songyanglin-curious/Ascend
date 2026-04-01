# Ascend SourceCode

这是一个保持 1.0 冻结边界的最小可运行版本。

当前已经收口到这些范围：
- 源码直跑
- 最小 CLI
- 最小 DeepSeek 接入
- 最小测试

## 运行

```bash
npm start
```

会执行 `runtime/demo.mjs`，展示最小 demo 和主链路结果。

## 测试

```bash
npm test
```

会执行 `runtime/spec.mjs`，验证最小内核、上层主链、DeepSeek 接入，以及 CLI 命令级回归。

## CLI 主入口

```bash
npm run cli -- init
npm run cli -- reset
npm run cli -- status
npm run cli -- show-state
npm run cli -- nodes
npm run cli -- node <nodeId>
npm run cli -- step
npm run cli -- step-ai
npm run cli -- step-draft
npm run cli -- new-node
npm run cli -- focus-node
npm run cli -- finish
npm run cli -- finish-ai
npm run cli
```

## CLI 兼容别名

```bash
npm run cli -- list-nodes
npm run cli -- show-node <nodeId>
npm run cli -- ai-step
npm run cli -- ai-step --dry-run
npm run cli -- ai-draft
npm run cli -- finish-node
npm run cli -- finish-node --ai
npm run cli -- ai-finish
```

## 落盘说明

- 状态文件固定落盘到 `runtime/.ascend-cli-state.json`
- 会改写状态文件的命令：`init`、`reset`、`new-node`、`focus-node`、`step`、`step-ai`、`finish`、`finish-ai`
- `step-draft`、`ai-step --dry-run`、`ai-draft` 只预览，不落盘
- 只读取状态文件的命令：`status`、`show-state`、`nodes`、`node`
- `step` 和 `step-ai` 都会把本轮记录追加到 `stepRecords`，不会覆盖历史
- `show-state` 会直接打印完整 JSON，包括 `stepRecords` 历史

## DeepSeek

- 配置文件位置：`runtime/.ascend-llm.config.json`
- 默认配置项：`provider`、`baseURL`、`model`、`apiKeyEnv`、`apiKey`
- 默认 provider：`deepseek`
- API key 优先读取环境变量 `DEEPSEEK_API_KEY`
- 如果环境变量为空，再回退到配置文件里的 `apiKey`
- `step-ai` 和 `finish-ai` 通过 Node 内置 `fetch` 调用 `https://api.deepseek.com/chat/completions`

## 说明

- 运行、测试和 CLI 都使用 Node 的 `--experimental-strip-types` 直接执行 `src/`
- 仓库当前不需要额外依赖安装

## 文档

- [人工测试用例](docs/55-人工测试用例.md)
- [完成进度记录](docs/56-完成进度记录.md)
