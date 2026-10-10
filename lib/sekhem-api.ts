"use client"

import { useEffect, useState } from "react"

export interface ApiResponseDto<T> {
  data: T
  meta: {
    timestamp: string
    total?: number
  }
  errors: { code: string; message: string }[]
}

export class SekhemApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "SekhemApiError"
    this.status = status
    this.code = code
  }
}

export type FetchSekhemApiOptions = {
  throwOnError?: boolean
  /** Only for read endpoints whose contract explicitly permits a null result. */
  allowNullData?: boolean
}

function sekhemApiErrorFromBody(status: number, body: Partial<ApiResponseDto<unknown>> | null): SekhemApiError {
  const first = body?.errors?.[0]
  return new SekhemApiError(
    status,
    first?.code ?? `HTTP_${status}`,
    first?.message ?? `Request failed (${status})`,
  )
}

export function requireSekhemList<T>(data: unknown, label: string): T[] {
  if (!Array.isArray(data)) {
    throw new SekhemApiError(0, "INVALID_RESPONSE", `${label} did not return an array`)
  }
  return data as T[]
}

function apiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL

  if (configured) {
    return configured.replace(/\/$/, "")
  }

  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    // Return empty string so fetch calls use relative paths (same origin)
    return "";
  }


  return ""
}

export async function fetchSekhemApi<T>(path: string, options: FetchSekhemApiOptions = {}): Promise<T | null> {
  const baseUrl = apiBaseUrl()
  const throwOnError = options.throwOnError === true

  try {
    // In local development, use same-origin API with proper '/api' prefix and include credentials
    const apiPrefix = baseUrl ? '' : '/api';
    const response = await fetch(`${baseUrl}${apiPrefix}${path.startsWith('/') ? path : `/${path}`}`, {
      cache: "no-store",
      credentials: "include"
    })

    let body: Partial<ApiResponseDto<T>> | null = null
    try {
      body = (await response.json()) as Partial<ApiResponseDto<T>>
    } catch {
      body = null
    }

    if (!response.ok) {
      if (throwOnError) throw sekhemApiErrorFromBody(response.status, body)
      return null
    }

    if (!body || body.data === undefined || (body.data === null && !options.allowNullData) || (Array.isArray(body.errors) && body.errors.length > 0)) {
      if (throwOnError) {
        throw sekhemApiErrorFromBody(response.status, body ?? {
          data: undefined as unknown as T,
          errors: [{ code: "INVALID_RESPONSE", message: "API response was missing data" }],
        })
      }
      return null
    }

    return body.data
  } catch (error) {
    if (throwOnError) {
      if (error instanceof SekhemApiError) throw error
      throw new SekhemApiError(0, "NETWORK", error instanceof Error ? error.message : "Network request failed")
    }
    return null
  }
}

export async function postSekhemApi<TResponse, TPayload extends Record<string, unknown>>(
  path: string,
  payload: TPayload,
  options: FetchSekhemApiOptions = {}
): Promise<TResponse | null> {
  const baseUrl = apiBaseUrl()
  const throwOnError = options.throwOnError === true

  // Treat null as missing config; empty string means same-origin
  if (baseUrl === null) {
    if (throwOnError) throw new SekhemApiError(0, "CONFIG", "Missing API base URL configuration")
    return null
  }

  try {
    // In local development, use same-origin API with proper '/api' prefix and include credentials
    const apiPrefix = baseUrl ? '' : '/api';
    const response = await fetch(`${baseUrl}${apiPrefix}${path.startsWith('/') ? path : `/${path}`}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "include"
    })

    let body: Partial<ApiResponseDto<TResponse>> | null = null
    try {
      body = (await response.json()) as Partial<ApiResponseDto<TResponse>>
    } catch {
      body = null
    }

    if (!response.ok) {
      if (throwOnError) throw sekhemApiErrorFromBody(response.status, body)
      return null
    }

    if (!body || body.data == null || (Array.isArray(body.errors) && body.errors.length > 0)) {
      if (throwOnError) {
        throw sekhemApiErrorFromBody(response.status, body ?? {
          data: undefined as unknown as TResponse,
          errors: [{ code: "INVALID_RESPONSE", message: "API response was missing data" }],
        })
      }
      return null
    }

    return body.data
  } catch (error) {
    if (throwOnError) {
      if (error instanceof SekhemApiError) throw error
      throw new SekhemApiError(0, "NETWORK", error instanceof Error ? error.message : "Network request failed")
    }
    return null
  }
}

export async function patchSekhemApi<TResponse, TPayload extends Record<string, unknown>>(
  path: string,
  payload: TPayload,
  options: FetchSekhemApiOptions = {}
): Promise<TResponse | null> {
  const baseUrl = apiBaseUrl()
  const throwOnError = options.throwOnError === true

  if (baseUrl === null) {
    if (throwOnError) throw new SekhemApiError(0, "CONFIG", "Missing API base URL configuration")
    return null
  }

  try {
    const apiPrefix = baseUrl ? '' : '/api';
    const response = await fetch(`${baseUrl}${apiPrefix}${path.startsWith('/') ? path : `/${path}`}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "include"
    })

    let body: Partial<ApiResponseDto<TResponse>> | null = null
    try {
      body = (await response.json()) as Partial<ApiResponseDto<TResponse>>
    } catch {
      body = null
    }

    if (!response.ok) {
      if (throwOnError) throw sekhemApiErrorFromBody(response.status, body)
      return null
    }

    if (!body || body.data == null || (Array.isArray(body.errors) && body.errors.length > 0)) {
      if (throwOnError) {
        throw sekhemApiErrorFromBody(response.status, body ?? {
          data: undefined as unknown as TResponse,
          errors: [{ code: "INVALID_RESPONSE", message: "API response was missing data" }],
        })
      }
      return null
    }

    return body.data
  } catch (error) {
    if (throwOnError) {
      if (error instanceof SekhemApiError) throw error
      throw new SekhemApiError(0, "NETWORK", error instanceof Error ? error.message : "Network request failed")
    }
    return null
  }
}

export async function deleteSekhemApi<TResponse>(
  path: string,
  options: FetchSekhemApiOptions = {}
): Promise<TResponse | null> {
  const baseUrl = apiBaseUrl()
  const throwOnError = options.throwOnError === true

  if (baseUrl === null) {
    if (throwOnError) throw new SekhemApiError(0, "CONFIG", "Missing API base URL configuration")
    return null
  }

  try {
    const apiPrefix = baseUrl ? '' : '/api';
    const response = await fetch(`${baseUrl}${apiPrefix}${path.startsWith('/') ? path : `/${path}`}`, {
      method: "DELETE",
      cache: "no-store",
      credentials: "include"
    })

    let body: Partial<ApiResponseDto<TResponse>> | null = null
    try {
      body = (await response.json()) as Partial<ApiResponseDto<TResponse>>
    } catch {
      body = null
    }

    if (!response.ok) {
      if (throwOnError) throw sekhemApiErrorFromBody(response.status, body)
      return null
    }

    if (!body || body.data == null || (Array.isArray(body.errors) && body.errors.length > 0)) {
      if (throwOnError) {
        throw sekhemApiErrorFromBody(response.status, body ?? {
          data: undefined as unknown as TResponse,
          errors: [{ code: "INVALID_RESPONSE", message: "API response was missing data" }],
        })
      }
      return null
    }

    return body.data
  } catch (error) {
    if (throwOnError) {
      if (error instanceof SekhemApiError) throw error
      throw new SekhemApiError(0, "NETWORK", error instanceof Error ? error.message : "Network request failed")
    }
    return null
  }
}

export async function mutateSekhemApi<TResponse>(
  method: "POST" | "PATCH",
  path: string,
  payload: Record<string, unknown> = {}
): Promise<TResponse | null> {
  const baseUrl = apiBaseUrl()
  
  try {
    // In local development, use same-origin API with proper '/api' prefix and include credentials
    const apiPrefix = baseUrl ? '' : '/api';
    const response = await fetch(`${baseUrl}${apiPrefix}${path.startsWith('/') ? path : `/${path}`}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "include",
    })
    if (!response.ok) return null
    const body = (await response.json()) as Partial<ApiResponseDto<TResponse>>
    return body?.data == null || (Array.isArray(body.errors) && body.errors.length > 0) ? null : body.data
  } catch {
    return null
  }
}

export function useSekhemApi<T>(path: string, fallback: T): T {
  const [data, setData] = useState<T>(fallback)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      const apiData = await fetchSekhemApi<T>(path)
      if (!cancelled && apiData != null) {
        setData(apiData)
      }
    }

    setData(fallback)
    void load()

    return () => {
      cancelled = true
    }
  }, [path])

  return data
}
