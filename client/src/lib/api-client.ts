type QueryValue = string | number | boolean | null | undefined

interface ApiRequestConfig extends Omit<RequestInit, 'body' | 'headers'> {
  params?: Record<string, QueryValue | QueryValue[]>
  body?: unknown
  timeoutMs?: number
  headers?: Record<string, string>
}

export class ApiError extends Error {
  public readonly status: number
  public readonly url: string
  public readonly details?: unknown

  constructor(message: string, status: number, url: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.url = url
    this.details = details
  }
}

type RequestInterceptor = (
  url: URL,
  init: RequestInit
) => Promise<{ url: URL; init: RequestInit }> | { url: URL; init: RequestInit }

type ResponseInterceptor = (
  response: Response,
  request: { url: URL; init: RequestInit }
) => Promise<Response> | Response

const requestInterceptors: RequestInterceptor[] = []
const responseInterceptors: ResponseInterceptor[] = []

const DEFAULT_TIMEOUT_MS = 15_000

const resolveBaseUrl = (): string => {
  const envBase =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.API_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_API_BASE_URL

  if (envBase && envBase.trim().length > 0) {
    return envBase.trim().replace(/\/+$/, '')
  }

  return ''
}

const toSearchParams = (params: ApiRequestConfig['params']): string => {
  if (!params) {
    return ''
  }

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry !== undefined && entry !== null) {
          search.append(key, String(entry))
        }
      }
      continue
    }

    if (value !== undefined && value !== null) {
      search.set(key, String(value))
    }
  }

  const query = search.toString()
  return query.length > 0 ? `?${query}` : ''
}

const applyRequestInterceptors = async (
  url: URL,
  init: RequestInit
): Promise<{ url: URL; init: RequestInit }> => {
  let current = { url, init }

  for (const interceptor of requestInterceptors) {
    current = await interceptor(current.url, current.init)
  }

  return current
}

const applyResponseInterceptors = async (
  response: Response,
  request: { url: URL; init: RequestInit }
): Promise<Response> => {
  let current = response
  for (const interceptor of responseInterceptors) {
    current = await interceptor(current, request)
  }
  return current
}

const withTimeout = async (
  promise: Promise<Response>,
  timeoutMs: number,
  url: string
): Promise<Response> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<Response>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new ApiError('Request timed out', 504, url))
    }, timeoutMs)
  })

  try {
    const response = await Promise.race([promise, timeoutPromise])
    return response
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

const serializeBody = (
  body: unknown
): { data: BodyInit | undefined; contentType?: string } => {
  if (body === undefined || body === null) {
    return { data: undefined }
  }

  if (body instanceof FormData || body instanceof Blob) {
    return { data: body }
  }

  if (body instanceof URLSearchParams) {
    return {
      data: body,
      contentType: 'application/x-www-form-urlencoded',
    }
  }

  if (typeof body === 'string') {
    return { data: body, contentType: 'text/plain;charset=utf-8' }
  }

  return {
    data: JSON.stringify(body),
    contentType: 'application/json',
  }
}

const baseUrl = resolveBaseUrl()

const buildUrl = (path: string, query?: ApiRequestConfig['params']): URL => {
  const sanitizedPath = path.replace(/^\/+/, '')
  const resolvedBase =
    baseUrl !== ''
      ? `${baseUrl}/`
      : typeof window !== 'undefined'
        ? `${window.location.origin}/`
        : ''

  if (resolvedBase === '') {
    throw new Error(
      'NEXT_PUBLIC_API_BASE_URL must be defined for server-side requests'
    )
  }

  const url = new URL(sanitizedPath, resolvedBase)
  const queryString = toSearchParams(query)
  if (queryString) {
    url.search = queryString.slice(1)
  }
  return url
}

const request = async <T>(
  path: string,
  config: ApiRequestConfig = {}
): Promise<T> => {
  const {
    params,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    body,
    headers = {},
    ...initRest
  } = config

  const url = buildUrl(path, params)

  const { data, contentType } = serializeBody(body)

  const init: RequestInit = {
    ...initRest,
    headers:
      data !== undefined
        ? {
            ...(contentType ? { 'Content-Type': contentType } : {}),
            ...headers,
          }
        : headers,
    body: data,
  }

  const intercepted = await applyRequestInterceptors(url, init)

  const fetchPromise = fetch(intercepted.url.toString(), intercepted.init)
  const response = await withTimeout(fetchPromise, timeoutMs, intercepted.url.toString())
    .catch((error: unknown) => {
      console.error('API request failed', {
        path,
        url: intercepted.url.toString(),
        error,
      })
      if (error instanceof ApiError) {
        throw error
      }
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown network error',
        503,
        intercepted.url.toString(),
        error
      )
    })

  const finalResponse = await applyResponseInterceptors(response, intercepted)

  if (!finalResponse.ok) {
    let details: unknown
    try {
      details = await finalResponse.clone().json()
    } catch {
      details = await finalResponse.clone().text()
    }

    const message =
      details && typeof details === 'object' && 'error' in details
        ? String((details as Record<string, unknown>).error)
        : finalResponse.statusText || 'API request failed'

    console.error('API request returned error', {
      path,
      status: finalResponse.status,
      message,
      details,
    })

    throw new ApiError(message, finalResponse.status, intercepted.url.toString(), details)
  }

  if (finalResponse.status === 204) {
    return undefined as T
  }

  const responseContentType = finalResponse.headers.get('content-type') ?? ''
  if (responseContentType.includes('application/json')) {
    return (await finalResponse.json()) as T
  }

  return (await finalResponse.text()) as T
}

export const apiClient = {
  request,
  get: <T>(path: string, config: ApiRequestConfig = {}) =>
    request<T>(path, { ...config, method: 'GET' }),
  post: <T>(path: string, body?: unknown, config: ApiRequestConfig = {}) =>
    request<T>(path, { ...config, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, config: ApiRequestConfig = {}) =>
    request<T>(path, { ...config, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, config: ApiRequestConfig = {}) =>
    request<T>(path, { ...config, method: 'PATCH', body }),
  delete: <T>(path: string, config: ApiRequestConfig = {}) =>
    request<T>(path, { ...config, method: 'DELETE' }),
  addRequestInterceptor: (interceptor: RequestInterceptor) => {
    requestInterceptors.push(interceptor)
  },
  addResponseInterceptor: (interceptor: ResponseInterceptor) => {
    responseInterceptors.push(interceptor)
  },
  clearInterceptors: () => {
    requestInterceptors.length = 0
    responseInterceptors.length = 0
  },
  buildUrl: (path: string, params?: ApiRequestConfig['params']) =>
    buildUrl(path, params).toString(),
}

export type { ApiRequestConfig, RequestInterceptor, ResponseInterceptor }
