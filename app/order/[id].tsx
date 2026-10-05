import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';

import { Button, Card, EmptyState, Pill, SkeletonRows, StatusPill } from '../../src/components/Feedback';
import { isApiError } from '../../src/lib/api';
import { asNaira, formatNaira } from '../../src/lib/money';
import { getOrder } from '../../src/lib/orders';
import { getPaymentMethods } from '../../src/lib/reference';
import { useResource } from '../../src/lib/useResource';
import type { Order } from '../../src/lib/types';
import { colors, radii, spacing } from '../../src/theme';

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useResource(() => (id ? getOrder(id) : Promise.reject(new Error('missing id'))), id ?? '');

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Order' }} />
      {order.loading ? (
        <SkeletonRows count={4} />
      ) : order.error ? (
        <NotFound notFound={isApiError(order.error) && order.error.code === 'NOT_FOUND'} />
      ) : order.data ? (
        <OrderDetail order={order.data} onChanged={order.reload} />
      ) : null}
    </View>
  );
}

function OrderDetail({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const [labels, setLabels] = useState<Record<string, string>>({});

  // Labels come from the server so the button text here cannot disagree with the
  // checkout picker or the web.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await getPaymentMethods();
        if (!active) return;
        setLabels(Object.fromEntries(list.map((method) => [method.id, method.label])));
      } catch {
        // A missing label is cosmetic. The stored id stands in, and the raw value
        // is never invented here.
        if (active) setLabels({});
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const isBankTransfer = order.paymentMethod === 'bank_transfer';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroMark}>
          <Text style={styles.heroTick}>✓</Text>
        </View>
        <Text style={styles.heroTitle}>Order received</Text>
        <Text style={styles.heroOrderNumber}>{order.orderNumber}</Text>
        <StatusPill status={order.status} />
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Items</Text>
        {order.items.map((item, index) => (
          <View key={`${item.productName}-${item.variantLabel}-${index}`} style={styles.line}>
            <View style={styles.lineBody}>
              <Text style={styles.lineName}>{item.productName}</Text>
              <Text style={styles.lineMeta}>
                {item.variantLabel} · {formatNaira(asNaira(item.unitPrice))} each
              </Text>
            </View>
            <View style={styles.lineRight}>
              <Text style={styles.lineQuantity}>×{item.quantity}</Text>
              <Text style={styles.lineTotal}>{formatNaira(asNaira(item.lineTotal))}</Text>
            </View>
          </View>
        ))}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Summary</Text>
        <Row label="Subtotal" value={formatNaira(asNaira(order.subtotal))} />
        <Row label="Delivery" value={formatNaira(asNaira(order.deliveryFee))} />
        <View style={styles.divider} />
        <Row label="Total" value={formatNaira(asNaira(order.total))} emphasis />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Delivery</Text>
        <Row label="Name" value={order.customerName} />
        <Row label="Phone" value={order.customerPhone} />
        <Row label="Area" value={order.deliveryArea} />
        <Row label="Address" value={order.deliveryAddress} />
        {order.note ? <Row label="Note" value={order.note} /> : null}
        <Text style={styles.timestamp}>{new Date(order.createdAt).toLocaleString()}</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Payment</Text>
        <Row label="Method" value={labels[order.paymentMethod] ?? order.paymentMethod} />
        <View style={styles.paymentStatus}>
          <Text style={styles.rowLabel}>Status</Text>
          <Pill
            label={order.paymentStatus === 'paid' ? 'Paid' : 'Not paid yet'}
            tone={order.paymentStatus === 'paid' ? 'positive' : 'warning'}
          />
        </View>
      </Card>

      {/*
        Bank transfer details ride with the order, never with the public payment
        methods endpoint, and never from anything hard-coded here. The server
        decides whether they are present and whether they are real.
      */}
      {isBankTransfer ? (
        order.bankTransfer ? (
          <BankTransferBlock
            bankName={order.bankTransfer.bankName}
            accountName={order.bankTransfer.accountName}
            accountNumber={order.bankTransfer.accountNumber}
            instructions={order.bankTransfer.instructions}
            isPlaceholder={order.bankTransfer.isPlaceholder}
          />
        ) : (
          <Card style={[styles.card, styles.warnCard]}>
            <Text style={styles.cardTitle}>Bank transfer</Text>
            <Text style={styles.body}>Contact the shop for transfer details.</Text>
          </Card>
        )
      ) : null}

      <Button label="Refresh" onPress={onChanged} variant="secondary" />

      {/*
        `emailSent` is deliberately not consulted here. It only appears on the
        placement response, not on this one, and a false there would mean the
        confirmation email bounced while the order itself remains saved and
        authoritative. Nothing in the app depends on receiving it.
      */}
    </ScrollView>
  );
}

function BankTransferBlock({
  bankName,
  accountName,
  accountNumber,
  instructions,
  isPlaceholder,
}: {
  bankName: string;
  accountName: string;
  accountNumber: string;
  instructions: string;
  isPlaceholder: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await Clipboard.setStringAsync(accountNumber);
    setCopied(true);
    Alert.alert('Copied', 'The account number is on your clipboard.');
  };

  return (
    <Card style={[styles.card, isPlaceholder && styles.warnCard]}>
      <Text style={styles.cardTitle}>Bank transfer</Text>

      {isPlaceholder ? (
        // Surfaced rather than hidden: these are not the shop's real details yet,
        // and presenting them as final would mean asking for money into an
        // account that may not be the right one.
        <View style={styles.placeholderNote}>
          <Text style={styles.placeholderText}>
            These details are provisional. Confirm them with the shop before sending any payment.
          </Text>
        </View>
      ) : null}

      <Row label="Bank" value={bankName} />
      <Row label="Account name" value={accountName} />

      <View style={styles.accountRow}>
        <View style={styles.lineBody}>
          <Text style={styles.rowLabel}>Account number</Text>
          <Text style={styles.accountNumber}>{accountNumber}</Text>
        </View>
        <Button label={copied ? 'Copied' : 'Copy'} onPress={() => void onCopy()} variant="secondary" />
      </View>

      {instructions ? <Text style={styles.body}>{instructions}</Text> : null}
    </Card>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, emphasis && styles.rowValueEmphasis]} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

/**
 * One state for every failure to load an order.
 *
 * Another customer's order is a 404 by design, exactly like one that does not
 * exist, so the two are deliberately indistinguishable here: a distinct message
 * would confirm the id is real.
 */
function NotFound({ notFound }: { notFound: boolean }) {
  return (
    <EmptyState
      title={notFound ? 'Order not found' : 'Something went wrong'}
      body={
        notFound
          ? 'We could not find that order on your account.'
          : 'We could not load that order. Please try again.'
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  hero: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  heroMark: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: '#E8F5EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  heroTick: {
    fontSize: 26,
    lineHeight: 30,
    color: '#2E6B41',
    fontWeight: '700',
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.charcoal,
  },
  heroOrderNumber: {
    fontSize: 15,
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  card: {
    gap: spacing.sm,
  },
  warnCard: {
    borderColor: colors.mango,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.charcoal,
    marginBottom: spacing.xs,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  lineBody: {
    flex: 1,
    gap: 2,
  },
  lineRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  lineName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.charcoal,
  },
  lineMeta: {
    fontSize: 13,
    color: colors.muted,
  },
  lineQuantity: {
    fontSize: 14,
    color: colors.muted,
  },
  lineTotal: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.charcoal,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 3,
  },
  rowLabel: {
    fontSize: 14,
    color: colors.muted,
  },
  rowValue: {
    fontSize: 14,
    color: colors.charcoal,
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
  },
  rowValueEmphasis: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.red,
  },
  paymentStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  accountNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.charcoal,
    letterSpacing: 1,
  },
  placeholderNote: {
    backgroundColor: colors.cream,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.mango,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  placeholderText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.charcoal,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  timestamp: {
    fontSize: 12,
    color: colors.muted,
    marginTop: spacing.xs,
  },
});
