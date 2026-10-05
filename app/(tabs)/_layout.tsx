import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useCart } from '../../src/lib/cart';
import { colors, radii } from '../../src/theme';

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

/**
 * The badge shows units, not lines, because that is what itemCount counts: two
 * lines of 2 and 3 give 5. The number comes from the server, never from local
 * arithmetic, and it is hidden entirely while signed out because the cart
 * requires an account.
 */
function CartTabLabel({ focused }: { focused: boolean }) {
  const { itemCount } = useCart();

  return (
    <View style={styles.cartLabel}>
      <TabLabel label="Cart" focused={focused} />
      {itemCount !== null && itemCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{itemCount > 99 ? '99+' : itemCount}</Text>
        </View>
      ) : null}
    </View>
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
          tabBarLabel: ({ focused }) => <CartTabLabel focused={focused} />,
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
  cartLabel: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
});
