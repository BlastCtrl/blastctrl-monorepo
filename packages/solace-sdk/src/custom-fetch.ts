/**
 * Options every generated request function accepts as its last argument.
 * `build()` fills in `baseUrl` and the default headers per instance; callers
 * can add anything from `RequestInit`, typically an `AbortSignal`.
 */
export type SolaceRequestInit = RequestInit & {
  /** Prefixed to the generated path. Empty means same-origin absolute paths. */
  baseUrl?: string
}

/** What every request resolves to; the generated types narrow `data` by `status`. */
export type SolaceResponse<T> = {
  data: T
  status: number
  headers: Headers
}

/**
 * Orval's mutator: performs the request and returns `{ data, status, headers }`
 * for every status code, so the generated response unions apply. Only network
 * failures throw.
 */
export const customFetch = async <T>(
  url: string,
  { baseUrl = '', headers, ...init }: SolaceRequestInit
): Promise<T> => {
  const response = await fetch(`${baseUrl}${url}`, {
    ...init,
    headers: new Headers(headers)
  })
  return {
    data: await readBody(response),
    status: response.status,
    headers: response.headers
  } as T
}

async function readBody (response: Response): Promise<unknown> {
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined
  }
  const contentType = response.headers.get('content-type') ?? ''
  return contentType.includes('application/json')
    ? response.json()
    : response.text()
}
