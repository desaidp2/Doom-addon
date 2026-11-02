"use strict";

const assert = require("node:assert/strict");
const { createDramaSource, extractInitialData, listedEpisodes, SHOW_ID, SHOWS } = require("../youtube-dramas");

function renderer(episode, overrides = {}) {
  return { playlistVideoRenderer: {
    videoId: "P4zyZAl30To", title: { simpleText: `Mitti De Baway Ep ${episode} (Sub) 23 Sep 26 | Green TV` },
    lengthSeconds: "1920", isPlayable: true, ...overrides
  } };
}
function html(payload) {
  return `<script>var ytInitialData = ${JSON.stringify(payload)};</script><script>var config={"INNERTUBE_CLIENT_VERSION":"test"};</script>`;
}

async function main() {
  const entries = [renderer(1), renderer(2), renderer(2), renderer(3, { isPlayable: false }),
    renderer(4, { title: { simpleText: "Mitti De Baway Ep 4 Promo" } }),
    renderer(5, { lengthSeconds: "90" }), renderer(6, { videoId: "invalid" }),
    renderer(7, { upcomingEventData: { startTime: String(Date.now() / 1000 + 60000) } }),
    renderer(8, { title: { simpleText: "Another Drama Ep 8" } })];
  const parsed = listedEpisodes(extractInitialData(html({ entries })));
  assert.deepEqual(parsed.episodes.map((episode) => episode.episode), [1, 2]);
  assert.equal(parsed.episodes[0].released, "2026-09-23T00:00:00.000Z");
  assert.throws(() => extractInitialData("<html>Consent required</html>"));

  let calls = 0;
  let fail = false;
  const source = createDramaSource({ shows: [SHOWS[0]], fetchImpl: async (url, options) => {
    calls++;
    if (fail) throw new Error("test outage");
    if (options?.method === "POST") {
      assert.equal(JSON.parse(options.body).continuation, "next-page");
      return new Response(JSON.stringify({ entries: [renderer(13)] }));
    }
    return new Response(html({ entries: [renderer(1), renderer(2)], continuationItemRenderer: {
      continuationEndpoint: { continuationCommand: { token: "next-page" } }
    } }));
  } });
  assert.equal(source.getMeta("series", SHOW_ID).meta.videos.length, 12);
  const first = source.refresh();
  const joined = source.refresh();
  assert.equal(await first, true);
  assert.equal(await joined, true);
  assert.equal(calls, 2);
  assert.deepEqual(source.getMeta("series", SHOW_ID).meta.videos.map((v) => v.episode), [1, 2, 13]);
  assert.equal(source.getCatalog("series", "youtube-dramas").metas.length, 1);
  assert.equal(source.getCatalog("series", "youtube-dramas", "search=unrelated").metas.length, 0);
  assert.equal(source.getCatalog("movie", "youtube-dramas"), null);
  assert.equal(source.getMeta("series", "unknown"), null);
  const streams = source.getStreams("series", `${SHOW_ID}:1:13`);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].ytId, "P4zyZAl30To");
  assert.equal(streams[0].url, undefined);
  assert.equal(streams[0].externalUrl, undefined);
  assert.deepEqual(source.getStreams("series", `${SHOW_ID}:1:999`), []);
  fail = true;
  assert.equal(await source.refresh(), false);
  assert.equal(source.getMeta("series", SHOW_ID).meta.videos.length, 3);

  let geoFails = false;
  const both = createDramaSource({ fetchImpl: async (url) => {
    if (url === SHOWS[1].url) {
      if (geoFails) throw new Error("test GEO outage");
      return new Response(html({ entries: [renderer(1, {
        videoId: "uuZQ-JgKT2s", title: { simpleText: "Mohabbat Episode 01 | 28th September 2026 - HAR PAL GEO" }
      }), renderer(11, {
        videoId: "O6QUsYrGFNM", title: { simpleText: "Mohabbat Episode 11 | 2nd November 2026 - HAR PAL GEO" }
      }), renderer(4)] }));
    }
    return new Response(html({ entries: [renderer(1)] }));
  } });
  assert.deepEqual(both.getCatalog("series", "youtube-dramas").metas.map((show) => show.name),
    ["Mitti De Baway", "Mohabbat"]);
  assert.equal(await both.refresh(), true);
  assert.equal(both.getMeta("series", SHOW_ID).meta.videos.length, 1);
  assert.equal(both.getMeta("series", SHOWS[1].id).meta.videos.length, 2);
  assert.equal(both.getStreams("series", `${SHOWS[1].id}:1:1`)[0].ytId, "uuZQ-JgKT2s");
  assert.equal(both.getStreams("series", `${SHOW_ID}:1:1`)[0].ytId, "P4zyZAl30To");
  assert.equal(both.getCatalog("series", "youtube-dramas", "search=mohabbat").metas.length, 1);
  geoFails = true;
  assert.equal(await both.refresh(), false);
  assert.equal(both.getMeta("series", SHOWS[1].id).meta.videos.length, 2);
  console.log("YouTube drama metadata, pagination, refresh, and ytId streams passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
