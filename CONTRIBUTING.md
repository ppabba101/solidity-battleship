# Contributing to Battleship, Proven

Thanks for your interest! Here's everything you need to get going.

## Running the demo

See [README.md](README.md) for the full walkthrough.

## Contracts (Foundry)

```bash
cd contracts
forge build        # compile
forge test -vv     # run all tests with verbose output
```

Requires [Foundry](https://getfoundry.sh) installed. Submodules must be initialized:

```bash
git submodule update --init --recursive
```

## Frontend

```bash
cd frontend
npm install
npm run dev        # local dev server
npm run build      # production build
```

Requires Node.js 20+.

## Circuits (Noir)

Requires [nargo](https://noir-lang.org/docs/getting_started/installation) and
[bb](https://github.com/AztecProtocol/aztec-packages) installed locally.

```bash
cd circuits
nargo build
nargo test
```

## Commit message style

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add ship placement validation
fix: correct proof verification revert message
docs: update README deploy instructions
chore: bump forge-std to v1.16
```

## Opening a PR

1. Fork the repo and create a feature branch.
2. Run `forge test` and `npm run build` — both must pass.
3. Open a PR against `main` using the provided template.
