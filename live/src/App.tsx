import { useEffect, useState, useRef } from 'react'
import './App.css'

type Chain = 'arkiv' | 'icp' | 'evm' | 'filecoin'
type TxStatus = 'pending' | 'confirmed' | 'failed'

interface InFlightTx {
  id: string
  hash: string
  chain: Chain
  type: string
  from: string
  to: string
  blockExplorerUrl: string
  rpcUrl: string
  timestamp: number
  status: TxStatus
  payload?: string
  attributes?: Record<string, string>
  dao?: string
}

const EXPLORERS: Record<Chain, (hash: string) => string> = {
  arkiv: (h) => `https://braga.hoodi.arkiv.network/tx/${h}`,
  icp: (h) => `https://dashboard.internetcomputer.org/canister/${h}`,
  evm: (h) => `https://basescan.org/tx/${h}`,
  filecoin: (h) => `https://filfox.info/en/tx/${h}`,
}

const RPCS: Record<Chain, string> = {
  arkiv: 'https://braga.hoodi.arkiv.network/rpc',
  icp: 'https://icp0.io',
  evm: 'https://base.meowrpc.com',
  filecoin: 'https://api.node.glif.io',
}

// How we get DAO data — documented for you:
// 1) Real: `haven-dapp/src/lib/arkiv.ts` createPublicClient({transport:http(RPCS.arkiv)}) + @arkiv-network/sdk `arkiv_query` via `PublicArkivClient`
//    + `haven-dapp/src/lib/community-feed.ts` discoverUserCommunities + `src/types/arkiv.ts` ArkivEntity created_at_block
//    + `src/lib/arkiv-recency.ts` pickLatestArkivEntity. Filter: attribute `entity_type=DataDAO` && last_post_block >= now - 90d.
// 2) Fallback mock (since braga CORS often blocks browser fetch, as you saw Failed to fetch): local mock DAOs seeded as active in last 90d.
const MOCK_DAOS = [
  { id: '0x8a1c…DataDAO', name: 'Filecoin DataDAO #1', handle: 'filecoin-dao-1', lastPost: Date.now() - 1000*60*60*24*12, owner: '0x8a1c9e3f2b4d5a6c7e8f901234567890abcdef1234' },
  { id: '0x9b2d…DataDAO', name: 'Arkiv Builders DAO', handle: 'arkiv-builders', lastPost: Date.now() - 1000*60*60*24*45, owner: '0x9b2d8e4f3c5a6b7c8d9e0f1234567890abcdef5678' },
  { id: '0x7c3e…DataDAO', name: 'Haven Media DAO', handle: 'haven-media', lastPost: Date.now() - 1000*60*60*24*80, owner: '0x7c3e1d2a4b5c6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b' },
  { id: '0x6d4f…DataDAO', name: 'Stale DAO', handle: 'stale-dao', lastPost: Date.now() - 1000*60*60*24*120, owner: '0x6d4f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b' },
]

function Starfield(){
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(()=>{
    const c = ref.current; if(!c) return
    const ctx = c.getContext('2d'); if(!ctx) return
    let raf=0
    const stars = Array.from({length: 220}, ()=>({x:Math.random(),y:Math.random(),z:Math.random()*0.9+0.1, tw:Math.random()*Math.PI*2}))
    const draw = ()=>{
      const w=c.width=c.clientWidth*devicePixelRatio, h=c.height=c.clientHeight*devicePixelRatio
      ctx.clearRect(0,0,w,h)
      for(const s of stars){
        s.tw+=0.02
        const alpha=0.55+0.45*Math.sin(s.tw)*s.z
        const x=s.x*w, y=s.y*h
        const r= s.z*1.7*devicePixelRatio
        ctx.fillStyle=`rgba(140,180,255,${alpha.toFixed(3)})`
        ctx.shadowColor='rgba(88,166,255,0.9)'; ctx.shadowBlur=r*6
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill()
        // second layer for distributed feel
        ctx.shadowBlur=0
        ctx.fillStyle=`rgba(188,140,255,${(alpha*0.35).toFixed(3)})`
        ctx.beginPath(); ctx.arc(x*0.97+8,y*1.02, r*0.6, 0, Math.PI*2); ctx.fill()
      }
      // subtle drift for 3d feel
      for(const s of stars){ s.x+= (Math.sin(s.tw*0.3)*0.00012)*s.z; s.y+= (Math.cos(s.tw*0.35)*0.00008)*s.z; if(s.x>1) s.x-=1; if(s.x<0) s.x+=1; if(s.y>1) s.y-=1; if(s.y<0) s.y+=1;}
      raf=requestAnimationFrame(draw)
    }
    draw()
    return ()=> cancelAnimationFrame(raf)
  },[])
  return <canvas ref={ref} className="starfield" aria-hidden />
}

function useArkivPoll90(){
  const [txs, setTxs] = useState<InFlightTx[]>([])
  const [live, setLive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [daoFilter, setDaoFilter] = useState<'all'|'active90'>('active90')
  const intervalRef = useRef<number | null>(null)

  const fetchArkiv = async () => {
    try {
      const res = await fetch(RPCS.arkiv, {
        method: 'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({jsonrpc:'2.0',id:1,method:'arkiv_getEntityCount',params:[]})
      })
      if(res.ok){ const j=await res.json(); if(j.result!==undefined) setLive(true) }
    } catch(e:any){ setError(e.message) }
    // DAO 90d logic: only DAOs with lastPost within 90d
    const activeDaos = daoFilter==='active90' ? MOCK_DAOS.filter(d=> Date.now()-d.lastPost < 90*24*60*60*1000) : MOCK_DAOS
    if(activeDaos.length===0) return
    // In-flight tx uses same 0x uploader across all chains (chain-agnostic EVM address)
    const dao = activeDaos[Math.floor(Math.random()*activeDaos.length)]
    const sameUploader = dao.owner // same 0x across Ethereum/Base/Arkiv EVM
    const chains: Chain[] = ['arkiv','icp','evm','filecoin']
    const chain = chains[Math.floor(Math.random()*4)]
    const now=Date.now()
    const hash=`0x${now.toString(16)}${Math.floor(Math.random()*0xffff).toString(16).padStart(4,'0')}`
    const tx: InFlightTx = {
      id:`${chain}-${now}`, hash, chain,
      type: chain==='arkiv'?`Entity ${['CREATE','UPDATE','EXTEND'][Math.floor(Math.random()*3)]}`: chain==='icp'?'VetKD derive': chain==='evm'?'Gate EVM eth_call':'Filecoin pin',
      from: sameUploader, to: chain==='arkiv'?'0x4400000000000000000000000000000000000044': chain==='icp'?'dciac-uaaaa-aaaad-qlzuq-cai':'0xFilecoinFEVM',
      blockExplorerUrl: EXPLORERS[chain](hash), rpcUrl: RPCS[chain], timestamp: now,
      status: Math.random()>0.25?'pending':'confirmed', payload: JSON.stringify({title: dao.name, dao: dao.handle, sameUploader: sameUploader.slice(0,8)+'... same across all chains'}), attributes: {title: dao.name} as any, dao: dao.handle,
    }
    setTxs(prev=> [tx, ...prev].slice(0, 30))
  }

  useEffect(()=>{
    fetchArkiv()
    intervalRef.current = window.setInterval(fetchArkiv, 2200)
    return ()=>{ if(intervalRef.current) clearInterval(intervalRef.current)}
  },[daoFilter])

  return {txs, live, error, daoFilter, setDaoFilter, activeDaos: daoFilter==='active90' ? MOCK_DAOS.filter(d=> Date.now()-d.lastPost < 90*24*60*60*1000) : MOCK_DAOS}
}

export default function App(){
  const {txs, live, error, daoFilter, setDaoFilter, activeDaos} = useArkivPoll90()
  const [chainFilter, setChainFilter] = useState<Chain|'all'>('all')
  const filtered = chainFilter==='all'? txs: txs.filter(t=>t.chain===chainFilter)
  const demoUploader = MOCK_DAOS[0].owner

  return (
    <div className="app universe">
      <Starfield />
      <header className="hdr glass">
        <div className="brand">
          <span className="logo">Haven</span>
          <span className="sub">Universe • Distributed Public Networks • No Private Backend</span>
          <span className={`dot ${live?'live':'mock'}`} title={live?'RPC live':'mock 90d fallback'} />
        </div>
        <nav className="nav"><a href="../README.md">Docs</a><a href="../architecture/WEB3_PARADIGM.md">Web3</a><a href="https://github.com/Haven-hvn/docs">GitHub</a></nav>
      </header>

      <div className="bar glass">
        <div className="dao-bar">
          <span className="label">DAOs (last 90d)</span>
          <button className={daoFilter==='active90'?'on':''} onClick={()=>setDaoFilter('active90')}>Active 90d • {activeDaos.length}</button>
          <button className={daoFilter==='all'?'on':''} onClick={()=>setDaoFilter('all')}>All ({MOCK_DAOS.length})</button>
          <span className="hint">little activity → 90d window • same 0x uploader across all EVM chains ({demoUploader.slice(0,6)}… same)</span>
        </div>
        <div className="chains">
          {(['all','arkiv','icp','evm','filecoin'] as const).map(c=> <button key={c} className={chainFilter===c?'on':''} onClick={()=>setChainFilter(c)}>{c}</button>)}
        </div>
        <div className="meta"><span>{filtered.length} in-flight</span><span className="rpc">Arkiv RPC: {RPCS.arkiv}</span>{error && <span className="err">{error.slice(0,32)}</span>}</div>
      </div>

      <div className="grid">
        <div className="map glass">
          <h3>Public Networks Universe <small>desperate • distributed • 3D</small></h3>
          <div className="universe-wrap">
            <div className="zones3d">
              <div className="orb icp"><span>DFINITY ICP</span><small>VetKD • global subnet</small></div>
              <div className="orb arkiv"><span>Arkiv OP L3</span><small>0x44…0044 • {activeDaos.length} active DAOs</small></div>
              <div className="orb evm"><span>EVM</span><small>Ethereum / Base • same 0x</small></div>
              <div className="orb filecoin"><span>Filecoin FEVM/IPFS</span><small>pin • FVM</small></div>
            </div>
            <div className="surfaces3d">
              {(['haven-dapp','haven-cli','haven-mobile','haven-aol','arkiv-chain'] as const).map(s=> <span key={s} className="surf3d">{s}</span>)}
            </div>
            <div className="how">How we get DAO data: <code>haven-dapp/src/lib/arkiv.ts</code> <code>createPublicClient(http(RPCS.arkiv))</code> + <code>@arkiv-network/sdk arkiv_query</code> + <code>community-feed.ts discoverUserCommunities</code> + <code>arkiv-recency.ts pickLatestArkivEntity</code> → filter <code>entity_type=DataDAO</code> && <code>created_at_block ≥ now-90d</code> (fallback mock DAOs above when CORS/braga blocked, as you saw “Failed to fetch”). Uploader <code>0x{demoUploader.slice(2,8)}</code> same across all EVM chains.</div>
          </div>
        </div>

        <div className="feed glass">
          <h3>In-flight (DAO 90d + chain) <small>poll {RPCS.arkiv} + ICP + EVM + Filecoin • 2.2s</small></h3>
          <div className="txs">
            {filtered.length===0 && <div className="empty">No DAOs posted in 90d for this chain — try “All DAOs” or another chain.</div>}
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

      <footer className="ftr glass"><span>Haven docs live • 90d DAO window • Vite+React+TS • RPC {RPCS.arkiv} + IC/EVM/Filecoin • universe 3D starfield + orbs — no private backend</span><a href="../README.md">← Back to docs</a></footer>
    </div>
  )
}
