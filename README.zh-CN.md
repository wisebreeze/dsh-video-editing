<div align="center">

# dsh-video-editing

**在 DSH 右侧边栏添加视频剪辑入口：检测 FFmpeg，一键下载安装并显示真实下载进度，完成后显示已安装的 FFmpeg 版本。**

[![DSH](https://img.shields.io/badge/DSH-0.2.2--rc.1%2B-4d6bfe)](https://www.npmjs.com/package/@deepseek-ai/dsh)
[![Better Sidebar](https://img.shields.io/badge/dsh--better--sidebar-compatible-4d6bfe)](https://github.com/omdsh-dev/DSH-better-sidebar)
[![Version](https://img.shields.io/badge/version-0.1.0-informational)](./package.json)
[![Platform](https://img.shields.io/badge/platform-Windows-0078d4)](#平台说明)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

[English](./README.md) · 简体中文 · [繁體中文](./README.zh-TW.md)

</div>

## 功能简介

本插件在 DSH 右侧边栏添加一个 **视频剪辑** 页面。打开后会自动检测本机是否已安装 FFmpeg；未安装时提供一键安装：下载静态构建包并显示 **真实字节进度条**，随后校验、解压，最后进入一个只显示 **FFmpeg 版本** 的空白页面。

目前还没有剪辑界面——本插件负责入口、工具链检测与安装流程，让后续的剪辑功能可以建立在已就绪的 FFmpeg 之上。

## 主要特性

- **同时兼容两种右侧边栏** —— 官方右栏（`ctx.sidebarRightTabs`）与 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)（`ctx.betterSidebar`）。两者同时安装时以 dsh-better-sidebar 为唯一入口，不会出现重复入口。
- **自动检测** —— 依次探测「本插件已安装的二进制 → 插件数据目录 → 常见安装位置 → `PATH`」中的 `ffmpeg -version`。
- **一键安装** —— 流式下载并显示「已下载 / 总量 / 百分比」，随后校验、解压并试运行。
- **完成页** —— 只显示 FFmpeg 版本与二进制路径。

## 兼容性

| 右侧边栏环境 | 注册方式 |
| --- | --- |
| 仅官方右栏 | `ctx.sidebarRightTabs.register` + `sidebar.right.pane.tab` 槽位 |
| 仅 dsh-better-sidebar | `ctx.betterSidebar.registerTab` |
| 两者同时安装 | 只使用 dsh-better-sidebar（它会将入口桥接进官方右栏） |
| 两者都没有 | 插件保持静默，不会报错 |

## 数据与路径

下载的二进制保存在插件自己的数据目录，**不会**写入 profile 目录，也**不会**修改 `cordis.patch.yml`：

```
$DSH_HOME/plugin-data/video-editing/
├── bin/ffmpeg.exe
└── downloads/*.zip   （安装成功后删除）
```

## Host 服务与路由

服务 `ctx.videoEditing`：

| 方法 | 说明 |
| --- | --- |
| `detect(signal?)` | 探测 FFmpeg，返回 `{ installed, version, command, sources }` |
| `version(signal?)` | 仅返回版本字符串 |
| `start(sourceId?)` | 开始一次安装并立即返回 `{ jobId }` |
| `progress(jobId)` | 读取某次安装的实时进度 |
| `cancel(jobId)` | 取消某次安装 |

页面通过本插件自己的免认证路由读取数据，因此任何传输方式都能观察到正在进行的下载：

```
GET  /video-editing/runtime/info
GET  /video-editing/runtime/detect
GET  /video-editing/runtime/progress?jobId=…
POST /video-editing/runtime/start
POST /video-editing/runtime/cancel
```

## 平台说明

目前仅 Windows 配置了自动下载源（gyan.dev 的 `release-essentials` 静态构建）。其它平台上页面会提示手动安装 FFmpeg，安装后点击 **重新检测** 即可。

## 安装

```sh
dsh plugin --profile <profile> add dsh-video-editing
```

也可以在插件管理器中以本地目录安装本包。

## 许可证

MIT
