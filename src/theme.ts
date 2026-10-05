/**
 * Brand tokens. White dominant, red primary, cream supporting, mango and coral
 * as accents, charcoal text. No brown tones.
 */

export const colors = {
  white: '#FFFFFF',
  red: '#A81C29',
  redDark: '#8C1622',
  cream: '#FDF5EA',
  mango: '#F7A03C',
  coral: '#F2674A',
  charcoal: '#1C1A1B',
  muted: '#6B6567',
  border: '#ECE7E4',
  /**
   * A border strong enough to read as an edge against white and cream.
   *
   * `border` is the hairline used to separate quiet surfaces; on a control that
   * has to be seen and tapped, a chip outlined in it disappears into the cream.
   * This is 3.3:1 against cream, which is the minimum for a component boundary,
   * and it is lighter than `muted` so it still reads as a quiet edge.
   */
  chipBorder: '#92857D',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;
