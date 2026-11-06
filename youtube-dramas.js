"use strict";

const SHOW_ID = "doomyt:mitti-de-baway";
const SHOW_NAME = "Mitti De Baway";
const SHOW_URL = "https://www.youtube.com/show/VLPLBRSUhnf-g1I?sbp=KgtQNHp5WkFsMzBUb0AB";
const REFRESH_MS = 30 * 60 * 1000;
const INITIAL_IDS = [
  "P4zyZAl30To", "sEms255DVP8", "uWYuQN7kc1I", "6kITzssrw-g",
  "-kB2fiiVslc", "ptDYBfgtUiE", "RbIzLXj8jX0", "dgV7wo5hcqE",
  "w5mgqV7uoc0", "X_pQL6wtoy0", "Kf2sbyyKaZs", "nemL6kplRlc"
];
const INITIAL_DATES = [
  "09-23", "09-24", "09-30", "10-01", "10-07", "10-08",
  "10-14", "10-15", "10-21", "10-22", "10-28", "10-29"
];
const SHOWS = [
  { id: SHOW_ID, name: SHOW_NAME, url: SHOW_URL, channel: "Green TV", ids: INITIAL_IDS, dates: INITIAL_DATES },
  {
    id: "doomyt:mohabbat", name: "Mohabbat", channel: "HAR PAL GEO",
    url: "https://www.youtube.com/show/VLPLQoBq1R3C8rI?sbp=Kgt1dVpRLUpnS1Qyc0AB",
    ids: ["uuZQ-JgKT2s", "yzjt0_tnNTY", "GGwU3PM7Ei0", "gw3Qya-AaS4", "Kc6JezV_1oY",
      "0cv2d_cjqwc", "UCKE8nvOkwI", "8wDHyimd1hU", "QCtFMNmES7I", "O6QUsYrGFNM"],
    dates: ["09-28", "09-29", "10-05", "10-06", "10-12", "10-13", "10-19", "10-20", "10-26", "10-27"]
  },
  {
    id: "doomyt:dar-e-nijaat", name: "Dar-e-Nijaat", channel: "ARY Digital",
    url: "https://www.youtube.com/playlist?list=PLSRofOhAwpGU",
    ids: ["0ZYscAm2xrA", "qfz_A3fhI3Q", "lAIiyy3wExc", "DLSZCkBTNxs", "7Rmnsy_7hAs",
      "VxbFxMgEt_Y", "3OFlaPUXXpk", "MhhOequ5apI", "PVSP_kYdGf4", "EVR3vZO2huM",
      "aAf4XnntclM", "0H6OWcftMFk", "Ngo-ziTHKgw", "SapJNU47328", "4Bl6xA5gIxo",
      "67Fio2zNEDE", "roLUcTdB0Ak", "IDx0kRC4vcY", "o_JLuP5pDVM", "WanDB4fRvOs",
      "unIudLtH-Js", "TgmLGIfqssg", "ebioxADOBOw", "tMwTz2a72cw", "X6qfF2t9fmQ",
      "dIssXLq1KLQ", "8pt_ru3Y-K8"],
    dates: ["08-01", "08-07", "08-08", "08-14", "08-15", "08-21", "08-22", "08-28", "08-29",
      "09-04", "09-05", "09-11", "09-12", "09-18", "09-19", "09-25", "09-26",
      "10-02", "10-03", "10-09", "10-10", "10-16", "10-17", "10-23", "10-24", "10-30", "10-31"]
  },
  {
    id: "doomyt:hurmat", name: "Hurmat", channel: "HUM TV",
    url: "https://www.youtube.com/show/VLPLUhXU7qvJUJ0?sbp=QAE%253D",
    ids: ["YXWuZKn452A", "Rb55pU43mw0", "uY8hogzkLB8", "IBQ3xgoCUqs", "U0W2RJOkvkw",
      "DTyP7i3CYq4", "w6hU2MPkgik", "O5zs__9FJsM"],
    dates: ["10-05", "10-06", "10-12", "10-13", "10-19", "10-20", "10-26", "10-27"]
  }
];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function episodeMeta(videoId, episode, title, released, showId = SHOW_ID) {
  return {
    id: `${showId}:1:${episode}`,
    season: 1,
    episode,
    title,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    ...(released ? { released } : {}),
    videoId
  };
}

function text(value) {
  return value?.simpleText || (value?.runs || []).map((run) => run.text || "").join("");
}

function searchKey(value) {
  return value.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function visit(value, callback) {
  if (!value || typeof value !== "object") return;
  callback(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") visit(child, callback);
  }
}

function extractInitialData(html) {
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const assignment = match[1].match(/^\s*(?:var\s+)?ytInitialData\s*=\s*([\s\S]+?);?\s*$/);
    if (assignment) return JSON.parse(assignment[1]);
  }
  throw new Error("YouTube episode listing is unavailable");
}

function listedEpisodes(payload, show = SHOWS[0]) {
  const episodes = new Map();
  const escapedName = show.name.split(/[\s-]+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s-]+");
  const episodePattern = new RegExp(`^${escapedName}\\s+(?:-\\s*)?(?:Episode|Ep)\\s*[.:-]?\\s*(\\d+)\\b`, "i");
  let continuation = "";
  visit(payload, (node) => {
    const renderer = node.playlistVideoRenderer || node.videoRenderer || lockupVideo(node.lockupViewModel);
    if (renderer) {
      const title = text(renderer.title);
      const match = title.match(episodePattern);
      const seconds = Number(renderer.lengthSeconds) || text(renderer.lengthText).split(":")
        .reduce((total, part) => total * 60 + Number(part), 0);
      const upcoming = Number(renderer.upcomingEventData?.startTime) * 1000 > Date.now();
      if (!match || !/^[A-Za-z0-9_-]{11}$/.test(renderer.videoId || "")
          || renderer.isPlayable === false || upcoming || seconds < 600
          || /\b(?:teaser|promo|trailer|preview|recap|highlights?|coming\s+soon)\b/i.test(title)) return;
      const episode = Number(match[1]);
      if (episode < 1) return;
      const date = title.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)\s+(\d{4}|\d{2})\b/i);
      let released;
      if (date) {
        const year = date[3].length === 2 ? `20${date[3]}` : date[3];
        const month = String(MONTHS.indexOf(date[2].slice(0, 3).toLowerCase()) + 1).padStart(2, "0");
        released = `${year}-${month}-${date[1].padStart(2, "0")}T00:00:00.000Z`;
      }
      if (!episodes.has(episode)) episodes.set(episode, episodeMeta(renderer.videoId, episode, title, released, show.id));
    }
    const endpoint = node.continuationItemRenderer?.continuationEndpoint;
    if (endpoint?.continuationCommand?.token) continuation = endpoint.continuationCommand.token;
  });
  return { episodes: [...episodes.values()], continuation };
}

function lockupVideo(lockup) {
  if (lockup?.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return null;
  let duration = "";
  visit(lockup.contentImage, (node) => {
    const badge = node.thumbnailBadgeViewModel?.text;
    if (/^\d+(?::\d{2}){1,2}$/.test(badge || "")) duration = badge;
  });
  return {
    videoId: lockup.contentId,
    title: { simpleText: lockup.metadata?.lockupMetadataViewModel?.title?.content || "" },
    lengthText: { simpleText: duration }
  };
}

function createShowSource(show, { fetchImpl = global.fetch, refreshMs = REFRESH_MS } = {}) {
  let episodes = show.ids.map((id, index) => episodeMeta(
    id, index + 1, `${show.name} - Episode ${index + 1}`,
    `2026-${show.dates[index]}T00:00:00.000Z`, show.id
  ));
  let lastAttempt = 0;
  let pending = null;

  function refresh() {
    if (pending) return pending;
    lastAttempt = Date.now();
    pending = (async () => {
      const signal = AbortSignal.timeout(20000);
      const response = await fetchImpl(show.url, { signal, headers: { "Accept-Language": "en-US,en;q=0.9" } });
      if (!response.ok) throw new Error(`YouTube listing returned HTTP ${response.status}`);
      const html = await response.text();
      let page = listedEpisodes(extractInitialData(html), show);
      const found = new Map(page.episodes.map((episode) => [episode.episode, episode]));
      const seen = new Set();
      const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/)?.[1];
      while (page.continuation) {
        if (!clientVersion || seen.has(page.continuation) || seen.size >= 25) {
          throw new Error("Could not finish the YouTube episode listing");
        }
        seen.add(page.continuation);
        const next = await fetchImpl("https://www.youtube.com/youtubei/v1/browse", {
          method: "POST", signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: { client: { clientName: "WEB", clientVersion, hl: "en", gl: "US" } },
            continuation: page.continuation
          })
        });
        if (!next.ok) throw new Error(`YouTube continuation returned HTTP ${next.status}`);
        page = listedEpisodes(await next.json(), show);
        for (const episode of page.episodes) {
          if (!found.has(episode.episode)) found.set(episode.episode, episode);
        }
      }
      if (found.size === 0) throw new Error("No full episodes in YouTube response; keeping previous list");
      episodes = [...found.values()].sort((a, b) => a.episode - b.episode);
      return true;
    })().catch((error) => {
      console.error(`[Dramas: ${show.name}] ${error.message}`);
      return false;
    }).finally(() => { pending = null; });
    return pending;
  }

  function ensureRefresh() {
    if (!lastAttempt || Date.now() - lastAttempt >= refreshMs) void refresh();
  }

  const poster = `https://i.ytimg.com/vi/${show.ids[0]}/hqdefault.jpg`;
  const titleKey = searchKey(show.name);
  function showMeta() {
    return {
      id: show.id, type: "series", name: show.name,
      poster, posterShape: "landscape", background: poster,
      description: `${show.name} - official full episodes from ${show.channel} on YouTube.`,
      genres: ["Drama"], releaseInfo: "2026-", language: "Urdu", country: "Pakistan",
      behaviorHints: { defaultVideoId: null }
    };
  }

  return {
    refresh,
    getCatalog(type, id, extra = "") {
      if (type !== "series" || id !== "youtube-dramas") return null;
      ensureRefresh();
      const params = new URLSearchParams(extra);
      const query = (params.get("search") || "").trim();
      const search = searchKey(query);
      const matches = !query || (search.length > 0 && titleKey.includes(search));
      return { metas: Number(params.get("skip") || 0) > 0 || !matches ? [] : [showMeta()] };
    },
    getMeta(type, id) {
      if (type !== "series" || id !== show.id) return null;
      ensureRefresh();
      return { meta: { ...showMeta(), videos: episodes.map(({ videoId, ...video }) => video) } };
    },
    getStreams(type, id) {
      if (type !== "series") return [];
      ensureRefresh();
      const episode = episodes.find((video) => video.id === id);
      return episode ? [{
        name: `YouTube - ${show.channel}`, title: episode.title, ytId: episode.videoId,
        behaviorHints: { bingeGroup: show.id }
      }] : [];
    },
    start() {
      ensureRefresh();
      const timer = setInterval(ensureRefresh, refreshMs);
      timer.unref();
      return () => clearInterval(timer);
    }
  };
}

function createDramaSource({ shows = SHOWS, ...options } = {}) {
  const sources = shows.map((show) => ({ show, source: createShowSource(show, options) }));
  return {
    refresh: async () => (await Promise.all(sources.map(({ source }) => source.refresh()))).every(Boolean),
    getCatalog(type, id, extra = "") {
      if (type !== "series" || id !== "youtube-dramas") return null;
      return { metas: sources.flatMap(({ source }) => source.getCatalog(type, id, extra).metas) };
    },
    getMeta(type, id) {
      return sources.find(({ show }) => show.id === id)?.source.getMeta(type, id) || null;
    },
    getStreams(type, id) {
      return sources.find(({ show }) => id.startsWith(`${show.id}:`))?.source.getStreams(type, id) || [];
    },
    start() {
      const stops = sources.map(({ source }) => source.start());
      return () => stops.forEach((stop) => stop());
    }
  };
}

module.exports = { createDramaSource, extractInitialData, listedEpisodes, SHOW_ID, SHOWS };
