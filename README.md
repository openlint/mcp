# openlint-mcp

An [MCP](https://modelcontextprotocol.io) server for [OpenLint](https://github.com/openlint/openlint). It lets AI tools such as Claude, Codex and OpenCode lint OpenAPI, AsyncAPI and Arazzo documents, look up rules, and check OpenLint rulesets.

The server runs locally over stdio and builds only on the published `@openlint/*` npm packages.

## Tools

All tools are read-only.

| Tool               | What it does                                                                                                         | Status    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | --------- |
| `list_rulesets`    | Lists the rulesets the server is configured with                                                                     | Available |
| `validate_ruleset` | Checks a YAML or JSON ruleset without running any code, and warns about anything `lint_document` would refuse inline | Available |
| `lint_document`    | Lints an OpenAPI, AsyncAPI or Arazzo document                                                                        | Available |
| `list_rules`       | Lists a ruleset's rules, optionally for one format (such as `oas3.1` or `swagger`)                                   | Available |
| `explain_rule`     | Explains one rule, including `extensions` such as fixing guidance                                                    | Available |

## Install

Requires Node.js `^22.22.1 || >=24`.

### From npm (recommended)

The package is [`@openlint/openlint-mcp`](https://www.npmjs.com/package/@openlint/openlint-mcp). Install it globally:

```sh
npm install -g @openlint/openlint-mcp
openlint-mcp --version
```

- This installs the `openlint-mcp` command for your current Node.js. With asdf, run `asdf reshim nodejs` afterwards.
- To update, run `npm install -g @openlint/openlint-mcp@latest`.
- npm 12 may warn that it skipped install scripts (for example for `fsevents`). The package doesn't need them.
- **Without installing:** use `npx -y @openlint/openlint-mcp` wherever the examples below say `openlint-mcp`, for example `claude mcp add openlint -- npx -y @openlint/openlint-mcp`. The first start downloads the package, so it's slower than a global install.
- Releases are published from GitHub Actions with [npm provenance](https://docs.npmjs.com/generating-provenance-statements), which links each version to the commit and workflow that built it.

### From a GitHub release

Each [GitHub release](https://github.com/openlint/mcp/releases) also includes the built package as `openlint-mcp.tgz`, for installing without the npm registry:

```sh
curl -LO https://github.com/openlint/mcp/releases/latest/download/openlint-mcp.tgz
npm install -g ./openlint-mcp.tgz
```

For a specific version, download `releases/download/v<version>/openlint-mcp.tgz` instead of `releases/latest/download/…`. npm 12 refuses git and URL installs by default (its `allow-git` and `allow-remote` settings), so download the file first; `npx github:openlint/mcp` doesn't work.

### From source

```sh
git clone https://github.com/openlint/mcp.git openlint-mcp
cd openlint-mcp
npm ci
npm run build
npm run smoke   # optional: starts the built server over stdio and calls its tools
```

Then use `node /abs/path/to/openlint-mcp/dist/index.js` wherever the examples below say `openlint-mcp`. Run `pwd` in the clone to get the absolute path.

## Configure rulesets

| Option                       | Meaning                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `--ruleset <path>` (or `-r`) | The default ruleset: a YAML, JSON or JS ruleset file                                                      |
| `--ruleset <name>=<path>`    | An extra named ruleset. Repeat the option to add more. `oas`, `asyncapi` and `arazzo` are reserved names. |
| `OPENLINT_RULESET=<path>`    | The default ruleset, when there is no unnamed `--ruleset`                                                 |
| `--allow-external-refs`      | Let `lint_document` follow `$ref`s to files and URLs (off by default; see below)                          |
| `--max-content-bytes <n>`    | Largest document `lint_document` accepts (default 2000000; or `OPENLINT_MCP_MAX_CONTENT_BYTES`)           |

- **Which one is the default:** an unnamed `--ruleset`, then `OPENLINT_RULESET`, then the first named ruleset.
- **Filenames that contain `=`:** `--ruleset team=prod.yaml` means a ruleset named `team`, loaded from `prod.yaml`. To load a file called `team=prod.yaml`, start the path with `./` or `/`, as in `--ruleset ./team=prod.yaml`.
- **No ruleset configured:** the server uses the `oas`, `asyncapi` and `arazzo` rulesets from [`@openlint/openlint-rulesets`](https://www.npmjs.com/package/@openlint/openlint-rulesets) (recommended rules).
- **Use absolute paths.** AI tools usually start MCP servers from a different working directory than your project, so relative paths may not resolve.
- **Custom functions are supported** in configured rulesets (`functions`, `functionsDir`, and JS rulesets).
- **Errors at startup:** if a ruleset fails to load, the server prints the error to stderr and exits. Your AI tool will show the server as failed; its MCP logs have the message.

Rulesets that an AI tool passes inline in a tool call are untrusted, so they are restricted:

- no custom functions
- no `overrides`
- JSONPath (`given`, `then.field`, aliases) only as plain paths, without filter or script expressions (nothing with `(`)
- `extends` only names a configured ruleset, `oas`, `asyncapi`, `arazzo`, or one of the aliases `spectral:oas`, `spectral:asyncapi`, `spectral:arazzo`, `openlint:openapi`, `openlint:asyncapi` and `openlint:arazzo`
- `formats` only names formats exported by `@openlint/openlint-formats`

`validate_ruleset` explains what was refused.

## Linting documents

`lint_document` takes the document as text in `content`. Optional inputs:

- **`filename`**, such as `openapi.json`, without directories or `#`, `?` and `%`. It is never read from disk. A `.json` name selects the JSON parser (otherwise YAML), and the ruleset's `overrides` match it as if the document sat next to the ruleset file.
- **`ruleset`**: a name from `list_rulesets` (or `oas`, `asyncapi`, `arazzo`), or an inline YAML/JSON ruleset.
- **`severity`** (`error`, `warn`, `info` or `hint`; default `hint`): leaves out less severe diagnostics.
- **`limit`** (default 50), and **`groupBy`** (`code`, the default, or `none`).

It returns:

- the `formats` the ruleset recognized (empty when none)
- `counts` per severity, which always cover every result
- the `diagnostics`, most severe first, grouped by rule code unless `groupBy` is `none`
- `truncated`, and any `notes`

**Size limit.** Linting is synchronous and CPU-bound, so a large document blocks every other tool call until it finishes. In a local run, a 0.17 MB OpenAPI document took about 3 s, 1.4 MB about 23 s and 2.7 MB about 62 s, which is past the 60-second timeout many MCP clients use. `lint_document` therefore refuses `content` over 2,000,000 bytes, with an error that names the limit. Raise or lower it with `--max-content-bytes` (or `OPENLINT_MCP_MAX_CONTENT_BYTES`); timings depend on the machine and the document.

**External `$ref`s** (to other files or URLs) aren't followed by default. They're reported as `invalid-ref`, with a note. `--allow-external-refs` turns them on; each HTTP request then has a 10-second timeout.

> **Warning:** with `--allow-external-refs`, a document from your AI tool can make the server read any local file it has access to, and fetch any URL. Relative refs resolve against the ruleset file's directory (or the working directory). Only use it when you trust the documents.

## Looking up rules

- **`list_rules`** lists a ruleset's rules, sorted by name: severity, whether it's enabled and recommended, its formats and description.
  - `format` keeps the rules for one kind of document. It accepts names like `oas3.1`, `OpenAPI 3.1`, `swagger` (OpenAPI 2.0), `asyncapi3` or `arazzo1.0`. A version includes rules for its family: `oas3.1` includes rules for OpenAPI 3.x, and `oas3` includes rules for every OpenAPI 3 version.
  - `enabledOnly` (default `true`) lists only the rules `lint_document` runs.
  - `filename` (as for `lint_document`) includes what the ruleset's `overrides` change for a document of that name, such as rules added for `*.json` files.
- **`explain_rule`** explains one rule: its description, message, `given` paths, `then` (function, field and small function options), severity, formats, documentation link and `extensions`.

**Guidance for agents in your ruleset:** core accepts a free-form `extensions` object on each rule, and `explain_rule` returns it as written. The convention for agent guidance is `extensions.prompt`:

```yaml
rules:
  operation-summary:
    description: Every operation needs a summary.
    given: $.paths[*][*]
    then: { field: summary, function: truthy }
    extensions:
      prompt: Write a short summary in sentence case, under 60 characters, without a trailing period.
```

## Use with AI tools

The examples run the `openlint-mcp` command from a global install. Replace `/abs/path/to/.openlint.yaml` with your ruleset. The `--ruleset …` part is optional; without it, the server uses the default rulesets above. If a tool can't find `openlint-mcp` (desktop apps often don't see your shell's `PATH`), use the absolute paths shown for Claude Desktop.

### Claude Code

Add the server with the `claude` CLI. Everything after `--` is the server's own command line:

```sh
claude mcp add openlint -- openlint-mcp --ruleset /abs/path/to/.openlint.yaml
```

Choose where the setting is stored with `--scope`:

- `local` (default): only you, only this project.
- `project`: everyone working on the project. It is written to `.mcp.json` in the project root, for committing. Claude Code asks each person to approve the server the first time.
- `user`: only you, in all your projects.

A project-scoped `.mcp.json` looks like this:

```json
{
  "mcpServers": {
    "openlint": {
      "type": "stdio",
      "command": "openlint-mcp",
      "args": ["--ruleset", "/abs/path/to/.openlint.yaml"],
      "env": {}
    }
  }
}
```

The paths in a committed `.mcp.json` must work on every teammate's machine. If your checkouts live in different places, have each person run `claude mcp add` with the default `local` scope instead.

To set the ruleset through the environment instead, use `-e OPENLINT_RULESET=/abs/path/to/.openlint.yaml` before `--`.

**Check it's connected:** run `claude mcp list`, or `/mcp` inside a Claude Code session.

Docs: [Claude Code MCP](https://code.claude.com/docs/en/mcp).

### Claude Desktop

Open **Settings → Developer → Edit Config**. That opens `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Desktop apps often don't see the `PATH` from your shell, especially with version managers like nvm or asdf, so give absolute paths to Node.js and to the server. Print them with:

```sh
node -p process.execPath                                    # Node.js
echo "$(npm root -g)/@openlint/openlint-mcp/dist/index.js"  # the server, from a global install
```

Then add the server:

```json
{
  "mcpServers": {
    "openlint": {
      "command": "/abs/path/to/node",
      "args": ["/abs/path/to/@openlint/openlint-mcp/dist/index.js", "--ruleset", "/abs/path/to/.openlint.yaml"]
    }
  }
}
```

- **From source,** the server is `/abs/path/to/openlint-mcp/dist/index.js` in your clone.
- **On Windows,** escape backslashes in JSON paths: `"C:\\Users\\you\\AppData\\Roaming\\npm\\node_modules\\@openlint\\openlint-mcp\\dist\\index.js"`.
- **Restart:** quit Claude Desktop completely and start it again.
- **If it doesn't connect,** check the logs. On macOS they're at `~/Library/Logs/Claude/mcp-server-openlint.log`.

Docs: [Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers).

### Codex

Add the server with the `codex` CLI. The CLI, the IDE extension and the ChatGPT desktop app share this configuration:

```sh
codex mcp add openlint -- openlint-mcp --ruleset /abs/path/to/.openlint.yaml
```

This writes to `~/.codex/config.toml`. You can also edit that file directly:

```toml
[mcp_servers.openlint]
command = "openlint-mcp"
args = ["--ruleset", "/abs/path/to/.openlint.yaml"]

# Optional, instead of --ruleset:
# [mcp_servers.openlint.env]
# OPENLINT_RULESET = "/abs/path/to/.openlint.yaml"
```

- **Environment variable from the CLI:** `codex mcp add openlint --env OPENLINT_RULESET=/abs/path/to/.openlint.yaml -- openlint-mcp`.
- **Per project:** a `.codex/config.toml` in a trusted project can hold the same table.

**Check it's connected:** run `codex mcp list`, or `/mcp` inside the Codex TUI.

Docs: [Codex MCP](https://developers.openai.com/codex/mcp).

### OpenCode

Add the server with the `opencode` CLI. Without `--global`, it goes into the project's configuration:

```sh
opencode mcp add openlint -- openlint-mcp --ruleset /abs/path/to/.openlint.yaml
```

In some older versions, `opencode mcp add` doesn't take a name and command, and asks for them instead. Enter `openlint` as the name, choose a local server, and give the same command.

Or edit `opencode.json` (or `opencode.jsonc`) in the project root, or `~/.config/opencode/opencode.json` for all projects. The format in OpenCode's current docs (V2) puts servers under `mcp.servers`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "openlint": {
        "type": "local",
        "command": ["openlint-mcp", "--ruleset", "/abs/path/to/.openlint.yaml"],
        // Optional, instead of --ruleset:
        // "environment": { "OPENLINT_RULESET": "/abs/path/to/.openlint.yaml" }
      },
    },
  },
}
```

Older versions (V1) put servers directly under `mcp`, and use `enabled`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "openlint": {
      "type": "local",
      "command": ["openlint-mcp", "--ruleset", "/abs/path/to/.openlint.yaml"],
      "enabled": true,
    },
  },
}
```

If you're not sure which format your version uses, `opencode mcp add` writes the right one.

**Check it's connected:** run `opencode mcp list`, or `/mcps` inside OpenCode.

Docs: [OpenCode MCP servers](https://opencode.ai/docs/mcp-servers/).

## Try it

Once the server is connected, ask your AI tool things like:

- "Which OpenLint rulesets are configured?"
- "Lint `openapi.yaml` with OpenLint and fix the errors."
- "Which OpenLint rules apply to OpenAPI 3.1, and what does `operation-tags` check?"
- "Write an OpenLint ruleset that requires `info.contact` in OpenAPI 3.1 documents, and validate it with `validate_ruleset`."

## Development

```sh
npm ci
npm run lint    # Prettier, ESLint and type-check
npm test        # Vitest
npm run build   # TypeScript 7 → dist/
npm run smoke   # the built server over stdio
```

Commit messages and PR titles follow [conventional commits](https://www.conventionalcommits.org), as in [OpenLint's CONTRIBUTING.md](https://github.com/openlint/openlint/blob/main/CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE)
