import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { DatabaseProvider } from '@/db/database-provider';
import { CatalogProvider } from '@/food/catalog-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <DatabaseProvider>
        <CatalogProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="scan" options={{ presentation: 'modal', title: 'Scan barcode' }} />
            <Stack.Screen name="food-search" options={{ presentation: 'modal', title: 'Search foods' }} />
          </Stack>
        </CatalogProvider>
      </DatabaseProvider>
    </ThemeProvider>
  );
}
