import type { ChangelogResponse, CheckResponse, UpdateMode, UpdateResponse } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, max = 100_000): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function isBuild(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0;
}

function isLocale(value: unknown): value is string {
  return isNonEmptyString(value, 100) && /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(value);
}

function isHttpsUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

function parseUpdate(value: unknown): UpdateResponse | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const mode = value.mode;
  if (mode !== 'optional' && mode !== 'persistent' && mode !== 'required') return undefined;
  if (!isBuild(value.targetBuildNumber) || !isNonEmptyString(value.version, 50) || !isHttpsUrl(value.storeUrl) || !isNonEmptyString(value.changelog) || !isLocale(value.changelogLocale)) return undefined;
  return {
    mode: mode as UpdateMode,
    targetBuildNumber: value.targetBuildNumber,
    version: value.version.trim(),
    storeUrl: value.storeUrl,
    changelog: value.changelog,
    changelogLocale: value.changelogLocale,
  };
}

function parseChangelog(value: unknown): ChangelogResponse | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  if (!isBuild(value.buildNumber) || !isNonEmptyString(value.version, 50) || !isNonEmptyString(value.markdown) || !isLocale(value.locale)) return undefined;
  return { buildNumber: value.buildNumber, version: value.version.trim(), markdown: value.markdown, locale: value.locale };
}

export function parseCheckResponse(value: unknown): CheckResponse | null {
  if (!isRecord(value) || !('update' in value) || !('changelog' in value)) return null;
  const update = parseUpdate(value.update);
  const changelog = parseChangelog(value.changelog);
  return update === undefined || changelog === undefined ? null : { update, changelog };
}
