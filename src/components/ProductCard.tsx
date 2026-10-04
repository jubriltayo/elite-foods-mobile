import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatNaira } from '../lib/money';
import { colors, radii, spacing } from '../theme';

interface Props {
  uri: string | null;
  size: number;
  rounded?: number;
}

/**
 * product.imageUrl is null until the shop has real photography, so this is the
 * local placeholder (AGENTS.md rule 10). It never points at a web asset: those
 * live in the web app's public directory and are not loadable from a phone.
 */
export function ProductImage({ uri, size, rounded = radii.md }: Props) {
  if (!uri) {
    return <View style={[styles.placeholder, { width: size, height: size, borderRadius: rounded }]} />;
  }

  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: rounded }} resizeMode="cover" />;
}

export function ProductCard({
  name,
  imageUrl,
  price,
  isAvailable,
  onPress,
}: {
  name: string;
  imageUrl: string | null;
  price: number;
  isAvailable: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={name}
    >
      <ProductImage uri={imageUrl} size={88} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <Text style={[styles.price, !isAvailable && styles.unavailable]}>
          {isAvailable ? `from ${formatNaira(price)}` : 'Unavailable'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  placeholder: {
    backgroundColor: colors.cream,
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
  name: {
    color: colors.charcoal,
    fontSize: 16,
    fontWeight: '600',
  },
  price: {
    color: colors.red,
    fontSize: 14,
    fontWeight: '600',
  },
  unavailable: {
    color: colors.muted,
    fontWeight: '400',
  },
});
