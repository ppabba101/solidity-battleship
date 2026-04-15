# Open Questions

## ralplan-battleship-real-multiplayer - 2026-04-15
- [ ] Exact `MIN_STAKE` for Sepolia deploy (default proposed: 1e14 wei) — affects spam floor and faucet reachability
- [ ] Exact `ABORT_TIMEOUT` value (default proposed: 1 hour) — affects how long unjoined games squat in the lobby
- [ ] `clockSeconds` allowed range — hardcode `{30, 60, 120}` or accept any value in `[30, 600]`? — affects createGame validation and UI
- [ ] Privy app id provisioning ownership — needed before WP3 can be tested with real auth
- [ ] Vercel project + domain ownership — needed for WP8
- [ ] CI policy for `DeployBaseSepolia` — every main merge vs manual dispatch only — affects spend on Basescan verifications and faucet ETH
- [ ] Should the preview-mode (MockVerifier) deploy enforce the same `MIN_STAKE` as the real deploy, or be unrestricted? — affects how casual players experience the preview
