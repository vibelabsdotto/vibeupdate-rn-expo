import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { optionalResponse } from './fixtures.js';

beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); });

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const component = (name: string) => ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => ReactModule.createElement(name, props, children);
  class Value {
    constructor(public value: number) {}
  }
  return {
    Animated: {
      Value,
      View: component('AnimatedView'),
      timing: (value: Value, config: { toValue: number }) => ({ start: (callback?: () => void) => { value.value = config.toValue; callback?.(); } }),
    },
    Linking: { openURL: vi.fn(async () => undefined) },
    Modal: component('Modal'),
    Pressable: component('Pressable'),
    SafeAreaView: component('SafeAreaView'),
    ScrollView: component('ScrollView'),
    Text: component('Text'),
    View: component('View'),
    StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 },
    useColorScheme: () => 'light',
  };
});
vi.mock('react-native-safe-area-context', async () => {
  const ReactModule = await import('react');
  const component = (name: string) => ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => ReactModule.createElement(name, props, children);
  return { SafeAreaProvider: component('SafeAreaProvider'), SafeAreaView: component('SafeAreaView') };
});

const required = { kind: 'required' as const, update: { ...optionalResponse.update!, mode: 'required' as const } };
const optional = { kind: 'optional' as const, update: optionalResponse.update! };

describe('UpdateDialog', () => {
  it('does not dismiss Required through hardware back and only offers update', async () => {
    const onDismiss = vi.fn();
    const onOpenStore = vi.fn();
    const { UpdateDialog } = await import('../src/ui.js');
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(() => { renderer = TestRenderer.create(<UpdateDialog presentation={required} locale="en" onDismiss={onDismiss} onOpenStore={onOpenStore} />); });
    const modal = renderer.root.findByType('Modal' as React.ElementType);
    act(() => { modal.props.onRequestClose(); });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(renderer.root.findAll((node) => node.props.accessibilityLabel === 'Later')).toHaveLength(0);
    const update = renderer.root.findAllByType('Pressable' as React.ElementType).find((node) => node.props.accessibilityLabel === 'Update now');
    expect(update).toBeDefined();
    await act(() => update?.props.onPress());
    expect(onOpenStore).toHaveBeenCalledWith(required.update.storeUrl);
  });

  it('dismisses Optional through hardware back or the Later button', async () => {
    const onDismiss = vi.fn();
    const { UpdateDialog } = await import('../src/ui.js');
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(() => { renderer = TestRenderer.create(<UpdateDialog presentation={optional} locale="en" onDismiss={onDismiss} onOpenStore={vi.fn()} />); });
    act(() => { renderer.root.findByType('Modal' as React.ElementType).props.onRequestClose(); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    const later = renderer.root.findAllByType('Pressable' as React.ElementType).find((node) => node.props.accessibilityLabel === 'Later');
    act(() => { later?.props.onPress(); });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('renders changelog with a Close action and no update button', async () => {
    const { UpdateDialog } = await import('../src/ui.js');
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(() => { renderer = TestRenderer.create(<UpdateDialog presentation={{ kind: 'changelog', changelog: optionalResponse.changelog! }} locale="en" onDismiss={vi.fn()} onOpenStore={vi.fn()} />); });
    expect(renderer.root.findAllByType('Pressable' as React.ElementType).filter((node) => node.props.accessibilityLabel === 'Close')).toHaveLength(1);
    expect(renderer.root.findAllByType('Pressable' as React.ElementType).filter((node) => node.props.accessibilityLabel === 'Update now')).toHaveLength(0);
  });
});
