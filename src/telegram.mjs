const TELEGRAM_API_BASE = "https://api.telegram.org";

export async function sendTelegramDigest({
  botToken,
  chatId,
  podcastTitle,
  feedUrl,
  episode,
  timeZone = "Asia/Shanghai",
  disableNotification = false,
  sendAudio = false
}) {
  const text = buildDigestMessage({ podcastTitle, feedUrl, episode, timeZone });

  await callTelegramApi({
    botToken,
    method: "sendMessage",
    payload: {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_notification: disableNotification,
      link_preview_options: {
        is_disabled: true
      }
    }
  });

  if (!sendAudio || !episode.audioUrl) {
    return;
  }

  await callTelegramApi({
    botToken,
    method: "sendAudio",
    payload: {
      chat_id: chatId,
      audio: episode.audioUrl,
      caption: buildAudioCaption({ podcastTitle, episode, feedUrl }),
      parse_mode: "HTML",
      disable_notification: true,
      performer: podcastTitle,
      title: episode.title
    }
  });
}

export function buildDigestMessage({ podcastTitle, feedUrl, episode, timeZone }) {
  const lines = [];
  const dateText = formatLocalDate(episode.publishedAt, timeZone);

  lines.push(`<b>${escapeHtml(podcastTitle)}</b>`);
  lines.push(escapeHtml(dateText));
  lines.push("");
  lines.push(escapeHtml(episode.summary));

  const highlights = Array.isArray(episode.digest?.stories) ? episode.digest.stories.slice(0, 3) : [];
  if (highlights.length > 0) {
    lines.push("");
    for (const [index, story] of highlights.entries()) {
      lines.push(`${index + 1}. ${escapeHtml(story.headline)}`);
    }
  }

  lines.push("");
  lines.push(`<a href="${escapeAttribute(episode.pageUrl)}">\u6253\u5f00\u672c\u671f</a> | <a href="${escapeAttribute(episode.audioUrl)}">\u97f3\u9891</a> | <a href="${escapeAttribute(feedUrl)}">\u64ad\u5ba2 RSS</a>`);

  return truncateTelegramText(lines.join("\n"), 4096);
}

function buildAudioCaption({ podcastTitle, episode, feedUrl }) {
  const lines = [
    `<b>${escapeHtml(podcastTitle)}</b>`,
    escapeHtml(episode.title),
    "",
    escapeHtml(episode.summary),
    "",
    `<a href="${escapeAttribute(episode.pageUrl)}">\u6253\u5f00\u9875\u9762</a> | <a href="${escapeAttribute(feedUrl)}">\u8ba2\u9605 RSS</a>`
  ];

  return truncateTelegramText(lines.join("\n"), 1024);
}

async function callTelegramApi({ botToken, method, payload }) {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const reason = data?.description || `${response.status} ${response.statusText}`;
    throw new Error(`Telegram ${method} failed: ${reason}`);
  }

  return data.result;
}

function formatLocalDate(isoString, timeZone) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone
  }).format(new Date(isoString));
}

function truncateTelegramText(value, limit) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}\u2026`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}
