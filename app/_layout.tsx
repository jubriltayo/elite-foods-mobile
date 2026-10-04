import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
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
      </Stack>
    </SafeAreaProvider>
  );
}
