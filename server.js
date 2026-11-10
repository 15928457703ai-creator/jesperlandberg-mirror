/* Local offline mirror server for jesperlandberg.com */
const http=require('http'),https=require('https'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=__dirname, SITE=path.join(ROOT,'site'), ASSETS=path.join(ROOT,'assets'), RAW=path.join(ROOT,'raw');
const PORT=Number(process.env.PORT||5188);
let DB={byUrl:{},byPath:{}};
try{ DB=JSON.parse(fs.readFileSync(path.join(ASSETS,'manifest.json'),'utf8')); }catch(e){ console.error('manifest missing',e.message); }
const MIME={'.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/markdown; charset=utf-8','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.gif':'image/gif','.svg':'image/svg+xml','.mp4':'video/mp4','.webm':'video/webm','.woff':'font/woff','.woff2':'font/woff2','.wasm':'application/wasm','.bin':'application/octet-stream','.ktx2':'image/ktx2','.glb':'model/gltf-binary','.ico':'image/x-icon'};
const mime=f=>MIME[path.extname(f).toLowerCase()]||'application/octet-stream';
const TEXT_EXT=new Set(['.html','.htm','.js','.mjs','.css','.json','.md','.txt','.xml']);
const PAGES=new Set(['/','/full','/newsletter','/projects/the-lookback','/projects/griflan','/projects/oppo-service','/projects/naivideo','/projects/erp']);
// any additional locally added case study is routed automatically
try{ for(const f of fs.readdirSync(path.join(SITE,'projects'))) if(f.endsWith('.html')) PAGES.add('/projects/'+f.slice(0,-5)); }catch(e){}
// local hint pages used by link pills that point at words instead of a URL
PAGES.add('/oppo-wechat');
let MANIFEST_MTIME=0;
try{ MANIFEST_MTIME=fs.statSync(path.join(ASSETS,'manifest.json')).mtimeMs; }catch(e){}
function refreshDB(){
  try{
    const st=fs.statSync(path.join(ASSETS,'manifest.json'));
    if(st.mtimeMs!==MANIFEST_MTIME){
      DB=JSON.parse(fs.readFileSync(path.join(ASSETS,'manifest.json'),'utf8'));
      MANIFEST_MTIME=st.mtimeMs; console.log('[manifest reloaded]',Object.keys(DB.byPath).length,'keys');
    }
  }catch(e){}
}
const missLog=new Set();
function log404(p){ if(!missLog.has(p)){missLog.add(p); console.log('[MISS]',p);} }
function sendFile(req,res,fp,ctype){
  let st; try{st=fs.statSync(fp);}catch(e){return false;}
  // inject the actual listening port into rewritten HTML/JS/JSON at serve time
  if(TEXT_EXT.has(path.extname(fp).toLowerCase())){
    try{
      const t=fs.readFileSync(fp,'utf8');
      if(t.includes('__PORT__')){ sendBuf(res,Buffer.from(t.replace(/__PORT__/g,String(PORT))),ctype||mime(fp)); return true; }
    }catch(e){}
  }
  const h={'Content-Type':ctype||mime(fp),'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*','Cache-Control':'public, max-age=3600','X-Local-Mirror':'1'};
  const range=req.headers.range;
  if(range && /^bytes=\d*-\d*/.test(range)){
    const m=/bytes=(\d*)-(\d*)/.exec(range);
    let s=m[1]?parseInt(m[1]):0, e=m[2]?parseInt(m[2]):st.size-1;
    if(s>=st.size){res.writeHead(416,{'Content-Range':`bytes */${st.size}`});res.end();return true;}
    e=Math.min(e,st.size-1);
    h['Content-Range']=`bytes ${s}-${e}/${st.size}`; h['Content-Length']=e-s+1;
    res.writeHead(206,h);
    if(req.method!=='HEAD') fs.createReadStream(fp,{start:s,end:e}).pipe(res); else res.end();
  }else{
    h['Content-Length']=st.size; res.writeHead(200,h);
    if(req.method!=='HEAD') fs.createReadStream(fp).pipe(res); else res.end();
  }
  return true;
}
function sendBuf(res,buf,ctype,status=200){
  res.writeHead(status,{'Content-Type':ctype,'Access-Control-Allow-Origin':'*','Content-Length':buf.length,'Cache-Control':'no-store'});
  res.end(buf);
}
function mediaFor(key,p){
  let m=DB.byPath[key];
  if(!m) m=DB.byPath[p];                       // ignore query if variant not cached
  if(!m){                                     // try any cached variant sharing this pathname
    const k=Object.keys(DB.byPath).find(x=>x.split('?')[0]===p);
    if(k) m=DB.byPath[k];
  }
  return m?path.join(ASSETS,m.file):null;
}
function graphqlReplay(req,res,body){
  // the site issues one DatoCMS query; replay the fully localized recording
  const lf=path.join(RAW,'graphql_localized.json');
  if(fs.existsSync(lf)){
    const t=fs.readFileSync(lf,'utf8').replace(/__PORT__/g,String(PORT));
    return sendBuf(res,Buffer.from(t),'application/json; charset=utf-8');
  }
  const key=crypto.createHash('sha1').update('https://graphql.datocms.com/|'+body).digest('hex').slice(0,20);
  const f=path.join(RAW,'graphql',key+'.json');
  if(fs.existsSync(f)){
    try{const c=JSON.parse(fs.readFileSync(f,'utf8')); return sendBuf(res,Buffer.from(c.response,'base64'),'application/json; charset=utf-8');}catch(e){}
  }
  // fallback: first recording of the DatoCMS response
  const cap=path.join(RAW,'capture.json');
  try{
    const m=JSON.parse(fs.readFileSync(cap,'utf8')).manifest;
    const u=Object.keys(m).find(x=>x.startsWith('https://graphql.datocms.com'));
    if(u){const fp=path.join(RAW,'captured',m[u].file); if(fs.existsSync(fp)) return sendBuf(res,fs.readFileSync(fp),'application/json; charset=utf-8');}
  }catch(e){}
  // last resort: proxy upstream when online, cache result
  const up=https.request({hostname:'graphql.datocms.com',path:'/',method:'POST',headers:{'content-type':req.headers['content-type']||'application/json','authorization':req.headers['authorization']||'','content-length':Buffer.byteLength(body),'accept':'application/json'}},r=>{
    const chunks=[]; r.on('data',c=>chunks.push(c)); r.on('end',()=>{
      const b=Buffer.concat(chunks);
      try{fs.mkdirSync(path.join(RAW,'graphql'),{recursive:true}); fs.writeFileSync(f,JSON.stringify({response:b.toString('base64')}));}catch(e){}
      sendBuf(res,b,'application/json; charset=utf-8',r.statusCode||200);
    });
  });
  up.on('error',()=>sendBuf(res,Buffer.from('{"data":{}}'),'application/json; charset=utf-8',200));
  up.write(body); up.end();
}
// online self-heal for uncached media paths
function heal(req,res,p,search){
  const hosts=['www.datocms-assets.com','image.mux.com','stream.mux.com'];
  let i=0;
  const tryNext=()=>{
    if(i>=hosts.length){ log404(p+search); return sendBuf(res,Buffer.from(''),'application/octet-stream',404); }
    const host=hosts[i++], u='https://'+host+p+search;
    const r=https.get(u,{headers:{'User-Agent':'Mozilla/5.0','Range':req.headers.range||''}},resp=>{
      if(resp.statusCode>=400){resp.resume();return tryNext();}
      const chunks=[]; resp.on('data',c=>chunks.push(c)); resp.on('end',()=>{
        const b=Buffer.concat(chunks);
        const ext=path.extname(p).toLowerCase()||'.bin';
        const fn=crypto.createHash('sha1').update(u).digest('hex').slice(0,20)+ext;
        fs.writeFileSync(path.join(ASSETS,fn),b);
        DB.byUrl[u]={file:fn,size:b.length,mime:resp.headers['content-type']||''}; DB.byPath[p+search]=DB.byUrl[u]; DB.byPath[p]=DB.byPath[p]||DB.byUrl[u];
        try{fs.writeFileSync(path.join(ASSETS,'manifest.json'),JSON.stringify(DB,null,1));}catch(e){}
        console.log('[HEALED]',u.slice(0,110));
        sendFile(req,res,path.join(ASSETS,fn),DB.byUrl[u].mime);
      });
    });
    r.on('error',tryNext); r.setTimeout(12000,()=>r.destroy());
  };
  tryNext();
}
const server=http.createServer((req,res)=>{
  refreshDB();
  const u=new URL(req.url,'http://127.0.0.1:'+PORT);
  const p=decodeURIComponent(u.pathname), search=u.search;
  // Only published case studies may serve pages, markdown, or payloads.
  // Unknown project payloads must not fall through to the upstream healer.
  if(p.startsWith('/projects/') && !PAGES.has('/projects/'+p.slice(10).split(/[/.]/)[0])){
    return sendBuf(res,Buffer.from('Project not found'),'text/plain; charset=utf-8',404);
  }
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'});return res.end();}
  if(p==='/__graphql'){
    const chunks=[]; req.on('data',c=>chunks.push(c)); req.on('end',()=>graphqlReplay(req,res,Buffer.concat(chunks).toString())); return;
  }
  // newsletter: local replay only, never forwards an address to the real service
  if(p==='/api/subscribe'){
    const chunks=[]; req.on('data',c=>chunks.push(c));
    req.on('end',()=>sendBuf(res,Buffer.from('{"ok":true,"offline":true}'),'application/json; charset=utf-8'));
    return;
  }
  if(p==='/__noop'||p.startsWith('/__noop/')) return sendBuf(res,Buffer.from('/* blocked */'),'text/javascript');
  if(p.startsWith('/cdn-cgi/')){res.writeHead(204);return res.end();}
  if(p==='/__proxy'){
    const target=u.searchParams.get('u');
    if(!target){res.writeHead(400);return res.end();}
    const q=new URL(target);
    res.writeHead(302,{Location:q.pathname+q.search});return res.end();
  }
  // cached external media (URLs kept path-identical to the original CDN)
  const mf=mediaFor(p+search,p);
  if(mf) { if(sendFile(req,res,mf)) return; }
  // static site files
  const sf=path.join(SITE,p);
  if(fs.existsSync(sf)&&fs.statSync(sf).isFile()) { if(sendFile(req,res,sf)) return; }
  // page routes (+ trailing slash)
  let route=p.replace(/\/+$/,'')||'/';
  // PAGES is a snapshot taken at boot; also accept any prerendered page that
  // appears later (new locally added case studies) without a server restart.
  if(PAGES.has(route) || (route!=='/' && fs.existsSync(path.join(SITE,route+'.html')))){
    const f=route==='/'?path.join(SITE,'index.html'):path.join(SITE,route+'.html');
    if(sendFile(req,res,f,'text/html; charset=utf-8')) return;
  }
  // media-looking unknown path: try online heal
  if(/\.(jpg|jpeg|png|webp|avif|mp4|webm|ktx2|bin|glb|woff2?|json)$/i.test(p) && !p.startsWith('/_nuxt/')) return heal(req,res,p,search);
  log404(req.url);
  sendBuf(res,Buffer.from('Not found in local mirror: '+p),'text/plain; charset=utf-8',404);
});
server.listen(PORT,'127.0.0.1',()=>{
  console.log(`Local mirror ready: http://127.0.0.1:${PORT}/`);
  console.log(`Cached media: ${Object.keys(DB.byPath).length} | site files: ${fs.readdirSync(SITE).length}`);
});
