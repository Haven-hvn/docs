import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, '../public/arkiv-cache.json');
const endpoints = ['https://braga.hoodi.arkiv.network/rpc','https://braga.arkiv.network/rpc'];
async function fetchArkiv(){
  for(const endpoint of endpoints){
    const c=new AbortController(); const to=setTimeout(()=>c.abort(),6000);
    try{
      const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'arkiv_query',params:[{maxResults:200,includePayload:true,includeAttributes:true,includeMetadata:true}]}),signal:c.signal});
      clearTimeout(to);
      if(!res.ok){console.error(`[fetch-arkiv-cache] ${endpoint} -> ${res.status}`);continue;}
      const j=await res.json(); const raw=j.result?.entities??j.result?.items??j.result??[];
      if(!Array.isArray(raw)||raw.length===0){console.error(`[fetch-arkiv-cache] ${endpoint} -> empty`);continue;}
      const out={fetchedAt:new Date().toISOString(),endpoint,count:raw.length,entities:raw};
      await fs.mkdir(path.dirname(outPath),{recursive:true});
      await fs.writeFile(outPath,JSON.stringify(out,null,2),'utf8');
      console.log(`[fetch-arkiv-cache] wrote ${raw.length} from ${endpoint} -> ${outPath}`);return;
    }catch(e){clearTimeout(to);console.error(`[fetch-arkiv-cache] ${endpoint} error:`,String(e).slice(0,120));}
  }
  console.warn('[fetch-arkiv-cache] all failed — fallback to mocks');
  try{await fs.access(outPath);console.log(`[fetch-arkiv-cache] keeping ${outPath}`)}catch{
    const stub={fetchedAt:new Date().toISOString(),endpoint:null,count:0,entities:[],note:'Braga 503 at build — frontend uses mocks, retries live'};
    await fs.mkdir(path.dirname(outPath),{recursive:true});
    await fs.writeFile(outPath,JSON.stringify(stub,null,2),'utf8');
    console.log(`[fetch-arkiv-cache] wrote stub ${outPath}`);
  }
}
fetchArkiv();
