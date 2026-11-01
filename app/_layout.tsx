import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold, useFonts } from '@expo-google-fonts/poppins';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { boot } from '../src/state/runtime';
import { font, theme as t } from '../src/ui/theme';

export default function RootLayout() {
  const router = useRouter();
  const [fontsReady] = useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold });
  useEffect(() => {
    void boot();
  }, []);
  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerShadowVisible: false,
          headerTintColor: t.text,
          headerTitleStyle: { fontFamily: font.semi, fontSize: 18, color: t.text },
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'Track',
            headerRight: () => (
              <Pressable
                onPress={() => router.push('/settings')}
                accessibilityRole="button"
                accessibilityLabel="Settings"
                hitSlop={10}
                style={{ backgroundColor: t.card, borderColor: t.line, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6 }}
              >
                <Text style={{ color: t.text, fontSize: 13, fontFamily: font.medium }}>Settings</Text>
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
