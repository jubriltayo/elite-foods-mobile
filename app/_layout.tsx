import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CartProvider } from '../src/lib/cart';
import { SessionProvider } from '../src/lib/session';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        {/* Inside the session, because the cart only exists for a signed-in
            customer and is dropped the moment they sign out. */}
        <CartProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.white },
              headerTitleStyle: { color: colors.charcoal },
              headerTintColor: colors.red,
              contentStyle: { backgroundColor: colors.cream },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="product/[slug]" options={{ title: 'Product' }} />
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
            <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
            <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
          </Stack>
        </CartProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
