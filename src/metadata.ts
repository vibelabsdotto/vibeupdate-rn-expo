import * as Application from 'expo-application';
import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';
import type { RuntimeMetadata, VibeUpdateError } from './types.js';

function invalid(message: string, onError?: (error: VibeUpdateError) => void): null {
  const error: VibeUpdateError = { code: 'invalid-metadata', message };
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn(`[VibeUpdate] ${message}`);
  try { onError?.(error); } catch { /* Host callbacks must not break fail-open behavior. */ }
  return null;
}

export function getRuntimeMetadata(
  localeOverride?: string,
  onError?: (error: VibeUpdateError) => void,
  overrides?: Partial<RuntimeMetadata>,
): RuntimeMetadata | null {
  const platformValue: unknown = overrides?.platform ?? Platform.OS;
  if (platformValue !== 'ios' && platformValue !== 'android') {
    return invalid('Only iOS and Android runtime metadata is supported.', onError);
  }
  const applicationIdValue: unknown =
    overrides?.nativeApplicationId !== undefined
      ? overrides.nativeApplicationId
      : Application.applicationId;
  const versionValue: unknown =
    overrides?.version !== undefined
      ? overrides.version
      : Application.nativeApplicationVersion;
  const localeValue: unknown =
    localeOverride !== undefined
      ? localeOverride
      : overrides?.locale !== undefined
        ? overrides.locale
        : getLocales()[0]?.languageTag;
  const hasBuildOverride = overrides?.buildNumber !== undefined;
  const buildValue: unknown = hasBuildOverride
    ? overrides.buildNumber
    : Application.nativeBuildVersion;

  if (typeof applicationIdValue !== 'string' || !applicationIdValue.trim() || applicationIdValue.trim().length > 255) {
    return invalid('expo-application did not provide a valid applicationId.', onError);
  }
  if (typeof versionValue !== 'string' || !versionValue.trim() || versionValue.trim().length > 50) {
    return invalid(
      'expo-application did not provide a valid native application version.',
      onError,
    );
  }
  if (typeof localeValue !== 'string' || !localeValue.trim() || localeValue.trim().length > 35) {
    return invalid('expo-localization did not provide a valid device locale.', onError);
  }
  try {
    if (Intl.getCanonicalLocales(localeValue.trim()).length !== 1) throw new Error('Invalid locale');
  } catch {
    return invalid('The device locale must be a valid BCP-47 language tag.', onError);
  }
  if (hasBuildOverride && typeof buildValue !== 'number') {
    return invalid('The buildNumber override must be a number.', onError);
  }
  const buildNumber =
    typeof buildValue === 'number'
      ? buildValue
      : typeof buildValue === 'string' && buildValue.trim()
        ? Number(buildValue.trim())
        : Number.NaN;
  if (!Number.isSafeInteger(buildNumber) || buildNumber <= 0) {
    return invalid('The native build version must be a positive integer; set a numeric iOS CFBundleVersion or supply a numeric buildNumber override.', onError);
  }
  return {
    platform: platformValue,
    nativeApplicationId: applicationIdValue.trim(),
    buildNumber,
    version: versionValue.trim(),
    locale: localeValue.trim(),
  };
}
