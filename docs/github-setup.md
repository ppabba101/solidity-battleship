# GitHub Remote Setup

The repo is ready locally. Run these commands once to create the GitHub remote and push:

## 1. Create the GitHub repo (requires `gh` CLI)

```bash
gh repo create ppabba101/solidity-battleship \
  --public \
  --source=. \
  --remote=origin \
  --description "Battleship, Proven: a zk-SNARK Solidity demo"
```

## 2. Stage and commit everything

```bash
git add .
git commit -m "chore: initial project scaffold"
```

## 3. Push

```bash
git push -u origin main
```

## Prerequisites

- `gh` CLI installed: https://cli.github.com
- Authenticated: `gh auth login`
- Submodules initialized: `git submodule update --init --recursive`

## Verify submodule state

```bash
git submodule status
```

Expected output shows commit hashes without a `-` prefix (which would indicate uninitialized).
