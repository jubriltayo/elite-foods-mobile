import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { ErrorState, LoadingState } from '../../src/components/States';
import { ProductCard } from '../../src/components/ProductCard';
import { listCategories, listProducts } from '../../src/lib/catalog';
import { useResource } from '../../src/lib/useResource';
import type { Category } from '../../src/lib/types';
import { colors, radii, spacing } from '../../src/theme';

export default function CatalogScreen() {
  const [selected, setSelected] = useState<string | undefined>(undefined);

  const products = useResource(() => listProducts(selected), selected ?? 'all');
  const [categories, setCategories] = useState<Category[]>([]);

  // Categories come from the API. GET /categories answers 404 until it is added
  // server-side, which listCategories turns into an empty list, so no filter row
  // is rendered. No category id or label is hard-coded anywhere.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          const list = await listCategories();
          if (active) setCategories(list);
        } catch {
          if (active) setCategories([]);
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <View style={styles.screen}>
      {categories.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
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
        <LoadingState />
      ) : products.error ? (
        <ErrorState message={products.error} hint="Pull down to try again." />
      ) : (
        <FlatList
          data={products.data ?? []}
          keyExtractor={(product) => product.slug}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onRefresh={products.reload}
          refreshing={products.loading}
          renderItem={({ item }) => (
            <ProductCard
              name={item.name}
              imageUrl={item.imageUrl}
              price={item.startingPrice}
              isAvailable={item.isAvailable}
              onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: item.slug } })}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyBody}>No products to show right now.</Text>
            </View>
          }
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
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
    color: colors.charcoal,
  },
  chipLabelActive: {
    color: colors.white,
    fontWeight: '600',
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  separator: {
    height: spacing.md,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.charcoal,
  },
  emptyBody: {
    fontSize: 14,
    color: colors.muted,
  },
});
