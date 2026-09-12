import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";
export function normalizeAddress(value: string): string | undefined {
  if (!isIP(value) || value.includes("%")) return undefined;
  if (isIP(value) === 4) return value;
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(canonical);
  if (mapped) {
    const high = parseInt(mapped[1], 16),
      low = parseInt(mapped[2], 16);
    return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
  }
  return canonical;
}
export function clientAddress(
  req: IncomingMessage,
  trusted: readonly string[],
) {
  const address = normalizeAddress(req.socket.remoteAddress || "") || "unknown";
  const real = req.headers["x-real-ip"];
  return trusted.some((v) => normalizeAddress(v) === address) &&
    typeof real === "string"
    ? normalizeAddress(real) || address
    : address;
}
