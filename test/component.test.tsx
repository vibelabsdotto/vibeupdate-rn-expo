import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { metadata, optionalResponse } from './fixtures.js';

beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); });

const boundary = vi.hoisted(() => ({
  appStateListener: undefined as ((state: string) => void) | undefined,
  listenerRemovals: 0,
  checkApi: vi.fn(),
  openURL: vi.fn(),
  data: new Map<string, string>(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => boundary.data.get(key) ?? null,
    setItem: async (key: string, value: string) => { boundary.data.set(key, value); },
    removeItem: async (key: string) => { boundary.data.delete(key); },
  },
}));
vi.mock('../src/api.js', () => ({ checkApi: boundary.checkApi }));
vi.mock('../src/metadata.js', () => ({ getRuntimeMetadata: () => metadata }));
vi.mock('../src/ui.js', async () => {
  const ReactModule = await import('react');
  return { UpdateDialog: (props: Record<string, unknown>) => ReactModule.createElement('UpdateDialog', props) };
});
vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      boundary.appStateListener = listener;
      return { remove: () => {
        boundary.listenerRemovals += 1;
        if (boundary.appStateListener === listener) boundary.appStateListener = undefined;
      } };
    },
  },
  Linking: { openURL: boundary.openURL },
}));

describe('VibeUpdate mount behavior', () => {
  beforeEach(() => {
    boundary.data.clear();
    boundary.checkApi.mockReset();
    boundary.openURL.mockReset();
    boundary.openURL.mockResolvedValue(undefined);
    boundary.listenerRemovals = 0;
    boundary.appStateListener = undefined;
    boundary.checkApi.mockResolvedValue({ response: optionalResponse, checkedAt: 1, fromCache: false });
  });

  it('checks after render and never presents more than one dialog per mount', async () => {
    const { VibeUpdate } = await import('../src/VibeUpdate.js');
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<VibeUpdate appId="app_x" foregroundIntervalMs={0} />); });
    const firstDialog = renderer.root.findByType('UpdateDialog' as React.ElementType);
    expect(firstDialog.props.presentation.kind).toBe('optional');
    expect(firstDialog.props.presentation.update.changelog).toBe(optionalResponse.update?.changelog);
    await act(async () => { firstDialog.props.onShown(); });
    expect(boundary.data.get('@vibelabsdotto/vibeupdate:v1:app_x:ios:changelog:42')).toBe('1');
    expect(boundary.data.get('@vibelabsdotto/vibeupdate:v1:app_x:ios:optional:42')).toBe('1');
    act(() => { firstDialog.props.onDismiss(); });
    expect(renderer.root.findAllByType('UpdateDialog' as React.ElementType)).toHaveLength(0);
    await act(async () => { boundary.appStateListener?.('active'); });
    expect(boundary.checkApi).toHaveBeenCalledTimes(2);
    expect(renderer.root.findAllByType('UpdateDialog' as React.ElementType)).toHaveLength(0);
  });

  it('does nothing when disabled', async () => {
    const { VibeUpdate } = await import('../src/VibeUpdate.js');
    await act(async () => { TestRenderer.create(<VibeUpdate appId="app_x" enabled={false} />); });
    expect(boundary.checkApi).not.toHaveBeenCalled();
  });

  it('reports rejected changelog links without throwing into the host app', async () => {
    boundary.openURL.mockRejectedValueOnce(new Error('cannot open'));
    const onError = vi.fn();
    const { VibeUpdate } = await import('../src/VibeUpdate.js');
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<VibeUpdate appId="app_x" onError={onError} />);
    });
    const dialog = renderer.root.findByType('UpdateDialog' as React.ElementType);
    await expect(
      act(async () => dialog.props.onOpenLink('https://example.com/docs')),
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'link-open' }),
    );
  });

  it('starts a fresh lifecycle and removes the old listener when appId changes', async () => {
    const { VibeUpdate } = await import('../src/VibeUpdate.js');
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<VibeUpdate appId="app_old" />); });
    expect(boundary.checkApi).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByType('UpdateDialog' as React.ElementType)).toHaveLength(1);

    await act(async () => { renderer.update(<VibeUpdate appId="app_new" />); });

    expect(boundary.listenerRemovals).toBe(1);
    expect(boundary.checkApi).toHaveBeenCalledTimes(2);
    expect(boundary.checkApi.mock.calls[1]?.[0]).toMatchObject({ appId: 'app_new' });
    expect(renderer.root.findAllByType('UpdateDialog' as React.ElementType)).toHaveLength(1);
  });

  it('checks and may present after changing from disabled to enabled', async () => {
    const { VibeUpdate } = await import('../src/VibeUpdate.js');
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<VibeUpdate appId="app_x" enabled={false} />); });
    await act(async () => { renderer.update(<VibeUpdate appId="app_x" enabled />); });
    expect(boundary.checkApi).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByType('UpdateDialog' as React.ElementType)).toHaveLength(1);
  });

  it('aborts stale checks and never presents their response after a config change', async () => {
    const { VibeUpdate } = await import('../src/VibeUpdate.js');
    let resolveOld!: (value: { response: typeof optionalResponse; checkedAt: number; fromCache: boolean }) => void;
    boundary.checkApi
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(null);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<VibeUpdate appId="app_old" />); });
    const oldSignal = boundary.checkApi.mock.calls[0]?.[0].signal as AbortSignal;

    await act(async () => { renderer.update(<VibeUpdate appId="app_new" />); });
    expect(oldSignal.aborted).toBe(true);
    await act(async () => { resolveOld({ response: optionalResponse, checkedAt: 1, fromCache: false }); });
    expect(renderer.root.findAllByType('UpdateDialog' as React.ElementType)).toHaveLength(0);
  });

  it('aborts the active check and removes the AppState listener on unmount', async () => {
    const { VibeUpdate } = await import('../src/VibeUpdate.js');
    boundary.checkApi.mockImplementationOnce(() => new Promise(() => undefined));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<VibeUpdate appId="app_x" />); });
    const signal = boundary.checkApi.mock.calls[0]?.[0].signal as AbortSignal;
    await act(async () => { renderer.unmount(); });
    expect(signal.aborted).toBe(true);
    expect(boundary.listenerRemovals).toBe(1);
    expect(boundary.appStateListener).toBeUndefined();
  });
});
