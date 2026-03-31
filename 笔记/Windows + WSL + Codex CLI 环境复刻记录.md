
# Windows + WSL + Codex CLI 环境复刻记录

## 1. 目标与路线

目标不是把整套 Ascend 跑起来，而是先把**可稳定复刻的 Codex 本地施工环境**立住。
当前推荐固定路线：

**Windows → WSL2 → Ubuntu → 在 Ubuntu 内安装 Node LTS → 在 Ubuntu 内安装 Codex CLI**

这样选的原因很直接：

* WSL 是微软官方在 Windows 上跑 Linux 开发环境的标准路径，`wsl --install` 是主入口；若命令路径异常，也有手动安装方案。([Microsoft Learn](https://learn.microsoft.com/en-us/windows/wsl/install?utm_source=chatgpt.com "Install WSL | Microsoft Learn"))
* Codex CLI 官方定位就是“在选定目录里读代码、改代码、跑命令”的本地编码代理；官方安装方式是 `npm i -g @openai/codex`，首次运行 `codex` 时登录即可。([OpenAI Developers](https://developers.openai.com/codex/cli/?utm_source=chatgpt.com "CLI – Codex | OpenAI Developers"))
* Codex CLI 和 IDE 扩展都支持 ChatGPT 登录或 API key 登录；如果后面你只走 CLI，本地施工这条线是成立的。([OpenAI Developers](https://developers.openai.com/codex/auth/?utm_source=chatgpt.com "Authentication – Codex | OpenAI Developers"))

## 2. 标准安装步骤

### 第一步：装 WSL2

优先用管理员 PowerShell 执行：

```powershell
wsl --install
```

如果安装链路走商店 / 服务时报错，就改走微软官方手动方式：

```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```

重启后，再执行：

```powershell
wsl --install --inbox --no-distribution
```

这里 `--inbox` 的作用是走 Windows 组件安装，而不是商店通道；`--no-distribution` 是先只装 WSL 本体。([Microsoft Learn](https://learn.microsoft.com/en-us/windows/wsl/install-manual?utm_source=chatgpt.com "Manual installation steps for older versions of WSL | Microsoft Learn"))

### 第二步：装 Ubuntu

WSL 本体就绪后，安装 Ubuntu：

```powershell
wsl --install -d Ubuntu
```

首次启动 Ubuntu 时，设置 Linux 用户名和密码。安装完成后，应能在：

```powershell
wsl -l -v
```

里看到 `Ubuntu`，并且 `VERSION=2`。([Microsoft Learn](https://learn.microsoft.com/en-us/windows/wsl/install?utm_source=chatgpt.com "Install WSL | Microsoft Learn"))

### 第三步：在 Ubuntu 内准备基础开发环境

进入 Ubuntu 后，至少保证有：

* `git`
* `node`
* `npm`

原则只有一条：

**Node/npm 必须是 Ubuntu 自己的，不是借 Windows PATH 的。**

验收方式不是看“装没装”，而是看：

```bash
git --version
node -v
npm -v
which node
which npm
```

其中 `which node`、`which npm` 应指向 Linux 路径，而不是 `/mnt/c/...`。

### 第四步：在 Ubuntu 内安装 Codex CLI

在 Ubuntu 里执行：

```bash
npm i -g @openai/codex
```

安装后执行：

```bash
codex --version
codex
```

首次运行时按提示登录。官方说明里，CLI 安装就是 npm 全局安装，运行命令就是 `codex`。([OpenAI Developers](https://developers.openai.com/codex/cli/?utm_source=chatgpt.com "CLI – Codex | OpenAI Developers"))

## 3. 最小验收标准

一台新机器是否算复刻完成，只看下面 5 条：

1. `wsl --status` 正常返回
2. `wsl -l -v` 能看到 `Ubuntu` 且为 `VERSION 2`
3. Ubuntu 内 `node -v` 和 `npm -v` 正常
4. Ubuntu 内 `which node` / `which npm` 指向 Linux 路径
5. `codex --version` 正常，`codex` 能启动登录界面

满足这 5 条，就说明这台机器具备了进入项目施工的最低条件。

## 4. 常见分叉处理

### A. `wsl --install` 报服务类错误

直接切到手动启用功能 + `--inbox --no-distribution` 路线，不要死磕默认安装入口。微软官方本来就保留了这条手动安装路径。([Microsoft Learn](https://learn.microsoft.com/en-us/windows/wsl/install-manual?utm_source=chatgpt.com "Manual installation steps for older versions of WSL | Microsoft Learn"))

### B. WSL 已装好，但缺内核

先运行：

```powershell
wsl --update
```

若更新后 `wsl --status` 不再报缺失内核，即可继续。微软文档也把内核更新列为 WSL2 的必要步骤之一。([Microsoft Learn](https://learn.microsoft.com/en-us/windows/wsl/install-manual?utm_source=chatgpt.com "Manual installation steps for older versions of WSL | Microsoft Learn"))

### C. Codex ChatGPT 登录报地区限制

Codex CLI 支持 ChatGPT 登录和 API key 登录两条路径；Codex cloud 需要 ChatGPT 登录。
所以如果你后面遇到 ChatGPT 登录受限，CLI 还可以改走 API key，但前提仍然是你的访问来源在 OpenAI 官方支持地区内。([OpenAI Developers](https://developers.openai.com/codex/auth/?utm_source=chatgpt.com "Authentication – Codex | OpenAI Developers"))

## 5. 当前结论

这篇记录只服务一件事：

**把“可在 Windows 上稳定运行 Codex CLI 的 WSL 开发环境”固定下来。**
