# Maintainer CI and releases

CI runs on Woodpecker at `https://ci.vibelabs.to`, not GitHub Actions. The coordinator runs on Coolify; workflows target the isolated Linux laptop VM (`role=release`, `platform=linux/amd64`). Jobs stay queued while that worker is offline or asleep.

| Trigger | Result |
| --- | --- |
| Push to `main` | `npm ci`, typecheck, lint, existing tests, build, example install against the built SDK plus example typecheck, `npm pack` and archive checks. A separate step re-verifies the archive from an isolated checkout. Nothing is published. |
| Tag `vVERSION` | The same checks, then publication of exactly that checked tarball to npm with `latest`. |

## Publishing a release

1. Set `version` in `package.json` (and `package-lock.json`), update `CHANGELOG.md`, commit and push to `main`.
2. Wait for the `main` pipeline to pass.
3. Tag that commit and push the tag:

   ```sh
   git tag v0.4.0
   git push origin v0.4.0
   ```

The guards require the tag to equal `v` plus the package version, the tagged commit to be on remote `main`, and a stable `MAJOR.MINOR.PATCH` version. They reject prereleases, downgrades and an existing version with different bytes. An identical existing version is verified instead of published again. After a failed or ambiguous npm write the pipeline only reads the registry back; it never retries publication. Do not retag or force-push a released version.

## Credentials

The Woodpecker repository secret `npm_token` is a granular npm token limited to `@vibelabsdotto/vibeupdate`. It is available only to `tag` events and only in the publish step, never during dependency installation or build. The publisher runs from a fresh checkout of the exact commit outside the build workspace and treats the built tarball as data. Granular publish tokens expire; renew the token and secret before the expiry date. npm has announced the end of token-based direct publishing, so plan a move to a supported publishing method.
