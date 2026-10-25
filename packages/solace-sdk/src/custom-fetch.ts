/** The backend's error body (`def-0` in the schema). */
type ErrorBody = { error: string, message?: string, statusCode: number }

const isErrorBody = (body: unknown): body is ErrorBody =>
  typeof body === 'object' &&
  body !== null &&
  'error' in body &&
  'statusCode' in body

/** A non-2xx response. `error` is the backend's error code, e.g. `FST_AUTHENTICATION_ERROR`. */
export class SolaceApiError extends Error {
  readonly status: number
  readonly error: string

  constructor (status: number, error: string, message: string) {
    super(message)
    this.name = 'SolaceApiError'
    this.status = status
    this.error = error
  }

  /** From the backend's JSON error body, or from whatever a proxy sent instead. */
  static async fromResponse (response: Response): Promise<SolaceApiError> {
    const body = await readBody(response)
    if (isErrorBody(body)) {
      return new SolaceApiError(response.status, body.error, body.message ?? '')
    }
    const text = typeof body === 'string' ? body.trim().slice(0, 200) : ''
    return new SolaceApiError(
      response.status,
      `HTTP ${response.status}`,
      text || `Request failed with status ${response.status}`
    )
  }
}

/**
 * Orval's mutator. Resolves to the parsed body of a 2xx response and throws
 * {@link SolaceApiError} for anything else, so the generated functions return
 * their success type and callers never check `status` by hand.
 */
export const customFetch = async <T>(
  url: string,
  init: RequestInit
): Promise<T> => {
  const response = await fetch(url, init)
  if (!response.ok) throw await SolaceApiError.fromResponse(response)
  return (await readBody(response)) as T
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
