import { getSetting } from "./settings.js";

const GROQ_API_BASE = "https://api.groq.com/openai/v1";

/**
 * Fetches the list of models this Groq account currently has access to, so
 * the admin can pick a real, working model id from a dropdown instead of
 * guessing one that might have been renamed or deprecated (Groq's lineup
 * changes fairly often). Returns a plain array of model id strings, sorted
 * alphabetically. Throws a plain Error with a message safe to show directly.
 */
export async function listGroqModels(apiKey) {
  if (!apiKey) {
    throw new Error("Save a Groq API key first, then load the model list.");
  }

  let response;
  try {
    response = await fetch(`${GROQ_API_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (err) {
    throw new Error(`Couldn't reach Groq: ${err.message}`);
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("That Groq API key was rejected. Double-check it and save again.");
    }
    throw new Error(`Couldn't load models from Groq (${response.status}).`);
  }

  const data = await response.json();
  const ids = (data.data || []).map((m) => m.id).filter(Boolean);
  return ids.sort((a, b) => a.localeCompare(b));
}

/**
 * Turns a short admin-supplied brief ("reminder about Diwali event on Nov 1,
 * mention it's free for members") into a ready-to-send subject + body for
 * the Members → Send Email dialog. The admin always sees the result in the
 * editable form fields before anything goes out — this only fills in a
 * starting draft, never sends anything itself.
 *
 * The Groq API key and chosen model are both read from the encrypted
 * platform settings table (Admin Console → Settings → AI Email Draft), not
 * from .env, so either can be changed without a server restart. Throws a
 * plain Error with a message safe to show the admin directly if drafting
 * isn't available or fails.
 */
export async function generateEmailDraft({ topic }) {
  const apiKey = await getSetting("groq_api_key");
  if (!apiKey) {
    throw new Error(
      "AI drafting isn't set up yet — add a Groq API key under Admin Console → Settings → AI Email Draft, or just write the email by hand."
    );
  }

  const model = await getSetting("groq_model");
  if (!model) {
    throw new Error(
      "Choose a Groq model under Admin Console → Settings → AI Email Draft before drafting (click \"Load models\" to see what's available on your account)."
    );
  }

  if (!topic?.trim()) {
    throw new Error("Describe what the email should say first.");
  }

  const systemPrompt = `You draft short community-newsletter emails for Kutumb, an Indian community
organisation in Australia. Given a brief from an admin, write a warm, concise
email to members. Respond with ONLY a JSON object and nothing else — no
preamble, no markdown code fences — in exactly this shape:
{"subject": "...", "message": "..."}
The "message" field should be plain text (no HTML), using blank lines
between paragraphs. Do not include a greeting like "Dear members," followed
by a signature — the app already adds a footer, so end the message body
itself right after the main content. Keep it genuinely short: 2-4 short
paragraphs at most.`;

  let response;
  try {
    response = await fetch(`${GROQ_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        // Groq supports OpenAI-style JSON mode - asks the model to return
        // a bare JSON object, backing up the same instruction in the prompt.
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: topic.trim() },
        ],
      }),
    });
  } catch (err) {
    throw new Error(`Couldn't reach the AI drafting service: ${err.message}`);
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errBody = await response.json();
      detail = errBody?.error?.message || "";
    } catch {
      // ignore - use status text below
    }
    if (response.status === 401) {
      throw new Error("The Groq API key is invalid or expired. Check it under Admin Console → Settings.");
    }
    if (response.status === 404) {
      throw new Error(
        `The model "${model}" isn't available on this Groq account anymore. Pick a different one under Admin Console → Settings → AI Email Draft.`
      );
    }
    throw new Error(`AI drafting failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }

  const data = await response.json();
  const text = (data.choices?.[0]?.message?.content || "").trim();

  let parsed;
  try {
    // Model is instructed to return raw JSON, but strip code fences defensively
    // in case it wraps the answer anyway.
    const cleaned = text.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("AI drafting returned an unexpected response. Please try again or write the email by hand.");
  }

  if (!parsed?.subject || !parsed?.message) {
    throw new Error("AI drafting returned an incomplete draft. Please try again or write the email by hand.");
  }

  return { subject: String(parsed.subject).trim(), message: String(parsed.message).trim() };
}
