import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../src/theme';

/** Placeholder for order history, which arrives in phase 4. */
export default function OrdersScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Orders</Text>
      <Text style={styles.body}>Your past orders will appear here once you have placed one.</Text>
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
