"use strict";
// Isolated Dark Knight display experiment. Never imported by production.
function previewBatman(stream) {
  if (!stream || typeof stream !== "object") return stream;
  const name = typeof stream.name === "string" ? stream.name : "";
  const title = typeof stream.title === "string" ? stream.title : "";
  const description = typeof stream.description === "string" ? stream.description : "";
  const provider = (name.match(/\[TB\]\s*(Library|Comet|Torrentio)/i) || title.match(/\[TB\]\s*(Library|Comet|Torrentio)/i) || [])[0] || "SOURCE";
  // Only add to title for isolated visual inspection; preserve all original fields.
  return { ...stream, title: ["🦇 GOTHAM NETWORK // ONLINE", provider, title || description, "⟩ I AM VENGEANCE"].filter(Boolean).join("\n") };
}
function validateOriginal(original, preview) {
  for (const key of Object.keys(original)) {
    if (key !== "title" && JSON.stringify(original[key]) !== JSON.stringify(preview[key])) throw Error("Unexpected field change: " + key);
  }
  if (original.url !== preview.url || original.name !== preview.name) throw Error("Playback/name changed");
  return true;
}
if (require.main === module) {
  const example = {name:"[TB] Library", title:"4K UHD | HEVC | HDR10", url:"https://example.invalid/video", behaviorHints:{bingeGroup:"demo"}};
  const preview = previewBatman(example);
  validateOriginal(example, preview);
  console.log(JSON.stringify(preview, null, 2));
  console.log("PASS: original name, playback URL, and behaviorHints unchanged");
}
module.exports = { previewBatman, validateOriginal };
