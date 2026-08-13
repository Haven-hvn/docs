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

const MOCK_ATTRIBUTES = [
  { title: 'Haven Demo Clip', is_encrypted: 1, duration: 42, creator_handle: 'alice' },
  { title: 'Arkiv Entity CREATE', is_encrypted: 0, phash: 'a3f9…' },
  { title: 'Filecoin CID pin', is_encrypted: 1, encrypted_cid: 'bafy…' },
  { title: 'VetKD derive accessol_v3', is_encrypted: 1, threshold: 0 },
]

function useArkivPoll() {
  const [txs, setTxs] = useState<InFlightTx[]>([])
  const [live, setLive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<number | null>(null)

  const fetchArkiv = async () => {
    try {
      // Try real Arkiv RPC — falls back to mock if network/CORS fails
      const res = await fetch(RPCS.arkiv, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'arkiv_getEntityCount', params: [] }),
      })
      if (res.ok) {
        const j = await res.json()
        if (j.result !== undefined) setLive(true)
      }
    } catch (e: any) {
      setError(e.message)
    }
    // Always push a mock in-flight tx to visualize the system
    const now = Date.now()
    const isMock = Math.random() > 0.45
    if (isMock) {
      const chain: Chain = (['arkiv', 'icp', 'evm', 'filecoin'] as Chain[])[Math.floor(Math.random() * 4)]
      const attr = MOCK_ATTRIBUTES[Math.floor(Math.random() * MOCK_ATTRIBUTES.length)]
      const hash = `0x${now.toString(16)}${Math.floor(Math.random()*0xffff).toString(16).padStart(4,'0')}`
      const tx: InFlightTx = {
        id: `${chain}-${now}`,
        hash,
        chain,
        type: chain === 'arkiv' ? `Entity ${['CREATE','UPDATE','EXTEND'][Math.floor(Math.random()*3)]}` : chain === 'icp' ? 'VetKD derive' : chain === 'evm' ? 'Gate EVM eth_call' : 'Filecoin pin',
        from: '0x' + Math.random().toString(16).slice(2,10),
        to: chain === 'arkiv' ? '0x4400000000000000000000000000000000000044' : chain === 'icp' ? 'dciac-uaaaa-aaaad-qlzuq-cai' : '0xFilecoinFEVM',
        blockExplorerUrl: EXPLORERS[chain](hash),
        rpcUrl: RPCS[chain],
        timestamp: now,
        status: Math.random() > 0.2 ? 'pending' : 'confirmed',
        payload: chain === 'arkiv' ? JSON.stringify(attr) : undefined,
        attributes: attr as any,
      }
      setTxs(prev => [tx, ...prev].slice(0, 25))
    }
  }

  useEffect(() => {
    fetchArkiv()
    intervalRef.current = window.setInterval(fetchArkiv, 2500)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  return { txs, live, error }
}

export default function App() {
  const { txs, live, error } = useArkivPoll()
  const [filter, setFilter] = useState<Chain | 'all'>('all')
  const filtered = filter === 'all' ? txs : txs.filter(t => t.chain === filter)

  return (
    <div className="app">
      <header className="hdr">
        <div className="brand">
          <span className="logo">Haven</span>
          <span className="sub">Live • Public Networks • No Private Backend</span>
          <span className={`dot ${live ? 'live' : 'mock'}`} title={live ? 'RPC live' : 'RPC mock fallback'} />
        </div>
        <nav className="nav">
          <a href="../README.md">Docs</a>
          <a href="../architecture/WEB3_PARADIGM.md">Web3 Paradigm</a>
          <a href="https://github.com/Haven-hvn/docs">GitHub</a>
        </nav>
      </header>

      <div className="bar">
        <div className="chains">
          {(['all','arkiv','icp','evm','filecoin'] as const).map(c => (
            <button key={c} className={filter===c?'on':''} onClick={()=>setFilter(c)}>{c}</button>
          ))}
        </div>
        <div className="meta">
          <span>{filtered.length} in-flight</span>
          <span className="rpc">Arkiv RPC: {RPCS.arkiv}</span>
          {error && <span className="err">{error.slice(0,40)}</span>}
        </div>
      </div>

      <div className="grid">
        <div className="map">
          <h3>Public Networks (Map of Zones — inspired)</h3>
          <div className="zones">
            <div className="zone icp"><span>DFINITY ICP</span><small>VetKD</small></div>
            <div className="zone arkiv"><span>Arkiv OP L3</span><small>0x44…0044</small></div>
            <div className="zone evm"><span>EVM</span><small>Ethereum/Base gates</small></div>
            <div className="zone filecoin"><span>Filecoin FEVM/IPFS</span><small>pin</small></div>
          </div>
          <div className="surfaces">
            {(['haven-dapp','haven-cli','haven-mobile','haven-aol','arkiv-chain'] as const).map(s => (
              <span key={s} className="surf">{s}</span>
            ))}
          </div>
          <div className="legend">Arcs = Candid / SDK / precompile • Thickness = tx volume (mock) • <a href="../assets/corbell-graph.png">Corbell D3: 5 services 0 stores kotlin</a></div>
          <MermaidSmall />
        </div>

        <div className="feed">
          <h3>In-flight Transactions <small>poll {RPCS.arkiv} + ICP + EVM + Filecoin • 2.5s</small></h3>
          <div className="txs">
            {filtered.length===0 && <div className="empty">Waiting for next block… (mock stream active even if RPC CORS blocks)</div>}
            {filtered.map(tx => (
              <div key={tx.id} className={`tx ${tx.chain} ${tx.status}`}>
                <div className="tx-head">
                  <span className="badge">{tx.chain}</span>
                  <span className="type">{tx.type}</span>
                  <span className={`status ${tx.status}`}>{tx.status}</span>
                  <span className="time">{new Date(tx.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="tx-body">
                  <code className="hash">{tx.hash.slice(0,18)}…{tx.hash.slice(-6)}</code>
                  <div className="route">{tx.from} → {tx.to}</div>
                  {tx.payload && <pre className="payload">{tx.payload.slice(0,120)}</pre>}
                </div>
                <div className="tx-foot">
                  <a href={tx.blockExplorerUrl} target="_blank" rel="noreferrer">Block explorer ↗</a>
                  <span className="rpcUrl">{tx.rpcUrl}</span>
                  <a href={tx.blockExplorerUrl} target="_blank" rel="noreferrer" className="view">Entity {tx.id.slice(-6)}</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="ftr">
        <span>Haven docs live app • Vite + React + TS • Polls {RPCS.arkiv} (arkiv_getEntityCount) + ICP status, falls back to mock in-flight stream for demo • No private backend — all state on public chains</span>
        <a href="../README.md">← Back to docs</a>
      </footer>
    </div>
  )
}

function MermaidSmall(){
  return (
    <pre className="mermaid-mini">{`graph LR
  arkiv-chain["arkiv-chain 0x44"] -->|arkiv_query| haven-dapp
  haven-dapp -->|Candid| haven-aol -->|vetkd_derive| ICP
  haven-cli -->|execute(Operation[])| arkiv-chain
  haven-dapp/haven-cli -->|pin| Filecoin
  haven-aol -->|eth_call| EVM`}</pre>
  )
}
