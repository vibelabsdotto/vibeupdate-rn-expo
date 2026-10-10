import type { CheckResponse, Presentation, SeenState } from './types.js';

export const DEFAULT_NEW_USER_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

export function choosePresentation(response: CheckResponse, seen: SeenState): Presentation | null {
  const update = response.update;
  if (update?.mode === 'required' || update?.mode === 'persistent') {
    return { kind: update.mode, update };
  }
  if (update?.mode === 'optional') {
    return seen.optionalSeen ? null : { kind: 'optional', update };
  }
  if (response.changelog !== null && !seen.changelogSeen && !seen.optionalSeen) {
    return { kind: 'changelog', changelog: response.changelog };
  }
  return null;
}

export function presentationIdentity(presentation: Presentation): string {
  return presentation.kind === 'changelog'
    ? `changelog:${presentation.changelog.buildNumber}`
    : `${presentation.kind}:${presentation.update.targetBuildNumber}`;
}

/** New users only see Required prompts until the grace period after their first launch has passed. */
export function withinNewUserGracePeriod(firstLaunch: number | null, now: number, gracePeriodMs: number): boolean {
  // An unreadable first launch stays quiet rather than interrupting a possibly new user.
  if (firstLaunch === null) return true;
  const age = now - firstLaunch;
  return age >= 0 && age < gracePeriodMs;
}
