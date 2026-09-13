import { defineChain } from 'viem'
import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { QueryClient } from '@tanstack/react-query'
import { ARC_TESTNET } from './arc'

export const REOWN_PROJECT_ID = import.meta.env.VITE_REOWN_PROJECT_ID?.trim() || ''

export const arcAppKitNetwork = defineChain({
  id: ARC_TESTNET.chainIdDecimal,
  name: ARC_TESTNET.name,
  nativeCurrency: ARC_TESTNET.nativeCurrency,
  rpcUrls: {
    default: { http: [ARC_TESTNET.rpcUrl] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: ARC_TESTNET.explorerUrl },
  },
})

export const queryClient = new QueryClient()

export const reownConfig = REOWN_PROJECT_ID
  ? {
      adapters: [new WagmiAdapter({
        networks: [arcAppKitNetwork],
        projectId: REOWN_PROJECT_ID,
      })],
      networks: [arcAppKitNetwork] as [typeof arcAppKitNetwork, ...typeof arcAppKitNetwork[]],
      defaultNetwork: arcAppKitNetwork,
      projectId: REOWN_PROJECT_ID,
      metadata: {
        name: 'DOXA.xyz',
        description: 'DOXA token launchpad on Arc Testnet',
        url: typeof window === 'undefined' ? 'https://doxa.xyz' : window.location.origin,
        icons: ['/doxa-logo.png'],
      },
      themeMode: 'dark' as const,
      features: {
        analytics: true,
        email: false,
        socials: [],
      },
      themeVariables: {
        '--w3m-accent': '#2ee6a0',
        '--w3m-border-radius-master': '2px',
      },
    }
  : null

export function initializeReownAppKit(): void {
  if (reownConfig) createAppKit(reownConfig)
}
