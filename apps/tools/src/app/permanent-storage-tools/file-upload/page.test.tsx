// @vitest-environment happy-dom
import { PublicKey } from "@solana/web3.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, StrictMode, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FileUpload from "./page";

const mocks = vi.hoisted(() => ({
  authenticated: vi.fn(),
  getBalance: vi.fn(),
  getTokenPriceForBytes: vi.fn(),
  upload: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@ardrive/turbo-sdk/web", () => ({
  TurboFactory: { authenticated: mocks.authenticated },
  OnDemandFunding: class {},
}));
vi.mock("@/components", () => ({ notify: mocks.notify }));
vi.mock("@/state/use-network-configuration", () => ({
  useNetworkConfigurationStore: () => ({ network: "mainnet-beta" }),
}));
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => wallet,
  useLocalStorage: (_key: string, initial: unknown) => useState(initial),
}));
vi.mock("@solana/wallet-adapter-react-ui", () => ({
  useWalletModal: () => ({ setVisible: vi.fn() }),
}));
vi.mock("@blastctrl/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled} type={type}>
      {children}
    </button>
  ),
  SpinnerIcon: "span",
  cn: (...classes: string[]) => classes.filter(Boolean).join(" "),
}));
vi.mock("@headlessui/react", () => ({
  Transition: ({ children, show }: { children: ReactNode; show: boolean }) =>
    show ? children : null,
}));
vi.mock("./_components/uploads", () => ({ Uploads: () => null }));

const makeWallet = () => ({
  connected: true,
  publicKey: new PublicKey("11111111111111111111111111111111"),
  signMessage: vi.fn(),
  signTransaction: vi.fn(),
});
let wallet = makeWallet();
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let client: QueryClient;

async function render() {
  await act(async () => {
    root.render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <FileUpload />
        </QueryClientProvider>
      </StrictMode>,
    );
  });
  // React Query schedules observer notifications on the next task.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

async function selectFile() {
  const input = container.querySelector('input[type="file"]')!;
  const file = new File(["upload test"], "test.txt", { type: "text/plain" });
  Object.defineProperty(input, "files", {
    value: { length: 1, item: () => file },
  });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await render();
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  wallet = makeWallet();
  mocks.getBalance.mockResolvedValue({ winc: "1000000000000" });
  mocks.getTokenPriceForBytes.mockResolvedValue({ tokenPrice: "1000" });
  mocks.authenticated.mockImplementation(() => ({
    getBalance: mocks.getBalance,
    getTokenPriceForBytes: mocks.getTokenPriceForBytes,
    upload: mocks.upload,
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
});

describe("file uploader lifecycle", () => {
  it("settles after connecting and preserves the client on wallet context rerenders", async () => {
    await render();
    const initialClients = mocks.authenticated.mock.calls.length;
    expect(mocks.getBalance).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Turbo Credits");

    for (let i = 0; i < 3; i++) {
      wallet = { ...wallet };
      await render();
    }
    expect(mocks.authenticated).toHaveBeenCalledTimes(initialClients);
    expect(mocks.getBalance).toHaveBeenCalledTimes(1);
  });

  it("shows a failed balance request without retrying or rejecting unhandled", async () => {
    mocks.getBalance.mockRejectedValue(new TypeError("Failed to fetch"));
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Unable to load Turbo credits. Failed to fetch",
    );
    await render();
    expect(mocks.getBalance).toHaveBeenCalledTimes(1);
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
  });

  it("removes the uploader on disconnect and creates a client for a new wallet", async () => {
    await render();
    wallet = { ...wallet, connected: false };
    await render();
    expect(container.textContent).toContain("Connect your wallet");
    expect(container.querySelector('input[type="file"]')).toBeNull();

    wallet = {
      ...makeWallet(),
      publicKey: new PublicKey("So11111111111111111111111111111111111111112"),
    };
    await render();
    expect(mocks.getBalance).toHaveBeenCalledTimes(2);
    const options = mocks.authenticated.mock.lastCall?.[0];
    expect(options.walletAdapter.publicKey.toString()).toBe(
      wallet.publicKey.toBase58(),
    );
  });

  it("does not show a previous wallet's balance when its request finishes late", async () => {
    let resolveOldBalance!: (value: { winc: string }) => void;
    mocks.getBalance.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOldBalance = resolve;
        }),
    );
    await render();
    wallet = {
      ...makeWallet(),
      publicKey: new PublicKey("So11111111111111111111111111111111111111112"),
    };
    mocks.getBalance.mockResolvedValue({ winc: "0" });
    await render();
    await act(async () => resolveOldBalance({ winc: "1000000000000" }));
    await render();
    expect(container.textContent).not.toContain("Turbo Credits");
  });

  it("shows client initialization errors without starting balance requests", async () => {
    mocks.authenticated.mockImplementation(() => {
      throw new Error("Wallet cannot sign messages");
    });
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Wallet cannot sign messages",
    );
    expect(mocks.getBalance).not.toHaveBeenCalled();
  });

  it("handles a rejected price estimate without an unhandled rejection", async () => {
    mocks.getTokenPriceForBytes.mockRejectedValue(
      new TypeError("Failed to fetch"),
    );
    await render();
    await selectFile();
    expect(container.textContent).toContain("Unable to load upload price.");
    expect(mocks.getTokenPriceForBytes).toHaveBeenCalledTimes(1);
  });

  it("keeps upload success when the subsequent balance refresh fails", async () => {
    mocks.upload.mockResolvedValue({ id: "test-upload" });
    await render();
    await selectFile();
    mocks.getBalance.mockRejectedValue(new TypeError("Failed to fetch"));
    const upload = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Upload",
    )!;
    await act(async () => upload.click());
    await render();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Upload success", type: "success" }),
    );
    expect(container.textContent).toContain("Unable to load Turbo credits.");
    expect(mocks.getBalance).toHaveBeenCalledTimes(2);
  });
});
