import { Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { colors } from '../../src/theme';

/**
 * No icon library: a text label is enough and avoids a native dependency for
 * something the brand does not specify.
 */
function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={[styles.label, focused && styles.labelFocused]} numberOfLines={1}>
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.white },
        headerTitleStyle: { color: colors.charcoal },
        headerTintColor: colors.red,
        tabBarActiveTintColor: colors.red,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.cream },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Shop',
          tabBarLabel: ({ focused }) => <TabLabel label="Shop" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Cart',
          tabBarLabel: ({ focused }) => <TabLabel label="Cart" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarLabel: ({ focused }) => <TabLabel label="Orders" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarLabel: ({ focused }) => <TabLabel label="Account" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    color: colors.muted,
  },
  labelFocused: {
    color: colors.red,
    fontWeight: '600',
  },
});
