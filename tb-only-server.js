"use strict";
const http=require("node:http");
const {getStreams}=require("./providers/torbox");
const PORT=Number(process.env.PORT||3000);
const manifest={id:"community.torbox.only.test",version:"0.2.0",name:"TB Only (Torbox Direct)",description:"Directly queries the configured Torbox/AIOStreams provider; no DOOM aggregate filtering.",resources:["stream"],types:["movie","series"],catalogs:[],idPrefixes:["tt"]};
const send=(res,status,obj)=>{res.writeHead(status,{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"});res.end(JSON.stringify(obj));};
function qualityRank(s){const t=[s?.name,s?.title,s?.description,s?.quality,s?.behaviorHints?.filename].filter(Boolean).join(" ");if(/(?:2160p|4k|uhd)/i.test(t))return 0;if(/(?:1080p|full.?hd|fhd)/i.test(t))return 1;if(/720p/i.test(t))return 2;if(/480p/i.test(t))return 3;return 4;}
function sortQuality(streams){return streams.slice().sort((a,b)=>qualityRank(a)-qualityRank(b));}
http.createServer(async(req,res)=>{
 const path=new URL(req.url,"http://localhost").pathname;
 if(path==="/manifest.json"||path==="/")return send(res,200,manifest);
 if(path==="/health")return send(res,200,{ok:true,mode:"torbox-provider-direct"});
 const m=path.match(/^\/stream\/(movie|series)\/(tt[^/]+)\.json$/);
 if(!m)return send(res,404,{error:"Not found"});
 const parts=m[2].split(":");
 try{
  const streams=await Promise.race([
   getStreams(null,m[1],parts[1]||null,parts[2]||null,parts[0]),
   new Promise((_,reject)=>setTimeout(()=>reject(new Error("Torbox provider timeout")),30000))
  ]);
  send(res,200,{streams:sortQuality(Array.isArray(streams)?streams:[])});
 }catch(e){console.error("[TB only]",e.message);send(res,200,{streams:[]});}
}).listen(PORT,"0.0.0.0");
