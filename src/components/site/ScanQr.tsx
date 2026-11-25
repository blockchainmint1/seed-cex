import { QRCodeSVG } from "qrcode.react";

/**
 * Every scannable QR on Seeds. Always dark squares on a light card with a quiet border, in both
 * themes: many phone scanners (HME Wallet on iPhone included) can't read light-on-dark codes.
 * Colors come from the --qr / --qr-foreground tokens, which stay dark-on-light in both themes.
 */
const QR_DARK = "var(--qr-foreground)";
const QR_LIGHT = "var(--qr)";

export function ScanQr({ value, size = 168, className, ...rest }: { value: string; size?: number; className?: string; "aria-label"?: string }) {
  return (
    <span className={`inline-block rounded-md ${className ?? ""}`} style={{ background: QR_LIGHT, lineHeight: 0 }}>
      <QRCodeSVG value={value} size={size} bgColor={QR_LIGHT} fgColor={QR_DARK} marginSize={3} level="M" {...rest} />
    </span>
  );
}
