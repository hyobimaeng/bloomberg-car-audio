const DEFAULT_FEEDS = [
  "https://feeds.bloomberg.com/markets/news.rss",
  "https://feeds.bloomberg.com/technology/news.rss",
  "https://feeds.bloomberg.com/politics/news.rss"
];

export { DEFAULT_FEEDS };

export async function fetchLatestStories({
  feeds = DEFAULT_FEEDS,
  lookbackHours = 24,
  maxItems = 8
} = {}) {
  const results = await Promise.allSettled(feeds.map((feedUrl) => fetchFeed(feedUrl)));
  const stories = results
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value);

  if (stories.length === 0) {
    const failures = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason?.message || "Unknown RSS error");
    throw new Error(`Unable to load Bloomberg RSS feeds. ${failures.join(" | ")}`);
  }

  const deduped = dedupeStories(stories).sort((a, b) => b.publishedTs - a.publishedTs);
  const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000;
  const recent = deduped.filter((story) => story.publishedTs >= cutoff);
  const pool = recent.length >= Math.min(maxItems, 4) ? recent : deduped;

  return pool.slice(0, maxItems);
}

async function fetchFeed(feedUrl) {
  const response = await fetch(feedUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; BloombergCarAudio/1.0; +https://github.com)"
    }
  });

  if (!response.ok) {
    throw new Error(`${feedUrl} returned ${response.status}`);
  }

  const xml = await response.text();
  return parseFeed(xml, feedUrl);
}

function parseFeed(xml, sourceUrl) {
  const channelBlock = extractSection(xml, "channel") || xml;
  const channelTitle = cleanXmlText(extractTag(channelBlock, "title")) || sourceUrl;
  const items = [];

  for (const match of channelBlock.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const itemXml = match[0];
    const title = cleanXmlText(extractTag(itemXml, "title"));
    const link = cleanXmlText(extractTag(itemXml, "link"));
    const guid = cleanXmlText(extractTag(itemXml, "guid"));
    const description = cleanXmlText(extractTag(itemXml, "description"));
    const pubDateRaw = cleanXmlText(extractTag(itemXml, "pubDate"));
    const publishedAt = parseDate(pubDateRaw);

    if (!title || !link || !publishedAt) {
      continue;
    }

    items.push({
      id: guid || link,
      title,
      link,
      description,
      sourceFeed: channelTitle,
      publishedAt: publishedAt.toISOString(),
      publishedTs: publishedAt.getTime()
    });
  }

  return items;
}

function dedupeStories(stories) {
  const seen = new Set();
  const output = [];

  for (const story of stories) {
    const key = normalizeLink(story.link) || story.id;
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(story);
  }

  return output;
}

function normalizeLink(link) {
  try {
    const url = new URL(link);
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return link;
  }
}

function extractSection(xml, tagName) {
  const safeTag = escapeRegex(tagName);
  const match = xml.match(new RegExp(`<${safeTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${safeTag}>`, "i"));
  return match ? match[1] : "";
}

function extractTag(xml, tagName) {
  return extractSection(xml, tagName);
}

function cleanXmlText(value) {
  return stripHtml(decodeXmlEntities(value || ""))
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(input) {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decodeXmlEntities(input) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " "
  };

  return input
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (full, name) => named[name.toLowerCase()] ?? full);
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
