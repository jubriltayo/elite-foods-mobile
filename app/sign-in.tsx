import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getWebClientId } from '../src/lib/auth';
import { useSession } from '../src/lib/session';
import { colors, radii, spacing } from '../src/theme';

export default function SignInScreen() {
  const { signIn, error, clearError } = useSession();
  const [busy, setBusy] = useState(false);

  // Where to return once signed in. Set when the cart prompted the sign-in from a
  // product page, so the customer lands back on the product they were viewing.
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  /**
   * Only a product path is honoured.
   *
   * The value comes from a URL parameter, so it is not trusted as a route: an
   * unchecked string here would let a crafted link redirect a signed-in customer
   * somewhere unexpected, and would defeat expo-router's typed routes.
   */
  const destination = useMemo(() => {
    if (typeof returnTo !== 'string') return '/';
    const slug = /^\/product\/([A-Za-z0-9-]+)$/.exec(returnTo)?.[1];
    return slug ? ({ pathname: '/product/[slug]', params: { slug } } as const) : '/';
  }, [returnTo]);

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    clearError();

    try {
      await signIn();
      // Replace so the sign-in screen cannot be returned to with the back button.
      router.replace(destination);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Elite Foods</Text>
        <Text style={styles.subtitle}>Snacks and drinks, delivered.</Text>

        <Pressable
          onPress={() => void onPress()}
          disabled={busy}
          style={({ pressed }) => [styles.button, (pressed || busy) && styles.buttonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Sign in with Google"
        >
          {busy ? (
            <ActivityIndicator color={colors.charcoal} />
          ) : (
            <>
              <View style={styles.glyph}>
                <Text style={styles.glyphText}>G</Text>
              </View>
              <Text style={styles.buttonLabel}>Sign in with Google</Text>
            </>
          )}
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.note}>You can browse the shop without signing in.</Text>
      </View>

      <Text style={styles.config} selectable={false}>
        {getWebClientId() === 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com'
          ? 'Web client id not configured'
          : ''}
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.charcoal,
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    marginBottom: spacing.xl,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  glyph: {
    width: 22,
    height: 22,
    borderRadius: radii.sm,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.charcoal,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.charcoal,
  },
  error: {
    marginTop: spacing.lg,
    fontSize: 14,
    color: colors.red,
    textAlign: 'center',
  },
  note: {
    marginTop: spacing.xl,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
  config: {
    paddingBottom: spacing.lg,
    textAlign: 'center',
    fontSize: 12,
    color: colors.coral,
  },
});
