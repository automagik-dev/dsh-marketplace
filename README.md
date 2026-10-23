# Automagik plugin market for DeepSeek Harness

One index for every Automagik plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). Add it once, and DSH's plugin market lists them all, offers each update as it ships, and installs exactly the version listed.

```
https://raw.githubusercontent.com/automagik-dev/dsh-marketplace/main/index.json
```

## Add it to your DSH

The market ships with DSH as an optional bundle. Turn it on, then add the index:

1. Settings → Plugins → enable **Plugin market** (`@deepseek-ai/dsh-experimental-plugin-market-bundle`).
2. Market → Indexes → add the URL above. Or put it straight into your profile's `cordis.patch.yml`:

   ```yaml
   - id: plugin-market
     config:
       indexes:
         - https://raw.githubusercontent.com/automagik-dev/dsh-marketplace/main/index.json
   ```

DSH asks before it installs anything. When the index lists a newer version of a plugin you have, the market offers **Update**. A plugin added by name or address under Settings → Plugins → Add plugin is not updated that way; install from the market instead.

Prefer not to set up DSH at all? [Omni desktop](https://github.com/automagik-dev/omni-desktop) is DSH with Omni's plugins already in it.

## What is listed

| Plugin | From | |
|---|---|---|
| Omni team (`@automagik/omni-dsh`) | [Omni](https://github.com/automagik-dev/omni) | The Bot team the others build on: the Main Bot and its Bots, sessions, memory and settings. Keeps its files in `~/.omni`, never in your DSH profile. |
| Omni channels (`@automagik/omni-channels-dsh`) | Omni | Link your Omni: its channels, chats and automations, and what each Bot may do there. |
| Omni canvases (`@automagik/omni-canvas-dsh`) | Omni | Live UI in the chat, drawn from your Omni. |
| Omni welcome (`@automagik/omni-ai-dsh`) | Omni | The welcome, and Connect AI. |
| Bring your own AI | vetted by Omni | Third-party providers (Codex, Claude Code, Kimi, OpenCode Go), each at the version Omni vetted: no install scripts, no telemetry, credentials in DSH's own store, the source read at that version. |

## Wanted

Plugins we want in the Automagik ecosystem, and what each needs before it is listed. A plugin is listed once it loads on the DeepSeek Harness Omni's plugins are tested on (0.2.1-rc.2), and its source has been read at the version listed.

| Plugin | What it brings | Before it is listed |
|---|---|---|
| [Herdr](https://github.com/sunny0826/dsh-plugin-herdr) (`dsh-plugin-herdr`, MIT) | DSH sessions observe and drive Herdr, the terminal workspace for AI coding agents: its workspaces, panes and agents, as `herdr_*` tools and a status panel. The agents Herdr runs (Claude Code, Codex and others) bring their own subscriptions. | 0.0.1 does not load on 0.2.1-rc.2: it ships DSH's own packages as dependencies pinned to 0.0.x/0.1.x (`@deepseek-ai/dsh-tools` 0.0.1-rc.1 imports a `CallId` that `@deepseek-ai/dsh-llm` 0.2.1-rc.2 no longer exports). They have to become peer dependencies, on the 0.2 API. Tracked in [#1](https://github.com/automagik-dev/dsh-marketplace/issues/1). |

## Versions

Every plugin carries its product's version: Omni's plugins are listed at each Omni release, pinned to that release's commit (a git source with the plugin's folder). A version, once listed, never changes what it installs. `products.json` names each product, where its own index lives in its repository, and the last release listed.

`follow.yml` runs every 30 minutes. For each product that cut a newer release (`v<semver>`, prereleases included) whose own plugins are at that version, it lists them at it, takes the add-ons the product's index lists, checks the result, and commits it. Releases that do not carry their plugins at their version are skipped.

```sh
bun install
bun test                         # the index logic, and DSH's own parser over index.json
bun scripts/market.ts check      # every git entry holds, at its commit, the package and version it lists
bun scripts/market.ts follow     # list the products' newer releases
```

## Adding a product

A product joins with an entry in `products.json`: its repository, the path of its own DSH market index there, and the release to start after. Its own plugins are the git entries from its repository in that index: their folders must hold built, installable packages at each release, at the product's version. Its other entries are the add-ons it vetted.

## Every Omni is a market too

Each Omni serves the market for its own release at `https://<your-omni>/api/market/index.json`: its own plugins at exactly its version, plus the add-ons it vetted. Omni desktop and the Omni channels plugin add it when you link an Omni.

## License

Apache-2.0
