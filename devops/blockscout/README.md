Blockscout for Local Hardhat (chainId 1337)

Prereqs
- Docker Desktop installed and running
- Local node on `http://127.0.0.1:8545` (Hardhat)

Start Hardhat and deploy
1) In `contracts/` run a local node:
   - `npm run node`
2) In a separate terminal, deploy contracts:
   - `npm run deploy:local`

Run Blockscout
From repo root:
```
docker compose -f devops/blockscout/docker-compose.yml up -d
```
Open the UI (via proxy): http://localhost:8080

APIs
- Blockscout API: http://localhost:4000 (e.g. GET /api/v2/blocks). The UI proxies API under http://localhost:8080/node-api/proxy/…

Moved
- The active docker-compose and config now live at `contracts/blockscout/`.
- Use npm scripts from `contracts/package.json`:
  - `npm run explorer:up` — start stack
  - `npm run explorer:down` — stop stack
  - `npm run explorer:logs` — tail backend logs
  - `npm run explorer:open` — open UI
- Smart Contract Verifier API (no UI): http://localhost:8050/health should return {"status":"SERVING"}

Notes
- The compose uses `host.docker.internal` so containers can reach your host RPC.
- Traces are enabled via `ETHEREUM_JSON_RPC_TRACE_URL` and Hardhat’s `debug_traceTransaction`.
- Contract verification is available via the UI (Verify tab). For scriptable verification, you can use the Smart Contract Verifier HTTP API exposed at `http://localhost:8050`.
- If you use Anvil instead of Hardhat, start it with `anvil --chain-id 1337` and keep the same compose.

Troubleshooting
- If the UI shows “cannot connect to RPC”, ensure Hardhat is running on port 8545.
- If Postgres port 5432 conflicts, remove the `ports:` line under `db:` or change it.
- To view logs: `docker compose -f devops/blockscout/docker-compose.yml logs -f blockscout`
