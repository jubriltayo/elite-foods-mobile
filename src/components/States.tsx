import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../theme';

interface Props {
  message: string;
  /** Shown under the message when the failure was ours to describe. */
  hint?: string;
}

/** A failed load that is not worth a screen of its own. Never shows a raw error. */
export function ErrorState({ message, hint }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function LoadingState() {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.red} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  message: {
    color: colors.charcoal,
    fontSize: 15,
    textAlign: 'center',
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
  },
});
