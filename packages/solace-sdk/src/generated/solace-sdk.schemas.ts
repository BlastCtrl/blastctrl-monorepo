/**
 * Generated by orval v7.8.0 🍺
 * Do not edit manually.
 * Test swagger
 * Testing the Fastify swagger API
 * OpenAPI spec version: 0.1.0
 */
export interface Def0 {
  /**
   * Bearer token. Format: Bearer <token>
   * @pattern ^Bearer [A-Za-z0-9-_=]+.[A-Za-z0-9-_=]+.[A-Za-z0-9-_.+/=]*$
   */
  authorization?: string;
}

export interface Def1 {
  error: string;
  message: string;
  statusCode: number;
}

export type GetAuthChallengeParams = {
address: string;
};

export type GetAuthChallenge200 = {
  message: string;
};

export type GetAuthChallenge400 = {
  error?: string;
  message?: string;
  statusCode?: number;
};

export type PostAuthVerifyBody = {
  address: string;
  signature: string;
};

export type PostAuthVerify200 = {
  token: string;
  expiresAt: number;
  refreshToken: string;
};

export type PostAuthVerify400 = {
  error: string;
  message: string;
  statusCode: number;
};

export type PostAuthVerify401 = {
  error: string;
  message: string;
  statusCode: number;
};

export type PostAuthRefreshBody = {
  address: string;
  refreshToken: string;
};

export type PostAuthRefresh200 = {
  token: string;
  expiresAt: number;
  refreshToken: string;
};

export type PostAuthRefresh400 = {
  error: string;
  message: string;
  statusCode: number;
};

export type PostAuthRefresh401 = {
  error: string;
  message: string;
  statusCode: number;
};

export type PostAirdropsBodyBatchesItemItem = {
  address: string;
  /** @minimum 1 */
  lamports: number;
};

export type PostAirdropsBody = {
  /**
   * @minItems 1
   * @maxItems 100
   */
  batches: PostAirdropsBodyBatchesItemItem[][];
};

export type PostAirdrops201Status = typeof PostAirdrops201Status[keyof typeof PostAirdrops201Status];


// eslint-disable-next-line @typescript-eslint/no-redeclare
export const PostAirdrops201Status = {
  created: 'created',
} as const;

export type PostAirdrops201 = {
  id?: string;
  status?: PostAirdrops201Status;
};

export type GetAirdrops200ItemStatus = typeof GetAirdrops200ItemStatus[keyof typeof GetAirdrops200ItemStatus];


// eslint-disable-next-line @typescript-eslint/no-redeclare
export const GetAirdrops200ItemStatus = {
  created: 'created',
  processing: 'processing',
  completed: 'completed',
  failed: 'failed',
} as const;

export type GetAirdrops200ItemRecipientsItem = {
  address: string;
  lamports: number;
};

export type GetAirdrops200Item = {
  id: string;
  totalAmount: number;
  recipientCount: number;
  status: GetAirdrops200ItemStatus;
  label: string;
  createdAt: number;
  updatedAt: number;
  recipients: GetAirdrops200ItemRecipientsItem[];
};

export type GetAirdropsId200Status = typeof GetAirdropsId200Status[keyof typeof GetAirdropsId200Status];


// eslint-disable-next-line @typescript-eslint/no-redeclare
export const GetAirdropsId200Status = {
  created: 'created',
  processing: 'processing',
  completed: 'completed',
  failed: 'failed',
} as const;

export type GetAirdropsId200TransactionsItemStatus = typeof GetAirdropsId200TransactionsItemStatus[keyof typeof GetAirdropsId200TransactionsItemStatus];


// eslint-disable-next-line @typescript-eslint/no-redeclare
export const GetAirdropsId200TransactionsItemStatus = {
  pending: 'pending',
  confirming: 'confirming',
  confirmed: 'confirmed',
  failed: 'failed',
  expired: 'expired',
} as const;

export type GetAirdropsId200TransactionsItemRecipientsItem = {
  address: string;
  lamports: number;
};

export type GetAirdropsId200TransactionsItem = {
  id: number;
  status: GetAirdropsId200TransactionsItemStatus;
  createdAt: number;
  updatedAt: number;
  retryCount: number;
  /** @nullable */
  signature: string | null;
  /** @nullable */
  bullJobId: string | null;
  /** @nullable */
  errorMessage: string | null;
  recipients: GetAirdropsId200TransactionsItemRecipientsItem[];
};

export type GetAirdropsId200 = {
  id: string;
  status: GetAirdropsId200Status;
  recipientCount: number;
  totalAmount: number;
  label: string;
  createdAt: number;
  updatedAt: number;
  transactions: GetAirdropsId200TransactionsItem[];
};

export type PostAirdropsIdStartBodyItem = {
  batchId: number;
  blockhash: string;
  /** @minimum 1 */
  lastValidBlockHeight: number;
  /** @minimum 1 */
  minContextSlot: number;
  txBase64: string;
};

export type PostAirdropsIdStart200Status = typeof PostAirdropsIdStart200Status[keyof typeof PostAirdropsIdStart200Status];


// eslint-disable-next-line @typescript-eslint/no-redeclare
export const PostAirdropsIdStart200Status = {
  processing: 'processing',
} as const;

export type PostAirdropsIdStart200JobsItem = {
  id?: number;
  jobId?: string;
};

export type PostAirdropsIdStart200 = {
  id?: string;
  status?: PostAirdropsIdStart200Status;
  message?: string;
  jobs?: PostAirdropsIdStart200JobsItem[];
};

export type PostAirdropsAirdropIdRetryBatchBatchIdBody = {
  blockhash?: string;
  /** @minimum 0 */
  lastValidBlockHeight?: number;
  /** @minimum 0 */
  minContextSlot?: number;
  txBase64?: string;
};

export type PostAirdropsAirdropIdRetryBatchBatchId200 = {
  success: boolean;
};

export type PostAirdropsAirdropIdSetLabelBody = {
  /** @maxLength 16 */
  label: string;
};

export type PostAirdropsAirdropIdSetLabel200 = {
  success: boolean;
};

