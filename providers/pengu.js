"use strict";

const PROVIDER_NAME = "Pengu";
function normalizeBaseUrl(raw) {
  return String(raw || "").replace(/\/manifest\.json$/i, "").replace(/\/+$/, "");
}
function configuredBaseUrl() {
  const configuredUrl = process.env.PENGU_MANIFEST_URL || process.env.PENGU_BASE_URL;
  if (configuredUrl) return normalizeBaseUrl(configuredUrl);
  const authToken = String(process.env.PENGU_AUTH_TOKEN || "").trim();
  if (!authToken) return "";
  return `https://pengu.uk/${encodeURIComponent(JSON.stringify({ auth_token: authToken }))}`;
}
function streamId(imdbId, tmdbId, mediaType, season, episode) {
  const baseId = imdbId || (tmdbId ? `tmdb:${tmdbId}` : "");
  return (mediaType === "series" || mediaType === "tv") && season != null && episode != null ? `${baseId}:${season}:${episode}` : baseId;
}
async function fetchPenguStreams(imdbId, tmdbId, mediaType, season, episode) {
  const baseUrl = configuredBaseUrl();
  const type = mediaType === "tv" ? "series" : mediaType;
  const id = streamId(imdbId, tmdbId, type, season, episode);
  if (!baseUrl || !id) return [];
  const response = await fetch(`${baseUrl}/stream/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`, {
    headers: { Accept: "application/json", "User-Agent": "Doom-addon/3.0" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`${PROVIDER_NAME} returned HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.streams) ? payload.streams : [];
}
async function getStreams(tmdbId, mediaType = "movie", season = null, episode = null, imdbId = "") {
  try {
    return (await fetchPenguStreams(imdbId, tmdbId, mediaType, season, episode))
      .filter((stream) => stream && typeof stream.url === "string" && /^https?:\/\//i.test(stream.url));
  } catch (error) { console.error(`[${PROVIDER_NAME}] ${error.message || error}`); return []; }
}
module.exports = { getStreams };
