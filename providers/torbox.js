"use strict";

const PROVIDER_NAME = "Torbox";
const DEFAULT_MANIFEST_URL = "https://aiostreams.fortheweak.cloud/stremio/0f2abcc3-6334-4dc1-8852-4f1f54ee0ede/eyJpIjoiT0xEakJYaklobC84NTJPeFlrdkNyZz09IiwiZSI6IjBlRjBuUXMwRmwrMldXbXYwYVlpODliQitlblBjUGVrN1VEd1Zsb3RBSUk9IiwidCI6ImEifQ/manifest.json";
const BACKUP_MANIFEST_URL = "https://aiostreamsfortheweebsstable.midnightignite.me/stremio/4e02e39b-c022-4ce5-ad67-eeaca6b2fb5e/eyJpIjoid0k4WWxWZnQvaVhZNnkvTjZnN2sxUT09IiwiZSI6IlU4Z0tBYUp1WnQxaGJrQTgrT1FTS3Y0OWRmbG1wQVc1NzdLV1IzRGRBUWs9IiwidCI6ImEifQ/manifest.json";

function normalizeBaseUrl(raw) {
  if (!raw) {
    return "";
  }
  return raw.replace(/\/manifest\.json$/i, "").replace(/\/+$/, "");
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
      // AIOStreams' configured formatter marks provider-cached results with the cloud icon.
      // Keep only explicitly marked cached results; unknown/uncached streams are excluded.
      return Array.isArray(payload.streams)
        ? payload.streams.filter((stream) => {
            if (!stream || !stream.url) return false;
            const marker = [stream.name, stream.title, stream.description].filter(Boolean).join(" ");
            return marker.includes("☁️") || marker.includes("☁");
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
        return streams.filter((stream) => stream && stream.url);
      }
    } catch (error) {
      console.error(`[${PROVIDER_NAME}] ${id}: ${error.message || error}`);
    }
  }

  return [];
}

module.exports = { getStreams };
