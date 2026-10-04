import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { ErrorState, LoadingState } from '../../src/components/States';
import { ProductImage } from '../../src/components/ProductCard';
import { getProduct } from '../../src/lib/catalog';
import { useResource } from '../../src/lib/useResource';
import { asNaira, formatNaira } from '../../src/lib/money';
import { colors, radii, spacing } from '../../src/theme';

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const product = useResource(() => (slug ? getProduct(slug) : Promise.reject(new Error('missing slug'))), slug ?? '');

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: product.data?.name ?? 'Product' }} />
      {product.loading ? (
        <LoadingState />
      ) : product.error || !product.data ? (
        <ErrorState message={product.error ?? 'We could not find that product.'} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <ProductImage uri={product.data.imageUrl} size={220} rounded={radii.lg} />

          <View style={styles.header}>
            <Text style={styles.name}>{product.data.name}</Text>
            <Text style={styles.price}>from {formatNaira(asNaira(product.data.startingPrice))}</Text>
          </View>

          {!product.data.isAvailable ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>Currently unavailable</Text>
            </View>
          ) : null}

          {product.data.description ? <Text style={styles.description}>{product.data.description}</Text> : null}

          <Text style={styles.sectionTitle}>Choose a size</Text>
          <View style={styles.variants}>
            {product.data.variants.map((variant) => (
              <View key={variant.id} style={styles.variant}>
                <Text style={styles.variantLabel}>{variant.label}</Text>
                <Text style={styles.variantPrice}>{formatNaira(asNaira(variant.price))}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.charcoal,
  },
  price: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.red,
  },
  notice: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.coral,
    padding: spacing.md,
  },
  noticeText: {
    color: colors.coral,
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.charcoal,
  },
  variants: {
    gap: spacing.sm,
  },
  variant: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  variantLabel: {
    fontSize: 15,
    color: colors.charcoal,
  },
  variantPrice: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.charcoal,
  },
});
