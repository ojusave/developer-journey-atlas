const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 60_000;

function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

/**
 * Chat confirmer: picks 0–3 reason IDs from an allowlisted candidate set.
 */
export class OpenRouterLinkConfirmer {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    if (!apiKey) throw new Error("OpenRouterLinkConfirmer requires OPENROUTER_API_KEY.");
    if (!model) throw new Error("OpenRouterLinkConfirmer requires OPENROUTER_MODEL.");
  }

  async confirmLinks(input: {
    gateText: string;
    candidates: Array<{ id: string; label: string; similarity: number }>;
  }): Promise<unknown> {
    const candidateBlock = input.candidates
      .map((c, i) => `${i + 1}. ${c.id} (sim=${c.similarity.toFixed(3)}): ${c.label}`)
      .join("\n");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://developer-journey-atlas.onrender.com",
          "X-Title": "Developer Journey Atlas",
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You link documented onboarding friction to blocker hypothesis IDs. " +
                "Return JSON only: {\"reason_ids\":[\"U00.01\"],\"rationale\":\"...\"}. " +
                "Pick 0 to 3 ids strictly from the candidate list. Never invent ids. " +
                "These are hypotheses, not proven drop-off causes. Prefer [] when unsure.",
            },
            {
              role: "user",
              content:
                `Documented friction:\n${input.gateText}\n\nCandidates:\n${candidateBlock}\n\n` +
                "Return JSON with reason_ids subset of the candidate ids.",
            },
          ],
        }),
        signal: controller.signal,
      });
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? `OpenRouter chat HTTP ${res.status}`);
      const raw = body.choices?.[0]?.message?.content ?? "";
      return JSON.parse(stripFences(raw));
    } finally {
      clearTimeout(timer);
    }
  }
}
