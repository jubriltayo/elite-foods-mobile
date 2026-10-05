import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Card, Pill } from '../../src/components/Feedback';
import { toDisplayMessage } from '../../src/lib/api';
import { probeSessionCart } from '../../src/lib/sessionProbe';
import { useSession } from '../../src/lib/session';
import { colors, spacing } from '../../src/theme';

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
      <View style={styles.centre}>
        <Text style={styles.body}>Checking your session…</Text>
      </View>
    );
  }

  if (status === 'signed-out') {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.intro}>
          <Text style={styles.title}>Account</Text>
          <Text style={styles.body}>
            Sign in with Google to see your details, your cart and your orders. Your cart follows you between your
            phone and the website.
          </Text>
        </View>
        <Button label="Sign in with Google" onPress={() => router.push('/sign-in')} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.intro}>
        <Text style={styles.title}>Account</Text>
      </View>

      <Card style={styles.card}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{profile?.fullName || 'Signed in'}</Text>
          <Pill label={profile?.role === 'admin' ? 'Admin' : 'Customer'} tone="brand" />
        </View>
        {profile?.email ? <Text style={styles.email}>{profile.email}</Text> : null}
        {isProvisional ? (
          // Shown rather than hidden: after a cold start these details come from
          // a cache, not from a fresh exchange, and there is no GET /me to
          // confirm them.
          <Text style={styles.provisional}>Shown from this device. They refresh when you sign in again.</Text>
        ) : null}
      </Card>

      <Button label="Sign out" onPress={() => void signOut()} variant="secondary" />

      {/*
        A diagnostic, not a feature: it exists to confirm the stored token is
        accepted by the API. Development only, so it never ships.
      */}
      {__DEV__ ? (
        <>
          <Button label={checking ? 'Checking…' : 'Check my session'} onPress={() => void onCheck()} variant="ghost" busy={checking} />
          {probe ? <Text style={styles.probe}>{probe}</Text> : null}
        </>
      ) : null}

      <Text style={styles.note}>
        Signing out clears the token from this device. The API does not support revoking a token before it expires, so it
        stays valid for up to an hour.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: spacing.lg,
    gap: spacing.md,
    flexGrow: 1,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  intro: {
    gap: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.charcoal,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  card: {
    gap: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.charcoal,
    flexShrink: 1,
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
  note: {
    marginTop: spacing.sm,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
  },
});
