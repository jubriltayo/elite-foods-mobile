import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../src/theme';

/** Placeholder for the account screen, which arrives in phase 2 with sign-in. */
export default function AccountScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Account</Text>
      <Text style={styles.body}>Sign in with Google to see your details, your cart and your orders.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.cream,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.charcoal,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
});
