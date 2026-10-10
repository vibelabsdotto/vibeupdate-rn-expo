import type { PlatformName, PresentationKind, SeenState, StorageAdapter } from './types.js';

const PREFIX = '@vibelabsdotto/vibeupdate:v1';

export interface StorageKeys {
  cache: string;
  lastSuccess: string;
  changelogSeen: string;
  optionalSeen: string;
}

function storageScope(appId: string, platform: PlatformName): string {
  return `${PREFIX}:${encodeURIComponent(appId)}:${platform}`;
}

export function createStorageKeys(
  appId: string,
  platform: PlatformName,
  installedBuild: number,
  targetBuild: number,
): StorageKeys {
  const scope = storageScope(appId, platform);
  return {
    cache: `${scope}:check-cache`,
    lastSuccess: `${scope}:last-success`,
    // One notes key follows the release: target before install, installed build after install.
    changelogSeen: `${scope}:changelog:${targetBuild || installedBuild}`,
    // An older SDK only recorded this key when showing an Optional target.
    optionalSeen: `${scope}:optional:${targetBuild || installedBuild}`,
  };
}

/**
 * Returns when VibeUpdate first ran on this installation, recording it on the first call.
 * An installation with a successful check from an earlier SDK version counts as established (0).
 */
export async function resolveFirstLaunch(
  storage: StorageAdapter,
  appId: string,
  platform: PlatformName,
  installedBuild: number,
  now: number,
): Promise<number> {
  const firstLaunchKey = `${storageScope(appId, platform)}:first-launch`;
  const stored = Number((await storage.getItem(firstLaunchKey)) ?? Number.NaN);
  if (Number.isFinite(stored) && stored >= 0) return stored;
  const keys = createStorageKeys(appId, platform, installedBuild, 0);
  if ((await storage.getItem(keys.lastSuccess)) !== null) {
    await storage.setItem(firstLaunchKey, '0');
    return 0;
  }
  // A new user never needs What's new for the build they just installed.
  await storage.setItem(keys.changelogSeen, '1');
  await storage.setItem(firstLaunchKey, String(now));
  return now;
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
