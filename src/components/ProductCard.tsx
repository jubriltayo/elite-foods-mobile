import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatNaira } from '../lib/money';
import { colors, radii, spacing } from '../theme';

interface Props {
  slug: string;
  name: string;
  imageUrl: string | null;
  price: number;
  isAvailable: boolean;
  onPress: () => void;
}

/**
 * A product in the shop grid.
 *
 * `ProductImage` is rendered by the caller so the image treatment stays in one
 * place; this component owns the text and the tap target.
 */
export function ProductCard({ name, price, isAvailable, image, onPress }: Omit<Props, 'slug' | 'imageUrl'> & { image: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={isAvailable ? name : `${name}, unavailable`}
    >
      <View style={styles.image}>{image}</View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <Text style={[styles.price, !isAvailable && styles.priceMuted]}>
          {isAvailable ? `from ${formatNaira(price)}` : 'Unavailable'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.75,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.cream,
  },
  body: {
    padding: spacing.md,
    gap: 2,
  },
  name: {
    color: colors.charcoal,
    fontSize: 15,
    fontWeight: '500',
  },
  price: {
    color: colors.red,
    fontSize: 14,
    fontWeight: '600',
  },
  priceMuted: {
    color: colors.muted,
    fontWeight: '400',
  },
});
