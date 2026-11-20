"use strict";

const PROVIDER_NAME = "Torbox";
const DEFAULT_MANIFEST_URL = "https://aiostreams.fortheweak.cloud/stremio/0f2abcc3-6334-4dc1-8852-4f1f54ee0ede/eyJpIjoiT0xEakJYaklobC84NTJPeFlrdkNyZz09IiwiZSI6IjBlRjBuUXMwRmwrMldXbXYwYVlpODliQitlblBjUGVrN1VEd1Zsb3RBSUk9IiwidCI6ImEifQ/manifest.json";
const BACKUP_MANIFEST_URL = "https://aiostreamsfortheweebsstable.midnightignite.me/stremio/4e02e39b-c022-4ce5-ad67-eeaca6b2fb5e/eyJpIjoid0k4WWxWZnQvaVhZNnkvTjZnN2sxUT09IiwiZSI6IlU4Z0tBYUp1WnQxaGJrQTgrT1FTS3Y0OWRmbG1wQVc1NzdLV1IzRGRBUWs9IiwidCI6ImEifQ/manifest.json";

function normalizeBaseUrl(raw) {
  if (!raw) {
    return "";
  }
  return raw.replace(/\\/manifest\\.json$/i, "").replace(/\\/+$/, "");
}

function manifestBaseUrls() {
  const configured = process.env.TORBOX_MANIFEST_URL || process.env.TORBOX_BASE_URL;
  const seen = new Set();
  return [configured, DEFAULT_MANIFEST_URL, BACKUP_MANIFEST_URL]
    .map(normalizeBaseUrl)
    .filter((baseUrl) => baseUrl && !seen.has(baseUrl) && seen.add(baseUrl));
}

function streamId(baseId, mediaType, season, episode) {
  if ((mediaType === "series" || mediaType === "tv") && season != null && episode != null) {
    return `${baseId}:${season}:${episode}`;
  }
  return baseId;
}

function hasPlayableSource(stream) {
  return Boolean(stream && (stream.url || stream.infoHash || (Array.isArray(stream.sources) && stream.sources.length)));
}

function cacheState(stream) {
  // Prefer structured cache metadata when the upstream provides it.
  if (stream && stream.service && typeof stream.service.cached === "boolean") {
    return stream.service.cached;
  }
  if (stream && typeof stream.cached === "boolean") {
    return stream.cached;
  }

  // Fall back to explicit AIOStreams cache markers in its formatted text.
  const marker = [stream && stream.name, stream && stream.title, stream && stream.description]
    .filter(Boolean)
    .join(" ");
  if (marker.includes("☁️") || marker.includes("☁")) return true;
  if (/\\bnot cached\\b|\\buncached\\b/i.test(marker)) return false;
  return null;
}

async function fetchTorboxStreams(stremioId, mediaType, season, episode) {
  if (!stremioId) {
    return [];
  }

  const stremioType = mediaType === "tv" ? "series" : mediaType;
  const id = streamId(stremioId, stremioType, season, episode);
  let lastError = null;

  for (const baseUrl of manifestBaseUrls()) {
    const url = `${baseUrl}/stream/${encodeURIComponent(stremioType)}/${encodeURIComponent(id)}.json`;
    try {
      const response = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Doom-addon/2.2"
        },
        redirect: "follow"
      });
      if (!response.ok) {
        throw new Error(`${PROVIDER_NAME} returned HTTP ${response.status}`);
      }

      const payload = await response.json();
      return Array.isArray(payload.streams)
        ? payload.streams
            .filter(hasPlayableSource)
            .sort((a, b) => {
              const aState = cacheState(a);
              const bState = cacheState(b);
              return Number(bState === true) - Number(aState === true);
            })
            .map((stream) => {
              const state = cacheState(stream);
              const label = state === true
                ? "☁️ CACHED"
                : state === false
                  ? "⬇️ NOT CACHED"
                  : "❔ CACHE UNKNOWN";
              return {
                ...stream,
                name: `${label} · ${stream.name || "Torbox"}`
              };
            })
        : [];
    } catch (error) {
      lastError = error;
      console.error(`[${PROVIDER_NAME}] ${baseUrl}: ${error.message || error}`);
    }
  }

  if (lastError) {
    throw lastError;
  }
  return [];
}

async function getStreams(tmdbId, mediaType = "movie", season = null, episode = null, imdbId = "") {
  const ids = [
    imdbId,
    tmdbId ? `tmdb:${tmdbId}` : ""
  ].filter(Boolean);

  for (const id of ids) {
    try {
      const streams = await fetchTorboxStreams(id, mediaType, season, episode);
      if (streams.length > 0) {
        return streams.filter(hasPlayableSource);
      }
    } catch (error) {
      console.error(`[${PROVIDER_NAME}] ${id}: ${error.message || error}`);
    }
  }

  return [];
}

module.exports = { getStreams };
