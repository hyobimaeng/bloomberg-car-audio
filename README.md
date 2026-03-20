# 彭博中文车载摘要

现在这套仓库已经改成“本地模型版”：

1. 你的 Windows 电脑本地拉 Bloomberg RSS。
2. 用本机 Ollama 模型做中文摘要。
3. 用 Windows 本地中文语音先生成 wav。
4. 用 FFmpeg 转成 mp3。
5. 生成两条自建 RSS：
   - `dist/feed.xml`：中文短版
   - `dist/feed-cn-plus.xml`：中文加长版
6. 把 `dist/` 提交并推到 GitHub，GitHub Pages 自动发布。
7. iPhone `Podcast` 订阅对应 RSS，CarPlay 直接播放。

这条路不需要 OpenAI API key，但你的电脑需要在每天任务运行时可用。

## 当前架构

- 数据源：Bloomberg RSS
- 摘要：本机 `Ollama`
- 语音：Windows 本地 `SAPI`
- 转码：`FFmpeg`
- 发布：本机生成后推送到 GitHub，GitHub Pages 只负责托管静态结果
- 播放：iPhone `Podcast` / CarPlay
- 可选提醒：Telegram Bot

## 依赖

这台机器我已经装好了：

- `Ollama`
- `qwen2.5:3b`
- `FFmpeg`
- `GitHub CLI`

## 关键文件

- `src/main.mjs`：主入口
- `src/ollama.mjs`：本地模型摘要
- `src/windows-audio.mjs`：Windows 中文语音 + mp3 转码
- `scripts/export-speech.ps1`：本地语音导出
- `scripts/run-local-digest.ps1`：每天本机执行的总脚本
- `.github/workflows/daily-digest.yml`：只负责把现成的 `dist/` 发布到 GitHub Pages

## 环境变量

参考 `.env.example`，最关键的是：

- `SITE_URL`
- `SUMMARY_PROVIDER=ollama`
- `SPEECH_PROVIDER=windows`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `TTS_VOICE`
- `FFMPEG_PATH`

Telegram 可选：

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_SEND_AUDIO`
- `TELEGRAM_DISABLE_NOTIFICATION`

## 本地运行

手动跑一次：

```powershell
$env:SITE_URL="https://hyobimaeng.github.io/bloomberg-car-audio"
node src/main.mjs
```

一键生成并推送：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-local-digest.ps1
```

## 计划任务建议

先在仓库根目录放好 `.env`，然后可以直接注册：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-task.ps1
```

默认会创建一个每天 `07:20` 的任务，并自动带上这些设置：

- 如果错过计划时间，尽快运行
- 如果任务失败，自动重试 3 次
- 使用当前 Windows 账号运行

如果你想改时间：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-task.ps1 -Time 07:50
```

这样即使你早上没开机，后面开机也可以补跑；中途重启也不影响，只要当天能成功跑完一次。你不需要整天开着电脑，只要计划时间之后某个时点开机并登录，这个任务就会补执行。

## iPhone 播放

发布成功后的地址是：

- 站点：`https://hyobimaeng.github.io/bloomberg-car-audio/`
- 中文短版 RSS：`https://hyobimaeng.github.io/bloomberg-car-audio/feed.xml`
- 中文加长版 RSS：`https://hyobimaeng.github.io/bloomberg-car-audio/feed-cn-plus.xml`
- Daybreak 中文摘要版 RSS：`https://hyobimaeng.github.io/bloomberg-car-audio/feed-daybreak-cn.xml`
- The Deal 中文摘要版 RSS：`https://hyobimaeng.github.io/bloomberg-car-audio/feed-the-deal-cn.xml`
- Big Take 中文摘要版 RSS：`https://hyobimaeng.github.io/bloomberg-car-audio/feed-big-take-cn.xml`
- Bloomberg Daybreak 原版 RSS：`https://omny.fm/shows/bloomberg-daybreak/playlists/podcast.rss`
- Bloomberg News Now 原版 RSS：`https://omny.fm/shows/bloomberg-news-now/playlists/podcast.rss`
- The Deal 原版 RSS：`https://omny.fm/shows/the-deal-with-alex-rodriguez-and-jason-kelly/playlists/podcast.rss`
- Big Take 原版 RSS：`https://omny.fm/shows/the-big-take/playlists/podcast.rss`

在 iPhone 的 `Podcast` App 里选择“通过 URL 关注节目”，填入对应 RSS 即可。

## Telegram 可选推送

如果你也想在手机上收到提醒：

1. 用 `@BotFather` 创建 bot，拿到 `TELEGRAM_BOT_TOKEN`。
2. 给 bot 发一条消息。
3. 本地运行：

```powershell
$env:TELEGRAM_BOT_TOKEN="123456:abc"
npm.cmd run telegram:chatid
```

4. 把输出里的 `chat_id` 填进 `TELEGRAM_CHAT_ID`。

## 合规边界

- 当前实现只使用 RSS 中公开提供的标题、链接、摘要
- 不抓取 Bloomberg 正文页面
- 输出内容是本地模型重新组织后的中文摘要和播报稿
