"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

// Exercise internal matching and probe functions without changing public exports.
const filename = path.resolve(__dirname, "../addon.js");
const addon = new Module(filename, module);
addon.filename = filename;
addon.paths = Module._nodeModulePaths(path.dirname(filename));
addon._compile(fs.readFileSync(filename, "utf8") +
  "\nmodule.exports.test = { matchesRequestedMedia, probeStream };", filename);
const { normalizeStream, test } = addon.exports;
const provider = { id: "pengu", name: "Pengu" };
const movie = { title: "Daayra", year: "2026" };
const parsed = { type: "movie" };
const raw = {
  name: "PenguPlay 1080p MoviesDrives",
  description: "Daayra (2026)\n1080p HEVC MKV\nAudio: Hindi, Malayalam",
  url: "https://example.test/video",
  behaviorHints: { filename: "1080pHEVCMKV~1.9Mbps.pad-MoviesDrives", videoSize: 4000000 }
};

const normalized = normalizeStream(raw, provider, movie);
assert.equal(test.matchesRequestedMedia(normalized, movie, parsed), true);
assert.equal(normalized.behaviorHints.filename, raw.behaviorHints.filename);
assert.equal(normalized.url, raw.url);
assert.equal(test.matchesRequestedMedia(normalizeStream({
  ...raw, description: "Unrelated Movie (2026)\n1080p HEVC MKV"
}, provider, movie), movie, parsed), false);
assert.equal(test.matchesRequestedMedia(normalizeStream({
  ...raw, description: "Daayra (2025)\n1080p HEVC MKV"
}, provider, movie), movie, parsed), false);
assert.equal(test.matchesRequestedMedia(normalizeStream({
  ...raw, description: "Daayra (2026)",
  behaviorHints: { filename: "Different.Movie.2026.1080p.mkv" }
}, provider, movie), movie, parsed), false);

async function checkProbes() {
  const originalFetch = global.fetch;
  const ranges = [];
  const bytes = Buffer.alloc(4096);
  bytes.write("ftyp", 4);
  try {
    global.fetch = async (_url, options) => {
      const range = options.headers.Range;
      ranges.push(range);
      const [start, end] = range.match(/\d+/g).map(Number);
      return new Response(bytes, { status: 206, headers: {
        "content-type": "video/mp4",
        "content-range": `bytes ${start}-${end}/4000000`
      } });
    };
    assert.equal((await test.probeStream(normalized, { mediaInfo: movie, parsed })).ok, true);
    assert.equal(ranges.length, 2);
    assert.notEqual(ranges[0], ranges[1]);
    global.fetch = async () => new Response(bytes, { status: 200, headers: {
      "content-type": "video/mp4", "content-length": "4000000"
    } });
    assert.equal((await test.probeStream(normalized, { mediaInfo: movie, parsed })).ok, false);
    global.fetch = async () => new Response("<html>Bad gateway</html>", { status: 502 });
    assert.equal((await test.probeStream(normalized, { mediaInfo: movie, parsed })).ok, false);
  } finally {
    global.fetch = originalFetch;
  }
}

checkProbes().then(() => console.log("Pengu matching and seek validation passed"))
  .catch((error) => { console.error(error); process.exitCode = 1; });
