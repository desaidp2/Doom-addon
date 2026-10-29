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
const manifest = {id:"community.flixstreams.seven",version:"0.1.0",name:"Flix-Streams Seven Test",description:"Flix-Streams only: seven source labels filtered from configured upstream.",resources:["stream"],types:["movie","series"],catalogs:[],idPrefixes:["tt"]};
const reply=(res,status,body)=>{res.writeHead(status,{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"});res.end(JSON.stringify(body));};
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
  const streams=(Array.isArray(data.streams)?data.streams:[]).flatMap(s=>{
   if(!s||typeof s.url!=="string"||!/^https?:\/\//.test(s.url))return [];
   const label=[s.name,s.title,s.description].filter(Boolean).join(" ");
   const group=groups.find(([_,re])=>re.test(label));
   return group?[{...s,name:"["+group[0]+"] "+(s.name||"HTTP")}]:[];
  });
  reply(res,200,{streams});
 }catch(e){reply(res,502,{streams:[],error:String(e.message||e)});}
}).listen(PORT,"0.0.0.0");
