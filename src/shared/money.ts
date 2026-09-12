/** Every regular game-money value is an integer number of euro cents. */
export const MAX_CENTS = 9_000_000_000_000_000;
export const LEGACY_CREDIT_CENTS = 1_000;
export function checkedCents(value: number, signed = false): number {
  if (
    !Number.isSafeInteger(value) ||
    Math.abs(value) > MAX_CENTS ||
    (!signed && value < 0)
  )
    throw Error("Eurobetrag außerhalb des sicheren Centbereichs.");
  return value;
}
/** Constants only: fractional euros must be expressed as explicit integer cents. */
export function euro(wholeEuros: number): number {
  if (!Number.isSafeInteger(wholeEuros))
    throw Error("Ganze Euro für diese Preisdefinition erforderlich.");
  return checkedCents(Number(BigInt(wholeEuros) * 100n), true);
}
export function sumCents(values: Iterable<number>): number {
  let total = 0n;
  for (const value of values) total += BigInt(checkedCents(value, true));
  return checkedCents(Number(total), true);
}
/** Exact rational pricing/reimbursement, rounded down once at the final cent. */
export function mulRatio(
  cents: number,
  numerator: number,
  denominator: number,
): number {
  checkedCents(cents, true);
  if (
    !Number.isSafeInteger(numerator) ||
    numerator < 0 ||
    !Number.isSafeInteger(denominator) ||
    denominator < 1
  )
    throw Error("Ungültiger Euro-Berechnungsfaktor.");
  const product = BigInt(cents) * BigInt(numerator),
    divisor = BigInt(denominator);
  const result =
    product / divisor - (product < 0n && product % divisor ? 1n : 0n);
  return checkedCents(Number(result), true);
}
const eur = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
/** Do not divide a large Number by 100: that can round away its last cent. */
export function formatMoney(cents: number): string {
  checkedCents(cents, true);
  const absolute = BigInt(cents < 0 ? -cents : cents),
    fraction = String(absolute % 100n).padStart(2, "0");
  return (
    (cents < 0 ? "-" : "") +
    eur
      .formatToParts(absolute / 100n)
      .map((part) => (part.type === "fraction" ? fraction : part.value))
      .join("")
  );
}
