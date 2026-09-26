#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const usage = `Usage:
  vibeupdate apps
  vibeupdate releases <internal-app-id>
  vibeupdate push <internal-app-id> <release.json> <ios|android> <optional|persistent|required>
  vibeupdate add-target <internal-app-id> <release-id> <ios|android> <build> <optional|persistent|required>
  vibeupdate check <public-app-id> <ios|android> <native-id> <installed-build> <version> [locale]

Set VIBEUPDATE_API_URL (default https://api.vibeupdate.app) and VIBEUPDATE_TOKEN for authenticated commands.
Create an agent token in the dashboard; never put it in a command argument or a release file.`;

function requireValue(value, label, pattern) {
  if (!value || (pattern && !pattern.test(value))) throw new Error(`Invalid ${label}.\n${usage}`);
  return value;
}

const base = new URL(process.env.VIBEUPDATE_API_URL ?? 'https://api.vibeupdate.app');
if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) {
  throw new Error('VIBEUPDATE_API_URL must use HTTPS or local loopback HTTP.');
}
const token = process.env.VIBEUPDATE_TOKEN;

async function request(path, { method = 'GET', body, authenticated = true } = {}) {
  if (authenticated && !token) throw new Error('VIBEUPDATE_TOKEN is required for authenticated commands.');
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { throw new Error(`${method} ${path}: non-JSON HTTP ${response.status}`); }
  if (!response.ok) {
    const detail = typeof data?.message === 'string' ? data.message : JSON.stringify(data).slice(0, 300);
    throw new Error(`${method} ${path}: HTTP ${response.status} ${detail}`);
  }
  return data;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'apps' && args.length === 0) {
    console.log(JSON.stringify(await request('/api/v1/agent/apps'), null, 2));
  } else if (command === 'releases' && args.length === 1) {
    const app = requireValue(args[0], 'internal app ID', /^appdb_[a-f0-9]+$/);
    console.log(JSON.stringify(await request(`/api/v1/agent/apps/${app}/releases`), null, 2));
  } else if (command === 'push' && args.length === 4) {
    const [appId, file, platform, mode] = args;
    requireValue(appId, 'internal app ID', /^appdb_[a-f0-9]+$/);
    requireValue(platform, 'platform', /^(ios|android)$/);
    requireValue(mode, 'update mode', /^(optional|persistent|required)$/);
    const payload = JSON.parse(await readFile(file, 'utf8'));
    if (!payload || typeof payload.visibleVersion !== 'string' || !Array.isArray(payload.translations) ||
        !Array.isArray(payload.targets) || !payload.targets.some(t => t.platform === platform)) {
      throw new Error('Release JSON requires visibleVersion, translations, and a target for the selected platform.');
    }
    const app = await request(`/api/v1/agent/apps/${appId}`);
    const identifier = platform === 'ios' ? app.iosBundleId : app.androidPackageName;
    const storeUrl = platform === 'ios' ? app.iosStoreUrl : app.androidStoreUrl;
    if (!identifier || !storeUrl) throw new Error(`The app needs a ${platform} identifier and Store URL before publishing.`);
    const root = `/api/v1/agent/apps/${appId}/releases`;
    const created = await request(root, { method: 'POST', body: payload });
    console.error(`Draft created: ${created.id}. If publication fails, it remains a draft.`);
    const published = await request(`${root}/${created.id}/targets/${platform}/publish`, { method: 'POST', body: { updateMode: mode } });
    const readback = await request(`${root}/${created.id}`);
    const target = readback.targets?.find(t => t.platform === platform);
    if (published.id !== created.id || target?.status !== 'published' || target?.updateMode !== mode) {
      throw new Error(`Published target readback mismatch for ${created.id}.`);
    }
    console.log(JSON.stringify({ releaseId: created.id, visibleVersion: readback.visibleVersion, platform, buildNumber: target.buildNumber, updateMode: target.updateMode, status: target.status }, null, 2));
  } else if (command === 'add-target' && args.length === 5) {
    const [appId, releaseId, platform, build, mode] = args;
    requireValue(appId, 'internal app ID', /^appdb_[a-f0-9]+$/);
    requireValue(releaseId, 'release ID', /^rel_[a-f0-9]+$/);
    requireValue(platform, 'platform', /^(ios|android)$/);
    requireValue(mode, 'update mode', /^(optional|persistent|required)$/);
    if (!/^[1-9]\d*$/.test(build) || !Number.isSafeInteger(Number(build))) throw new Error('Build must be a positive safe integer.');
    const root = `/api/v1/agent/apps/${appId}/releases/${releaseId}`;
    const app = await request(`/api/v1/agent/apps/${appId}`);
    if (!(platform === 'ios' ? app.iosBundleId && app.iosStoreUrl : app.androidPackageName && app.androidStoreUrl)) {
      throw new Error(`The app needs a ${platform} identifier and Store URL before publishing.`);
    }
    const before = await request(root);
    if (before.targets?.some(t => t.platform === platform)) throw new Error(`${platform} target already exists on ${releaseId}; refusing to replace it.`);
    if (!Array.isArray(before.targets) || before.targets.length >= 2) throw new Error('Release targets are missing or already full.');
    const targets = [...before.targets.map(t => ({ platform: t.platform, buildNumber: t.buildNumber, updateMode: t.updateMode })),
      { platform, buildNumber: Number(build), updateMode: mode }];
    const updated = await request(root, { method: 'PATCH', body: { targets } });
    if (!updated.targets?.some(t => t.platform === platform && t.buildNumber === Number(build))) throw new Error('Added target readback mismatch.');
    for (const original of before.targets) {
      if (!updated.targets.some(t => t.id === original.id && t.platform === original.platform && t.buildNumber === original.buildNumber && t.status === original.status && t.updateMode === original.updateMode)) {
        throw new Error(`Existing ${original.platform} target changed; refusing publication.`);
      }
    }
    await request(`${root}/targets/${platform}/publish`, { method: 'POST', body: { updateMode: mode } });
    const readback = await request(root);
    const target = readback.targets?.find(t => t.platform === platform);
    if (target?.status !== 'published' || target?.updateMode !== mode || target?.buildNumber !== Number(build)) {
      throw new Error(`Published target readback mismatch for ${releaseId}.`);
    }
    console.log(JSON.stringify({ releaseId, visibleVersion: readback.visibleVersion, platform, buildNumber: target.buildNumber, updateMode: target.updateMode, status: target.status }, null, 2));
  } else if (command === 'check' && (args.length === 5 || args.length === 6)) {
    const [appId, platform, nativeId, build, version, locale = 'en-US'] = args;
    requireValue(appId, 'public app ID', /^app_[A-Za-z0-9_-]+$/);
    requireValue(platform, 'platform', /^(ios|android)$/);
    requireValue(nativeId, 'native identifier');
    if (!/^[1-9]\d*$/.test(build) || !Number.isSafeInteger(Number(build))) throw new Error('Installed build must be a positive integer.');
    const query = new URLSearchParams({ platform, nativeApplicationId: nativeId, buildNumber: build, version, locale });
    const result = await request(`/api/v1/sdk/apps/${appId}/check?${query}`, { authenticated: false });
    console.log(JSON.stringify(result, null, 2));
  } else {
    throw new Error(usage);
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
