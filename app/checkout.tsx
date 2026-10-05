import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { ErrorState, LoadingState } from '../src/components/States';
import { ApiError, isApiError, toDisplayMessage } from '../src/lib/api';
import { useCart } from '../src/lib/cart';
import { beginAttempt, createKeyRef, endAttempt } from '../src/lib/idempotency';
import { asNaira, formatNaira } from '../src/lib/money';
import { placeOrder } from '../src/lib/orders';
import type { PlaceOrderInput } from '../src/lib/orders';
import { feeForArea, getDeliveryAreas, getPaymentMethods } from '../src/lib/reference';
import { useSession } from '../src/lib/session';
import type { DeliveryArea, PaymentMethod } from '../src/lib/types';
import { colors, radii, spacing } from '../src/theme';

interface FormState {
  customerName: string;
  customerPhone: string;
  deliveryArea: string;
  deliveryAddress: string;
  note: string;
  paymentMethod: string;
}

const EMPTY_FORM: FormState = {
  customerName: '',
  customerPhone: '',
  deliveryArea: '',
  deliveryAddress: '',
  note: '',
  paymentMethod: '',
};

export default function CheckoutScreen() {
  const { status } = useSession();
  const { cart, busy: cartBusy, refresh: refreshCart } = useCart();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [areas, setAreas] = useState<DeliveryArea[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loadingReference, setLoadingReference] = useState(true);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  const [placing, setPlacing] = useState(false);
  /** Banner copy: shown when the server rejected the order for a stated reason. */
  const [banner, setBanner] = useState<string | null>(null);
  /** Per-input messages, keyed by the server's own field names. */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // The key for the attempt in flight. A ref, because it must be readable the
  // instant a retry is pressed and must not trigger a render. This is also what
  // guards a double tap: the check and the claim happen without an intervening
  // render, which a state check could not guarantee.
  const keyRef = useRef(createKeyRef());
  const placingRef = useRef(false);

  // Reference data comes from the API, cached in memory for the session only.
  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const [nextAreas, nextMethods] = await Promise.all([getDeliveryAreas(), getPaymentMethods()]);
        if (!active) return;
        setAreas(nextAreas);
        setMethods(nextMethods);
        // Preselect the first of each so the common case is one tap. The ids come
        // from the server; nothing here is hard-coded.
        setForm((current) => ({
          ...current,
          deliveryArea: current.deliveryArea || nextAreas[0]?.id || '',
          paymentMethod: current.paymentMethod || nextMethods[0]?.id || '',
        }));
      } catch (caught) {
        if (active) setReferenceError(toDisplayMessage(caught));
      } finally {
        if (active) setLoadingReference(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // Leaving the screen abandons the attempt, so returning mints a fresh key
  // rather than replaying an order the customer may no longer intend.
  useEffect(() => () => endAttempt(keyRef.current), []);

  const setField = useCallback((key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setBanner(null);
  }, []);

  const fee = useMemo(() => feeForArea(areas, form.deliveryArea), [areas, form.deliveryArea]);
  const subtotal = cart?.subtotal ?? 0;
  const total = fee === null ? subtotal : subtotal + fee;

  const items = cart?.items ?? [];
  const issues = cart?.issues ?? [];

  if (status !== 'signed-in') {
    // Placing an order requires an account. The cart is unreachable while signed
    // out, so this is the only way in.
    return (
      <View style={styles.centre}>
        <Text style={styles.centreTitle}>Sign in to check out</Text>
        <Text style={styles.centreBody}>Your cart is saved to your account.</Text>
        <Pressable onPress={() => router.replace('/sign-in')} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryLabel}>Sign in with Google</Text>
        </Pressable>
      </View>
    );
  }

  if (!cart) {
    return (
      <View style={styles.centre}>
        <Text style={styles.centreBody}>Loading your cart…</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.centre}>
        <Text style={styles.centreTitle}>Your cart is empty</Text>
        <Text style={styles.centreBody}>Add something from the shop before checking out.</Text>
        <Pressable onPress={() => router.replace('/')} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryLabel}>Browse the shop</Text>
        </Pressable>
      </View>
    );
  }

  /**
   * A cart with issues cannot be ordered. The server rejects it anyway, and
   * saying why here beats a bare failure after the customer has filled the form.
   */
  if (issues.length > 0) {
    return (
      <View style={styles.centre}>
        <Text style={styles.centreTitle}>Your cart needs attention</Text>
        <Text style={styles.centreBody}>
          {issues.length === 1 ? 'One item' : `${issues.length} items`} cannot be ordered. Remove{' '}
          {issues.length === 1 ? 'it' : 'them'} from your cart to continue.
        </Text>
        <Pressable onPress={() => router.replace('/cart')} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryLabel}>Go to your cart</Text>
        </Pressable>
      </View>
    );
  }

  const onPlace = async () => {
    if (placingRef.current) return;

    const missing = missingFields(form);
    if (missing.length > 0) {
      setFieldErrors(Object.fromEntries(missing.map((key) => [key, 'This is required.'])));
      setBanner('Please complete the highlighted fields.');
      return;
    }

    placingRef.current = true;
    setPlacing(true);
    setBanner(null);
    setFieldErrors({});

    // A fresh key per attempt. The previous one, if any, belonged to an attempt
    // that has already finished.
    const key = beginAttempt(keyRef.current);

    const payload: PlaceOrderInput = {
      customerName: form.customerName.trim(),
      // Sent exactly as typed. The server normalizes it, and a second opinion
      // here would only ever disagree with the schema that decides.
      customerPhone: form.customerPhone.trim(),
      deliveryArea: form.deliveryArea,
      deliveryAddress: form.deliveryAddress.trim(),
      paymentMethod: form.paymentMethod,
    };
    const note = form.note.trim();
    if (note) payload.note = note;

    try {
      const placed = await placeOrder(payload, key);

      // The attempt is complete, so its key must never be reused.
      endAttempt(keyRef.current);

      // The cart is cleared server-side only once the order is durable, so it is
      // read again rather than emptied locally.
      await refreshCart();

      router.replace({ pathname: '/order/[id]', params: { id: placed.id } });
    } catch (caught) {
      const retriable = shouldReuseKey(caught);

      if (retriable) {
        // The outcome is unknown: the order may or may not exist. Keep the key so
        // a retry is answered with the original order instead of a second one.
      } else {
        // A definite rejection. Reusing this key could return the rejected
        // order, so it is discarded.
        endAttempt(keyRef.current);
      }

      // Per-field messages are placed next to their inputs when the server sends
      // them. `fields` is documented as present for VALIDATION_ERROR but is in
      // practice sometimes omitted, so the banner is shown either way and never
      // depends on it.
      if (isApiError(caught) && caught.fields && Object.keys(caught.fields).length > 0) {
        setFieldErrors(caught.fields);
      }
      setBanner(toDisplayMessage(caught));
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  };

  const disabled = placing || cartBusy || loadingReference || referenceError !== null;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {banner ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{banner}</Text>
          </View>
        ) : null}

        {referenceError ? <ErrorState message={referenceError} /> : null}
        {loadingReference ? <LoadingState /> : null}

        <Field
          label="Full name"
          value={form.customerName}
          onChange={(value) => setField('customerName', value)}
          error={fieldErrors.customerName}
          autoComplete="name"
        />

        <Field
          label="Phone number"
          value={form.customerPhone}
          onChange={(value) => setField('customerPhone', value)}
          error={fieldErrors.customerPhone}
          // Deliberately permissive: both 08030511967 and +2348030511967 are
          // accepted by the server, which stores a normalized form.
          placeholder="08030511967"
          keyboardType="phone-pad"
          autoComplete="tel"
        />

        <View style={styles.group}>
          <Text style={styles.label}>Delivery area</Text>
          <View style={styles.options}>
            {areas.map((area) => (
              <Option
                key={area.id}
                label={area.label}
                detail={formatNaira(asNaira(area.fee))}
                active={form.deliveryArea === area.id}
                onPress={() => setField('deliveryArea', area.id)}
              />
            ))}
          </View>
          {fieldErrors.deliveryArea ? <Text style={styles.error}>{fieldErrors.deliveryArea}</Text> : null}
        </View>

        <Field
          label="Delivery address"
          value={form.deliveryAddress}
          onChange={(value) => setField('deliveryAddress', value)}
          error={fieldErrors.deliveryAddress}
          multiline
          autoComplete="street-address"
        />

        <View style={styles.group}>
          <Text style={styles.label}>How would you like to pay?</Text>
          <View style={styles.options}>
            {methods.map((method) => (
              <Option
                key={method.id}
                label={method.label}
                active={form.paymentMethod === method.id}
                onPress={() => setField('paymentMethod', method.id)}
              />
            ))}
          </View>
          {fieldErrors.paymentMethod ? <Text style={styles.error}>{fieldErrors.paymentMethod}</Text> : null}
        </View>

        <Field
          label="Note (optional)"
          value={form.note}
          onChange={(value) => setField('note', value)}
          error={fieldErrors.note}
          multiline
        />

        <View style={styles.summary}>
          <SummaryRow label="Subtotal" value={formatNaira(asNaira(subtotal))} />
          <SummaryRow label="Delivery" value={fee === null ? '—' : formatNaira(asNaira(fee))} />
          <View style={styles.divider} />
          <SummaryRow label="Total" value={formatNaira(asNaira(total))} emphasis />
          <Text style={styles.footnote}>The final total is calculated by Elite Foods when your order is saved.</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => void onPlace()}
          disabled={disabled}
          style={({ pressed }) => [styles.primary, disabled && styles.primaryDisabled, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryLabel}>{placing ? 'Placing your order…' : `Place order · ${formatNaira(asNaira(total))}`}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * Whether a failed attempt might still have reached the server.
 *
 * Only a transport failure or a 5xx leaves that unknown, so only those may reuse
 * the key. A 4xx is a definite rejection, and a validation error means nothing
 * was created at all.
 */
function shouldReuseKey(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 0) return true;
  return error.status >= 500;
}

/** The required fields, checked for presence only. */
function missingFields(form: FormState): (keyof FormState)[] {
  const required: (keyof FormState)[] = ['customerName', 'customerPhone', 'deliveryArea', 'deliveryAddress', 'paymentMethod'];
  return required.filter((key) => !form[key].trim());
}

function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
  multiline,
  keyboardType,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'phone-pad';
  autoComplete?: 'name' | 'tel' | 'street-address';
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && styles.inputMultiline, !!error && styles.inputError]}
        multiline={multiline}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        autoCapitalize={keyboardType === 'phone-pad' ? 'none' : 'sentences'}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function Option({
  label,
  detail,
  active,
  onPress,
}: {
  label: string;
  detail?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.option, active && styles.optionActive]}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{label}</Text>
      {detail ? <Text style={[styles.optionDetail, active && styles.optionDetailActive]}>{detail}</Text> : null}
    </Pressable>
  );
}

function SummaryRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, emphasis && styles.summaryLabelEmphasis]}>{label}</Text>
      <Text style={[styles.summaryValue, emphasis && styles.summaryValueEmphasis]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
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
  banner: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.red,
    padding: spacing.md,
  },
  bannerText: {
    fontSize: 14,
    color: colors.red,
  },
  group: {
    gap: spacing.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.charcoal,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.charcoal,
    minHeight: 48,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: colors.red,
  },
  error: {
    fontSize: 13,
    color: colors.red,
  },
  options: {
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 48,
  },
  optionActive: {
    borderColor: colors.red,
    backgroundColor: colors.cream,
  },
  optionLabel: {
    fontSize: 15,
    color: colors.charcoal,
  },
  optionLabelActive: {
    fontWeight: '700',
  },
  optionDetail: {
    fontSize: 14,
    color: colors.muted,
  },
  optionDetailActive: {
    color: colors.red,
    fontWeight: '600',
  },
  summary: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 15,
    color: colors.charcoal,
  },
  summaryLabelEmphasis: {
    fontSize: 17,
    fontWeight: '700',
  },
  summaryValue: {
    fontSize: 15,
    color: colors.charcoal,
  },
  summaryValueEmphasis: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.red,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  footnote: {
    fontSize: 12,
    color: colors.muted,
  },
  footer: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.lg,
  },
  primary: {
    backgroundColor: colors.red,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: {
    opacity: 0.5,
  },
  primaryLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
