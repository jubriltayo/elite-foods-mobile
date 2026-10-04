/**
 * Money is whole Naira integers (AGENTS.md rule 3). No floats, ever.
 *
 * This module only formats. Nothing here computes a price, a subtotal or a
 * total: those all come from the server and are displayed as returned.
 */

const nairaFormatter = new Intl.NumberFormat('en-NG', {
  maximumFractionDigits: 0,
});

/** Formats a whole Naira integer for display, e.g. 1250 -> "₦1,250". */
export function formatNaira(amount: number): string {
  return `₦${nairaFormatter.format(Math.round(amount))}`;
}

/**
 * Narrows an API value to a displayable whole Naira integer.
 *
 * Guards against a float or a string reaching a Naira symbol, which would be a
 * money bug rather than a cosmetic one.
 */
export function asNaira(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.round(value);
}
