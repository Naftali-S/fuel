/**
 * API keys the user enters (USDA now, Hevy later) live in the iOS Keychain
 * via expo-secure-store: never in the database, backups or the repository.
 */
import * as SecureStore from 'expo-secure-store';

export type SecretName = 'usda_api_key' | 'hevy_api_key';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export async function getSecret(name: SecretName): Promise<string | null> {
  return SecureStore.getItemAsync(name, OPTIONS);
}

export async function setSecret(name: SecretName, value: string | null): Promise<void> {
  const v = value?.trim();
  if (v) await SecureStore.setItemAsync(name, v, OPTIONS);
  else await SecureStore.deleteItemAsync(name, OPTIONS);
}
