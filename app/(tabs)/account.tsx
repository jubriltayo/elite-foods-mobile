import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { toDisplayMessage } from '../../src/lib/api';
import { probeSessionCart } from '../../src/lib/sessionProbe';
import { useSession } from '../../src/lib/session';
import { colors, radii, spacing } from '../../src/theme';

export default function AccountScreen() {
  const { status, profile, isProvisional, signOut } = useSession();
  const [probe, setProbe] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Proves the stored token is actually accepted by the API, rather than only
  // that a token is present on the device.
  const onCheck = async () => {
    setChecking(true);
    setProbe(null);
    try {
      const cart = await probeSessionCart();
      setProbe(`Token accepted. Server cart: ${cart.itemCount} items, subtotal ₦${cart.subtotal}.`);
    } catch (caught) {
      setProbe(toDisplayMessage(caught));
    } finally {
      setChecking(false);
    }
  };

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <Text style={styles.body}>Checking your session…</Text>
      </View>
    );
  }

  if (status === 'signed-out') {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.body}>
          Sign in with Google to see your details, your cart and your orders.
        </Text>
        <Pressable
          onPress={() => router.push('/sign-in')}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonLabel}>Sign in with Google</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Account</Text>

      <View style={styles.card}>
        <Text style={styles.name}>{profile?.fullName || 'Signed in'}</Text>
        {profile?.email ? <Text style={styles.email}>{profile.email}</Text> : null}
        {isProvisional ? (
          // Shown rather than hidden: after a cold start these details come from
          // a cache, not from a fresh exchange, and there is no GET /me to
          // confirm them.
          <Text style={styles.provisional}>Details shown from this device. They refresh when you sign in again.</Text>
        ) : null}
      </View>

      <Pressable
        onPress={() => void onCheck()}
        disabled={checking}
        style={({ pressed }) => [styles.button, styles.buttonOutline, pressed && styles.buttonPressed]}
        accessibilityRole="button"
      >
        <Text style={[styles.buttonLabel, styles.buttonLabelRed]}>{checking ? 'Checking…' : 'Check my session'}</Text>
      </Pressable>

      {probe ? <Text style={styles.probe}>{probe}</Text> : null}

      <Pressable
        onPress={() => void signOut()}
        style={({ pressed }) => [styles.button, styles.buttonOutline, pressed && styles.buttonPressed]}
        accessibilityRole="button"
      >
        <Text style={[styles.buttonLabel, styles.buttonLabelRed]}>Sign out</Text>
      </Pressable>

      <Text style={styles.note}>
        Signing out clears the token from this device. The API does not support revoking a token before it
        expires, so it stays valid for up to an hour.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.cream,
    padding: spacing.lg,
    gap: spacing.md,
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
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.charcoal,
  },
  email: {
    fontSize: 14,
    color: colors.muted,
  },
  provisional: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.coral,
  },
  probe: {
    fontSize: 13,
    color: colors.charcoal,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.red,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  buttonOutline: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  buttonLabelRed: {
    color: colors.red,
  },
  note: {
    marginTop: spacing.sm,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
  },
});
