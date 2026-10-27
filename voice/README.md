# Voice studio index

`index.json` is the DSH plugin market index (format 1) for the private
[`namastexlabs/dsh-livekit`](https://github.com/namastexlabs/dsh-livekit) voice plugins:
`@dsh-voice/runtime`, `@dsh-voice/agent-builder`, `@dsh-voice/playground`,
`@dsh-voice/simulations`, `@dsh-voice/observatory`, each at `0.1.0` pinned to a full commit.

It is a **standalone index**, not an entry in this market's `products.json`: the Follow and
Check CI clones each product repository to prove its versions, and it has no credentials for
that private repository. DSH fetches this file anonymously and installs each commit-pinned git
source with the reader's own Git credentials.

Add `https://raw.githubusercontent.com/automagik-dev/dsh-marketplace/main/voice/index.json`
in DSH under Settings → Plugins → Plugin market → Indexes.

The file is generated and published from the product repository with `pnpm market:index` and
`pnpm market:publish -- --publish`; do not hand-edit it.
