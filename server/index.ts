import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createServer as createViteServer } from 'vite'

const port = Number(process.env.PORT || 5000)

function writeJson(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

async function readMultipart(request: IncomingMessage): Promise<FormData> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const headers = new Headers()
  const contentType = request.headers['content-type']
  if (contentType) headers.set('content-type', contentType)
  const contentLength = request.headers['content-length']
  if (contentLength) headers.set('content-length', contentLength)
  return new Request('http://localhost/api/ipfs', {
    method: 'POST',
    headers,
    body: Buffer.concat(chunks),
  }).formData()
}

async function handleIpfs(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    writeJson(response, 405, { error: 'Method not allowed.' })
    return
  }
  const jwt = process.env.PINATA_JWT
  if (!jwt) {
    writeJson(response, 503, { error: 'IPFS upload is not configured. Add the server-only PINATA_JWT secret.' })
    return
  }
  try {
    const form = await readMultipart(request)
    const file = form.get('file')
    const metadataRaw = form.get('metadata')
    if (!(file instanceof File) || typeof metadataRaw !== 'string') {
      writeJson(response, 400, { error: 'An image file and metadata payload are required.' })
      return
    }
    if (!file.type.startsWith('image/') || file.size > 4 * 1024 * 1024) {
      writeJson(response, 413, { error: 'Token images must be image files no larger than 4MB.' })
      return
    }
    const metadata = JSON.parse(metadataRaw) as Record<string, unknown>
    const imageBody = new FormData()
    imageBody.append('file', file, file.name)
    const imageResponse = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: imageBody,
    })
    if (!imageResponse.ok) {
      writeJson(response, 502, { error: 'Unable to upload the token image to IPFS.' })
      return
    }
    const imageResult = await imageResponse.json() as { IpfsHash?: string }
    if (!imageResult.IpfsHash) {
      writeJson(response, 502, { error: 'IPFS did not return an image CID.' })
      return
    }
    const jsonResponse = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pinataContent: {
          ...metadata,
          image: `ipfs://${imageResult.IpfsHash}`,
        },
      }),
    })
    if (!jsonResponse.ok) {
      writeJson(response, 502, { error: 'Unable to upload token metadata to IPFS.' })
      return
    }
    const jsonResult = await jsonResponse.json() as { IpfsHash?: string }
    if (!jsonResult.IpfsHash) {
      writeJson(response, 502, { error: 'IPFS did not return a metadata CID.' })
      return
    }
    writeJson(response, 200, { metadataURI: `ipfs://${jsonResult.IpfsHash}` })
  } catch (error) {
    writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid IPFS upload request.' })
  }
}

async function start(): Promise<void> {
  const vite = await createViteServer({
    server: { middlewareMode: true, allowedHosts: true },
    appType: 'spa',
  })
  const server = createHttpServer((request, response) => {
    const pathname = request.url?.split('?')[0]
    if (pathname === '/health') {
      writeJson(response, 200, { ok: true })
      return
    }
    if (pathname === '/api/ipfs') {
      void handleIpfs(request, response)
      return
    }
    vite.middlewares(request, response, () => {
      response.statusCode = 404
      response.end('Not found')
    })
  })
  server.listen(port, '0.0.0.0', () => {
    console.log(`DOXA server listening on 0.0.0.0:${port}`)
  })
}

void start().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
