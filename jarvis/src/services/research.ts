/**
 * Web research integration point. No search provider is bundled: on claude.ai the page cannot
 * reach the internet, and on the standalone site a search API key would have to live on a server.
 *
 * To enable live research, deploy a small server endpoint that holds the search API key in an
 * environment variable (e.g. SEARCH_API_KEY) and returns {title, url, snippet}[]; then set
 * VITE_SEARCH_ENDPOINT at build time to that endpoint's URL. The key never reaches the browser.
 */
export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

export type WebSearchResponse = { available: true; results: WebResult[] } | { available: false; message: string };

const ENDPOINT: string | undefined = import.meta.env?.VITE_SEARCH_ENDPOINT;

export const webSearchConfigured = () => Boolean(ENDPOINT);

export async function webSearch(query: string, signal?: AbortSignal): Promise<WebSearchResponse> {
  if (!ENDPOINT) {
    return { available: false, message: 'Live web research is not set up in this app, so no websites were searched. Any answer must come from general knowledge and be labelled as such, with no sources.' };
  }
  try {
    const res = await fetch(`${ENDPOINT}?q=${encodeURIComponent(query)}`, { signal });
    if (!res.ok) return { available: false, message: `The search service returned an error (${res.status}). No websites were searched.` };
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) return { available: false, message: 'The search service sent an unexpected response.' };
    const results = body
      .filter((r): r is WebResult => !!r && typeof r === 'object' && typeof (r as WebResult).url === 'string' && /^https?:\/\//.test((r as WebResult).url))
      .slice(0, 8)
      .map((r) => ({ title: String(r.title ?? r.url).slice(0, 200), url: r.url, snippet: String(r.snippet ?? '').slice(0, 500) }));
    return { available: true, results };
  } catch {
    return { available: false, message: 'The search service could not be reached. No websites were searched.' };
  }
}
