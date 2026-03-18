const botToken = process.env.TELEGRAM_BOT_TOKEN || process.argv[2];

if (!botToken) {
  console.error("Usage: TELEGRAM_BOT_TOKEN=... npm.cmd run telegram:chatid");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`, {
  headers: {
    "Content-Type": "application/json"
  }
});

const data = await response.json().catch(() => null);
if (!response.ok || !data?.ok) {
  const reason = data?.description || `${response.status} ${response.statusText}`;
  throw new Error(`Telegram getUpdates failed: ${reason}`);
}

const chats = new Map();
for (const update of data.result || []) {
  const message = update.message || update.edited_message || update.channel_post || update.edited_channel_post;
  const chat = message?.chat;
  if (!chat?.id) {
    continue;
  }

  chats.set(chat.id, {
    id: chat.id,
    type: chat.type || "unknown",
    title: chat.title || "",
    username: chat.username || "",
    first_name: chat.first_name || "",
    last_name: chat.last_name || ""
  });
}

if (chats.size === 0) {
  console.log("No chats found. Send a message to your bot first, then run this again.");
  process.exit(0);
}

console.log("Found chats:");
for (const chat of chats.values()) {
  const label = [chat.title, chat.first_name, chat.last_name].filter(Boolean).join(" ").trim();
  const handle = chat.username ? `@${chat.username}` : "";
  console.log(JSON.stringify({
    chat_id: chat.id,
    type: chat.type,
    label,
    username: handle
  }));
}
