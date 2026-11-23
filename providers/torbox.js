"use strict";

const PROVIDER_NAME = "Torbox";
const API_BASE = (process.env.TORBOX_API_BASE || "https://api.torbox.app").replace(/\/+$/, "");

function normalizeBaseUrl(raw) {
  return String(raw || "").replace(/\/manifest\.json$/i, "").replace(/\/+$/, "");
}
function manifestBaseUrls() {
  const configured = process.env.TORBOX_MANIFEST_URL || process.env.TORBOX_BASE_URL;
  return configured ? [normalizeBaseUrl(configured)] : [];
}
function streamId(baseId, mediaType, season, episode) {
  if ((mediaType === "series" || mediaType === "tv") && season != null && episode != null) return `${baseId}:${season}:${episode}`;
  return baseId;
}
function getInfoHash(stream) {
  const direct = stream?.infoHash || stream?.infohash || stream?.behaviorHints?.infoHash;
  if (typeof direct === "string" && /^[a-f0-9]{40}$/i.test(direct)) return direct.toLowerCase();
  const magnet = [stream?.url, stream?.externalUrl].find((value) => typeof value === "string" && value.startsWith("magnet:?"));
  const match = magnet && magnet.match(/[?&]xt=urn:btih:([a-f0-9]{40}|[a-z2-7]{32})/i);
  return match ? match[1].toLowerCase() : "";
}
async function cachedHashes(hashes) {
  const apiKey = String(process.env.TORBOX_API_KEY || "").trim();
  if (!apiKey || hashes.length === 0) return new Set();
  const response = await fetch(`${API_BASE}/v1/api/torrents/checkcached?format=object&${hashes.map((hash) => `hash=${encodeURIComponent(hash)}`).join("&")}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`Torbox cache check returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.success !== true || !payload.data || typeof payload.data !== "object") return new Set();
  return new Set(Object.keys(payload.data).filter((hash) => payload.data[hash]).map((hash) => hash.toLowerCase()));
}
async function fetchTorboxStreams(stremioId, mediaType, season, episode) {
  if (!stremioId) return [];
  const baseUrls = manifestBaseUrls();
  if (!baseUrls.length) return [];
  const type = mediaType === "tv" ? "series" : mediaType;
  const id = streamId(stremioId, type, season, episode);
  let lastError = null;
  for (const baseUrl of baseUrls) {
    try {
      const response = await fetch(`${baseUrl}/stream/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`, {
        headers: { Accept: "application/json", "User-Agent": "Doom-addon/3.0" },
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`Torbox manifest returned HTTP ${response.status}`);
      const payload = await response.json();
      return Array.isArray(payload.streams) ? payload.streams.filter((stream) => stream && stream.url) : [];
    } catch (error) { lastError = error; }
  }
  if (lastError) throw lastError;
  return [];
}
async function getStreams(tmdbId, mediaType = "movie", season = null, episode = null, imdbId = "") {
  if (!process.env.TORBOX_API_KEY) {
    console.warn("[Torbox] TORBOX_API_KEY is not configured; returning no streams (cached-only mode).");
    return [];
  }
  const ids = [imdbId, tmdbId ? `tmdb:${tmdbId}` : ""].filter(Boolean);
  for (const id of ids) {
    try {
      const streams = await fetchTorboxStreams(id, mediaType, season, episode);
      if (!streams.length) continue;
      const withHashes = streams.map((stream) => ({ stream, hash: getInfoHash(stream) })).filter((item) => item.hash);
      const hashes = [...new Set(withHashes.map((item) => item.hash))];
      const cached = await cachedHashes(hashes);
      return withHashes.filter((item) => cached.has(item.hash)).map((item) => item.stream);
    } catch (error) { console.error(`[${PROVIDER_NAME}] ${id}: ${error.message || error}`); }
  }
  return [];
}
module.exports = { getStreams };
