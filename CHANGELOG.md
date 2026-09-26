# Changelog

All notable changes to this package are documented in this file.

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
