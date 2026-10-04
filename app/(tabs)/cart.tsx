import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../src/theme';

/**
 * Placeholder for the server cart, which arrives in phase 3. It exists so the
 * tab bar is complete and the navigation structure is settled before there is
 * anything to show.
 */
export default function CartScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Your cart</Text>
      <Text style={styles.body}>Sign in to start a cart. It is kept on your account, so it follows you between devices.</Text>
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
