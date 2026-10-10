export type PlatformName = 'ios' | 'android';
export type UpdateMode = 'optional' | 'persistent' | 'required';
export type PresentationKind = UpdateMode | 'changelog';

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface RuntimeMetadata {
  platform: PlatformName;
  nativeApplicationId: string;
  buildNumber: number;
  version: string;
  locale: string;
}

export interface UpdateResponse {
  mode: UpdateMode;
  targetBuildNumber: number;
  version: string;
  storeUrl: string;
  changelog: string;
  changelogLocale: string;
}

export interface ChangelogResponse {
  buildNumber: number;
  version: string;
  markdown: string;
  locale: string;
}

export interface CheckResponse {
  update: UpdateResponse | null;
  changelog: ChangelogResponse | null;
}

export interface SeenState {
  changelogSeen: boolean;
  optionalSeen: boolean;
}

export type Presentation =
  | { kind: UpdateMode; update: UpdateResponse }
  | { kind: 'changelog'; changelog: ChangelogResponse };

export type VibeUpdateErrorCode =
  | 'invalid-metadata'
  | 'invalid-config'
  | 'network'
  | 'timeout'
  | 'http'
  | 'invalid-response'
  | 'storage'
  | 'store-open'
  | 'link-open';

export interface VibeUpdateError {
  code: VibeUpdateErrorCode;
  message: string;
  cause?: unknown;
  status?: number;
}

export interface VibeUpdateStrings {
  requiredTitle: string;
  persistentTitle: string;
  optionalTitle: string;
  changelogTitle: string;
  updateNow: string;
  later: string;
  close: string;
  versionLabel: string;
}

export type VibeUpdateStringOverrides = Partial<VibeUpdateStrings>;

export interface VibeUpdateTheme {
  backdrop: string;
  surface: string;
  elevatedSurface: string;
  text: string;
  mutedText: string;
  accent: string;
  accentText: string;
  border: string;
  pressed: string;
  cornerRadius: number;
}

export type VibeUpdateThemeOverride = Partial<VibeUpdateTheme>;

export interface VibeUpdateProps {
  appId: string;
  apiUrl?: string;
  timeoutMs?: number;
  foregroundIntervalMs?: number;
  newUserGracePeriodMs?: number;
  storage?: StorageAdapter;
  theme?: VibeUpdateThemeOverride;
  stringOverrides?: VibeUpdateStringOverrides;
  locale?: string;
  runtimeMetadata?: Partial<RuntimeMetadata>;
  onError?: (error: VibeUpdateError) => void;
  onOpenStore?: (url: string) => void | Promise<void>;
  enabled?: boolean;
}

export interface CheckVibeUpdateOptions {
  appId: string;
  apiUrl?: string;
  timeoutMs?: number;
  storage?: StorageAdapter;
  locale?: string;
  runtimeMetadata?: Partial<RuntimeMetadata>;
  onError?: (error: VibeUpdateError) => void;
}

export interface CheckVibeUpdateResult {
  response: CheckResponse;
  metadata: RuntimeMetadata;
  checkedAt: number;
  fromCache: boolean;
}
