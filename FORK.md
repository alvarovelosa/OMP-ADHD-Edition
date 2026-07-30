# FORK.md — status of OMP ADHD Edition

Reference only, not a rule file. Read this (and the relevant package
`CHANGELOG.md [Unreleased]` sections) before assuming what state the fork is
in — don't reconstruct it from `git log`.

## What this is

A fork of [oh-my-pi](https://github.com/can1357/oh-my-pi) (terminal AI coding
agent) aimed at ADHD-friendly usability: visual, click-through UI instead of
hand-edited JSON, and things that stay readable instead of scrolling logs.
Upstream moves fast; this fork tracks it via periodic merges (see
`SYNC-UPSTREAM.md`) and layers a small set of its own features on top.

- origin: `alvarovelosa/OMP-ADHD-Edition`
- upstream: `can1357/oh-my-pi`
- sync strategy: merge (not rebase) — see `SYNC-UPSTREAM.md`

## What this fork adds (vs. upstream)

- **Web Settings Panel** (`packages/stats`) — click-through settings at
  `http://localhost:3847/#/settings` instead of hand-editing JSON. Includes
  setting-hiding (eye icon toggle, "Show Hidden"/"Reset Hidden"), status-line
  preview, sampling numeric input.
- **Sessions Dashboard** (`packages/stats`) — browse/archive/delete/re-read
  sessions as readable cards with a transcript viewer. Search, "show
  archived" toggle, duplicate-session grouping (collapsible by normalized
  title + cwd), and a "Resume" action that launches `omp -r <sessionId>` in
  the session's original cwd.
- **Numbered Sessions** (`packages/coding-agent`, `packages/stats`) — every
  session gets a stable `#N` (`#aN` once archived). `omp --resume <N>` /
  `/resume #N`.
- **`/models` and `/chat/completions` route aliases** (`packages/ai`) — added
  to the auth-gateway HTTP server (`src/auth-gateway/server.ts`).

Detail and exact behavior for each of these lives in the owning package's
`CHANGELOG.md [Unreleased]` section — check there before touching related
code, since entries land there as work happens and this file is a summary,
not the source of truth.

## Where to look for more

| Package | Owns |
|---|---|
| `packages/stats` | Web Settings Panel, Sessions Dashboard, numbered-session display |
| `packages/coding-agent` | Session numbering logic |
| `packages/ai` | Auth-gateway route aliases |

## Updating this file

Add a line here when a fork-specific feature ships (i.e. it has a
`CHANGELOG.md [Unreleased]` entry and isn't just tracking upstream). Don't
duplicate changelog detail here — one line + a pointer is enough.
