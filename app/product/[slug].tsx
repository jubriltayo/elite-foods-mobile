import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { Button, ErrorBanner, Pill, SkeletonRows } from '../../src/components/Feedback';
import { ProductImage } from '../../src/components/ProductImage';
import { QuantityStepper } from '../../src/components/QuantityStepper';
import { useCart } from '../../src/lib/cart';
import { getProduct } from '../../src/lib/catalog';
import { asNaira, formatNaira } from '../../src/lib/money';
import { useSession } from '../../src/lib/session';
import { useResource } from '../../src/lib/useResource';
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

  /**
   * An indication of what this selection will add, from the server's own unit
   * price. It is not an order total: the server prices the cart and the order,
   * and its figure is what the cart screen shows once the line exists.
   */
  const indicative = useMemo(
    () => (selected ? asNaira(selected.price) * quantity : 0),
    [selected, quantity],
  );

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
        <SkeletonRows count={4} />
      ) : product.error || !product.data ? (
        <View style={styles.errorWrap}>
          <ErrorBanner message={product.error ?? 'We could not find that product.'} />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.art}>
              <ProductImage slug={product.data.slug} imageUrl={product.data.imageUrl} size={260} rounded={radii.lg} />
              {unavailable ? (
                <View style={styles.artOverlay}>
                  <Pill label="Unavailable" tone="warning" />
                </View>
              ) : null}
            </View>

            <View style={styles.header}>
              <Text style={styles.name}>{product.data.name}</Text>
              {product.data.isAvailable ? (
                <Text style={styles.price}>from {formatNaira(asNaira(product.data.startingPrice))}</Text>
              ) : (
                <Text style={styles.priceMuted}>Currently unavailable</Text>
              )}
            </View>

            {product.data.description ? <Text style={styles.description}>{product.data.description}</Text> : null}

            <View style={styles.section}>
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
                      accessibilityState={{ selected: active, disabled: unavailable || busy }}
                    >
                      <Text style={[styles.variantLabel, active && styles.variantLabelActive]}>{variant.label}</Text>
                      <Text style={[styles.variantPrice, active && styles.variantPriceActive]}>
                        {formatNaira(asNaira(variant.price))}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {unavailable ? null : (
              <View style={styles.quantityRow}>
                <Text style={styles.sectionTitle}>Quantity</Text>
                <QuantityStepper quantity={quantity} onChange={setQuantity} disabled={busy} />
              </View>
            )}
          </ScrollView>

          <View style={styles.bar}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {added && !error ? (
              <View style={styles.addedRow}>
                <Text style={styles.added}>Added to your cart.</Text>
                <Pressable onPress={() => router.push('/cart')} accessibilityRole="button">
                  <Text style={styles.viewCart}>View cart</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.barRow}>
              <View style={styles.barFigures}>
                <Text style={styles.barLabel}>{selected ? selected.label : 'Total'}</Text>
                <Text style={styles.barValue}>{formatNaira(indicative)}</Text>
              </View>

              <Button
                label={unavailable ? 'Unavailable' : busy ? 'Adding' : status === 'signed-in' ? 'Add to cart' : 'Sign in to add'}
                onPress={() => void onAdd()}
                disabled={unavailable || busy || !selected}
                busy={busy}
                style={styles.barButton}
              />
            </View>
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
  errorWrap: {
    paddingTop: spacing.xl,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  art: {
    alignSelf: 'center',
  },
  artOverlay: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.md,
  },
  header: {
    gap: spacing.xs,
  },
  name: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.charcoal,
    letterSpacing: -0.4,
  },
  price: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.red,
  },
  priceMuted: {
    fontSize: 16,
    color: colors.muted,
  },
  description: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.muted,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.charcoal,
  },
  variants: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  variant: {
    flexGrow: 1,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 64,
  },
  variantActive: {
    borderColor: colors.red,
    borderWidth: 1.5,
    backgroundColor: colors.white,
  },
  variantLabel: {
    fontSize: 15,
    color: colors.charcoal,
  },
  variantLabelActive: {
    fontWeight: '700',
  },
  variantPrice: {
    fontSize: 14,
    color: colors.muted,
  },
  variantPriceActive: {
    color: colors.red,
    fontWeight: '600',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bar: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  barFigures: {
    gap: 2,
  },
  barLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  barValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.charcoal,
  },
  barButton: {
    flexShrink: 1,
    minWidth: 150,
  },
  addedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  added: {
    fontSize: 14,
    color: colors.charcoal,
  },
  viewCart: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.red,
  },
  error: {
    fontSize: 14,
    color: colors.red,
    textAlign: 'center',
  },
});
