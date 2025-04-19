import { setBaseUrl, setDefaultHeaders } from './custom-fetch.js'
import * as api from './generated/solace-sdk'

export * from './generated/solace-sdk.schemas'

export type SolaceSDK = {
  api: typeof api
}

export default function build (
  baseUrl: string,
  defaultHeaders?: RequestInit['headers']
): SolaceSDK {
  setBaseUrl(baseUrl)
  if (defaultHeaders) {
    setDefaultHeaders(defaultHeaders)
  }

  return { api }
}
