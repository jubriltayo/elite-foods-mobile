import { useCallback, useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Button, Card, EmptyState, ErrorBanner, Pill, SkeletonRows } from '../../src/components/Feedback';
import { ProductImage } from '../../src/components/ProductImage';
import { QuantityStepper } from '../../src/components/QuantityStepper';
import { describeIssue, useCart } from '../../src/lib/cart';
import { asNaira, formatNaira } from '../../src/lib/money';
import { useSession } from '../../src/lib/session';
import type { CartIssue, CartItem } from '../../src/lib/types';
import { colors, radii, spacing } from '../../src/theme';

export default function CartScreen() {
  const { status } = useSession();
  const { cart, busy, refreshing, error, clearError, refresh, setQuantity, removeLine, removeDeadLines } = useCart();

  // Refetch on focus as well as on foreground, so returning to the tab shows the
  // server's cart rather than a stale snapshot.
  useFocusEffect(
    useCallback(() => {
      if (status === 'signed-in') void refresh();
    }, [status, refresh]),
  );

  useEffect(() => clearError, [clearError]);

  if (status !== 'signed-in') {
    return (
      <EmptyState
        title="Your cart is saved to your account"
        body="Sign in with Google to start a cart. It follows you between your phone and the website."
        actionLabel="Sign in with Google"
        onAction={() => router.push('/sign-in')}
      />
    );
  }

  if (!cart) {
    return <SkeletonRows count={3} />;
  }

  const items = cart.items;
  const issues = cart.issues;

  if (items.length === 0 && issues.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        body="Add something from the shop and it will appear here."
        actionLabel="Browse the shop"
        onAction={() => router.push('/')}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.lineId}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onRefresh={() => void refresh()}
        refreshing={refreshing}
        ListHeaderComponent={
          <View style={styles.header}>
            {error ? <ErrorBanner message={error} /> : null}
            {issues.length > 0 ? <IssueList issues={issues} busy={busy} onClear={() => void removeDeadLines()} /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <CartLine
            item={item}
            busy={busy}
            onChangeQuantity={(next) => void setQuantity(item.lineId, next)}
            onRemove={() => void removeLine(item.lineId)}
          />
        )}
        ListFooterComponent={
          <Card style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatNaira(asNaira(cart.subtotal))}</Text>
            </View>
            <View style={styles.summaryMeta}>
              <Text style={styles.footnote}>
                {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'}
              </Text>
              <Text style={styles.footnote}>Delivery calculated at checkout</Text>
            </View>

            <Button label="Checkout" onPress={() => router.push('/checkout')} disabled={busy} style={styles.checkout} />
          </Card>
        }
      />
    </View>
  );
}

function CartLine({
  item,
  busy,
  onChangeQuantity,
  onRemove,
}: {
  item: CartItem;
  busy: boolean;
  onChangeQuantity: (next: number) => void;
  onRemove: () => void;
}) {
  return (
    <Card padded={false} style={styles.line}>
      <ProductImage slug={item.product.slug} imageUrl={item.product.imageUrl} size={88} rounded={radii.md} />

      <View style={styles.lineBody}>
        <Text style={styles.lineName} numberOfLines={2}>
          {item.product.name}
        </Text>
        <Text style={styles.lineVariant}>{item.variant.label}</Text>
        <Text style={styles.lineUnit}>{formatNaira(asNaira(item.variant.price))} each</Text>

        <View style={styles.lineControls}>
          <QuantityStepper quantity={item.quantity} onChange={onChangeQuantity} disabled={busy} compact />
          <Text style={styles.lineTotal}>{formatNaira(asNaira(item.lineTotal))}</Text>
        </View>

        <Pressable onPress={onRemove} disabled={busy} accessibilityRole="button" accessibilityLabel={`Remove ${item.product.name}`}>
          <Text style={[styles.remove, busy && styles.mutedAction]}>Remove</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function IssueList({ issues, busy, onClear }: { issues: CartIssue[]; busy: boolean; onClear: () => void }) {
  return (
    <View style={styles.issueBox}>
      <View style={styles.issueHeader}>
        <Pill label={issues.length === 1 ? '1 item' : `${issues.length} items`} tone="warning" />
        <Text style={styles.issueTitle}>needs attention</Text>
      </View>

      {issues.map((issue) => (
        <Text key={issue.lineId} style={styles.issueText}>
          {describeIssue(issue)}
        </Text>
      ))}

      {/* The server excludes these from subtotal and itemCount. Saying so stops
          the total looking wrong when an item is visibly present. */}
      <Text style={styles.issueNote}>Not included in your subtotal.</Text>

      <Pressable onPress={onClear} disabled={busy} accessibilityRole="button">
        <Text style={[styles.issueAction, busy && styles.mutedAction]}>{busy ? 'Removing…' : 'Remove these items'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  separator: {
    height: spacing.md,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  line: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  lineBody: {
    flex: 1,
    gap: 2,
  },
  lineName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.charcoal,
  },
  lineVariant: {
    fontSize: 13,
    color: colors.muted,
  },
  lineUnit: {
    fontSize: 13,
    color: colors.muted,
  },
  lineControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  lineTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.charcoal,
  },
  remove: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.red,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  mutedAction: {
    color: colors.muted,
  },
  summary: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.charcoal,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.red,
  },
  summaryMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footnote: {
    fontSize: 13,
    color: colors.muted,
  },
  checkout: {
    marginTop: spacing.sm,
  },
  issueBox: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.mango,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  issueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  issueTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.charcoal,
  },
  issueText: {
    fontSize: 14,
    color: colors.charcoal,
  },
  issueNote: {
    fontSize: 12,
    color: colors.muted,
  },
  issueAction: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.red,
    marginTop: spacing.sm,
  },
});
