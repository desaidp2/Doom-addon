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
  const both = createDramaSource({ shows: SHOWS.slice(0, 2), fetchImpl: async (url) => {
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

  const modern = { lockupViewModel: {
    contentType: "LOCKUP_CONTENT_TYPE_VIDEO", contentId: "0ZYscAm2xrA",
    metadata: { lockupMetadataViewModel: { title: { content: "Dar-e-Nijaat EP 1 | 1 AUG 2026 | ARY Digital" } } },
    contentImage: { thumbnailViewModel: { overlays: [{ thumbnailBottomOverlayViewModel: {
      badges: [{ thumbnailBadgeViewModel: { text: "37:54" } }]
    } }] } }
  } };
  const modernEpisodes = listedEpisodes({ entries: [modern, modern] }, SHOWS[2]).episodes;
  assert.equal(modernEpisodes.length, 1);
  assert.equal(modernEpisodes[0].videoId, "0ZYscAm2xrA");
  assert.equal(modernEpisodes[0].released, "2026-08-01T00:00:00.000Z");
  assert.equal(listedEpisodes(modern, SHOWS[3]).episodes.length, 0);
  const shortClip = structuredClone(modern);
  shortClip.lockupViewModel.contentImage.thumbnailViewModel.overlays[0]
    .thumbnailBottomOverlayViewModel.badges[0].thumbnailBadgeViewModel.text = "01:30";
  assert.equal(listedEpisodes(shortClip, SHOWS[2]).episodes.length, 0);
  const hurmat = renderer(1, { videoId: "YXWuZKn452A",
    title: { simpleText: "Hurmat - Episode 01 [Eng Sub] - 5th Oct 2026 - HUM TV" } });
  assert.equal(listedEpisodes(hurmat, SHOWS[3]).episodes[0].episode, 1);

  const all = createDramaSource({ fetchImpl: async (url) => {
    const show = SHOWS.find((item) => item.url === url);
    assert.ok(show);
    return new Response(html({ entries: [renderer(1, { videoId: show.ids[0],
      title: { simpleText: `${show.name} - Episode 1 | 1 October 2026` } })] }));
  } });
  for (const [index, count] of [12, 10, 27, 8].entries()) {
    assert.equal(all.getMeta("series", SHOWS[index].id).meta.videos.length, count);
  }
  assert.equal(all.getCatalog("series", "youtube-dramas").metas.length, 4);
  for (const [id, videoId] of [
    ["tt40068581:1:2", "sEms255DVP8"],
    ["tmdb:336288:1:2", "sEms255DVP8"],
    ["tt46669848:1:2", "yzjt0_tnNTY"],
    ["tmdb:336715:1:2", "yzjt0_tnNTY"],
    ["tmdb:337725:1:1", "uuZQ-JgKT2s"],
    ["tt43732092:1:2", "qfz_A3fhI3Q"],
    ["tmdb:328722:1:2", "qfz_A3fhI3Q"],
    ["tt48919149:1:2", "Rb55pU43mw0"],
    ["tmdb:337670:1:2", "Rb55pU43mw0"]
  ]) {
    const streams = all.getStreams("series", id);
    assert.equal(streams.length, 1);
    assert.equal(streams[0].ytId, videoId);
    assert.equal(streams[0].url, undefined);
  }
  for (const id of ["tt46669848", "tt46669848:2:1", "tt46669848:1:0", "tt46669848:1:999",
    "tt466698480:1:2", "tmdb:336715:1:2:extra", "tmdb:99999999:1:1"]) {
    assert.deepEqual(all.getStreams("series", id), []);
  }
  assert.deepEqual(all.getStreams("movie", "tt46669848:1:2"), []);
  assert.equal(all.getMeta("series", "tt46669848"), null);
  for (const [query, expected] of [
    ["Dar e Nijaat", ["Dar-e-Nijaat"]],
    ["DARENIJAAT", ["Dar-e-Nijaat"]],
    ["Dar\u2011e\u2011Nijaat", ["Dar-e-Nijaat"]],
    ["  Mitti  De Baway  ", ["Mitti De Baway"]],
    ["mohabbat", ["Mohabbat"]],
    ["Hurmat", ["Hurmat"]],
    ["unrelated", []],
    ["---", []]
  ]) {
    const extra = new URLSearchParams({ search: query }).toString();
    assert.deepEqual(all.getCatalog("series", "youtube-dramas", extra).metas.map((show) => show.name), expected);
  }
  assert.deepEqual(all.getCatalog("series", "youtube-dramas", "search=hurmat&skip=1").metas, []);
  assert.equal(await all.refresh(), true);
  for (const show of SHOWS) {
    const result = all.getStreams("series", `${show.id}:1:1`);
    assert.equal(result[0].ytId, show.ids[0]);
    assert.equal(result[0].url, undefined);
    assert.equal(result[0].name, `YouTube - ${show.channel}`);
    assert.equal(all.getMeta("series", show.id).meta.videos.length, 1);
  }
  console.log("YouTube drama metadata, search, refresh, and external episode ID tests passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
