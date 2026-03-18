const DEFAULT_BASE_URL = "http://127.0.0.1:11434";

export async function createDigest({
  baseUrl = DEFAULT_BASE_URL,
  model,
  stories,
  timezone,
  now
}) {
  const payload = {
    model,
    stream: false,
    format: "json",
    options: {
      temperature: 0.2
    },
    messages: [
      {
        role: "system",
        content: [
          "You are a Chinese morning news audio editor.",
          "Return only valid JSON.",
          "Use Simplified Chinese for all user-facing strings.",
          "Never invent facts beyond the supplied Bloomberg RSS items."
        ].join(" ")
      },
      {
        role: "user",
        content: buildPrompt({ stories, timezone, now })
      }
    ]
  };

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const content = data.message?.content || data.response || "";
  const digest = parseDigestJson(content);

  if (!digest.audio_script) {
    throw new Error("Ollama digest response did not contain audio_script.");
  }

  return normalizeDigest(digest, stories);
}

function buildPrompt({ stories, timezone, now }) {
  const schema = {
    episode_title: "string",
    episode_summary: "string",
    lead: "string",
    stories: [
      {
        headline: "string",
        summary: "string",
        why_it_matters: "string"
      }
    ],
    closing: "string",
    audio_script: "string"
  };

  const storyPayload = stories.map((story, index) => ({
    rank: index + 1,
    title: story.title,
    description: story.description,
    source_feed: story.sourceFeed,
    published_at: story.publishedAt,
    link: story.link
  }));

  return [
    "Create a daily Chinese Bloomberg digest from the supplied RSS items.",
    "Requirements:",
    "- Focus on the most important stories only.",
    "- Use concise Simplified Chinese.",
    "- The audio_script must be a single natural narration block, suitable for 2-4 minutes of speech.",
    "- Return JSON only, with no markdown fences.",
    "",
    `timezone: ${timezone}`,
    `generated_at: ${now.toISOString()}`,
    "",
    "JSON shape:",
    JSON.stringify(schema, null, 2),
    "",
    "RSS items:",
    JSON.stringify(storyPayload, null, 2)
  ].join("\n");
}

function parseDigestJson(content) {
  const text = String(content || "").trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  const candidate = firstBrace >= 0 && lastBrace >= firstBrace
    ? text.slice(firstBrace, lastBrace + 1)
    : text;

  return JSON.parse(candidate);
}

function normalizeDigest(digest, stories) {
  return {
    episode_title: String(digest.episode_title || "彭博中文车载摘要"),
    episode_summary: String(digest.episode_summary || digest.lead || "今日要闻摘要"),
    lead: String(digest.lead || digest.episode_summary || ""),
    stories: Array.isArray(digest.stories) && digest.stories.length > 0
      ? digest.stories.slice(0, Math.min(8, stories.length || 8)).map((story) => ({
          headline: String(story.headline || ""),
          summary: String(story.summary || ""),
          why_it_matters: String(story.why_it_matters || "")
        }))
      : stories.slice(0, 5).map((story) => ({
          headline: story.title,
          summary: story.description || story.title,
          why_it_matters: "这是当天值得关注的公开 Bloomberg RSS 条目。"
        })),
    closing: String(digest.closing || "以上是今天的彭博中文车载摘要。"),
    audio_script: String(digest.audio_script || "")
  };
}
