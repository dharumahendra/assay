# Instructions for AI assistants (Claude Code and others)

Reviewing this repository? [AGENTS.md](AGENTS.md) lists the keyless commands to build, test and reproduce every result,
with the expected output of each. [README.md](README.md) maps each claim to a file, test or on-chain transaction.

## Git
- Commit and push to the `develop` branch. Do not commit to or push to `main` unless the owner asks for it explicitly.
- Never add the AI as a collaborator or author on any commit or push:
  - no `Co-Authored-By:` trailer (Claude, Anthropic, or any AI),
  - no "Generated with Claude Code" or similar lines in commit messages, PR titles, or PR bodies,
  - do not change `user.name` / `user.email`; commits use the owner's git identity as configured.
- Do not push without the owner's go-ahead; never force-push.

## Secrets
- `.env` and `~/.near-credentials` stay local and are never committed or sent anywhere.
