import type { SolaceRequestInit } from './custom-fetch'
import * as api from './generated/solace-sdk'

export * from './generated/solace-sdk.schemas'
export type { SolaceRequestInit, SolaceResponse } from './custom-fetch'

export type SolaceApi = typeof api

export type SolaceSDK = {
  api: SolaceApi
}

/**
 * Binds the generated client to a base URL and default headers.
 *
 * Every call returns an independent instance: nothing is kept in module
 * state, so two instances (say, before and after signing in) or two server
 * renders never see each other's headers. Per-call options still win over
 * the defaults, header by header.
 */
export default function build (
  baseUrl: string,
  defaultHeaders?: HeadersInit
): SolaceSDK {
  const defaults: SolaceRequestInit = {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    headers: defaultHeaders
  }
  const bound = Object.fromEntries(
    Object.entries(api).map(([name, value]) => [
      name,
      isRequestFunction(name, value) ? withDefaults(value, defaults) : value
    ])
  ) as SolaceApi
  return { api: bound }
}

type AnyFunction = (...args: unknown[]) => unknown

/** Orval emits a `get…Url` helper next to each request function; only the latter take options. */
const isRequestFunction = (name: string, value: unknown): value is AnyFunction =>
  typeof value === 'function' && !/^get.*Url$/.test(name)

/** Orval declares `options?: RequestInit` as the last parameter of every request function. */
function withDefaults<F extends AnyFunction> (fn: F, defaults: SolaceRequestInit): F {
  const optionsIndex = fn.length - 1
  return ((...args: unknown[]) => {
    const options = (args[optionsIndex] ?? {}) as SolaceRequestInit
    args[optionsIndex] = {
      ...defaults,
      ...options,
      headers: mergeHeaders(defaults.headers, options.headers)
    }
    return fn(...args)
  }) as F
}

function mergeHeaders (...sources: Array<HeadersInit | undefined>): Headers {
  const merged = new Headers()
  for (const source of sources) {
    new Headers(source).forEach((value, key) => merged.set(key, value))
  }
  return merged
}
