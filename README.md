# @vibelabsdotto/vibeupdate

Public Expo and React Native SDK for localized changelogs and optional, persistent, or required store-update prompts. It checks after the host app's first render, renders no loader, creates no device or user identifiers, and fails open when no trustworthy current server response is available.

## Compatibility

- Expo SDK 54–57
- React Native 0.81–0.86
- React 19.1–19.x
- iOS and Android in Expo Go, development builds, managed apps, and prebuild apps
- Node.js 24 for developing or building this package

There is no custom native code and no dependency on Gorhom, Reanimated, Gesture Handler, or a WebView.

## Installation

Install the published SDK, then let Expo select versions of its native modules compatible with your SDK:

```sh
npm install @vibelabsdotto/vibeupdate
npx expo install expo-application expo-localization @react-native-async-storage/async-storage
```

`react`, `react-native`, and `expo` are peer dependencies normally already present in an Expo app. Native modules require a development or production build after installation; Expo Go uses its host metadata (see below).

## Release CLI and local simulator demo

The agent CLI is a **separate package**, not a command installed by this Expo SDK. To manage apps and releases, use [@vibelabsdotto/vibeupdate-cli](https://www.npmjs.com/package/@vibelabsdotto/vibeupdate-cli) or the dashboard:

```sh
npm install -g @vibelabsdotto/vibeupdate-cli
vibeupdate --help
```

Create an agent token under Dashboard → Agent Tokens and pass it to `vibeupdate context set-token VibeUpdate.app --token-stdin` through a private local file or secret-manager pipe. Do not put tokens in chat, shell arguments, environment variables, tracked files, or logs. The [agent setup skill](https://raw.githubusercontent.com/vibelabsdotto/vibeupdate-rn-expo/main/skills/vibeupdate/SKILL.md) documents safe CLI setup, internal versus public app IDs, SDK configuration, and release commands. Neither the CLI nor this SDK uploads an IPA/AAB or deploys an Expo OTA update.

For a local iOS Simulator smoke with the sibling backend running on port 3200:

```sh
npm ci && npm run build
cd example && npm ci
EXPO_PUBLIC_VIBEUPDATE_APP_ID='<public-app-id>' npx expo run:ios
```

The demo defaults to a local-only public app ID created during development; override it for another database. Override `EXPO_PUBLIC_VIBEUPDATE_API_URL` if the backend is elsewhere. iOS Simulator uses `localhost`; for Android Emulator first run `adb reverse tcp:3200 tcp:3200` so `localhost` reaches the development backend. The SDK intentionally rejects plain HTTP to `10.0.2.2`; do not loosen this in a production integration. `example/app.json` sets native build 1, the demo bundle ID, and iOS local-network HTTP permission **for this local smoke only**; don't copy that exception into a production app. The demo has **Check API**, **Remount SDK**, and **Reset demo state** controls to inspect an installed-build changelog when no update is available, then Optional, Persistent, and Required releases without reinstalling the native app. A real store listing and build are needed to verify the external Store action; the fixture Store URL is only a placeholder.

## Minimal integration

Mount the component once near the root of the app:

```tsx
import { VibeUpdate } from '@vibelabsdotto/vibeupdate';

export default function RootLayout() {
  return (
    <>
      <YourApp />
      <VibeUpdate appId="app_xxx" />
    </>
  );
}
```

The initial request starts in an effect after the first render. Normally at most one full-screen modal page is presented per component mount; a newly published Required update can replace an earlier page or appear after that page was dismissed on a later foreground check. Every update prompt shows the **target version's** release notes with an Update now action. Optional appears once per target build, Persistent on each fresh app launch until updated, and Required on each fresh launch until updated with no dismiss action. Optional and Persistent have Later. If no update is available, the installed build's release notes appear once with a Close action, but only if the SDK has not already shown those notes in an update prompt. An automatic store update can therefore produce a one-time "What's new" page without an update action. Any available update takes priority over installed-build notes, including an Optional prompt that was already shown.

## Props

| Prop | Type | Default | Purpose |
| --- | --- | --- | --- |
| `appId` | `string` | required | Public VibeUpdate app ID (`app_xxx`). |
| `apiUrl` | `string` | `https://api.vibeupdate.app` | API origin. HTTPS is required except for localhost development. |
| `timeoutMs` | `number` | `3000` | AbortController request timeout. |
| `foregroundIntervalMs` | `number` | `21600000` (6h) | Minimum time since the last successful check before an active-state recheck. |
| `storage` | `StorageAdapter` | AsyncStorage | Custom local storage implementation. |
| `theme` | `VibeUpdateThemeOverride` | system light/dark | Local visual token overrides. |
| `stringOverrides` | `VibeUpdateStringOverrides` | resolved UI language | Local UI-copy overrides applied last. |
| `locale` | `string` | device locale | Locale override for the API request and built-in UI. |
| `runtimeMetadata` | `Partial<RuntimeMetadata>` | native Expo values | Overrides application ID, build, version, platform, or locale for Expo Go/preview environments. |
| `onError` | `(error) => void` | none | Receives local errors without changing fail-open behavior. |
| `onOpenStore` | `(url) => void \| Promise<void>` | `Linking.openURL` | Overrides the validated HTTPS store-opening action. |
| `enabled` | `boolean` | `true` | Disables checks and UI when false. |

The optional imperative API uses the same metadata, validation, ETag, timeout, and fail-open behavior:

```ts
import { checkVibeUpdate } from '@vibelabsdotto/vibeupdate';

const result = await checkVibeUpdate({ appId: 'app_xxx' });
// null means fail-open or no trustworthy current response.
```

Expo Go exposes the Expo host app's native metadata rather than your app's future store identity. For accurate checks there, pass the values you intend to publish:

```tsx
<VibeUpdate
  appId="app_xxx"
  runtimeMetadata={{
    nativeApplicationId: 'com.example.app',
    buildNumber: 42,
    version: '1.2.0',
  }}
/>
```

Build numbers must be positive integers on both platforms. In particular, use a numeric iOS `CFBundleVersion` (Expo `ios.buildNumber`), not a dotted value like `3.1.2`. If a preview host has a nonnumeric native build, pass an explicit numeric `runtimeMetadata.buildNumber` matching the published release. Native application IDs, versions, and locale tags must fit the backend request limits (255, 50, and 35 characters respectively); locale tags must be valid BCP-47.

## Theme

The component follows `useColorScheme()` and accepts any subset of these flat tokens:

```tsx
<VibeUpdate
  appId="app_xxx"
  theme={{
    accent: '#3559E0',
    accentText: '#FDFDFF',
    surface: '#F8F9FC',
    elevatedSurface: '#EEF0F6',
    text: '#171920',
    mutedText: '#626775',
    border: '#DDE0E8',
    backdrop: 'rgba(18, 20, 27, 0.52)',
    pressed: '#2948C4',
    cornerRadius: 20,
  }}
/>
```

All styling remains local. The backend cannot remotely configure theme or UI strings.

## Strings and locales

Built-in UI dictionaries are provided for exactly: `en`, `zh-Hans`, `zh-Hant`, `es`, `pt-BR`, `fr`, `de`, `ja`, `ko`, `ar`, `hi`, `id`, `tr`, `it`, `ru`, `vi`, `th`, `pl`, `nl`, and `uk`.

Resolution is exact locale, then supported base language, then English. Chinese script/region forms resolve to `zh-Hans` or `zh-Hant`; only Brazilian Portuguese resolves to `pt-BR`. Override any final UI string locally:

```tsx
<VibeUpdate
  appId="app_xxx"
  locale="de-DE"
  stringOverrides={{ updateNow: 'Zum Store', later: 'Nicht jetzt' }}
/>
```

Available keys are `requiredTitle`, `persistentTitle`, `optionalTitle`, `changelogTitle`, `updateNow`, `later`, `close`, and `versionLabel`.

## Storage

AsyncStorage is the default. A custom adapter only needs three asynchronous methods:

```ts
import type { StorageAdapter } from '@vibelabsdotto/vibeupdate';

const storage: StorageAdapter = {
  getItem: async (key) => myStore.read(key),
  setItem: async (key, value) => myStore.write(key, value),
  removeItem: async (key) => myStore.remove(key),
};
```

Keys are namespaced with `@vibelabsdotto/vibeupdate:v1` and scoped by app and platform. One release-notes key follows each build: showing its notes in a target-version update prompt marks the same key checked after that build is installed. The installed build's "What's new" page appears only if that key is unseen and no update is available. A separate target-build key tracks whether an Optional invitation was shown. Persistent and Required prompts ignore the notes key and repeat on every new mount while a current successful response still calls for the update. Seen keys are written when the modal appears, not when the user taps Update now or dismisses it. Optional prompts shown by SDK 0.1.x are recognized through their existing seen key; that version did not record impressions for Persistent or Required prompts, so their notes may appear once after updating an existing integration to 0.2.0.

## Errors and fail-open behavior

`onError` receives a `VibeUpdateError` with one of these codes: `invalid-metadata`, `invalid-config`, `network`, `timeout`, `http`, `invalid-response`, `storage`, `store-open`, or `link-open`.

```tsx
<VibeUpdate
  appId="app_xxx"
  onError={(error) => localLogger.warn(error.code, error.message)}
/>
```

Invalid Expo application metadata and likely app-ID/native-ID configuration mistakes emit a clear `console.warn` in development. Production remains silent unless `onError` is supplied. Errors thrown by host callbacks are contained.

Only a current HTTP 200 response, or an HTTP 304 that confirms a locally validated ETag response, may activate Required. Timeouts, offline errors, 4xx/5xx responses, invalid JSON, and invalid response fields never activate a cached Required response. A storage **write** failure is reported through `onError` but does not discard a fresh 200 response or a confirmed 304; a failed seen-state read suppresses Optional and the installed-build "What's new" page instead of guessing whether they were shown. Persistent and Required still display if reading seen state fails.

## Privacy

Each check sends only:

- public VibeUpdate `appId`
- `platform` (`ios` or `android`)
- native bundle ID or package name
- native integer build number
- visible native version
- locale

The SDK creates and sends no device ID, installation ID, user ID, analytics event, impression, click, or dismiss telemetry.

## Safe changelog Markdown

The native renderer supports paragraphs, headings, ordered and unordered lists, bold, italic, and links. It never renders HTML, scripts, images, WebViews, or custom components. Only `https://` and `mailto:` links are clickable; all other schemes are plain text. The backend limits each Markdown field to 100,000 characters; the renderer does not silently truncate accepted content.

## SDK check response

`GET /api/v1/sdk/apps/:appId/check` receives `platform`, `nativeApplicationId`, `buildNumber`, `version`, and `locale` as query parameters. A successful response follows this contract:

```json
{
  "update": {
    "mode": "optional",
    "targetBuildNumber": 124,
    "version": "1.5.0",
    "storeUrl": "https://apps.apple.com/app/id123456789",
    "changelog": "## Faster and calmer\n\n- Improved launch time\n- Fixed offline sync",
    "changelogLocale": "en"
  },
  "changelog": {
    "buildNumber": 123,
    "version": "1.4.0",
    "markdown": "## Welcome to 1.4\n\nYour installed release notes.",
    "locale": "en"
  }
}
```

Either field may be `null`. `update.mode` is `optional`, `persistent`, or `required`. `changelog.buildNumber` must equal the installed build, `targetBuildNumber` must be newer, and `storeUrl` must be HTTPS. The server may return an `ETag`; the next request sends `If-None-Match`, and a bodyless `304` confirms that validated response as current.

## License

MIT
