import {
  getSignatureFromTransaction,
  getSolanaErrorFromTransactionError,
  sendTransactionWithoutConfirmingFactory,
  commitmentComparator,
  type Rpc,
  type RpcSubscriptions,
  type SendableTransaction,
  type Slot,
  type Transaction,
  type TransactionWithBlockhashLifetime,
  type GetEpochInfoApi,
  type GetSignatureStatusesApi,
  type SendTransactionApi,
  type SignatureNotificationsApi,
  type SlotNotificationsApi,
  safeRace,
} from "@solana/kit";
import {
  createBlockHeightExceedencePromiseFactory,
  waitForRecentTransactionConfirmation,
} from "@solana/transaction-confirmation";

type SendAndConfirmConfig = Parameters<
  ReturnType<typeof sendTransactionWithoutConfirmingFactory>
>[1];

export function sendAndConfirmWithSlotFactory({
  rpc,
  rpcSubscriptions,
}: {
  rpc: Rpc<GetEpochInfoApi & GetSignatureStatusesApi & SendTransactionApi>;
  rpcSubscriptions: RpcSubscriptions<
    SignatureNotificationsApi & SlotNotificationsApi
  >;
}) {
  const sendTransaction = sendTransactionWithoutConfirmingFactory({ rpc });
  const getBlockHeightExceedencePromise =
    createBlockHeightExceedencePromiseFactory({ rpc, rpcSubscriptions });

  return async function sendAndConfirmWithSlot(
    transaction: SendableTransaction &
      Transaction &
      TransactionWithBlockhashLifetime,
    config: SendAndConfirmConfig,
  ) {
    await sendTransaction(transaction, config);
    const { commitment, abortSignal } = config;
    const signature = getSignatureFromTransaction(transaction);
    let confirmedSlot: Slot | undefined;

    await waitForRecentTransactionConfirmation({
      abortSignal,
      commitment,
      transaction,
      getBlockHeightExceedencePromise,
      async getRecentSignatureConfirmationPromise({
        abortSignal,
        commitment,
        signature,
      }) {
        const ac = new AbortController();
        abortSignal.addEventListener("abort", () => ac.abort(), {
          signal: ac.signal,
        });
        const notifications = await rpcSubscriptions
          .signatureNotifications(signature, { commitment })
          .subscribe({ abortSignal: ac.signal });
        const viaSubscription = (async () => {
          for await (const n of notifications) {
            if (n.value.err)
              throw getSolanaErrorFromTransactionError(n.value.err);
            confirmedSlot = n.context.slot;
            return;
          }
        })();
        const viaStatusCache = (async () => {
          const {
            value: [s],
          } = await rpc
            .getSignatureStatuses([signature])
            .send({ abortSignal: ac.signal });
          if (s?.err) throw getSolanaErrorFromTransactionError(s.err);
          if (
            s?.confirmationStatus &&
            commitmentComparator(s.confirmationStatus, commitment) >= 0
          ) {
            confirmedSlot = s.slot;
            return;
          }
          await new Promise(() => {});
        })();
        try {
          await safeRace([viaSubscription, viaStatusCache]);
        } finally {
          ac.abort();
        }
      },
    });

    return { signature, slot: confirmedSlot! };
  };
}
