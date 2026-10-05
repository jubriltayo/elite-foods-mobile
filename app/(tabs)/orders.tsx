import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Card, EmptyState, ErrorBanner, SkeletonRows, StatusPill } from '../../src/components/Feedback';
import { asNaira, formatNaira } from '../../src/lib/money';
import { listOrders } from '../../src/lib/orders';
import { useSession } from '../../src/lib/session';
import { useResource } from '../../src/lib/useResource';
import type { OrderListEntry } from '../../src/lib/types';
import { colors, spacing } from '../../src/theme';

export default function OrdersScreen() {
  const { status } = useSession();

  // Only requested once signed in, so a signed-out visitor makes no doomed call.
  const orders = useResource<OrderListEntry[]>(() => (status === 'signed-in' ? listOrders() : Promise.resolve([])), status);

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
      <EmptyState
        title="Your orders"
        body="Sign in with Google to see the orders on your account."
        actionLabel="Sign in with Google"
        onAction={() => router.push('/sign-in')}
      />
    );
  }

  if (orders.loading && !orders.data) {
    return <SkeletonRows count={3} />;
  }

  if (orders.error) {
    return <ErrorBanner message={orders.error} hint="Pull down to try again." />;
  }

  const list = orders.data ?? [];

  return (
    <FlatList
      data={list}
      keyExtractor={(order) => order.id}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      onRefresh={reload}
      refreshing={orders.loading}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push({ pathname: '/order/[id]', params: { id: item.id } })}
          accessibilityRole="button"
          accessibilityLabel={`Order ${item.orderNumber}, ${formatNaira(asNaira(item.total))}`}
        >
          <Card style={styles.row}>
            <View style={styles.rowTop}>
              <View style={styles.rowTitles}>
                <Text style={styles.orderNumber}>{item.orderNumber}</Text>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
              </View>
              <Text style={styles.total}>{formatNaira(asNaira(item.total))}</Text>
            </View>

            <View style={styles.rowBottom}>
              <StatusPill status={item.status} />
              <Text style={styles.items}>
                {item.itemCount} {item.itemCount === 1 ? 'item' : 'items'}
              </Text>
            </View>
          </Card>
        </Pressable>
      )}
      ListEmptyComponent={
        <EmptyState
          title="No orders yet"
          body="Orders you place will appear here."
          actionLabel="Browse the shop"
          onAction={() => router.push('/')}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  separator: {
    height: spacing.md,
  },
  row: {
    gap: spacing.md,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowTitles: {
    flex: 1,
    gap: 2,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.charcoal,
  },
  date: {
    fontSize: 13,
    color: colors.muted,
  },
  total: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.charcoal,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  items: {
    fontSize: 13,
    color: colors.muted,
  },
});
