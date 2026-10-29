const http=require("node:http");
const PORT=Number(process.env.PORT||3000);
const UPSTREAM=(process.env.DOOM_UPSTREAM_URL||"https://doom-addon-test.onrender.com").replace(/\/+$/,"");
const manifest={id:"community.torbox.only.test",version:"0.1.0",name:"TB Only (Torbox Test)",description:"Only Torbox/TB stream entries from existing DOOM output. Requires upstream Torbox configuration.",resources:["stream"],types:["movie","series"],catalogs:[],idPrefixes:["tt"]};
const send=(res,status,obj)=>{res.writeHead(status,{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"});res.end(JSON.stringify(obj));};
http.createServer(async(req,res)=>{
 const path=new URL(req.url,"http://localhost").pathname;
 if(path==="/manifest.json"||path==="/")return send(res,200,manifest);
 if(path==="/health")return send(res,200,{ok:true,upstreamConfigured:!!UPSTREAM});
 const m=path.match(/^\/stream\/(movie|series)\/(tt[^/]+)\.json$/);
 if(!m)return send(res,404,{error:"Not found"});
 try{
  const response=await fetch(UPSTREAM+"/stream/"+m[1]+"/"+m[2]+".json",{signal:AbortSignal.timeout(25000)});
  if(!response.ok)return send(res,502,{streams:[],error:"Upstream HTTP "+response.status});
  const json=await response.json();
  const streams=(Array.isArray(json.streams)?json.streams:[]).filter(s=>{
   if(!s||typeof s!=="object")return false;
   const name=String(s.name||"").trim();
   const desc=String(s.description||"");
   const title=String(s.title||"");
   const source=String(s.provider||s.providerId||s.source||"");
   return /torbox/i.test([name,desc,title,source].join(" "))||/(?:^|[\\s|\\[(:-])TB(?:$|[\\s|\\]):.-])/i.test(name);
  });
  send(res,200,{streams});
 }catch(e){send(res,502,{streams:[],error:String(e.message||e)});}
}).listen(PORT,"0.0.0.0");
