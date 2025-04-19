let baseUrl: string
let defaultHeaders: RequestInit['headers'] = {}

function sanitizeUrl (url: string) {
  if (url.endsWith('/')) { return url.slice(0, -1) } else { return url }
}

export const setBaseUrl = (url: string) => {
  baseUrl = sanitizeUrl(url)
}

export const setDefaultHeaders = (headers: RequestInit['headers']) => {
  defaultHeaders = headers
}

export const customFetch = async <T>(
  url: string,
  options: RequestInit
): Promise<T> => {
  const requestUrl = `${baseUrl}${url}`
  const requestHeaders = {
    ...defaultHeaders,
    ...options.headers
  }

  const requestInit: RequestInit = {
    ...options,
    headers: requestHeaders,
  }

  const response = await fetch(requestUrl, requestInit)

  // if (!response.ok) {
  //   // TODO: we need to check contentType here AND set it correctly in the backend too!
    
  //   throw Error(await response.json())
  // }

  let data
  const contentType = response.headers.get('content-type')

  if (contentType?.includes('application/json')) {
    data = await response.json()
  } else {
    data = await response.text()
  }

  return { data, status: response.status, headers: response.headers } as T
}
