import { promisify } from 'node:util'
import {
  brotliCompress as brotliCompressCallback,
  gzip as gzipCompressCallback,
} from 'node:zlib'

const brotliCompress = promisify(brotliCompressCallback)
const gzipCompress = promisify(gzipCompressCallback)

const MIN_COMPRESSION_BYTES = 1024

const SUPPORTED_ENCODINGS = ['br', 'gzip'] as const
export type CompressionEncoding = (typeof SUPPORTED_ENCODINGS)[number]

type EncodingPreference = {
  name: string
  q: number
}

const DEFAULT_JSON_CONTENT_TYPE = 'application/json; charset=utf-8'

function parseEncodingPreferences(header: string | null): EncodingPreference[] {
  if (!header) {
    return []
  }

  return header
    .split(',')
    .map((value) => {
      const [name, ...params] = value.trim().split(';')
      if (!name) {
        return null
      }

      let quality = 1
      for (const param of params) {
        const [key, raw] = param.trim().split('=')
        if (key === 'q' && raw !== undefined) {
          const parsed = Number.parseFloat(raw)
          if (!Number.isNaN(parsed)) {
            quality = parsed
          }
        }
      }

      return {
        name: name.trim().toLowerCase(),
        q: quality,
      }
    })
    .filter((value): value is EncodingPreference => {
      return Boolean(value && value.name && value.q > 0)
    })
}

function negotiateEncoding(header: string | null): CompressionEncoding | null {
  const preferences = parseEncodingPreferences(header)
  if (preferences.length === 0) {
    return null
  }

  let bestEncoding: CompressionEncoding | null = null
  let bestQuality = -1

  for (const preference of preferences) {
    if (preference.name === '*') {
      if (preference.q > bestQuality) {
        bestEncoding = 'gzip'
        bestQuality = preference.q
      }
      continue
    }

    if (!SUPPORTED_ENCODINGS.includes(preference.name as CompressionEncoding)) {
      continue
    }

    const encoding = preference.name as CompressionEncoding

    if (preference.q > bestQuality) {
      bestEncoding = encoding
      bestQuality = preference.q
      continue
    }

    if (preference.q === bestQuality && bestEncoding) {
      const currentIndex = SUPPORTED_ENCODINGS.indexOf(bestEncoding)
      const candidateIndex = SUPPORTED_ENCODINGS.indexOf(encoding)
      if (candidateIndex < currentIndex) {
        bestEncoding = encoding
      }
    }
  }

  return bestEncoding
}

function appendVaryHeader(headers: Headers, value: string) {
  const existing = headers.get('Vary')
  if (!existing) {
    headers.set('Vary', value)
    return
  }

  const values = existing
    .split(',')
    .map((item) => item.trim().toLowerCase())

  if (!values.includes(value.toLowerCase())) {
    headers.set('Vary', `${existing}, ${value}`)
  }
}

interface JsonWithCompressionInit extends ResponseInit {
  headers?: HeadersInit
}

interface RequestLike {
  headers: Headers
}

export async function jsonWithCompression(
  request: RequestLike,
  payload: unknown,
  init: JsonWithCompressionInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers ?? {})
  const acceptEncoding = request.headers.get('accept-encoding')
  const existingContentEncoding = headers.get('Content-Encoding')

  headers.set('Content-Type', DEFAULT_JSON_CONTENT_TYPE)
  appendVaryHeader(headers, 'Accept-Encoding')

  const serialisedPayload = JSON.stringify(payload ?? null)
  const uncompressedBuffer = Buffer.from(serialisedPayload)

  const shouldAttemptCompression =
    !existingContentEncoding && uncompressedBuffer.byteLength >= MIN_COMPRESSION_BYTES

  if (!shouldAttemptCompression) {
    headers.delete('Content-Encoding')
    headers.set('Content-Length', String(uncompressedBuffer.byteLength))

    return new Response(uncompressedBuffer, {
      ...init,
      headers,
    })
  }

  const encoding = negotiateEncoding(acceptEncoding)

  if (!encoding) {
    headers.delete('Content-Encoding')
    headers.set('Content-Length', String(uncompressedBuffer.byteLength))

    return new Response(uncompressedBuffer, {
      ...init,
      headers,
    })
  }

  const compressedBuffer =
    encoding === 'br'
      ? await brotliCompress(uncompressedBuffer)
      : await gzipCompress(uncompressedBuffer)

  headers.set('Content-Encoding', encoding)
  headers.set('Content-Length', String(compressedBuffer.byteLength))

  return new Response(compressedBuffer, {
    ...init,
    headers,
  })
}
