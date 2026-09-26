import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { checkApi } from './api.js';
import { choosePresentation } from './decision.js';
import { DEFAULT_FOREGROUND_INTERVAL_MS, shouldRecheckInForeground } from './foreground.js';
import { getRuntimeMetadata } from './metadata.js';
import { createStorageKeys, getSeenState, markPresentationSeen, type StorageKeys } from './storage.js';
import type {
  CheckVibeUpdateOptions,
  CheckVibeUpdateResult,
  Presentation,
  RuntimeMetadata,
  StorageAdapter,
  VibeUpdateError,
  VibeUpdateProps,
} from './types.js';
import { UpdateDialog } from './ui.js';

export const DEFAULT_API_URL = 'https://api.vibeupdate.app';
export const DEFAULT_TIMEOUT_MS = 3000;
const defaultStorage = AsyncStorage as unknown as StorageAdapter;
type Display = { value: Presentation; keys: StorageKeys };

function developmentWarning(error: VibeUpdateError): void {
  if (error.code === 'invalid-config' && typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[VibeUpdate] ${error.message}`);
  }
}

function reporter(onError?: (error: VibeUpdateError) => void): (error: VibeUpdateError) => void {
  return (error) => {
    developmentWarning(error);
    try { onError?.(error); } catch { /* Host callbacks must not break fail-open behavior. */ }
  };
}

async function executeCheck(
  options: CheckVibeUpdateOptions,
  storage: StorageAdapter,
): Promise<CheckVibeUpdateResult | null> {
  const onError = reporter(options.onError);
  const metadata = getRuntimeMetadata(
    options.locale,
    onError,
    options.runtimeMetadata,
  );
  if (metadata === null) return null;
  const result = await checkApi({
    appId: options.appId,
    apiUrl: options.apiUrl ?? DEFAULT_API_URL,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    metadata,
    storage,
    onError,
  });
  return result === null ? null : { ...result, metadata };
}

export async function checkVibeUpdate(options: CheckVibeUpdateOptions): Promise<CheckVibeUpdateResult | null> {
  return executeCheck(options, options.storage ?? defaultStorage);
}

function storageError(onError: ((error: VibeUpdateError) => void) | undefined, cause: unknown): void {
  try { onError?.({ code: 'storage', message: 'VibeUpdate could not access local storage.', cause }); } catch { /* Fail open. */ }
}

export function VibeUpdate({
  appId,
  apiUrl = DEFAULT_API_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  foregroundIntervalMs = DEFAULT_FOREGROUND_INTERVAL_MS,
  storage = defaultStorage,
  theme,
  stringOverrides,
  locale,
  runtimeMetadata,
  onError,
  onOpenStore,
  enabled = true,
}: VibeUpdateProps): React.JSX.Element | null {
  const [display, setDisplay] = useState<Display | null>(null);
  const displayRef = useRef<Display | null>(null);
  const presentedThisMount = useRef(false);
  const requestedInitialCheck = useRef(false);
  const mounted = useRef(true);
  const latestOnError = useRef(onError);
  latestOnError.current = onError;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    requestedInitialCheck.current = false;
    presentedThisMount.current = false;
    displayRef.current = null;
    setDisplay(null);
    if (!enabled) return undefined;
    const controller = new AbortController();
    let active = true;
    const report = reporter((error) => latestOnError.current?.(error));

    const runCheck = async (): Promise<RuntimeMetadata | null> => {
      const metadata = getRuntimeMetadata(locale, report, runtimeMetadata);
      if (metadata === null) return null;
      const result = await checkApi({ appId, apiUrl, timeoutMs, metadata, storage, onError: report, signal: controller.signal });
      if (!active || result === null || !mounted.current) return metadata;
      const required = result.response.update?.mode === 'required';
      if (presentedThisMount.current && !required) return metadata;
      if (required && displayRef.current?.value.kind === 'required' &&
        displayRef.current.value.update.targetBuildNumber === result.response.update?.targetBuildNumber) return metadata;
      const targetBuild = result.response.update?.targetBuildNumber ?? 0;
      const keys = createStorageKeys(appId, metadata.platform, metadata.buildNumber, targetBuild);
      let presentationToShow: Presentation | null;
      if (result.response.update?.mode === 'required' || result.response.update?.mode === 'persistent') {
        presentationToShow = choosePresentation(result.response, { changelogSeen: false, optionalSeen: false });
      } else {
        try {
          const seen = await getSeenState(storage, keys);
          presentationToShow = choosePresentation(result.response, seen);
        } catch (cause) {
          storageError(latestOnError.current, cause);
          return metadata;
        }
      }
      if (presentationToShow !== null && active && mounted.current && (!presentedThisMount.current || required)) {
        presentedThisMount.current = true;
        const next = { value: presentationToShow, keys };
        displayRef.current = next;
        setDisplay(next);
      }
      return metadata;
    };

    const initial = async (): Promise<void> => {
      if (requestedInitialCheck.current) return;
      requestedInitialCheck.current = true;
      await runCheck();
    };

    const foreground = async (): Promise<void> => {
      const metadata = getRuntimeMetadata(locale, report, runtimeMetadata);
      if (metadata === null) return;
      const keys = createStorageKeys(appId, metadata.platform, metadata.buildNumber, 0);
      try {
        const lastSuccess = await storage.getItem(keys.lastSuccess);
        if (!shouldRecheckInForeground(lastSuccess, Date.now(), foregroundIntervalMs)) return;
      } catch (cause) {
        storageError(latestOnError.current, cause);
        return;
      }
      await runCheck();
    };

    void initial();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void foreground();
    });
    return () => {
      active = false;
      controller.abort();
      subscription.remove();
    };
  }, [
    apiUrl,
    appId,
    enabled,
    foregroundIntervalMs,
    locale,
    runtimeMetadata?.buildNumber,
    runtimeMetadata?.locale,
    runtimeMetadata?.nativeApplicationId,
    runtimeMetadata?.platform,
    runtimeMetadata?.version,
    storage,
    timeoutMs,
  ]);

  const openStore = async (url: string): Promise<void> => {
    try {
      if (new URL(url).protocol !== 'https:') throw new Error('Store URL must use HTTPS.');
      if (onOpenStore !== undefined) await onOpenStore(url);
      else await Linking.openURL(url);
    } catch (cause) {
      try { latestOnError.current?.({ code: 'store-open', message: 'VibeUpdate could not open the store URL.', cause }); } catch { /* Fail open. */ }
    }
  };

  const openLink = async (url: string): Promise<void> => {
    try {
      const protocol = new URL(url).protocol;
      if (protocol !== 'https:' && protocol !== 'mailto:') {
        throw new Error('Link URL must use HTTPS or mailto.');
      }
      await Linking.openURL(url);
    } catch (cause) {
      try { latestOnError.current?.({ code: 'link-open', message: 'VibeUpdate could not open the changelog link.', cause }); } catch { /* Fail open. */ }
    }
  };

  if (!enabled || display === null) return null;
  return (
    <UpdateDialog
      presentation={display.value}
      locale={locale ?? getRuntimeMetadata(undefined, undefined, runtimeMetadata)?.locale ?? 'en'}
      onDismiss={() => { displayRef.current = null; setDisplay(null); }}
      onShown={() => {
        if (displayRef.current !== display || (display.value.kind !== 'optional' && display.value.kind !== 'changelog')) return;
        void markPresentationSeen(storage, display.keys, display.value.kind)
          .catch((cause: unknown) => { storageError(latestOnError.current, cause); });
      }}
      onOpenStore={openStore}
      onOpenLink={openLink}
      {...(theme === undefined ? {} : { theme })}
      {...(stringOverrides === undefined ? {} : { stringOverrides })}
    />
  );
}
