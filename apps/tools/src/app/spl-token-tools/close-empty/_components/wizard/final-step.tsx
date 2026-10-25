import { ownerAssetsKey } from "@/state/queries/use-owner-assets";
import { Button } from "@blastctrl/ui/button";
import { Dialog } from "@headlessui/react";
import { useConnector } from "@solana/connector/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCloseAccountsStore } from "./wizard-context";

export const FinalStep = () => {
  const queryClient = useQueryClient();
  const { account } = useConnector();
  const closeDialog = useCloseAccountsStore((store) => store.closeDialog);
  const simulatedAccounts = useCloseAccountsStore(
    (store) => store.simulatedAccounts,
  );
  const closedAccounts = useCloseAccountsStore((store) => store.closedAccounts);
  const error = useCloseAccountsStore((store) => store.error);

  const handleCloseDialog = async () => {
    if (!account) {
      closeDialog();
      return;
    }
    queryClient.setQueryData(ownerAssetsKey(account), undefined);
    // small delay
    void queryClient.fetchQuery({ queryKey: ownerAssetsKey(account) });
    closeDialog();
  };

  if (error) {
    return (
      <>
        <Dialog.Description className="space-y-1 text-zinc-500">
          <span className="block">
            <strong className="text-blue-500">{closedAccounts.length}</strong>{" "}
            accounts were closed out of{" "}
            <strong className="text-blue-500">
              {simulatedAccounts.length}
            </strong>{" "}
            that succesfully simulated. Check the error message below for the
            cause of the error.
          </span>
          <code className="block w-full max-w-full overflow-x-auto p-1 text-xs shadow-xs">
            {String(error)}
          </code>
        </Dialog.Description>
        <div className="mt-auto flex items-center justify-end gap-2">
          <Button onClick={handleCloseDialog}>Finish</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Dialog.Description className="space-y-1 text-zinc-500">
        <span className="block">
          <strong className="text-blue-500">{closedAccounts.length}</strong>{" "}
          token accounts were succesfully closed.
        </span>
      </Dialog.Description>
      <div className="mt-auto flex items-center justify-end gap-2">
        <Button onClick={handleCloseDialog}>Finish</Button>
      </div>
    </>
  );
};
