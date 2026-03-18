const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export async function createDigest({ apiKey, model, stories, timezone, now }) {
  const payload = {
    model,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "bloomberg_daily_digest",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: [
            "episode_title",
            "episode_summary",
            "lead",
            "stories",
            "closing",
            "audio_script"
          ],
          properties: {
            episode_title: { type: "string" },
            episode_summary: { type: "string" },
            lead: { type: "string" },
            stories: {
              type: "array",
              minItems: 1,
              maxItems: 8,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["headline", "summary", "why_it_matters"],
                properties: {
                  headline: { type: "string" },
                  summary: { type: "string" },
                  why_it_matters: { type: "string" }
                }
              }
            },
            closing: { type: "string" },
            audio_script: { type: "string" }
          }
        }
      }
    },
    messages: [
      {
        role: "system",
        content: [
          "你是彭博新闻中文播客编辑。",
          "你的任务是基于输入的 RSS 标题和摘要，产出适合早晨通勤收听的简体中文新闻简报。",
          "不要虚构新闻事实，不要写出输入中没有的信息，不要写成长篇评论。",
          "语言风格要克制、清楚、适合车载播报。",
          "audio_script 必须是一段可以直接送进 TTS 的自然中文播报稿，控制在 500 到 900 个汉字之间。"
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            timezone,
            generated_at: now.toISOString(),
            instructions: {
              story_count: Math.min(stories.length, 8),
              audience: "中国用户，早晨通勤时在车上收听",
              style: "简洁，稳重，信息密度高，但不要过快"
            },
            stories: stories.map((story, index) => ({
              rank: index + 1,
              title: story.title,
              description: story.description,
              source_feed: story.sourceFeed,
              published_at: story.publishedAt,
              link: story.link
            }))
          },
          null,
          2
        )
      }
    ]
  };

  const data = await requestJson({
    url: `${DEFAULT_BASE_URL}/chat/completions`,
    apiKey,
    payload
  });

  const choice = data.choices?.[0];
  const refusal = choice?.message?.refusal;
  if (refusal) {
    throw new Error(`OpenAI refused to create digest: ${refusal}`);
  }

  const content = choice?.message?.content;
  const text = Array.isArray(content)
    ? content.map((item) => item.text || "").join("")
    : String(content || "");

  if (!text) {
    throw new Error("OpenAI digest response was empty.");
  }

  return JSON.parse(text);
}

export async function createSpeech({
  apiKey,
  model,
  voice,
  input,
  instructions = "用自然、稳定、清楚的普通话播报，适合车内收听。",
  responseFormat = "mp3"
}) {
  const response = await fetch(`${DEFAULT_BASE_URL}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      voice,
      input: truncateForTts(input),
      instructions,
      response_format: responseFormat
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI speech request failed: ${response.status} ${await response.text()}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function requestJson({ url, apiKey, payload }) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

function truncateForTts(input) {
  const normalized = String(input || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= 3900) {
    return normalized;
  }

  return `${normalized.slice(0, 3880).trim()}。`;
}
