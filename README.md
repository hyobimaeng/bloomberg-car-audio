# 彭博中文车载摘要

这个项目会每天自动做 5 件事：

1. 拉取 Bloomberg 公开 RSS。
2. 只基于 RSS 标题和摘要，生成一份中文新闻汇总。
3. 调用 TTS 生成音频。
4. 生成一个可订阅的播客 RSS。
5. 发布成静态站点，让 iPhone `Podcast` 和 CarPlay 直接播放。

它不是微信小程序，而是更适合你这个场景的“私有播客服务”。

## 当前方案

- 数据源：Bloomberg RSS，例如：
  - `https://feeds.bloomberg.com/markets/news.rss`
  - `https://feeds.bloomberg.com/technology/news.rss`
  - `https://feeds.bloomberg.com/politics/news.rss`
- 摘要和语音：OpenAI API
- 托管：GitHub Pages
- 调度：GitHub Actions 每天自动运行
- 播放端：iPhone `Podcast` 通过 URL 订阅，CarPlay 直接可用
- 可选通知：Telegram Bot 推送当天摘要和链接

当前默认部署是“知道 URL 才能访问”的公开链接，不是带密码的真私有播客。对个人使用通常够了，但如果你要严格限制访问，需要后续再换托管方式。

## 目录

- `src/main.mjs`：主入口
- `src/rss.mjs`：RSS 拉取和解析
- `src/openai.mjs`：摘要与 TTS
- `src/site.mjs`：生成 `feed.xml`、HTML、封面图、归档
- `.github/workflows/daily-digest.yml`：每日自动发布

## 需要准备

1. 一个 GitHub 仓库
2. 一个 OpenAI API Key
3. 开启 GitHub Pages，并选择 `GitHub Actions` 作为 Source

## 配置

最少只需要 1 个 secret：

- `OPENAI_API_KEY`

项目默认参数都写在代码里，想改的话可以直接编辑工作流里的环境变量，或者在 Actions 里改 repository variables。

可选环境变量：

- `SITE_URL`
- `PODCAST_TITLE`
- `PODCAST_AUTHOR`
- `TIMEZONE`
- `SUMMARY_MODEL`
- `TTS_MODEL`
- `TTS_VOICE`
- `LOOKBACK_HOURS`
- `MAX_ITEMS`
- `BLOOMBERG_FEEDS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_SEND_AUDIO`
- `TELEGRAM_DISABLE_NOTIFICATION`

## GitHub 上怎么用

1. 把这个目录推到一个新的 GitHub 仓库。
2. 在仓库 `Settings -> Secrets and variables -> Actions` 里新增 `OPENAI_API_KEY`。
3. 在仓库 `Settings -> Pages` 里把 Source 设成 `GitHub Actions`。
4. 手动执行一次 `daily-digest` workflow。
5. 首次发布成功后，拿到你的播客地址：

```text
https://YOUR_GITHUB_NAME.github.io/YOUR_REPO_NAME/feed.xml
```

## iPhone 上怎么订阅

在 iPhone 的 `Podcast` App 里选择“通过 URL 关注节目”，填入你的 `feed.xml` 地址。订阅后，新一期音频会出现在节目里，CarPlay 里也能直接打开播放。

## Telegram 可选推送

如果你也想在手机上收到提醒，可以再配置 Telegram：

1. 用 `@BotFather` 创建一个 bot，拿到 `TELEGRAM_BOT_TOKEN`。
2. 给这个 bot 发一条消息。
3. 本地运行下面的命令，拿到你的 `chat_id`：

```powershell
$env:TELEGRAM_BOT_TOKEN="123456:abc"
npm.cmd run telegram:chatid
```

4. 把输出里的 `chat_id` 填进 `TELEGRAM_CHAT_ID`。
5. 在 GitHub 仓库里把这两个值加到 `Secrets and variables -> Actions`。

配置后，workflow 会在 Pages 部署成功后，再给你发一条 Telegram 消息。默认发文字摘要；如果把 `TELEGRAM_SEND_AUDIO` 设成 `true`，还会附带当天音频。

## 本地 git 状态

项目目录已经初始化为本地 git 仓库。当前机器没有安装 `gh`，所以 GitHub 远端仓库需要你在网页上新建，或者你自己装 GitHub CLI 后再连。

## 运行逻辑

- 默认抓最近 24 小时内的条目
- 如果最近条目太少，会自动回退到 feed 中最新的若干条
- 每天只保留一个“当日摘要”节目，重复运行会覆盖当天这一期
- 站点会尽量保留最近 14 期音频和页面

## 合规边界

- 当前实现只使用 RSS 中公开提供的标题、链接、摘要
- 不抓取 Bloomberg 正文页面
- 输出内容是 AI 重新组织后的中文摘要和播报稿

## 本地检查

当前项目没有 npm 依赖，直接执行：

```powershell
npm.cmd run check
```

真正生成内容时需要设置环境变量后执行：

```powershell
$env:OPENAI_API_KEY="sk-..."
$env:SITE_URL="https://YOUR_GITHUB_NAME.github.io/YOUR_REPO_NAME"
npm.cmd run build
```
