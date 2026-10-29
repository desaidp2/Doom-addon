const http = require("node:http");
const PORT = Number(process.env.PORT || 3000);
const UPSTREAM = (process.env.FLIX_UPSTREAM_URL || "").replace(/\/+$/, "");
const groups = [
 ["Emby / Media Lib", /(?:flix.streams.{0,24}emby|media.lib|\bEMB\b)/i],
 ["Signal Vault", /(?:flix.streams.{0,24}signal|signal.vault|\bSV F\b)/i],
 ["Debrid Vault Turbo", /(?:debrid.vault.turbo|debrid.turbo)/i],
 ["Debrid Vault", /(?:flix.streams.{0,24}debrid|debrid.vault|\bDBV F\b)/i],
 ["Usenet Vault", /(?:flix.streams.{0,24}usenet|usenet.vault|\bUV F\b)/i],
 ["Lotus Vault", /(?:flix.streams.{0,24}lotus|lotus.vault|\bLV\b)/i],
 ["Archive Vault", /(?:flix.streams.{0,24}archive|archive.vault|\bAV\b)/i]
];
const manifest = {id:"community.flixstreams.seven",version:"0.3.0",name:"Flix-Streams All Providers",description:"Only Flix-Streams providers, including all enabled Flix-Streams source groups.",resources:["stream"],types:["movie","series"],catalogs:[],idPrefixes:["tt"]};
const reply=(res,status,body)=>{res.writeHead(status,{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"});res.end(JSON.stringify(body));};
function qualityRank(s){const t=[s?.name,s?.title,s?.description,s?.quality,s?.behaviorHints?.filename].filter(Boolean).join(" ");if(/(?:2160p|4k|uhd)/i.test(t))return 0;if(/(?:1080p|full.?hd|fhd)/i.test(t))return 1;if(/720p/i.test(t))return 2;if(/480p/i.test(t))return 3;return 4;}
function sortQuality(streams){return streams.slice().sort((a,b)=>qualityRank(a)-qualityRank(b));}
http.createServer(async(req,res)=>{
 const path=new URL(req.url,"http://localhost").pathname;
 if(path==="/manifest.json"||path==="/")return reply(res,200,manifest);
 if(path==="/health")return reply(res,200,{ok:true,configured:!!UPSTREAM});
 const m=path.match(/^\/stream\/(movie|series)\/(tt[^/]+)\.json$/);
 if(!m)return reply(res,404,{error:"Not found"});
 if(!UPSTREAM)return reply(res,503,{streams:[],error:"FLIX_UPSTREAM_URL missing"});
 try{
  const u=UPSTREAM+"/stream/"+m[1]+"/"+m[2]+".json";
  const r=await fetch(u,{signal:AbortSignal.timeout(18000)});
  if(!r.ok)return reply(res,502,{streams:[],error:"Upstream HTTP "+r.status});
  const data=await r.json();
  const streams=(Array.isArray(data.streams)?data.streams:[]).filter(s=>{const id=String(s?.behaviorHints?.doomProviderId||s?.providerId||'').toLowerCase();if(id)return id.startsWith('flix_streams_');const bg=String(s?.behaviorHints?.bingeGroup||'').toLowerCase();if(bg.includes('doomp-flix_streams_'))return true;return /flix[ -]?streams/i.test([s?.name,s?.description].join(' '));});
  reply(res,200,{streams:sortQuality(streams)});
 }catch(e){reply(res,502,{streams:[],error:String(e.message||e)});}
}).listen(PORT,"0.0.0.0");
