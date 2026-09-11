import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { ArrowUpRight, ChevronDown, CircleHelp, Copy, Flame, Grid2X2, ImagePlus, ListFilter, Menu, Search, Sparkles, TrendingUp, Users, Wallet, X, Zap } from 'lucide-react'
import { CandlestickSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type Time } from 'lightweight-charts'
import { ARC_TESTNET, connectArcWallet, formatWalletAddress, getInjectedProvider, getAccountFromPrivateKey, launchTokenOnArc, readArcWalletBalances, readLaunchesDirect, readNativeBalanceDirect, readTokenBalanceDirect, readQuoteBuy, readQuoteSell, buyOnArc, sellOnArc, waitForArcTx, parseUsdc, parseToken, buildCurvePriceSeries, createLaunchWithPrivateKey, buyWithPrivateKey, type ArcLaunch, type ArcWalletBalances } from './lib/arc'

type MigrationStatus = 'active' | 'graduating' | 'migrated'
type Token = { id: string; launchId: number; tokenAddress: string; name: string; ticker: string; description: string; progress: number; marketCap: number; change: number; price: number; holders: number; volume: number; liquidity: number; creator: string; status: MigrationStatus; visual: string; created: string; createdMinutes: number; priceSeries: number[] }

const GRADUATION_TARGET = 10000
const TOKEN_SUPPLY = 1_000_000_000

const visualVariants = ['cat', 'ghost', 'toad', 'baby', 'night', 'pigeon']

function mapLaunchToToken(launch: ArcLaunch, index: number): Token {
  const nativeReserve = Number(launch.nativeReserve) / 1e18
  const spotPrice = Number(launch.virtualTokenReserve) > 0 ? Number(launch.virtualNativeReserve) / Number(launch.virtualTokenReserve) : 0
  const marketCap = spotPrice * TOKEN_SUPPLY
  const priceSeries = buildCurvePriceSeries(launch)
  const change = priceSeries.length > 1 && priceSeries[0] > 0 ? ((priceSeries[priceSeries.length - 1] - priceSeries[0]) / priceSeries[0]) * 100 : 0
  const progress = Math.min((nativeReserve / GRADUATION_TARGET) * 100, 100)
  const status: MigrationStatus = launch.graduated ? 'migrated' : progress >= 90 ? 'graduating' : 'active'
  const createdMinutes = Math.max(1, Math.round((Date.now() / 1000 - Number(launch.createdAt)) / 60))
  const createdLabel = createdMinutes < 60 ? `${createdMinutes}m ago` : createdMinutes < 1440 ? `${Math.floor(createdMinutes / 60)}h ago` : 'yesterday'
  return {
    id: launch.token,
    launchId: index,
    tokenAddress: launch.token,
    name: launch.name,
    ticker: launch.symbol,
    description: launch.description,
    progress,
    marketCap,
    change,
    price: spotPrice,
    holders: 0,
    volume: 0,
    liquidity: nativeReserve,
    creator: launch.creator,
    status,
    visual: visualVariants[index % visualVariants.length],
    created: createdLabel,
    createdMinutes,
    priceSeries,
  }
}

function useOnChainTokens() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      setError(null)
      const launches = await readLaunchesDirect()
      setTokens(launches.map(mapLaunchToToken))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load on-chain launches.')
      if (!silent) setTokens([])
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => { void refresh(true) }, 20000)
    return () => window.clearInterval(interval)
  }, [])
  return { tokens, loading, error, refresh }
}

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
      const raw = args[0]
      let chainId: string | null = null
      if (typeof raw === 'string') chainId = /^0x/i.test(raw) ? raw.toLowerCase() : `0x${BigInt(raw).toString(16)}`
      else if (typeof raw === 'number' && raw > 0) chainId = `0x${raw.toString(16)}`
      else if (typeof raw === 'bigint') chainId = `0x${raw.toString(16)}`
      if (chainId && chainId !== ARC_TESTNET.chainId) {
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
  return <header className="site-header"><div className="header-inner"><Logo /><nav className={menuOpen ? 'nav open' : 'nav'}>{navItems.map((item) => <Link key={item.to} className={location.pathname === item.to ? 'active' : ''} to={item.to} onClick={() => setMenuOpen(false)}>{item.label}</Link>)}{wallet.account && <Link className={location.pathname === '/wallet' ? 'active' : ''} to="/wallet" onClick={() => setMenuOpen(false)}>Wallet</Link>}{!wallet.account && <button className="nav-connect" onClick={() => { setMenuOpen(false); onConnect() }} disabled={isConnecting} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--mint)', color: '#07100b', border: 0, padding: '12px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}><Wallet size={15} /> {isConnecting ? 'Connecting…' : 'Login / Connect wallet'}</button>}</nav><div className="header-actions"><button className="network"><span className="status-dot" /> ARC testnet <ChevronDown size={14} /></button>{wallet.account ? <Link className="connect" to="/wallet"><Wallet size={15} /> {formatWalletAddress(wallet.account)}</Link> : <button className="connect" onClick={onConnect} disabled={isConnecting}><Wallet size={15} /> {isConnecting ? 'Connecting...' : 'Connect wallet'}</button>}</div><button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button></div>{wallet.error && <div className="container wallet-error" role="status">{wallet.error}</div>}</header>
}

function TokenMark({ variant, large = false }: { variant: string; large?: boolean }) {
  const symbols = { cat: '⌁', ghost: '◒', toad: '·ᴥ·', baby: '◡', night: '✦', pigeon: '⌁' }
  return <div className={`token-mark mark-${variant} ${large ? 'large' : ''}`} aria-hidden="true"><i className="token-orbit" /><span>{symbols[variant as keyof typeof symbols] || '⌁'}</span><b className="token-glint" /></div>
}

function StatusBadge({ status }: { status: MigrationStatus }) {
  const labels = { active: 'Bonding', graduating: 'Graduating', migrated: 'Graduated' }
  return <span className={`status-badge ${status}`}><span /> {labels[status]}</span>
}

type ChartMode = 'trend' | 'candle'
type ChartMetric = 'price' | 'marketCap'

function seriesToSvgPath(series: number[]): string {
  if (series.length < 2) return 'M0 50 L120 50'
  const min = Math.min(...series)
  const max = Math.max(...series)
  const range = max - min || 1
  return series.map((value, index) => {
    const x = (index / (series.length - 1)) * 120
    const y = 95 - ((value - min) / range) * 85
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

function TradingViewMarketChart({ token, large = false }: { token: Token; large?: boolean }) {
  const [mode, setMode] = useState<ChartMode>('trend')
  const [metric, setMetric] = useState<ChartMetric>('price')
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!large || mode !== 'candle' || !chartRef.current) return
    const container = chartRef.current
    const chart: IChartApi = createChart(container, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#7d9084', fontFamily: 'DM Mono, monospace', fontSize: 10 },
      grid: { vertLines: { color: 'rgba(70, 100, 80, .16)' }, horzLines: { color: 'rgba(70, 100, 80, .16)' } },
      rightPriceScale: { borderColor: 'rgba(120, 150, 130, .22)', scaleMargins: { top: .12, bottom: .18 } },
      timeScale: { borderColor: 'rgba(120, 150, 130, .22)', timeVisible: true, secondsVisible: false, rightOffset: 2 },
      crosshair: { vertLine: { color: 'rgba(190, 255, 215, .45)', width: 1, style: 2 }, horzLine: { color: 'rgba(190, 255, 215, .45)', width: 1, style: 2 } },
    })
    const source = token.priceSeries.length > 1 ? token.priceSeries : [token.price || 0, token.price || 0]
    const scale = metric === 'price' ? 1 : TOKEN_SUPPLY
    const bucketCount = Math.min(14, source.length)
    const bucketSize = Math.max(1, Math.floor(source.length / bucketCount))
    const totalBuckets = Math.ceil(source.length / bucketSize)
    const nowSec = Math.floor(Date.now() / 1000)
    const startSec = nowSec - token.createdMinutes * 60
    const step = Math.max(60, Math.floor((nowSec - startSec) / Math.max(1, totalBuckets)))
    const candleData: Array<{ time: Time; open: number; high: number; low: number; close: number }> = []
    let bucketIndex = 0
    for (let i = 0; i < source.length; i += bucketSize) {
      const window = source.slice(i, i + bucketSize)
      if (window.length === 0) continue
      candleData.push({
        time: (startSec + bucketIndex * step) as Time,
        open: window[0] * scale,
        high: Math.max(...window) * scale,
        low: Math.min(...window) * scale,
        close: window[window.length - 1] * scale,
      })
      bucketIndex++
    }
    const series: ISeriesApi<'Candlestick'> = chart.addSeries(CandlestickSeries, {
      upColor: '#46d889', downColor: '#e07f76', borderVisible: false, wickUpColor: '#46d889', wickDownColor: '#e07f76',
      priceFormat: { type: 'price', precision: metric === 'price' ? 9 : 2, minMove: metric === 'price' ? 1e-9 : 0.01 },
    })
    series.setData(candleData)
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [large, mode, metric, token.id, token.priceSeries, token.price, token.createdMinutes])

  const toolbar = large && <div className="market-chart-toolbar"><div className="chart-mode-toggle" role="group" aria-label="Chart type"><button className={mode === 'trend' ? 'active' : ''} onClick={() => setMode('trend')} type="button">Trend</button><button className={mode === 'candle' ? 'active' : ''} onClick={() => setMode('candle')} type="button">Candles</button></div><div className="chart-metric-toggle" role="group" aria-label="Chart metric"><button className={metric === 'price' ? 'active' : ''} onClick={() => setMetric('price')} type="button">Price</button><button className={metric === 'marketCap' ? 'active' : ''} onClick={() => setMetric('marketCap')} type="button">Market cap</button></div></div>
  if (mode === 'candle') return <div className={`market-chart ${large ? 'large' : ''} ${token.change < 0 ? 'down' : ''} candles-active`} aria-label={`${token.name} candlestick chart`}>{toolbar}<div className="tradingview-chart" ref={chartRef} /></div>
  return <div className="market-chart-shell">{toolbar}<MarketChart token={token} large={large} metric={metric} /></div>
}

function MarketChart({ token, large = false, metric = 'price' }: { token: Token; large?: boolean; metric?: ChartMetric }) {
  const line = seriesToSvgPath(token.priceSeries)
  const area = `${line} L120 100 L0 100 Z`
  const fillId = `fill-${token.launchId}${large ? '-lg' : ''}`
  return <div className={`market-chart ${large ? 'large' : ''} ${token.change < 0 ? 'down' : ''}`} aria-label={`${token.name} price trend chart`}><div className="market-chart-grid" /><svg viewBox="0 0 120 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".28" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs><path className="chart-area" d={area} fill={`url(#${fillId})`} /><path className="chart-line" d={line} fill="none" stroke="currentColor" strokeWidth={large ? '1.6' : '1.8'} vectorEffect="non-scaling-stroke" /></svg>{large && <div className="chart-labels"><span>Launch</span><span>25%</span><span>50%</span><span>Now</span><b>{metric === 'price' ? `${(token.price || 0).toPrecision(3)}` : `${(token.marketCap / 1000).toFixed(1)}K`}</b></div>}</div>
}

function LiveTape() {
  const events = [
    { label: 'NEW', token: 'Mochi Signal', ticker: '$MOCHI', value: 'just launched', tone: 'mint' },
    { label: 'BUY', token: 'Keyboard Cat', ticker: '$KEYS', value: '12.4 USDC', tone: 'buy' },
    { label: 'BUY', token: 'Night Shift', ticker: '$NITE', value: '48.0 USDC', tone: 'buy' },
    { label: 'CURVE', token: 'Arcade Ghost', ticker: '$GHOST', value: '64% filled', tone: 'curve' },
    { label: 'NEW', token: 'Toad Frog', ticker: '$TOAD', value: '18m ago', tone: 'mint' },
  ]
  return <div className="live-tape" aria-label="Live launch activity"><div className="live-tape-label"><span className="pulse" /> Live feed</div><div className="live-tape-window"><div className="live-tape-track">{[...events, ...events].map((event, index) => <span className="live-event" key={`${event.ticker}-${index}`}><b className={`event-label ${event.tone}`}>{event.label}</b><strong>{event.token}</strong><em>{event.ticker}</em><small>{event.value}</small></span>)}</div></div></div>
}

function LaunchCard({ token }: { token: Token }) {
  const isMigrated = token.status === 'migrated'
  return <Link to={`/token/${token.id}`} className={`launch-card card-${token.visual}`}><div className="launch-card-top"><div className="launch-card-identity"><TokenMark variant={token.visual} large /><div><div className="launch-card-name"><h3>{token.name}</h3><span>${token.ticker}</span></div><p>{token.description}</p><div className="launch-card-creator">created by <b>{token.creator}</b></div></div></div><strong className={`launch-change ${token.change < 0 ? 'negative' : 'positive'}`}>{token.change > 0 ? '+' : ''}{token.change}%</strong></div><div className="launch-chart-row"><MarketChart token={token} /><div className="launch-card-stats"><span><small>MARKET CAP</small><b>${(token.marketCap / 1000).toFixed(token.marketCap < 10000 ? 2 : 1)}K</b></span><span><small>VOLUME 24H</small><b>${(token.volume / 1000).toFixed(1)}K</b></span><span><small>HOLDERS</small><b><Users size={12} /> {token.holders}</b></span></div></div><div className="migration-progress"><div className="migration-progress-head"><span><TrendingUp size={13} /> {isMigrated ? 'Graduated & migrated' : token.status === 'graduating' ? 'Near graduation' : 'Bonding curve progress'}</span><b>{token.progress.toFixed(3)}%</b></div><div className={`migration-track ${isMigrated ? 'complete' : ''}`}><span style={{ width: `${token.progress}%` }} /><i style={{ left: `${Math.min(token.progress, 99.4)}%` }} /></div><div className="migration-foot"><span>{isMigrated ? 'Liquidity migrated to market' : `${(100 - token.progress).toFixed(1)}% until migration`}</span><small>{token.created}</small></div></div></Link>
}

function Explore({ tokens, tokensLoading, tokensError, onRefresh }: { tokens: Token[]; tokensLoading: boolean; tokensError: string | null; onRefresh: () => void }) {
  const [filter, setFilter] = useState('Trending')
  const [statusFilter, setStatusFilter] = useState<MigrationStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const filteredTokens = useMemo(() => tokens.filter((token) => (statusFilter === 'all' || token.status === statusFilter) && `${token.name} ${token.ticker}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => filter === 'New launches' ? a.createdMinutes - b.createdMinutes : filter === 'Graduating' ? b.progress - a.progress : b.change - a.change), [filter, search, statusFilter, tokens])
  const trending = [...tokens].sort((a, b) => b.progress - a.progress).slice(0, 3)
  if (tokensLoading) return <main className="home-shell"><div className="container" style={{ padding: '120px 32px', textAlign: 'center' }}><div className="eyebrow"><span className="pulse" /> Loading on-chain data</div><h2 style={{ marginTop: 16 }}>Reading launches from Arc testnet…</h2></div></main>
  if (tokensError) return <main className="home-shell"><div className="container" style={{ padding: '120px 32px', textAlign: 'center' }}><div className="eyebrow" style={{ color: 'var(--market-negative)' }}>Connection error</div><h2 style={{ marginTop: 16 }}>{tokensError}</h2><button className="button primary" onClick={onRefresh} style={{ marginTop: 20 }}>Retry</button></div></main>
  if (tokens.length === 0) return <main className="home-shell"><div className="container" style={{ padding: '120px 32px', textAlign: 'center' }}><div className="eyebrow"><span className="pulse" /> No launches yet</div><h2 style={{ marginTop: 16 }}>No tokens have been launched on this contract yet.</h2><Link className="button primary" to="/create" style={{ marginTop: 20 }}>Create the first launch <ArrowUpRight size={16} /></Link></div></main>
  return <main className="home-shell"><section className="home-hero container"><div className="home-hero-copy"><div className="eyebrow"><span className="pulse" /> ARC / USDC launchpad</div><h1>Launch early.<br /><span>Trade loud.</span></h1><p>A live board for the tokens forming conviction on Arc. Find the newest launches, watch the curve fill, and move before the crowd.</p><div className="hero-actions"><Link className="button primary" to="/create">Create launch <ArrowUpRight size={16} /></Link><a className="text-link" href="#explore">View new launches <span>↓</span></a></div><div className="home-stats"><span><b>{String(tokens.length).padStart(2, '0')}</b> tracked launches</span><span><b>01%</b> platform fee</span><span><b>ARC</b> testnet live</span></div></div><div className="signal-panel"><div className="signal-panel-top"><span><span className="pulse" /> Featured curve</span><span>{String(Math.min(trending.length, 3)).padStart(2, '0')} / 03</span></div><div className="signal-token"><TokenMark variant={trending[0].visual} large /><div><span className="signal-kicker">Moving now</span><h2>{trending[0].name}</h2><strong>${trending[0].ticker}</strong></div><b className="positive">{trending[0].progress.toFixed(1)}%</b></div><div className="signal-chart"><TradingViewMarketChart token={trending[0]} large /></div><div className="signal-metrics"><span><small>PRICE</small>${trending[0].price.toFixed(5)}</span><span><small>MARKET CAP</small>${(trending[0].marketCap / 1000).toFixed(1)}K</span><span><small>CURVE</small>{trending[0].progress.toFixed(1)}%</span></div><Link className="signal-link" to={`/token/${trending[0].id}`}>Open terminal <ArrowUpRight size={15} /></Link></div></section><LiveTape /><section id="explore" className="launch-board container"><div className="board-heading"><div><div className="eyebrow">Launch terminal</div><h2>Find your next <span>runner.</span></h2><p>Fresh launches and curves in motion, sorted for fast decisions.</p></div><div className="board-count"><strong>{filteredTokens.length}</strong><span>visible launches</span></div></div><div className="board-controls"><div className="filters">{['Trending', 'New launches', 'Graduating'].map((item) => <button key={item} className={filter === item ? 'filter active' : 'filter'} onClick={() => setFilter(item)}>{item}</button>)}</div><div className="search-box"><Search size={16} /><input aria-label="Search tokens" placeholder="Search ticker or launch" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div><div className="launch-discovery-bar"><div className="launch-status-tabs">{([{ value: 'all', label: 'All tokens' }, { value: 'active', label: 'Bonding' }, { value: 'graduating', label: 'Near graduation' }, { value: 'migrated', label: 'Migrated' }] as const).map((item) => <button key={item.value} className={statusFilter === item.value ? 'active' : ''} onClick={() => setStatusFilter(item.value)}>{item.label}</button>)}</div><div className="launch-toolbar-actions"><button onClick={onRefresh} style={{ background: 'transparent', border: '1px solid #2c4333', color: '#70dc8b', borderRadius: 8, padding: '6px 10px', font: '10px DM Mono', cursor: 'pointer' }}>Refresh</button><span><Flame size={14} /> Live board</span><button aria-label="Grid view" className="view-toggle active"><Grid2X2 size={15} /></button><button aria-label="Filter options" className="view-toggle"><ListFilter size={15} /></button></div></div><div className="launch-grid">{filteredTokens.map((token) => <LaunchCard key={token.id} token={token} />)}</div></section></main>
}

function MobileNav() {
  const location = useLocation()
  return <nav className="mobile-nav"><Link className={location.pathname === '/' ? 'active' : ''} to="/"><Search size={19} /><span>Explorer</span></Link><Link className={location.pathname === '/create' ? 'active' : ''} to="/create"><Sparkles size={19} /><span>Create</span></Link></nav>
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
    void readLaunchesDirect()
      .then(async (allLaunches) => {
        const withBalances = await Promise.all(allLaunches.map(async (launch) => ({
          launch,
          balance: await readTokenBalanceDirect(launch.token, wallet.account as string),
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

function shortenError(message: string): string {
  const firstLine = message.split('\n')[0].trim()
  if (/user rejected|denied|rejected the request/i.test(message)) return 'Transaction rejected in wallet.'
  return firstLine.length > 140 ? `${firstLine.slice(0, 140)}…` : firstLine
}

function TradePanel({ token, onConnect, connected, account, onTraded }: { token: Token; onConnect: () => void; connected: boolean; account: string | null; onTraded: () => void }) {
  const [side, setSide] = useState<'Buy' | 'Sell'>('Buy')
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<bigint | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [tokenBalance, setTokenBalance] = useState('0')

  const payingSymbol = side === 'Buy' ? 'USDC' : `$${token.ticker}`
  const receivingSymbol = side === 'Buy' ? `$${token.ticker}` : 'USDC'
  const quoteDisplay = quote != null ? Number(quote) / 1e18 : null

  useEffect(() => {
    if (!connected || !account) { setTokenBalance('0'); return }
    let cancelled = false
    void readTokenBalanceDirect(token.tokenAddress, account)
      .then((balance) => { if (!cancelled) setTokenBalance(balance) })
      .catch(() => { if (!cancelled) setTokenBalance('0') })
    return () => { cancelled = true }
  }, [connected, account, token.tokenAddress, status])

  useEffect(() => {
    setStatus('idle')
    setMessage(null)
    setTxHash(null)
    const value = Number(amount)
    if (!value || value <= 0) { setQuote(null); setQuoting(false); return }
    let cancelled = false
    setQuoting(true)
    const handle = window.setTimeout(async () => {
      try {
        const out = side === 'Buy'
          ? await readQuoteBuy(token.launchId, parseUsdc(amount))
          : await readQuoteSell(token.launchId, parseToken(amount))
        if (!cancelled) setQuote(out)
      } catch {
        if (!cancelled) setQuote(null)
      } finally {
        if (!cancelled) setQuoting(false)
      }
    }, 350)
    return () => { cancelled = true; window.clearTimeout(handle) }
  }, [amount, side, token.launchId])

  const submit = async () => {
    if (!connected || !account) { onConnect(); return }
    const value = Number(amount)
    if (!value || value <= 0) { setStatus('error'); setMessage('Enter an amount greater than zero.'); return }
    setStatus('submitting'); setMessage(null); setTxHash(null)
    try {
      const minOut = quote != null ? (quote * 99n) / 100n : 0n
      const hash = side === 'Buy'
        ? await buyOnArc(account, token.launchId, parseUsdc(amount), minOut)
        : await sellOnArc(account, token.launchId, token.tokenAddress, parseToken(amount), minOut)
      setTxHash(hash)
      await waitForArcTx(hash)
      setStatus('success')
      setMessage(`${side} confirmed on Arc Testnet.`)
      setAmount('')
      setQuote(null)
      onTraded()
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? shortenError(err.message) : 'Transaction failed.')
    }
  }

  const setPercent = (fraction: number) => {
    const balance = Number(tokenBalance)
    if (!balance) return
    setAmount(String(fraction === 1 ? balance : Number((balance * fraction).toFixed(4))))
  }

  const busy = status === 'submitting'
  return <div className="trade-panel"><div className="trade-tabs"><button className={side === 'Buy' ? 'active' : ''} onClick={() => { setSide('Buy'); setAmount('') }}>Buy</button><button className={side === 'Sell' ? 'active sell' : ''} onClick={() => { setSide('Sell'); setAmount('') }}>Sell</button></div><div className="trade-body"><div className="trade-label"><span>You pay</span><button type="button">{payingSymbol} <ChevronDown size={13} /></button></div><div className="amount-field"><input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" inputMode="decimal" /><span>{payingSymbol}</span></div>{side === 'Buy' ? <div className="quick-amounts"><button type="button" onClick={() => setAmount('10')}>10</button><button type="button" onClick={() => setAmount('50')}>50</button><button type="button" onClick={() => setAmount('100')}>100</button><button type="button" onClick={() => setAmount('500')}>500</button></div> : <div className="quick-amounts"><button type="button" onClick={() => setPercent(0.25)}>25%</button><button type="button" onClick={() => setPercent(0.5)}>50%</button><button type="button" onClick={() => setPercent(0.75)}>75%</button><button type="button" onClick={() => setPercent(1)}>Max</button></div>}{side === 'Sell' && connected && <div className="trade-summary" style={{ marginTop: 8 }}><span>Balance <b>{Number(tokenBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${token.ticker}</b></span></div>}<div className="trade-label second"><span>You receive</span><span className="muted">{quoting ? 'Quoting…' : 'Estimated'}</span></div><div className="receive-field"><strong>{quoteDisplay != null ? quoteDisplay.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '0.00'}</strong><span>{receivingSymbol}</span></div><div className="trade-summary"><span>Slippage tolerance <b>1%</b></span><span>Live on-chain quote <b>{quoting ? '…' : quoteDisplay != null ? '✓' : '—'}</b></span></div><button className="button primary trade-button" onClick={submit} disabled={busy}>{busy ? <><Sparkles size={15} /> Confirm in your wallet…</> : <><Wallet size={15} /> {connected ? `${side} ${token.ticker}` : `Connect wallet to ${side.toLowerCase()}`}</>}</button>{message ? <span className="trade-mock" style={{ color: status === 'error' ? 'var(--market-negative)' : status === 'success' ? 'var(--market-positive)' : undefined }}>{message}</span> : <span className="trade-mock">Trades settle on Arc Testnet · gas paid in USDC</span>}{txHash && <a className="trade-mock" href={`${ARC_TESTNET.explorerUrl}/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: 'var(--mint)' }}>View transaction ↗</a>}</div></div>
}

function Detail({ onConnect, wallet, tokens, onTraded }: { onConnect: () => void; wallet: WalletState; tokens: Token[]; onTraded: () => void }) {
  const { id } = useParams()
  const token = tokens.find((item) => item.id === id) || tokens[0]
  const [copied, setCopied] = useState(false)
  if (!token) return <main className="container page detail-page"><Link to="/" className="back-link">← Back to explore</Link><p style={{ marginTop: 40 }}>Loading token…</p></main>
  const copyAddress = () => { void navigator.clipboard?.writeText(token.tokenAddress); setCopied(true); window.setTimeout(() => setCopied(false), 1600) }
  const toGraduation = Math.max(0, GRADUATION_TARGET - token.liquidity)
  return <main className="container page detail-page"><Link to="/" className="back-link">← Back to explore</Link><div className="detail-heading"><div className="detail-token"><TokenMark variant={token.visual} large /><div><div className="eyebrow"><StatusBadge status={token.status} /></div><h1>{token.name} <span>${token.ticker}</span></h1><p>{token.description}</p><button className="address" onClick={copyAddress}>{copied ? 'Copied to clipboard' : `ARC / ${formatWalletAddress(token.tokenAddress)}`} <Copy size={13} /></button></div></div><div className="detail-actions"><a className="icon-button" href={`${ARC_TESTNET.explorerUrl}/address/${token.tokenAddress}`} target="_blank" rel="noreferrer" aria-label="View token on explorer"><ArrowUpRight size={16} /></a><button className="button primary" onClick={onConnect}><Wallet size={15} /> {wallet.account ? formatWalletAddress(wallet.account) : 'Connect wallet'}</button></div></div><div className="detail-grid"><div><div className="detail-chart-shell"><TradingViewMarketChart token={token} large /></div><div className="curve-card"><div className="curve-header"><div><span>Bonding curve progress</span><strong>{token.progress.toFixed(1)}%</strong></div><span>{token.progress >= 100 ? 'Graduated' : `${toGraduation.toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC to graduation`}</span></div><div className="curve-track"><span style={{ width: `${token.progress}%` }} /><i style={{ left: `${Math.min(token.progress, 99.4)}%` }} /></div><div className="curve-foot"><span>Liquidity <b>{token.liquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC</b></span><span>Graduation target <b>{GRADUATION_TARGET.toLocaleString()} USDC</b></span></div></div><MigrationCard status={token.status} /></div><aside><TradePanel token={token} onConnect={onConnect} connected={Boolean(wallet.account)} account={wallet.account} onTraded={onTraded} /><div className="holders-card"><div className="small-heading"><h3>Market</h3></div><div className="holder-row"><span className="holder-rank">01</span><span>Price</span><b>{(token.price || 0).toPrecision(3)} USDC</b></div><div className="holder-row"><span className="holder-rank">02</span><span>Market cap</span><b>${(token.marketCap / 1000).toFixed(2)}K</b></div><div className="holder-row"><span className="holder-rank">03</span><span>Creator</span><b>{formatWalletAddress(token.creator)}</b></div><div className="holder-row"><span className="holder-rank">04</span><span>Change</span><b className={token.change < 0 ? 'negative' : 'positive'}>{token.change > 0 ? '+' : ''}{token.change.toFixed(2)}%</b></div></div></aside></div></main>
}

function MigrationCard({ status }: { status: MigrationStatus }) {
  const migrated = status === 'migrated'
  return <div className={`migration-card ${migrated ? 'migrated' : ''}`}><div className="migration-icon">{migrated ? '✓' : <Zap size={20} />}</div><div><div className="eyebrow">{migrated ? 'Migration complete' : 'The roadmap'}</div><h3>{migrated ? 'Now trading on ARC mainnet' : status === 'graduating' ? 'Almost ready for the next stop' : 'Build toward the big move'}</h3><p>{migrated ? 'This token graduated from its bonding curve and is now available on the open market.' : 'At 100%, liquidity migrates to Uniswap on ARC Mainnet. This is a preview of what comes next.'}</p></div></div>
}

const ADMIN_BOTS_STORAGE = 'doxa_admin_bots'
const ADMIN_KEY_STORAGE = 'doxa_admin_pk'

type Bot = { privateKey: string; address: string; balance: string }
type BuyResult = { address: string; hash?: string; error?: string }

const inputStyle = { width: '100%', padding: '10px 12px', background: '#050706', border: '1px solid #28382f', borderRadius: 8, color: '#f1f6f3', fontFamily: 'DM Mono, monospace', fontSize: 13, marginTop: 4 } as const
const panelStyle = { padding: '22px 24px', background: '#0b100d', border: '1px solid #28382f', borderRadius: 14, marginBottom: 20 } as const

function AdminPanel({ onRefreshTokens }: { onRefreshTokens: () => void }) {
  const [bots, setBots] = useState<Bot[]>([])
  const [newKey, setNewKey] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [ticker, setTicker] = useState('')
  const [description, setDescription] = useState('')
  const [createAddr, setCreateAddr] = useState('')
  const [createHash, setCreateHash] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const [buyLaunchId, setBuyLaunchId] = useState('')
  const [buyAmount, setBuyAmount] = useState('')
  const [selectedAddrs, setSelectedAddrs] = useState<string[]>([])
  const [buyResults, setBuyResults] = useState<BuyResult[]>([])
  const [buyError, setBuyError] = useState<string | null>(null)
  const [isBuying, setIsBuying] = useState(false)

  const persist = (list: Bot[]) => localStorage.setItem(ADMIN_BOTS_STORAGE, JSON.stringify(list.map((b) => b.privateKey)))

  const refreshBalance = (address: string) => {
    void readNativeBalanceDirect(address).then((bal) => setBots((cur) => cur.map((b) => b.address === address ? { ...b, balance: bal } : b))).catch(() => { /* ignore */ })
  }

  useEffect(() => {
    const keys: string[] = []
    const raw = localStorage.getItem(ADMIN_BOTS_STORAGE)
    if (raw) { try { for (const k of JSON.parse(raw) as string[]) keys.push(k) } catch { /* ignore */ } }
    const legacy = localStorage.getItem(ADMIN_KEY_STORAGE)
    if (legacy && !keys.includes(legacy)) keys.push(legacy)
    const loaded: Bot[] = []
    for (const k of keys) {
      try { loaded.push({ privateKey: k, address: getAccountFromPrivateKey(k), balance: '' }) } catch { /* skip invalid */ }
    }
    setBots(loaded)
    loaded.forEach((b) => refreshBalance(b.address))
  }, [])

  const addBot = () => {
    setAddError(null)
    const key = newKey.trim()
    if (!key) return
    let address: string
    try { address = getAccountFromPrivateKey(key) } catch { setAddError('Invalid private key format.'); return }
    if (bots.some((b) => b.address.toLowerCase() === address.toLowerCase())) { setAddError('This bot is already added.'); return }
    const list = [...bots, { privateKey: key, address, balance: '' }]
    setBots(list)
    persist(list)
    setNewKey('')
    refreshBalance(address)
  }

  const removeBot = (address: string) => {
    const list = bots.filter((b) => b.address !== address)
    setBots(list)
    persist(list)
    setSelectedAddrs((cur) => cur.filter((a) => a !== address))
  }

  const lockAll = () => {
    localStorage.removeItem(ADMIN_BOTS_STORAGE)
    localStorage.removeItem(ADMIN_KEY_STORAGE)
    setBots([])
    setSelectedAddrs([])
  }

  const toggleSelected = (address: string) => setSelectedAddrs((cur) => cur.includes(address) ? cur.filter((a) => a !== address) : [...cur, address])
  const allSelected = bots.length > 0 && selectedAddrs.length === bots.length
  const toggleAll = () => setSelectedAddrs(allSelected ? [] : bots.map((b) => b.address))

  const handleCreate = async () => {
    setCreateError(null)
    setCreateHash(null)
    const signer = bots.find((b) => b.address === createAddr) ?? bots[0]
    if (!signer) { setCreateError('Add a bot first.'); return }
    if (!name.trim() || !ticker.trim() || !description.trim()) {
      setCreateError('Name, ticker, and description are required.')
      return
    }
    setIsCreating(true)
    try {
      const hash = await createLaunchWithPrivateKey(signer.privateKey, name.trim(), ticker.trim(), description.trim())
      setCreateHash(hash)
      void onRefreshTokens()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create token.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleCoordinatedBuy = async () => {
    setBuyError(null)
    setBuyResults([])
    const launchId = Number(buyLaunchId)
    const amount = Number(buyAmount)
    if (!Number.isFinite(launchId) || launchId < 0) { setBuyError('Valid launch ID is required.'); return }
    if (!Number.isFinite(amount) || amount <= 0) { setBuyError('Valid USDC amount is required.'); return }
    const targets = bots.filter((b) => selectedAddrs.includes(b.address))
    if (targets.length === 0) { setBuyError('Select at least one bot to buy with.'); return }
    setIsBuying(true)
    const nativeIn = BigInt(Math.round(amount * 1e18))
    const settled = await Promise.allSettled(targets.map((b) => buyWithPrivateKey(b.privateKey, launchId, nativeIn)))
    setBuyResults(targets.map((b, i) => {
      const r = settled[i]
      return r.status === 'fulfilled' ? { address: b.address, hash: r.value } : { address: b.address, error: r.reason instanceof Error ? r.reason.message : 'Failed' }
    }))
    void onRefreshTokens()
    targets.forEach((b) => refreshBalance(b.address))
    setIsBuying(false)
  }

  if (bots.length === 0) {
    return <main className="container page" style={{ paddingTop: 80, maxWidth: 460 }}>
      <div className="eyebrow" style={{ color: 'var(--market-warning)' }}>Admin / Bot control</div>
      <h1 style={{ fontSize: 28, marginTop: 8 }}>Add your first bot</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>Paste a bot wallet private key to begin. You can add several bots and have them buy together. Keys are stored only in your browser's localStorage and never sent to any server.</p>
      <input type="password" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="0x... private key" style={{ ...inputStyle, marginTop: 16 }} />
      <button className="button primary" onClick={addBot} style={{ marginTop: 14, width: '100%' }}>Add bot</button>
      {addError && <p className="form-error" role="alert" style={{ marginTop: 12 }}>{addError}</p>}
    </main>
  }

  return <main className="container page" style={{ paddingTop: 60, maxWidth: 620 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
      <div>
        <div className="eyebrow" style={{ color: 'var(--market-warning)' }}>Admin / Bot control</div>
        <h1 style={{ fontSize: 26, marginTop: 8 }}>Bot dashboard</h1>
      </div>
      <button onClick={lockAll} style={{ background: 'transparent', border: '1px solid #28382f', color: 'var(--muted)', borderRadius: 8, padding: '8px 14px', font: '11px DM Mono', cursor: 'pointer' }}>Lock & clear keys</button>
    </div>

    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Bots ({bots.length})</h2>
        <button onClick={toggleAll} style={{ background: 'transparent', border: '1px solid #28382f', color: 'var(--mint)', borderRadius: 8, padding: '6px 12px', font: '10px DM Mono', cursor: 'pointer' }}>{allSelected ? 'Deselect all' : 'Select all'}</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {bots.map((b, i) => <div key={b.address} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#050706', border: `1px solid ${selectedAddrs.includes(b.address) ? 'var(--mint)' : '#28382f'}`, borderRadius: 10 }}>
          <input type="checkbox" checked={selectedAddrs.includes(b.address)} onChange={() => toggleSelected(b.address)} style={{ accentColor: '#2ee6a0', width: 16, height: 16 }} aria-label={`Select bot ${i + 1}`} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '10px DM Mono', color: 'var(--muted)' }}>BOT {String(i + 1).padStart(2, '0')}</div>
            <div style={{ font: '12px DM Mono', wordBreak: 'break-all' }}>{b.address}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ font: '9px DM Mono', color: 'var(--muted)' }}>USDC</div>
            <div style={{ font: '13px DM Mono', color: 'var(--market-positive)' }}>{b.balance || '—'}</div>
          </div>
          <button onClick={() => removeBot(b.address)} aria-label="Remove bot" style={{ background: 'transparent', border: '1px solid #28382f', color: 'var(--market-negative)', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', display: 'flex' }}><X size={14} /></button>
        </div>)}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="password" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="0x... add another bot" style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
        <button className="button primary" onClick={addBot} style={{ whiteSpace: 'nowrap' }}>Add bot</button>
      </div>
      {addError && <p className="form-error" role="alert" style={{ marginTop: 10 }}>{addError}</p>}
    </div>

    <div style={panelStyle}>
      <h2 style={{ fontSize: 16, marginBottom: 16 }}>Coordinated buy (simultaneous)</h2>
      <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 16px' }}>Fires a buy from every selected bot at the same time — {selectedAddrs.length} bot{selectedAddrs.length === 1 ? '' : 's'} selected.</p>
      <label style={{ display: 'block', marginBottom: 12 }}><span style={{ font: '10px DM Mono', color: 'var(--muted)' }}>LAUNCH ID</span><input value={buyLaunchId} onChange={(e) => setBuyLaunchId(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" inputMode="numeric" style={inputStyle} /></label>
      <label style={{ display: 'block', marginBottom: 12 }}><span style={{ font: '10px DM Mono', color: 'var(--muted)' }}>USDC AMOUNT (PER BOT)</span><input value={buyAmount} onChange={(e) => setBuyAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="10.0" inputMode="decimal" style={inputStyle} /></label>
      <button className="button primary" onClick={handleCoordinatedBuy} disabled={isBuying} style={{ marginTop: 4 }}>{isBuying ? 'Sending...' : `Buy with ${selectedAddrs.length || 'selected'} bot${selectedAddrs.length === 1 ? '' : 's'}`}</button>
      {buyError && <p className="form-error" role="alert" style={{ marginTop: 10 }}>{buyError}</p>}
      {buyResults.length > 0 && <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>{buyResults.map((r) => <div key={r.address} style={{ font: '11px DM Mono', padding: '8px 10px', background: '#050706', border: '1px solid #28382f', borderRadius: 8 }}><span style={{ color: 'var(--muted)' }}>{formatWalletAddress(r.address)}</span> {r.hash ? <span className="form-success">→ <a href={`${ARC_TESTNET.explorerUrl}/tx/${r.hash}`} target="_blank" rel="noreferrer">{formatWalletAddress(r.hash)}</a></span> : <span style={{ color: 'var(--market-negative)' }}>→ {r.error}</span>}</div>)}</div>}
    </div>

    <div style={{ ...panelStyle, marginBottom: 0 }}>
      <h2 style={{ fontSize: 16, marginBottom: 16 }}>Create token</h2>
      <label style={{ display: 'block', marginBottom: 12 }}><span style={{ font: '10px DM Mono', color: 'var(--muted)' }}>SIGNER BOT</span><select value={createAddr || bots[0]?.address || ''} onChange={(e) => setCreateAddr(e.target.value)} style={inputStyle}>{bots.map((b, i) => <option key={b.address} value={b.address}>Bot {String(i + 1).padStart(2, '0')} — {formatWalletAddress(b.address)}</option>)}</select></label>
      <label style={{ display: 'block', marginBottom: 12 }}><span style={{ font: '10px DM Mono', color: 'var(--muted)' }}>NAME</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Token name" maxLength={28} style={inputStyle} /></label>
      <label style={{ display: 'block', marginBottom: 12 }}><span style={{ font: '10px DM Mono', color: 'var(--muted)' }}>TICKER</span><input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="TICKER" maxLength={8} style={inputStyle} /></label>
      <label style={{ display: 'block', marginBottom: 12 }}><span style={{ font: '10px DM Mono', color: 'var(--muted)' }}>DESCRIPTION</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" maxLength={120} style={inputStyle} /></label>
      <button className="button primary" onClick={handleCreate} disabled={isCreating} style={{ marginTop: 4 }}>{isCreating ? 'Sending...' : 'Create token'}</button>
      {createHash && <p className="form-success" style={{ marginTop: 10 }}>TX: <a href={`${ARC_TESTNET.explorerUrl}/tx/${createHash}`} target="_blank" rel="noreferrer">{formatWalletAddress(createHash)}</a></p>}
      {createError && <p className="form-error" role="alert" style={{ marginTop: 10 }}>{createError}</p>}
    </div>
  </main>
}

function App() {
  const { wallet, connect, isConnecting } = useArcWallet()
  const { tokens, loading: tokensLoading, error: tokensError, refresh: refreshTokens } = useOnChainTokens()
  return <><Header wallet={wallet} onConnect={connect} isConnecting={isConnecting} /><Routes><Route path="/" element={<Explore tokens={tokens} tokensLoading={tokensLoading} tokensError={tokensError} onRefresh={refreshTokens} />} /><Route path="/create" element={<Create wallet={wallet} onConnect={connect} />} /><Route path="/wallet" element={<WalletDashboard wallet={wallet} onConnect={connect} isConnecting={isConnecting} />} /><Route path="/token/:id" element={<Detail onConnect={connect} wallet={wallet} tokens={tokens} onTraded={() => refreshTokens(true)} />} /><Route path="/admin" element={<AdminPanel onRefreshTokens={refreshTokens} />} /></Routes><MobileNav /><footer className="site-footer"><div className="container footer-inner"><Logo /><span>Built for the ARC testnet.</span><span className="footer-right"><Link to="/admin" style={{ color: 'inherit', marginRight: 16 }}>Admin panel</Link>DOXA.xyz / 2026</span></div></footer></>
}

export default App
