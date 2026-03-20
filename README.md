# 彭博中文车载摘要

这是一个本地运行的私有播客生成器：

1. 电脑本地抓取指定 RSS。
2. 用本机 `Ollama` 生成中文摘要。
3. 用 Windows 本地语音导出音频。
4. 用 `FFmpeg` 转成 `mp3`。
5. 生成 `dist/*.xml`、`dist/*.json`、`dist/episodes-*/*.mp3`。
6. 把 `dist/` 推到 GitHub。
7. GitHub Pages 托管这些静态文件，iPhone `Podcasts` / CarPlay 直接订阅对应 RSS。

当前方案不依赖 OpenAI API key。

## 当前状态

- 短版中文 RSS `feed.xml` 已于 `2026-03-20` 停用并删除。
- 目前线上保留 `4` 条自建中文摘要 feed。
- 目前线上保留 `4` 条 Bloomberg 官方英文原版 feed。
- 首页：`https://hyobimaeng.github.io/bloomberg-car-audio/`
- 订阅清单：
  - `https://hyobimaeng.github.io/bloomberg-car-audio/subscriptions.txt`
  - `https://hyobimaeng.github.io/bloomberg-car-audio/subscriptions.json`

## 当前订阅源

### 自建中文摘要

- `彭博 News Now中文摘要`
  - RSS：`https://hyobimaeng.github.io/bloomberg-car-audio/feed-cn-plus.xml`
  - 底层源：官方 `Bloomberg News Now` RSS
- `彭博 Daybreak 中文摘要版`
  - RSS：`https://hyobimaeng.github.io/bloomberg-car-audio/feed-daybreak-cn.xml`
  - 底层源：官方 `Bloomberg Daybreak: US Edition` RSS
- `Bloomberg The Deal 中文摘要版`
  - RSS：`https://hyobimaeng.github.io/bloomberg-car-audio/feed-the-deal-cn.xml`
  - 底层源：官方 `The Deal with Alex Rodriguez and Jason Kelly` RSS
- `Bloomberg Big Take 中文摘要版`
  - RSS：`https://hyobimaeng.github.io/bloomberg-car-audio/feed-big-take-cn.xml`
  - 底层源：官方 `Big Take` RSS

### 官方英文原版

- `Bloomberg Daybreak: US Edition`
  - RSS：`https://omny.fm/shows/bloomberg-daybreak/playlists/podcast.rss`
  - 页面：`https://omny.fm/shows/bloomberg-daybreak`
- `Bloomberg News Now`
  - RSS：`https://omny.fm/shows/bloomberg-news-now/playlists/podcast.rss`
  - 页面：`https://omny.fm/shows/bloomberg-news-now`
- `The Deal with Alex Rodriguez and Jason Kelly`
  - RSS：`https://omny.fm/shows/the-deal-with-alex-rodriguez-and-jason-kelly/playlists/podcast.rss`
  - 页面：`https://omny.fm/shows/the-deal-with-alex-rodriguez-and-jason-kelly`
- `Big Take`
  - RSS：`https://omny.fm/shows/the-big-take/playlists/podcast.rss`
  - 页面：`https://omny.fm/shows/the-big-take`

## 当前架构

- 摘要模型：本机 `Ollama`
- 当前模型：`qwen2.5:3b`
- 语音：Windows `SAPI`
- 转码：`FFmpeg`
- 发布：本机生成后推 GitHub，Pages 只负责托管 `dist/`
- 播放：iPhone `Podcasts` / CarPlay
- 可选提醒：Telegram Bot

## 关键文件

- `src/main.mjs`
  - 所有官方英文 feed 常量都在 `OFFICIAL_SUBSCRIPTIONS`
  - 所有自建中文 feed 的定义都在 `buildShowProfiles()`
  - 哪条中文摘要抓哪条英文 RSS，也在 `buildShowProfiles()` 里
- `src/ollama.mjs`
  - 中文摘要 prompt
  - `standard` / `extended` 两种摘要风格
  - 当模型写得太短时的 fallback 扩写逻辑
- `src/windows-audio.mjs`
  - 调 Windows 语音
  - 调 `ffmpeg` 转 mp3
- `scripts/export-speech.ps1`
  - 本地语音导出脚本
- `scripts/run-local-digest.ps1`
  - 每天本机执行总脚本
  - 负责生成、提交、推送
- `scripts/register-task.ps1`
  - 注册 Windows 计划任务
- `dist/subscriptions.txt`
  - 当前线上订阅入口的纯文本清单
- `dist/subscriptions.json`
  - 当前线上订阅入口的 JSON 清单

## 环境变量

参考 `.env.example`，最关键的是：

- `SITE_URL`
- `PODCAST_TITLE_EXTENDED`
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

直接生成：

```powershell
node src/main.mjs
```

生成并推送：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-local-digest.ps1
```

## 计划任务

注册默认每日任务：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-task.ps1
```

默认设置：

- 每天 `07:20`
- 如果错过计划时间，尽快运行
- 如果任务失败，自动重试 `3` 次
- 使用当前 Windows 账号运行

修改时间：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-task.ps1 -Time 07:50
```

注意：

- 不需要整天开机。
- 但任务要运行时，电脑最好是“开机并登录”状态。
- 中途关机或重启通常没问题，任务会补跑。

## iPhone / Podcasts 使用

在 iPhone `Podcasts` App 里选择“通过 URL 关注节目”，填入上面的任意 RSS 即可。

如果某条 feed 改了显示名但手机上没刷新：

- 先等客户端自动刷新
- 还不行就取消订阅，再用同一个 URL 重新订阅

## 以后怎么新增一个 URL

如果以后还要继续加新的英文原版和对应中文摘要，按这个顺序做：

1. 在 `src/main.mjs` 的 `OFFICIAL_SUBSCRIPTIONS` 里加官方英文原版链接。
2. 在 `src/main.mjs` 的 `buildShowProfiles()` 里加对应中文摘要 profile。
3. 给这个 profile 配：
   - `title`
   - `description`
   - `feedFile`
   - `archiveFile`
   - `episodeDir`
   - `feeds`
   - `lookbackHours`
   - `maxItems`
   - `digestVariant`
4. 运行：

```powershell
node src/main.mjs
```

5. 检查：
   - `dist/subscriptions.txt`
   - `dist/index.html`
   - 新的 `dist/feed-*.xml`
6. 提交并推送：

```powershell
git add -A
git commit -m "Add new feed"
git push origin main
```

## 以后怎么改名字

如果只是改某条 feed 的显示名，不改 URL：

- 改 `src/main.mjs` 里对应 profile 的 `title`
- 或者改 `.env` / `.env.example` 里对应的标题变量
- 然后重新运行 `node src/main.mjs`

## 已知限制

- 当前实现只用 RSS 里公开的标题、链接、描述
- 不抓取 Bloomberg 正文页面
- 也不抓取播客全文 transcript
- 因为只看 RSS 摘要，不同 feed 在大新闻日里仍然可能会有题材重合
- 本地小模型会把不同来源压成比较像的中文播报腔，这属于当前方案的自然限制

## 合规边界

- 当前实现只使用 RSS 中公开提供的标题、链接、摘要
- 不抓取 Bloomberg 正文页面
- 输出内容是本地模型重新组织后的中文摘要和播报稿
