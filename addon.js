"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const TMDB_API_KEY = process.env.TMDB_API_KEY || "439c478a771f35c05022f9feabcca01c";
const DEFAULT_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS || 45000);
const STREAM_PROBE_TIMEOUT_MS = Number(process.env.STREAM_PROBE_TIMEOUT_MS || 8000);
const STREAM_PROBE_CONCURRENCY = Number(process.env.STREAM_PROBE_CONCURRENCY || 6);
const STREAM_CACHE_TTL_MS = Number(process.env.STREAM_CACHE_TTL_MS || 10 * 60 * 1000);
const STREAM_CACHE_MAX_ENTRIES = Number(process.env.STREAM_CACHE_MAX_ENTRIES || 100);
const STREAM_FAST_PROVIDER_WAIT_MS = Number(process.env.STREAM_FAST_PROVIDER_WAIT_MS || 25000);
const STREAM_FAST_PROBE_TIMEOUT_MS = Number(process.env.STREAM_FAST_PROBE_TIMEOUT_MS || 2500);
const MEDIAFUSION_PROBE_TIMEOUT_MS = Number(process.env.MEDIAFUSION_PROBE_TIMEOUT_MS || 8000);
const QUALITY_SHARED_CACHE_SCOPE = "quality-shared";
const STREAM_FIRST_BATCH_WAIT_MS = Number(process.env.STREAM_FIRST_BATCH_WAIT_MS || 20000);
const STREAM_LIVE_FIRST_BATCH_WAIT_MS = Number(process.env.STREAM_LIVE_FIRST_BATCH_WAIT_MS || 12000);
const STREAM_SHARED_FIRST_BATCH_WAIT_MS = Number(process.env.STREAM_SHARED_FIRST_BATCH_WAIT_MS || 16000);
const QUALITY_TV_FAST_WAIT_MS = Number(process.env.QUALITY_TV_FAST_WAIT_MS || STREAM_SHARED_FIRST_BATCH_WAIT_MS);
const QUALITY_RESPONSE_WAIT_MS = Number(
  process.env.QUALITY_RESPONSE_WAIT_MS
  || Math.max(STREAM_LIVE_FIRST_BATCH_WAIT_MS, STREAM_SHARED_FIRST_BATCH_WAIT_MS + STREAM_FAST_PROBE_TIMEOUT_MS + 23500)
);
const QUALITY_EMPTY_FALLBACK_WAIT_MS = Number(process.env.QUALITY_EMPTY_FALLBACK_WAIT_MS || 4000);
const LIVE_STREAM_REFRESH_MS = Number(process.env.LIVE_STREAM_REFRESH_MS || 35 * 60 * 1000);
const LIVE_EMPTY_STREAM_RETRY_MS = Number(process.env.LIVE_EMPTY_STREAM_RETRY_MS || 60 * 1000);
const LIVE_STREAM_CACHE_MAX_ENTRIES = Number(process.env.LIVE_STREAM_CACHE_MAX_ENTRIES || 250);
const NUVIO_LIVE_PROBE_TIMEOUT_MS = Number(process.env.NUVIO_LIVE_PROBE_TIMEOUT_MS || 2500);
const NUVIO_LIVE_PROBE_CONCURRENCY = Number(process.env.NUVIO_LIVE_PROBE_CONCURRENCY || 10);
const NUVIO_LIVE_SEGMENT_PROBE_TIMEOUT_MS = Number(process.env.NUVIO_LIVE_SEGMENT_PROBE_TIMEOUT_MS || 3000);
const NUVIO_LIVE_MAX_PROBE_CANDIDATES = Number(process.env.NUVIO_LIVE_MAX_PROBE_CANDIDATES || 20);
const NUVIO_LIVE_REQUIRE_SEGMENT_PROBE = /^(?:1|true|yes)$/i.test(process.env.NUVIO_LIVE_REQUIRE_SEGMENT_PROBE || "");
const SHARED_PREWARM_SCOPES = new Set(["main", "quality-4k", "quality-1080", "quality-low"]);

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const providerRegistry = JSON.parse(fs.readFileSync(path.join(ROOT, "providers.json"), "utf8"));
const SPORTS_LIVE_BASE_URL = process.env.SPORTS_LIVE_BASE_URL
  || "https://sports.highfly.dev/eyJpbmNsdWRlU3BvcnRzIjpbImNyaWNrZXQiLCJmb290YmFsbCIsIm90aGVyIl19";
const NUVIO_LIVE_BASE_URL = process.env.NUVIO_LIVE_BASE_URL
  || "https://nuvio-live-sports.onrender.com/%7B%22sports%22%3A%22football%2Ccricket%22%7D";
const NUVIO_LIVE_ORIGIN = new URL(NUVIO_LIVE_BASE_URL).origin;
const sportsFreeLiveCatalogs = [
  {
    extra: [
      { isRequired: false, name: "skip" }
    ],
    id: "sports_live",
    name: "Live Now",
    type: "sport",
    behaviorHints: {
      notForHome: true
    }
  },
  {
    extra: [
      { isRequired: false, name: "skip" }
    ],
    id: "sports_today",
    name: "Today",
    type: "sport",
    behaviorHints: {
      notForHome: true
    }
  },
  {
    extra: [
      { isRequired: false, name: "skip" }
    ],
    id: "sports_football",
    name: "Football",
    type: "sport",
    behaviorHints: {
      notForHome: true
    }
  },
  {
    extra: [
      { isRequired: false, name: "skip" }
    ],
    id: "sports_cricket",
    name: "Cricket",
    type: "sport",
    behaviorHints: {
      notForHome: true
    }
  },
  {
    extra: [
      { isRequired: false, name: "skip" }
    ],
    id: "sports_other",
    name: "Other",
    type: "sport",
    behaviorHints: {
      notForHome: true
    }
  }
];
const nuvioLiveCatalogs = [
  {
    extra: [
      { isRequired: false, name: "search" }
    ],
    id: "nuvio_sports_live",
    name: "Nuvio - Live Now",
    type: "tv"
  },
  {
    extra: [
      { isRequired: false, name: "search" }
    ],
    id: "nuvio_sports_football",
    name: "Nuvio - Soccer",
    type: "tv"
  },
  {
    extra: [
      { isRequired: false, name: "search" }
    ],
    id: "nuvio_sports_cricket",
    name: "Nuvio - Cricket",
    type: "tv"
  },
  {
    extra: [
      { isRequired: false, name: "search" }
    ],
    id: "nuvio_sports_networks",
    name: "Nuvio - 24/7 Sports TV",
    type: "tv"
  }
];
const liveCatalogs = [...sportsFreeLiveCatalogs, ...nuvioLiveCatalogs];

const providerEntries = providerRegistry.scrapers
  .filter((provider) => provider.enabled)
  .map((provider) => ({
    id: provider.id,
    name: provider.name,
    modulePath: path.join(ROOT, provider.filename),
    getStreams: null
  }));
const addonGroups = {
  murph: {
    name: "Umbrella M",
    providerIds: ["4khdhub_murph", "hdhub4u_murph", "moviebox_murph", "movies4u_murph"]
  },
  yoruix: {
    name: "Umbrella Y",
    providerIds: [
      "4khdhub_yoruix",
      "hdhub4u_yoruix",
      "moviebox_yoruix",
      "netmirror_yoruix",
      "uhdmovies_yoruix",
      "movieblast_yoruix"
    ]
  },
  d3adlyrocket: {
    name: "Umbrella D",
    providerIds: [
      "4khdhub",
      "4khdhubtv",
      "hdhub4u",
      "hindmoviez",
      "movieblast",
      "movieboxhindi",
      "moviebox",
      "cinefreak",
      "fibwatch",
      "movies4u",
      "moviesdrive",
      "netmirror",
      "peachify",
      "playimdb",
      "vegamovies",
      "vidlink",
      "streamflix",
      "uhdmovies",
      "4khdhubnew"
    ]
  },
  flixnest: {
    name: "Umbrella F",
    providerIds: [
      "flix_streams_emby",
      "flix_streams_mkvcinemas",
      "flix_streams_lotusvault",
      "flix_streams_archivevault",
      "flix_streams_uhdmovies",
      "flix_streams_4khdhub",
      "flix_streams_hdhub4u",
      "flix_streams_signalvault",
      "flix_streams_usenetvault",
      "flix_streams_streamvault",
      "flix_streams_debridvault",
      "flix_streams_other",
      "flix_streams_vegamovies"
    ]
  },
  webstreamrmbg: {
    name: "Umbrella W",
    providerIds: ["webstreamrmbg"]
  },
  torbox: {
    name: "Torbox",
    providerIds: ["torbox"],
    waitForFull: true
  },
  mediafusion: {
    name: "Umbrella MF",
    providerIds: ["mediafusion"]
  },
  aiostreams: {
    name: "Umbrella AIO",
    providerIds: ["aiostreams"]
  },
  "quality-4k": {
    name: "4K UHD",
    providerIds: providerEntries.map((provider) => provider.id),
    qualityBand: "4k"
  },
  "quality-1080": {
    name: "FHD",
    providerIds: providerEntries.map((provider) => provider.id),
    qualityBand: "1080"
  },
  "quality-low": {
    name: "HD",
    providerIds: providerEntries.map((provider) => provider.id),
    qualityBand: "low"
  }
};
const addonGroupEntries = Object.fromEntries(
  Object.entries(addonGroups).map(([slug, group]) => [
    slug,
    providerEntries.filter((provider) => group.providerIds.includes(provider.id))
  ])
);
const addonManifests = Object.fromEntries(
  Object.entries(addonGroups).map(([slug, group]) => [
    slug,
    Object.assign({}, manifest, {
      id: `${manifest.id}.${slug}`,
      name: group.name,
      description: slug === "mediafusion"
        ? `${group.name} provider group for Doom-addon. Passes MediaFusion streams through with Hindi/English detection, blocked source-tag filtering, cached/playable placeholder rejection, and Hindi-first quality/size sorting.`
        : slug === "aiostreams"
          ? `${group.name} provider group for Doom-addon. Passes AIOStreams streams through without Umbrella formatting or extra filtering.`
          : slug === "torbox"
            ? `${group.name} provider group for Doom-addon. Passes Torbox streams through unchanged, then applies only sorting and quality-tab filtering.`
          : group.qualityBand
            ? `${group.name} quality group for Doom-addon. Uses all enabled providers and keeps the main add-on rules, with streams routed by quality.`
            : `${group.name} provider group for Doom-addon. Uses the same Umbrella formatting, filtering, sorting, and playable checks as the main add-on.`
    })
  ])
);
const liveManifest = Object.assign({}, manifest, {
  id: `${manifest.id}.live`,
  name: "Live",
  description: "Sports football/cricket/other live streams from HighFly and Nuvio. Stream links refresh every 35 minutes.",
  resources: ["stream", "catalog", "meta"],
  types: ["sport", "tv"],
  idPrefixes: ["streamed", "sf", "recap", "leaf", "nuvio_sport_"],
  catalogs: liveCatalogs,
  behaviorHints: Object.assign({}, manifest.behaviorHints || {}, {
    configurable: false,
    p2p: false
  })
});
addonManifests.live = liveManifest;
const streamCache = new Map();
const streamInflight = new Map();
const liveStreamCache = new Map();
const passthroughProviderIds = new Set(["mediafusion", "aiostreams", "torbox"]);
const passthroughStreams = new WeakSet();

function isSportsFreeLiveId(id) {
  return /^(?:streamed|sf|recap|leaf):/i.test(String(id || ""));
}

function isNuvioLiveId(id) {
  return /^nuvio_sport_/i.test(String(id || ""));
}

function isSportsFreeCatalog(type, id) {
  return type === "sport" && sportsFreeLiveCatalogs.some((catalog) => catalog.id === id);
}

function isNuvioLiveCatalog(type, id) {
  return type === "tv" && nuvioLiveCatalogs.some((catalog) => catalog.id === id);
}

function trimLiveStreamCache() {
  while (liveStreamCache.size > LIVE_STREAM_CACHE_MAX_ENTRIES) {
    const oldestKey = liveStreamCache.keys().next().value;
    if (!oldestKey) {
      return;
    }
    liveStreamCache.delete(oldestKey);
  }
}

function liveStreamText(stream) {
  return [
    stream && stream.name,
    stream && stream.title,
    stream && stream.description,
    stream && stream.url,
    stream && stream.behaviorHints && stream.behaviorHints.filename
  ].filter(Boolean).join(" ");
}

function isPlayableLiveCandidate(stream) {
  if (!stream || !stream.url || isBlockedNavigationUrl(stream.url)) {
    return false;
  }
  const text = liveStreamText(stream);
  return !/\b(?:upgrade|premium|subscribe|support|sale|discount)\b/i.test(text)
    && !/^https?:\/\/(?:www\.)?google\./i.test(stream.url);
}

function upstreamSportsFreeUrl(...segments) {
  const path = segments
    .filter((segment) => segment !== undefined && segment !== null && segment !== "")
    .map((segment) => encodeURIComponent(String(segment)))
    .join("/");
  return `${SPORTS_LIVE_BASE_URL}/${path}.json`;
}

function upstreamNuvioLiveUrl(...segments) {
  const path = segments
    .filter((segment) => segment !== undefined && segment !== null && segment !== "")
    .map((segment) => encodeURIComponent(String(segment)))
    .join("/");
  return `${NUVIO_LIVE_BASE_URL}/${path}.json`;
}

async function fetchSportsFreeJson(...segments) {
  const response = await fetch(upstreamSportsFreeUrl(...segments), {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Doom-addon/2.3.6"
    }
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

async function fetchNuvioLiveJson(...segments) {
  const response = await fetch(upstreamNuvioLiveUrl(...segments), {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Doom-addon/2.3.12"
    }
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

function normalizeNuvioLiveStream(stream) {
  if (!stream || !stream.url) {
    return stream;
  }
  if (/^https?:\/\//i.test(stream.url)) {
    return stream;
  }
  if (String(stream.url).startsWith("/")) {
    return Object.assign({}, stream, {
      url: `${NUVIO_LIVE_ORIGIN}${stream.url}`
    });
  }
  return Object.assign({}, stream, {
    url: `${NUVIO_LIVE_ORIGIN}/${String(stream.url).replace(/^\.?\//, "")}`
  });
}

function looksLikePlayableHlsPlaylist(text) {
  const sample = String(text || "").slice(0, 4096);
  return /^#EXTM3U/m.test(sample)
    && /#EXT(?:-X-(?:STREAM-INF|MEDIA|TARGETDURATION|KEY|MAP|PART-INF)|INF)\b/m.test(sample)
    && !/<(?:!doctype|html|body|script)\b/i.test(sample)
    && !/\b(?:bad gateway|cloudflare|access denied|rate limit|too many requests|not found)\b/i.test(sample);
}

function isNuvioHlsCandidate(stream) {
  if (!stream || !stream.url) {
    return false;
  }
  return /\.m3u8(?:[?#]|$)/i.test(stream.url)
    || /\/api\/hls(?:[/?#]|$)/i.test(stream.url);
}

function firstHlsUriAfterTag(text, tagPattern) {
  const lines = String(text || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!tagPattern.test(lines[index])) {
      continue;
    }
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next].trim();
      if (line && !line.startsWith("#")) {
        return line;
      }
    }
  }
  return "";
}

function firstHlsSegmentUri(text) {
  const explicitSegment = firstHlsUriAfterTag(text, /^#EXTINF\b/i);
  if (explicitSegment) {
    return explicitSegment;
  }
  const mapMatch = String(text || "").match(/^#EXT-X-MAP:.*URI="([^"]+)"/im);
  return mapMatch ? mapMatch[1] : "";
}

function resolveHlsUri(baseUrl, uri) {
  try {
    return new URL(uri, baseUrl).toString();
  } catch (_) {
    return "";
  }
}

async function fetchNuvioLiveText(url, timeoutMs, extraHeaders = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: Object.assign({
        "Accept": "application/vnd.apple.mpegurl, application/x-mpegURL, */*",
        "User-Agent": "Doom-addon/2.3.12"
      }, extraHeaders)
    });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    return { ok: response.ok, status: response.status, contentType, text };
  } catch (_) {
    return { ok: false, status: 0, contentType: "", text: "" };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchNuvioSegment(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NUVIO_LIVE_SEGMENT_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "Accept": "*/*",
        "Range": "bytes=0-1",
        "User-Agent": "Doom-addon/2.3.12"
      }
    });
    const contentType = response.headers.get("content-type") || "";
    return response.ok
      && !/text\/html/i.test(contentType)
      && !/application\/json/i.test(contentType)
      && !/text\/plain/i.test(contentType);
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function probeNuvioLiveStream(stream) {
  if (!isNuvioHlsCandidate(stream)) {
    return false;
  }
  const playlist = await fetchNuvioLiveText(stream.url, NUVIO_LIVE_PROBE_TIMEOUT_MS);
  if (!playlist.ok || !looksLikePlayableHlsPlaylist(playlist.text)) {
    return false;
  }
  if (/text\/html/i.test(playlist.contentType) && !/^#EXTM3U/m.test(playlist.text)) {
    return false;
  }
  let mediaPlaylistUrl = stream.url;
  let mediaPlaylistText = playlist.text;
  const variantUri = firstHlsUriAfterTag(playlist.text, /^#EXT-X-STREAM-INF\b/i);
  if (variantUri) {
    mediaPlaylistUrl = resolveHlsUri(stream.url, variantUri);
    if (!mediaPlaylistUrl) {
      return false;
    }
    const mediaPlaylist = await fetchNuvioLiveText(mediaPlaylistUrl, NUVIO_LIVE_PROBE_TIMEOUT_MS);
    if (!mediaPlaylist.ok || !looksLikePlayableHlsPlaylist(mediaPlaylist.text)) {
      return false;
    }
    mediaPlaylistText = mediaPlaylist.text;
  }
  if (!NUVIO_LIVE_REQUIRE_SEGMENT_PROBE) {
    return firstHlsSegmentUri(mediaPlaylistText) ? true : looksLikePlayableHlsPlaylist(mediaPlaylistText);
  }
  const segmentUri = firstHlsSegmentUri(mediaPlaylistText);
  if (!segmentUri) {
    return false;
  }
  const segmentUrl = resolveHlsUri(mediaPlaylistUrl, segmentUri);
  return segmentUrl ? fetchNuvioSegment(segmentUrl) : false;
}

async function filterNuvioLiveStreams(streams) {
  let candidates = streams
    .filter(isPlayableLiveCandidate)
    .filter(isNuvioHlsCandidate)
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
  if (NUVIO_LIVE_MAX_PROBE_CANDIDATES > 0) {
    candidates = candidates.slice(0, NUVIO_LIVE_MAX_PROBE_CANDIDATES);
  }
  if (candidates.length === 0 || NUVIO_LIVE_PROBE_TIMEOUT_MS <= 0) {
    return candidates;
  }
  const results = new Array(candidates.length).fill(false);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(NUVIO_LIVE_PROBE_CONCURRENCY, candidates.length));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < candidates.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await probeNuvioLiveStream(candidates[index]);
    }
  }));
  return candidates.filter((_, index) => results[index]);
}

async function getLiveCatalog(type, id, extra = "") {
  if (isSportsFreeCatalog(type, id)) {
    return fetchSportsFreeJson("catalog", type, id, extra);
  }
  if (isNuvioLiveCatalog(type, id)) {
    return fetchNuvioLiveJson("catalog", type, id, extra);
  }
  return null;
}

async function getLiveMeta(type, id) {
  if (type === "sport" && isSportsFreeLiveId(id)) {
    return fetchSportsFreeJson("meta", type, id);
  }
  if (type === "tv" && isNuvioLiveId(id)) {
    return fetchNuvioLiveJson("meta", type, id);
  }
  return null;
}

async function fetchFreshLiveStreams(type, id) {
  const isNuvio = type === "tv" && isNuvioLiveId(id);
  const payload = type === "sport" && isSportsFreeLiveId(id)
    ? await fetchSportsFreeJson("stream", type, id)
    : isNuvio
      ? await fetchNuvioLiveJson("stream", type, id)
      : null;
  if (!payload || !Array.isArray(payload.streams)) {
    return [];
  }
  const streams = payload.streams
    .map((stream) => isNuvio ? normalizeNuvioLiveStream(stream) : stream)
    .filter(isPlayableLiveCandidate);
  if (isNuvio) {
    return filterNuvioLiveStreams(streams);
  }
  return streams;
}

async function refreshLiveStreamCacheEntry(cacheKey, entry) {
  try {
    const streams = await fetchFreshLiveStreams(entry.type, entry.id);
    const isNuvio = entry.type === "tv" && isNuvioLiveId(entry.id);
    if (!isNuvio && streams.length === 0 && Array.isArray(entry.streams) && entry.streams.length > 0) {
      return;
    }
    liveStreamCache.set(cacheKey, Object.assign({}, entry, {
      fetchedAt: Date.now(),
      streams
    }));
  } catch (error) {
    console.error(`[Live] Failed to refresh ${entry.id}: ${error.message || error}`);
  }
}

function refreshKnownLiveStreams() {
  for (const [cacheKey, entry] of liveStreamCache.entries()) {
    refreshLiveStreamCacheEntry(cacheKey, entry);
  }
}

if (LIVE_STREAM_REFRESH_MS > 0) {
  const liveRefreshTimer = setInterval(refreshKnownLiveStreams, LIVE_STREAM_REFRESH_MS);
  if (typeof liveRefreshTimer.unref === "function") {
    liveRefreshTimer.unref();
  }
}

async function getLiveStreams(type, id) {
  if (!((type === "sport" && isSportsFreeLiveId(id)) || (type === "tv" && isNuvioLiveId(id)))) {
    return [];
  }

  const cacheKey = `${type}:${id}`;
  const cached = liveStreamCache.get(cacheKey);
  const now = Date.now();
  const cacheTtl = cached && Array.isArray(cached.streams) && cached.streams.length > 0
    ? LIVE_STREAM_REFRESH_MS
    : LIVE_EMPTY_STREAM_RETRY_MS;
  if (cached && now - cached.fetchedAt < cacheTtl) {
    return cached.streams;
  }

  const streams = await fetchFreshLiveStreams(type, id);
  const isNuvio = type === "tv" && isNuvioLiveId(id);
  if (!isNuvio && streams.length === 0 && cached && Array.isArray(cached.streams) && cached.streams.length > 0) {
    return cached.streams;
  }
  liveStreamCache.set(cacheKey, { type, id, fetchedAt: now, streams });
  trimLiveStreamCache();
  return streams;
}

function getCatalog(scope, type, id, extra = "") {
  return scope === "live" ? getLiveCatalog(type, id, extra) : null;
}

function getMeta(scope, type, id) {
  return scope === "live" ? getLiveMeta(type, id) : null;
}

function loadProvider(provider) {
  if (!provider.getStreams) {
    provider.getStreams = require(provider.modulePath).getStreams;
  }

  if (typeof provider.getStreams !== "function") {
    throw new Error(`${provider.name} does not export getStreams`);
  }

  return provider.getStreams;
}

function isPassthroughProvider(provider) {
  return Boolean(provider && passthroughProviderIds.has(provider.id));
}

function markPassthroughStream(stream, provider) {
  if (!stream || typeof stream !== "object") {
    return stream;
  }

  const behaviorHints = Object.assign({}, stream.behaviorHints || {});
  if (provider && provider.id && !behaviorHints.doomProviderId) {
    behaviorHints.doomProviderId = provider.id;
  }

  const markedStream = Object.assign({}, stream, { behaviorHints });
  passthroughStreams.add(markedStream);
  return markedStream;
}

function isPassthroughStream(stream) {
  return Boolean(stream && typeof stream === "object" && passthroughStreams.has(stream));
}

function mediaFusionStreamText(stream) {
  const behaviorHints = stream && stream.behaviorHints;
  return [
    stream && stream.name,
    stream && stream.title,
    stream && stream.description,
    behaviorHints && behaviorHints.filename,
    behaviorHints && behaviorHints.bingeGroup
  ].filter(Boolean).join("\n");
}

function hasBlockedMediaFusionTag(stream) {
  return /(^|[^a-z0-9])(?:hdtc|hdts|telesync|telecine|telecne|tele)([^a-z0-9]|$)/i
    .test(mediaFusionStreamText(stream));
}

function hasAllowedMediaFusionLanguage(stream) {
  const text = mediaFusionStreamText(stream);
  return /\b(?:hindi|hin|english|eng)\b/i.test(text);
}

function hasAllowedPassthroughLanguage(stream) {
  const text = mediaFusionStreamText(stream);
  return /\b(?:hindi|hin|english|eng)\b/i.test(text)
    || /🇮🇳|🇬🇧|🇺🇸/.test(text);
}

function reportedResponseSize(response) {
  const contentRange = response.headers.get("content-range") || "";
  const rangeMatch = contentRange.match(/\/(\d+)\s*$/);
  if (rangeMatch) {
    return Number(rangeMatch[1]) || 0;
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  return response.status === 200 && Number.isFinite(contentLength) ? contentLength : 0;
}

function isMediaFusionPlaceholder(response, stream) {
  const expectedSize = streamSizeBytes(stream);
  const reportedSize = reportedResponseSize(response);
  if (!expectedSize || !reportedSize) {
    return false;
  }

  return expectedSize > 50 * 1024 * 1024
    && reportedSize < Math.min(expectedSize * 0.1, 50 * 1024 * 1024);
}

async function probeMediaFusionStream(stream) {
  const headers = Object.assign({}, streamRequestHeaders(stream), { Range: "bytes=0-4095" });
  const response = await withTimeout(
    fetch(stream.url, {
      method: "GET",
      headers,
      redirect: "follow"
    }),
    MEDIAFUSION_PROBE_TIMEOUT_MS,
    `${stream.name || "MediaFusion stream"} probe`
  );
  const sample = await responseSample(response);
  if (isMediaFusionPlaceholder(response, stream)) {
    return { ok: false, reason: "placeholder or downloading response" };
  }

  const probe = responseProbeResult(response, stream.url, sample);
  return probe.ok ? { ok: true } : { ok: false, reason: `HTTP ${response.status}` };
}

async function filterMediaFusionStreams(streams) {
  const filtered = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < streams.length) {
      const stream = streams[nextIndex];
      nextIndex += 1;
      try {
        const probe = await probeMediaFusionStream(stream);
        if (probe.ok) {
          filtered.push(stream);
        } else {
          console.log(`[MediaFusion] Rejected unplayable/cache-miss stream: ${stream.name || stream.title || stream.url} (${probe.reason})`);
        }
      } catch (error) {
        console.log(`[MediaFusion] Rejected unverifiable stream: ${stream.name || stream.title || stream.url} (${error.message || error})`);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(STREAM_PROBE_CONCURRENCY, streams.length) },
    () => worker()
  );
  await Promise.all(workers);
  return filtered;
}

function streamCacheKey(type, id, scope = "main") {
  return `${scope}:${type}:${id}`;
}

function cachedStreams(key) {
  const entry = streamCache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.timestamp > STREAM_CACHE_TTL_MS) {
    streamCache.delete(key);
    return null;
  }
  return entry.streams.slice();
}

function rememberStreams(key, streams) {
  if (!Array.isArray(streams) || streams.length === 0 || STREAM_CACHE_TTL_MS <= 0) {
    return;
  }

  streamCache.set(key, {
    timestamp: Date.now(),
    streams: streams.slice()
  });

  while (streamCache.size > STREAM_CACHE_MAX_ENTRIES) {
    const oldestKey = streamCache.keys().next().value;
    streamCache.delete(oldestKey);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseStremioId(type, id) {
  const parts = String(id || "").split(":");
  const imdbId = parts[0];

  if (!/^tt\d+$/i.test(imdbId)) {
    return null;
  }

  if (type === "series") {
    const season = Number(parts[1]);
    const episode = Number(parts[2]);
    if (!Number.isInteger(season) || !Number.isInteger(episode)) {
      return null;
    }
    return { imdbId, type: "series", mediaType: "tv", season, episode };
  }

  if (type === "movie") {
    return { imdbId, type: "movie", mediaType: "movie", season: null, episode: null };
  }

  return null;
}

async function resolveTmdbId(imdbId, mediaType) {
  const resultsKey = mediaType === "tv" ? "tv_results" : "movie_results";
  const url = new URL(`https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("external_source", "imdb_id");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Doom-addon Stremio Addon"
    }
  });

  if (!response.ok) {
    throw new Error(`TMDB lookup failed with ${response.status}`);
  }

  const payload = await response.json();
  const match = payload[resultsKey] && payload[resultsKey][0];
  return match ? String(match.id) : null;
}

async function resolveMediaInfo(tmdbId, mediaType) {
  const endpoint = mediaType === "tv" ? "tv" : "movie";
  const url = new URL(`https://api.themoviedb.org/3/${endpoint}/${encodeURIComponent(tmdbId)}`);
  url.searchParams.set("api_key", TMDB_API_KEY);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Doom-addon Stremio Addon"
    }
  });

  if (!response.ok) {
    throw new Error(`TMDB detail lookup failed with ${response.status}`);
  }

  const payload = await response.json();
  const title = mediaType === "tv" ? payload.name : payload.title;
  const originalTitle = mediaType === "tv" ? payload.original_name : payload.original_title;
  const date = mediaType === "tv" ? payload.first_air_date : payload.release_date;
  return {
    title: title || originalTitle || "",
    originalTitle: originalTitle || title || "",
    year: date ? String(date).slice(0, 4) : ""
  };
}

function qualityRank(value) {
  const text = String(value || "").toLowerCase();
  if (/\b(?:remux|uhd)\b/.test(text)) return 5;
  if (/\b2160p?\b/.test(text) || /(^|[^a-z0-9])4k([^a-z0-9]|$)/.test(text)) return 5;
  if (/\b1440p?\b/.test(text) || /(^|[^a-z0-9])2k([^a-z0-9]|$)/.test(text)) return 4;
  if (/\b1080p?\b/.test(text)) return 3;
  if (/\b720p?\b/.test(text)) return 2;
  if (/\b480p?\b/.test(text)) return 1;
  return 0;
}

function qualityEvidenceText(value) {
  return String(value || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*⚡/.test(line) && !/\b(?:Darth Vader|Murph Streams)\s+-\s+/i.test(line))
    .join(" ");
}

function streamQualityText(stream) {
  const behaviorHints = stream && stream.behaviorHints;
  return [
    qualityEvidenceText(stream && stream.name),
    qualityEvidenceText(stream && stream.title),
    qualityEvidenceText(stream && stream.description),
    stream && stream.quality,
    behaviorHints && behaviorHints.filename,
    behaviorHints && behaviorHints.bingeGroup
  ].filter(Boolean).join(" ");
}

function streamQualityRank(stream) {
  const behaviorHints = stream && stream.behaviorHints;
  const primaryText = [
    qualityEvidenceText(stream && stream.name),
    stream && stream.quality
  ].filter(Boolean).join(" ");
  const primaryRank = qualityRank(primaryText);
  if (primaryRank) {
    return primaryRank;
  }

  const filenameRank = qualityRank(behaviorHints && behaviorHints.filename);
  if (filenameRank) {
    return filenameRank;
  }

  return qualityRank(streamQualityText(stream));
}

function streamQualityBand(stream) {
  const text = streamQualityText(stream);
  const rank = streamQualityRank(stream);
  if (rank >= 5 || /\b(?:remux|uhd)\b/i.test(text)) {
    return "4k";
  }
  if (rank === 3) {
    return "1080";
  }
  if (rank > 0 || /\b(?:720p|720|480p|480|360p|360|240p|240|144p|144)\b/i.test(text)) {
    return "low";
  }
  return "1080";
}

function filterStreamsByQualityBand(streams, qualityBand) {
  if (!qualityBand) {
    return streams;
  }
  return streams.filter((stream) => streamQualityBand(stream) === qualityBand);
}

function normalizeHeaders(headers) {
  if (!headers || typeof headers !== "object") {
    return null;
  }

  return Object.fromEntries(
    Object.entries(headers)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)])
  );
}

function looksWebReady(url) {
  return /^https:\/\//i.test(url) && /\.mp4(?:[?#].*)?$/i.test(url);
}

function looksLikeHls(url, contentType = "") {
  const normalizedUrl = String(url || "").toLowerCase();
  const normalizedType = String(contentType || "").toLowerCase();
  return normalizedUrl.includes(".m3u8")
    || normalizedType.includes("mpegurl")
    || normalizedType.includes("application/x-mpegurl")
    || normalizedType.includes("vnd.apple.mpegurl");
}

function isKnownClientBoundUrl(url) {
  try {
    const parsed = new URL(url);
    return /^ddl\d*$/i.test(parsed.hostname.split(".")[0] || "")
      && parsed.hostname.toLowerCase().endsWith(".workers.dev");
  } catch {
    return false;
  }
}

function isBlockedNavigationUrl(url) {
  try {
    const parsed = new URL(url);
    const text = `${parsed.hostname} ${parsed.pathname} ${parsed.search}`.toLowerCase();
    return /\b(?:login|logout|signin|signup|register|captcha|account)\b/.test(text);
  } catch {
    return true;
  }
}

function isDirectMediaUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return false;
    }
    return /\.(?:mp4|mkv|m4v|webm|avi|m3u8|ts)(?:$|[?#])/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function looksLikeErrorDocument(contentType, sampleText = "") {
  const normalizedType = String(contentType || "").toLowerCase();
  const sample = String(sampleText || "").trim().slice(0, 256).toLowerCase();
  return normalizedType.includes("text/html")
    || normalizedType.includes("application/json")
    || normalizedType.includes("text/plain")
    || normalizedType.includes("xml")
    || sample.startsWith("<!doctype")
    || sample.startsWith("<html")
    || sample.startsWith("{")
    || sample.includes("<title>error")
    || sample.includes("cloudflare")
    || sample.includes("access denied")
    || sample.includes("not found")
    || sample.includes("invalid link")
    || sample.includes("generate link again")
    || sample.includes("link expired");
}

function hasBoxSignature(sampleBuffer, signature) {
  if (!sampleBuffer || sampleBuffer.length < 12) {
    return false;
  }
  return sampleBuffer.includes(Buffer.from(signature), 4);
}

function looksLikeMediaBytes(url, contentType, sampleBuffer) {
  if (!sampleBuffer || sampleBuffer.length < 4) {
    return false;
  }

  const normalizedUrl = String(url || "").toLowerCase();
  const normalizedType = String(contentType || "").toLowerCase();
  const startsWith = (hex) => sampleBuffer.subarray(0, hex.length / 2).equals(Buffer.from(hex, "hex"));

  if (startsWith("1a45dfa3")) {
    return true;
  }
  if (hasBoxSignature(sampleBuffer, "ftyp") || hasBoxSignature(sampleBuffer, "styp")) {
    return true;
  }
  if (sampleBuffer[0] === 0x47 && (sampleBuffer.length < 189 || sampleBuffer[188] === 0x47)) {
    return true;
  }
  if (sampleBuffer.subarray(0, 4).toString("ascii") === "RIFF" && sampleBuffer.subarray(8, 12).toString("ascii") === "AVI ") {
    return true;
  }

  const expectsKnownContainer = /\.(?:mkv|webm|mp4|m4v|ts|avi)(?:$|[?#])/i.test(normalizedUrl)
    || normalizedType.includes("matroska")
    || normalizedType.includes("webm")
    || normalizedType.includes("mp4")
    || normalizedType.includes("video/mp2t")
    || normalizedType.includes("avi");
  return !expectsKnownContainer && normalizedType.startsWith("video/");
}

function responseProbeResult(response, url, sample = {}, options = {}) {
  if (!response || !response.ok) {
    return { ok: false };
  }

  const contentType = response.headers.get("content-type") || "";
  const sampleText = sample.text || "";
  const sampleBuffer = sample.buffer || Buffer.alloc(0);
  if (looksLikeHls(url, contentType)) {
    return { ok: !sampleText || sampleText.includes("#EXTM3U") };
  }

  if (looksLikeErrorDocument(contentType, sampleText)) {
    return { ok: false };
  }

  const acceptRanges = response.headers.get("accept-ranges") || "";
  const contentRange = response.headers.get("content-range") || "";
  const contentLength = Number(response.headers.get("content-length") || 0);
  const mediaBytesOk = looksLikeMediaBytes(url, contentType, sampleBuffer);
  const seekable = response.status === 206
    || /bytes/i.test(acceptRanges)
    || /^bytes\s+/i.test(contentRange);
  return {
    ok: mediaBytesOk && (options.requireSeekable ? seekable : (response.status === 200 && contentLength > 0) || seekable)
  };
}

function contentRangeStart(response) {
  const contentRange = response && response.headers && response.headers.get("content-range");
  const match = String(contentRange || "").match(/^bytes\s+(\d+)-/i);
  if (!match) {
    return -1;
  }
  const start = Number(match[1]);
  return Number.isFinite(start) ? start : -1;
}

function responseContentSize(response) {
  if (!response || !response.headers) {
    return 0;
  }
  const contentRange = response.headers.get("content-range") || "";
  const rangeMatch = contentRange.match(/\/(\d+)\s*$/);
  if (rangeMatch) {
    const total = Number(rangeMatch[1]);
    if (Number.isFinite(total) && total > 0) {
      return total;
    }
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  return response.status === 200 && Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0;
}

function streamProviderId(stream) {
  return String(stream && stream.behaviorHints && stream.behaviorHints.doomProviderId || "");
}

function isHdhubProviderId(providerId) {
  return /\b(?:4khdhub|hdhub4u|hdhub)\b/i.test(String(providerId || ""));
}

function isHdhubStream(stream) {
  const behaviorHints = stream && stream.behaviorHints;
  const providerId = streamProviderId(stream);
  const text = [
    providerId,
    stream && stream.name,
    stream && stream.title,
    stream && stream.description,
    behaviorHints && behaviorHints.filename,
    behaviorHints && behaviorHints.bingeGroup
  ].filter(Boolean).join(" ");
  return isHdhubProviderId(providerId)
    || /\bHDHU(?:\s+[A-Z])?\b/i.test(text)
    || /\bHDHub4u\b/i.test(text);
}

function hardSeekOffsets(stream, response) {
  const size = Math.max(streamSizeBytes(stream), responseContentSize(response));
  const minimumOffset = 1024 * 1024;
  const sampleSize = 4096;
  if (size > minimumOffset * 2) {
    const ratios = isHdhubStream(stream) ? [0.35, 0.7] : [0.35];
    const offsets = ratios.map((ratio) => Math.min(size - sampleSize, Math.max(minimumOffset, Math.floor(size * ratio))));
    return Array.from(new Set(offsets));
  }
  return [minimumOffset];
}

function hardSeekProbeResult(response, url, sample = {}, offset = 0) {
  if (!response || !response.ok) {
    return { ok: false };
  }

  const contentType = response.headers.get("content-type") || "";
  const sampleText = sample.text || "";
  const sampleBuffer = sample.buffer || Buffer.alloc(0);
  if (looksLikeHls(url, contentType)) {
    return { ok: !sampleText || sampleText.includes("#EXTM3U") };
  }
  if (looksLikeErrorDocument(contentType, sampleText)) {
    return { ok: false };
  }
  if (response.status !== 206) {
    return { ok: false };
  }

  const rangeStart = contentRangeStart(response);
  return { ok: rangeStart === offset && sampleBuffer.length > 0 };
}

function streamRequestHeaders(stream) {
  const proxyHeaders = stream.behaviorHints
    && stream.behaviorHints.proxyHeaders
    && stream.behaviorHints.proxyHeaders.request;
  return normalizeHeaders(proxyHeaders) || {};
}

function decodeHeaderValue(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function contentDispositionFilename(response) {
  if (!response || !response.headers || typeof response.headers.get !== "function") {
    return "";
  }

  const header = response.headers.get("content-disposition") || "";
  if (!header) {
    return "";
  }

  const encodedMatch = header.match(/filename\*\s*=\s*(?:UTF-8''|utf-8'')?([^;]+)/i);
  if (encodedMatch) {
    return decodeHeaderValue(encodedMatch[1].trim().replace(/^"|"$/g, ""));
  }

  const plainMatch = header.match(/filename\s*=\s*("[^"]+"|[^;]+)/i);
  return plainMatch ? plainMatch[1].trim().replace(/^"|"$/g, "") : "";
}

function responseFilenameMatchesRequestedMedia(response, stream, mediaInfo, parsed) {
  const filename = contentDispositionFilename(response);
  if (!filename) {
    return true;
  }

  return matchesRequestedMedia({
    name: stream && stream.name,
    title: filename,
    description: filename,
    behaviorHints: { filename }
  }, mediaInfo, parsed);
}

async function responseSample(response) {
  if (!response.body || typeof response.body.getReader !== "function") {
    return { buffer: Buffer.alloc(0), text: "" };
  }

  const reader = response.body.getReader();
  try {
    const chunk = await reader.read();
    if (!chunk.value) {
      return { buffer: Buffer.alloc(0), text: "" };
    }
    const buffer = Buffer.from(chunk.value).slice(0, 512);
    return { buffer, text: buffer.toString("utf8") };
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function streamRequiresProbe(stream) {
  if (isHdhubStream(stream)) {
    return true;
  }

  const providerId = streamProviderId(stream);
  return Boolean(stream.behaviorHints && [
    "4khdhubnew",
    "4khdhub_yoruix",
    "hdhub4u",
    "hdhub4u_yoruix",
    "hdhub4u_murph",
    "movieblast_yoruix",
    "moviebox_yoruix",
    "cinefreak",
    "fibwatch",
    "peachify",
    "playimdb",
    "vegamovies",
    "uhdmovies_yoruix",
    "vidlink",
    "webstreamrmbg",
    "flix_streams_emby",
    "flix_streams_hdhub4u",
    "flix_streams_4khdhub",
    "flix_streams_uhdmovies",
    "flix_streams_vegamovies",
    "flix_streams_lotusvault",
    "flix_streams_signalvault",
    "flix_streams_usenetvault",
    "flix_streams_streamvault",
    "flix_streams_debridvault"
  ].includes(stream.behaviorHints.doomProviderId));
}

function isFastAcceptableStream(stream) {
  return (/^https:\/\//i.test(stream.url || "") || isDirectMediaUrl(stream.url || ""))
    && !isKnownClientBoundUrl(stream.url)
    && !isBlockedNavigationUrl(stream.url);
}

async function probeStream(stream, options = {}) {
  if (isKnownClientBoundUrl(stream.url)) {
    return { ok: false };
  }

  const timeoutMs = options.timeoutMs || STREAM_PROBE_TIMEOUT_MS;
  const requireSeekable = streamRequiresProbe(stream);
  const mediaInfo = options.mediaInfo;
  const parsed = options.parsed;
  const headers = streamRequestHeaders(stream);
  const isHls = looksLikeHls(stream.url);
  const rangedHeaders = Object.assign({}, headers);
  if (!isHls && !rangedHeaders.Range && !rangedHeaders.range) {
    rangedHeaders.Range = "bytes=0-4095";
  }

  const getResponse = await withTimeout(
    fetch(stream.url, {
      method: "GET",
      headers: isHls ? headers : rangedHeaders,
      redirect: "follow"
    }),
    timeoutMs,
    `${stream.name} probe`
  );
  if (!responseFilenameMatchesRequestedMedia(getResponse, stream, mediaInfo, parsed)) {
    return { ok: false };
  }

  const sample = await responseSample(getResponse);
  const getProbe = responseProbeResult(getResponse, stream.url, sample, { requireSeekable });
  if (getProbe.ok) {
    if (requireSeekable && !isHls) {
      for (const offset of hardSeekOffsets(stream, getResponse)) {
        const seekHeaders = Object.assign({}, headers, { Range: `bytes=${offset}-${offset + 4095}` });
        const seekResponse = await withTimeout(
          fetch(stream.url, {
            method: "GET",
            headers: seekHeaders,
            redirect: "follow"
          }),
          timeoutMs,
          `${stream.name} seek probe`
        );
        const seekSample = await responseSample(seekResponse);
        const seekProbe = hardSeekProbeResult(seekResponse, stream.url, seekSample, offset);
        if (!seekProbe.ok) {
          return seekProbe;
        }
      }
      return { ok: true };
    }
    return getProbe;
  }

  if (requireSeekable) {
    return { ok: false };
  }

  const headResponse = await withTimeout(
    fetch(stream.url, {
      method: "HEAD",
      headers,
      redirect: "follow"
    }),
    timeoutMs,
    `${stream.name} head probe`
  );
  if (!responseFilenameMatchesRequestedMedia(headResponse, stream, mediaInfo, parsed)) {
    return { ok: false };
  }

  return responseProbeResult(headResponse, stream.url, {}, { requireSeekable });
}

async function filterPlayableStreams(streams, options = {}) {
  const filtered = [];
  let nextIndex = 0;
  const probeOnlyRequired = Boolean(options.probeOnlyRequired);
  const probeTimeoutMs = options.probeTimeoutMs || STREAM_PROBE_TIMEOUT_MS;

  async function worker() {
    while (nextIndex < streams.length) {
      const stream = streams[nextIndex];
      nextIndex += 1;
      try {
        if (probeOnlyRequired && !streamRequiresProbe(stream)) {
          if (isFastAcceptableStream(stream)) {
            filtered.push(stream);
          } else {
            console.log(`[Stream probe] Rejected unlikely source: ${stream.name}`);
          }
          continue;
        }

        const probe = await probeStream(stream, {
          timeoutMs: probeTimeoutMs,
          mediaInfo: options.mediaInfo,
          parsed: options.parsed
        });
        if (probe.ok) {
          filtered.push(stream);
        } else {
          console.log(`[Stream probe] Rejected unplayable source: ${stream.name}`);
        }
      } catch (error) {
        console.log(`[Stream probe] Rejected ${stream.name}: ${error.message || error}`);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(STREAM_PROBE_CONCURRENCY, streams.length) },
    () => worker()
  );
  await Promise.all(workers);
  return filtered;
}

const UMBRELLA_PROVIDER_CODES = {
  "4khdhub": "4KHH DR",
  "4khdhubnew": "4KHHN DR",
  "4khdhubtv": "4KHH DR",
  "4khdhub_yoruix": "4KHH Y",
  "4khdhub_murph": "4KHH M",
  "hdhub4u": "HDHU DR",
  "hdhub4u_murph": "HDHU M",
  "hdhub4u_yoruix": "HDHU Y",
  "flix_streams_emby": "EMB",
  "flix_streams_mkvcinemas": "MKV",
  "flix_streams_lotusvault": "LV",
  "flix_streams_archivevault": "AV",
  "flix_streams_uhdmovies": "UHD",
  "flix_streams_4khdhub": "4KHH F",
  "flix_streams_hdhub4u": "HDHU F",
  "flix_streams_signalvault": "SV F",
  "flix_streams_usenetvault": "UV F",
  "flix_streams_streamvault": "STV F",
  "flix_streams_debridvault": "DBV F",
  "flix_streams_other": "FLX",
  "flix_streams_vegamovies": "VG",
  "webstreamrmbg": "WSM",
  "pengu": "PNG",
  "torbox": "TB",
  "mediafusion": "MF",
  "hindmoviez": "HM",
  "movieblast": "MBL",
  "movieblast_yoruix": "MBL Y",
  "moviebox": "MB",
  "movieboxhindi": "MBH DR",
  "moviebox_yoruix": "MB Y",
  "moviebox_murph": "MB M",
  "cinefreak": "CF DR",
  "fibwatch": "FBW DR",
  "moviesdrive": "MD",
  "movies4u": "M4U DR",
  "movies4u_murph": "M4U M",
  "netmirror": "NM",
  "netmirror_yoruix": "NM Y",
  "peachify": "PF",
  "playimdb": "PIM DR",
  "vegamovies": "VG DR",
  "vidlink": "VL DR",
  "streamflix": "SF",
  "uhdmovies": "UHD DR",
  "uhdmovies_yoruix": "UHD Y"
};
const DETAIL_PROVIDER_CODES = Object.assign({}, UMBRELLA_PROVIDER_CODES, {
  "flix_streams_mkvcinemas": "MKV Direct"
});
const KNOWN_AUDIO_LABELS = ["Hindi", "Tamil", "Telugu", "English", "Malayalam", "Kannada", "Punjabi"];
const SOURCE_DETAIL_NAMES = {
  "4khdhub": "Darth Vader",
  "4khdhubnew": "Darth Vader",
  "4khdhubtv": "Darth Vader",
  "4khdhub_yoruix": "Darth Vader",
  "4khdhub_murph": "Murph Streams",
  "hdhub4u": "Darth Vader",
  "hdhub4u_murph": "Murph Streams",
  "hdhub4u_yoruix": "Darth Vader",
  "flix_streams_emby": "Darth Vader",
  "flix_streams_mkvcinemas": "Darth Vader",
  "flix_streams_lotusvault": "Darth Vader",
  "flix_streams_archivevault": "Darth Vader",
  "flix_streams_uhdmovies": "Darth Vader",
  "flix_streams_4khdhub": "Darth Vader",
  "flix_streams_hdhub4u": "Darth Vader",
  "flix_streams_signalvault": "Darth Vader",
  "flix_streams_usenetvault": "Darth Vader",
  "flix_streams_streamvault": "Darth Vader",
  "flix_streams_debridvault": "Darth Vader",
  "flix_streams_other": "Darth Vader",
  "flix_streams_vegamovies": "Darth Vader",
  "webstreamrmbg": "Darth Vader",
  "pengu": "Darth Vader",
  "torbox": "Torbox",
  "mediafusion": "Darth Vader",
  "hindmoviez": "Darth Vader",
  "movieblast": "Darth Vader",
  "movieblast_yoruix": "Darth Vader",
  "moviebox": "Darth Vader",
  "movieboxhindi": "Darth Vader",
  "moviebox_yoruix": "Darth Vader",
  "moviebox_murph": "Murph Streams",
  "cinefreak": "Darth Vader",
  "fibwatch": "Darth Vader",
  "moviesdrive": "Darth Vader",
  "movies4u": "Darth Vader",
  "movies4u_murph": "Murph Streams",
  "netmirror": "Darth Vader",
  "netmirror_yoruix": "Darth Vader",
  "peachify": "Darth Vader",
  "playimdb": "Darth Vader",
  "vegamovies": "Darth Vader",
  "vidlink": "Darth Vader",
  "streamflix": "Darth Vader",
  "uhdmovies": "Darth Vader",
  "uhdmovies_yoruix": "Darth Vader"
};

function parseSizeToBytes(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  const match = String(value || "").match(/([\d.]+)\s*(tb|gb|mb|kb|bytes|byte|b)\b/i);
  if (!match) {
    return 0;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  const unit = match[2].toLowerCase();
  const multipliers = {
    tb: 1024 ** 4,
    gb: 1024 ** 3,
    mb: 1024 ** 2,
    kb: 1024,
    bytes: 1,
    byte: 1,
    b: 1
  };
  return Math.round(amount * multipliers[unit]);
}

function streamSizeBytes(stream) {
  if (!stream || typeof stream !== "object") {
    return 0;
  }

  return parseSizeToBytes(stream.behaviorHints && stream.behaviorHints.videoSize)
    || parseSizeToBytes(stream.videoSize)
    || parseSizeToBytes(stream.size)
    || parseSizeToBytes(stream.description)
    || parseSizeToBytes(stream.title)
    || parseSizeToBytes(stream.name);
}

function hasHindiLanguage(stream) {
  const behaviorHints = stream && stream.behaviorHints;
  const text = [
    stream && stream.name,
    stream && stream.title,
    stream && stream.description,
    stream && stream.language,
    stream && stream.languages,
    behaviorHints && behaviorHints.filename,
    behaviorHints && behaviorHints.bingeGroup
  ].filter(Boolean).join(" ");

  return /\b(?:hindi|hin)\b/i.test(text);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }

  const gb = bytes / (1024 ** 3);
  if (gb >= 1) {
    return `${gb.toFixed(gb >= 10 ? 1 : 2).replace(/(\.\d*[1-9])0+$/, "$1").replace(/\.0+$/, "")}GB`;
  }

  const mb = bytes / (1024 ** 2);
  if (mb >= 1) {
    return `${mb.toFixed(mb >= 10 ? 0 : 1).replace(/(\.\d*[1-9])0+$/, "$1").replace(/\.0+$/, "")}MB`;
  }

  return `${Math.round(bytes / 1024)}KB`;
}

function firstMatch(text, pattern) {
  const match = String(text || "").match(pattern);
  return match ? match[1] || match[0] : "";
}

function cleanDetailText(value) {
  return String(value || "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMatchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MATCH_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "by", "for", "from", "in", "into", "is", "it", "of", "on", "or", "part", "the", "to", "with"
]);

const STREAM_DETAIL_IGNORE_WORDS = new Set([
  "aac", "ac3", "amzn", "atmos", "audio", "avc", "bluray", "brrip", "cam", "ddp", "dd", "download", "darth", "dts",
  "dual", "dv", "dvd", "dvdrip", "eac3", "english", "esub", "file", "gb", "h264", "h265", "hd", "hdr", "hdrip",
  "hdhub4u", "hevc", "hindi", "hubcloud", "kbps", "mb", "mkv", "mkvcinemas", "cinemas", "moviebox", "multi",
  "original", "punjabi", "remux", "rip", "server", "stream", "tamil", "telugu", "truehd", "vader",
  "web", "webdl", "webrip", "x264", "x265", "lotusvault", "archivevault", "uhdmovies", "container"
]);

function titleTokens(value) {
  return normalizeMatchText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !MATCH_STOP_WORDS.has(token));
}

function streamEvidenceTokens(value) {
  return normalizeMatchText(value)
    .split(" ")
    .filter((token) => {
      if (token.length <= 2 || MATCH_STOP_WORDS.has(token) || STREAM_DETAIL_IGNORE_WORDS.has(token)) return false;
      if (/^\d+$/.test(token)) return false;
      if (/^(?:2160p?|1080p?|720p?|480p?|360p?|10bit|8bit)$/.test(token)) return false;
      return true;
    });
}

function streamMediaEvidence(stream) {
  return [
    stream.behaviorHints && stream.behaviorHints.filename,
    stream.title,
    stream.description
  ].filter(Boolean).join(" ");
}

function textYears(value) {
  return Array.from(new Set(String(value || "").match(/\b(?:19|20|21)\d{2}\b/g) || []));
}

function hasDifferentMovieYear(evidence, mediaInfo, parsed) {
  if (!parsed || parsed.type !== "movie" || !mediaInfo || !mediaInfo.year) {
    return false;
  }

  const years = textYears(evidence);
  return years.length > 0 && !years.includes(mediaInfo.year);
}

function requiredTitleMatches(expectedTokenCount) {
  if (expectedTokenCount <= 1) return expectedTokenCount;
  if (expectedTokenCount <= 3) return 2;
  return Math.min(expectedTokenCount, Math.ceil(expectedTokenCount * 0.5));
}

function hasExpectedEpisode(text, parsed) {
  if (!parsed || parsed.type !== "series") {
    return true;
  }

  const normalized = normalizeMatchText(text);
  const season = String(parsed.season);
  const episode = String(parsed.episode);
  const paddedSeason = season.padStart(2, "0");
  const paddedEpisode = episode.padStart(2, "0");
  const expectedPatterns = [
    `s${paddedSeason} e${paddedEpisode}`,
    `s${season} e${episode}`,
    `season ${season} episode ${episode}`,
    `season ${paddedSeason} episode ${paddedEpisode}`
  ];
  if (expectedPatterns.some((pattern) => normalized.includes(pattern))) {
    return true;
  }

  const seasonEpisodeMatch = normalized.match(/\bs\s*0?(\d+)\s*e\s*0?(\d+)\b/);
  if (seasonEpisodeMatch) {
    return Number(seasonEpisodeMatch[1]) === parsed.season && Number(seasonEpisodeMatch[2]) === parsed.episode;
  }

  return true;
}

function matchesRequestedMedia(stream, mediaInfo, parsed) {
  if (!mediaInfo || !mediaInfo.title) {
    return true;
  }

  const evidence = streamMediaEvidence(stream);
  if (!evidence) {
    return true;
  }
  if (!hasExpectedEpisode(evidence, parsed)) {
    return false;
  }

  const expectedTokens = Array.from(new Set([
    ...titleTokens(mediaInfo.title),
    ...titleTokens(mediaInfo.originalTitle)
  ]));
  if (expectedTokens.length === 0) {
    return true;
  }

  const normalizedEvidence = normalizeMatchText(evidence);
  const evidenceTokens = streamEvidenceTokens(evidence);
  if (hasDifferentMovieYear(normalizedEvidence, mediaInfo, parsed)) {
    return false;
  }

  const matchedTokens = expectedTokens.filter((token) => normalizedEvidence.includes(token));
  const requiredMatches = requiredTitleMatches(expectedTokens.length);

  if (expectedTokens.length === 1) {
    const token = expectedTokens[0];
    const hasExactToken = normalizedEvidence.split(" ").includes(token);
    if (!hasExactToken) {
      return false;
    }
    if (mediaInfo.year && normalizedEvidence.includes(mediaInfo.year)) {
      return true;
    }

    const extraTitleTokens = evidenceTokens.filter((evidenceToken) => evidenceToken !== token);
    return extraTitleTokens.length === 0;
  }

  if (matchedTokens.length >= requiredMatches) {
    return true;
  }

  if (matchedTokens.length > 0 && mediaInfo.year && normalizedEvidence.includes(mediaInfo.year)) {
    return true;
  }

  return evidenceTokens.length < 2;
}

function rawStreamText(rawStream) {
  return [
    rawStream.fileName,
    rawStream.name,
    rawStream.title,
    rawStream.description,
    rawStream.quality,
    rawStream.language,
    rawStream.size
  ].filter(Boolean).join("\n");
}

function streamFileName(rawStream) {
  const behaviorHints = rawStream.behaviorHints || {};
  const directName = rawStream.fileName || rawStream.filename || behaviorHints.filename;
  if (directName) {
    return cleanDetailText(directName);
  }

  const text = rawStreamText(rawStream);
  const fileMatch = text.match(/[^\n\r]*\.(?:mkv|mp4|m4v|webm|avi)(?:\b|$)/i);
  if (fileMatch) {
    return cleanDetailText(fileMatch[0]);
  }

  const titleLine = String(rawStream.title || rawStream.description || "")
    .split(/\r?\n/)
    .map(cleanDetailText)
    .find(Boolean);
  return titleLine || "";
}

function streamReleaseType(rawStream) {
  const text = rawStreamText(rawStream);
  const match = text.match(/\b(REMUX|WEB[-\s.]?DL|WEBRip|BluRay|BRRip|BDRip|HDRip|DVDRip|HDTV|CAM|TS|PreDVDRip)\b/i);
  if (!match) {
    return "";
  }

  return match[1]
    .replace(/web[-\s.]?dl/i, "WEB-DL")
    .replace(/webrip/i, "WEBRip")
    .replace(/bluray/i, "BluRay")
    .replace(/brrip/i, "BRRip")
    .replace(/bdrip/i, "BDRip")
    .replace(/hdrip/i, "HDRip")
    .replace(/dvdrip/i, "DVDRip")
    .replace(/hdtv/i, "HDTV")
    .replace(/predvdrip/i, "PreDVDRip")
    .toUpperCase()
    .replace("BLURAY", "BluRay")
    .replace("WEBRIP", "WEBRip")
    .replace("BRRIP", "BRRip")
    .replace("BDRIP", "BDRip")
    .replace("HDRIP", "HDRip")
    .replace("DVDRIP", "DVDRip")
    .replace("PREDVDRIP", "PreDVDRip");
}

function streamVideoDetail(rawStream) {
  const text = rawStreamText(rawStream);
  const parts = [];
  const quality = streamQualityLabel(rawStream);
  if (quality) {
    parts.push(quality);
  }

  if (/\b(?:dolby\s*vision|dovi|dv)\b/i.test(text)) {
    parts.push("Dolby Vision");
  }
  if (/\bHDR10\+?\b/i.test(text)) {
    parts.push(firstMatch(text, /\b(HDR10\+?)\b/i).toUpperCase());
  } else if (/\bHDR\b/i.test(text)) {
    parts.push("HDR");
  }
  if (/\b10\s*bit\b|\b10bit\b/i.test(text)) {
    parts.push("10bit");
  }
  if (/\bx265\b|\bhevc\b|\bh\.?265\b/i.test(text)) {
    parts.push("x265/HEVC");
  } else if (/\bx264\b|\bavc\b|\bh\.?264\b/i.test(text)) {
    parts.push("x264/AVC");
  } else if (/\bAV1\b/i.test(text)) {
    parts.push("AV1");
  }

  return Array.from(new Set(parts)).join(" | ");
}

function streamAudioDetail(rawStream) {
  const text = rawStreamText(rawStream);
  const parts = [];

  const codecPatterns = [
    /\b(TrueHD(?:\s*Atmos)?)\b/i,
    /\b(Dolby\s*Atmos|Atmos)\b/i,
    /\b(DDP?[.\s-]*5\.1|DD\+?[.\s-]*5\.1|EAC3[.\s-]*5\.1)\b/i,
    /\b(AAC[.\s-]*5\.1|AAC[.\s-]*2\.0|AAC)\b/i,
    /\b(DTS(?:-HD)?(?:\s*MA)?(?:\s*5\.1)?)\b/i,
    /\b(AC3[.\s-]*5\.1|AC3)\b/i
  ];

  for (const pattern of codecPatterns) {
    const match = firstMatch(text, pattern);
    if (match) {
      parts.push(match
        .replace(/^(DDP?|DD\+?|EAC3|AAC|AC3)[.\s-]*(\d\.\d)$/i, "$1 $2")
        .replace(/\s+/g, " ")
        .replace(/^ddp/i, "DDP")
        .replace(/^dd/i, "DD")
        .replace(/^eac3/i, "EAC3")
        .replace(/^aac/i, "AAC")
        .replace(/^ac3/i, "AC3"));
      break;
    }
  }

  const audio = audioLabelsFromText(text);
  if (audio) {
    parts.push(audio);
  }

  return Array.from(new Set(parts)).join(" | ");
}

function providerDetailName(provider) {
  return SOURCE_DETAIL_NAMES[provider.id] || (/murph/i.test(provider.name || provider.id || "") ? "Murph Streams" : "Darth Vader");
}

function detailProviderCode(provider) {
  return DETAIL_PROVIDER_CODES[provider.id] || UMBRELLA_PROVIDER_CODES[provider.id] || "";
}

function streamDetailDescription(rawStream, provider) {
  const lines = [];
  const filename = streamFileName(rawStream);
  const releaseType = streamReleaseType(rawStream);
  const videoDetail = streamVideoDetail(rawStream);
  const audioDetail = streamAudioDetail(rawStream);
  const size = formatBytes(streamSizeBytes(rawStream)) || cleanDetailText(rawStream.size);

  if (filename) lines.push(filename);
  if (releaseType) lines.push(`📀 ${releaseType}`);
  if (videoDetail) lines.push(`🎬 ${videoDetail}`);
  if (audioDetail) lines.push(`🔊 ${audioDetail}`);
  const sourceCode = detailProviderCode(provider);
  lines.push(`⚡ ${[providerDetailName(provider), sourceCode].filter(Boolean).join(" - ")}`);
  if (size) lines.push(`💾 ${size}`);

  return lines.join("\n");
}

function streamQualityLabel(rawStream) {
  const text = [
    rawStream.quality,
    rawStream.name,
    rawStream.title,
    rawStream.description,
    rawStream.behaviorHints && rawStream.behaviorHints.bingeGroup
  ].filter(Boolean).join(" ");
  const match = text.match(/\b(4k|2160p|1440p|1080p|720p|480p|360p)\b/i);
  if (!match) {
    return "";
  }

  const quality = match[1].toLowerCase();
  if (quality === "4k" || quality === "2160p") {
    return "2160p";
  }
  return quality;
}

function umbrellaProviderCode(rawStream, provider) {
  return UMBRELLA_PROVIDER_CODES[provider.id] || null;
}

function audioLabelsFromText(value) {
  const text = String(value || "");
  const labels = [];
  const seen = new Set();

  for (const label of KNOWN_AUDIO_LABELS) {
    const match = new RegExp(`\\b${label}\\b`, "i").exec(text);
    if (match && !seen.has(label.toLowerCase())) {
      seen.add(label.toLowerCase());
      labels.push({ label, index: match.index });
    }
  }

  if (labels.length > 0) {
    return labels
      .sort((a, b) => a.index - b.index)
      .map((item) => item.label)
      .join(" - ");
  }

  if (/\bmulti(?:\s*audio)?\b/i.test(text)) {
    return "Multi Audio";
  }

  return "";
}

function normalizeLanguageText(value) {
  const knownAudio = audioLabelsFromText(value);
  if (knownAudio) {
    return knownAudio;
  }

  const text = String(value || "")
    .replace(/\b4KHDHub\s+Murph\b/ig, "")
    .replace(/\b4KHDHub\s+Yoruix\b/ig, "")
    .replace(/\bHDHub4u\s+Murph\b/ig, "")
    .replace(/\bD3adlyRocket\b/ig, "")
    .replace(/\bYoruix\b/ig, "")
    .replace(/\bMurph\b/ig, "")
    .replace(/\bHDHub4u\b/ig, "")
    .replace(/\b4khdhub-tv\b/ig, "")
    .replace(/\b4KHDHub\b/ig, "")
    .replace(/\bHindMoviez\b/ig, "")
    .replace(/\bMovieBlast\b/ig, "")
    .replace(/\bMovieBox\b/ig, "")
    .replace(/\bMoviesDrive\b/ig, "")
    .replace(/\bStreamflix\b/ig, "")
    .replace(/\bFlix-Streams\b/ig, "")
    .replace(/\bMedia\s+Library\b/ig, "")
    .replace(/\bEmby\b/ig, "")
    .replace(/\bMkv\s*Cinemas\b/ig, "")
    .replace(/\bMkvCinemas\b/ig, "")
    .replace(/\bLotus\s*Vault\b/ig, "")
    .replace(/\bLotusVault\b/ig, "")
    .replace(/\bArchive\s*Vault\b/ig, "")
    .replace(/\bArchiveVault\b/ig, "")
    .replace(/\bUHD\s*Movies\b/ig, "")
    .replace(/\bUHDMovies\b/ig, "")
    .replace(/\bVegaMovies\b/ig, "")
    .replace(/\b4K\b/ig, "")
    .replace(/\b(?:2160p|1080p|720p|480p|360p|auto)\b/ig, "")
    .replace(/\b(?:fsl|pixelserver|hubcloud|hubdrive|download|file|server)\b/ig, "")
    .replace(/[|:()[\]]/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s*-\s*/g, " - ")
    .replace(/^\s*-\s*|\s*-\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const languages = [];
  const seen = new Set();
  for (const part of text.split(/\s+-\s+|[,/]+|\s+\|\s+/)) {
    const normalized = part.trim();
    if (!normalized || /\d/.test(normalized)) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    languages.push(normalized.replace(/\b\w/g, (char) => char.toUpperCase()));
  }

  return languages.join(" - ");
}

function cleanDisplayTitle(value) {
  return String(value || "")
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/\bimdb[-_\s]*tt\d+\b/ig, "")
    .replace(/\btmdb[-_\s]*\d+\b/ig, "")
    .replace(/\b(?:2160p|1080p|720p|480p|360p|4k)\b.*$/i, "")
    .replace(/\b(?:WEB[-.\s]?DL|WEBRip|BluRay|BRRip|BDRip|HDRip|DVDRip|HDTV|REMUX)\b.*$/i, "")
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function streamDisplayTitle(rawStream, mediaInfo) {
  const mediaTitle = cleanDisplayTitle(mediaInfo && mediaInfo.title);
  if (mediaTitle) {
    const year = mediaInfo && mediaInfo.year && !new RegExp(`\\b${mediaInfo.year}\\b`).test(mediaTitle)
      ? mediaInfo.year
      : "";
    return [mediaTitle, year].filter(Boolean).join(" ");
  }

  return cleanDisplayTitle(streamFileName(rawStream))
    || cleanDisplayTitle(rawStream.title)
    || cleanDisplayTitle(rawStream.name)
    || "Umbrella";
}

function cleanStreamName(rawStream, mediaInfo) {
  return [streamDisplayTitle(rawStream, mediaInfo), streamQualityLabel(rawStream)].filter(Boolean).join(" | ");
}

function shouldKeepProviderStream(rawStream, provider) {
  const text = [
    rawStream.name,
    rawStream.title,
    rawStream.description,
    rawStream.quality,
    rawStream.language
  ].filter(Boolean).join(" ");

  if (provider.id === "moviebox_yoruix" || provider.id === "movieboxhindi") {
    return /\b(?:hindi|english|original)\b/i.test(text);
  }

  if (provider.id === "peachify" || provider.id === "moviebox_murph") {
    return /\b(?:hindi|english)\b/i.test(text);
  }

  if (provider.id === "vidlink") {
    return /\b1080p\b/i.test(text);
  }

  if (provider.id === "vegamovies") {
    const rank = qualityRank(text);
    return rank >= 2 && rank <= 5 && /\b(?:hindi|hin|english|eng|dual|multi)\b/i.test(text);
  }

  if (provider.id !== "movieblast" && provider.id !== "movieblast_yoruix") {
    return true;
  }

  return /\bhindi\b/i.test(text);
}

function nameWithQuality(name, rawStream) {
  const quality = streamQualityLabel(rawStream);
  if (!quality || new RegExp(`\\b${quality}\\b`, "i").test(String(name || ""))) {
    return name;
  }
  return [name, quality].filter(Boolean).join(" | ");
}

function normalizeStream(rawStream, provider, mediaInfo) {
  if (!rawStream || typeof rawStream !== "object") {
    return null;
  }

  if (!shouldKeepProviderStream(rawStream, provider)) {
    return null;
  }

  const targetUrl = rawStream.url || rawStream.externalUrl;
  if (!targetUrl || typeof targetUrl !== "string") {
    return null;
  }

  const requestHeaders = normalizeHeaders(rawStream.headers);
  const quality = rawStream.quality || "";
  const nameParts = [provider.name, quality].filter(Boolean);
  const behaviorHints = Object.assign({}, rawStream.behaviorHints || {});
  const detectedSize = streamSizeBytes(rawStream);
  const detailDescription = streamDetailDescription(rawStream, provider);
  const qualityLabel = streamQualityLabel(rawStream);
  const qualityBadge = qualityLabel === "2160p" ? "💎 4K UHD" : qualityLabel === "1080p" ? "🟢 1080P" : qualityLabel === "720p" ? "🔵 720P" : qualityLabel ? `🎞️ ${qualityLabel.toUpperCase()}` : "🎞️ AUTO";
  const neonName = `⚡ DOOM │ ${qualityBadge} │ 🌐 HTTP`;
  const mediaTitle = streamDisplayTitle(rawStream, mediaInfo);
  const neonDetails = detailDescription
    .split("\n")
    .filter(Boolean)
    .map((line) => line.startsWith("⚡ ") ? line.replace(/^⚡ /, "🚀 ") : line)
    .join("\n");
  const description = [mediaTitle ? `🎬 ${mediaTitle}` : "", neonDetails].filter(Boolean).join("\n")
    || rawStream.description || rawStream.title || nameParts.join(" | ");
  const filename = streamFileName(rawStream);

  if (filename && !behaviorHints.filename) {
    behaviorHints.filename = filename;
  }
  if (detectedSize > 0 && !behaviorHints.videoSize) {
    behaviorHints.videoSize = detectedSize;
  }
  if (!behaviorHints.bingeGroup) {
    behaviorHints.bingeGroup = `doomp-${provider.id}-${String(quality || "auto").toLowerCase()}`;
  }
  behaviorHints.doomProviderId = provider.id;
  if (!looksWebReady(targetUrl) || requestHeaders) {
    behaviorHints.notWebReady = true;
  }
  if (requestHeaders) {
    behaviorHints.proxyHeaders = {
      request: requestHeaders
    };
  }

  return {
    name: neonName,
    title: description,
    description,
    url: targetUrl,
    behaviorHints
  };
}

function dedupeStreams(streams) {
  const seen = new Set();
  return streams.filter((stream) => {
    const key = `${stream.url}|${stream.name}|${stream.description}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function withTimeout(promise, ms, label) {
  let timeout;
  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  try {
    return await Promise.race([promise, timer]);
  } finally {
    clearTimeout(timeout);
  }
}

function enrichTrustedProviderStream(rawStream, provider, mediaInfo) {
  const trustedTitleProviders = new Set([
    "moviebox",
    "movieboxhindi",
    "moviebox_yoruix",
    "cinefreak",
    "fibwatch",
    "movies4u",
    "movies4u_murph",
    "netmirror",
    "netmirror_yoruix",
    "flix_streams_lotusvault",
    "flix_streams_archivevault",
    "flix_streams_uhdmovies",
    "flix_streams_4khdhub",
    "flix_streams_hdhub4u",
    "flix_streams_signalvault",
    "flix_streams_usenetvault",
    "flix_streams_streamvault",
    "flix_streams_debridvault",
    "flix_streams_other",
    "flix_streams_vegamovies",
    "playimdb",
    "uhdmovies",
    "uhdmovies_yoruix"
  ]);
  if (!rawStream || !trustedTitleProviders.has(provider.id) || !mediaInfo || !mediaInfo.title) {
    return rawStream;
  }

  const year = mediaInfo.year ? ` ${mediaInfo.year}` : "";
  const quality = rawStream.quality ? ` ${rawStream.quality}` : "";
  return Object.assign({}, rawStream, {
    fileName: rawStream.fileName || rawStream.filename || `${mediaInfo.title}${year}${quality}`.trim()
  });
}

async function collectProviderStreams(provider, parsed, tmdbId, mediaInfo, requestContext = {}) {
  const providerGetStreams = loadProvider(provider);
  const rawStreams = await withTimeout(
    Promise.resolve(providerGetStreams(tmdbId, parsed.mediaType, parsed.season, parsed.episode, parsed.imdbId, requestContext)),
    DEFAULT_TIMEOUT_MS,
    provider.name
  );

  if (isPassthroughProvider(provider)) {
    const passthroughStreamsForProvider = (Array.isArray(rawStreams) ? rawStreams : [])
      .filter((stream) => stream && stream.url);

    if (provider.id === "mediafusion") {
      const mediaFusionStreams = passthroughStreamsForProvider.filter((stream) => {
          if (hasBlockedMediaFusionTag(stream)) {
            console.log(`[MediaFusion] Rejected blocked source tag: ${stream.name || stream.title || stream.url}`);
            return false;
          }
          if (!hasAllowedMediaFusionLanguage(stream)) {
            console.log(`[MediaFusion] Rejected non Hindi/English stream: ${stream.name || stream.title || stream.url}`);
            return false;
          }
          return true;
        });
      return (await filterMediaFusionStreams(mediaFusionStreams))
        .map((stream) => markPassthroughStream(stream, provider));
    }

    return passthroughStreamsForProvider.map((stream) => markPassthroughStream(stream, provider));
  }

  return (Array.isArray(rawStreams) ? rawStreams : [])
    .map((stream) => enrichTrustedProviderStream(stream, provider, mediaInfo))
    .map((stream) => normalizeStream(stream, provider, mediaInfo))
    .filter(Boolean);
}

function startProviderCollection(parsed, tmdbId, mediaInfo, entries, requestContext = {}) {
  const results = [];
  const tasks = entries.map((provider, index) => (
    collectProviderStreams(provider, parsed, tmdbId, mediaInfo, requestContext)
      .then((value) => {
        results[index] = { status: "fulfilled", value };
      })
      .catch((reason) => {
        results[index] = { status: "rejected", reason };
      })
  ));

  const donePromise = Promise.allSettled(tasks).then(() => results);
  return { results, donePromise };
}

function streamsFromProviderResults(providerResults, options = {}) {
  const logFailures = options.logFailures !== false;
  const entries = options.providerEntries || providerEntries;
  return providerResults.flatMap((result, index) => {
    if (!result) {
      return [];
    }
    if (result.status === "fulfilled") {
      return result.value;
    }
    if (logFailures) {
      const provider = entries[index] || { name: "Provider" };
      console.error(`[${provider.name}] ${result.reason.message || result.reason}`);
    }
    return [];
  });
}

function filterRequestedMediaStreams(streams, mediaInfo, parsed) {
  return streams.filter((stream) => {
    if (matchesRequestedMedia(stream, mediaInfo, parsed)) {
      return true;
    }
    console.log(`[Media match] Rejected wrong-title stream: ${stream.name}`);
    return false;
  });
}

function compareStreamSizesAscending(a, b) {
  const sizeA = streamSizeBytes(a);
  const sizeB = streamSizeBytes(b);
  if (sizeA && sizeB && sizeA !== sizeB) {
    return sizeA - sizeB;
  }
  if (sizeA && !sizeB) return -1;
  if (!sizeA && sizeB) return 1;
  return 0;
}

function streamLanguageText(stream) {
  const behaviorHints = stream && stream.behaviorHints;
  return [
    stream && stream.name,
    stream && stream.title,
    stream && stream.description,
    stream && stream.language,
    stream && stream.languages,
    behaviorHints && behaviorHints.filename,
    behaviorHints && behaviorHints.bingeGroup
  ].filter(Boolean).join(" ");
}

function streamLanguageSortRank(stream) {
  const text = streamLanguageText(stream);
  const hasHindi = /\b(?:hindi|hin)\b|🇮🇳/i.test(text);
  const hasEnglish = /\b(?:english|eng)\b|🇬🇧|🇺🇸/i.test(text);
  const hasRegional = /\b(?:punjabi|pun|tamil|tam|telugu|tel|malayalam|mal|kannada|kan)\b/i.test(text);

  if (hasHindi && hasEnglish) return 0;
  if (hasHindi && !hasEnglish && !hasRegional) return 1;
  if (hasHindi && hasRegional) return 2;
  if (hasEnglish) return 3;
  return 4;
}

function streamSourceSortRank(stream) {
  const behaviorHints = stream && stream.behaviorHints;
  const providerId = String(behaviorHints && behaviorHints.doomProviderId || "").toLowerCase();
  const text = [
    providerId,
    stream && stream.name,
    stream && stream.title,
    stream && stream.description,
    stream && stream.url,
    behaviorHints && behaviorHints.bingeGroup
  ].filter(Boolean).join(" ").toLowerCase();

  if (providerId === "torbox" || /\b(?:torbox|stremthru|torrentio|comet|meteor|aiostreams)\b/.test(text)) {
    return 3;
  }
  if (providerId === "mediafusion") {
    return 2;
  }
  if (isPassthroughStream(stream)) {
    return 1;
  }
  return 0;
}

function sortStreams(streams, options = {}) {
  return streams.sort((a, b) => {
    const rankA = streamQualityRank(a);
    const rankB = streamQualityRank(b);
    if (rankA !== rankB) {
      return rankB - rankA;
    }

    const languageRankA = streamLanguageSortRank(a);
    const languageRankB = streamLanguageSortRank(b);
    if (languageRankA !== languageRankB) {
      return languageRankA - languageRankB;
    }

    const sourceRankA = streamSourceSortRank(a);
    const sourceRankB = streamSourceSortRank(b);
    if (sourceRankA !== sourceRankB) {
      return sourceRankA - sourceRankB;
    }

    return compareStreamSizesAscending(a, b);
  });
}

async function finalizeStreams(providerResults, options = {}) {
  const streams = streamsFromProviderResults(providerResults, {
    logFailures: options.logFailures,
    providerEntries: options.providerEntries
  });
  const passthrough = streams.filter(isPassthroughStream);
  const regularStreams = streams.filter((stream) => !isPassthroughStream(stream));
  const mediaMatchedStreams = filterRequestedMediaStreams(regularStreams, options.mediaInfo, options.parsed);
  const playableStreams = await filterPlayableStreams(dedupeStreams(mediaMatchedStreams), {
    mediaInfo: options.mediaInfo,
    parsed: options.parsed,
    probeOnlyRequired: options.probeOnlyRequired,
    probeTimeoutMs: options.probeTimeoutMs
  });
  const qualityMatchedStreams = filterStreamsByQualityBand([...playableStreams, ...passthrough], options.qualityBand);
  return sortStreams(qualityMatchedStreams, { qualityBand: options.qualityBand });
}

async function startStreamBuild(type, id, entries, requestContext = {}) {
  const parsed = parseStremioId(type, id);
  if (!parsed) {
    return null;
  }

  let tmdbId;
  let mediaInfo = null;
  try {
    tmdbId = await resolveTmdbId(parsed.imdbId, parsed.mediaType);
    if (!tmdbId) {
      return null;
    }
    mediaInfo = await resolveMediaInfo(tmdbId, parsed.mediaType);
  } catch (error) {
    console.error(`[TMDB] ${error.message || error}`);
    return null;
  }

  return Object.assign(startProviderCollection(parsed, tmdbId, mediaInfo, entries, requestContext), { parsed, mediaInfo });
}

function providerEntriesForScope(scope) {
  if (!scope || scope === "main") {
    return providerEntries;
  }
  return addonGroupEntries[scope] || null;
}

function scopeHasProvider(scope, providerId) {
  const entries = providerEntriesForScope(scope || "main");
  return Array.isArray(entries) && entries.some((provider) => provider.id === providerId);
}

function entriesHaveProvider(entries, providerId) {
  return Array.isArray(entries) && entries.some((provider) => provider.id === providerId);
}

function isLiveSensitiveProvider(provider) {
  return Boolean(provider && (provider.id === "aiostreams" || provider.id === "torbox"));
}

function sharedProviderEntriesFor(entries) {
  return entries.filter((provider) => !isLiveSensitiveProvider(provider));
}

function liveProviderEntriesFor(entries) {
  return entries.filter(isLiveSensitiveProvider);
}

function sharedMasterCacheKey(type, id) {
  return streamCacheKey(type, id, QUALITY_SHARED_CACHE_SCOPE);
}

function finalizedBuild(type, id, entries, requestContext = {}, options = {}) {
  const buildStatePromise = startStreamBuild(type, id, entries, {
    requestHeaders: requestContext.requestHeaders || {}
  });

  const fullPromise = buildStatePromise
    .then(async (state) => {
      if (!state) {
        return [];
      }
      await state.donePromise;
      return finalizeStreams(state.results, {
        logFailures: options.logFailures !== false,
        mediaInfo: state.mediaInfo,
        parsed: state.parsed,
        providerEntries: entries,
        probeOnlyRequired: true,
        probeTimeoutMs: options.probeTimeoutMs,
        qualityBand: options.qualityBand || ""
      });
    })
    .catch((error) => {
      console.error(`[Stream build] ${options.cacheKey || `${type}:${id}`}: ${error.message || error}`);
      return [];
    });

  const makeFastPromise = (fallbackToFull) => buildStatePromise
    .then(async (state) => {
      if (!state) {
        return [];
      }

      await Promise.race([
        state.donePromise,
        delay(Math.max(0, options.fastWaitMs || STREAM_FAST_PROVIDER_WAIT_MS))
      ]);

      const providerResults = state.results.filter(Boolean);
      const fastProbeTimeoutMs = options.fastProbeTimeoutMs || (
        entries.some((provider) => provider.id.startsWith("flix_streams_"))
          ? STREAM_PROBE_TIMEOUT_MS
          : STREAM_FAST_PROBE_TIMEOUT_MS
      );
      const streams = await finalizeStreams(providerResults, {
        logFailures: false,
        mediaInfo: state.mediaInfo,
        parsed: state.parsed,
        providerEntries: entries,
        probeOnlyRequired: true,
        probeTimeoutMs: options.probeTimeoutMs || fastProbeTimeoutMs,
        qualityBand: options.qualityBand || ""
      });

      if (streams.length > 0) {
        console.log(`[Stream fast] Returning ${streams.length} early streams for ${options.cacheKey || `${type}:${id}`}`);
        return streams;
      }

      return fallbackToFull ? fullPromise : [];
    })
    .catch((error) => {
      console.error(`[Stream fast] ${options.cacheKey || `${type}:${id}`}: ${error.message || error}`);
      return fallbackToFull ? fullPromise : [];
    });
  const fastPromise = makeFastPromise(true);
  const firstBatchPromise = makeFastPromise(false);

  return { fullPromise, fastPromise, firstBatchPromise };
}

function qualitySortFromStreams(streams, qualityBand) {
  return sortStreams(filterStreamsByQualityBand(streams.slice(), qualityBand), { qualityBand });
}

async function collectResolvedStreamsByDeadline(streamPromises, timeoutMs) {
  const results = [];
  const pending = streamPromises.map((promise, index) => Promise.resolve(promise)
    .then((streams) => {
      if (Array.isArray(streams)) {
        results[index] = streams;
      } else {
        results[index] = [];
      }
    })
    .catch((error) => {
      console.error(`[Stream quality] Batch ${index + 1}: ${error.message || error}`);
      results[index] = [];
    }));

  await Promise.race([
    Promise.all(pending),
    delay(Math.max(0, timeoutMs))
  ]);

  pending.forEach((promise) => promise.catch(() => {}));
  return results.flatMap((streams) => streams || []);
}

async function collectFirstNonEmptyStreamsByDeadline(streamPromises, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let remaining = streamPromises.length;
    const finish = (streams) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(Array.isArray(streams) ? streams : []);
    };
    const timer = setTimeout(() => finish([]), Math.max(0, timeoutMs));

    streamPromises.forEach((promise, index) => {
      Promise.resolve(promise)
        .then((streams) => {
          if (Array.isArray(streams) && streams.length > 0) {
            finish(streams);
            return;
          }
          remaining -= 1;
          if (remaining === 0) {
            finish([]);
          }
        })
        .catch((error) => {
          console.error(`[Stream quality] Full batch ${index + 1}: ${error.message || error}`);
          remaining -= 1;
          if (remaining === 0) {
            finish([]);
          }
        });
    });
  });
}

function getSharedMasterBuild(type, id, entries, requestContext = {}) {
  const sharedEntries = sharedProviderEntriesFor(entries);
  const sharedKey = sharedMasterCacheKey(type, id);
  let sharedFullPromise = Promise.resolve([]);
  let sharedFastPromise = sharedFullPromise;
  let sharedFirstBatchPromise = sharedFullPromise;
  const cachedSharedStreams = sharedEntries.length ? cachedStreams(sharedKey) : null;

  if (cachedSharedStreams) {
    console.log(`[Stream cache] Hit for ${sharedKey} (${cachedSharedStreams.length} streams)`);
    sharedFullPromise = Promise.resolve(cachedSharedStreams);
    sharedFastPromise = sharedFullPromise;
    sharedFirstBatchPromise = sharedFullPromise;
  } else if (sharedEntries.length > 0 && streamInflight.has(sharedKey)) {
    console.log(`[Stream cache] Joining shared quality build for ${sharedKey}`);
    const inflight = streamInflight.get(sharedKey);
    sharedFullPromise = inflight.fullPromise;
    sharedFastPromise = inflight.fastPromise || inflight.fullPromise;
    sharedFirstBatchPromise = inflight.firstBatchPromise || sharedFastPromise;
  } else if (sharedEntries.length > 0) {
    const sharedBuild = finalizedBuild(type, id, sharedEntries, requestContext, {
      cacheKey: sharedKey,
      fastProbeTimeoutMs: STREAM_FAST_PROBE_TIMEOUT_MS,
      fastWaitMs: QUALITY_TV_FAST_WAIT_MS
    });
    sharedFullPromise = sharedBuild.fullPromise
      .then((streams) => {
        rememberStreams(sharedKey, streams);
        return streams;
      })
      .finally(() => {
        streamInflight.delete(sharedKey);
      });
    sharedFastPromise = sharedBuild.fastPromise;
    sharedFirstBatchPromise = sharedBuild.firstBatchPromise;
    streamInflight.set(sharedKey, {
      fullPromise: sharedFullPromise,
      fastPromise: sharedFastPromise,
      firstBatchPromise: sharedFirstBatchPromise
    });
  }

  return {
    fullPromise: sharedFullPromise,
    fastPromise: sharedFastPromise,
    firstBatchPromise: sharedFirstBatchPromise
  };
}

function prewarmSharedMaster(type, id, entries, requestContext = {}) {
  const sharedEntries = sharedProviderEntriesFor(entries);
  if (sharedEntries.length === 0) {
    return;
  }

  const sharedKey = sharedMasterCacheKey(type, id);
  if (cachedStreams(sharedKey) || streamInflight.has(sharedKey)) {
    return;
  }

  const build = getSharedMasterBuild(type, id, entries, requestContext);
  build.fullPromise.catch((error) => {
    console.error(`[Stream prewarm] ${sharedKey}: ${error.message || error}`);
  });
}

async function getQualityBandStreams(type, id, entries, qualityBand, requestContext = {}) {
  const sharedBuild = getSharedMasterBuild(type, id, entries, requestContext);
  const liveEntries = liveProviderEntriesFor(entries);
  const liveBuild = liveEntries.length > 0
    ? finalizedBuild(type, id, liveEntries, requestContext, {
      cacheKey: streamCacheKey(type, id, `${QUALITY_SHARED_CACHE_SCOPE}:live`),
      fastProbeTimeoutMs: STREAM_FAST_PROBE_TIMEOUT_MS,
      fastWaitMs: STREAM_LIVE_FIRST_BATCH_WAIT_MS
    })
    : { fullPromise: Promise.resolve([]), fastPromise: Promise.resolve([]) };

  const sharedStreamsPromise = sharedBuild.firstBatchPromise || sharedBuild.fullPromise;
  const liveStreamsPromise = liveBuild.firstBatchPromise || liveBuild.fastPromise || liveBuild.fullPromise;
  const initialStreams = await collectResolvedStreamsByDeadline(
    [sharedStreamsPromise, liveStreamsPromise],
    QUALITY_RESPONSE_WAIT_MS
  );
  if (initialStreams.length > 0) {
    return qualitySortFromStreams(initialStreams, qualityBand);
  }

  const fallbackStreams = await collectFirstNonEmptyStreamsByDeadline(
    [liveBuild.fullPromise, sharedBuild.fullPromise],
    QUALITY_EMPTY_FALLBACK_WAIT_MS
  );
  return qualitySortFromStreams(fallbackStreams, qualityBand);
}

async function getStreams(type, id, options = {}) {
  const scope = options.scope || "main";
  if (scope === "live") {
    return getLiveStreams(type, id);
  }
  const entries = providerEntriesForScope(scope);
  if (!entries) {
    return null;
  }
  const group = addonGroups[scope] || {};
  const qualityBand = options.qualityBand || group.qualityBand || "";
  const requestContext = {
    requestHeaders: options.requestHeaders || {}
  };

  if (SHARED_PREWARM_SCOPES.has(scope)) {
    prewarmSharedMaster(type, id, providerEntries, requestContext);
  }

  if (qualityBand) {
    return getQualityBandStreams(type, id, entries, qualityBand, requestContext);
  }

  if (scope === "main") {
    const sharedBuild = getSharedMasterBuild(type, id, providerEntries, requestContext);
    const liveEntries = liveProviderEntriesFor(providerEntries);
    const liveProviderIds = new Set(liveEntries.map((provider) => provider.id));
    const liveBuild = liveEntries.length > 0
      ? finalizedBuild(type, id, liveEntries, requestContext, {
        cacheKey: streamCacheKey(type, id, `${scope}:live`),
        fastProbeTimeoutMs: STREAM_FAST_PROBE_TIMEOUT_MS,
        fastWaitMs: STREAM_LIVE_FIRST_BATCH_WAIT_MS
      })
      : { fullPromise: Promise.resolve([]), fastPromise: Promise.resolve([]) };
    const sharedStreamsPromise = sharedBuild.firstBatchPromise || sharedBuild.fullPromise;
    const liveStreamsPromise = liveBuild.firstBatchPromise || liveBuild.fastPromise || liveBuild.fullPromise;
    const initialStreams = await collectResolvedStreamsByDeadline(
      [sharedStreamsPromise, liveStreamsPromise],
      QUALITY_RESPONSE_WAIT_MS
    );
    const hasLiveStreams = initialStreams.some((stream) => liveProviderIds.has(streamProviderId(stream)));
    if (liveEntries.length > 0 && !hasLiveStreams) {
      const liveFallbackStreams = await collectFirstNonEmptyStreamsByDeadline(
        [liveBuild.fullPromise],
        QUALITY_EMPTY_FALLBACK_WAIT_MS
      );
      if (liveFallbackStreams.length > 0) {
        return sortStreams([...initialStreams, ...liveFallbackStreams]);
      }
    }
    if (initialStreams.length > 0) {
      return sortStreams(initialStreams);
    }

    const fallbackStreams = await collectFirstNonEmptyStreamsByDeadline(
      [liveBuild.fullPromise, sharedBuild.fullPromise],
      QUALITY_EMPTY_FALLBACK_WAIT_MS
    );
    return sortStreams(fallbackStreams);
  }

  const hasTorbox = entriesHaveProvider(entries, "torbox");
  const useFastResponse = !group.waitForFull && !hasTorbox;
  const cacheStreamsForScope = useFastResponse
    && !entries.some((provider) => provider.id === "aiostreams" || provider.id === "torbox");

  const key = streamCacheKey(type, id, scope);
  if (cacheStreamsForScope) {
    const cached = cachedStreams(key);
    if (cached) {
      console.log(`[Stream cache] Hit for ${key} (${cached.length} streams)`);
      return cached;
    }
  }

  if (streamInflight.has(key)) {
    console.log(`[Stream cache] Joining in-flight request for ${key}`);
    const inFlight = streamInflight.get(key);
    return useFastResponse ? inFlight.fastPromise : inFlight.fullPromise;
  }

  const build = finalizedBuild(type, id, entries, {
    requestHeaders: requestContext.requestHeaders
  }, {
    cacheKey: key
  });
  const fullPromise = build.fullPromise
    .then((streams) => {
      if (cacheStreamsForScope) {
        rememberStreams(key, streams);
      }
      return streams;
    })
    .finally(() => {
      streamInflight.delete(key);
    });
  const fastPromise = build.fastPromise;

  streamInflight.set(key, { fullPromise, fastPromise });
  return useFastResponse ? Promise.race([fullPromise, fastPromise]) : fullPromise;
}

module.exports = {
  manifest,
  addonManifests,
  addonGroups,
  getCatalog,
  getMeta,
  getStreams,
  scopeHasProvider,
  parseStremioId,
  resolveTmdbId,
  normalizeStream
};
