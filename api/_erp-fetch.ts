const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const RATE_LIMITED_MARKER = "ERP_RATE_LIMITED";
const MAX_RATE_LIMIT_RETRIES = 3;

export const fetchErpWithRetry = async (
  input: string | URL,
  init?: RequestInit,
): Promise<Response> => {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(input, init);

    if (response.status !== 429) return response;

    await response.text().catch(() => "");

    if (attempt >= MAX_RATE_LIMIT_RETRIES) {
      throw new Error(RATE_LIMITED_MARKER);
    }

    const retryAfter = Number(response.headers.get("retry-after"));
    const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);

    await sleep(backoffMs);
  }
};
