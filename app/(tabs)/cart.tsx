import { useCallback, useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { ProductImage } from '../../src/components/ProductCard';
import { QuantityStepper } from '../../src/components/QuantityStepper';
import { useCart, describeIssue } from '../../src/lib/cart';
import { asNaira, formatNaira } from '../../src/lib/money';
import { useSession } from '../../src/lib/session';
import type { CartIssue, CartItem } from '../../src/lib/types';
import { colors, radii, spacing } from '../../src/theme';

export default function CartScreen() {
  const { status } = useSession();
  const { cart, busy, error, clearError, refresh, setQuantity, removeLine, removeDeadLines } = useCart();

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
      <View style={styles.centre}>
        <Text style={styles.centreTitle}>Your cart is saved to your account</Text>
        <Text style={styles.centreBody}>
          Sign in with Google to start a cart. It follows you between your phone and the website.
        </Text>
        <Pressable
          onPress={() => router.push('/sign-in')}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryLabel}>Sign in with Google</Text>
        </Pressable>
      </View>
    );
  }

  const items = cart?.items ?? [];
  const issues = cart?.issues ?? [];

  if (!cart) {
    return (
      <View style={styles.centre}>
        <Text style={styles.centreBody}>Loading your cart…</Text>
      </View>
    );
  }

  if (items.length === 0 && issues.length === 0) {
    return (
      <View style={styles.centre}>
        <Text style={styles.centreTitle}>Your cart is empty</Text>
        <Text style={styles.centreBody}>Add something from the shop and it will appear here.</Text>
        <Pressable
          onPress={() => router.push('/')}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryLabel}>Browse the shop</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.lineId}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshing={false}
        onRefresh={() => void refresh()}
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
          <View style={styles.footer}>
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>Subtotal</Text>
              {/* The server's figure. Delivery is not included and is not yet known. */}
              <Text style={styles.subtotalValue}>{formatNaira(asNaira(cart.subtotal))}</Text>
            </View>
            <Text style={styles.footnote}>Delivery is calculated at checkout.</Text>
            <Text style={styles.footnote}>
              {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'}
            </Text>
          </View>
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
    <View style={styles.line}>
      <ProductImage uri={item.product.imageUrl} size={72} />

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
          <Text style={[styles.remove, busy && styles.removeDisabled]}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

function IssueList({ issues, busy, onClear }: { issues: CartIssue[]; busy: boolean; onClear: () => void }) {
  return (
    <View style={styles.issueBox}>
      <Text style={styles.issueTitle}>
        {issues.length === 1 ? '1 item needs attention' : `${issues.length} items need attention`}
      </Text>

      {issues.map((issue) => (
        <Text key={issue.lineId} style={styles.issueText}>
          {describeIssue(issue)}
        </Text>
      ))}

      {/* The server excludes these from subtotal and itemCount. Saying so stops
          the total looking wrong when an item is visibly present. */}
      <Text style={styles.issueNote}>These are not included in your subtotal.</Text>

      <Pressable onPress={onClear} disabled={busy} accessibilityRole="button">
        <Text style={[styles.issueAction, busy && styles.removeDisabled]}>{busy ? 'Removing…' : 'Remove these items'}</Text>
      </Pressable>
    </View>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
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
  },
  separator: {
    height: spacing.md,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  centre: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  centreTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.charcoal,
    textAlign: 'center',
  },
  centreBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.red,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  line: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.red,
    marginTop: spacing.sm,
  },
  removeDisabled: {
    opacity: 0.4,
  },
  footer: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subtotalLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.charcoal,
  },
  subtotalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.red,
  },
  footnote: {
    fontSize: 13,
    color: colors.muted,
  },
  issueBox: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.coral,
    padding: spacing.md,
    gap: spacing.xs,
  },
  issueTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.coral,
  },
  issueText: {
    fontSize: 14,
    color: colors.charcoal,
  },
  issueNote: {
    fontSize: 12,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  issueAction: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.red,
    marginTop: spacing.sm,
  },
  errorBox: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.red,
    padding: spacing.md,
  },
  errorText: {
    fontSize: 14,
    color: colors.red,
  },
});
