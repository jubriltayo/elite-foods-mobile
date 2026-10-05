import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { ProductCard } from '../../src/components/ProductCard';
import { ProductImage } from '../../src/components/ProductImage';
import { EmptyState, ErrorBanner, SkeletonGrid } from '../../src/components/Feedback';
import { listCategories, listProducts } from '../../src/lib/catalog';
import { useResource } from '../../src/lib/useResource';
import { colors, radii, spacing } from '../../src/theme';

export default function CatalogScreen() {
  const [selected, setSelected] = useState<string | undefined>(undefined);

  const products = useResource(() => listProducts(selected), selected ?? 'all');
  const categories = useResource(() => listCategories(), 'categories');

  const list = categories.data ?? [];

  const onRefresh = () => {
    // Both, so a category added server-side shows up on the same pull that
    // refreshes the products.
    categories.reload();
    products.reload();
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.heading}>Elite Foods and Snacks</Text>
        <Text style={styles.subheading}>Snacks and drinks, delivered to your door.</Text>
      </View>

      {list.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersRow}
          contentContainerStyle={styles.filters}
        >
          <Chip label="All" active={selected === undefined} onPress={() => setSelected(undefined)} />
          {list.map((category) => (
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
          onRefresh={onRefresh}
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
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.chipPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]} numberOfLines={1}>
        {label}
      </Text>
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
    paddingVertical: spacing.md,
  },
  /**
   * The chip row must never be compressed.
   *
   * It sits in a flex column beside a `flex: 1` list, and a ScrollView defaults
   * to being shrinkable. When it was squeezed, its clipped content box cut the
   * glyphs off at the baseline: the chips looked like solid pills with the words
   * sliced off the bottom. Fixing the row's height and the chips' own minimum
   * height makes the layout independent of whatever the list does.
   */
  filtersRow: {
    flexGrow: 0,
    flexShrink: 0,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    // A visible edge. The old hairline border was almost the same value as the
    // fill, so an unselected chip read as a faint smudge on cream.
    borderWidth: 1.5,
    borderColor: colors.chipBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.red,
    borderColor: colors.red,
    borderWidth: 1.5,
    // Lifts the chosen chip off the row. A plain style prop on Android; needs no
    // library.
    elevation: 2,
  },
  chipPressed: {
    opacity: 0.75,
  },
  chipLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    color: colors.charcoal,
    // Android adds font padding that pushes text off-centre inside a fixed
    // height. Turning it off keeps the label optically centred in the pill.
    includeFontPadding: false,
    textAlign: 'center',
  },
  chipLabelActive: {
    color: colors.white,
    fontWeight: '700',
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
