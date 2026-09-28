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
            <Stack.Screen name="add-food" options={{ presentation: 'modal', title: 'Add food' }} />
            <Stack.Screen name="log-food" options={{ presentation: 'modal', title: 'Log food' }} />
            <Stack.Screen name="food-editor" options={{ presentation: 'modal', title: 'Your food' }} />
            <Stack.Screen name="recipe-editor" options={{ presentation: 'modal', title: 'Recipe' }} />
            <Stack.Screen name="profile" options={{ presentation: 'modal', title: 'Profile' }} />
            <Stack.Screen name="estimate-food" options={{ presentation: 'modal', title: 'Fill in nutrients' }} />
          </Stack>
        </CatalogProvider>
      </DatabaseProvider>
    </ThemeProvider>
  );
}
