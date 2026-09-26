import { describe, expect, it } from 'vitest';
import { choosePresentation } from '../src/decision.js';
import type { CheckResponse, SeenState } from '../src/types.js';
import { optionalResponse } from './fixtures.js';

const unseen: SeenState = { changelogSeen: false, optionalSeen: false };

function withMode(mode: 'optional' | 'persistent' | 'required'): CheckResponse {
  return { ...optionalResponse, update: { ...optionalResponse.update!, mode } };
}

describe('dialog priority', () => {
  it.each([
    ['required', 'required'],
    ['persistent', 'persistent'],
    ['optional', 'optional'],
  ] as const)('chooses %s response as %s', (mode, expected) => {
    expect(choosePresentation(withMode(mode), unseen)?.kind).toBe(expected);
  });

  it('shows optional regardless of whether the older installed changelog was seen', () => {
    expect(choosePresentation(withMode('optional'), unseen)?.kind).toBe('optional');
    expect(choosePresentation(withMode('optional'), { ...unseen, changelogSeen: true })?.kind).toBe('optional');
  });

  it('does not show old installed notes after the optional invitation was seen', () => {
    expect(choosePresentation(withMode('optional'), { changelogSeen: false, optionalSeen: true })).toBeNull();
  });

  it('prioritizes every update and changelog combination', () => {
    const cases = [
      [withMode('required'), { changelogSeen: true, optionalSeen: true }, 'required'],
      [withMode('persistent'), { changelogSeen: true, optionalSeen: true }, 'persistent'],
      [withMode('optional'), unseen, 'optional'],
      [withMode('optional'), { changelogSeen: true, optionalSeen: false }, 'optional'],
      [{ update: null, changelog: optionalResponse.changelog }, unseen, 'changelog'],
      [{ update: null, changelog: optionalResponse.changelog }, { changelogSeen: true, optionalSeen: false }, null],
      [{ update: optionalResponse.update, changelog: null }, unseen, 'optional'],
      [{ update: null, changelog: null }, unseen, null],
    ] as const;
    for (const [response, seen, expected] of cases) {
      expect(choosePresentation(response, seen)?.kind ?? null).toBe(expected);
    }
  });
});
