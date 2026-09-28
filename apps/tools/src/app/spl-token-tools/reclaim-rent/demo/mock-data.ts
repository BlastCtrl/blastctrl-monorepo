import type { ReclaimableAccount } from "../_components/types";

// Live rate at step 2: 5080 lamports per byte, 6960 originally.
const RATE = 5080;
const ORIGINAL = 6960;
const minimum = (size: number) => (128 + size) * RATE;
const excess = (size: number) => (128 + size) * (ORIGINAL - RATE);

// Deterministic, address-shaped strings so the demo looks the same on reload.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function fakeAddress(seed: number) {
  let x = seed * 2654435761 + 12345;
  let out = "";
  for (let i = 0; i < 44; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out += ALPHABET[x % ALPHABET.length];
  }
  return out;
}

type Seed = {
  symbol: string;
  name: string;
  balance: string;
  size?: number;
  program?: "token" | "token-2022";
};

const TOKENS: Seed[] = [
  { symbol: "USDC", name: "USD Coin", balance: "1,240.51" },
  { symbol: "JUP", name: "Jupiter", balance: "3,150" },
  { symbol: "BONK", name: "Bonk", balance: "48,200,000" },
  { symbol: "WIF", name: "dogwifhat", balance: "212.4" },
  { symbol: "PYTH", name: "Pyth Network", balance: "980" },
  { symbol: "JTO", name: "Jito", balance: "0" },
  { symbol: "RAY", name: "Raydium", balance: "56.2" },
  { symbol: "ORCA", name: "Orca", balance: "0" },
  { symbol: "mSOL", name: "Marinade staked SOL", balance: "4.207" },
  { symbol: "jitoSOL", name: "Jito Staked SOL", balance: "1.5" },
  { symbol: "W", name: "Wormhole", balance: "0" },
  { symbol: "RENDER", name: "Render", balance: "30" },
  { symbol: "HNT", name: "Helium", balance: "0" },
  { symbol: "TNSR", name: "Tensor", balance: "410" },
  { symbol: "KMNO", name: "Kamino", balance: "2,000", size: 170 },
  {
    symbol: "PYUSD",
    name: "PayPal USD",
    balance: "75",
    size: 187,
    program: "token-2022",
  },
];

export const MOCK_TOKEN_ACCOUNTS: ReclaimableAccount[] = TOKENS.map((t, i) => {
  const size = t.size ?? 165;
  const address = fakeAddress(i + 1);
  return {
    id: address,
    kind: "token-account",
    address,
    mint: fakeAddress(100 + i),
    symbol: t.symbol,
    name: t.name,
    program: t.program ?? "token",
    tokenBalance: t.balance,
    isEmpty: t.balance === "0",
    dataLength: size,
    lamports: minimum(size) + excess(size),
    minimum: minimum(size),
  };
});

export const MOCK_MINTS: ReclaimableAccount[] = [
  { symbol: "BLST", name: "Blast Points" },
  { symbol: "CTRL", name: "Control Token", program: "token-2022" as const },
].map((m, i) => {
  const address = fakeAddress(200 + i);
  return {
    id: `mint-${address}`,
    kind: "mint",
    address,
    mint: address,
    symbol: m.symbol,
    name: m.name,
    program: m.program ?? "token",
    tokenBalance: "0",
    isEmpty: false,
    dataLength: 82,
    lamports: minimum(82) + excess(82),
    minimum: minimum(82),
  };
});

/** Token accounts the scan found already sitting at the minimum. */
export const MOCK_AT_MINIMUM = 1;

export const MOCK_WALLET = "HUTXit9WwTz1X3DTgccHt27LJmi43TF17Tb3ZNM2amZ1";
