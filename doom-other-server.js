"use strict";
const http=require("node:http");
const PORT=Number(process.env.PORT||3000);
const UPSTREAM=(process.env.DOOM_UPSTREAM_URL||"https://doom-addon-test.onrender.com").replace(/\/+$/,"");
const manifest={id:"community.doom.except.flix.tb",version:"0.1.0",name:"DOOM Other Sources (No Flix / TB)",description:"Test addon: all DOOM provider streams except Flix-Streams and Torbox.",resources:["stream"],types:["movie","series"],catalogs:[],idPrefixes:["tt"]};
const send=(res,status,obj)=>{res.writeHead(status,{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"});res.end(JSON.stringify(obj));};
function keep(s){
 if(!s||typeof s!=="object")return false;
 const id=String(s.behaviorHints?.doomProviderId||s.providerId||"").toLowerCase();
 if(id)return id!=="torbox"&&!id.startsWith("flix_streams_");
 const hints=String(s.behaviorHints?.bingeGroup||"").toLowerCase();
 if(/doomp-(?:torbox|flix_streams_)/.test(hints))return false;
 const label=[s.name,s.description].filter(Boolean).join(" ");
 return !/(?:torbox|flix.streams|\bTB\b|\b(?:EMB|SV F|UV F|DBV F|STV F)\b)/i.test(label);
}
function qualityRank(s){const t=[s?.name,s?.title,s?.description,s?.quality,s?.behaviorHints?.filename].filter(Boolean).join(" ");if(/(?:2160p|4k|uhd)/i.test(t))return 0;if(/(?:1080p|full.?hd|fhd)/i.test(t))return 1;if(/720p/i.test(t))return 2;if(/480p/i.test(t))return 3;return 4;}
function sortQuality(streams){return streams.slice().sort((a,b)=>qualityRank(a)-qualityRank(b));}
http.createServer(async(req,res)=>{
 const path=new URL(req.url,"http://localhost").pathname;
 if(path==="/manifest.json"||path==="/")return send(res,200,manifest);
 if(path==="/health")return send(res,200,{ok:true,mode:"exclude-flix-torbox"});
 const m=path.match(/^\/stream\/(movie|series)\/(tt[^/]+)\.json$/);
 if(!m)return send(res,404,{error:"Not found"});
 try{
  const r=await fetch(UPSTREAM+"/stream/"+m[1]+"/"+m[2]+".json",{signal:AbortSignal.timeout(45000)});
  if(!r.ok)return send(res,502,{streams:[],error:"DOOM HTTP "+r.status});
  const data=await r.json();
  const all=Array.isArray(data.streams)?data.streams:[];
  const streams=all.filter(keep);
  console.log("[Other Sources]",m[2],"total",all.length,"kept",streams.length);
  send(res,200,{streams:sortQuality(streams)});
 }catch(e){console.error("[Other Sources]",e.message);send(res,502,{streams:[],error:e.message});}
}).listen(PORT,"0.0.0.0");
