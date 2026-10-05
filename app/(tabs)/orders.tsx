import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { ErrorState, LoadingState } from '../../src/components/States';
import { asNaira, formatNaira } from '../../src/lib/money';
import { listOrders } from '../../src/lib/orders';
import { useSession } from '../../src/lib/session';
import { useResource } from '../../src/lib/useResource';
import type { OrderListEntry } from '../../src/lib/types';
import { colors, radii, spacing } from '../../src/theme';

export default function OrdersScreen() {
  const { status } = useSession();

  // Only requested once signed in, so a signed-out visitor makes no doomed call.
  const orders = useResource<OrderListEntry[]>(
    () => (status === 'signed-in' ? listOrders() : Promise.resolve([])),
    status,
  );

  // Refetch on focus so a newly placed order appears without a manual refresh.
  // Depends on `reload`, which is stable. Depending on the `orders` object would
  // re-run this on every render, and each run would set state, looping forever.
  const { reload } = orders;
  useFocusEffect(
    useCallback(() => {
      if (status === 'signed-in') void reload();
    }, [status, reload]),
  );

  if (status !== 'signed-in') {
    return (
      <View style={styles.centre}>
        <Text style={styles.centreTitle}>Your orders</Text>
        <Text style={styles.centreBody}>Sign in with Google to see the orders on your account.</Text>
        <Pressable onPress={() => router.push('/sign-in')} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.primaryLabel}>Sign in with Google</Text>
        </Pressable>
      </View>
    );
  }

  if (orders.loading && !orders.data) {
    return <LoadingState />;
  }

  if (orders.error) {
    return <ErrorState message={orders.error} hint="Pull down to try again." />;
  }

  const list = orders.data ?? [];

  return (
    <FlatList
      data={list}
      keyExtractor={(order) => order.id}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      onRefresh={orders.reload}
      refreshing={orders.loading}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push({ pathname: '/order/[id]', params: { id: item.id } })}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Order ${item.orderNumber}`}
        >
          <View style={styles.rowBody}>
            <Text style={styles.orderNumber}>{item.orderNumber}</Text>
            <Text style={styles.meta}>
              {new Date(item.createdAt).toLocaleString()} · {item.itemCount}{' '}
              {item.itemCount === 1 ? 'item' : 'items'}
            </Text>
            <Text style={styles.status}>{humanStatus(item.status)}</Text>
          </View>
          <Text style={styles.total}>{formatNaira(asNaira(item.total))}</Text>
        </Pressable>
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.centreTitle}>No orders yet</Text>
          <Text style={styles.centreBody}>Orders you place will appear here.</Text>
        </View>
      }
    />
  );
}

function humanStatus(status: string): string {
  switch (status) {
    case 'pending':
      return 'Received';
    case 'confirmed':
      return 'Confirmed';
    case 'preparing':
      return 'Being prepared';
    case 'out_for_delivery':
      return 'On the way';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

const styles = StyleSheet.create({
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
  primary: {
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
  },
  pressed: {
    opacity: 0.7,
  },
  list: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  separator: {
    height: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.charcoal,
  },
  meta: {
    fontSize: 13,
    color: colors.muted,
  },
  status: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.red,
  },
  total: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.charcoal,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
});
