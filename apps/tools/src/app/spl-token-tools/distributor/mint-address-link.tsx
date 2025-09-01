export function MintAddressLink({ mintAddress }: { mintAddress: string }) {
  return (
    <a
      href={`https://solscan.io/token/${mintAddress}`}
      target="_blank"
      rel="noopener noreferrer"
      className="border border-transparent font-mono text-xs transition-all duration-200 hover:rounded hover:border-dashed hover:border-cyan-400 hover:bg-cyan-50"
    >
      {mintAddress.slice(0, 4)}&hellip;{mintAddress.slice(-4)}
    </a>
  );
}
