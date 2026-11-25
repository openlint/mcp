import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ConfigError, DEFAULT_MAX_CONTENT_BYTES, USAGE, parseConfig } from '../config.js';

const cwd = '/work';

describe('parseConfig', () => {
  it('returns no rulesets when nothing is configured', () => {
    expect(parseConfig([], {}, cwd)).toEqual({
      rulesets: [],
      allowExternalRefs: false,
      maxContentBytes: DEFAULT_MAX_CONTENT_BYTES,
    });
  });

  it('reads --max-content-bytes, or OPENLINT_MCP_MAX_CONTENT_BYTES, and prefers the flag', () => {
    expect(parseConfig(['--max-content-bytes', '1000'], {}, cwd).maxContentBytes).toBe(1000);
    expect(parseConfig([], { OPENLINT_MCP_MAX_CONTENT_BYTES: '500' }, cwd).maxContentBytes).toBe(500);
    expect(parseConfig(['--max-content-bytes=1'], { OPENLINT_MCP_MAX_CONTENT_BYTES: '500' }, cwd).maxContentBytes).toBe(
      1,
    );
  });

  it('rejects a --max-content-bytes that is not a positive whole number', () => {
    for (const value of ['0', '-5', '1.5', 'lots']) {
      expect(() => parseConfig(['--max-content-bytes', value], {}, cwd)).toThrow(ConfigError);
    }
  });

  it('reads an unnamed --ruleset as the default and resolves it against cwd', () => {
    expect(parseConfig(['--ruleset', './.openlint.yaml'], {}, cwd).rulesets).toEqual([
      { name: 'default', path: path.resolve(cwd, '.openlint.yaml'), isDefault: true },
    ]);
  });

  it('accepts -r and --ruleset=<value>', () => {
    expect(parseConfig(['-r', 'a.yaml'], {}, cwd).rulesets[0]?.path).toBe(path.resolve(cwd, 'a.yaml'));
    expect(parseConfig(['--ruleset=a.yaml'], {}, cwd).rulesets[0]?.path).toBe(path.resolve(cwd, 'a.yaml'));
  });

  it('uses OPENLINT_RULESET when there is no unnamed --ruleset', () => {
    expect(parseConfig([], { OPENLINT_RULESET: '/rules/env.yaml' }, cwd).rulesets).toEqual([
      { name: 'default', path: '/rules/env.yaml', isDefault: true },
    ]);
    expect(parseConfig([], { OPENLINT_RULESET: '  ' }, cwd).rulesets).toEqual([]);
  });

  it('prefers the --ruleset flag over OPENLINT_RULESET', () => {
    const { rulesets } = parseConfig(['--ruleset', '/rules/flag.yaml'], { OPENLINT_RULESET: '/rules/env.yaml' }, cwd);
    expect(rulesets.map(spec => spec.path)).toEqual(['/rules/flag.yaml']);
  });

  it('adds named rulesets next to the default', () => {
    const { rulesets } = parseConfig(['--ruleset', 'org=./org.yaml', '--ruleset', 'base.yaml'], {}, cwd);
    expect(rulesets).toEqual([
      { name: 'default', path: path.resolve(cwd, 'base.yaml'), isDefault: true },
      { name: 'org', path: path.resolve(cwd, 'org.yaml'), isDefault: false },
    ]);
  });

  it('makes the first named ruleset the default when there is no unnamed one', () => {
    const { rulesets } = parseConfig(['-r', 'org=/org.yaml', '-r', 'team=/team.yaml'], {}, cwd);
    expect(rulesets.map(({ name, isDefault }) => ({ name, isDefault }))).toEqual([
      { name: 'org', isDefault: true },
      { name: 'team', isDefault: false },
    ]);
  });

  it('reads values that are not name=path as paths', () => {
    for (const value of ['./a=b.yaml', 'C:\\rules=x.yaml', '=x.yaml', 'org=']) {
      expect(parseConfig(['--ruleset', value], {}, cwd).rulesets[0]?.name).toBe('default');
    }
  });

  it('rejects two unnamed rulesets', () => {
    expect(() => parseConfig(['-r', 'a.yaml', '-r', 'b.yaml'], {}, cwd)).toThrow(ConfigError);
  });

  it('rejects reserved and duplicate names', () => {
    expect(() => parseConfig(['-r', 'oas=x.yaml'], {}, cwd)).toThrow(/reserved/);
    expect(() => parseConfig(['-r', 'org=a.yaml', '-r', 'org=b.yaml'], {}, cwd)).toThrow(/more than once/);
    expect(() => parseConfig(['-r', 'a.yaml', '-r', 'default=b.yaml'], {}, cwd)).toThrow(/more than once/);
  });

  it('reads --allow-external-refs', () => {
    expect(parseConfig(['--allow-external-refs'], {}, cwd).allowExternalRefs).toBe(true);
    expect(parseConfig(['--allow-external-refs', '-r', 'a.yaml'], {}, cwd)).toMatchObject({
      allowExternalRefs: true,
      rulesets: [{ name: 'default' }],
    });
    expect(() => parseConfig(['--allow-external-refs=yes'], {}, cwd)).toThrow(ConfigError);
  });

  it('reads --version and --help', () => {
    expect(parseConfig(['--version'], {}, cwd).show).toBe('version');
    expect(parseConfig(['-v'], {}, cwd).show).toBe('version');
    expect(parseConfig(['--help', '--version'], {}, cwd).show).toBe('help');
    expect(parseConfig(['-h'], {}, cwd).show).toBe('help');
    expect(parseConfig([], {}, cwd)).not.toHaveProperty('show');
  });

  it('shows help and the version even when the rulesets are invalid', () => {
    expect(parseConfig(['--help', '-r', 'a.yaml', '-r', 'b.yaml'], {}, cwd).show).toBe('help');
    expect(parseConfig(['-r', 'oas=x.yaml', '--version'], {}, cwd).show).toBe('version');
  });

  it('shows help and the version even when the size limit is invalid', () => {
    expect(parseConfig(['--version', '--max-content-bytes', 'lots'], {}, cwd).show).toBe('version');
    expect(parseConfig(['--help'], { OPENLINT_MCP_MAX_CONTENT_BYTES: '0' }, cwd).show).toBe('help');
  });

  it('explains the default ruleset order in the help', () => {
    expect(USAGE).toMatch(/unnamed --ruleset, else OPENLINT_RULESET, else the first named\s+ruleset/);
  });

  it('rejects unknown options', () => {
    expect(() => parseConfig(['--rulset', 'a.yaml'], {}, cwd)).toThrow(ConfigError);
    expect(() => parseConfig(['a.yaml'], {}, cwd)).toThrow(ConfigError);
  });
});
