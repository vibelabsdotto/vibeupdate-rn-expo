---
name: vibeupdate
description: "Use when setting up VibeUpdate for an Expo/React Native app or managing its apps and releases with an agent. Install the CLI, connect an agent token safely, configure the SDK, and verify a published update."
metadata:
  author: VibeLabs
  homepage: https://vibeupdate.app
---

# VibeUpdate

VibeUpdate serves localized release notes and optional, persistent, or required store-update prompts to Expo/React Native apps. Use the **CLI** for agent operations; use the **separate Expo SDK** in the mobile app. Neither the CLI nor the SDK deploys an app-store binary or an Expo OTA update.

## Install this skill

This file is portable Agent Skills format. The public copy lives in the Expo SDK repository so agents without access to the private VibeUpdate monorepo can install it:

`https://raw.githubusercontent.com/vibelabsdotto/vibeupdate-rn-expo/main/skills/vibeupdate/SKILL.md`

For Hermes: `hermes skills install https://raw.githubusercontent.com/vibelabsdotto/vibeupdate-rn-expo/main/skills/vibeupdate/SKILL.md`. For other agents, put the file in their supported skills directory as `vibeupdate/SKILL.md`. Loading a skill does **not** install the CLI or grant API access.

## Connect an agent (one-time)

1. Have the developer sign in at [vibeupdate.app](https://vibeupdate.app), create/select their app, then create a named credential under **Dashboard → Agent Tokens**. The complete token is displayed only once. Agents cannot create or manage tokens using an agent token.
2. Install the published, dependency-free CLI with Node.js 22 or newer:

   ```sh
   npm install -g @vibelabsdotto/vibeupdate-cli
   vibeupdate --help
   ```

3. The human supplies the token through a private file or a secret-manager pipe, **not through chat, command arguments, environment variables, tracked files, or logs**. For the default hosted API:

   ```sh
   vibeupdate context set-token VibeUpdate.app --token-stdin < /path/to/private-token-file
   vibeupdate context verify
   vibeupdate app list --json
   ```

   Do not read or print the token in the agent conversation. If your agent cannot securely perform this step, ask the human to run it locally. `set-token` verifies access before storing it. The CLI stores contexts in the user's private `~/.config/vibeupdate/config.json` (directory mode 0700, file 0600). Do not copy that file into a repository, artifact, or shared agent workspace.

4. For another environment, use a distinct context rather than replacing production:

   ```sh
   vibeupdate context add staging --url https://staging-api.example.com --token-stdin < /path/to/private-token-file
   vibeupdate --context staging context verify
   vibeupdate context list
   ```

   `--context staging` can be used with subsequent commands. HTTPS is required except for local loopback development. Check the selected context before writes.

## Find the correct app and configure the mobile SDK

```sh
vibeupdate app list --json
vibeupdate app get <internal-app-id> --json
vibeupdate app sdk-setup <internal-app-id> --json
```

The CLI uses the **internal** app `id` for commands; the SDK takes the **public** `appId` returned by `sdk-setup`. Do not interchange them. If no app exists, create one in the dashboard or, with explicit approval, via `vibeupdate app create --file app.json`; the minimum JSON fields are `name` and `defaultLocale` (a BCP-47 locale such as `en`). Configure `iosBundleId` and/or `androidPackageName` to match the real native app. Before publishing, set the platform's HTTPS `iosStoreUrl` or `androidStoreUrl` as well.

The SDK is maintained in its **own repository**, [vibelabsdotto/vibeupdate-rn-expo](https://github.com/vibelabsdotto/vibeupdate-rn-expo), not as a workspace in this repo. Install the published package in the Expo app with `npm install @vibelabsdotto/vibeupdate`, then use `npx expo install expo-application expo-localization @react-native-async-storage/async-storage` for compatible native peer modules. Check the SDK repository's README for current compatibility and setup details. Do not silently introduce a git submodule or another monorepo workspace.

In the Expo app, mount the SDK once near the root after installation:

```tsx
import { VibeUpdate } from '@vibelabsdotto/vibeupdate';

export default function RootLayout() {
  return <><YourApp /><VibeUpdate appId="app_xxx" /></>;
}
```

Use the actual public ID from `sdk-setup`. Native iOS bundle ID / Android package name and **positive integer** native build number must match the VibeUpdate app and release. Expo Go reports its host app identity, so follow the SDK README's `runtimeMetadata` guidance for Expo Go previews. Rebuild the native app when installing native peer modules. Do not add local HTTP exceptions to production builds.

## Draft and publish a release

Read current state first:

```sh
vibeupdate release list <internal-app-id> --json
vibeupdate app get <internal-app-id> --json
```

Create a draft from a JSON file (never embed an agent token in it):

```json
{
  "visibleVersion": "1.2.0",
  "translations": [{ "locale": "en", "sharedMarkdown": "## What's new\n\n- Improved startup" }],
  "targets": [{ "platform": "ios", "buildNumber": 42 }]
}
```

```sh
vibeupdate release create <internal-app-id> --file release.json --json
vibeupdate release get <internal-app-id> <release-id> --json
```

`visibleVersion` is unique **per app**, not per platform; to use the same version on Android, update the existing release to add an Android target rather than creating a duplicate version. A release needs at least one translation and target; the app's default locale must have nonempty `sharedMarkdown`. Publishing a target also requires that platform's matching native identifier and HTTPS store link. Published targets are independent per platform; always inspect existing targets before updating because a `targets` update replaces the target collection.

Publish only on explicit instruction after reviewing the draft, store URL, build number, target audience, and update mode:

```sh
vibeupdate release publish <internal-app-id> <release-id> ios --mode optional --yes --json
vibeupdate release get <internal-app-id> <release-id> --json
```

- `optional`: dismissible, shown once for a target build.
- `persistent`: dismissible, shown on each launch while the installed build is older.
- `required`: non-dismissible; reserve for critical cases and require explicit approval. Never choose this as a default.

The CLI reads back mutations. If a create or publish request times out or its read-back fails, **inspect the app/release before retrying**: create is not idempotent. Never use `--yes` as a substitute for the user's approval. Deletion and unpublish change live behavior; get explicit approval and inspect the affected target afterward.

## Verify end to end

1. `vibeupdate context verify` and `vibeupdate app sdk-setup <internal-app-id> --json` succeed.
2. `vibeupdate release get <internal-app-id> <release-id> --json` shows the intended platform target as `published`, with the expected mode, build number, and default-locale Markdown.
3. Run the real Expo app with a **lower matching native build** to check the update prompt. Test the store action against the real store listing. An installed-build changelog requires a release matching the installed build. Network/invalid-response failures fail open; an offline test cannot prove a required prompt.
4. If something disagrees, read the CLI/API error and compare IDs, native metadata, locale, store URL, context, and published status before changing data. Do not claim a device test passed unless it was actually run.

## References

- [CLI commands and context security](https://www.npmjs.com/package/@vibelabsdotto/vibeupdate-cli)
- [Expo SDK setup and runtime behavior](https://github.com/vibelabsdotto/vibeupdate-rn-expo#readme)
- [VibeUpdate docs](https://vibeupdate.app/docs)
