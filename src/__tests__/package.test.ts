import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

interface PackageJson {
  name: string;
  private?: boolean;
  bin: Record<string, string>;
  files: string[];
  repository: { url: string };
  publishConfig?: { access?: string; provenance?: boolean };
  dependencies: Record<string, string>;
  release: { plugins: (string | [string, Record<string, unknown>])[] };
}

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as PackageJson;
const releaseWorkflow = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');

function pluginOptions(name: string): Record<string, unknown> | undefined {
  for (const plugin of pkg.release.plugins) {
    if (plugin === name) return {};
    if (Array.isArray(plugin) && plugin[0] === name) return plugin[1];
  }
  return undefined;
}

describe('package.json', () => {
  it('is published to npm as a public scoped package with provenance', () => {
    expect(pkg.name).toBe('@openlint/openlint-mcp');
    expect(pkg.private).toBeUndefined();
    expect(pkg.publishConfig).toEqual({ access: 'public', provenance: true });
    // npm checks provenance against this URL.
    expect(pkg.repository.url).toBe('https://github.com/openlint/mcp');
  });

  it('releases to npm and keeps the tarball for the GitHub release', () => {
    const options = pluginOptions('@semantic-release/npm');
    expect(options).toBeDefined();
    expect(options?.['npmPublish']).not.toBe(false);
    expect(options?.['tarballDir']).toBe('release');
  });

  it('publishes through npm trusted publishing, without an npm token', () => {
    expect(releaseWorkflow).toMatch(/^\s+id-token: write$/m);
    expect(releaseWorkflow).not.toContain('NPM_TOKEN');
  });

  it('releases docs(readme) commits, so npm shows the current README', () => {
    expect(pluginOptions('@semantic-release/commit-analyzer')?.['releaseRules']).toContainEqual({
      type: 'docs',
      scope: 'readme',
      release: 'patch',
    });
  });

  it('pins every @openlint/* dependency to an exact version', () => {
    const openlint = Object.entries(pkg.dependencies).filter(([name]) => name.startsWith('@openlint/'));
    expect(openlint.length).toBeGreaterThan(0);
    for (const [name, version] of openlint) expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each([
    // The bundler accepts any 0.x of the migrator.
    '@openlint/openlint-ruleset-migrator',
    // The rulesets package re-exports these and accepts any 1.x; they hold the built-in rules.
    '@openlint/ruleset-spectral-oas',
    '@openlint/ruleset-spectral-asyncapi',
    '@openlint/ruleset-spectral-arazzo',
  ])('pins %s, which other OpenLint packages accept as a range', name => {
    // Nothing here imports it. The pin is what keeps a fresh install on the tested version.
    expect(pkg.dependencies).toHaveProperty([name]);
  });

  it('ships the openlint-mcp command in the published files', () => {
    const bin = pkg.bin['openlint-mcp'];
    expect(bin).toBe('./dist/index.js');
    const [topLevel] = path.posix.normalize(bin ?? '').split('/');
    expect(pkg.files).toContain(topLevel);
  });
});
