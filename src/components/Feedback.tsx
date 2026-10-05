/**
 * Shared feedback and layout pieces.
 *
 * Each exists because it is used on at least two screens: one Button, one Pill,
 * one EmptyState, one error banner. Anything used once stays in its screen.
 *
 * Plain React Native only. No animation or gradient libraries, so nothing here
 * can pull in a native module.
 */

import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radii, spacing } from '../theme';

/* ---------------------------------------------------------------- Button -- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || busy;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        inactive && styles.buttonDisabled,
        pressed && !inactive && styles.buttonPressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? colors.white : colors.red} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant !== 'primary' && styles.buttonLabelAlt,
            inactive && styles.buttonLabelDisabled,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ Card -- */

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>;
}

/* ------------------------------------------------------------------ Pill -- */

type PillTone = 'neutral' | 'positive' | 'warning' | 'brand';

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: PillTone }) {
  return (
    <View style={[styles.pill, tone === 'positive' && styles.pillPositive, tone === 'warning' && styles.pillWarning, tone === 'brand' && styles.pillBrand]}>
      <Text
        style={[
          styles.pillLabel,
          tone === 'positive' && styles.pillLabelPositive,
          tone === 'warning' && styles.pillLabelWarning,
          tone === 'brand' && styles.pillLabelBrand,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------ EmptyState -- */

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.centre}>
      <Text style={styles.centreTitle}>{title}</Text>
      <Text style={styles.centreBody}>{body}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={styles.centreAction} />
      ) : null}
    </View>
  );
}

/* ----------------------------------------------------------- ErrorBanner -- */

export function ErrorBanner({ message, hint }: { message: string; hint?: string }) {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.bannerText}>{message}</Text>
      {hint ? <Text style={styles.bannerHint}>{hint}</Text> : null}
    </View>
  );
}

/* --------------------------------------------------------------- Skeleton -- */

/**
 * A quiet placeholder grid.
 *
 * Uses opacity rather than an animation, so there is no driver to mount and
 * nothing to keep running behind a screen.
 */
export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.skeletonGrid} accessibilityLabel="Loading products">
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.skeletonCell}>
          <View style={styles.skeletonArt} />
          <View style={styles.skeletonLine} />
          <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
        </View>
      ))}
    </View>
  );
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.skeletonRows}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.skeletonRow} />
      ))}
    </View>
  );
}

/* ---------------------------------------------------------- StatusPill -- */

/**
 * An order's status as a coloured pill.
 *
 * Lives here rather than on a screen because both the history list and the order
 * detail render it, and the two must not drift apart on wording or colour.
 */
export function StatusPill({ status }: { status: string }) {
  const tone: PillTone =
    status === 'delivered' ? 'positive' : status === 'cancelled' ? 'warning' : 'brand';

  return <Pill label={humanOrderStatus(status)} tone={tone} />;
}

/** The server's stored status, phrased for a customer. */
export function humanOrderStatus(status: string): string {
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

/* ---------------------------------------------------------------- Styles -- */

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: radii.md,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonSecondary: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonGhost: {
    backgroundColor: 'transparent',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonLabelAlt: {
    color: colors.red,
  },
  buttonLabelDisabled: {
    color: colors.muted,
  },

  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPadded: {
    padding: spacing.lg,
  },

  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.cream,
  },
  pillPositive: {
    backgroundColor: '#E8F5EC',
  },
  pillWarning: {
    backgroundColor: '#FDF0DC',
  },
  pillBrand: {
    backgroundColor: '#FBE9EA',
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  pillLabelPositive: {
    color: '#2E6B41',
  },
  pillLabelWarning: {
    color: '#8A5A17',
  },
  pillLabelBrand: {
    color: colors.red,
  },

  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  centreTitle: {
    fontSize: 19,
    fontWeight: '600',
    color: colors.charcoal,
    textAlign: 'center',
  },
  centreBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
  },
  centreAction: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },

  banner: {
    margin: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.coral,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  bannerText: {
    fontSize: 15,
    color: colors.charcoal,
  },
  bannerHint: {
    fontSize: 13,
    color: colors.muted,
  },

  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  skeletonCell: {
    width: '47.8%',
    gap: spacing.sm,
  },
  skeletonArt: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.border,
  },
  skeletonLine: {
    height: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.border,
  },
  skeletonLineShort: {
    width: '55%',
  },
  skeletonRows: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  skeletonRow: {
    height: 84,
    borderRadius: radii.lg,
    backgroundColor: colors.border,
  },
});
