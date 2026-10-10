import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const artifacts = join(root, '.ci-artifacts');
export const repo = 'vibelabsdotto/vibeupdate-rn-expo';
export const packageName = '@vibelabsdotto/vibeupdate';
const remote = 'https://github.com/vibelabsdotto/vibeupdate-rn-expo.git';
const archiveName = version => `vibelabsdotto-vibeupdate-${version}.tgz`;
export function requireThat(ok, message) {
  if (!ok) throw new Error(message);
}
export function stableVersion(version) {
  requireThat(typeof version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version), 'Only stable canonical semver is allowed');
  return version.split('.').map(BigInt);
}
export function identity() {
  const env = process.env;
  requireThat(env.CI_REPO === repo, 'CI_REPO does not match the release repository');
  requireThat(/^[a-f0-9]{40}$/.test(env.CI_COMMIT_SHA ?? ''), 'CI_COMMIT_SHA must be 40 lowercase hex characters');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  requireThat(pkg.name === packageName && pkg.private !== true, 'Unexpected or private package');
  stableVersion(pkg.version);
  const event = env.CI_PIPELINE_EVENT;
  const tag = env.CI_COMMIT_TAG || '';
  const ref = env.CI_COMMIT_REF;
  if (event === 'tag') {
    requireThat(tag === `v${pkg.version}` && ref === `refs/tags/${tag}`, 'Release tag/ref must equal vPACKAGE_VERSION');
  } else {
    requireThat(['push', 'manual'].includes(event) && env.CI_COMMIT_BRANCH === 'main' && ref === 'refs/heads/main' && !tag,
      'Only push/manual on main or stable version tags are allowed');
  }
  return { repo, commit: env.CI_COMMIT_SHA, event, ref, tag, name: pkg.name, version: pkg.version };
}
function git(args) {
  return execFileSync('git', ['-c', `safe.directory=${root}`, '-c', 'credential.helper=', '-c', 'core.askPass=/bin/false',
    '-c', 'http.extraHeader=', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args], {
    cwd: root, encoding: 'utf8',
    // Git never receives npm credentials, injected Git settings, or user configuration.
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  }).trim();
}
export function checkoutGuard(id, verifyRemote = id.event === 'tag') {
  requireThat(git(['rev-parse', 'HEAD']) === id.commit, 'Checked-out HEAD differs from CI_COMMIT_SHA');
  git(['diff', '--exit-code', 'HEAD', '--', 'package.json', 'package-lock.json', 'src', 'LICENSE', 'README.md', 'CHANGELOG.md',
    'tsconfig*.json', 'scripts', '.woodpecker', 'example/package.json', 'example/package-lock.json']);
  if (!verifyRemote) return;
  const args = ['fetch', '--no-tags'];
  if (git(['rev-parse', '--is-shallow-repository']) === 'true') args.push('--unshallow');
  git([...args, remote, '+refs/heads/main:refs/ci/main', ...(id.event === 'tag' ? [`+refs/tags/${id.tag}:refs/ci/release-tag`] : [])]);
  if (id.event === 'tag') requireThat(git(['rev-parse', 'refs/ci/release-tag^{commit}']) === id.commit, 'Remote release tag differs from CI_COMMIT_SHA');
  git(['merge-base', '--is-ancestor', id.commit, 'refs/ci/main']);
  console.log('Checkout commit, remote main ancestry and any release tag verified');
}
export const integrity = bytes => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
// scripts/build.mjs runs tsc twice: ESM plus declarations, then CommonJS with a type marker.
const generatedPath = /^dist\/(?:(?:esm|cjs)\/[A-Za-z0-9_-]+\.js|types\/[A-Za-z0-9_-]+\.d\.ts|cjs\/package\.json)$/;
function allowedPath(path) {
  const parts = path.split('/');
  requireThat(parts.every(p => p && p !== '.' && p !== '..') && !/[\\\x00-\x1f\x7f]/.test(path), 'Unsafe archive path');
  requireThat(generatedPath.test(path) || /^(?:package\.json|README\.md|LICENSE|CHANGELOG\.md)$/.test(path),
    `File outside package allowlist: ${path}`);
}
// Every flat src module must produce exactly one ESM, CommonJS and declaration file, and nothing else.
function sourceModules() {
  return readdirSync(join(root, 'src'), { withFileTypes: true }).map(entry => {
    requireThat(entry.isFile() && !entry.isSymbolicLink() && /^[A-Za-z0-9_-]+\.tsx?$/.test(entry.name), `Unexpected source entry: src/${entry.name}`);
    return entry.name.replace(/\.tsx?$/, '');
  });
}
export function inspectArchive(bytes, id, compareGenerated = true) {
  requireThat(bytes.length > 0 && bytes.length <= 16 * 1024 * 1024, 'Archive exceeds size limit or is empty');
  const tar = gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 });
  const files = new Map();
  const text = (header, start, size) => header.subarray(start, start + size).toString('utf8').split('\0')[0];
  const octal = value => {
    const clean = value.replace(/\0/g, '').trim();
    requireThat(/^[0-7]+$/.test(clean), 'Invalid tar numeric header');
    return parseInt(clean, 8);
  };
  let offset = 0;
  while (offset + 512 <= tar.length && tar.subarray(offset, offset + 512).some(Boolean)) {
    const header = tar.subarray(offset, offset + 512);
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
    requireThat(checksum === octal(header.subarray(148, 156).toString('ascii')), 'Tar header checksum mismatch');
    const prefix = text(header, 345, 155);
    const name = `${prefix ? `${prefix}/` : ''}${text(header, 0, 100)}`;
    const size = octal(header.subarray(124, 136).toString('ascii'));
    requireThat(name.startsWith('package/'), 'Tar entry outside package root');
    const path = name.slice(8);
    allowedPath(path);
    requireThat(['\0', '0'].includes(String.fromCharCode(header[156])) && !text(header, 157, 100), 'Only regular tar files are allowed, no links or extended headers');
    requireThat(!files.has(path) && offset + 512 + size <= tar.length, 'Duplicate or truncated tar entry');
    files.set(path, tar.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  requireThat(tar.length - offset >= 1024 && !tar.subarray(offset).some(Boolean), 'Missing or invalid tar end marker');
  const pkg = JSON.parse(files.get('package.json')?.toString('utf8') || '{}');
  requireThat(pkg.name === id.name && pkg.version === id.version && pkg.private !== true, 'Packed package identity mismatch');
  requireThat(JSON.stringify(pkg) === JSON.stringify(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))), 'Packed manifest differs from checkout');
  for (const name of ['README.md', 'LICENSE', 'CHANGELOG.md']) requireThat(files.has(name), `Missing ${name}`);
  requireThat(files.get('dist/cjs/package.json')?.toString('utf8') === '{"type":"commonjs"}\n', 'Missing or invalid CommonJS type marker');
  requireThat(pkg.bin === undefined, 'The SDK must not ship a binary; the agent CLI is a separate package');
  requireThat(!['preinstall', 'install', 'postinstall'].some(name => pkg.scripts?.[name]), 'The SDK must not run install scripts in consumer apps');
  const modules = sourceModules();
  const expected = new Set(['dist/cjs/package.json', ...modules.flatMap(m => [`dist/esm/${m}.js`, `dist/cjs/${m}.js`, `dist/types/${m}.d.ts`])]);
  const generated = [...files.keys()].filter(p => p.startsWith('dist/'));
  for (const path of expected) requireThat(files.has(path), `Missing built module: ${path}`);
  for (const path of generated) requireThat(expected.has(path), `Built file without a source module: ${path}`);
  requireThat(pkg.exports && typeof pkg.exports === 'object' && pkg.exports['./package.json'] === './package.json', 'Missing package exports');
  for (const [name, conditions] of Object.entries(pkg.exports)) {
    if (name === './package.json') continue;
    requireThat(conditions && ['types', 'react-native', 'import', 'require', 'default'].every(k => typeof conditions[k] === 'string'), `Incomplete export: ${name}`);
    for (const target of Object.values(conditions)) requireThat(target.startsWith('./') && files.has(target.slice(2)), `Missing exported target: ${target}`);
  }
  for (const field of ['main', 'module', 'types', 'react-native']) {
    requireThat(typeof pkg[field] === 'string' && files.has(pkg[field].replace(/^\.\//, '')), `Missing ${field} target`);
  }
  const publishConfig = pkg.publishConfig ?? {};
  requireThat(Object.keys(publishConfig).every(key => ['access', 'registry', 'tag'].includes(key))
    && (!publishConfig.access || publishConfig.access === 'public')
    && (!publishConfig.registry || publishConfig.registry === 'https://registry.npmjs.org/')
    && (!publishConfig.tag || publishConfig.tag === 'latest'), 'Unexpected package publishConfig');
  for (const [path, bytes] of files) {
    if (path.startsWith('dist/')) {
      // Generated output is data, never imported or executed by the publisher.
      requireThat(bytes.length > 0 && !bytes.includes(0) && Buffer.from(bytes.toString('utf8')).equals(bytes), `Invalid generated text: ${path}`);
      const dir = path.slice(0, path.lastIndexOf('/') + 1);
      const extension = path.endsWith('.d.ts') ? '.d.ts' : '.js';
      // Relative imports and requires must resolve inside the same generated tree.
      for (const match of bytes.toString('utf8').matchAll(/(?:from\s*|import\s*\(\s*|require\(\s*)["'](\.\/[^"']+)\.js["']/g)) {
        requireThat(files.has(`${dir}${match[1].slice(2)}${extension}`), `Missing generated dependency of ${path}: ${match[1]}.js`);
      }
      if (!compareGenerated) continue;
    }
    const local = join(root, path);
    requireThat(lstatSync(local).isFile() && !lstatSync(local).isSymbolicLink() && readFileSync(local).equals(bytes), `Packed bytes differ from checkout: ${path}`);
  }
  if (compareGenerated) {
    const walk = dir => readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry => {
      const path = `${dir}/${entry.name}`;
      requireThat(!entry.isSymbolicLink(), `Package symlink: ${path}`);
      return entry.isDirectory() ? walk(path) : [path];
    });
    for (const path of walk('dist')) requireThat(files.has(path), `Missing package file: ${path}`);
  }
  return { files: files.size, pkg };
}
export function verifyArtifact(id = identity(), artifactDirectory = artifacts, compareGenerated = true) {
  requireThat(lstatSync(artifactDirectory).isDirectory() && !lstatSync(artifactDirectory).isSymbolicLink(), 'Invalid artifact directory');
  const manifestPath = join(artifactDirectory, 'release.json');
  requireThat(lstatSync(manifestPath).isFile() && !lstatSync(manifestPath).isSymbolicLink(), 'Invalid artifact manifest');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const [key, value] of Object.entries(id)) requireThat(manifest[key] === value, `Artifact identity mismatch: ${key}`);
  const filename = archiveName(id.version);
  requireThat(manifest.filename === filename && manifest.schema === 1, 'Unexpected artifact filename/schema');
  const path = join(artifactDirectory, filename);
  requireThat(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), 'Artifact must be a regular file');
  const bytes = readFileSync(path);
  requireThat(integrity(bytes) === manifest.integrity, 'Artifact SHA512 mismatch');
  const inspected = inspectArchive(bytes, id, compareGenerated);
  requireThat(inspected.files === manifest.files, 'Artifact file count mismatch');
  return { id, manifest, path, bytes };
}
async function build() {
  requireThat(!process.env.NPM_TOKEN && !process.env.NODE_AUTH_TOKEN, 'Build must not receive npm credentials');
  const id = identity();
  checkoutGuard(id);
  requireThat(!existsSync(artifacts), 'Artifact directory already exists; use a clean workspace');
  const example = join(root, 'example');
  const run = (command, args, cwd = root, capture = false) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
  const npm = (args, cwd = root, capture = false) => run('npm', args, cwd, capture);
  console.log(`Building ${id.name}@${id.version} from ${id.commit} on ${process.platform}/${process.arch}, npm ${npm(['--version'], root, true).trim()}`);
  npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  npm(['run', 'typecheck']);
  npm(['run', 'lint']);
  npm(['test', '--', '--run']);
  npm(['run', 'build']);
  // The example installs the built SDK through install-links, like an app installing the packed package.
  npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], example);
  run(join(example, 'node_modules/.bin/tsc'), ['--noEmit', '-p', 'tsconfig.json'], example);
  checkoutGuard(id);
  mkdirSync(artifacts);
  // npm 11 returns an array, npm 12 an object keyed by package name.
  const result = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', artifacts], root, true));
  const results = Array.isArray(result) ? result : Object.values(result ?? {});
  requireThat(results.length === 1, 'Unexpected npm pack result');
  const packed = results[0];
  requireThat(packed.name === id.name && packed.version === id.version && packed.filename === archiveName(id.version), 'Unexpected packed package identity');
  const bytes = readFileSync(join(artifacts, packed.filename));
  const inspected = inspectArchive(bytes, id);
  requireThat(packed.integrity === integrity(bytes) && packed.entryCount === inspected.files, 'npm pack integrity/file count differs from actual archive');
  const manifest = { schema: 1, ...id, filename: packed.filename, integrity: integrity(bytes), files: inspected.files };
  writeFileSync(join(artifacts, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
  verifyArtifact(id);
  console.log(JSON.stringify(manifest, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireThat(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--verify'), 'Usage: node scripts/ci-build.mjs [--verify]');
    if (process.argv[2] === '--verify') console.log(JSON.stringify(verifyArtifact().manifest, null, 2));
    else await build();
  } catch (error) {
    console.error(`CI build guard failed: ${error.message}`);
    process.exitCode = 1;
  }
}
