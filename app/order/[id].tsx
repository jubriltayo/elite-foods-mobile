import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';

import { LoadingState } from '../../src/components/States';
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
        <LoadingState />
      ) : order.error ? (
        <NotFound message={order.error} notFound={isApiError(order.error) && order.error.code === 'NOT_FOUND'} />
      ) : order.data ? (
        <OrderDetail order={order.data} onChanged={order.reload} />
      ) : null}
    </View>
  );
}

function OrderDetail({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const [methods, setMethods] = useState<string[]>([]);

  // Labels come from the server so the button text here cannot disagree with the
  // checkout picker or the web.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await getPaymentMethods();
        if (active) setMethods(list.map((method) => method.id));
      } catch {
        // A missing label is cosmetic; the raw id is a poor fallback, so show the
        // stored method only if the list could not be read at all.
        if (active) setMethods([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const methodLabel = methods.find((id) => id === order.paymentMethod) ?? order.paymentMethod;
  const isBankTransfer = order.paymentMethod === 'bank_transfer';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Order placed</Text>
        <Text style={styles.orderNumber}>{order.orderNumber}</Text>
        <Text style={styles.status}>{humanStatus(order.status)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Items</Text>
        {order.items.map((item, index) => (
          <View key={`${item.productName}-${item.variantLabel}-${index}`} style={styles.line}>
            <View style={styles.lineBody}>
              <Text style={styles.lineName}>{item.productName}</Text>
              <Text style={styles.lineVariant}>
                {item.variantLabel} · {formatNaira(asNaira(item.unitPrice))} each
              </Text>
            </View>
            <View style={styles.lineRight}>
              <Text style={styles.lineQuantity}>×{item.quantity}</Text>
              <Text style={styles.lineTotal}>{formatNaira(asNaira(item.lineTotal))}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Summary</Text>
        <Row label="Subtotal" value={formatNaira(asNaira(order.subtotal))} />
        <Row label="Delivery" value={formatNaira(asNaira(order.deliveryFee))} />
        <View style={styles.divider} />
        <Row label="Total" value={formatNaira(asNaira(order.total))} emphasis />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Details</Text>
        <Row label="Name" value={order.customerName} />
        <Row label="Phone" value={order.customerPhone} />
        <Row label="Area" value={order.deliveryArea} />
        <Row label="Address" value={order.deliveryAddress} />
        {order.note ? <Row label="Note" value={order.note} /> : null}
        <Row label="Payment" value={methodLabel} />
        <Row label="Payment status" value={humanPaymentStatus(order.paymentStatus)} />
        <Text style={styles.timestamp}>{new Date(order.createdAt).toLocaleString()}</Text>
      </View>

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
          <View style={[styles.card, styles.warnCard]}>
            <Text style={styles.cardTitle}>Bank transfer</Text>
            <Text style={styles.body}>Contact the shop for transfer details.</Text>
          </View>
        )
      ) : null}

      <Pressable onPress={onChanged} style={({ pressed }) => [styles.refresh, pressed && styles.pressed]} accessibilityRole="button">
        <Text style={styles.refreshLabel}>Refresh</Text>
      </Pressable>

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
    <View style={[styles.card, isPlaceholder && styles.warnCard]}>
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
          <Text style={styles.fieldLabel}>Account number</Text>
          <Text style={styles.accountNumber}>{accountNumber}</Text>
        </View>
        <Pressable onPress={() => void onCopy()} style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.copyLabel}>{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
      </View>

      {instructions ? <Text style={styles.body}>{instructions}</Text> : null}
    </View>
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
function NotFound({ message, notFound }: { message: string; notFound: boolean }) {
  return (
    <View style={styles.centre}>
      <Text style={styles.centreTitle}>{notFound ? 'Order not found' : 'Something went wrong'}</Text>
      <Text style={styles.centreBody}>{notFound ? 'We could not find that order on your account.' : message}</Text>
    </View>
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

function humanPaymentStatus(status: string): string {
  return status === 'paid' ? 'Paid' : 'Not paid yet';
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
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  heroLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  orderNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.charcoal,
  },
  status: {
    fontSize: 15,
    color: colors.red,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  warnCard: {
    borderColor: colors.mango,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.charcoal,
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
    fontWeight: '600',
    color: colors.charcoal,
  },
  lineVariant: {
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
    paddingVertical: 2,
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
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  fieldLabel: {
    fontSize: 14,
    color: colors.muted,
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
  copyButton: {
    backgroundColor: colors.cream,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 40,
    justifyContent: 'center',
  },
  copyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.red,
  },
  placeholderNote: {
    backgroundColor: colors.cream,
    borderRadius: radii.sm,
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
  refresh: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  refreshLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.red,
  },
  pressed: {
    opacity: 0.7,
  },
  centre: {
    flex: 1,
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
});
