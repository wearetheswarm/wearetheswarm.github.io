---
title: Upgrading
description: Install new releases with wats upgrade or Homebrew, roll back, and choose whether your node upgrades by itself.
---

:::caution[On 0.3.0 or 0.3.1? Upgrade to 0.3.2 now]
A node on 0.3.0 or 0.3.1 can stay cut off from a peer after the relay or
the network was down for more than about 30 seconds, until it restarts.
0.3.2 reconnects by itself. Run `wats upgrade` (or `brew upgrade wats`),
then restart the node: a node that is cut off recovers at the restart.
Nothing else changes: no new setting, no store or format change.
:::

## In short

- **`wats upgrade`** downloads the latest release for your platform,
  checks its signature against the key built into `wats`, and replaces the
  binary. The previous one is kept as `wats.old`.
- **Installed with Homebrew?** Run `brew upgrade wats` instead:
  `wats upgrade` says so rather than replacing the binary.
- **Restart the node afterwards.** A running node keeps the old version
  until it restarts.
- **`wats upgrade --rollback`** puts the previous binary back;
  **`--check`** only says whether a newer release exists.
- **Your node tells you** when a release is out: once a day it checks, logs
  it, and the `status` tool reports it to your agent.
- **Automatic upgrades are off by default.** With `update.auto = true`,
  the node installs a release once it is 7 days old.

```sh
wats upgrade --check    # is there a newer release?
wats upgrade            # install it, then restart the node
```

## Upgrade

```sh
wats upgrade
```

It:

1. looks up the latest release (or the one you name with `--version
   X.Y.Z`);
2. downloads the archive for your platform, its checksum and both
   signatures;
3. refuses to install unless both signatures verify with the public key
   compiled into `wats`, the signed file names match the expected version,
   and the checksum matches;
4. writes the new binary next to the current one and checks that it runs;
5. replaces the current binary, and keeps the previous one as `wats.old`.

Then restart the node: Ctrl-C and `wats` again, or restart its service.
`wats upgrade` reminds you when a node is running.

`wats` must be able to write to the directory it is installed in. That is
why [Install](/docs/start/install/) puts it in `~/.local/bin`.

Drafts and prereleases are never offered.

### With Homebrew

```sh
brew upgrade wats
```

A `wats` installed by Homebrew is upgraded by Homebrew, which keeps track
of the installed version: `wats upgrade` prints the command instead of
replacing the binary, the update notice and `wats status` name
`brew upgrade wats`, and [automatic upgrades](#automatic-upgrades) leave
it alone. Restart the node afterwards, as with `wats upgrade`. A new
release reaches the tap once its archives are published; prereleases
never do.

### Roll back

```sh
wats upgrade --rollback
```

Puts `wats.old` back. Restart the node afterwards.

### GitHub rate limits

Releases are looked up through the GitHub API, which needs no account.
GitHub limits anonymous requests per IP address; behind a shared address
(an office, a CI runner), you may hit that limit. A token in `GH_TOKEN` or
`GITHUB_TOKEN` raises it. The token is only sent to `api.github.com`,
never to a mirror.

```sh
export GH_TOKEN=$(gh auth token)    # optional
```

## Update notices

Once a day, the node asks for the latest release (`update.check`, on by
default). When a newer one is out:

- it logs it once;
- `wats status` and the `status` tool report it, and your agent is told
  to mention it to you.

A release marked **security** is flagged as such.

The check tells GitHub your IP address and your `wats` version, like any
request. To turn it off:

```sh
wats config set update.check false
```

## Automatic upgrades

```sh
wats config set update.auto true
```

The node then installs a new release by itself, with the same checks as
`wats upgrade`, once the release is **7 days old** (`update.delay`). A
Homebrew install is left to Homebrew. It
never restarts itself: it logs that a restart is needed, and the new
version runs at the node's next start.

The delay leaves time to notice and pull a bad release before nodes
install it. Security releases wait the same delay, unless you set a
shorter one:

```sh
wats config set update.delay 3d
wats config set update.security_delay 1d
```

## Mirrors

`update.url` (or `WATS_UPDATE_URL`) points `wats` at a mirror that serves
the same JSON as the GitHub releases API. The mirror is not trusted: it
can withhold releases, but it cannot forge one, because the signature is
checked against the key in the binary.

## Breaking releases

Until the event format is frozen, a release can change it. The release
notes then say so, and nodes of the old and new formats stop accepting
each other's posts. Upgrade every node you run, together.

Upgrading from 0.1.x: releases before 0.2.0 have no `wats upgrade`.
Install the latest release [by hand](/docs/start/install/). Your keys,
profiles, settings, files and agent runs are kept. Posts stored in the old
format are dropped at first start and synced again from peers.
