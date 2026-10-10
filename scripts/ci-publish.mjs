import { spawnSync } from 'node:child_process';
import { lstatSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkoutGuard, identity, integrity, requireThat, root, stableVersion, verifyArtifact } from './ci-build.mjs';

const registry = 'https://registry.npmjs.org/';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function compareVersions(left, right) {
  const a = stableVersion(left);
  const b = stableVersion(right);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}
async function request(url, missingAllowed = false, binary = false) {
  const parsed = new URL(url);
  requireThat(parsed.origin === new URL(registry).origin && !parsed.username && !parsed.password, 'Registry URL outside npmjs.org');
  let response;
  try {
    response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { 'cache-control': 'no-cache' } });
  } catch {
    throw new Error('Anonymous registry request failed; no publication attempted or retried');
  }
  if (response.status === 404 && missingAllowed) return null;
  requireThat(response.ok, `Anonymous registry request failed with HTTP ${response.status}`);
  if (!binary) return response.json();
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    requireThat(size <= 16 * 1024 * 1024, 'Registry tarball exceeds size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function versionMetadata(id, version, missingAllowed = false) {
  const metadata = await request(`${registry}${encodeURIComponent(id.name)}/${encodeURIComponent(version)}`, missingAllowed);
  if (metadata) requireThat(metadata.name === id.name && metadata.version === version, 'Unexpected registry package identity');
  return metadata;
}
async function verifyPublished(local, metadata) {
  requireThat(metadata.dist?.integrity === local.manifest.integrity, 'Version already exists with different SHA512 integrity; never republish');
  const bytes = await request(metadata.dist.tarball, false, true);
  requireThat(integrity(bytes) === local.manifest.integrity && bytes.equals(local.bytes), 'Advertised registry tarball differs from the built archive');
}
async function latestVersion(id) {
  const tags = await request(`${registry}-/package/${encodeURIComponent(id.name)}/dist-tags`, true);
  if (tags === null) return null;
  requireThat(typeof tags.latest === 'string', 'Existing package has no latest dist-tag');
  stableVersion(tags.latest);
  return tags.latest;
}
export async function preflight(local) {
  const existing = await versionMetadata(local.id, local.id.version, true);
  const latest = await latestVersion(local.id);
  requireThat(!existing || latest !== null, 'Existing release is missing registry dist-tags');
  requireThat(latest === null || compareVersions(local.id.version, latest) >= 0, 'Release would downgrade the latest dist-tag');
  if (existing) {
    await verifyPublished(local, existing);
    requireThat(latest === local.id.version, 'Existing release is not the latest version');
  }
  return { existing: Boolean(existing), latest };
}
async function readback(local) {
  // Only read metadata after a publish attempt. Never issue a second publish here.
  let lastError;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    try {
      const metadata = await versionMetadata(local.id, local.id.version, true);
      requireThat(metadata, 'Release not visible in registry yet');
      await verifyPublished(local, metadata);
      requireThat(await latestVersion(local.id) === local.id.version, 'latest dist-tag does not point to the release yet');
      console.log(`Registry readback verified exact version, latest and downloaded SHA512: ${local.id.name}@${local.id.version}`);
      return;
    } catch (error) {
      lastError = error;
      if (Date.now() < deadline) await sleep(Math.min(5_000, Math.max(0, deadline - Date.now())));
    }
  }
  throw new Error(`Registry readback incomplete: ${lastError?.message ?? 'verification window elapsed'}. Inspect registry manually; do not blindly rerun publication`);
}
function npmPublish(local, dryRun) {
  let token = process.env.NPM_TOKEN;
  delete process.env.NPM_TOKEN;
  delete process.env.NODE_AUTH_TOKEN;
  requireThat(dryRun || (typeof token === 'string' && token.length > 0), 'NPM_TOKEN is required for publication');
  requireThat(!token || /^[A-Za-z0-9_-]+$/.test(token), 'NPM_TOKEN is not a valid single-line token');
  const temporary = mkdtempSync(join(tmpdir(), 'vibeupdate-npm-'));
  try {
    requireThat(relative(root, temporary).startsWith('../'), 'Temporary npm config must be outside the workspace');
    const config = join(temporary, 'npmrc');
    writeFileSync(config, `registry=${registry}\n${!dryRun ? `//registry.npmjs.org/:_authToken=${token}\n` : ''}`, { mode: 0o600, flag: 'wx' });
    requireThat((lstatSync(config).mode & 0o777) === 0o600, 'npm config must have mode 0600');
    token = undefined;
    // A minimal environment prevents user/project npm config or a token variable from leaking to npm.
    const env = { PATH: process.env.PATH, HOME: temporary, TMPDIR: temporary, CI: 'true',
      NPM_CONFIG_USERCONFIG: config, NPM_CONFIG_GLOBALCONFIG: '/dev/null', NPM_CONFIG_CACHE: join(temporary, 'cache'),
      NPM_CONFIG_UPDATE_NOTIFIER: 'false' };
    const archive = join(temporary, local.manifest.filename);
    writeFileSync(archive, local.bytes, { mode: 0o600, flag: 'wx' });
    const args = ['publish', archive, '--ignore-scripts', `--registry=${registry}`, '--access=public', '--tag=latest'];
    if (dryRun) args.push('--dry-run');
    // npm runs outside the checkout and receives immutable verified bytes, never package lifecycle code.
    const result = spawnSync('npm', args, { cwd: temporary, env, stdio: 'inherit', timeout: 120_000 });
    requireThat(!dryRun || !result.error, 'npm dry-run could not complete');
    return !result.error && result.status === 0;
  } finally {
    token = undefined;
    rmSync(temporary, { recursive: true, force: true });
  }
}
async function publish() {
  const [mode, artifactDirectory] = process.argv.slice(2);
  requireThat(process.argv.length === 4 && ['--verify-artifact', '--verify', '--dry-run', '--publish'].includes(mode)
    && isAbsolute(artifactDirectory), 'Usage: node scripts/ci-publish.mjs --verify-artifact|--verify|--dry-run|--publish ABSOLUTE_ARTIFACT_DIRECTORY');
  const id = identity();
  requireThat(mode === '--verify-artifact' || id.event === 'tag', 'Publication is allowed only for tag events');
  if (mode !== '--publish') requireThat(!process.env.NPM_TOKEN && !process.env.NODE_AUTH_TOKEN, 'Verification must not receive npm credentials');
  requireThat(relative(root, realpathSync(artifactDirectory)).startsWith('../'), 'Artifacts must be outside the trusted publisher checkout');
  // The YAML bootstrap fetched this checkout independently. Never trust builder Git state.
  checkoutGuard(id, true);
  const local = verifyArtifact(id, artifactDirectory, false);
  if (mode === '--verify-artifact') {
    console.log(`Isolated artifact verification complete: ${id.name}@${id.version}, ${local.manifest.files} files, SHA512 ${local.manifest.integrity}; no registry write`);
    return;
  }
  const state = await preflight(local);
  console.log(`Publish guards passed: ${id.name}@${id.version}, SHA512 ${local.manifest.integrity}, existing=${state.existing}, latest=${state.latest}`);
  if (mode === '--verify') {
    delete process.env.NPM_TOKEN;
    if (state.existing) await readback(local);
    console.log('Read-only verification complete; npm publish was not invoked');
    return;
  }
  if (mode === '--dry-run') {
    requireThat(npmPublish(local, true), 'Actual npm publish --dry-run failed');
    console.log('Actual npm publish --dry-run completed; registry was not modified');
    return;
  }
  if (state.existing) {
    delete process.env.NPM_TOKEN;
    await readback(local);
    console.log('Identical version already published; no npm write attempted');
    return;
  }
  // Recheck local bytes and registry immediately before the only write attempt.
  verifyArtifact(id, artifactDirectory, false);
  const fresh = await preflight(local);
  if (fresh.existing) {
    delete process.env.NPM_TOKEN;
    await readback(local);
    console.log('Identical version appeared before publication; no npm write attempted');
    return;
  }
  const succeeded = npmPublish(local, false);
  // Even a failed npm command can have reached the registry. Read back, but never retry the write.
  try {
    await readback(local);
  } catch (error) {
    throw new Error(`${succeeded ? 'npm publish returned success' : 'npm publish failed or was ambiguous'}; ${error.message}`);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await publish();
  } catch (error) {
    delete process.env.NPM_TOKEN;
    delete process.env.NODE_AUTH_TOKEN;
    console.error(`CI publish guard failed: ${error.message}`);
    process.exitCode = 1;
  }
}
