# Upstream sync procedure

Read this only when the user says "sync upstream." Follow it instead of
running open-ended git history commands (`git log --all`, `git branch -a`,
etc.) — those are what cause the slow, unbounded archaeology this file
exists to avoid.

Repo relationships:

- origin: `alvarovelosa/OMP-ADHD-Edition` (this fork, branch `main`)
- upstream: `can1357/oh-my-pi` (branch `main`)
- strategy: **merge upstream into origin**, never rebase — rebase would
  replay every fork commit against upstream's full history and multiply the
  conflict surface for no benefit here.

## Steps

1. Confirm the working tree is clean (`git status`). If not, stop and tell
   the user — do not stash or discard automatically.
2. `git fetch upstream` and `git fetch origin`.
3. Show only the bounded diff, not full history:
   - `git log origin/main..upstream/main --oneline` — new upstream work
     about to be merged in.
   - `git log upstream/main..origin/main --oneline` — this fork's own
     commits, for context on what might conflict.
4. `git merge upstream/main`.
5. If conflicts occur, resolve them file by file. Known recurring conflict
   shape: `AGENTS.md` — upstream edits it often; the fork's own addition is
   the `## Fork Notes (OMP ADHD Edition)` section at the very end. Keep both
   sides' content; the fork section should stay intact and at the bottom.
6. Run `bun check` and the relevant test suite before considering the merge
   done.
7. **Self-heal check**: verify `AGENTS.md` still contains the
   `## Fork Notes (OMP ADHD Edition)` section (including the pointer lines to
   `FORK.md` and this file). If a conflict resolution dropped it, re-add it
   verbatim before finishing.
8. If any fork-specific feature shipped alongside this sync (rare — usually
   sync is upstream-only), add a line to `FORK.md` and the owning package's
   `CHANGELOG.md [Unreleased]`.
9. Push.
