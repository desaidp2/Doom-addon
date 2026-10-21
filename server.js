"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { manifest, addonManifests, getCatalog, getMeta, getStreams, scopeHasProvider, parseStremioId } = require("./addon");
const aioStreamsProvider = require("./providers/aiostreams");

const PORT = Number(process.env.PORT || 7000);
const HOST = process.env.HOST || "0.0.0.0";
const ASSETS_DIR = path.join(__dirname, "assets");
const AIO_REDIRECT_TTL_MS = Number(process.env.AIO_REDIRECT_TTL_MS || 30 * 60 * 1000);
const AIO_REDIRECT_PREWARM_LIMIT = Number(process.env.AIO_REDIRECT_PREWARM_LIMIT || 12);
const AIO_REDIRECT_MAX_HOPS = Number(process.env.AIO_REDIRECT_MAX_HOPS || 5);
const aioRedirectEntries = new Map();

function sendJson(response, statusCode, payload, cacheSeconds = 0) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text)
  });
  response.end(text);
}

function sendFile(response, statusCode, filePath, contentType, cacheSeconds = 0) {
  const body = fs.readFileSync(filePath);
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": contentType,
    "Cache-Control": cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store",
    "Content-Length": body.length
  });
  response.end(body);
}

function parseStreamPath(pathname) {
  const match = pathname.match(/^\/(?:addons\/([^/]+)\/)?stream\/([^/]+)\/(.+)\.json$/);
  if (!match) {
    return null;
  }

  return {
    scope: match[1] ? decodeURIComponent(match[1]) : "main",
    type: decodeURIComponent(match[2]),
    id: decodeURIComponent(match[3])
  };
}

function parseAddonManifestPath(pathname) {
  const match = pathname.match(/^\/addons\/([^/]+)\/manifest\.json$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseCatalogPath(pathname) {
  const match = pathname.match(/^\/addons\/([^/]+)\/catalog\/([^/]+)\/([^/]+)(?:\/(.+))?\.json$/);
  if (!match) {
    return null;
  }

  return {
    scope: decodeURIComponent(match[1]),
    type: decodeURIComponent(match[2]),
    id: decodeURIComponent(match[3]),
    extra: match[4] ? decodeURIComponent(match[4]) : ""
  };
}

function parseMetaPath(pathname) {
  const match = pathname.match(/^\/addons\/([^/]+)\/meta\/([^/]+)\/(.+)\.json$/);
  if (!match) {
    return null;
  }

  return {
    scope: decodeURIComponent(match[1]),
    type: decodeURIComponent(match[2]),
    id: decodeURIComponent(match[3])
  };
}

function parseAioRedirectPath(pathname) {
  const match = pathname.match(/^\/aio-redirect\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function cleanupAioRedirectEntries() {
  const now = Date.now();
  for (const [token, entry] of aioRedirectEntries) {
    if (!entry || entry.expiresAt <= now) {
      aioRedirectEntries.delete(token);
    }
  }
}

function isAioPlaybackUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:"
      && parsed.hostname === "aiostreams.elfhosted.com"
      && parsed.pathname.startsWith("/playback/");
  } catch {
    return false;
  }
}

function aioStreamFingerprint(stream) {
  const hints = stream && stream.behaviorHints;
  return {
    videoHash: hints && hints.videoHash ? String(hints.videoHash) : "",
    filename: hints && hints.filename ? String(hints.filename) : "",
    videoSize: hints && hints.videoSize ? String(hints.videoSize) : "",
    name: stream && stream.name ? String(stream.name) : "",
    description: stream && stream.description ? String(stream.description) : String(stream && stream.title || "")
  };
}

function aioFingerprintScore(expected, candidate) {
  const current = aioStreamFingerprint(candidate);
  let score = 0;
  if (expected.videoHash && current.videoHash && expected.videoHash === current.videoHash) score += 100;
  if (expected.filename && current.filename && expected.filename === current.filename) score += 40;
  if (expected.videoSize && current.videoSize && expected.videoSize === current.videoSize) score += 20;
  if (expected.name && current.name && expected.name === current.name) score += 10;
  if (expected.description && current.description && expected.description === current.description) score += 5;
  return score;
}

function prewarmAioRedirect(entry) {
  if (!entry || entry.handoffUrl || entry.handoffPromise) {
    return;
  }

  entry.handoffPromise = resolveAioHandoffUrl(entry.fallbackUrl)
    .then((location) => {
      entry.handoffUrl = location;
      return location;
    })
    .catch((error) => {
      console.error(`[AIOStreams] Handoff prewarm failed: ${error.message || error}`);
      return entry.fallbackUrl;
    })
    .finally(() => {
      entry.handoffPromise = null;
    });
}

function rememberAioRedirect(stream, streamRequest, shouldPrewarm = false) {
  cleanupAioRedirectEntries();
  const token = crypto.randomUUID();
  const entry = {
    type: streamRequest.type,
    id: streamRequest.id,
    fingerprint: aioStreamFingerprint(stream),
    fallbackUrl: stream.url,
    handoffUrl: "",
    handoffPromise: null,
    expiresAt: Date.now() + AIO_REDIRECT_TTL_MS
  };
  aioRedirectEntries.set(token, entry);
  if (shouldPrewarm) {
    prewarmAioRedirect(entry);
  }
  return token;
}

function redirectAioStreams(streams, streamRequest, origin) {
  if (!Array.isArray(streams) || streams.length === 0) {
    return streams;
  }

  let prewarmCount = 0;
  return streams.map((stream) => {
    if (!stream || typeof stream !== "object" || !isAioPlaybackUrl(stream.url)) {
      return stream;
    }

    const shouldPrewarm = prewarmCount < AIO_REDIRECT_PREWARM_LIMIT;
    prewarmCount += 1;
    const token = rememberAioRedirect(stream, streamRequest, shouldPrewarm);
    return Object.assign({}, stream, {
      url: `${origin}/aio-redirect/${encodeURIComponent(token)}`
    });
  });
}

async function freshAioPlaybackUrl(entry) {
  const parsed = parseStremioId(entry.type, entry.id);
  if (!parsed) {
    return entry.fallbackUrl;
  }

  const streams = await aioStreamsProvider.getStreams(
    "",
    parsed.mediaType,
    parsed.season,
    parsed.episode,
    parsed.imdbId
  );
  const candidates = Array.isArray(streams) ? streams.filter((stream) => stream && stream.url) : [];
  if (candidates.length === 0) {
    return entry.fallbackUrl;
  }

  const ranked = candidates
    .map((stream) => ({ stream, score: aioFingerprintScore(entry.fingerprint, stream) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0] && ranked[0].score > 0 ? ranked[0].stream.url : candidates[0].url;
}

async function resolveAioHandoffUrl(playbackUrl) {
  if (!isAioPlaybackUrl(playbackUrl)) {
    return playbackUrl;
  }

  let currentUrl = playbackUrl;
  for (let hop = 0; hop < AIO_REDIRECT_MAX_HOPS; hop += 1) {
    const response = await fetch(currentUrl, {
      headers: {
        "Accept": "*/*",
        "Range": "bytes=0-1",
        "User-Agent": "Doom-addon/1.0"
      },
      redirect: "manual"
    });

    if (response.body && typeof response.body.cancel === "function") {
      await response.body.cancel().catch(() => {});
    }

    const location = response.headers.get("location");
    if (location && response.status >= 300 && response.status < 400) {
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return currentUrl;
  }

  return currentUrl;
}

async function handleAioRedirect(response, token) {
  cleanupAioRedirectEntries();
  const entry = aioRedirectEntries.get(token);
  if (!entry) {
    sendJson(response, 410, { error: "AIO playback URL expired" });
    return;
  }

  let location = entry.handoffUrl;
  if (!location && entry.handoffPromise) {
    location = await entry.handoffPromise;
  }
  if (!location) {
    const playbackUrl = await freshAioPlaybackUrl(entry);
    location = await resolveAioHandoffUrl(playbackUrl);
    entry.handoffUrl = location;
  }
  response.writeHead(302, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Location": location
  });
  response.end();
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS"
      });
      response.end();
      return;
    }

    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    const aioRedirectToken = parseAioRedirectPath(url.pathname);
    if (aioRedirectToken) {
      await handleAioRedirect(response, aioRedirectToken);
      return;
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      sendText(
        response,
        200,
        [
          "Doom-addon Stremio add-on is running.",
          `Install URL: ${url.origin}/manifest.json`,
          `Umbrella M: ${url.origin}/addons/murph/manifest.json`,
          `Umbrella Y: ${url.origin}/addons/yoruix/manifest.json`,
          `Umbrella D: ${url.origin}/addons/d3adlyrocket/manifest.json`,
          `Umbrella F: ${url.origin}/addons/flixnest/manifest.json`,
          `Torbox: ${url.origin}/addons/torbox/manifest.json`,
          `Umbrella MF: ${url.origin}/addons/mediafusion/manifest.json`,
          `Umbrella AIO: ${url.origin}/addons/aiostreams/manifest.json`,
          `4K UHD: ${url.origin}/addons/quality-4k/manifest.json`,
          `FHD: ${url.origin}/addons/quality-1080/manifest.json`,
          `HD: ${url.origin}/addons/quality-low/manifest.json`,
          `Live: ${url.origin}/addons/live/manifest.json`,
          ""
        ].join("\n")
      );
      return;
    }

    if (url.pathname === "/assets/umbrella-icon.png") {
      sendFile(response, 200, path.join(ASSETS_DIR, "umbrella-icon.png"), "image/png", 86400);
      return;
    }

    if (url.pathname === "/manifest.json") {
      sendJson(response, 200, manifest, 3600);
      return;
    }

    const addonManifestScope = parseAddonManifestPath(url.pathname);
    if (addonManifestScope) {
      const scopedManifest = addonManifests[addonManifestScope];
      if (!scopedManifest) {
        sendJson(response, 404, { error: "Add-on group not found" });
        return;
      }
      sendJson(response, 200, scopedManifest, 3600);
      return;
    }

    const catalogRequest = parseCatalogPath(url.pathname);
    if (catalogRequest) {
      const catalog = await getCatalog(catalogRequest.scope, catalogRequest.type, catalogRequest.id, catalogRequest.extra);
      if (!catalog) {
        sendJson(response, 404, { error: "Catalog not found" });
        return;
      }
      sendJson(response, 200, catalog, 300);
      return;
    }

    const metaRequest = parseMetaPath(url.pathname);
    if (metaRequest) {
      const meta = await getMeta(metaRequest.scope, metaRequest.type, metaRequest.id);
      if (!meta) {
        sendJson(response, 404, { error: "Metadata not found" });
        return;
      }
      sendJson(response, 200, meta, 300);
      return;
    }

    const streamRequest = parseStreamPath(url.pathname);
    if (streamRequest) {
      const streams = await getStreams(streamRequest.type, streamRequest.id, {
        scope: streamRequest.scope,
        requestHeaders: request.headers
      });
      if (!streams) {
        sendJson(response, 404, { error: "Add-on group not found" });
        return;
      }
      const disableStreamCache = streamRequest.scope === "live"
        || scopeHasProvider(streamRequest.scope, "aiostreams")
        || scopeHasProvider(streamRequest.scope, "torbox");
      const cacheSeconds = disableStreamCache ? 0 : 300;
      const responseStreams = scopeHasProvider(streamRequest.scope, "aiostreams")
        ? redirectAioStreams(streams, streamRequest, url.origin)
        : streams;
      sendJson(response, 200, { streams: responseStreams }, cacheSeconds);
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`Doom-addon Stremio add-on listening on http://${displayHost}:${PORT}`);
});
