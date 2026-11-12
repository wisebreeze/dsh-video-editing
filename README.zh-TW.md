<div align="center">

# dsh-video-editing

**在 DSH 右側邊欄加入影片剪輯入口：偵測 FFmpeg，一鍵下載安裝並顯示真實下載進度，完成後顯示已安裝的 FFmpeg 版本。**

[![DSH](https://img.shields.io/badge/DSH-0.2.2--rc.1%2B-4d6bfe)](https://www.npmjs.com/package/@deepseek-ai/dsh)
[![Better Sidebar](https://img.shields.io/badge/dsh--better--sidebar-compatible-4d6bfe)](https://github.com/omdsh-dev/DSH-better-sidebar)
[![Version](https://img.shields.io/badge/version-0.1.0-informational)](./package.json)
[![Platform](https://img.shields.io/badge/platform-Windows-0078d4)](#平台說明)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

[English](./README.md) · [简体中文](./README.zh-CN.md) · 繁體中文

</div>

## 功能簡介

本外掛在 DSH 右側邊欄加入一個 **影片剪輯** 頁面。開啟後會自動偵測本機是否已安裝 FFmpeg；未安裝時提供一鍵安裝：下載靜態建置包並顯示 **真實位元組進度條**，接著驗證、解壓縮，最後進入一個只顯示 **FFmpeg 版本** 的空白頁面。

目前還沒有剪輯介面——本外掛負責入口、工具鏈偵測與安裝流程，讓後續的剪輯功能可以建立在已就緒的 FFmpeg 之上。

## 主要特性

- **同時相容兩種右側邊欄** —— 官方右欄（`ctx.sidebarRightTabs`）與 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)（`ctx.betterSidebar`）。兩者同時安裝時以 dsh-better-sidebar 為唯一入口，不會出現重複入口。
- **自動偵測** —— 依序偵測「本外掛已安裝的二進位檔 → 外掛資料目錄 → 常見安裝位置 → `PATH`」中的 `ffmpeg -version`。
- **一鍵安裝** —— 串流下載並顯示「已下載 / 總量 / 百分比」，接著驗證、解壓縮並試執行。
- **完成頁** —— 只顯示 FFmpeg 版本與二進位檔路徑。

## 相容性

| 右側邊欄環境 | 註冊方式 |
| --- | --- |
| 僅官方右欄 | `ctx.sidebarRightTabs.register` + `sidebar.right.pane.tab` 插槽 |
| 僅 dsh-better-sidebar | `ctx.betterSidebar.registerTab` |
| 兩者同時安裝 | 只使用 dsh-better-sidebar（它會將入口橋接進官方右欄） |
| 兩者都沒有 | 外掛保持靜默，不會報錯 |

## 資料與路徑

下載的二進位檔保存在外掛自己的資料目錄，**不會**寫入 profile 目錄，也**不會**修改 `cordis.patch.yml`：

```
$DSH_HOME/plugin-data/video-editing/
├── bin/ffmpeg.exe
└── downloads/*.zip   （安裝成功後刪除）
```

## Host 服務與路由

服務 `ctx.videoEditing`：

| 方法 | 說明 |
| --- | --- |
| `detect(signal?)` | 偵測 FFmpeg，回傳 `{ installed, version, command, sources }` |
| `version(signal?)` | 僅回傳版本字串 |
| `start(sourceId?)` | 開始一次安裝並立即回傳 `{ jobId }` |
| `progress(jobId)` | 讀取某次安裝的即時進度 |
| `cancel(jobId)` | 取消某次安裝 |

頁面透過本外掛自己的免認證路由讀取資料，因此任何傳輸方式都能觀察正在進行的下載：

```
GET  /video-editing/runtime/info
GET  /video-editing/runtime/detect
GET  /video-editing/runtime/progress?jobId=…
POST /video-editing/runtime/start
POST /video-editing/runtime/cancel
```


## 平台說明

目前僅 Windows 設定了自動下載來源（gyan.dev 的 `release-essentials` 靜態建置）。其它平台上頁面會提示手動安裝 FFmpeg，安裝後點擊 **重新偵測** 即可。

## 安裝

```sh
dsh plugin --profile <profile> add dsh-video-editing
```

也可以在外掛管理器中以本機目錄安裝本套件。

## 授權

MIT
