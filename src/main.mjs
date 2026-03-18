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

async function main() {
  await loadDotEnv(projectRoot);
  const config = readConfig();
  const podcast = buildPodcastMeta(config);
  const now = new Date();
  const dateKey = formatDateKey(now, config.timezone);
  const outDir = path.join(projectRoot, "dist");
  const feedUrl = absoluteUrl(config.siteUrl, "feed.xml");

  await fs.rm(outDir, { recursive: true, force: true });
  await ensureDir(path.join(outDir, "episodes"));

  const previousEpisodes = (await fetchExistingArchive(config.siteUrl, config.archiveLimit))
    .filter((episode) => episode.id !== `daily-${dateKey}`)
    .slice(0, config.archiveLimit - 1);
  const hydratedEpisodes = await rehydratePreviousAudio(previousEpisodes, outDir, config.siteUrl);

  const stories = await fetchLatestStories({
    feeds: config.feeds,
    lookbackHours: config.lookbackHours,
    maxItems: config.maxItems
  });

  const digest = await buildDigest({ config, stories, now });
  const audioBuffer = await buildAudio({ config, digest });

  const latestEpisode = buildEpisode({
    config,
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
    fs.writeFile(path.join(outDir, "feed.xml"), renderFeedXml({ podcast, episodes: archiveEpisodes, feedUrl }), "utf8"),
    fs.writeFile(path.join(outDir, "archive.json"), JSON.stringify(archiveJson, null, 2), "utf8"),
    fs.writeFile(
      path.join(outDir, "index.html"),
      renderIndexHtml({ podcast, feedUrl, latestEpisode, archive: archiveEpisodes }),
      "utf8"
    ),
    fs.writeFile(path.join(outDir, "artwork.png"), buildArtworkPngBuffer()),
    fs.writeFile(path.join(outDir, ".nojekyll"), "", "utf8")
  ]);

  console.log(`Built ${archiveEpisodes.length} podcast episode(s) into ${outDir}`);
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

function buildPodcastMeta(config) {
  return {
    title: config.podcastTitle,
    author: config.podcastAuthor,
    description: "\u6bcf\u5929\u81ea\u52a8\u66f4\u65b0\u7684 Bloomberg \u516c\u5f00 RSS \u4e2d\u6587\u6458\u8981\uff0c\u9002\u5408 iPhone \u548c CarPlay \u64ad\u653e\u3002",
    language: "zh-CN",
    timezone: config.timezone,
    siteUrl: config.siteUrl,
    artworkUrl: absoluteUrl(config.siteUrl, "artwork.png")
  };
}

function buildEpisode({ config, now, dateKey, digest, stories, audioBytes }) {
  const audioPath = `episodes/${dateKey}.mp3`;
  const pagePath = `episodes/${dateKey}.html`;
  const jsonPath = `episodes/${dateKey}.json`;
  const title = digest.episode_title || `${config.podcastTitle} ${dateKey}`;
  const summary = digest.episode_summary || digest.lead || "\u4eca\u65e5\u8981\u95fb\u6458\u8981";

  return {
    id: `daily-${dateKey}`,
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

async function fetchExistingArchive(siteUrl, archiveLimit) {
  try {
    const response = await fetch(absoluteUrl(siteUrl, "archive.json"), {
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

async function buildDigest({ config, stories, now }) {
  if (config.summaryProvider === "openai") {
    if (!config.openAiApiKey) {
      throw new Error("OPENAI_API_KEY is required when SUMMARY_PROVIDER=openai");
    }

    return createOpenAiDigest({
      apiKey: config.openAiApiKey,
      model: config.summaryModel,
      stories,
      timezone: config.timezone,
      now
    });
  }

  return createOllamaDigest({
    baseUrl: config.ollamaBaseUrl,
    model: config.ollamaModel,
    stories,
    timezone: config.timezone,
    now
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
