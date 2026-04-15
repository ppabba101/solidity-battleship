import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Tooltip } from "./ui/tooltip";
import { cn } from "../lib/utils";

interface FundWalletPanelProps {
  address: `0x${string}` | null;
  balanceWei: bigint | null;
  minRequiredWei?: bigint;
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatEth(wei: bigint): string {
  // 1 ETH = 1e18 wei; show 4 decimal places
  const divisor = 10n ** 18n;
  const whole = wei / divisor;
  const remainder = wei % divisor;
  // take 4 decimal digits
  const decimals = (remainder * 10000n) / divisor;
  const decStr = decimals.toString().padStart(4, "0");
  return `${whole}.${decStr} ETH`;
}

const FAUCETS = [
  {
    label: "Coinbase CDP Faucet",
    url: "https://portal.cdp.coinbase.com/products/faucet?projectId=base-sepolia",
  },
  {
    label: "Alchemy Base Sepolia",
    url: "https://www.alchemy.com/faucets/base-sepolia",
  },
  {
    label: "QuickNode Base Sepolia",
    url: "https://faucet.quicknode.com/base/sepolia",
  },
];

const FundWalletPanel: React.FC<FundWalletPanelProps> = ({
  address,
  balanceWei,
  minRequiredWei,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(() => {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [address]);

  const isInsufficient =
    balanceWei !== null &&
    minRequiredWei !== undefined &&
    balanceWei < minRequiredWei;

  return (
    <Card data-testid="fund-wallet-panel" className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span>Fund Your Wallet</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* QR Code */}
        {address ? (
          <div className="flex justify-center">
            <div className="rounded-lg bg-white p-2">
              <QRCodeSVG value={address} size={140} />
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-[156px] h-[156px] rounded-lg bg-slate-700 animate-pulse" />
          </div>
        )}

        {/* Address */}
        <div className="flex items-center justify-center gap-2">
          <Tooltip content={address ?? "No address"}>
            <button
              data-testid="fund-wallet-address"
              onClick={handleCopy}
              className={cn(
                "font-mono text-sm text-slate-200 hover:text-white transition-colors cursor-pointer",
                "bg-slate-800 rounded px-2 py-1 border border-slate-600 hover:border-slate-400",
              )}
              title={address ?? undefined}
            >
              {address ? truncateAddress(address) : "—"}
            </button>
          </Tooltip>
          <span className="text-xs text-slate-400">
            {copied ? "Copied!" : "click to copy"}
          </span>
        </div>

        {/* Balance */}
        <div
          data-testid="fund-wallet-balance"
          className="text-center text-sm text-slate-300"
        >
          Balance:{" "}
          <span className="font-semibold text-white">
            {balanceWei !== null ? formatEth(balanceWei) : "—"}
          </span>
        </div>

        {/* Insufficient funds warning */}
        {isInsufficient && (
          <div
            data-testid="fund-wallet-warning"
            className="rounded-md bg-red-900/50 border border-red-700 px-3 py-2 text-sm text-red-300 text-center"
          >
            Insufficient funds — use a faucet below to top up.
          </div>
        )}

        {/* Faucet links */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Get testnet ETH
          </p>
          {FAUCETS.map((f) => (
            <Button
              key={f.url}
              variant="outline"
              size="sm"
              className="w-full justify-start text-xs"
              asChild
            >
              <a href={f.url} target="_blank" rel="noopener noreferrer">
                {f.label} ↗
              </a>
            </Button>
          ))}
        </div>

        {/* Info blurb */}
        <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-700 pt-3">
          <span className="font-medium text-slate-400">What&apos;s this?</span>{" "}
          Base Sepolia is Ethereum&apos;s Base testnet. The ETH is from a free
          faucet, not real money. You need some for gas + your stake.
        </p>
      </CardContent>
    </Card>
  );
};

export { FundWalletPanel };
