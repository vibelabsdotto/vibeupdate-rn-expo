import type { CheckResponse, Presentation, SeenState } from './types.js';

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
