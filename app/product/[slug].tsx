import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { ErrorState, LoadingState } from '../../src/components/States';
import { ProductImage } from '../../src/components/ProductImage';
import { QuantityStepper } from '../../src/components/QuantityStepper';
import { useCart } from '../../src/lib/cart';
import { getProduct } from '../../src/lib/catalog';
import { useResource } from '../../src/lib/useResource';
import { asNaira, formatNaira } from '../../src/lib/money';
import { useSession } from '../../src/lib/session';
import { colors, radii, spacing } from '../../src/theme';

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { status } = useSession();
  const { addVariant, busy, error, clearError } = useCart();

  const product = useResource(() => (slug ? getProduct(slug) : Promise.reject(new Error('missing slug'))), slug ?? '');

  // The first variant is preselected so the common case is one tap. Selection is
  // derived during render rather than synced by an effect: if the stored id is
  // not in the list, the fallback is used and nothing needs reconciling.
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const variants = product.data?.variants;
  const selected = variants?.find((variant) => variant.id === variantId) ?? variants?.[0] ?? null;
  const unavailable = product.data ? !product.data.isAvailable : false;

  // Clear the "added" confirmation after a moment rather than leaving stale
  // feedback on screen.
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 2500);
    return () => clearTimeout(timer);
  }, [added]);

  const onAdd = async () => {
    if (!selected) return;

    // The cart requires an account. Send them to sign in and return them here
    // afterwards, so they do not lose the product they were looking at.
    if (status !== 'signed-in') {
      router.push({ pathname: '/sign-in', params: { returnTo: `/product/${product.data?.slug ?? slug}` } });
      return;
    }

    clearError();
    await addVariant(selected.id, quantity);
    setAdded(true);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: product.data?.name ?? 'Product' }} />
      {product.loading ? (
        <LoadingState />
      ) : product.error || !product.data ? (
        <ErrorState message={product.error ?? 'We could not find that product.'} />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <ProductImage slug={product.data.slug} imageUrl={product.data.imageUrl} size={220} rounded={radii.lg} />

            <View style={styles.header}>
              <Text style={styles.name}>{product.data.name}</Text>
              <Text style={styles.price}>from {formatNaira(asNaira(product.data.startingPrice))}</Text>
            </View>

            {unavailable ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>Currently unavailable</Text>
              </View>
            ) : null}

            {product.data.description ? <Text style={styles.description}>{product.data.description}</Text> : null}

            <Text style={styles.sectionTitle}>Choose a size</Text>
            <View style={styles.variants}>
              {(variants ?? []).map((variant) => {
                const active = variant.id === selected?.id;
                return (
                  <Pressable
                    key={variant.id}
                    onPress={() => setVariantId(variant.id)}
                    disabled={unavailable || busy}
                    style={[styles.variant, active && styles.variantActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.variantLabel, active && styles.variantLabelActive]}>{variant.label}</Text>
                    <Text style={[styles.variantPrice, active && styles.variantPriceActive]}>
                      {formatNaira(asNaira(variant.price))}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {unavailable ? null : (
              <View style={styles.quantityRow}>
                <Text style={styles.quantityLabel}>Quantity</Text>
                <QuantityStepper quantity={quantity} onChange={setQuantity} disabled={busy} />
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {added && !error ? <Text style={styles.added}>Added to your cart.</Text> : null}

            <Pressable
              onPress={() => void onAdd()}
              disabled={unavailable || busy || !selected}
              style={({ pressed }) => [styles.addButton, (unavailable || busy || !selected) && styles.addDisabled, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.addLabel}>
                {unavailable ? 'Unavailable' : busy ? 'Adding…' : status === 'signed-in' ? 'Add to cart' : 'Sign in to add to cart'}
              </Text>
            </Pressable>
          </View>
        </>
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
    paddingBottom: spacing.xxl,
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
  variantActive: {
    borderColor: colors.red,
    backgroundColor: colors.cream,
  },
  variantLabel: {
    fontSize: 15,
    color: colors.charcoal,
  },
  variantLabelActive: {
    fontWeight: '700',
  },
  variantPrice: {
    fontSize: 15,
    color: colors.charcoal,
  },
  variantPriceActive: {
    color: colors.red,
    fontWeight: '700',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quantityLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.charcoal,
  },
  footer: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  addButton: {
    backgroundColor: colors.red,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  addLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    fontSize: 14,
    color: colors.red,
    textAlign: 'center',
  },
  added: {
    fontSize: 14,
    color: colors.charcoal,
    textAlign: 'center',
  },
});
