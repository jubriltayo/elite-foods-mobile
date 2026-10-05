import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { ProductCard } from '../../src/components/ProductCard';
import { ProductImage } from '../../src/components/ProductImage';
import { EmptyState, ErrorBanner, SkeletonGrid } from '../../src/components/Feedback';
import { listCategories, listProducts } from '../../src/lib/catalog';
import { useResource } from '../../src/lib/useResource';
import type { Category } from '../../src/lib/types';
import { colors, radii, spacing } from '../../src/theme';

export default function CatalogScreen() {
  const [selected, setSelected] = useState<string | undefined>(undefined);

  const products = useResource(() => listProducts(selected), selected ?? 'all');
  const [categories, setCategories] = useState<Category[]>([]);

  // Categories come from the API, refetched on focus so a category added
  // server-side appears without an app release. Ids and labels are never
  // hard-coded: an unknown ?category= is a hard 400, not an ignored filter.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const list = await listCategories();
        if (active) setCategories(list);
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.heading}>Shop</Text>
        <Text style={styles.subheading}>Snacks and drinks, delivered to your door.</Text>
      </View>

      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          <Chip label="All" active={selected === undefined} onPress={() => setSelected(undefined)} />
          {categories.map((category) => (
            <Chip
              key={category.id}
              label={category.label}
              active={selected === category.id}
              onPress={() => setSelected(category.id)}
            />
          ))}
        </ScrollView>
      ) : null}

      {products.loading ? (
        <SkeletonGrid />
      ) : products.error ? (
        <ErrorBanner message={products.error} hint="Pull down to try again." />
      ) : (products.data ?? []).length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="No products to show right now."
          actionLabel="Show everything"
          onAction={() => setSelected(undefined)}
        />
      ) : (
        <FlatList
          data={products.data ?? []}
          keyExtractor={(product) => product.slug}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.list}
          onRefresh={products.reload}
          refreshing={products.loading}
          renderItem={({ item }) => (
            <View style={styles.cell}>
              <ProductCard
                name={item.name}
                price={item.startingPrice}
                isAvailable={item.isAvailable}
                image={<ProductImage slug={item.slug} imageUrl={item.imageUrl} size={200} rounded={0} />}
                onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: item.slug } })}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: 2,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.charcoal,
    letterSpacing: -0.3,
  },
  subheading: {
    fontSize: 14,
    color: colors.muted,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.red,
    borderColor: colors.red,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.charcoal,
  },
  chipLabelActive: {
    color: colors.white,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  column: {
    gap: spacing.md,
  },
  cell: {
    flex: 1,
    marginBottom: spacing.md,
  },
});
