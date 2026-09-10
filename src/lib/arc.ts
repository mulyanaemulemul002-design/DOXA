export const ARC_TESTNET = {
  chainId: '0x4cef52',
  chainIdDecimal: 5042002,
  name: 'Arc Testnet',
  rpcUrl: 'https://rpc.testnet.arc.io',
  explorerUrl: 'https://testnet.arcscan.app',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  usdcAddress: '0x3600000000000000000000000000000000000000',
} as const

type RequestArguments = {
  method: string
  params?: unknown[]
}

export type Eip1193Provider = {
  request: (args: RequestArguments) => Promise<unknown>
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
}

export type ArcWalletConnection = {
  account: string
  chainId: string
}

export type ArcWalletBalances = {
  nativeUsdc: string
  erc20Usdc: string
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider
  }
}

export function getInjectedProvider(): Eip1193Provider | undefined {
  return typeof window === 'undefined' ? undefined : window.ethereum
}

let walletConnectProvider: Eip1193Provider | undefined

export async function getWalletConnectProvider(): Promise<Eip1193Provider | undefined> {
  if (typeof window === 'undefined') return undefined
  const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
  if (!projectId) return undefined
  if (walletConnectProvider) return walletConnectProvider

  const { EthereumProvider } = await import('@walletconnect/ethereum-provider')
  walletConnectProvider = await EthereumProvider.init({
    projectId,
    chains: [ARC_TESTNET.chainIdDecimal],
    optionalChains: [ARC_TESTNET.chainIdDecimal],
    showQrModal: true,
    metadata: {
      name: 'DOXA',
      description: 'DOXA token launchpad on Arc Testnet',
      url: window.location.origin,
      icons: [`${window.location.origin}/doxa-logo.png`],
    },
  }) as unknown as Eip1193Provider
  return walletConnectProvider
}

async function getChainId(provider: Eip1193Provider): Promise<string> {
  const chainId = await provider.request({ method: 'eth_chainId' })
  if (typeof chainId !== 'string') throw new Error('Wallet returned an invalid chain ID.')
  return chainId
}

async function switchToArcTestnet(provider: Eip1193Provider): Promise<void> {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_TESTNET.chainId }],
    })
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
    if (code !== 4902) throw error
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: ARC_TESTNET.chainId,
        chainName: ARC_TESTNET.name,
        nativeCurrency: ARC_TESTNET.nativeCurrency,
        rpcUrls: [ARC_TESTNET.rpcUrl],
        blockExplorerUrls: [ARC_TESTNET.explorerUrl],
      }],
    })
  }
}

export async function connectArcWallet(): Promise<ArcWalletConnection> {
  const provider = getInjectedProvider() ?? await getWalletConnectProvider()
  if (!provider) throw new Error('WalletConnect is not configured. Add VITE_WALLETCONNECT_PROJECT_ID, or install a browser wallet.')
  const walletConnect = provider as Eip1193Provider & { connect?: () => Promise<void> }
  if (!getInjectedProvider() && walletConnect.connect) await walletConnect.connect()

  if ((await getChainId(provider)).toLowerCase() !== ARC_TESTNET.chainId) {
    await switchToArcTestnet(provider)
  }

  const accounts = await provider.request({ method: 'eth_requestAccounts' })
  const account = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : undefined
  if (!account) throw new Error('The wallet did not return an account.')

  return { account, chainId: await getChainId(provider) }
}

function formatUnits(value: bigint, decimals: number, maximumFractionDigits = 4): string {
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = value % base
  if (fraction === 0n) return whole.toString()
  const fractionText = fraction.toString().padStart(decimals, '0').slice(0, maximumFractionDigits).replace(/0+$/, '')
  return `${whole}.${fractionText}`
}

function addressArgument(address: string): string {
  return address.replace(/^0x/, '').toLowerCase().padStart(64, '0')
}

export async function readArcWalletBalances(account: string): Promise<ArcWalletBalances> {
  const provider = getInjectedProvider() ?? walletConnectProvider
  if (!provider) throw new Error('No wallet connection found.')

  const [nativeBalance, erc20Balance] = await Promise.all([
    provider.request({ method: 'eth_getBalance', params: [account, 'latest'] }),
    provider.request({
      method: 'eth_call',
      params: [{
        to: ARC_TESTNET.usdcAddress,
        data: `0x70a08231${addressArgument(account)}`,
      }, 'latest'],
    }),
  ])

  if (typeof nativeBalance !== 'string' || typeof erc20Balance !== 'string') {
    throw new Error('Wallet returned an invalid balance.')
  }

  return {
    nativeUsdc: formatUnits(BigInt(nativeBalance), ARC_TESTNET.nativeCurrency.decimals),
    erc20Usdc: formatUnits(BigInt(erc20Balance), 6),
  }
}

export function formatWalletAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
