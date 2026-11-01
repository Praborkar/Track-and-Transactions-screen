import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import { boot } from '../src/state/runtime';
import { useTheme } from '../src/ui/theme';

export default function RootLayout() {
  const t = useTheme();
  const router = useRouter();
  useEffect(() => {
    void boot();
  }, []);
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: t.card }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen
          name="index"
          options={{
            title: 'Track',
            headerRight: () => (
              <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings" hitSlop={12}>
                <Text style={{ color: t.accent, fontSize: 15, fontWeight: '600' }}>Settings</Text>
              </Pressable>
            ),
          }}
        />
        <Stack.Screen name="txn/[id]" options={{ title: 'Transaction' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
