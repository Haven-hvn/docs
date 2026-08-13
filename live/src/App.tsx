import { useEffect, useRef, useState, useMemo } from 'react'
import * as d3 from 'd3'
import './App.css'

type Chain = 'arkiv' | 'icp' | 'evm' | 'filecoin'
type TxStatus = 'pending' | 'confirmed' | 'failed'
interface InFlightTx { id:string; hash:string; chain:Chain; type:string; from:string; to:string; blockExplorerUrl:string; rpcUrl:string; timestamp:number; status:TxStatus; dao?:string; payload?:string }
const CANISTER_ID = 'dciac-uaaaa-aaaad-qlzuq-cai'
// Calibration FEVM — Filecoin Onchain Cloud pin contracts on calibration (314159), from @filoz/synapse-core chains.ts
// filecoinPayV1: 0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0, fwss (warm storage): 0x02925630df557F957f70E112bA06e50965417CA0
const CALIBRATION_FILECOIN_PAY = '0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0'
const CALIBRATION_FWSS = '0x02925630df557F957f70E112bA06e50965417CA0'
const EXPLORERS: Record<Chain,(h:string)=>string> = {
  arkiv: h=>`https://braga.hoodi.arkiv.network/tx/${h}`,
  icp: _h=>`https://dashboard.internetcomputer.org/canister/${CANISTER_ID}`,
  evm: h=>`https://basescan.org/tx/${h}`,
  filecoin: h=>`https://calibration.filfox.info/en/message/${h}`,
}
const FILECOIN_EXPLORER_CONTRACT = (addr:string)=> `https://calibration.filfox.info/en/address/${addr}`
const RPCS: Record<Chain,string> = {
  arkiv:'https://braga.hoodi.arkiv.network/rpc',
  icp:'https://icp0.io',
  evm:'https://base.meowrpc.com',
  filecoin:'https://api.calibration.node.glif.io/rpc/v1',
}
// GB pinned via Filecoin FEVM filecoin-pin / filecoin-pay — in production queried per DAO:
// 1) arkiv_query → Entity media CID (ipfs://bafy...) + size_bytes attribute
// 2) Filecoin Synapse / FEVM filecoin-pin contract `getPinStatus(cid)` or via `api.node.glif.io` StateMarketStorageDeal
// 3) sum size_bytes where pin.status == 'pinned' → GB = bytes / 1e9
// DAOs ≠ chains — each DAO is a *decryption criterion* `0x` on Base/Ethereum that a reader must
// prove ownership of (ERC-20 balance or ERC-721 holder) before haven-aol VetKD/EVM gate decrypts.
// Public pricing + token/NFT images come from CoinGecko / Reservoir / Basescan via Arkiv `token_address`.
// GB pinned is separate (Filecoin calibration). Mock keeps same `0x` uploader across Arkiv/EVM as owner,
// gating `token_address` is what prices/images key off — NFT projects or tokens.
const MOCK_DAOS = [
  { id:'0x8a1c', name:'Filecoin DataDAO', handle:'filecoin-dao-1', lastPost: Date.now()-12*24*3600*1000, owner:'0x8a1c9e3f2b4d5a6c7e8f901234567890abcdef1234', gbStored: 847, deals: 1240, marketCapUsd: 12_400_000, tokenSymbol:'FDD', tokenType:'token' as const, tokenAddress:'0x3d2F4C2a7b8c9e1d0f1234567890AbCdEf12345678', priceUsd: 4.84, imageUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=FDD&backgroundColor=0e1a14,0d1117&shape1Color=39d353,58a6ff' },
  { id:'0x9b2d', name:'Arkiv Builders DAO', handle:'arkiv-builders', lastPost: Date.now()-45*24*3600*1000, owner:'0x9b2d8e4f3c5a6b7c8d9e0f1234567890abcdef5678', gbStored: 212, deals: 380, marketCapUsd: 3_100_000, tokenSymbol:'ABDAO', tokenType:'nft' as const, tokenAddress:'0xB7aF8c3d9e2f4a6b5c7d8e9f0123456789aBcDeF1c', floorPriceEth: 0.42, imageUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=ABDAO&backgroundColor=1a1a2e,16213e&shape1Color=cc8a2a,ff6b6b' },
  { id:'0x7c3e', name:'Haven Media DAO', handle:'haven-media', lastPost: Date.now()-80*24*3600*1000, owner:'0x7c3e1d2a4b5c6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b', gbStored: 38, deals: 94, marketCapUsd: 840_000, tokenSymbol:'HMD', tokenType:'token' as const, tokenAddress:'0x4e2d8f1a3b5c6d7e9f0123456789AbCdEf01234567', priceUsd: 0.84, imageUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=HMD&backgroundColor=0f141a,13202a&shape1Color=5ea3cc,7cc4ff' },
  { id:'0x6d4f', name:'Stale DAO', handle:'stale-dao', lastPost: Date.now()-120*24*3600*1000, owner:'0x6d4f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b', gbStored: 2.4, deals: 6, marketCapUsd: 42_000, tokenSymbol:'STALE', tokenType:'nft' as const, tokenAddress:'0x9c3E1d2a4b5c6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c', floorPriceEth: 0.03, imageUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=STALE&backgroundColor=1a1410,2a1f12&shape1Color=6e7681,8b949e' },
]
type SizingMode = 'storage' | 'marketcap'
function daoRadiusStorage(gb:number){
  const r = 9 + Math.sqrt(Math.max(0, gb)) * 0.62
  return Math.max(10, Math.min(28, Math.round(r*10)/10))
}
function daoRadiusMarketcap(mcap:number){
  // sqrt-normalized 40k→10px, 12.4M→27px
  const s = Math.sqrt(Math.max(0, mcap))
  const sMin = Math.sqrt(42_000), sMax = Math.sqrt(12_400_000)
  const t = (s - sMin) / (sMax - sMin || 1)
  return Math.max(10, Math.min(28, Math.round((10 + t*17.5)*10)/10))
}
function fmtUsd(n:number){ if(n>=1e6) return `$${(n/1e6).toFixed(n>=10e6?1:2)}M`; if(n>=1e3) return `$${(n/1e3).toFixed(1)}k`; return `$${n}` }
function fmtGb(n:number){ return n>=100? `${Math.round(n).toLocaleString()} GB` : `${n.toLocaleString()} GB` }

function Starfield(){
  const ref=useRef<HTMLCanvasElement>(null)
  useEffect(()=>{
    const c=ref.current; if(!c) return
    const ctx=c.getContext('2d'); if(!ctx) return
    let raf=0
    const stars=Array.from({length:220},()=>({x:Math.random(),y:Math.random(),z:Math.random()*0.85+0.15,tw:Math.random()*Math.PI*2}))
    const draw=()=>{
      const w=c.width=c.clientWidth*devicePixelRatio, h=c.height=c.clientHeight*devicePixelRatio
      ctx.clearRect(0,0,w,h)
      for(const s of stars){
        s.tw+=0.018
        const a=0.5+0.45*Math.sin(s.tw)*s.z
        const x=s.x*w, y=s.y*h
        const r=s.z*1.55*devicePixelRatio
        ctx.fillStyle=`rgba(125,170,255,${a.toFixed(3)})`
        ctx.shadowColor='rgba(86,155,255,0.75)'; ctx.shadowBlur=r*5
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill()
        ctx.shadowBlur=0
      }
      for(const s of stars){ s.x+=Math.sin(s.tw*0.28)*0.0001*s.z; s.y+=Math.cos(s.tw*0.33)*0.00007*s.z; if(s.x>1)s.x-=1; if(s.x<0)s.x+=1; if(s.y>1)s.y-=1; if(s.y<0)s.y+=1 }
      raf=requestAnimationFrame(draw)
    }
    draw(); return()=>cancelAnimationFrame(raf)
  },[])
  return <canvas ref={ref} className="starfield" aria-hidden />
}

function useArkivPoll90(){
  const [txs,setTxs]=useState<InFlightTx[]>([])
  const [live,setLive]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [daoFilter,setDaoFilter]=useState<'all'|'active90'>('active90')
  const activeDaos = useMemo(()=> daoFilter==='active90'? MOCK_DAOS.filter(d=>Date.now()-d.lastPost<90*24*3600*1000): MOCK_DAOS, [daoFilter])
  useEffect(()=>{
    let id:number|undefined
    const fetchOnce=async()=>{
      try{
        const r=await fetch(RPCS.arkiv,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'arkiv_getEntityCount',params:[]})})
        if(r.ok){ const j=await r.json(); if(j.result!==undefined) setLive(true) }
      }catch(e:any){ setError(String(e.message||e).slice(0,48)) }
      if(activeDaos.length===0) return
      const dao=activeDaos[Math.floor(Math.random()*activeDaos.length)]
      const sameUploader=dao.owner
      const chains:Chain[]=['arkiv','icp','evm','filecoin']
      const chain=chains[Math.floor(Math.random()*4)]
      const now=Date.now()
      const hash=`0x${now.toString(16)}${Math.floor(Math.random()*0xffff).toString(16).padStart(4,'0')}`
      const tx:InFlightTx={ id:`${chain}-${now}`, hash, chain, type: chain==='arkiv'?(['Entity CREATE','Entity UPDATE','Entity EXTEND'][Math.floor(Math.random()*3)]): chain==='icp'?'VetKD derive': chain==='evm'?'Gate EVM eth_call':'Filecoin pin', from:sameUploader, to: chain==='arkiv'?'0x4400000000000000000000000000000000000044': chain==='icp'?CANISTER_ID:'0xFEVM', blockExplorerUrl: EXPLORERS[chain](hash), rpcUrl: RPCS[chain], timestamp: now, status: Math.random()>0.22?'pending':'confirmed', dao: dao.handle, payload: JSON.stringify({title:dao.name,dao:dao.handle,sameUploader:sameUploader.slice(0,12)+' same across all chains'})}
      setTxs(prev=>[tx,...prev].slice(0,32))
    }
    fetchOnce(); id=window.setInterval(fetchOnce,2100)
    return()=>{ if(id) clearInterval(id)}
  },[activeDaos])
  return {txs,live,error,daoFilter,setDaoFilter,activeDaos}
}

type ZoneNode = { id:string; label:string; sub:string; chain?:Chain; kind:'network'|'service'|'dao'; r:number; x?:number; y?:number; fx?:number|null; fy?:number|null; explorer?:string; volume:number; imageUrl?:string }
type Link = { source:string; target:string; value:number; chain:Chain }

type View = 'architecture' | 'live'
export default function App(){
  const {txs,live,error,daoFilter,setDaoFilter,activeDaos}=useArkivPoll90()
  const [view,setView]=useState<View>('architecture')
  const [chainFilter,setChainFilter]=useState<Chain|'all'>('all')
  const [sizingMode,setSizingMode]=useState<SizingMode>('storage')
  const svgRef=useRef<SVGSVGElement>(null)
  const wrapRef=useRef<HTMLDivElement>(null)
  const filtered = chainFilter==='all'? txs : txs.filter(t=>t.chain===chainFilter)
  const demoUploader=MOCK_DAOS[0].owner

  const {nodes, links} = useMemo(()=>{
    const zones: ZoneNode[]=[
      { id:'arkiv', label:'Arkiv OP L3', sub:'0x44…0044 • entities', kind:'network', chain:'arkiv', r:34, volume: 92, explorer:'https://braga.hoodi.arkiv.network' },
      { id:'icp', label:'DFINITY ICP', sub:CANISTER_ID, kind:'network', chain:'icp', r:28, volume: 64, explorer:`https://dashboard.internetcomputer.org/canister/${CANISTER_ID}` },
      { id:'evm', label:'EVM', sub:'Ethereum / Base', kind:'network', chain:'evm', r:26, volume: 71, explorer:'https://basescan.org' },
      { id:'filecoin', label:'Filecoin FEVM / IPFS (calibration)', sub:'filecoin-pin • 314159 calibration', kind:'network', chain:'filecoin', r:26, volume: 58, explorer: FILECOIN_EXPLORER_CONTRACT(CALIBRATION_FILECOIN_PAY) },
      { id:'haven-aol', label:'haven-aol', sub:'Python/Motoko • AAL', kind:'service', r:16, volume: 18 },
      { id:'haven-dapp', label:'haven-dapp', sub:'TypeScript • UI', kind:'service', r:16, volume: 22 },
      { id:'haven-cli', label:'haven-cli', sub:'Python • permissionless', kind:'service', r:14, volume: 14 },
      { id:'haven-mobile', label:'haven-mobile', sub:'Kotlin • Android', kind:'service', r:14, volume: 12 },
      { id:'arkiv-chain', label:'arkiv-chain', sub:'Rust • EntityRegistry', kind:'service', r:18, volume: 26 },
      ...activeDaos.map(d=>{
        const isStorage = sizingMode==='storage'
        const r = isStorage ? daoRadiusStorage(d.gbStored) : daoRadiusMarketcap(d.marketCapUsd)
        const priceLabel = d.tokenType==='nft' ? `${(d as any).floorPriceEth} ETH floor` : `$${(d as any).priceUsd}`
        const sub = isStorage
          ? `${fmtGb(d.gbStored)} pinned • ${priceLabel} • ${d.tokenSymbol} ${d.tokenType} • ${d.tokenAddress.slice(0,6)}…`
          : `${fmtUsd(d.marketCapUsd)} mcap • ${priceLabel} • ${d.tokenAddress.slice(0,6)}… • ${fmtGb(d.gbStored)}`
        return { id:d.handle, label:d.name, sub, kind:'dao' as const, r, volume: isStorage ? d.gbStored : d.marketCapUsd, explorer: `https://basescan.org/address/${d.tokenAddress}`, imageUrl: (d as any).imageUrl }
      }),
    ]
    const ls: Link[]=[
      {source:'arkiv',target:'icp',value:18,chain:'icp'},
      {source:'arkiv',target:'evm',value:22,chain:'evm'},
      {source:'arkiv',target:'filecoin',value:16,chain:'filecoin'},
      {source:'haven-aol',target:'arkiv',value:12,chain:'arkiv'},
      {source:'haven-aol',target:'icp',value:14,chain:'icp'},
      {source:'haven-aol',target:'evm',value:10,chain:'evm'},
      {source:'haven-aol',target:'filecoin',value:9,chain:'filecoin'},
      {source:'haven-dapp',target:'arkiv',value:14,chain:'arkiv'},
      {source:'haven-cli',target:'arkiv',value:8,chain:'arkiv'},
      {source:'haven-mobile',target:'icp',value:6,chain:'icp'},
      {source:'arkiv-chain',target:'arkiv',value:20,chain:'arkiv'},
      // DAO channels — thickness reflects active sizing mode (GB or mcap), log-scaled like Map of Zones volume
      ...activeDaos.map(d=>{
        const v = sizingMode==='storage' ? Math.log10(d.gbStored+1)*6 : Math.log10(d.marketCapUsd/1000+1)*3.2
        return {source:d.handle,target:'filecoin',value: Math.max(2, Math.min(18, v)),chain:'filecoin' as Chain}
      }),
      ...activeDaos.slice(0,3).map(d=>{
        const v = sizingMode==='storage' ? Math.log10(d.gbStored+1)*4 : Math.log10(d.marketCapUsd/1000+1)*2.2
        return {source:d.handle,target:'arkiv',value: Math.max(3, Math.min(14, v)),chain:'arkiv' as Chain}
      }),
    ]
    const visibleNodes = chainFilter==='all'? zones : zones.filter(z=> !z.chain || z.chain===chainFilter || z.kind!=='network')
    const visibleIds = new Set(visibleNodes.map(n=>n.id))
    const visibleLinks = ls.filter(l=> visibleIds.has(l.source) && visibleIds.has(l.target) && (chainFilter==='all' || l.chain===chainFilter || l.chain==='arkiv'))
    return {nodes: visibleNodes, links: visibleLinks}
  },[activeDaos, chainFilter, sizingMode])

  useEffect(()=>{
    const svg=svgRef.current; const wrap=wrapRef.current; if(!svg||!wrap) return
    const W=wrap.clientWidth, H=520
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`)
    svg.innerHTML=''
    const g = d3.select(svg).append('g')
    // zoom
    const zoom = d3.zoom<SVGSVGElement,unknown>().scaleExtent([0.6,3.2]).on('zoom', (e)=> g.attr('transform', e.transform))
    d3.select(svg).call(zoom as any)

    // build simulation with copy of nodes to avoid mutating memo
    const simNodes: ZoneNode[] = nodes.map(n=>({...n, x: W/2 + (Math.random()-0.5)*160, y: H/2 + (Math.random()-0.5)*140 }))
    // pin Arkiv to center
    const arkiv = simNodes.find(n=>n.id==='arkiv'); if(arkiv){ arkiv.fx=W/2; arkiv.fy=H/2 }
    const simLinks = links.map(l=>({source: l.source, target: l.target, value: l.value, chain: l.chain}))
    const simulation = d3.forceSimulation(simNodes as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink(simLinks).id((d:any)=>d.id).distance((d:any)=> 78 + (d.value? d.value*2:0)).strength(0.42))
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(W/2, H/2))
      .force('collide', d3.forceCollide().radius((d:any)=> (d.r||14)+10).strength(0.85))
      .alphaDecay(0.04)

    const linkG = g.append('g').attr('class','links')
    const linkSel = linkG.selectAll('path').data(simLinks).join('path')
      .attr('fill','none')
      .attr('stroke',(d:any)=>{
        if(d.chain==='arkiv') return '#39d353'
        if(d.chain==='icp') return '#4e8cb4'
        if(d.chain==='evm') return '#d48a2e'
        return '#4e9fb0'
      })
      .attr('stroke-opacity',0.52)
      .attr('stroke-width',(d:any)=> Math.max(1.1, Math.min(4.8, d.value*0.28)))

    // flow particles
    const flowG = g.append('g').attr('class','flows')
    const flows = links.flatMap((l)=> Array.from({length: Math.ceil(l.value/7)}, (_,k)=>({id:`${l.source}-${l.target}-${k}`, source:l.source, target:l.target, chain:l.chain, t: Math.random()})))
    const flowSel = flowG.selectAll('circle').data(flows).join('circle')
      .attr('r',2.2)
      .attr('fill',(d:any)=> d.chain==='arkiv'?'#39d353': d.chain==='icp'?'#7cc4ff': d.chain==='evm'?'#ffb86b':'#7de6ff')
      .attr('opacity',0.95)

    const nodeG = g.append('g').attr('class','nodes')
    const nodeSel = nodeG.selectAll('g').data(simNodes).join('g')
      .attr('cursor', (d:any)=> d.explorer? 'pointer':'grab')
      .call(d3.drag<SVGGElement,ZoneNode>().on('start',(e,d:any)=>{ if(!e.active) simulation.alphaTarget(0.22).restart(); d.fx=d.x; d.fy=d.y }).on('drag',(e,d:any)=>{ d.fx=e.x; d.fy=e.y }).on('end',(e,d:any)=>{ if(!e.active) simulation.alphaTarget(0); if(d.id!=='arkiv'){ d.fx=null; d.fy=null }}) as any)
      .on('click', (_e,d:any)=>{ if(d.explorer) window.open(d.explorer,'_blank') })

    // define dao image patterns (for gating 0x token/NFT — public pricing image)
    const defs = g.append('defs')
    simNodes.filter((d:any)=>d.kind==='dao' && d.imageUrl).forEach((d:any)=>{
      const pat = defs.append('pattern').attr('id',`pat-${d.id}`).attr('patternUnits','objectBoundingBox').attr('width',1).attr('height',1)
      pat.append('image').attr('href', d.imageUrl).attr('width', d.r*2).attr('height', d.r*2).attr('preserveAspectRatio','xMidYMid slice')
    })
    nodeSel.append('circle')
      .attr('r',(d:any)=> d.r)
      .attr('fill',(d:any)=>{
        if(d.imageUrl) return `url(#pat-${d.id})`
        if(d.id==='arkiv') return '#0e201b'
        if(d.chain==='icp') return '#13202a'
        if(d.chain==='evm') return '#201a0e'
        if(d.chain==='filecoin') return '#0f2226'
        if(d.kind==='service') return '#161b22'
        return '#1b2128'
      })
      .attr('stroke',(d:any)=>{
        if(d.id==='arkiv') return '#39d353'
        if(d.chain==='icp') return '#4e8cb4'
        if(d.chain==='evm') return '#cc8a2a'
        if(d.chain==='filecoin') return '#4e9fb0'
        if(d.kind==='dao') return '#3d444d'
        return '#30363d'
      })
      .attr('stroke-width',(d:any)=> d.id==='arkiv'? 1.9 : d.kind==='network'? 1.35 : 1)
      .attr('stroke-opacity',0.95)

    nodeSel.append('text').attr('text-anchor','middle').attr('dy',4).attr('font-size',(d:any)=> d.r>20? 10 : 8.5).attr('font-weight',700).attr('fill','#e6edf3').attr('pointer-events','none').text((d:any)=> d.label.length>16? d.label.slice(0,16): d.label)
    nodeSel.append('text').attr('text-anchor','middle').attr('dy',(d:any)=> d.r+11).attr('font-size',7.5).attr('fill','#8b949e').attr('pointer-events','none').text((d:any)=> d.sub.length>26? d.sub.slice(0,26)+'…': d.sub)

    // explorer hint for clickable
    nodeSel.filter((d:any)=> !!d.explorer).append('text').attr('text-anchor','middle').attr('dy',(d:any)=> d.r+21).attr('font-size',6.5).attr('fill','#7aa2d9').attr('pointer-events','none').text('↗ explorer')

    simulation.on('tick', ()=>{
      linkSel.attr('d',(d:any)=>{
        const s=d.source as ZoneNode, t=d.target as ZoneNode
        if(!s.x||!s.y||!t.x||!t.y) return ''
        const mx=(s.x+t.x)/2, my=(s.y+t.y)/2
        const dx=t.x-s.x, dy=t.y-s.y
        const len=Math.hypot(dx,dy)||1
        const nx=-dy/len, ny=dx/len
        const curve = Math.min(42, len*0.18)
        const cx=mx+nx*curve, cy=my+ny*curve
        return `M${s.x},${s.y} Q${cx},${cy} ${t.x},${t.y}`
      })
      nodeSel.attr('transform',(d:any)=> `translate(${d.x},${d.y})`)
      // move flow particles along path by advancing t
      flowSel.each(function(this:any, d:any){
        d.t = (d.t + 0.006 + d.chain.charCodeAt(0)*0.000002) % 1
        const link = simLinks.find((l:any)=> (typeof l.source==='object'? (l.source as any).id===d.source : l.source===d.source) && (typeof l.target==='object'? (l.target as any).id===d.target : l.target===d.target))
        if(!link) return
        const s=(link as any).source as ZoneNode, t2=(link as any).target as ZoneNode
        if(!s?.x||!t2?.x) return
        const mx=(s.x!+t2.x!)/2, my=(s.y!+t2.y!)/2
        const dx=t2.x!-s.x!, dy=t2.y!-s.y!, len=Math.hypot(dx,dy)||1
        const nx=-dy/len, ny=dx/len, curve=Math.min(42,len*0.18)
        const cx=mx+nx*curve, cy=my+ny*curve
        const tt=d.t
        // quadratic bezier interpolate
        const x=(1-tt)*(1-tt)*s.x! + 2*(1-tt)*tt*cx + tt*tt*t2.x!
        const y=(1-tt)*(1-tt)*s.y! + 2*(1-tt)*tt*cy + tt*tt*t2.y!
        d3.select(this).attr('cx', x).attr('cy', y)
      })
    })
    return()=>{ simulation.stop() }
  },[nodes, links])

  return (
    <div className="app universe">
      <Starfield />
      <header className="hdr">
        <div className="brand">
          <span className="logo">Haven</span>
          <span className="sub">Distributed public networks · no private backend</span>
          <span className={`dot ${live?'live':'mock'}`} title={live?'RPC live':'mock 90d fallback'} />
        </div>
        <nav className="nav">
          <button className={view==='architecture'?'on':''} onClick={()=>setView('architecture')}>Architecture</button>
          <button className={view==='live'?'on':''} onClick={()=>setView('live')}>Live network</button>
          <a href="../README.md">Docs</a><a href="https://github.com/Haven-hvn/docs">GitHub</a>
        </nav>
      </header>

      {view==='architecture' ? (
        <div className="arch">
          <div className="arch-hero">
            <div>
              <h1>Haven — how the pieces fit</h1>
              <p>Every Haven surface is a thin client over <b>public networks</b>. No shared Postgres, no private backend. Arkiv is the shared log (entity contract), haven-aol is the decrypt gate (VetKD + EVM), Filecoin is the pin layer, DFINITY & EVM are the identity roots. Same <code>0x</code> uploader across Arkiv, Base and Ethereum.</p>
              <div className="arch-kicker"><span>5 decoupled surfaces</span><span>•</span><span>1 shared entity shape</span><span>•</span><span>4 public chains</span></div>
            </div>
            <div className="arch-cta">
              <button className="cta" onClick={()=>setView('live')}>Explore live network →</button>
              <span className="cta-hint">{activeDaos.length} active DAOs (90d) · {live?'RPC live':'mock'} · d3-force Map of Zones</span>
            </div>
          </div>

          <div className="arch-diagram">
            <div className="arch-layer">
              <div className="layer-label">Surfaces — permissionless clients</div>
              <div className="layer-row">
                <div className="arch-card soft"><b>haven-dapp</b><span>TypeScript · web</span><code>src/lib/arkiv.ts</code></div>
                <div className="arch-card soft"><b>haven-cli</b><span>Python · any actor</span><code>haven-cli</code></div>
                <div className="arch-card soft"><b>haven-mobile</b><span>Kotlin · Android</span><small>not TypeScript</small></div>
                <div className="arch-card accent"><b>haven-aol</b><span>Python / Motoko · AAL</span><code>VetKD + EVM gate</code></div>
                <div className="arch-card soft"><b>arkiv-chain</b><span>Rust · EntityRegistry</span><code>contracts/EntityRegistry.sol</code></div>
              </div>
              <div className="arch-arrow">uses shared shape + gates →</div>
            </div>

            <div className="arch-layer core">
              <div className="layer-label">Shared log — the only source of truth</div>
              <div className="layer-row">
                <div className="arch-card core-card">
                  <b>Entity shape (shared)</b>
                  <code>entity_type, title, media, attributes</code>
                  <pre>{`{ id, owner: 0x…, created_at_block,\n  entity_type: "DataDAO",\n  title, media: ipfs://bafy…,\n  attributes: { chain, token_address } }`}</pre>
                  <a href="../entities/ENTITY_SHAPE.md">ENTITY_SHAPE.md ↗</a>
                </div>
                <div className="arch-card core-card">
                  <b>Media content (standardized)</b>
                  <code>cid, mime, size_bytes, duration</code>
                  <pre>{`media: { cid, mime, size_bytes,\n  duration, thumbnail }\nattributes: { chain, token }`}</pre>
                  <a href="../entities/MEDIA_CONTENT_SPEC.md">MEDIA_CONTENT_SPEC.md ↗</a>
                </div>
                <div className="arch-card core-card">
                  <b>Arkiv EntityRegistry</b>
                  <span>OP L3 <code>0x4400…0044</code></span>
                  <code>arkiv_query • arkiv_getEntityCount</code>
                  <a href="https://braga.hoodi.arkiv.network" target="_blank" rel="noreferrer">braga.hoodi.arkiv.network ↗</a>
                </div>
              </div>
              <div className="arch-arrow">pinned & paid →</div>
            </div>

            <div className="arch-layer">
              <div className="layer-label">DAOs ≠ chains — each DAO is a gating 0x that proves ownership</div>
              <div className="layer-row dao-row">
                {MOCK_DAOS.map(d=>(
                  <a key={d.handle} className="arch-card dao-gate" href={`https://basescan.org/address/${d.tokenAddress}`} target="_blank" rel="noreferrer">
                    <img src={d.imageUrl} alt="" width={36} height={36} loading="lazy" style={{borderRadius:8, border:'1px solid #2a333e'}} />
                    <b>{d.name}</b>
                    <span>{d.tokenSymbol} · {d.tokenType==='nft' ? `NFT · ${(d as any).floorPriceEth} ETH floor` : `token · $${(d as any).priceUsd}`}</span>
                    <code>{d.tokenAddress.slice(0,10)}…{d.tokenAddress.slice(-6)}</code>
                    <small>{fmtUsd(d.marketCapUsd)} mcap · {fmtGb(d.gbStored)} pinned ↗ Basescan</small>
                  </a>
                ))}
              </div>
              <div className="arch-note">Same uplift `0x` owner creates the entity; the **gating `token_address`** above is what `haven-aol` checks via `eth_call` + VetKD before decrypt. Pricing + images from CoinGecko / Reservoir / Basescan public feeds.</div>
            </div>

            <div className="arch-layer public">
              <div className="layer-label">Public networks — no private backend</div>
              <div className="layer-row">
                <a className="arch-card chain arkiv" href="https://braga.hoodi.arkiv.network" target="_blank" rel="noreferrer"><b>Arkiv OP L3</b><span>0x440000…0044</span><small>entities · tx ↗</small></a>
                <a className="arch-card chain icp" href={`https://dashboard.internetcomputer.org/canister/${CANISTER_ID}`} target="_blank" rel="noreferrer"><b>DFINITY ICP</b><span>{CANISTER_ID}</span><small>VetKD · container ↗</small></a>
                <a className="arch-card chain evm" href="https://basescan.org" target="_blank" rel="noreferrer"><b>EVM — Base / Ethereum</b><span>same 0x owner</span><small>gate eth_call ↗</small></a>
                <a className="arch-card chain filecoin" href={FILECOIN_EXPLORER_CONTRACT(CALIBRATION_FILECOIN_PAY)} target="_blank" rel="noreferrer"><b>Filecoin FEVM + IPFS (calibration)</b><span>filecoin-pin · pay · 314159</span><small>{CALIBRATION_FILECOIN_PAY.slice(0,10)}… ↗ contract</small></a>
              </div>
            </div>
          </div>

          <div className="arch-flow">
            <h3>Flow — create → gate → pin → read</h3>
            <ol>
              <li><b>Author</b> (via <code>haven-dapp</code>/<code>haven-cli</code>/<code>haven-mobile</code> Kotlin + <code>haven-aol</code>) creates entity — <code>entity_type=DataDAO</code>, <code>media: ipfs://bafy…</code>, <code>size_bytes</code>, gating <code>token_address</code> (the <code>0x</code> above — ERC-20 token like FDD or NFT collection like ABDAO; DAOs ≠ chains). Owner is the same <code>0x{demoUploader.slice(2,8)}</code> on Arkiv, Base, Ethereum; the gating address is what pricing/images key off.</li>
              <li><b>haven-aol</b> encrypts media key: <code>VetKD derive</code> on <code>{CANISTER_ID}</code> + EVM <code>eth_call</code> against the gating <code>0x</code> (check ERC-20 balance or ERC-721 holder). Only holders of that 0x token/NFT can derive.</li>
              <li><b>Filecoin</b> pin: <code>filecoin-pin</code> FEVM calibration contract <code>getPinStatus(cid)</code> + <code>filecoin-pay</code> storage deal — sum <code>size_bytes</code> per DAO = GB shown in Map of Zones (Storage view). GB and mcap are linked via the same gating <code>0x</code> — pricing from CoinGecko/Reservoir, images public.</li>
              <li><b>Reader</b> fetches <code>arkiv_query</code> (90d filter <code>created_at_block ≥ now-90d</code>) filtered to that gating <code>0x</code>, calls <code>haven-aol</code> to prove ownership, derives key, decrypts IPFS content from Filecoin (calibration). In-flight txs appear live on the Map of Zones with explorer links per chain + to the gating 0x on Basescan.</li>
            </ol>
          </div>

          <div className="arch-compare">
            <div className="compare-card">
              <h4>Storage view</h4>
              <p>Zone = GB pinned via Filecoin (sqrt-scaled). Channel = GB volume. Answers “who stores the most?” — currently Filecoin DataDAO 847 GB dominant.</p>
              <button onClick={()=>setView('live')}>Open Storage map →</button>
            </div>
            <div className="compare-card">
              <h4>Marketcap view</h4>
              <p>Zone = token/NFT marketcap (ERC-20/721 price×supply). Channel = mcap volume. Answers “who is most valued?” — $12.4M vs $42k spread.</p>
              <button onClick={()=>setView('live')}>Open Marketcap map →</button>
            </div>
          </div>
          <div className="arch-foot">Highly decoupled: each surface ships alone, talks only via RPC to the four public networks. No private DB ever sees an entity — the blockchains + IPFS are the database. <a href="../architecture/WEB3_PARADIGM.md">WEB3_PARADIGM.md ↗</a></div>
        </div>
      ) : (
      <>
      <div className="bar">
        <div className="sizing">
          <span className="label">Map sizing</span>
          <button className={sizingMode==='storage'?'on':''} onClick={()=>setSizingMode('storage')} title="Size DAO zones by GB pinned via Filecoin FEVM filecoin-pin">Storage · GB pinned</button>
          <button className={sizingMode==='marketcap'?'on':''} onClick={()=>setSizingMode('marketcap')} title="Size DAO zones by token/NFT marketcap (price × supply)">Marketcap · token/NFT</button>
          <span className="hint">{sizingMode==='storage' ? 'zone = GB via Filecoin pin · sqrt-scaled' : 'zone = token/NFT mcap · sqrt-scaled'}</span>
        </div>
        <div className="dao-bar">
          <span className="label">DataDAOs</span>
          <button className={daoFilter==='active90'?'on':''} onClick={()=>setDaoFilter('active90')}>Active 90d · {activeDaos.length}</button>
          <button className={daoFilter==='all'?'on':''} onClick={()=>setDaoFilter('all')}>All ({MOCK_DAOS.length})</button>
          <span className="hint">same 0x uploader across Arkiv/EVM ({demoUploader.slice(0,6)}…)</span>
        </div>
        <div className="chains">
          {(['all','arkiv','icp','evm','filecoin'] as const).map(c=> <button key={c} className={chainFilter===c?'on':''} onClick={()=>setChainFilter(c)}>{c}</button>)}
        </div>
        <div className="meta"><span>{filtered.length} in-flight</span><span className="rpc">Arkiv RPC {RPCS.arkiv}</span>{error && <span className="err">{error}</span>}</div>
      </div>

      <div className="grid">
        <div className="map">
          <div className="map-head">
            <h3>Public Networks Universe <small>d3-force · {sizingMode==='storage' ? 'GB-weighted' : 'mcap-weighted'} · Map of Zones</small></h3>
            <span className="legend"><i className="lg arkiv" />Arkiv <i className="lg icp" />ICP <i className="lg evm" />EVM <i className="lg filecoin" />Filecoin — zone size = {sizingMode==='storage' ? 'GB pinned via Filecoin' : 'token/NFT marketcap'} · channel = {sizingMode==='storage' ? 'GB' : 'mcap'} volume · drag & zoom</span>
          </div>
          <div ref={wrapRef} className="svg-wrap">
            <svg ref={svgRef} className="zones-svg" width="100%" height="520" role="img" aria-label="Haven public networks Map of Zones" />
          </div>
          <div className="how">
            {sizingMode==='storage' ? (
              <>DAO size = <b>GB stored through Filecoin pin</b> (sqrt-scaled: 847 GB → 27px, 2.4 GB → 10px). Production: <code>arkiv_query</code> Entity CID + <code>size_bytes</code> → Filecoin FEVM <code>filecoin-pin</code> / <code>filecoin-pay</code> <code>getPinStatus(cid)</code> → sum pinned bytes/1e9 per DAO.</>
            ) : (
              <>DAO size = <b>token/NFT marketcap</b> (sqrt-scaled: $12.4M → 27px, $42k → 10px). Production: Arkiv <code>token_address</code> attr → Base/Ethereum ERC-20 <code>totalSupply × price</code> (CoinGecko/DEX) or ERC-721 <code>floor × supply</code> (Reservoir/OpenSea). GB shown alongside for cross-check.</>
            )} Same <code>0x{demoUploader.slice(2,8)}</code> uploader across Arkiv/EVM. Filtered <code>entity_type=DataDAO</code> &amp; <code>created_at_block ≥ now-90d</code>. Click any zone for explorer. DFINITY ICP: <a href={`https://dashboard.internetcomputer.org/canister/${CANISTER_ID}`} target="_blank" rel="noreferrer">{CANISTER_ID} ↗</a> · Arkiv L3 <code>0x4400…0044</code> · Filecoin <a href={FILECOIN_EXPLORER_CONTRACT(CALIBRATION_FILECOIN_PAY)} target="_blank" rel="noreferrer">calibration {CALIBRATION_FILECOIN_PAY.slice(0,8)} ↗</a> <a href={FILECOIN_EXPLORER_CONTRACT(CALIBRATION_FWSS)} target="_blank" rel="noreferrer">fwss ↗</a> (<code>calibration.filfox.info</code>). Mock values when Braga CORS blocks fetch — toggle maps to compare storage vs mcap.
          </div>
        </div>

        <div className="feed">
          <h3>In-flight transactions <small>poll 2.1s · DAO 90d · chain {chainFilter}</small></h3>
          <div className="txs">
            {filtered.length===0 && <div className="empty">No in-flight for this chain in 90d window — switch to “All” or “all chains”.</div>}
            {filtered.map(tx=> (
              <div key={tx.id} className={`tx ${tx.chain} ${tx.status}`}>
                <div className="tx-head">
                  <span className="badge">{tx.chain}</span>
                  <span className="dao-tag">{tx.dao}</span>
                  <span className="type">{tx.type}</span>
                  <span className={`status ${tx.status}`}>{tx.status}</span>
                  <span className="time">{new Date(tx.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="tx-body">
                  <code className="hash">{tx.hash.slice(0,18)}…{tx.hash.slice(-6)}</code>
                  <div className="route">{tx.from.slice(0,10)}… (same 0x) → {tx.to.slice(0,18)}…</div>
                  {tx.payload && <pre className="payload">{tx.payload.slice(0,140)}</pre>}
                </div>
                <div className="tx-foot">
                  <a href={tx.blockExplorerUrl} target="_blank" rel="noreferrer">Block explorer ↗</a>
                  <span className="rpcUrl">{tx.rpcUrl}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </>
      )}

      <footer className="ftr"><span>Haven · 5 decoupled surfaces (arkiv-chain Rust · haven-aol Python/Motoko · haven-dapp TS · haven-cli Python · haven-mobile Kotlin) · shared state is blockchains only — no private backend</span><a href="../README.md">← Back to docs</a></footer>
    </div>
  )
}
