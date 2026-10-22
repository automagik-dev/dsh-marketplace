import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index';
import { INDEX_PATH, INDEX_URL, type Index, followIndex } from './market';

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

  it('never moves a listed version to a commit where its plugin changed', () => {
    const before = listed();
    before.plugins[0].versions.unshift(own('2.2', 'e'.repeat(40)));
    expect(followIndex(before, template(), release, unchanged).plugins[0].versions[0].source).toEqual(git('e'.repeat(40)));
    expect(() => followIndex(before, template(), release, () => true)).toThrow('must bump the version');
  });
});

describe('index.json', () => {
  it("passes DSH's own parser", () => {
    expect(() => parseMarketIndex(JSON.parse(readFileSync(INDEX_PATH, 'utf8')), INDEX_URL)).not.toThrow();
  });
});
