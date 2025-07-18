/**
 * Generated by orval v7.8.0 🍺
 * Do not edit manually.
 * Test swagger
 * Testing the Fastify swagger API
 * OpenAPI spec version: 0.1.0
 */
import type {
  Def1,
  GetAirdrops200Item,
  GetAirdropsId200,
  GetAuthChallenge200,
  GetAuthChallenge400,
  GetAuthChallengeParams,
  PostAirdrops201,
  PostAirdropsAirdropIdRetryBatchBatchId200,
  PostAirdropsAirdropIdRetryBatchBatchIdBody,
  PostAirdropsAirdropIdSetLabel200,
  PostAirdropsAirdropIdSetLabelBody,
  PostAirdropsBody,
  PostAirdropsIdStart200,
  PostAirdropsIdStartBodyItem,
  PostAuthRefresh200,
  PostAuthRefresh400,
  PostAuthRefresh401,
  PostAuthRefreshBody,
  PostAuthVerify200,
  PostAuthVerify400,
  PostAuthVerify401,
  PostAuthVerifyBody
} from './solace-sdk.schemas';

import { customFetch } from '../custom-fetch';

export type getAuthChallengeResponse200 = {
  data: GetAuthChallenge200
  status: 200
}

export type getAuthChallengeResponse400 = {
  data: GetAuthChallenge400
  status: 400
}
    
export type getAuthChallengeResponseComposite = getAuthChallengeResponse200 | getAuthChallengeResponse400;
    
export type getAuthChallengeResponse = getAuthChallengeResponseComposite & {
  headers: Headers;
}

export const getGetAuthChallengeUrl = (params: GetAuthChallengeParams,) => {
  const normalizedParams = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : value.toString())
    }
  });

  const stringifiedParams = normalizedParams.toString();

  return stringifiedParams.length > 0 ? `/auth/challenge?${stringifiedParams}` : `/auth/challenge`
}

export const getAuthChallenge = async (params: GetAuthChallengeParams, options?: RequestInit): Promise<getAuthChallengeResponse> => {
  
  return customFetch<getAuthChallengeResponse>(getGetAuthChallengeUrl(params),
  {      
    ...options,
    method: 'GET'
    
    
  }
);}



export type postAuthVerifyResponse200 = {
  data: PostAuthVerify200
  status: 200
}

export type postAuthVerifyResponse400 = {
  data: PostAuthVerify400
  status: 400
}

export type postAuthVerifyResponse401 = {
  data: PostAuthVerify401
  status: 401
}
    
export type postAuthVerifyResponseComposite = postAuthVerifyResponse200 | postAuthVerifyResponse400 | postAuthVerifyResponse401;
    
export type postAuthVerifyResponse = postAuthVerifyResponseComposite & {
  headers: Headers;
}

export const getPostAuthVerifyUrl = () => {


  

  return `/auth/verify`
}

export const postAuthVerify = async (postAuthVerifyBody: PostAuthVerifyBody, options?: RequestInit): Promise<postAuthVerifyResponse> => {
  
  return customFetch<postAuthVerifyResponse>(getPostAuthVerifyUrl(),
  {      
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(
      postAuthVerifyBody,)
  }
);}



export type postAuthRefreshResponse200 = {
  data: PostAuthRefresh200
  status: 200
}

export type postAuthRefreshResponse400 = {
  data: PostAuthRefresh400
  status: 400
}

export type postAuthRefreshResponse401 = {
  data: PostAuthRefresh401
  status: 401
}
    
export type postAuthRefreshResponseComposite = postAuthRefreshResponse200 | postAuthRefreshResponse400 | postAuthRefreshResponse401;
    
export type postAuthRefreshResponse = postAuthRefreshResponseComposite & {
  headers: Headers;
}

export const getPostAuthRefreshUrl = () => {


  

  return `/auth/refresh`
}

export const postAuthRefresh = async (postAuthRefreshBody: PostAuthRefreshBody, options?: RequestInit): Promise<postAuthRefreshResponse> => {
  
  return customFetch<postAuthRefreshResponse>(getPostAuthRefreshUrl(),
  {      
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(
      postAuthRefreshBody,)
  }
);}



export type postAirdropsResponse201 = {
  data: PostAirdrops201
  status: 201
}

export type postAirdropsResponse400 = {
  data: Def1
  status: 400
}
    
export type postAirdropsResponseComposite = postAirdropsResponse201 | postAirdropsResponse400;
    
export type postAirdropsResponse = postAirdropsResponseComposite & {
  headers: Headers;
}

export const getPostAirdropsUrl = () => {


  

  return `/airdrops`
}

export const postAirdrops = async (postAirdropsBody: PostAirdropsBody, options?: RequestInit): Promise<postAirdropsResponse> => {
  
  return customFetch<postAirdropsResponse>(getPostAirdropsUrl(),
  {      
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(
      postAirdropsBody,)
  }
);}



export type getAirdropsResponse200 = {
  data: GetAirdrops200Item[]
  status: 200
}

export type getAirdropsResponse401 = {
  data: Def1
  status: 401
}
    
export type getAirdropsResponseComposite = getAirdropsResponse200 | getAirdropsResponse401;
    
export type getAirdropsResponse = getAirdropsResponseComposite & {
  headers: Headers;
}

export const getGetAirdropsUrl = () => {


  

  return `/airdrops`
}

export const getAirdrops = async ( options?: RequestInit): Promise<getAirdropsResponse> => {
  
  return customFetch<getAirdropsResponse>(getGetAirdropsUrl(),
  {      
    ...options,
    method: 'GET'
    
    
  }
);}



export type deleteAirdropsIdResponse204 = {
  data: unknown
  status: 204
}

export type deleteAirdropsIdResponse400 = {
  data: Def1
  status: 400
}
    
export type deleteAirdropsIdResponseComposite = deleteAirdropsIdResponse204 | deleteAirdropsIdResponse400;
    
export type deleteAirdropsIdResponse = deleteAirdropsIdResponseComposite & {
  headers: Headers;
}

export const getDeleteAirdropsIdUrl = (id: string,) => {


  

  return `/airdrops/${id}`
}

export const deleteAirdropsId = async (id: string, options?: RequestInit): Promise<deleteAirdropsIdResponse> => {
  
  return customFetch<deleteAirdropsIdResponse>(getDeleteAirdropsIdUrl(id),
  {      
    ...options,
    method: 'DELETE'
    
    
  }
);}



export type getAirdropsIdResponse200 = {
  data: GetAirdropsId200
  status: 200
}

export type getAirdropsIdResponse401 = {
  data: Def1
  status: 401
}
    
export type getAirdropsIdResponseComposite = getAirdropsIdResponse200 | getAirdropsIdResponse401;
    
export type getAirdropsIdResponse = getAirdropsIdResponseComposite & {
  headers: Headers;
}

export const getGetAirdropsIdUrl = (id: string,) => {


  

  return `/airdrops/${id}`
}

export const getAirdropsId = async (id: string, options?: RequestInit): Promise<getAirdropsIdResponse> => {
  
  return customFetch<getAirdropsIdResponse>(getGetAirdropsIdUrl(id),
  {      
    ...options,
    method: 'GET'
    
    
  }
);}



export type postAirdropsIdStartResponse200 = {
  data: PostAirdropsIdStart200
  status: 200
}

export type postAirdropsIdStartResponse400 = {
  data: Def1
  status: 400
}
    
export type postAirdropsIdStartResponseComposite = postAirdropsIdStartResponse200 | postAirdropsIdStartResponse400;
    
export type postAirdropsIdStartResponse = postAirdropsIdStartResponseComposite & {
  headers: Headers;
}

export const getPostAirdropsIdStartUrl = (id: string,) => {


  

  return `/airdrops/${id}/start`
}

export const postAirdropsIdStart = async (id: string,
    postAirdropsIdStartBodyItem: PostAirdropsIdStartBodyItem[], options?: RequestInit): Promise<postAirdropsIdStartResponse> => {
  
  return customFetch<postAirdropsIdStartResponse>(getPostAirdropsIdStartUrl(id),
  {      
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(
      postAirdropsIdStartBodyItem,)
  }
);}



export type postAirdropsAirdropIdRetryBatchBatchIdResponse200 = {
  data: PostAirdropsAirdropIdRetryBatchBatchId200
  status: 200
}

export type postAirdropsAirdropIdRetryBatchBatchIdResponse400 = {
  data: Def1
  status: 400
}
    
export type postAirdropsAirdropIdRetryBatchBatchIdResponseComposite = postAirdropsAirdropIdRetryBatchBatchIdResponse200 | postAirdropsAirdropIdRetryBatchBatchIdResponse400;
    
export type postAirdropsAirdropIdRetryBatchBatchIdResponse = postAirdropsAirdropIdRetryBatchBatchIdResponseComposite & {
  headers: Headers;
}

export const getPostAirdropsAirdropIdRetryBatchBatchIdUrl = (airdropId: string,
    batchId: string,) => {


  

  return `/airdrops/${airdropId}/retry-batch/${batchId}`
}

export const postAirdropsAirdropIdRetryBatchBatchId = async (airdropId: string,
    batchId: string,
    postAirdropsAirdropIdRetryBatchBatchIdBody: PostAirdropsAirdropIdRetryBatchBatchIdBody, options?: RequestInit): Promise<postAirdropsAirdropIdRetryBatchBatchIdResponse> => {
  
  return customFetch<postAirdropsAirdropIdRetryBatchBatchIdResponse>(getPostAirdropsAirdropIdRetryBatchBatchIdUrl(airdropId,batchId),
  {      
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(
      postAirdropsAirdropIdRetryBatchBatchIdBody,)
  }
);}



export type postAirdropsAirdropIdSetLabelResponse200 = {
  data: PostAirdropsAirdropIdSetLabel200
  status: 200
}

export type postAirdropsAirdropIdSetLabelResponse400 = {
  data: Def1
  status: 400
}
    
export type postAirdropsAirdropIdSetLabelResponseComposite = postAirdropsAirdropIdSetLabelResponse200 | postAirdropsAirdropIdSetLabelResponse400;
    
export type postAirdropsAirdropIdSetLabelResponse = postAirdropsAirdropIdSetLabelResponseComposite & {
  headers: Headers;
}

export const getPostAirdropsAirdropIdSetLabelUrl = (airdropId: string,) => {


  

  return `/airdrops/${airdropId}/set-label`
}

export const postAirdropsAirdropIdSetLabel = async (airdropId: string,
    postAirdropsAirdropIdSetLabelBody: PostAirdropsAirdropIdSetLabelBody, options?: RequestInit): Promise<postAirdropsAirdropIdSetLabelResponse> => {
  
  return customFetch<postAirdropsAirdropIdSetLabelResponse>(getPostAirdropsAirdropIdSetLabelUrl(airdropId),
  {      
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(
      postAirdropsAirdropIdSetLabelBody,)
  }
);}



export type getHealthResponse200 = {
  data: unknown
  status: 200
}
    
export type getHealthResponseComposite = getHealthResponse200;
    
export type getHealthResponse = getHealthResponseComposite & {
  headers: Headers;
}

export const getGetHealthUrl = () => {


  

  return `/health`
}

export const getHealth = async ( options?: RequestInit): Promise<getHealthResponse> => {
  
  return customFetch<getHealthResponse>(getGetHealthUrl(),
  {      
    ...options,
    method: 'GET'
    
    
  }
);}



