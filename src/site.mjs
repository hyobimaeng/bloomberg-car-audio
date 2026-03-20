import { deflateSync } from "node:zlib";

export function renderFeedXml({ podcast, episodes, feedUrl }) {
  const lastBuildDate = episodes[0]?.publishedAt
    ? new Date(episodes[0].publishedAt).toUTCString()
    : new Date().toUTCString();

  const items = episodes.map((episode) => renderFeedItem(episode)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(podcast.title)}</title>
    <link>${escapeXml(podcast.siteUrl)}</link>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>
    <description>${escapeXml(podcast.description)}</description>
    <language>${escapeXml(podcast.language)}</language>
    <generator>Bloomberg Car Audio Digest</generator>
    <lastBuildDate>${escapeXml(lastBuildDate)}</lastBuildDate>
    <itunes:author>${escapeXml(podcast.author)}</itunes:author>
    <itunes:summary>${escapeXml(podcast.description)}</itunes:summary>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <itunes:image href="${escapeXml(podcast.artworkUrl)}"/>
${items}
  </channel>
</rss>
`;
}

export function renderIndexHtml({ siteTitle, siteDescription, timezone, customShows, officialShows }) {
  const customCards = customShows.map((show) => renderCustomShowCard(show, timezone)).join("");
  const officialCards = officialShows.map((show) => renderOfficialShowCard(show)).join("");
  const archiveSections = customShows.map((show) => renderArchiveSection(show, timezone)).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(siteTitle)}</title>
  <meta name="description" content="${escapeHtml(siteDescription)}">
  <style>
    :root {
      --bg: #09111b;
      --card: rgba(255, 255, 255, 0.07);
      --line: rgba(255, 255, 255, 0.12);
      --text: #f5f7fb;
      --muted: #b7c0ce;
      --accent: #ffd166;
      --accent-2: #6ee7b7;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
      background:
        radial-gradient(circle at top right, rgba(110, 231, 183, 0.18), transparent 25%),
        radial-gradient(circle at left center, rgba(255, 209, 102, 0.14), transparent 30%),
        linear-gradient(180deg, #09111b 0%, #0f1d2d 100%);
      color: var(--text);
      line-height: 1.6;
    }
    main {
      max-width: 980px;
      margin: 0 auto;
      padding: 40px 20px 72px;
    }
    .hero {
      display: grid;
      gap: 24px;
      grid-template-columns: 180px 1fr;
      align-items: center;
      margin-bottom: 32px;
    }
    .hero img {
      width: 180px;
      height: 180px;
      border-radius: 28px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
    }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 24px;
      backdrop-filter: blur(18px);
    }
    h1, h2 { margin: 0 0 12px; }
    p { margin: 0 0 12px; color: var(--muted); }
    audio { width: 100%; margin: 12px 0 8px; }
    a { color: var(--accent); text-decoration: none; }
    code { font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace; font-size: 13px; }
    ul { padding-left: 20px; margin: 0; }
    li { margin-bottom: 14px; }
    .meta { color: var(--accent-2); }
    .grid {
      display: grid;
      gap: 20px;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      margin-top: 20px;
    }
    .tiny { font-size: 14px; color: var(--muted); }
    .url {
      display: block;
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.04);
      color: var(--text);
      overflow-wrap: anywhere;
    }
    @media (max-width: 720px) {
      .hero { grid-template-columns: 1fr; }
      .hero img { width: 132px; height: 132px; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <img src="artwork.png" alt="${escapeHtml(siteTitle)}">
      <div>
        <div class="tiny">每日自动更新 / 适合早晨通勤和车载播放 / 自建中文 + 官方英文</div>
        <h1>${escapeHtml(siteTitle)}</h1>
        <p>${escapeHtml(siteDescription)}</p>
        <p>下面一共放了 4 条可听内容，其中 2 条是你自己的 RSS，2 条是 Bloomberg 官方原版 RSS。</p>
      </div>
    </section>

    <section class="grid">
      ${customCards}
    </section>

    <section class="card" style="margin-top: 20px;">
      <h2>官方原版订阅</h2>
      <div class="grid">
        ${officialCards}
      </div>
    </section>

    <section class="grid">
      ${archiveSections}
    </section>
  </main>
</body>
</html>
`;
}

export function renderEpisodeHtml({ podcast, episode, feedUrl }) {
  const stories = episode.digest.stories
    .map(
      (story) => `
        <li>
          <strong>${escapeHtml(story.headline)}</strong>
          <p>${escapeHtml(story.summary)}</p>
          <p class="meta">${escapeHtml(story.why_it_matters)}</p>
        </li>`
    )
    .join("");

  const sources = episode.sources
    .map(
      (story) => `
        <li>
          <a href="${escapeHtml(story.link)}" target="_blank" rel="noreferrer">${escapeHtml(story.title)}</a>
        </li>`
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(episode.title)}</title>
  <meta name="description" content="${escapeHtml(episode.summary)}">
  <style>
    body {
      margin: 0;
      font-family: "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
      background: #0c1420;
      color: #f5f7fb;
      line-height: 1.65;
    }
    main {
      max-width: 840px;
      margin: 0 auto;
      padding: 36px 20px 64px;
    }
    a { color: #ffd166; text-decoration: none; }
    .card {
      background: #111b29;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px;
      padding: 24px;
      margin-top: 20px;
    }
    h1, h2 { margin: 0 0 12px; }
    p { margin: 0 0 12px; color: #b7c0ce; }
    .meta { color: #6ee7b7; }
    audio { width: 100%; margin: 12px 0 8px; }
    ul { padding-left: 20px; margin: 0; }
    li { margin-bottom: 14px; }
  </style>
</head>
<body>
  <main>
    <p><a href="../index.html">返回首页</a> · <a href="${escapeHtml(feedUrl)}">RSS</a></p>
    <h1>${escapeHtml(episode.title)}</h1>
    <p>${escapeHtml(episode.summary)}</p>
    <div class="card">
      <audio controls preload="none" src="${escapeHtml(relativeToEpisode(episode.audioPath))}"></audio>
      <p>${escapeHtml(episode.digest.lead)}</p>
      <ul>${stories}</ul>
      <p class="meta">${escapeHtml(episode.digest.closing)}</p>
    </div>
    <div class="card">
      <h2>原始 RSS 条目</h2>
      <ul>${sources}</ul>
    </div>
  </main>
</body>
</html>
`;
}

export function buildArtworkPngBuffer(width = 1400, height = 1400) {
  const raw = Buffer.alloc((width * 4 + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;

    for (let x = 0; x < width; x += 1) {
      const index = rowStart + 1 + x * 4;
      const xRatio = x / (width - 1);
      const yRatio = y / (height - 1);

      let r = Math.round(12 + 24 * (1 - yRatio) + 210 * yRatio);
      let g = Math.round(18 + 60 * xRatio + 55 * yRatio);
      let b = Math.round(45 + 90 * (1 - xRatio) - 15 * yRatio);

      const bandA = Math.abs(x - width * 0.28) < width * 0.03;
      const bandB = Math.abs(x - width * 0.72) < width * 0.03;
      const bandC = Math.abs(y - height * 0.64) < height * 0.04;
      if (bandA || bandB) {
        r = 255;
        g = 209;
        b = 102;
      }
      if (bandC) {
        r = 110;
        g = 231;
        b = 183;
      }
      if (x > width * 0.12 && x < width * 0.88 && y > height * 0.12 && y < height * 0.88) {
        r = Math.min(255, r + 12);
        g = Math.min(255, g + 8);
      }

      raw[index] = r;
      raw[index + 1] = g;
      raw[index + 2] = b;
      raw[index + 3] = 255;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function renderFeedItem(episode) {
  return `    <item>
      <title>${escapeXml(episode.title)}</title>
      <link>${escapeXml(episode.pageUrl)}</link>
      <guid isPermaLink="false">${escapeXml(episode.id)}</guid>
      <pubDate>${escapeXml(new Date(episode.publishedAt).toUTCString())}</pubDate>
      <description><![CDATA[${renderDescriptionHtml(episode)}]]></description>
      <content:encoded><![CDATA[${renderDescriptionHtml(episode)}]]></content:encoded>
      <itunes:summary>${escapeXml(episode.summary)}</itunes:summary>
      <enclosure url="${escapeXml(episode.audioUrl)}" length="${episode.audioBytes}" type="${escapeXml(episode.audioMime)}"/>
    </item>`;
}

function renderDescriptionHtml(episode) {
  const sections = episode.digest.stories
    .map(
      (story) =>
        `<p><strong>${escapeHtml(story.headline)}</strong>：${escapeHtml(story.summary)} ${escapeHtml(story.why_it_matters)}</p>`
    )
    .join("");
  return `<p>${escapeHtml(episode.summary)}</p>${sections}`;
}

function relativeToEpisode(sitePath) {
  return sitePath.split("/").pop() || sitePath;
}

function formatLocalDate(isoString, timezone) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone
  }).format(new Date(isoString));
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(value) {
  return escapeXml(value);
}

function renderCustomShowCard(show, timezone) {
  const latestEpisode = show.latestEpisode;
  const highlights = latestEpisode.digest.stories
    .slice(0, 4)
    .map(
      (story) => `
        <li>
          <strong>${escapeHtml(story.headline)}</strong>
          <p>${escapeHtml(story.summary)}</p>
          <p class="meta">${escapeHtml(story.why_it_matters)}</p>
        </li>`
    )
    .join("");

  return `
    <article class="card">
      <div class="tiny">${escapeHtml(show.badge)} · ${escapeHtml(formatLocalDate(latestEpisode.publishedAt, timezone))}</div>
      <h2>${escapeHtml(show.podcast.title)}</h2>
      <p>${escapeHtml(show.podcast.description)}</p>
      <p>
        <a href="${escapeHtml(show.feedUrl)}">RSS 订阅</a>
        ·
        <a href="${escapeHtml(latestEpisode.pagePath)}">本期页面</a>
      </p>
      <code class="url">${escapeHtml(show.feedUrl)}</code>
      <audio controls preload="none" src="${escapeHtml(latestEpisode.audioPath)}"></audio>
      <p>${escapeHtml(latestEpisode.summary)}</p>
      <ul>${highlights}</ul>
      <p class="tiny">音频由 AI 语音生成；摘要仅基于公开 RSS 条目，不代表 Bloomberg 立场。</p>
    </article>`;
}

function renderOfficialShowCard(show) {
  return `
    <article class="card">
      <div class="tiny">${escapeHtml(show.badge)}</div>
      <h2>${escapeHtml(show.title)}</h2>
      <p>${escapeHtml(show.description)}</p>
      <p>
        <a href="${escapeHtml(show.feedUrl)}">RSS 订阅</a>
        ·
        <a href="${escapeHtml(show.websiteUrl)}" target="_blank" rel="noreferrer">官网页面</a>
      </p>
      <code class="url">${escapeHtml(show.feedUrl)}</code>
    </article>`;
}

function renderArchiveSection(show, timezone) {
  const archiveLinks = show.archiveEpisodes
    .slice(0, 6)
    .map(
      (episode) => `
        <li>
          <a href="${escapeHtml(episode.pagePath)}">${escapeHtml(episode.title)}</a>
          <span>${escapeHtml(formatLocalDate(episode.publishedAt, timezone))}</span>
        </li>`
    )
    .join("");

  return `
    <section class="card">
      <h2>${escapeHtml(show.podcast.title)} 往期归档</h2>
      <ul>${archiveLinks}</ul>
    </section>`;
}
