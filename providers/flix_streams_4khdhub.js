"use strict";

const PROVIDER_NAME = "Flix-Streams 4KHDHub";
const DEFAULT_MANIFEST_URL = "";

function configuredBaseUrl() {
  const raw = process.env.FLIX_STREAMS_MANIFEST_URL || process.env.FLIX_STREAMS_BASE_URL || DEFAULT_MANIFEST_URL;
  if (!raw) {
    return "";
  }
  return raw.replace(/\/manifest\.json$/i, "").replace(/\/+$/, "");
}

function streamId(tmdbId, mediaType, season, episode, imdbId) {
  const baseId = /^tt\d+$/i.test(String(imdbId || "")) ? imdbId : `tmdb:${tmdbId}`;
  if ((mediaType === "series" || mediaType === "tv") && season != null && episode != null) {
    return `${baseId}:${season}:${episode}`;
  }
  return baseId;
}

async function fetchFlixStreams(tmdbId, mediaType, season, episode, imdbId) {
  const baseUrl = configuredBaseUrl();
  if (!baseUrl) {
    return [];
  }

  const stremioType = mediaType === "tv" ? "series" : mediaType;
  const url = `${baseUrl}/stream/${encodeURIComponent(stremioType)}/${encodeURIComponent(streamId(tmdbId, stremioType, season, episode, imdbId))}.json`;
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Doom-addon/1.0"
    },
    redirect: "follow"
  });
  if (!response.ok) {
    throw new Error(`${PROVIDER_NAME} returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.streams) ? payload.streams : [];
}

function is4KHDHubStream(stream) {
  const flixStreams = stream && stream.metadata && stream.metadata.flixStreams;
  const text = [
    stream && stream.name,
    stream && stream.message,
    stream && stream.title,
    stream && stream.description,
    stream && stream.url,
    stream && stream._fs_provider_name,
    stream && stream._fs_provider_code,
    stream && stream._fs_provider_id,
    flixStreams && flixStreams.providerName,
    flixStreams && flixStreams.providerCode,
    flixStreams && flixStreams.providerId,
    stream && stream.behaviorHints && stream.behaviorHints.filename,
    stream && stream.behaviorHints && stream.behaviorHints.bingeGroup,
    stream && stream.behaviorHints && stream.behaviorHints.provider,
    stream && stream.behaviorHints && stream.behaviorHints.providerCode,
    stream && stream.behaviorHints && stream.behaviorHints.providerId,
    stream && stream.behaviorHints && stream.behaviorHints.source
  ].filter(Boolean).join(" ");

  return /\b4k\s*hd\s*hub\b/i.test(text)
    || /\b4khdhub\b/i.test(text)
    || /\benable[-_]?4khdhub\b/i.test(text)
    || /\/api\/4khdhub\/media\b/i.test(text);
}

function normalizeFlixStream(stream) {
  if (!stream || !stream.url) {
    return null;
  }

  return {
    name: stream.name || PROVIDER_NAME,
    title: stream.title || stream.description || stream.name || PROVIDER_NAME,
    description: stream.description || stream.title || stream.name || PROVIDER_NAME,
    url: stream.url,
    quality: stream.quality,
    size: stream.size,
    videoSize: stream.videoSize || (stream.behaviorHints && stream.behaviorHints.videoSize),
    behaviorHints: stream.behaviorHints || {},
    headers: stream.headers
  };
}

async function getStreams(tmdbId, mediaType = "movie", season = null, episode = null, imdbId = null) {
  try {
    const streams = await fetchFlixStreams(tmdbId, mediaType, season, episode, imdbId);
    return streams.filter(is4KHDHubStream).map(normalizeFlixStream).filter(Boolean);
  } catch (error) {
    console.error(`[${PROVIDER_NAME}] ${error.message || error}`);
    return [];
  }
}

module.exports = { getStreams };
