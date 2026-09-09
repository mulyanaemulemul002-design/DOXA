import { useMemo, useState } from 'react'
import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { ArrowUpRight, ChevronDown, CircleHelp, Copy, ImagePlus, Menu, Search, Sparkles, Wallet, X, Zap } from 'lucide-react'

type MigrationStatus = 'active' | 'graduating' | 'migrated'
type Token = { id: string; name: string; ticker: string; description: string; progress: number; marketCap: number; change: number; price: number; holders: number; status: MigrationStatus; visual: string; created: string }

const tokens: Token[] = [
  { id: 'keyboard-cat', name: 'Keyboard Cat', ticker: 'KEYS', description: 'the sound of a million tabs closing at once.', progress: 92, marketCap: 94200, change: 24.8, price: 0.00942, holders: 842, status: 'graduating', visual: 'cat', created: '18m ago' },
  { id: 'arcade-ghost', name: 'Arcade Ghost', ticker: 'GHOST', description: 'insert coin. haunt the timeline.', progress: 64, marketCap: 64800, change: 11.2, price: 0.00648, holders: 611, status: 'active', visual: 'ghost', created: '42m ago' },
  { id: 'toad-frog', name: 'Toad Frog', ticker: 'TOAD', description: 'not a frog. not financial advice.', progress: 41, marketCap: 41200, change: -3.4, price: 0.00412, holders: 389, status: 'active', visual: 'toad', created: '1h ago' },
  { id: 'usdc-baby', name: 'USDC Baby', ticker: 'BABY', description: 'born on ARC. raised on conviction.', progress: 12, marketCap: 11900, change: 8.9, price: 0.00119, holders: 124, status: 'active', visual: 'baby', created: '2h ago' },
  { id: 'night-shift', name: 'Night Shift', ticker: 'NITE', description: 'for everyone still building after midnight.', progress: 100, marketCap: 182400, change: 46.1, price: 0.01824, holders: 1204, status: 'migrated', visual: 'night', created: 'yesterday' },
  { id: 'pixel-pigeon', name: 'Pixel Pigeon', ticker: 'PIGEON', description: 'the bird that always finds alpha.', progress: 27, marketCap: 26800, change: 5.6, price: 0.00268, holders: 243, status: 'active', visual: 'pigeon', created: '3h ago' },
]

const navItems = [{ label: 'Explore', to: '/' }, { label: 'Create', to: '/create' }]

function Logo() {
  return <Link to="/" className="brand"><img src="/doxa-logo.png" alt="DOXA" /><span>DOXA<span className="brand-dot">.</span>xyz</span></Link>
}

function Header() {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  return <header className="site-header"><div className="header-inner"><Logo /><nav className={menuOpen ? 'nav open' : 'nav'}>{navItems.map((item) => <Link key={item.to} className={location.pathname === item.to ? 'active' : ''} to={item.to} onClick={() => setMenuOpen(false)}>{item.label}</Link>)}</nav><div className="header-actions"><button className="network"><span className="status-dot" /> ARC testnet <ChevronDown size={14} /></button><button className="connect"><Wallet size={15} /> Connect wallet</button></div><button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button></div></header>
}

function TokenMark({ variant, large = false }: { variant: string; large?: boolean }) {
  return <div className={`token-mark mark-${variant} ${large ? 'large' : ''}`} aria-hidden="true"><span>{variant === 'cat' ? '⌁' : variant === 'ghost' ? '◒' : variant === 'toad' ? '·ᴥ·' : variant === 'baby' ? '◡' : variant === 'night' ? '✦' : '⌁'}</span></div>
}

function StatusBadge({ status }: { status: MigrationStatus }) {
  const labels = { active: 'Active', graduating: 'Graduating', migrated: 'Migrated' }
  return <span className={`status-badge ${status}`}><span /> {labels[status]}</span>
}

function TokenCard({ token }: { token: Token }) {
  return <Link to={`/token/${token.id}`} className="token-card"><div className="card-top"><TokenMark variant={token.visual} /><StatusBadge status={token.status} /></div><div className="card-name"><div><h3>{token.name}</h3><span>${token.ticker}</span></div><ArrowUpRight size={17} /></div><p>{token.description}</p><div className="progress-meta"><span>Bonding curve</span><b>{token.progress}%</b></div><div className="progress-track"><span style={{ width: `${token.progress}%` }} /></div><div className="card-stats"><div><small>Market cap</small><strong>${token.marketCap.toLocaleString()}</strong></div><div className={token.change < 0 ? 'negative' : 'positive'}><small>24h</small><strong>{token.change > 0 ? '+' : ''}{token.change}%</strong></div></div><div className="card-foot"><span>Created {token.created}</span><span>{token.holders.toLocaleString()} holders</span></div></Link>
}

function Explore() {
  const [filter, setFilter] = useState('Trending')
  const [search, setSearch] = useState('')
  const filteredTokens = useMemo(() => tokens.filter((token) => `${token.name} ${token.ticker}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => filter === 'New' ? a.created.localeCompare(b.created) : filter === 'About to graduate' ? b.progress - a.progress : b.change - a.change), [filter, search])
  return <main><section className="hero container"><div className="hero-copy"><div className="eyebrow"><span className="pulse" /> ARC / USDC launchpad</div><h1>Make noise.<br /><span>Get noticed.</span></h1><p>Launch a token in seconds. Trade it on a live bonding curve. If the crowd shows up, it graduates.</p><div className="hero-actions"><Link className="button primary" to="/create">Launch a token <ArrowUpRight size={16} /></Link><a className="text-link" href="#explore">Explore launches <span>↘</span></a></div></div><HeroTerminal /></section><section className="ticker"><div className="ticker-inner"><span className="ticker-label"><Zap size={14} /> Live on ARC</span><span>KEYS <b className="positive">+24.8%</b></span><span>GHOST <b className="positive">+11.2%</b></span><span>TOAD <b className="negative">-3.4%</b></span><span>NITE <b className="positive">+46.1%</b></span><span className="ticker-note">Mock market data / testnet</span></div></section><section id="explore" className="explore container"><div className="section-heading"><div><div className="eyebrow">The launch board</div><h2>Find your next <span>conviction.</span></h2></div><div className="search-box"><Search size={17} /><input aria-label="Search tokens" placeholder="Search tokens" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div><div className="filter-row"><div className="filters">{['Trending', 'New', 'About to graduate'].map((item) => <button key={item} className={filter === item ? 'filter active' : 'filter'} onClick={() => setFilter(item)}>{item}</button>)}</div><span className="result-count">{filteredTokens.length} launches</span></div><div className="token-grid">{filteredTokens.map((token) => <TokenCard key={token.id} token={token} />)}</div></section></main>
}

function HeroTerminal() {
  return <div className="hero-terminal"><div className="terminal-top"><div className="window-dots"><i /><i /><i /></div><span>KEYS / USDC</span><span className="terminal-live"><span className="pulse" /> LIVE</span></div><div className="terminal-body"><div className="terminal-price"><span>KEYS price</span><strong>$0.00942</strong><b>+24.8%</b></div><div className="chart"><div className="chart-grid" /><svg viewBox="0 0 560 220" preserveAspectRatio="none"><path d="M0 188 L38 175 L65 182 L99 145 L127 155 L161 131 L190 139 L218 110 L247 123 L276 96 L300 112 L327 82 L355 94 L385 61 L414 78 L444 49 L474 65 L505 24 L536 34 L560 10" fill="none" stroke="#2ee6a0" strokeWidth="3" /></svg></div><div className="terminal-foot"><span>Market cap <b>$94.2K</b></span><span>Curve <b>92%</b></span><span>Holders <b>842</b></span></div></div></div>
}

function Create() {
  const [name, setName] = useState('')
  const [ticker, setTicker] = useState('')
  const [description, setDescription] = useState('')
  const [launched, setLaunched] = useState(false)
  return <main className="container page"><div className="page-intro"><div><div className="eyebrow">Start something</div><h1>Launch a token<br /><span>people remember.</span></h1><p>Every great meme starts with a name and a little conviction. The rest is up to the crowd.</p></div><div className="mock-note"><CircleHelp size={16} /><span>Mock launch / no wallet required</span></div></div><div className="create-layout"><form className="form-panel" onSubmit={(event) => { event.preventDefault(); setLaunched(true) }}><div className="panel-heading"><span>01</span><h2>Token details</h2></div><label>Token name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Keyboard Cat" maxLength={28} required /></label><label>Ticker<span className="input-prefix">$ <input value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="KEYS" maxLength={8} required /></span></label><label>What’s the story?<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Give the internet a reason to care..." maxLength={120} required /></label><label>Token image<div className="upload-box"><ImagePlus size={20} /><div><b>Drop an image here</b><small>PNG, JPG or GIF / 4MB max</small></div><button type="button">Browse</button></div></label><div className="optional-row"><label>Website <span className="field-optional">Optional</span><input type="url" placeholder="https://" /></label><label>X / Twitter <span className="field-optional">Optional</span><input placeholder="@handle" /></label><label>Telegram <span className="field-optional">Optional</span><input placeholder="@channel" /></label></div><button className="button primary launch-button" type="submit">{launched ? 'Token staged' : 'Preview launch'} <ArrowUpRight size={16} /></button><p className="form-footnote">By launching, you agree this is a mock preview for ARC testnet.</p></form><Preview name={name} ticker={ticker} description={description} /></div></main>
}

function Preview({ name, ticker, description }: { name: string; ticker: string; description: string }) {
  return <aside className="preview"><div className="preview-label">Live preview</div><div className="preview-card"><div className="preview-image"><TokenMark variant="baby" large /><span>YOUR TOKEN</span></div><div className="preview-content"><div className="card-name"><div><h3>{name || 'Your token name'}</h3><span>${ticker || 'TICKER'}</span></div><StatusBadge status="active" /></div><p>{description || 'Your story goes here. Make it weird, make it yours.'}</p><div className="progress-meta"><span>Bonding curve</span><b>0%</b></div><div className="progress-track"><span style={{ width: '0%' }} /></div><div className="card-stats"><div><small>Market cap</small><strong>$0</strong></div><div><small>24h</small><strong className="positive">—</strong></div></div></div></div><div className="preview-tip"><Sparkles size={16} /><span>Your token starts at zero. Every holder writes the next chapter.</span></div></aside>
}

function PriceChart({ token }: { token: Token }) {
  return <div className="detail-chart"><div className="chart-header"><div><span>Price in USDC</span><strong>${token.price.toFixed(5)}</strong></div><b className={token.change > 0 ? 'positive' : 'negative'}>{token.change > 0 ? '+' : ''}{token.change}% today</b></div><div className="big-chart"><div className="chart-grid" /><svg viewBox="0 0 800 280" preserveAspectRatio="none"><path d="M0 250 L30 240 L59 245 L86 218 L115 225 L143 188 L175 201 L204 175 L234 182 L264 151 L292 168 L321 140 L348 151 L380 115 L407 128 L436 97 L466 115 L494 86 L525 91 L552 68 L583 78 L615 41 L645 53 L675 27 L710 37 L740 16 L770 29 L800 4" fill="none" stroke="#2ee6a0" strokeWidth="4" /></svg><div className="chart-axis"><span>09:00</span><span>12:00</span><span>15:00</span><span>18:00</span><span>Now</span></div></div></div>
}

function TradePanel({ token }: { token: Token }) {
  const [side, setSide] = useState<'Buy' | 'Sell'>('Buy')
  const [amount, setAmount] = useState('')
  const value = Number(amount || 0)
  return <div className="trade-panel"><div className="trade-tabs"><button className={side === 'Buy' ? 'active' : ''} onClick={() => setSide('Buy')}>Buy</button><button className={side === 'Sell' ? 'active sell' : ''} onClick={() => setSide('Sell')}>Sell</button></div><div className="trade-body"><div className="trade-label"><span>You pay</span><button>USDC <ChevronDown size={13} /></button></div><div className="amount-field"><input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" inputMode="decimal" /><span>USDC</span></div><div className="quick-amounts"><button onClick={() => setAmount('10')}>$10</button><button onClick={() => setAmount('50')}>$50</button><button onClick={() => setAmount('100')}>$100</button><button onClick={() => setAmount('500')}>$500</button></div><div className="trade-label second"><span>You receive</span><span className="muted">Estimated</span></div><div className="receive-field"><strong>{value ? (value / token.price).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0.00'}</strong><span>${token.ticker}</span></div><div className="trade-summary"><span>Price impact <b>0.12%</b></span><span>Network fee <b>~$0.01</b></span></div><button className="button primary trade-button"><Wallet size={15} /> Connect wallet to {side.toLowerCase()}</button><span className="trade-mock">UI preview only / no transaction will be sent</span></div></div>
}

function Detail() {
  const { id } = useParams()
  const token = tokens.find((item) => item.id === id) || tokens[0]
  const copyAddress = () => navigator.clipboard?.writeText('0x8f...doxa')
  return <main className="container page detail-page"><Link to="/" className="back-link">← Back to explore</Link><div className="detail-heading"><div className="detail-token"><TokenMark variant={token.visual} large /><div><div className="eyebrow"><StatusBadge status={token.status} /></div><h1>{token.name} <span>${token.ticker}</span></h1><p>{token.description}</p><button className="address" onClick={copyAddress}>ARC / 0x8f...doxa <Copy size={13} /></button></div></div><div className="detail-actions"><button className="icon-button"><Search size={16} /></button><button className="button primary"><Wallet size={15} /> Connect wallet</button></div></div><div className="detail-grid"><div><PriceChart token={token} /><div className="curve-card"><div className="curve-header"><div><span>Bonding curve progress</span><strong>{token.progress}%</strong></div><span>{token.progress >= 100 ? 'Graduated' : `$${(182400 - token.marketCap).toLocaleString()} to graduation`}</span></div><div className="curve-track"><span style={{ width: `${token.progress}%` }} /><i style={{ left: `${token.progress}%` }} /></div><div className="curve-foot"><span>Launched <b>0 USDC</b></span><span>Graduation target <b>$182.4K</b></span></div></div><MigrationCard status={token.status} /></div><aside><TradePanel token={token} /><div className="holders-card"><div className="small-heading"><h3>Top holders</h3><a href="#holders">View all</a></div>{['0x4a…91f', '0x8f…doxa', '0xc2…52a', '0x12…b8e'].map((holder, index) => <div className="holder-row" key={holder}><span className="holder-rank">0{index + 1}</span><span>{holder}</span><b>{[12.4, 8.2, 5.8, 4.1][index]}%</b></div>)}</div></aside></div></main>
}

function MigrationCard({ status }: { status: MigrationStatus }) {
  const migrated = status === 'migrated'
  return <div className={`migration-card ${migrated ? 'migrated' : ''}`}><div className="migration-icon">{migrated ? '✓' : <Zap size={20} />}</div><div><div className="eyebrow">{migrated ? 'Migration complete' : 'The roadmap'}</div><h3>{migrated ? 'Now trading on ARC mainnet' : status === 'graduating' ? 'Almost ready for the next stop' : 'Build toward the big move'}</h3><p>{migrated ? 'This token graduated from its bonding curve and is now available on the open market.' : 'At 100%, liquidity migrates to Uniswap on ARC Mainnet. This is a preview of what comes next.'}</p></div></div>
}

function App() { return <><Header /><Routes><Route path="/" element={<Explore />} /><Route path="/create" element={<Create />} /><Route path="/token/:id" element={<Detail />} /></Routes><footer className="site-footer"><div className="container footer-inner"><Logo /><span>Built for the ARC testnet.</span><span className="footer-right">DOXA.xyz / 2026</span></div></footer></> }

export default App
