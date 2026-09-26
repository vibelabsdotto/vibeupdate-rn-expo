import { describe, expect, it } from 'vitest';
import { createStorageKeys, getSeenState, markPresentationSeen } from '../src/storage.js';
import type { StorageAdapter } from '../src/types.js';
import { optionalResponse } from './fixtures.js';

function memoryStorage(): StorageAdapter & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => { data.set(key, value); },
    removeItem: async (key) => { data.delete(key); },
  };
}

describe('namespaced seen storage', () => {
  it('scopes keys by schema, app, platform, installed and target build', () => {
    expect(createStorageKeys('app/a', 'ios', 41, 42)).toEqual({
      cache: '@vibelabsdotto/vibeupdate:v1:app%2Fa:ios:check-cache',
      lastSuccess: '@vibelabsdotto/vibeupdate:v1:app%2Fa:ios:last-success',
      changelogSeen: '@vibelabsdotto/vibeupdate:v1:app%2Fa:ios:changelog:42',
      optionalSeen: '@vibelabsdotto/vibeupdate:v1:app%2Fa:ios:optional:42',
    });
    expect(createStorageKeys('app/a', 'ios', 42, 0).changelogSeen)
      .toBe(createStorageKeys('app/a', 'ios', 41, 42).changelogSeen);
  });

  it('records target notes for each update mode but tracks only Optional invitation separately', async () => {
    const storage = memoryStorage();
    const keys = createStorageKeys('app_x', 'ios', 41, 42);
    await markPresentationSeen(storage, keys, 'persistent');
    await markPresentationSeen(storage, keys, 'required');
    expect(await getSeenState(storage, keys)).toEqual({ changelogSeen: true, optionalSeen: false });
    expect(storage.data.size).toBe(1);
    await markPresentationSeen(storage, keys, 'optional');
    expect(await getSeenState(storage, keys)).toEqual({ changelogSeen: true, optionalSeen: true });
    expect(storage.data.size).toBe(2);
    expect((await getSeenState(storage, createStorageKeys('app_x', 'ios', 42, 0))).changelogSeen).toBe(true);
    await markPresentationSeen(storage, createStorageKeys('app_x', 'ios', 43, 0), 'changelog');
    expect((await getSeenState(storage, createStorageKeys('app_x', 'ios', 43, 0))).changelogSeen).toBe(true);
    expect(optionalResponse.update?.targetBuildNumber).toBe(42);
  });
});
