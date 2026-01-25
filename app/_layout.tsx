import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/store/useAuthStore';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { isAuthenticated } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const [isMounted, setIsMounted] = React.useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    // Wait for everything to be ready: component mounted, navigation state initialized, and segments available
    if (!isMounted || !navigationState?.key || !segments) return;

    const performRedirect = () => {
      const currentSegment = segments[0];

      if (!isAuthenticated && currentSegment !== 'login') {
        router.replace('/login');
      } else if (isAuthenticated && currentSegment === 'login') {
        router.replace('/(tabs)');
      }
    };

    // Use requestAnimationFrame to ensure the navigator is fully painted and stable
    const frame = requestAnimationFrame(performRedirect);
    return () => cancelAnimationFrame(frame);
  }, [isAuthenticated, segments, navigationState?.key, isMounted, router]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="project/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ title: 'Oops!' }} />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
