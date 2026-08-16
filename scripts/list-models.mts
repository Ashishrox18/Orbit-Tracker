/**
 * Lists the models your Groq key can actually reach, and checks which of them
 * support tool/JSON responses well enough for this app.
 *
 *     npm run groq:models
 *
 * Model availability on the free tier changes; this asks rather than assumes.
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const key = process.env.GROQ_API_KEY;
if (!key || key.startsWith("gsk_PASTE")) {
  console.error("GROQ_API_KEY is not set in .env.local. Paste your key there first.");
  process.exit(1);
}

const res = await fetch("https://api.groq.com/openai/v1/models", {
  headers: { Authorization: `Bearer ${key}` },
});

if (!res.ok) {
  console.error(`Groq returned ${res.status}. Check the key is valid.`);
  process.exit(1);
}

const body = (await res.json()) as { data?: { id: string; owned_by?: string }[] };
const models = (body.data ?? []).map((m) => m.id).sort();

const chat = models.filter((id) => !/whisper|tts|guard|embed/i.test(id));
const audio = models.filter((id) => /whisper|tts/i.test(id));

console.log(`\n${chat.length} chat models available:\n`);
for (const id of chat) console.log(`  ${id}`);

if (audio.length) {
  console.log(`\n${audio.length} audio models (not used by this app):\n`);
  for (const id of audio) console.log(`  ${id}`);
}

const current = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
console.log(`\nGROQ_MODEL is currently: ${current}`);
console.log(
  chat.includes(current)
    ? "That model is available on your account.\n"
    : "WARNING: that model is NOT in the list above. Set GROQ_MODEL in .env.local to one of them.\n",
);
