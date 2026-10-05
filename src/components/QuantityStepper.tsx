import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MAX_QUANTITY } from '../lib/cartApi';
import { colors, radii, spacing } from '../theme';

interface Props {
  quantity: number;
  onChange: (next: number) => void;
  /** Disables both buttons while a request is in flight, so taps cannot double up. */
  disabled?: boolean;
  compact?: boolean;
}

/**
 * A quantity control bounded to the server's 1..100 range.
 *
 * The bound is applied here rather than letting a bad value reach the API, since
 * the server would reject it and the customer would see an error for tapping a
 * plus button.
 */
export function QuantityStepper({ quantity, onChange, disabled = false, compact = false }: Props) {
  const canDecrease = !disabled && quantity > 1;
  const canIncrease = !disabled && quantity < MAX_QUANTITY;

  const size = compact ? 30 : 38;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => canDecrease && onChange(quantity - 1)}
        disabled={!canDecrease}
        style={[styles.button, { width: size, height: size }, !canDecrease && styles.buttonDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
      >
        <Text style={styles.symbol}>−</Text>
      </Pressable>

      <Text style={[styles.quantity, compact && styles.quantityCompact]} accessibilityLabel={`Quantity ${quantity}`}>
        {quantity}
      </Text>

      <Pressable
        onPress={() => canIncrease && onChange(quantity + 1)}
        disabled={!canIncrease}
        style={[styles.button, { width: size, height: size }, !canIncrease && styles.buttonDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
      >
        <Text style={styles.symbol}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  symbol: {
    fontSize: 18,
    lineHeight: 20,
    color: colors.charcoal,
  },
  quantity: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: colors.charcoal,
  },
  quantityCompact: {
    fontSize: 14,
  },
});
