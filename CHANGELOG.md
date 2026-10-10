# Changelog

All notable changes to this package are documented in this file.

## 0.4.0 - 2026-10-10

### Changed

- New users are not interrupted: What's new never appears for the build installed at the SDK's first launch, and only Required updates appear during the new `newUserGracePeriodMs` (default 24 hours). Installations with a successful check from an earlier SDK version are unaffected.
- Returning to the foreground rechecks after one hour instead of six hours (`foregroundIntervalMs`), and can show a prompt that has not appeared during the current mount. A visible prompt is not replaced unless the update is Required.

### Fixed

- On Android, update dialogs no longer place the title under the status bar or the Later/Close action under the navigation bar. The SDK now requires `react-native-safe-area-context` as a peer dependency.

## 0.3.0 - 2026-09-26

### Added

- A controlled `@vibelabsdotto/vibeupdate/preview` entry point for rendering update dialogs without an API request or seen-state writes.

### Changed

- Update dialogs put a full-width Update Now button above a text-only Later action; required updates still cannot be dismissed.
- Long release notes and button labels wrap rather than being squeezed into side-by-side actions. The example app now includes an offline visual playground with editable notes and button colors.

## 0.2.0 - 2026-09-26

### Changed

- Pending updates show the target build's release notes before installation; an older installed build's notes no longer take priority.
- Notes seen in an update prompt do not appear again after installing that build. Builds installed without a prior prompt still show a one-time What's New screen.
- Optional invitations remain once per target build; Persistent and Required reminders continue on new launches until their update condition is resolved.

## 0.1.0 - 2026-07-21

### Added

- Initial public Expo 54–57 and React Native 0.81–0.86 SDK.
- Fail-open ETag-aware update checks with a three-second default timeout.
- Optional, Persistent, and Required store-update experiences.
- Installed-build changelogs with safe native Markdown rendering.
- Versioned AsyncStorage state and a custom storage adapter interface.
- Twenty built-in UI languages, local theme tokens, and local string overrides.
- Accessible light/dark native modal UI without additional native UI dependencies.
