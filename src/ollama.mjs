const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DIGEST_VARIANTS = {
  bulletin: {
    maxStories: 3,
    minStories: 1,
    minAudioChars: 140,
    storyInstruction: "Pick 1 to 3 stories and stay tightly focused on the biggest developments only.",
    audioInstruction:
      "The audio_script must be a single natural narration block, around 160-320 Simplified Chinese characters, suitable for about 1 minute of speech."
  },
  standard: {
    maxStories: 5,
    minStories: 3,
    minAudioChars: 0,
    storyInstruction: "Pick 3 to 5 stories.",
    audioInstruction: "The audio_script must be a single natural narration block, suitable for 2-4 minutes of speech."
  },
  extended: {
    maxStories: 6,
    minStories: 5,
    minAudioChars: 420,
    storyInstruction: "Pick 5 to 6 stories and add a bit more context to each one.",
    audioInstruction:
      "The audio_script must be a single natural narration block, around 450-700 Simplified Chinese characters, suitable for about 2-3 minutes of speech."
  }
};

export async function createDigest({
  baseUrl = DEFAULT_BASE_URL,
  model,
  stories,
  timezone,
  now,
  variant = "standard"
}) {
  const variantConfig = DIGEST_VARIANTS[variant] || DIGEST_VARIANTS.standard;
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
        content: buildPrompt({ stories, timezone, now, variantConfig })
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

  return normalizeDigest(digest, stories, variantConfig);
}

function buildPrompt({ stories, timezone, now, variantConfig }) {
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
    `- ${variantConfig.storyInstruction}`,
    `- ${variantConfig.audioInstruction}`,
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

function normalizeDigest(digest, stories, variantConfig) {
  const fallbackStories = buildFallbackStories(stories, variantConfig.maxStories);
  const normalizedStories = ensureStoryCount(
    Array.isArray(digest.stories) && digest.stories.length > 0
      ? digest.stories.slice(0, variantConfig.maxStories).map((story) => ({
          headline: String(story.headline || ""),
          summary: String(story.summary || ""),
          why_it_matters: String(story.why_it_matters || "")
        }))
      : [],
    fallbackStories,
    variantConfig.maxStories
  );

  const normalized = {
    episode_title: String(digest.episode_title || "彭博中文车载摘要"),
    episode_summary: String(digest.episode_summary || digest.lead || "今日要闻摘要"),
    lead: String(digest.lead || digest.episode_summary || ""),
    stories: normalizedStories,
    closing: String(digest.closing || "以上是今天的彭博中文车载摘要。"),
    audio_script: String(digest.audio_script || "")
  };

  normalized.audio_script = ensureAudioScriptLength(normalized, variantConfig.minAudioChars);
  return normalized;
}

function buildFallbackStories(stories, limit) {
  return {
    stories: stories.slice(0, limit).map((story) => ({
      headline: story.title,
      summary: story.description || story.title,
      why_it_matters: "这是当天值得关注的公开 Bloomberg RSS 条目。"
    }))
  }.stories;
}

function ensureStoryCount(digestStories, fallbackStories, maxStories) {
  const selected = [];
  const seen = new Set();

  for (const story of digestStories) {
    const key = `${story.headline}|${story.summary}`;
    if (!story.headline || seen.has(key)) {
      continue;
    }

    seen.add(key);
    selected.push(story);
  }

  for (const story of fallbackStories) {
    if (selected.length >= maxStories) {
      break;
    }

    const key = `${story.headline}|${story.summary}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    selected.push(story);
  }

  return selected.slice(0, maxStories);
}

function ensureAudioScriptLength(digest, minAudioChars) {
  const audioScript = String(digest.audio_script || "").trim();
  if (!minAudioChars || audioScript.length >= minAudioChars) {
    return audioScript;
  }

  const segments = [];
  if (digest.lead) {
    segments.push(ensureSentence(digest.lead));
  }

  for (let index = 0; index < digest.stories.length; index += 1) {
    const story = digest.stories[index];
    segments.push(
      `第${index + 1}条，${ensureSentence(story.headline)}${ensureSentence(story.summary)}这条消息为什么重要？${ensureSentence(story.why_it_matters)}`
    );
  }

  if (digest.closing) {
    segments.push(ensureSentence(digest.closing));
  }

  let expanded = segments.join("");
  if (expanded.length < minAudioChars) {
    expanded += "综合来看，今天的重点依然集中在地缘政治、市场波动和企业基本面，这些线索很可能继续影响接下来的交易情绪和资产定价。";
  }

  return expanded;
}

function ensureSentence(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  return /[。！？.!?]$/u.test(text) ? text : `${text}。`;
}
