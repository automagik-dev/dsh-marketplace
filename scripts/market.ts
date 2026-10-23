#!/usr/bin/env bun
/**
 * The Automagik plugin market for DeepSeek Harness: index.json, a DSH market index (format 1),
 * made from each Automagik product's own index (products.json) at that product's releases.
 *
 *   bun scripts/market.ts check     DSH's own parser, then every git entry proven against its repository
 *   bun scripts/market.ts follow    take each product's newer releases whose plugins carry the release's version
 *
 * A product's own plugins are the git entries from its repository in its index. Each release of
 * the product lists them at the product's version, pinned to the release commit, so a plugin's
 * version is always its product's. The product's other entries (third-party add-ons it vetted)
 * are listed as its release lists them. A version, once listed, never changes what it installs.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index';

const ROOT = join(import.meta.dir, '..');
export const INDEX_PATH = join(ROOT, 'index.json');
export const PRODUCTS_PATH = join(ROOT, 'products.json');
export const INDEX_URL = 'https://raw.githubusercontent.com/automagik-dev/dsh-marketplace/main/index.json';
const CACHE = join(ROOT, '.cache');
const RELEASE_TAG = /^v(\d+\.\d+\.\d+)$/;

export interface GitSource {
  type: 'git';
  url: string;
  commit: string;
  path?: string;
}
export interface IndexVersion {
  version: string;
  publishTimestamp: number;
  source: GitSource | { type: string; [key: string]: unknown };
  [key: string]: unknown;
}
export interface IndexPlugin {
  name: string;
  versions: IndexVersion[];
  [key: string]: unknown;
}
export interface Index {
  metadata?: { categories?: Record<string, unknown>; labels?: Record<string, unknown> };
  plugins: IndexPlugin[];
  [key: string]: unknown;
}
export interface Product {
  id: string;
  repository: string;
  index: string;
  release: { version: string; commit: string };
  /** Third-party repositories (reviewed forks) whose pinned commits this product's index lists as add-ons. */
  vetted?: string[];
}
export interface Release {
  repository: string;
  version: string;
  commit: string;
  timestamp: number;
}

const sameRepository = (a: string, b: string) => a.replace(/\.git$/, '') === b.replace(/\.git$/, '');
export const isFrom = (source: IndexVersion['source'] | undefined, repository: string): source is GitSource =>
  source?.type === 'git' && typeof source.url === 'string' && sameRepository(source.url, repository);
const newestFirst = (a: IndexVersion, b: IndexVersion) => Bun.semver.order(b.version, a.version);

/**
 * `index` with `release` of the product whose own index at that release is `template`.
 * `changed(path, from, to)` says whether a plugin's folder differs between two commits: a
 * version already listed at another commit must not have changed since. `others` are the
 * other products' repositories: an entry of the template from one of them is that product's
 * to list (it follows its own releases), never this one's. A plugin the template no longer
 * lists keeps every version it has: a listed version never changes or goes.
 */
export function followIndex(
  index: Index,
  template: Index,
  release: Release,
  changed: (path: string, from: string, to: string) => boolean,
  others: string[] = [],
): Index {
  const next: Index = structuredClone(index);
  next.metadata ??= {};
  for (const kind of ['categories', 'labels'] as const) {
    next.metadata[kind] = { ...(template.metadata?.[kind] ?? {}), ...(next.metadata[kind] ?? {}) };
  }
  for (const wanted of template.plugins) {
    const { versions, ...about } = wanted;
    if (others.some((repository) => isFrom(versions[0]?.source, repository))) continue;
    let plugin = next.plugins.find((entry) => entry.name === wanted.name);
    if (plugin) Object.assign(plugin, about);
    else {
      plugin = { ...about, name: wanted.name, versions: [] };
      next.plugins.push(plugin);
    }
    const latest = versions[0];
    if (!latest || !isFrom(latest.source, release.repository)) {
      // A third-party add-on: the versions the product vetted.
      plugin.versions = structuredClone(versions);
      continue;
    }
    const path = latest.source.path ?? '.';
    const listed = plugin.versions.find((entry) => entry.version === release.version);
    if (listed) {
      if (isFrom(listed.source, release.repository) && listed.source.commit !== release.commit
        && changed(path, listed.source.commit, release.commit)) {
        throw new Error(`${wanted.name}@${release.version} is listed at ${listed.source.commit.slice(0, 9)} and changed since: its product must bump the version`);
      }
      continue;
    }
    plugin.versions.push({
      ...structuredClone(latest),
      version: release.version,
      publishTimestamp: release.timestamp,
      source: { ...latest.source, commit: release.commit },
    });
    plugin.versions.sort(newestFirst);
  }
  return next;
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 }).trim();
}
function gitOk(cwd: string, args: string[]): boolean {
  try {
    git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

/** A blobless clone of `repository` with every branch and tag, in .cache. */
function clone(repository: string): string {
  const dir = join(CACHE, repository.replace(/^https:\/\//, '').replace(/[^\w.-]+/g, '_'));
  if (existsSync(join(dir, 'HEAD'))) git(dir, ['fetch', '--quiet', '--tags', '--force', 'origin', '+refs/heads/*:refs/heads/*']);
  else {
    mkdirSync(CACHE, { recursive: true });
    git(ROOT, ['clone', '--quiet', '--bare', '--filter=blob:none', repository, dir]);
  }
  return dir;
}

function packageAt(dir: string, commit: string, path: string): { name?: string; version?: string } | null {
  try {
    return JSON.parse(git(dir, ['show', `${commit}:${path === '.' ? '' : `${path}/`}package.json`]));
  } catch {
    return null;
  }
}

/** The repository a git source may come from: a product's own, or a fork one of them vetted; null for any other. */
export function sourceRepository(url: string, products: Product[]): string | null {
  for (const product of products) {
    for (const repository of [product.repository, ...(product.vetted ?? [])]) {
      if (sameRepository(repository, url)) return repository;
    }
  }
  return null;
}

/** Every problem with `value`, empty when it is fit to serve. */
export function checkIndex(value: unknown, products: Product[]): string[] {
  try {
    parseMarketIndex(value, INDEX_URL);
  } catch (error) {
    return [`index: ${(error as Error).message}`];
  }
  const problems: string[] = [];
  const clones = new Map<string, string>();
  for (const plugin of (value as Index).plugins) {
    for (const entry of plugin.versions) {
      if (entry.source.type !== 'git') continue;
      const at = `${plugin.name}@${entry.version}`;
      const source = entry.source as GitSource;
      const repository = sourceRepository(source.url, products);
      if (!repository) {
        problems.push(`${at}: git sources come only from the products' repositories or the forks they vetted (${source.url})`);
        continue;
      }
      if (!clones.has(repository)) clones.set(repository, clone(repository));
      const dir = clones.get(repository) as string;
      if (!gitOk(dir, ['cat-file', '-e', `${source.commit}^{commit}`])) {
        problems.push(`${at}: ${repository} has no commit ${source.commit}`);
        continue;
      }
      const manifest = packageAt(dir, source.commit, source.path ?? '.');
      if (!manifest) problems.push(`${at}: ${source.commit} has no ${source.path ?? '.'}/package.json`);
      else if (manifest.name !== plugin.name || manifest.version !== entry.version)
        problems.push(`${at}: ${source.commit.slice(0, 9)}:${source.path}/package.json is ${manifest.name}@${manifest.version}`);
    }
  }
  return problems;
}

/** The product's releases (`v<semver>`, not drafts) above `after`, oldest first. */
async function releasesAfter(product: Product): Promise<string[]> {
  const repo = product.repository.replace(/^https:\/\/github\.com\//, '');
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'dsh-marketplace' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=50`, { headers });
  if (!response.ok) throw new Error(`${repo}: GitHub answered ${response.status} for its releases`);
  const releases = (await response.json()) as { tag_name?: string; draft?: boolean }[];
  return releases
    .filter((release) => !release.draft && RELEASE_TAG.test(release.tag_name ?? ''))
    .map((release) => (release.tag_name as string).slice(1))
    .filter((version) => Bun.semver.order(version, product.release.version) > 0)
    .sort(Bun.semver.order);
}

/** Moves `index` through every newer release of every product; says what it took and skipped. */
export async function follow(index: Index, products: Product[], say: (line: string) => void): Promise<Index> {
  let next = index;
  for (const product of products) {
    const versions = await releasesAfter(product);
    if (versions.length === 0) continue;
    const dir = clone(product.repository);
    for (const version of versions) {
      const commit = git(dir, ['rev-parse', `v${version}^{commit}`]);
      let template: Index;
      try {
        template = JSON.parse(git(dir, ['show', `${commit}:${product.index}`]));
      } catch {
        say(`${product.id} ${version}: no ${product.index}, skipped`);
        continue;
      }
      const own = template.plugins.filter((plugin) => isFrom(plugin.versions[0]?.source, product.repository));
      const behind = own.filter((plugin) => {
        const source = plugin.versions[0]?.source as GitSource;
        return packageAt(dir, commit, source.path ?? '.')?.version !== version;
      });
      if (own.length === 0 || behind.length > 0) {
        say(`${product.id} ${version}: ${own.length === 0 ? 'lists no plugins of its own' : `${behind.map((plugin) => plugin.name).join(', ')} not at ${version}`}, skipped`);
        continue;
      }
      const release = { repository: product.repository, version, commit, timestamp: Number(git(dir, ['show', '-s', '--format=%ct', commit])) };
      const others = products.filter((other) => other !== product).map((other) => other.repository);
      next = followIndex(next, template, release, (path, from, to) => !gitOk(dir, ['diff', '--quiet', from, to, '--', path]), others);
      product.release = { version, commit };
      say(`${product.id} ${version}: ${own.map((plugin) => plugin.name).join(', ')} at ${commit.slice(0, 9)}`);
    }
  }
  return next;
}

if (import.meta.main) {
  const [command] = process.argv.slice(2);
  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as Index;
  const file = JSON.parse(readFileSync(PRODUCTS_PATH, 'utf8')) as { products: Product[] };
  if (command === 'check') {
    const problems = checkIndex(index, file.products);
    for (const problem of problems) console.error(`market: ${problem}`);
    if (problems.length > 0) process.exit(1);
    console.log(`market: ${index.plugins.length} plugins ok`);
  } else if (command === 'follow') {
    const next = await follow(index, file.products, (line) => console.log(`market: ${line}`));
    writeFileSync(INDEX_PATH, `${JSON.stringify(next, null, 2)}\n`);
    writeFileSync(PRODUCTS_PATH, `${JSON.stringify(file, null, 2)}\n`);
  } else {
    console.error('usage: bun scripts/market.ts check | follow');
    process.exit(2);
  }
}
