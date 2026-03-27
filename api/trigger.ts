import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { taskId, payload } = req.body ?? {};
  const API_KEY = process.env.TRIGGER_API_KEY;

  if (!taskId || !payload) {
    return res.status(400).json({ ok: false, error: "Missing taskId or payload" });
  }
  if (!API_KEY) {
    return res.status(500).json({ ok: false, error: "Trigger API key not configured" });
  }

  try {
    const r = await fetch(`https://api.trigger.dev/api/v1/tasks/${taskId}/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ payload }),
    });
    const text = await r.text();
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, status: r.status, body: text });
    }
    try {
      const data = text ? JSON.parse(text) : {};
      return res.status(200).json({ ok: true, data });
    } catch {
      return res.status(200).json({ ok: true });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
}
