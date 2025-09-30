import { promisify } from 'node:util'
import {
  brotliCompress as brotliCompressCallback,
  gzip as gzipCallback,
} from 'node:zlib'

const brotliCompress = promisify(brotliCompressCallback)
const gzipCompress = promisify(gzipCallback)

const MIN_COMPRESSION_BYTES = 1024
const SUPPORTED_ENCODINGS = ['br', 'gzip']

function parseEncodingPreferences(header) {
  if (!header || typeof header !== 'string') {
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
    .filter((value) => Boolean(value && value.name && value.q > 0))
}

function negotiateEncoding(header) {
  const preferences = parseEncodingPreferences(header)
  if (preferences.length === 0) {
    return null
  }

  let bestEncoding = null
  let bestQuality = -1

  for (const preference of preferences) {
    if (preference.name === '*') {
      if (preference.q > bestQuality) {
        bestEncoding = 'gzip'
        bestQuality = preference.q
      }
      continue
    }

    if (!SUPPORTED_ENCODINGS.includes(preference.name)) {
      continue
    }

    if (preference.q > bestQuality) {
      bestEncoding = preference.name
      bestQuality = preference.q
      continue
    }

    if (preference.q === bestQuality && bestEncoding) {
      const currentIndex = SUPPORTED_ENCODINGS.indexOf(bestEncoding)
      const candidateIndex = SUPPORTED_ENCODINGS.indexOf(preference.name)
      if (candidateIndex !== -1 && currentIndex !== -1 && candidateIndex < currentIndex) {
        bestEncoding = preference.name
      }
    }
  }

  return bestEncoding
}

function ensureHeadersObject(res) {
  if (!res.headers || typeof res.headers !== 'object') {
    res.headers = {}
  }

  return res.headers
}

function appendVaryHeader(headers, value) {
  const existing = headers.Vary || headers.vary
  if (!existing) {
    headers.Vary = value
    return
  }

  const normalized = existing
    .split(',')
    .map((item) => item.trim().toLowerCase())

  if (!normalized.includes(value.toLowerCase())) {
    headers.Vary = `${existing}, ${value}`
  }
}

export async function sendCompressedJson(context, payload, status = 200) {
  const res = context?.res
  if (!res) {
    return payload
  }

  if (typeof res.send !== 'function') {
    if (typeof res.json === 'function') {
      return res.json(payload, status)
    }
    return payload
  }

  const headers = ensureHeadersObject(res)
  headers['Content-Type'] = 'application/json; charset=utf-8'
  appendVaryHeader(headers, 'Accept-Encoding')

  const serialisedPayload = JSON.stringify(payload ?? null)
  const uncompressedBuffer = Buffer.from(serialisedPayload)

  const acceptEncodingHeader =
    context?.req?.headers?.['accept-encoding'] ?? context?.req?.headers?.accept ?? null

  const shouldCompress = uncompressedBuffer.byteLength >= MIN_COMPRESSION_BYTES

  if (!shouldCompress) {
    delete headers['Content-Encoding']
    headers['Content-Length'] = String(uncompressedBuffer.byteLength)
    return res.send(uncompressedBuffer, status)
  }

  const encoding = negotiateEncoding(acceptEncodingHeader)

  if (!encoding) {
    delete headers['Content-Encoding']
    headers['Content-Length'] = String(uncompressedBuffer.byteLength)
    return res.send(uncompressedBuffer, status)
  }

  const compressedBuffer =
    encoding === 'br'
      ? await brotliCompress(uncompressedBuffer)
      : await gzipCompress(uncompressedBuffer)

  headers['Content-Encoding'] = encoding
  headers['Content-Length'] = String(compressedBuffer.byteLength)

  return res.send(compressedBuffer, status)
}
