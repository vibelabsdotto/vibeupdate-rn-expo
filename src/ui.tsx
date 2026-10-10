import React from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { parseMarkdown, type InlineNode } from './markdown.js';
import { resolveStrings } from './locales.js';
import { resolveTheme } from './theme.js';
import type { Presentation, VibeUpdateStringOverrides, VibeUpdateThemeOverride } from './types.js';

export interface UpdateDialogProps {
  presentation: Presentation;
  locale: string;
  onDismiss: () => void;
  onShown?: () => void;
  onOpenStore: (url: string) => void | Promise<void>;
  onOpenLink?: (url: string) => void | Promise<void>;
  theme?: VibeUpdateThemeOverride;
  stringOverrides?: VibeUpdateStringOverrides;
}

interface InlineProps {
  nodes: InlineNode[];
  style?: StyleProp<TextStyle>;
  color: string;
  accent: string;
  onOpenLink: (url: string) => void | Promise<void>;
}

function Inline({ nodes, style, color, accent, onOpenLink }: InlineProps): React.JSX.Element {
  return (
    <Text style={[{ color }, style]} allowFontScaling maxFontSizeMultiplier={2}>
      {nodes.map((node, index) => {
        if (node.type === 'text') return node.text;
        if (node.type === 'bold') return <Inline key={index} nodes={node.children} color={color} accent={accent} onOpenLink={onOpenLink} style={styles.bold} />;
        if (node.type === 'italic') return <Inline key={index} nodes={node.children} color={color} accent={accent} onOpenLink={onOpenLink} style={styles.italic} />;
        return (
          <Text
            key={index}
            accessibilityRole="link"
            onPress={() => { void onOpenLink(node.url); }}
            style={{ color: accent, textDecorationLine: 'underline' }}
          >
            <Inline nodes={node.children} color={accent} accent={accent} onOpenLink={onOpenLink} />
          </Text>
        );
      })}
    </Text>
  );
}

function Markdown({ markdown, text, accent, onOpenLink }: { markdown: string; text: string; accent: string; onOpenLink: (url: string) => void | Promise<void> }): React.JSX.Element {
  const blocks = parseMarkdown(markdown);
  return (
    <View accessible={false}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return <Inline key={index} nodes={block.children} color={text} accent={accent} onOpenLink={onOpenLink} style={[styles.heading, block.level > 2 && styles.smallHeading]} />;
        }
        if (block.type === 'list') {
          return (
            <View key={index} style={styles.list}>
              {block.items.map((item, itemIndex) => (
                <View key={itemIndex} style={styles.listRow}>
                  <Text style={[styles.bullet, { color: text }]} allowFontScaling>{block.ordered ? `${itemIndex + 1}.` : '•'}</Text>
                  <Inline nodes={item} color={text} accent={accent} onOpenLink={onOpenLink} style={styles.body} />
                </View>
              ))}
            </View>
          );
        }
        return <Inline key={index} nodes={block.children} color={text} accent={accent} onOpenLink={onOpenLink} style={styles.body} />;
      })}
    </View>
  );
}

export function UpdateDialog({
  presentation,
  locale,
  onDismiss,
  onShown,
  onOpenStore,
  onOpenLink = async (url: string) => {
    try { await Linking.openURL(url); } catch { /* Fail open for direct internal use. */ }
  },
  theme: themeOverride,
  stringOverrides,
}: UpdateDialogProps): React.JSX.Element {
  const theme = resolveTheme(useColorScheme(), themeOverride);
  const strings = resolveStrings(locale, stringOverrides);
  const required = presentation.kind === 'required';
  const isUpdate = presentation.kind !== 'changelog';
  const title = presentation.kind === 'required'
    ? strings.requiredTitle
    : presentation.kind === 'persistent'
      ? strings.persistentTitle
      : presentation.kind === 'optional'
        ? strings.optionalTitle
        : strings.changelogTitle;
  const version = isUpdate ? presentation.update.version : presentation.changelog.version;
  const markdown = isUpdate ? presentation.update.changelog : presentation.changelog.markdown;

  const dismiss = (): void => { if (!required) onDismiss(); };

  return (
    <Modal
      visible
      presentationStyle="fullScreen"
      animationType="slide"
      onRequestClose={dismiss}
      onShow={onShown}
      accessibilityViewIsModal
    >
      {/* Android Modals are separate edge-to-edge windows, so they need their own inset provider. */}
      <SafeAreaProvider>
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.surface }]}>
          <View style={styles.page}>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]} allowFontScaling maxFontSizeMultiplier={1.8}>{title}</Text>
              <Text style={[styles.version, { color: theme.mutedText }]} allowFontScaling maxFontSizeMultiplier={1.8}>{strings.versionLabel} {version}</Text>
            </View>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator>
              <Markdown markdown={markdown} text={theme.text} accent={theme.accent} onOpenLink={onOpenLink} />
            </ScrollView>
            <View style={styles.actions}>
              {isUpdate && (
                <Pressable
                  accessibilityLabel={strings.updateNow}
                  accessibilityRole="button"
                  onPress={() => { void onOpenStore(presentation.update.storeUrl); }}
                  style={({ pressed }) => [styles.primaryButton, { backgroundColor: pressed ? theme.pressed : theme.accent }]}
                >
                  <Text style={[styles.buttonText, { color: theme.accentText }]} allowFontScaling maxFontSizeMultiplier={2}>{strings.updateNow}</Text>
                </Pressable>
              )}
              {!required && (
                <Pressable
                  accessibilityLabel={isUpdate ? strings.later : strings.close}
                  accessibilityRole="button"
                  onPress={onDismiss}
                  style={({ pressed }) => [styles.secondaryLink, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text style={[styles.linkText, { color: theme.mutedText }]} allowFontScaling maxFontSizeMultiplier={2}>{isUpdate ? strings.later : strings.close}</Text>
                </Pressable>
              )}
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  page: { flex: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 20 },
  header: { gap: 7, marginBottom: 24 },
  title: { fontSize: 25, lineHeight: 31, fontWeight: '700', letterSpacing: -0.3 },
  version: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  heading: { display: 'flex', fontSize: 20, lineHeight: 27, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  smallHeading: { fontSize: 17, lineHeight: 24 },
  body: { display: 'flex', flexShrink: 1, fontSize: 16, lineHeight: 24, marginBottom: 12 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  list: { gap: 4, marginBottom: 10 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: { width: 20, fontSize: 16, lineHeight: 24, fontWeight: '600', textAlign: 'right' },
  actions: { gap: 6, marginTop: 16 },
  primaryButton: { minHeight: 52, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonText: { fontSize: 16, lineHeight: 22, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  linkText: { fontSize: 15, lineHeight: 21, fontWeight: '600', textAlign: 'center', textDecorationLine: 'underline' },
});
