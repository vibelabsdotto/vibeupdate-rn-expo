import type { PlatformName, PresentationKind, SeenState, StorageAdapter } from './types.js';

const PREFIX = '@vibelabsdotto/vibeupdate:v1';

export interface StorageKeys {
  cache: string;
  lastSuccess: string;
  changelogSeen: string;
  optionalSeen: string;
}

export function createStorageKeys(
  appId: string,
  platform: PlatformName,
  installedBuild: number,
  targetBuild: number,
): StorageKeys {
  const scope = `${PREFIX}:${encodeURIComponent(appId)}:${platform}`;
  return {
    cache: `${scope}:check-cache`,
    lastSuccess: `${scope}:last-success`,
    // One notes key follows the release: target before install, installed build after install.
    changelogSeen: `${scope}:changelog:${targetBuild || installedBuild}`,
    // An older SDK only recorded this key when showing an Optional target.
    optionalSeen: `${scope}:optional:${targetBuild || installedBuild}`,
  };
}

export async function getSeenState(storage: StorageAdapter, keys: StorageKeys): Promise<SeenState> {
  const [changelog, optional] = await Promise.all([
    storage.getItem(keys.changelogSeen),
    storage.getItem(keys.optionalSeen),
  ]);
  return { changelogSeen: changelog === '1', optionalSeen: optional === '1' };
}

export async function markPresentationSeen(
  storage: StorageAdapter,
  keys: StorageKeys,
  kind: PresentationKind,
): Promise<void> {
  if (kind === 'optional') {
    await storage.setItem(keys.optionalSeen, '1');
  }
  await storage.setItem(keys.changelogSeen, '1');
}
