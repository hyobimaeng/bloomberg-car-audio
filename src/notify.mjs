import path from "node:path";
import { promises as fs } from "node:fs";
import { pathToFileURL } from "node:url";

import { sendTelegramDigest } from "./telegram.mjs";

export async function runNotification() {
  const archiveFile = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.resolve(process.cwd(), "dist/archive.json");
  const raw = await fs.readFile(archiveFile, "utf8");
  const archive = JSON.parse(raw);
  const latestEpisode = archive.episodes?.[0];

  if (!latestEpisode) {
    throw new Error(`No episode found in ${archiveFile}`);
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.log("Telegram env vars not set; skipping notification.");
    return;
  }

  await sendTelegramDigest({
    botToken,
    chatId,
    podcastTitle: archive.podcast?.title || "Bloomberg Car Audio",
    feedUrl: archive.feedUrl,
    episode: latestEpisode,
    timeZone: archive.podcast?.timezone || process.env.TIMEZONE || "Asia/Shanghai",
    disableNotification: parseBoolean(process.env.TELEGRAM_DISABLE_NOTIFICATION),
    sendAudio: parseBoolean(process.env.TELEGRAM_SEND_AUDIO)
  });

  console.log(`Telegram notification sent for ${latestEpisode.id}`);
}

function parseBoolean(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  runNotification().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
