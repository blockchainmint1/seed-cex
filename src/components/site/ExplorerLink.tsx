import { getChain, type ChainId } from "@/lib/chains";

/**
 * A block-explorer link for an address. TXC goes to mempool.texitcoin.org,
 * EVM chains to their respective scanner (etherscan / basescan / bscscan).
 */
export function ExplorerLink({
  chain,
  address,
  children,
  className = "",
}: {
  chain: ChainId;
  address: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const def = getChain(chain);
  return (
    <a
      href={`${def.explorer}${address}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`View on ${def.name} explorer`}
      className={`underline decoration-dotted underline-offset-4 transition-colors hover:text-primary ${className}`}
    >
      {children ?? address}
    </a>
  );
}
