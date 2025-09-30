import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { jsonWithCompression } from '@/lib/http/compression'

if (typeof globalThis.Response === 'undefined') {
  class MockResponse {
    private readonly body: Uint8Array
    readonly headers: Headers
    readonly status: number

    constructor(body: BodyInit | null = null, init: ResponseInit = {}) {
      if (body === null) {
        this.body = new Uint8Array()
      } else if (typeof body === 'string') {
        this.body = Buffer.from(body)
      } else if (body instanceof ArrayBuffer) {
        this.body = new Uint8Array(body)
      } else if (ArrayBuffer.isView(body)) {
        this.body = new Uint8Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength))
      } else {
        throw new TypeError('Unsupported body type for MockResponse')
      }

      this.headers = new Headers(init.headers ?? {})
      this.status = init.status ?? 200
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
      const buffer = this.body.buffer.slice(
        this.body.byteOffset,
        this.body.byteOffset + this.body.byteLength
      )

      // Node 20 typings allow SharedArrayBuffer here; cast keeps the signature compatible with Response
      return buffer as ArrayBuffer
    }
  }

  ;(globalThis as unknown as { Response: typeof Response }).Response = MockResponse as unknown as typeof Response
}

describe('jsonWithCompression', () => {
  const largePayload = {
    data: 'race-data'.repeat(3000),
  }
  const smallPayload = { data: 'ok' }

  it('returns uncompressed JSON when the client does not accept compression', async () => {
    const request = { headers: new Headers() }

    const response = await jsonWithCompression(request, largePayload)
    const bodyBuffer = Buffer.from(await response.arrayBuffer())

    expect(response.headers.get('Content-Encoding')).toBeNull()
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('Vary')).toContain('Accept-Encoding')
    expect(response.headers.get('Content-Length')).toBe(
      String(bodyBuffer.byteLength)
    )
    expect(bodyBuffer.toString()).toBe(JSON.stringify(largePayload))
  })

  it('compresses responses with gzip when requested by the client', async () => {
    const request = {
      headers: new Headers({ 'accept-encoding': 'gzip' }),
    }

    const response = await jsonWithCompression(request, largePayload)
    const bodyBuffer = Buffer.from(await response.arrayBuffer())

    expect(response.headers.get('Content-Encoding')).toBe('gzip')

    const decompressed = gunzipSync(bodyBuffer).toString()
    expect(decompressed).toBe(JSON.stringify(largePayload))
  })

  it('prefers brotli encoding when supported by the client', async () => {
    const request = {
      headers: new Headers({ 'accept-encoding': 'br, gzip;q=0.8' }),
    }

    const response = await jsonWithCompression(request, largePayload)
    const bodyBuffer = Buffer.from(await response.arrayBuffer())

    expect(response.headers.get('Content-Encoding')).toBe('br')

    const decompressed = brotliDecompressSync(bodyBuffer).toString()
    expect(decompressed).toBe(JSON.stringify(largePayload))
  })

  it('skips compression when the payload is below the compression threshold', async () => {
    const request = {
      headers: new Headers({ 'accept-encoding': 'gzip, br' }),
    }

    const response = await jsonWithCompression(request, smallPayload)
    const bodyBuffer = Buffer.from(await response.arrayBuffer())

    expect(response.headers.get('Content-Encoding')).toBeNull()
    expect(bodyBuffer.toString()).toBe(JSON.stringify(smallPayload))
  })
})
