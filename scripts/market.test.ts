import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index';
import { INDEX_PATH, INDEX_URL, type Index, PRODUCTS_PATH, type Product, followIndex, sourceRepository } from './market';

const REPO = 'https://github.com/automagik-dev/omni';
const git = (commit: string, path = 'apps/omni-ui-dsh') => ({ type: 'git', url: REPO, commit, path });
const npm = { type: 'npm' };
const own = (version: string, commit: string, extra = {}) => ({ version, publishTimestamp: 1, source: git(commit), engines: { dsh: '>=0.2.1-rc.2 <0.3.0' }, ...extra });

const template = (): Index => ({
  metadata: { labels: { official: { title: { en: 'Automagik' } }, fresh: { title: { en: 'New' } } } },
  plugins: [
    { name: '@automagik/omni-dsh', title: { en: 'Omni team, renamed' }, versions: [own('2.2', 'c'.repeat(40))] },
    { name: 'dsh-addon', versions: [{ version: '1.1.0', publishTimestamp: 2, source: npm }] },
    { name: '@automagik/omni-new-dsh', versions: [{ ...own('2.2', 'c'.repeat(40)), source: git('c'.repeat(40), 'apps/omni-new-dsh') }] },
  ],
});
const listed = (): Index => ({
  title: { en: 'Automagik' },
  metadata: { labels: { official: { title: { en: 'Automagik' } } } },
  plugins: [
    { name: '@automagik/omni-dsh', title: { en: 'Omni team' }, versions: [own('2.1', 'a'.repeat(40)), own('2.0', 'b'.repeat(40))] },
    { name: 'dsh-addon', versions: [{ version: '1.0.0', publishTimestamp: 1, source: npm }] },
  ],
});
const release = { repository: REPO, version: '2.2', commit: 'd'.repeat(40), timestamp: 99 };
const unchanged = () => false;

describe('following a product release', () => {
  it("lists the product's own plugins at its version, pinned to the release commit, newest first", () => {
    const next = followIndex(listed(), template(), release, unchanged);
    const team = next.plugins.find((plugin) => plugin.name === '@automagik/omni-dsh');
    expect(team?.versions.map((entry) => entry.version)).toEqual(['2.2', '2.1', '2.0']);
    expect(team?.versions[0]).toEqual({ ...own('2.2', 'd'.repeat(40)), publishTimestamp: 99 });
    expect(team?.title).toEqual({ en: 'Omni team, renamed' });
    expect(next.plugins.find((plugin) => plugin.name === '@automagik/omni-new-dsh')?.versions[0].source).toEqual(
      git('d'.repeat(40), 'apps/omni-new-dsh'),
    );
  });

  it('lists the add-ons the product vetted as it lists them, and keeps its own title', () => {
    const next = followIndex(listed(), template(), release, unchanged);
    expect(next.plugins.find((plugin) => plugin.name === 'dsh-addon')?.versions.map((entry) => entry.version)).toEqual(['1.1.0']);
    expect(next.title).toEqual({ en: 'Automagik' });
    expect(Object.keys(next.metadata?.labels ?? {})).toEqual(['official', 'fresh']);
  });

  it("lists a new version with its own package.json's DSH range, not the one the template's previous entry carried", () => {
    const next = followIndex(listed(), template(), release, unchanged, [], (path) => (path === 'apps/omni-ui-dsh' ? { version: '2.2', engines: { dsh: '>=0.2.1-rc.3 <0.2.2-0' } } : null));
    const team = next.plugins.find((plugin) => plugin.name === '@automagik/omni-dsh');
    expect(team?.versions[0].engines).toEqual({ dsh: '>=0.2.1-rc.3 <0.2.2-0' });
    // A listed version keeps what it was listed with; a manifest without a range keeps the template's.
    expect(team?.versions[1].engines).toEqual({ dsh: '>=0.2.1-rc.2 <0.3.0' });
    expect(next.plugins.find((plugin) => plugin.name === '@automagik/omni-new-dsh')?.versions[0].engines).toEqual({ dsh: '>=0.2.1-rc.2 <0.3.0' });
  });

  it('never moves a listed version to a commit where its plugin changed', () => {
    const before = listed();
    before.plugins[0].versions.unshift(own('2.2', 'e'.repeat(40)));
    expect(followIndex(before, template(), release, unchanged).plugins[0].versions[0].source).toEqual(git('e'.repeat(40)));
    expect(() => followIndex(before, template(), release, () => true)).toThrow('must bump the version');
  });

  it('lists each plugin at its own version: one the release did not bump stays as it was listed', () => {
    const before = listed();
    before.plugins.push({ name: '@automagik/omni-new-dsh', versions: [{ ...own('2.1', 'a'.repeat(40)), source: git('a'.repeat(40), 'apps/omni-new-dsh') }] });
    const manifests: Record<string, { version: string }> = { 'apps/omni-ui-dsh': { version: '2.2' }, 'apps/omni-new-dsh': { version: '2.1' } };
    const next = followIndex(before, template(), release, unchanged, [], (path) => manifests[path] ?? null);
    expect(next.plugins.find((plugin) => plugin.name === '@automagik/omni-dsh')?.versions.map((entry) => entry.version)).toEqual(['2.2', '2.1', '2.0']);
    const kept = next.plugins.find((plugin) => plugin.name === '@automagik/omni-new-dsh');
    expect(kept?.versions).toEqual(before.plugins[2].versions);
    // Changed since it was listed, at the same version: the product forgot to bump it.
    expect(() => followIndex(before, template(), release, () => true, [], (path) => manifests[path] ?? null)).toThrow('@automagik/omni-new-dsh@2.1');
  });
});

describe('products side by side', () => {
  const AUTOMAGIK = 'https://github.com/automagik-dev/automagik';
  const theirs = (version: string, commit: string) => ({ version, publishTimestamp: 1, source: { type: 'git', url: AUTOMAGIK, commit, path: 'apps/bots-dsh' } });

  it("leaves another product's plugin to that product, even when this one's index lists it", () => {
    const before = listed();
    before.plugins.push({ name: '@automagik/bots-dsh', versions: [theirs('3.2', 'f'.repeat(40)), theirs('3.1', 'e'.repeat(40))] });
    const omni = template();
    omni.plugins.push({ name: '@automagik/bots-dsh', title: { en: 'From Omni' }, versions: [theirs('3.0', 'a'.repeat(40))] });
    const next = followIndex(before, omni, release, unchanged, [AUTOMAGIK]);
    const team = next.plugins.find((plugin) => plugin.name === '@automagik/bots-dsh');
    expect(team?.versions.map((entry) => entry.version)).toEqual(['3.2', '3.1']);
    expect(team?.title).toBeUndefined();
    // Not listed yet: still not this product's to add.
    expect(followIndex(listed(), omni, release, unchanged, [AUTOMAGIK]).plugins.some((plugin) => plugin.name === '@automagik/bots-dsh')).toBe(false);
  });

  it('keeps every version of a plugin a release no longer lists (a renamed package)', () => {
    const before = listed();
    before.plugins.push({ name: '@automagik/omni-ai-dsh', versions: [{ ...own('2.1', 'a'.repeat(40)), source: git('a'.repeat(40), 'apps/omni-ai-dsh') }] });
    const dropped = template();
    dropped.plugins = dropped.plugins.filter((plugin) => plugin.name !== '@automagik/omni-dsh');
    const next = followIndex(before, dropped, release, unchanged);
    expect(next.plugins.find((plugin) => plugin.name === '@automagik/omni-dsh')).toEqual(listed().plugins[0]);
    expect(next.plugins.find((plugin) => plugin.name === '@automagik/omni-ai-dsh')?.versions.map((entry) => entry.version)).toEqual(['2.1']);
  });

  it("takes git sources from the products' repositories and the forks they vetted, and nothing else", () => {
    const products: Product[] = JSON.parse(readFileSync(PRODUCTS_PATH, 'utf8')).products;
    expect(products.map((product) => product.id)).toEqual(['omni', 'automagik']);
    expect(sourceRepository('https://github.com/automagik-dev/automagik.git', products)).toBe(AUTOMAGIK);
    expect(sourceRepository('https://github.com/automagik-genie/dsh-oh-my-claude', products)).toBe('https://github.com/automagik-genie/dsh-oh-my-claude');
    expect(sourceRepository('https://github.com/someone/dsh-oh-my-claude', products)).toBeNull();
  });
});

describe('index.json', () => {
  it("passes DSH's own parser", () => {
    expect(() => parseMarketIndex(JSON.parse(readFileSync(INDEX_PATH, 'utf8')), INDEX_URL)).not.toThrow();
  });
});
