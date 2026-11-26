import { readFileSync } from 'node:fs';

import { parseYaml } from '@openlint/openlint-parsers';
import { describe, expect, it } from 'vitest';

interface Update {
  'package-ecosystem': string;
  directory: string;
  schedule: { interval: string };
  allow?: { 'dependency-name': string }[];
  ignore?: { 'dependency-name': string }[];
  groups?: Record<string, { patterns: string[] }>;
  'commit-message'?: { prefix?: string; include?: string };
}

const { data } = parseYaml(readFileSync(new URL('../../.github/dependabot.yml', import.meta.url), 'utf8'));
const config = data as { version: number; updates: Update[] };
const npm = config.updates.find(update => update['package-ecosystem'] === 'npm');

describe('dependabot.yml', () => {
  it('checks npm weekly', () => {
    expect(config.version).toBe(2);
    expect(npm?.directory).toBe('/');
    expect(npm?.schedule.interval).toBe('weekly');
  });

  it('only updates @openlint/* packages, so merging an update never releases an unrelated change', () => {
    expect(npm?.allow).toEqual([{ 'dependency-name': '@openlint/*' }]);
  });

  it('groups the @openlint/* packages into one PR', () => {
    expect(Object.values(npm?.groups ?? {})).toEqual([{ patterns: ['@openlint/*'] }]);
  });

  it('titles updates fix(deps), so merging one releases a patch', () => {
    expect(npm?.['commit-message']).toEqual({ prefix: 'fix', include: 'scope' });
  });

  it('holds back the ruleset migrator until its 0.2.0 alias change is adopted', () => {
    expect(npm?.ignore).toContainEqual({ 'dependency-name': '@openlint/openlint-ruleset-migrator' });
  });
});
