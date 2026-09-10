import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { ArrowUpRight, ChevronDown, CircleHelp, Copy, ImagePlus, Menu, Search, Sparkles, Wallet, X, Zap } from 'lucide-react'
import { ARC_TESTNET, connectArcWallet, formatWalletAddress, getInjectedProvider, launchTokenOnArc, readArcLaunches, readArcWalletBalances, readTokenBalance, type ArcLaunch, type ArcWalletBalances } from './lib/arc'

type MigrationStatus = 'active' | 'graduating' | 'migrated'
type Token = { id: string; name: string; ticker: string; description: string; progress: number; marketCap: number; change: number; price: number; holders: number; status: MigrationStatus; visual: string; created: string; createdMinutes: number }

const tokens: Token[] = [
  { id: 'keyboard-cat', name: 'Keyboard Cat', ticker: 'KEYS', description: 'the sound of a million tabs closing at once.', progress: 92, marketCap: 94200, change: 24.8, price: 0.00942, holders: 842, status: 'graduating', visual: 'cat', created: '18m ago', createdMinutes: 18 },
  { id: 'arcade-ghost', name: 'Arcade Ghost', ticker: 'GHOST', description: 'insert coin. haunt the timeline.', progress: 64, marketCap: 64800, change: 11.2, price: 0.00648, holders: 611, status: 'active', visual: 'ghost', created: '42m ago', createdMinutes: 42 },
  { id: 'toad-frog', name: 'Toad Frog', ticker: 'TOAD', description: 'not a frog. not financial advice.', progress: 41, marketCap: 41200, change: -3.4, price: 0.00412, holders: 389, status: 'active', visual: 'toad', created: '1h ago', createdMinutes: 60 },
  { id: 'usdc-baby', name: 'USDC Baby', ticker: 'BABY', description: 'born on ARC. raised on conviction.', progress: 12, marketCap: 11900, change: 8.9, price: 0.00119, holders: 124, status: 'active', visual: 'baby', created: '2h ago', createdMinutes: 120 },
  { id: 'night-shift', name: 'Night Shift', ticker: 'NITE', description: 'for everyone still building after midnight.', progress: 100, marketCap: 182400, change: 46.1, price: 0.01824, holders: 1204, status: 'migrated', visual: 'night', created: 'yesterday', createdMinutes: 1440 },
  { id: 'pixel-pigeon', name: 'Pixel Pigeon', ticker: 'PIGEON', description: 'the bird that always finds alpha.', progress: 27, marketCap: 26800, change: 5.6, price: 0.00268, holders: 243, status: 'active', visual: 'pigeon', created: '3h ago', createdMinutes: 180 },
]

const navItems = [{ label: 'Explore', to: '/' }, { label: 'Create', to: '/create' }]

type WalletState = {
  account: string | null
  balances: ArcWalletBalances | null
  error: string | null
}

function useArcWallet() {
  const [wallet, setWallet] = useState<WalletState>({ account: null, balances: null, error: null })
  const [isConnecting, setIsConnecting] = useState(false)

  const refreshBalances = async (account: string) => {
    try {
      const balances = await readArcWalletBalances(account)
      setWallet((current) => ({ ...current, account, balances, error: null }))
    } catch (error) {
      setWallet((current) => ({ ...current, account, error: error instanceof Error ? error.message : 'Unable to read wallet balance.' }))
    }
  }

  const connect = async () => {
    setIsConnecting(true)
    setWallet((current) => ({ ...current, error: null }))
    try {
      const connection = await connectArcWallet()
      setWallet({ account: connection.account, balances: null, error: null })
      await refreshBalances(connection.account)
    } catch (error) {
      setWallet((current) => ({ ...current, error: error instanceof Error ? error.message : 'Unable to connect wallet.' }))
    } finally {
      setIsConnecting(false)
    }
  }

  useEffect(() => {
    const provider = getInjectedProvider()
    if (!provider) return

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0]
      const account = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : null
      if (account) {
        setWallet((current) => ({ ...current, account, error: null }))
        void refreshBalances(account)
      } else {
        setWallet({ account: null, balances: null, error: null })
      }
    }
    const handleChainChanged = (...args: unknown[]) => {
      const chainId = args[0]
      if (typeof chainId === 'string' && chainId.toLowerCase() !== ARC_TESTNET.chainId) {
        setWallet((current) => ({ ...current, error: 'Switch your wallet back to Arc Testnet to continue.' }))
      }
    }

    void provider.request({ method: 'eth_accounts' }).then(handleAccountsChanged)
    provider.on?.('accountsChanged', handleAccountsChanged)
    provider.on?.('chainChanged', handleChainChanged)
    return () => {
      provider.removeListener?.('accountsChanged', handleAccountsChanged)
      provider.removeListener?.('chainChanged', handleChainChanged)
    }
  }, [])

  return { wallet, connect, isConnecting }
}

function Logo() {
  return <Link to="/" className="brand"><img src="/doxa-logo.png" alt="DOXA" /><span>DOXA<span className="brand-dot">.</span>xyz</span></Link>
}

function Header({ wallet, onConnect, isConnecting }: { wallet: WalletState; onConnect: () => void; isConnecting: boolean }) {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  return <header className="site-header"><div className="header-inner"><Logo /><nav className={menuOpen ? 'nav open' : 'nav'}>{navItems.map((item) => <Link key={item.to} className={location.pathname === item.to ? 'active' : ''} to={item.to} onClick={() => setMenuOpen(false)}>{item.label}</Link>)}{wallet.account && <Link className={location.pathname === '/wallet' ? 'active' : ''} to="/wallet" onClick={() => setMenuOpen(false)}>Wallet</Link>}</nav><div className="header-actions"><button className="network"><span className="status-dot" /> ARC testnet <ChevronDown size={14} /></button>{wallet.account ? <Link className="connect" to="/wallet"><Wallet size={15} /> {formatWalletAddress(wallet.account)}</Link> : <button className="connect" onClick={onConnect} disabled={isConnecting}><Wallet size={15} /> {isConnecting ? 'Connecting...' : 'Connect wallet'}</button>}</div><button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button></div>{wallet.error && <div className="container wallet-error" role="status">{wallet.error}</div>}</header>
}

function TokenMark({ variant, large = false }: { variant: string; large?: boolean }) {
  return <div className={`token-mark mark-${variant} ${large ? 'large' : ''}`} aria-hidden="true"><span>{variant === 'cat' ? '⌁' : variant === 'ghost' ? '◒' : variant === 'toad' ? '·ᴥ·' : variant === 'baby' ? '◡' : variant === 'night' ? '✦' : '⌁'}</span></div>
}

function StatusBadge({ status }: { status: MigrationStatus }) {
  const labels = { active: 'Active', graduating: 'Graduating', migrated: 'Migrated' }
  return <span className={`status-badge ${status}`}><span /> {labels[status]}</span>
}

function Sparkline({ positive = true }: { positive?: boolean }) {
  return <svg className="sparkline" viewBox="0 0 120 38" preserveAspectRatio="none" aria-hidden="true"><path d={positive ? 'M0 31 L14 27 L25 30 L38 20 L49 24 L61 18 L73 21 L86 10 L98 14 L110 6 L120 3' : 'M0 5 L14 9 L25 8 L38 16 L49 14 L61 20 L73 17 L86 26 L98 22 L110 31 L120 35'} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
}

function LiveTape() {
  const events = [
    { label: 'NEW', token: 'Mochi Signal', ticker: '$MOCHI', value: 'just launched', tone: 'mint' },
    { label: 'BUY', token: 'Keyboard Cat', ticker: '$KEYS', value: '12.4 USDC', tone: 'blue' },
    { label: 'BUY', token: 'Night Shift', ticker: '$NITE', value: '48.0 USDC', tone: 'violet' },
    { label: 'CURVE', token: 'Arcade Ghost', ticker: '$GHOST', value: '64% filled', tone: 'amber' },
    { label: 'NEW', token: 'Toad Frog', ticker: '$TOAD', value: '18m ago', tone: 'mint' },
  ]
  return <div className="live-tape" aria-label="Live launch activity"><div className="live-tape-label"><span className="pulse" /> Live feed</div><div className="live-tape-window"><div className="live-tape-track">{[...events, ...events].map((event, index) => <span className="live-event" key={`${event.ticker}-${index}`}><b className={`event-label ${event.tone}`}>{event.label}</b><strong>{event.token}</strong><em>{event.ticker}</em><small>{event.value}</small></span>)}</div></div></div>
}

function LaunchCard({ token }: { token: Token }) {
  return <Link to={`/token/${token.id}`} className={`launch-card card-${token.visual}`}><div className="launch-card-art"><TokenMark variant={token.visual} large /><span className="launch-age">{token.created}</span><StatusBadge status={token.status} /></div><div className="launch-card-body"><div className="launch-card-title"><div><h3>{token.name}</h3><span>${token.ticker}</span></div><strong className={token.change < 0 ? 'negative' : 'positive'}>{token.change > 0 ? '+' : ''}{token.change}%</strong></div><p>{token.description}</p><div className="launch-progress"><div><span>Bonding curve</span><b>{token.progress}%</b></div><div className="progress-track"><span style={{ width: `${token.progress}%` }} /></div></div><div className="launch-card-meta"><span><small>MCAP</small>${token.marketCap.toLocaleString()}</span><span><small>HOLDERS</small>{token.holders}</span><Sparkline positive={token.change >= 0} /></div></div></Link>
}

function Explore({ onConnect, wallet, isConnecting }: { onConnect: () => void; wallet: WalletState; isConnecting: boolean }) {
  const [filter, setFilter] = useState('Trending')
  const [search, setSearch] = useState('')
  const filteredTokens = useMemo(() => tokens.filter((token) => `${token.name} ${token.ticker}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => filter === 'New launches' ? a.createdMinutes - b.createdMinutes : filter === 'Graduating' ? b.progress - a.progress : b.change - a.change), [filter, search])
  const trending = [...tokens].sort((a, b) => b.change - a.change).slice(0, 3)
  return <main className="home-shell"><section className="home-hero container"><div className="home-hero-copy"><div className="eyebrow"><span className="pulse" /> ARC / USDC launchpad</div><h1>Launch early.<br /><span>Trade loud.</span></h1><p>A live board for the tokens forming conviction on Arc. Find the newest launches, watch the curve fill, and move before the crowd.</p><div className="hero-actions"><Link className="button primary" to="/create">Create launch <ArrowUpRight size={16} /></Link><a className="text-link" href="#explore">View new launches <span>↓</span></a></div><div className="home-stats"><span><b>06</b> tracked launches</span><span><b>01%</b> platform fee</span><span><b>ARC</b> testnet live</span></div></div><div className="signal-panel"><div className="signal-panel-top"><span><span className="pulse" /> Featured curve</span><span>01 / 03</span></div><div className="signal-token"><TokenMark variant={trending[0].visual} large /><div><span className="signal-kicker">Moving now</span><h2>{trending[0].name}</h2><strong>${trending[0].ticker}</strong></div><b className="positive">+{trending[0].change}%</b></div><div className="signal-chart"><div className="chart-grid" /><Sparkline /></div><div className="signal-metrics"><span><small>PRICE</small>${trending[0].price.toFixed(5)}</span><span><small>MARKET CAP</small>${(trending[0].marketCap / 1000).toFixed(1)}K</span><span><small>CURVE</small>{trending[0].progress}%</span></div><Link className="signal-link" to={`/token/${trending[0].id}`}>Open terminal <ArrowUpRight size={15} /></Link></div></section><LiveTape /><section id="explore" className="launch-board container"><div className="board-heading"><div><div className="eyebrow">Launch terminal</div><h2>Find your next <span>runner.</span></h2><p>Fresh launches and curves in motion, sorted for fast decisions.</p></div><div className="board-count"><strong>{filteredTokens.length}</strong><span>visible launches</span></div></div><div className="board-controls"><div className="filters">{['Trending', 'New launches', 'Graduating'].map((item) => <button key={item} className={filter === item ? 'filter active' : 'filter'} onClick={() => setFilter(item)}>{item}</button>)}</div><div className="search-box"><Search size={16} /><input aria-label="Search tokens" placeholder="Search ticker or launch" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div><div className="launch-grid">{filteredTokens.map((token) => <LaunchCard key={token.id} token={token} />)}</div></section><MobileNav onConnect={onConnect} wallet={wallet} isConnecting={isConnecting} /></main>
}

function MobileNav({ onConnect, wallet, isConnecting }: { onConnect: () => void; wallet: WalletState; isConnecting: boolean }) {
  return <nav className="mobile-nav"><Link className="active" to="/"><Search size={19} /><span>Explore</span></Link><Link to="/create"><Sparkles size={19} /><span>Create</span></Link>{wallet.account ? <Link to="/wallet"><Wallet size={19} /><span>Wallet</span></Link> : <button onClick={onConnect} disabled={isConnecting}><Wallet size={19} /><span>Connect</span></button>}</nav>
}

function Create({ wallet, onConnect }: { wallet: WalletState; onConnect: () => void }) {
  const [name, setName] = useState('')
  const [ticker, setTicker] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageName, setImageName] = useState('')
  const [launched, setLaunched] = useState(false)
  const [launchHash, setLaunchHash] = useState<string | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setImageName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setImageUrl(reader.result)
    }
    reader.readAsDataURL(file)
  }
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLaunchError(null)
    if (!wallet.account) {
      onConnect()
      return
    }
    setIsLaunching(true)
    try {
      const hash = await launchTokenOnArc(wallet.account, name.trim(), ticker.trim(), description.trim())
      setLaunchHash(hash)
      setLaunched(true)
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : 'Unable to launch token.')
    } finally {
      setIsLaunching(false)
    }
  }
  return <main className="container page"><div className="page-intro"><div><div className="eyebrow">Start something</div><h1>Launch a token<br /><span>people remember.</span></h1><p>Every great meme starts with a name and a little conviction. The rest is up to the crowd.</p></div><div className="mock-note"><CircleHelp size={16} /><span>On-chain launch / wallet signature required</span></div></div><div className="create-layout"><form className="form-panel" onSubmit={handleSubmit}><div className="panel-heading"><span>01</span><h2>Token details</h2></div><label>Token name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Keyboard Cat" maxLength={28} required /></label><label>Ticker<span className="input-prefix">$ <input value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="KEYS" maxLength={8} required /></span></label><label>What’s the story?<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Give the internet a reason to care..." maxLength={120} required /></label><label>Token image<input ref={fileInputRef} style={{ display: 'none' }} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleImageChange} /><div className="upload-box"><ImagePlus size={20} /><div><b>{imageName || 'Drop an image here'}</b><small>PNG, JPG, GIF or WEBP / 4MB max</small></div><button type="button" onClick={() => fileInputRef.current?.click()}>{imageName ? 'Change' : 'Browse'}</button></div></label><div className="optional-row"><label>Website <span className="field-optional">Optional</span><input type="url" placeholder="https://" /></label><label>X / Twitter <span className="field-optional">Optional</span><input placeholder="@handle" /></label><label>Telegram <span className="field-optional">Optional</span><input placeholder="@channel" /></label></div><button className="button primary launch-button" type="submit" disabled={isLaunching}>{isLaunching ? 'Waiting for wallet...' : launched ? 'Transaction sent' : wallet.account ? 'Launch on ARC' : 'Connect wallet to launch'} <ArrowUpRight size={16} /></button>{launchHash && <p className="form-success">Transaction sent: <a href={`${ARC_TESTNET.explorerUrl}/tx/${launchHash}`} target="_blank" rel="noreferrer">{formatWalletAddress(launchHash)}</a></p>}{launchError && <p className="form-error" role="alert">{launchError}</p>}<p className="form-footnote">Your wallet will ask you to confirm the `createLaunch` transaction on Arc Testnet.</p></form><Preview name={name} ticker={ticker} description={description} imageUrl={imageUrl} /></div></main>
}

function Preview({ name, ticker, description, imageUrl }: { name: string; ticker: string; description: string; imageUrl: string }) {
  return <aside className="preview"><div className="preview-label">Live preview</div><div className="preview-card"><div className="preview-image">{imageUrl ? <img src={imageUrl} alt={`${name || 'Your token'} preview`} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} /> : <TokenMark variant="baby" large />}<span>YOUR TOKEN</span></div><div className="preview-content"><div className="card-name"><div><h3>{name || 'Your token name'}</h3><span>${ticker || 'TICKER'}</span></div><StatusBadge status="active" /></div><p>{description || 'Your story goes here. Make it weird, make it yours.'}</p><div className="progress-meta"><span>Bonding curve</span><b>0%</b></div><div className="progress-track"><span style={{ width: '0%' }} /></div><div className="card-stats"><div><small>Market cap</small><strong>$0</strong></div><div><small>24h</small><strong className="positive">—</strong></div></div></div></div><div className="preview-tip"><Sparkles size={16} /><span>Your token starts at zero. Every holder writes the next chapter.</span></div></aside>
}

type WalletLaunch = {
  launch: ArcLaunch
  balance: string
}

function formatArcAmount(value: bigint): string {
  return Number(value) / 1e18 >= 1000
    ? `${(Number(value) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `${(Number(value) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function WalletDashboard({ wallet, onConnect, isConnecting }: { wallet: WalletState; onConnect: () => void; isConnecting: boolean }) {
  const [launches, setLaunches] = useState<WalletLaunch[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!wallet.account) {
      setLaunches([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void readArcLaunches()
      .then(async (allLaunches) => {
        const withBalances = await Promise.all(allLaunches.map(async (launch) => ({
          launch,
          balance: await readTokenBalance(launch.token, wallet.account as string),
        })))
        if (!cancelled) setLaunches(withBalances.filter(({ launch, balance }) => launch.creator.toLowerCase() === wallet.account?.toLowerCase() || Number(balance) > 0))
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load on-chain holdings.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [wallet.account])

  if (!wallet.account) {
    return <main className="container page wallet-page"><div className="wallet-empty"><div className="eyebrow">Your wallet</div><h1>Connect to see<br /><span>your position.</span></h1><p>Track your Arc USDC balance, token holdings, launches, and creator rewards from one place.</p><button className="button primary" onClick={onConnect} disabled={isConnecting}><Wallet size={15} /> {isConnecting ? 'Connecting...' : 'Connect wallet'}</button></div></main>
  }

  const created = launches.filter(({ launch }) => launch.creator.toLowerCase() === wallet.account?.toLowerCase())
  const holdings = launches.filter(({ balance }) => Number(balance) > 0)
  return <main className="container page wallet-page"><div className="wallet-heading"><div><div className="eyebrow"><span className="pulse" /> Wallet overview</div><h1>Your wallet<br /><span>at a glance.</span></h1><p>{formatWalletAddress(wallet.account)} · Arc Testnet</p></div><a className="button secondary" href={`${ARC_TESTNET.explorerUrl}/address/${wallet.account}`} target="_blank" rel="noreferrer">View on explorer <ArrowUpRight size={15} /></a></div><section className="wallet-balance-grid"><div className="balance-card balance-main"><div className="balance-card-top"><span>Total balance</span><span className="wallet-live"><span className="pulse" /> LIVE</span></div><strong>{wallet.balances?.nativeUsdc ?? '—'} <small>USDC</small></strong><p>Native USDC available for Arc Testnet gas and trading.</p><div className="balance-address">{wallet.account}</div></div><div className="balance-card"><span>ERC-20 USDC</span><strong>{wallet.balances?.erc20Usdc ?? '—'} <small>USDC</small></strong><p>Token balance detected in your connected wallet.</p></div><div className="balance-card creator-fee-card"><span>Creator fee share</span><strong>0.00 <small>USDC</small></strong><p>Not enabled in the deployed contract. Current fees route to the treasury.</p><span className="fee-status">Platform fee 1% · creator share 0%</span></div></section><section className="wallet-content"><div className="wallet-section"><div className="wallet-section-heading"><div><div className="eyebrow">Your assets</div><h2>Token holdings.</h2></div><span className="section-count">{holdings.length} assets</span></div>{loading ? <div className="wallet-placeholder">Reading token balances from Arc...</div> : holdings.length ? <div className="wallet-token-list">{holdings.map(({ launch, balance }) => <a href={`${ARC_TESTNET.explorerUrl}/address/${launch.token}`} target="_blank" rel="noreferrer" className="wallet-token-row" key={launch.token}><span className="wallet-token-mark">{launch.symbol.slice(0, 1)}</span><span><strong>{launch.name}</strong><small>${launch.symbol}</small></span><b>{balance}</b><ArrowUpRight size={15} /></a>)}</div> : <div className="wallet-placeholder">No token holdings yet. Explore a launch and make your first trade.</div>}</div><div className="wallet-section"><div className="wallet-section-heading"><div><div className="eyebrow">Creator studio</div><h2>Tokens you created.</h2></div><span className="section-count">{created.length} launches</span></div>{loading ? <div className="wallet-placeholder">Loading launches...</div> : created.length ? <div className="created-list">{created.map(({ launch }) => <div className="created-row" key={launch.token}><div><strong>{launch.name} <span>${launch.symbol}</span></strong><small>{formatArcAmount(launch.nativeReserve)} USDC raised · {launch.graduated ? 'Graduated' : 'Active curve'}</small></div><a href={`${ARC_TESTNET.explorerUrl}/address/${launch.token}`} target="_blank" rel="noreferrer">Contract <ArrowUpRight size={13} /></a></div>)}</div> : <div className="wallet-placeholder">Your on-chain launches will show here after you create one.</div>}</div></section>{error && <p className="form-error" role="alert">{error}</p>}<div className="wallet-fee-note"><Sparkles size={16} /><div><strong>Creator rewards are ready for the next contract iteration.</strong><p>The deployed launchpad currently sends the configured 1% trading fee to the treasury only. This UI keeps the creator share visible without inventing a balance that the contract cannot pay yet.</p></div></div></main>
}

function PriceChart({ token }: { token: Token }) {
  return <div className="detail-chart"><div className="chart-header"><div><span>Price in USDC</span><strong>${token.price.toFixed(5)}</strong></div><b className={token.change > 0 ? 'positive' : 'negative'}>{token.change > 0 ? '+' : ''}{token.change}% today</b></div><div className="big-chart"><div className="chart-grid" /><svg viewBox="0 0 800 280" preserveAspectRatio="none"><path d="M0 250 L30 240 L59 245 L86 218 L115 225 L143 188 L175 201 L204 175 L234 182 L264 151 L292 168 L321 140 L348 151 L380 115 L407 128 L436 97 L466 115 L494 86 L525 91 L552 68 L583 78 L615 41 L645 53 L675 27 L710 37 L740 16 L770 29 L800 4" fill="none" stroke="#2ee6a0" strokeWidth="4" /></svg><div className="chart-axis"><span>09:00</span><span>12:00</span><span>15:00</span><span>18:00</span><span>Now</span></div></div></div>
}

function TradePanel({ token, onConnect, connected }: { token: Token; onConnect: () => void; connected: boolean }) {
  const [side, setSide] = useState<'Buy' | 'Sell'>('Buy')
  const [amount, setAmount] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const value = Number(amount || 0)
  const payingSymbol = side === 'Buy' ? 'USDC' : `$${token.ticker}`
  const receivingSymbol = side === 'Buy' ? `$${token.ticker}` : 'USDC'
  const receivedValue = side === 'Buy' ? value / token.price : value * token.price
  return <div className="trade-panel"><div className="trade-tabs"><button className={side === 'Buy' ? 'active' : ''} onClick={() => setSide('Buy')}>Buy</button><button className={side === 'Sell' ? 'active sell' : ''} onClick={() => setSide('Sell')}>Sell</button></div><div className="trade-body"><div className="trade-label"><span>You pay</span><button>{payingSymbol} <ChevronDown size={13} /></button></div><div className="amount-field"><input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" inputMode="decimal" /><span>{payingSymbol}</span></div><div className="quick-amounts"><button onClick={() => setAmount('10')}>10</button><button onClick={() => setAmount('50')}>50</button><button onClick={() => setAmount('100')}>100</button><button onClick={() => setAmount('500')}>500</button></div><div className="trade-label second"><span>You receive</span><span className="muted">Estimated</span></div><div className="receive-field"><strong>{value ? receivedValue.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0.00'}</strong><span>{receivingSymbol}</span></div><div className="trade-summary"><span>Price impact <b>0.12%</b></span><span>Network fee <b>~$0.01</b></span></div><button className="button primary trade-button" onClick={() => { if (!connected) onConnect(); else setSubmitted(true) }} disabled={submitted}>{submitted ? <><Sparkles size={15} /> Preview order submitted</> : <><Wallet size={15} /> {connected ? `${side} ${token.ticker}` : `Connect wallet to ${side.toLowerCase()}`}</>}</button><span className="trade-mock">{submitted ? 'Demo state complete / no transaction was sent' : 'UI preview only / no transaction will be sent'}</span></div></div>
}

function Detail({ onConnect, wallet }: { onConnect: () => void; wallet: WalletState }) {
  const { id } = useParams()
  const token = tokens.find((item) => item.id === id) || tokens[0]
  const [copied, setCopied] = useState(false)
  const copyAddress = () => { void navigator.clipboard?.writeText('0x8f...doxa'); setCopied(true); window.setTimeout(() => setCopied(false), 1600) }
  return <main className="container page detail-page"><Link to="/" className="back-link">← Back to explore</Link><div className="detail-heading"><div className="detail-token"><TokenMark variant={token.visual} large /><div><div className="eyebrow"><StatusBadge status={token.status} /></div><h1>{token.name} <span>${token.ticker}</span></h1><p>{token.description}</p><button className="address" onClick={copyAddress}>{copied ? 'Copied to clipboard' : 'ARC / 0x8f...doxa'} <Copy size={13} /></button></div></div><div className="detail-actions"><button className="icon-button"><Search size={16} /></button><button className="button primary" onClick={onConnect}><Wallet size={15} /> {wallet.account ? formatWalletAddress(wallet.account) : 'Connect wallet'}</button></div></div><div className="detail-grid"><div><PriceChart token={token} /><div className="curve-card"><div className="curve-header"><div><span>Bonding curve progress</span><strong>{token.progress}%</strong></div><span>{token.progress >= 100 ? 'Graduated' : `$${(182400 - token.marketCap).toLocaleString()} to graduation`}</span></div><div className="curve-track"><span style={{ width: `${token.progress}%` }} /><i style={{ left: `${token.progress}%` }} /></div><div className="curve-foot"><span>Launched <b>0 USDC</b></span><span>Graduation target <b>$182.4K</b></span></div></div><MigrationCard status={token.status} /></div><aside><TradePanel token={token} onConnect={onConnect} connected={Boolean(wallet.account)} /><div className="holders-card"><div className="small-heading"><h3>Top holders</h3><a href="#holders">View all</a></div>{['0x4a…91f', '0x8f…doxa', '0xc2…52a', '0x12…b8e'].map((holder, index) => <div className="holder-row" key={holder}><span className="holder-rank">0{index + 1}</span><span>{holder}</span><b>{[12.4, 8.2, 5.8, 4.1][index]}%</b></div>)}</div></aside></div></main>
}

function MigrationCard({ status }: { status: MigrationStatus }) {
  const migrated = status === 'migrated'
  return <div className={`migration-card ${migrated ? 'migrated' : ''}`}><div className="migration-icon">{migrated ? '✓' : <Zap size={20} />}</div><div><div className="eyebrow">{migrated ? 'Migration complete' : 'The roadmap'}</div><h3>{migrated ? 'Now trading on ARC mainnet' : status === 'graduating' ? 'Almost ready for the next stop' : 'Build toward the big move'}</h3><p>{migrated ? 'This token graduated from its bonding curve and is now available on the open market.' : 'At 100%, liquidity migrates to Uniswap on ARC Mainnet. This is a preview of what comes next.'}</p></div></div>
}

function App() {
  const { wallet, connect, isConnecting } = useArcWallet()
  return <><Header wallet={wallet} onConnect={connect} isConnecting={isConnecting} /><Routes><Route path="/" element={<Explore onConnect={connect} wallet={wallet} isConnecting={isConnecting} />} /><Route path="/create" element={<Create wallet={wallet} onConnect={connect} />} /><Route path="/wallet" element={<WalletDashboard wallet={wallet} onConnect={connect} isConnecting={isConnecting} />} /><Route path="/token/:id" element={<Detail onConnect={connect} wallet={wallet} />} /></Routes><footer className="site-footer"><div className="container footer-inner"><Logo /><span>Built for the ARC testnet.</span><span className="footer-right">DOXA.xyz / 2026</span></div></footer></>
}

export default App
