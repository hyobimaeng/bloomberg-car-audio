import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

import { createDigest as createOllamaDigest } from "./ollama.mjs";
import { createDigest as createOpenAiDigest, createSpeech as createOpenAiSpeech } from "./openai.mjs";
import { DEFAULT_FEEDS, fetchLatestStories } from "./rss.mjs";
import { buildArtworkPngBuffer, renderEpisodeHtml, renderFeedXml, renderIndexHtml } from "./site.mjs";
import { createSpeech as createWindowsSpeech } from "./windows-audio.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const OFFICIAL_SUBSCRIPTIONS = [
  {
    id: "daybreak-us",
    badge: "官方英文 / Bloomberg Daybreak",
    title: "Bloomberg Daybreak: US Edition",
    description: "Bloomberg 官方早间原版节目，通常约 15 分钟，适合完整通勤收听。",
    feedUrl: "https://omny.fm/shows/bloomberg-daybreak/playlists/podcast.rss",
    websiteUrl: "https://omny.fm/shows/bloomberg-daybreak"
  },
  {
    id: "news-now",
    badge: "官方英文 / Bloomberg News Now",
    title: "Bloomberg News Now",
    description: "Bloomberg 官方英文快讯，更新更频繁，每期通常几分钟。",
    feedUrl: "https://omny.fm/shows/bloomberg-news-now/playlists/podcast.rss",
    websiteUrl: "https://omny.fm/shows/bloomberg-news-now"
  },
  {
    id: "the-deal",
    badge: "官方英文 / The Deal",
    title: "The Deal with Alex Rodriguez and Jason Kelly",
    description: "Bloomberg 官方访谈节目，聚焦交易、品牌、企业家与资本故事。",
    feedUrl: "https://omny.fm/shows/the-deal-with-alex-rodriguez-and-jason-kelly/playlists/podcast.rss",
    websiteUrl: "https://omny.fm/shows/the-deal-with-alex-rodriguez-and-jason-kelly"
  },
  {
    id: "the-big-take",
    badge: "官方英文 / The Big Take",
    title: "Big Take",
    description: "Bloomberg 官方英文深度节目，更强调宏观主题、背景脉络和单题解释。",
    feedUrl: "https://omny.fm/shows/the-big-take/playlists/podcast.rss",
    websiteUrl: "https://omny.fm/shows/the-big-take"
  }
];
const OFFICIAL_FEEDS = Object.fromEntries(OFFICIAL_SUBSCRIPTIONS.map((show) => [show.id, show]));

async function main() {
  await loadDotEnv(projectRoot);
  const config = readConfig();
  const now = new Date();
  const dateKey = formatDateKey(now, config.timezone);
  const outDir = path.join(projectRoot, "dist");
  const showProfiles = buildShowProfiles(config);
  const storiesCache = new Map();

  await fs.rm(outDir, { recursive: true, force: true });
  await ensureDir(outDir);

  const customShows = [];

  for (const profile of showProfiles) {
    const stories = await getStoriesForProfile({ config, profile, cache: storiesCache });
    const podcast = buildPodcastMeta(config, profile);
    const feedUrl = absoluteUrl(config.siteUrl, profile.feedFile);
    const previousEpisodes = (await fetchExistingArchive(absoluteUrl(config.siteUrl, profile.archiveFile), config.archiveLimit))
      .filter((episode) => episode.id !== profile.episodeId(dateKey))
      .slice(0, config.archiveLimit - 1);
    const hydratedEpisodes = await rehydratePreviousAudio(previousEpisodes, outDir, config.siteUrl);
    const digest = await buildDigest({ config, stories, now, profile });
    const audioBuffer = await buildAudio({ config, digest });
    const latestEpisode = buildEpisode({
      config,
      profile,
      now,
      dateKey,
      digest,
      stories,
      audioBytes: audioBuffer.length
    });

    const archiveEpisodes = [latestEpisode, ...hydratedEpisodes]
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, config.archiveLimit);

    for (const episode of archiveEpisodes) {
      await writeEpisodeAssets({
        outDir,
        episode,
        podcast,
        feedUrl,
        audioBuffer: episode.id === latestEpisode.id ? audioBuffer : null
      });
    }

    const archiveJson = {
      generatedAt: now.toISOString(),
      latestEpisodeId: latestEpisode.id,
      feedUrl,
      podcast,
      episodes: archiveEpisodes
    };

    await Promise.all([
      fs.writeFile(
        path.join(outDir, profile.feedFile),
        renderFeedXml({ podcast, episodes: archiveEpisodes, feedUrl }),
        "utf8"
      ),
      fs.writeFile(path.join(outDir, profile.archiveFile), JSON.stringify(archiveJson, null, 2), "utf8")
    ]);

    customShows.push({
      id: profile.id,
      badge: profile.badge,
      podcast,
      feedUrl,
      latestEpisode,
      archiveEpisodes
    });
  }

  const subscriptions = buildSubscriptionCatalog({ customShows, generatedAt: now.toISOString() });
  await Promise.all([
    fs.writeFile(
      path.join(outDir, "index.html"),
      renderIndexHtml({
        siteTitle: "彭博通勤播客订阅",
        siteDescription:
          "这里集中放了多条自建中文 RSS 和 Bloomberg 官方英文原版 RSS，方便 iPhone Podcasts 与 CarPlay 直接订阅。",
        timezone: config.timezone,
        customShows,
        officialShows: OFFICIAL_SUBSCRIPTIONS
      }),
      "utf8"
    ),
    fs.writeFile(path.join(outDir, "subscriptions.json"), JSON.stringify(subscriptions, null, 2), "utf8"),
    fs.writeFile(path.join(outDir, "subscriptions.txt"), renderSubscriptionText(subscriptions), "utf8"),
    fs.writeFile(path.join(outDir, "artwork.png"), buildArtworkPngBuffer()),
    fs.writeFile(path.join(outDir, ".nojekyll"), "", "utf8")
  ]);

  console.log(`Built ${customShows.length} podcast feed(s) into ${outDir}`);
}

async function loadDotEnv(rootDir) {
  const envFile = path.join(rootDir, ".env");

  let content;
  try {
    content = await fs.readFile(envFile, "utf8");
  } catch {
    return;
  }

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const delimiterIndex = line.indexOf("=");
    if (delimiterIndex <= 0) {
      continue;
    }

    const key = line.slice(0, delimiterIndex).trim();
    let value = line.slice(delimiterIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function readConfig() {
  const feedsFromEnv = splitList(process.env.BLOOMBERG_FEEDS);
  const summaryProvider = process.env.SUMMARY_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "ollama");
  const speechProvider = process.env.SPEECH_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "windows");

  return {
    siteUrl: requiredEnv("SITE_URL"),
    openAiApiKey: process.env.OPENAI_API_KEY || "",
    feeds: feedsFromEnv.length ? feedsFromEnv : DEFAULT_FEEDS,
    timezone: process.env.TIMEZONE || "Asia/Shanghai",
    podcastTitle: process.env.PODCAST_TITLE || "\u5f6d\u535a\u4e2d\u6587\u8f66\u8f7d\u6458\u8981",
    podcastTitleExtended: process.env.PODCAST_TITLE_EXTENDED || "\u5f6d\u535a News Now\u4e2d\u6587\u6458\u8981",
    podcastAuthor: process.env.PODCAST_AUTHOR || "Bloomberg Car Audio",
    summaryProvider,
    speechProvider,
    summaryModel: process.env.SUMMARY_MODEL || "gpt-4o-mini",
    ttsModel: process.env.TTS_MODEL || "gpt-4o-mini-tts",
    ttsVoice: process.env.TTS_VOICE || "Microsoft Huihui Desktop",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    ollamaModel: process.env.OLLAMA_MODEL || "qwen2.5:3b",
    powershellPath:
      process.env.POWERSHELL_PATH || "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    ffmpegPath: process.env.FFMPEG_PATH || "",
    lookbackHours: parseNumber(process.env.LOOKBACK_HOURS, 24),
    maxItems: parseNumber(process.env.MAX_ITEMS, 8),
    archiveLimit: 14
  };
}

function buildShowProfiles(config) {
  return [
    {
      id: "cn-plus",
      badge: "AI 中文加长版",
      title: config.podcastTitleExtended,
      description:
        "\u57fa\u4e8e Bloomberg News Now \u5b98\u65b9 RSS \u751f\u6210\u7684\u4e2d\u6587\u6458\u8981\uff0c\u8986\u76d6\u66f4\u591a\u91cd\u70b9\uff0c\u9002\u5408\u66f4\u957f\u901a\u52e4\u6536\u542c\u3002",
      feedFile: "feed-cn-plus.xml",
      archiveFile: "archive-cn-plus.json",
      episodeDir: "episodes-cn-plus",
      digestVariant: "extended",
      feeds: [OFFICIAL_FEEDS["news-now"].feedUrl],
      lookbackHours: 72,
      maxItems: 4,
      episodeId(dateKey) {
        return `daily-cn-plus-${dateKey}`;
      }
    },
    {
      id: "daybreak-cn",
      badge: "AI Daybreak 中文版",
      title: "\u5f6d\u535a Daybreak \u4e2d\u6587\u6458\u8981\u7248",
      description:
        "\u57fa\u4e8e Bloomberg Daybreak \u539f\u7248 RSS \u751f\u6210\u7684\u4e2d\u6587\u52a0\u957f\u6458\u8981\uff0c\u9002\u5408\u60f3\u8981\u8ddf\u4e0a Daybreak \u4f46\u4e0d\u60f3\u76f4\u63a5\u542c\u82f1\u6587\u539f\u7248\u7684\u901a\u52e4\u573a\u666f\u3002",
      feedFile: "feed-daybreak-cn.xml",
      archiveFile: "archive-daybreak-cn.json",
      episodeDir: "episodes-daybreak-cn",
      digestVariant: "extended",
      feeds: [OFFICIAL_FEEDS["daybreak-us"].feedUrl],
      lookbackHours: 72,
      maxItems: 4,
      episodeId(dateKey) {
        return `daily-daybreak-cn-${dateKey}`;
      }
    },
    {
      id: "the-deal-cn",
      badge: "AI The Deal 中文版",
      title: "Bloomberg The Deal 中文摘要版",
      description:
        "\u57fa\u4e8e The Deal \u539f\u7248 RSS \u751f\u6210\u7684\u4e2d\u6587\u52a0\u957f\u6458\u8981\uff0c\u66f4\u504f\u4ea4\u6613\u3001\u54c1\u724c\u3001\u4f01\u4e1a\u5bb6\u548c\u8d44\u672c\u8fd0\u4f5c\u89c6\u89d2\u3002",
      feedFile: "feed-the-deal-cn.xml",
      archiveFile: "archive-the-deal-cn.json",
      episodeDir: "episodes-the-deal-cn",
      digestVariant: "extended",
      feeds: [OFFICIAL_FEEDS["the-deal"].feedUrl],
      lookbackHours: 720,
      maxItems: 3,
      episodeId(dateKey) {
        return `daily-the-deal-cn-${dateKey}`;
      }
    },
    {
      id: "the-big-take-cn",
      badge: "AI Big Take 中文版",
      title: "Bloomberg Big Take 中文摘要版",
      description:
        "\u57fa\u4e8e Big Take \u539f\u7248 RSS \u751f\u6210\u7684\u4e2d\u6587\u52a0\u957f\u6458\u8981\uff0c\u66f4\u9002\u5408\u60f3\u5feb\u901f\u638c\u63e1\u80cc\u666f\u3001\u903b\u8f91\u548c\u5f71\u54cd\u7684\u901a\u52e4\u573a\u666f\u3002",
      feedFile: "feed-big-take-cn.xml",
      archiveFile: "archive-big-take-cn.json",
      episodeDir: "episodes-big-take-cn",
      digestVariant: "extended",
      feeds: [OFFICIAL_FEEDS["the-big-take"].feedUrl],
      lookbackHours: 96,
      maxItems: 4,
      episodeId(dateKey) {
        return `daily-the-big-take-cn-${dateKey}`;
      }
    }
  ];
}

function buildPodcastMeta(config, profile) {
  return {
    title: profile.title,
    author: config.podcastAuthor,
    description: profile.description,
    language: "zh-CN",
    timezone: config.timezone,
    siteUrl: config.siteUrl,
    artworkUrl: absoluteUrl(config.siteUrl, "artwork.png")
  };
}

function buildEpisode({ config, profile, now, dateKey, digest, stories, audioBytes }) {
  const audioPath = `${profile.episodeDir}/${dateKey}.mp3`;
  const pagePath = `${profile.episodeDir}/${dateKey}.html`;
  const jsonPath = `${profile.episodeDir}/${dateKey}.json`;
  const title = digest.episode_title || `${profile.title} ${dateKey}`;
  const summary = digest.episode_summary || digest.lead || "\u4eca\u65e5\u8981\u95fb\u6458\u8981";

  return {
    id: profile.episodeId(dateKey),
    title,
    summary,
    publishedAt: now.toISOString(),
    audioPath,
    audioUrl: absoluteUrl(config.siteUrl, audioPath),
    audioMime: "audio/mpeg",
    audioBytes,
    pagePath,
    pageUrl: absoluteUrl(config.siteUrl, pagePath),
    jsonPath,
    jsonUrl: absoluteUrl(config.siteUrl, jsonPath),
    sources: stories,
    digest
  };
}

async function writeEpisodeAssets({ outDir, episode, podcast, feedUrl, audioBuffer }) {
  const audioFile = path.join(outDir, episode.audioPath);
  const htmlFile = path.join(outDir, episode.pagePath);
  const jsonFile = path.join(outDir, episode.jsonPath);

  await Promise.all([
    ensureDir(path.dirname(audioFile)),
    ensureDir(path.dirname(htmlFile)),
    ensureDir(path.dirname(jsonFile))
  ]);

  if (audioBuffer) {
    await fs.writeFile(audioFile, audioBuffer);
  } else if (!(await fileExists(audioFile))) {
    throw new Error(`Missing archived audio file: ${audioFile}`);
  }

  await Promise.all([
    fs.writeFile(htmlFile, renderEpisodeHtml({ podcast, episode, feedUrl }), "utf8"),
    fs.writeFile(jsonFile, JSON.stringify({ ...episode, podcast }, null, 2), "utf8")
  ]);
}

async function fetchExistingArchive(archiveUrl, archiveLimit) {
  try {
    const response = await fetch(archiveUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; BloombergCarAudio/1.0; +https://github.com)"
      }
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    if (!Array.isArray(data.episodes)) {
      return [];
    }

    return data.episodes.slice(0, archiveLimit);
  } catch {
    return [];
  }
}

async function buildDigest({ config, stories, now, profile }) {
  if (config.summaryProvider === "openai") {
    if (!config.openAiApiKey) {
      throw new Error("OPENAI_API_KEY is required when SUMMARY_PROVIDER=openai");
    }

    return createOpenAiDigest({
      apiKey: config.openAiApiKey,
      model: config.summaryModel,
      stories,
      timezone: config.timezone,
      now,
      variant: profile.digestVariant
    });
  }

  return createOllamaDigest({
    baseUrl: config.ollamaBaseUrl,
    model: config.ollamaModel,
    stories,
    timezone: config.timezone,
    now,
    variant: profile.digestVariant
  });
}

async function buildAudio({ config, digest }) {
  if (config.speechProvider === "openai") {
    if (!config.openAiApiKey) {
      throw new Error("OPENAI_API_KEY is required when SPEECH_PROVIDER=openai");
    }

    return createOpenAiSpeech({
      apiKey: config.openAiApiKey,
      model: config.ttsModel,
      voice: config.ttsVoice,
      input: digest.audio_script
    });
  }

  return createWindowsSpeech({
    text: digest.audio_script,
    voice: config.ttsVoice,
    workDir: projectRoot,
    powershellPath: config.powershellPath,
    ffmpegPath: config.ffmpegPath
  });
}

async function rehydratePreviousAudio(episodes, outDir, siteUrl) {
  const hydrated = [];

  for (const episode of episodes) {
    if (!episode.audioPath || !episode.digest || !Array.isArray(episode.sources)) {
      continue;
    }

    const targetFile = path.join(outDir, episode.audioPath);
    const audioUrl = episode.audioUrl || absoluteUrl(siteUrl, episode.audioPath);

    await ensureDir(path.dirname(targetFile));

    try {
      const response = await fetch(audioUrl, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; BloombergCarAudio/1.0; +https://github.com)"
        }
      });

      if (!response.ok) {
        continue;
      }

      await fs.writeFile(targetFile, Buffer.from(await response.arrayBuffer()));
      hydrated.push(episode);
    } catch {
      continue;
    }
  }

  return hydrated;
}

async function getStoriesForProfile({ config, profile, cache }) {
  const feeds = profile.feeds || config.feeds;
  const lookbackHours = profile.lookbackHours || config.lookbackHours;
  const maxItems = profile.maxItems || config.maxItems;
  const cacheKey = `${feeds.join("|")}::${lookbackHours}::${maxItems}`;

  if (!cache.has(cacheKey)) {
    cache.set(
      cacheKey,
      fetchLatestStories({
        feeds,
        lookbackHours,
        maxItems
      })
    );
  }

  return cache.get(cacheKey);
}

function buildSubscriptionCatalog({ customShows, generatedAt }) {
  return {
    generatedAt,
    subscriptions: [
      ...customShows.map((show) => ({
        id: show.id,
        type: "custom",
        badge: show.badge,
        title: show.podcast.title,
        description: show.podcast.description,
        feedUrl: show.feedUrl,
        latestEpisodeUrl: show.latestEpisode.pageUrl
      })),
      ...OFFICIAL_SUBSCRIPTIONS.map((show) => ({
        id: show.id,
        type: "official",
        badge: show.badge,
        title: show.title,
        description: show.description,
        feedUrl: show.feedUrl,
        websiteUrl: show.websiteUrl
      }))
    ]
  };
}

function renderSubscriptionText(catalog) {
  return catalog.subscriptions
    .map((show, index) => {
      const extraUrl = show.latestEpisodeUrl || show.websiteUrl || "";
      const extraLabel = show.latestEpisodeUrl ? "Latest" : show.websiteUrl ? "Website" : "";
      return [
        `${index + 1}. ${show.title}`,
        `Type: ${show.type}`,
        `Feed: ${show.feedUrl}`,
        extraLabel ? `${extraLabel}: ${extraUrl}` : "",
        `Description: ${show.description}`
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumber(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function absoluteUrl(baseUrl, relativePath) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(relativePath.replace(/^\//, ""), normalizedBase).toString();
}

function formatDateKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
