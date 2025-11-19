# EigenCloud Worker (PDF Verification)

Minimal worker that listens to `VerificationRequested` events on CornerstoneProject contracts, fetches PDFs from IPFS, performs a placeholder verification (currently always true), and writes pass/fail on-chain via `setVerificationResult`.

## Prereqs
- Node 18+
- npm
- Access to Sepolia RPC and funded worker key (for local runs). EigenCloud will inject `MNEMONIC` in TEE.

## Configure
Copy `.env.example` to `.env` and fill in:
- `RPC_URL` – Sepolia RPC
- `REGISTRY_ADDRESS` – ProjectRegistry; worker will auto-discover projects via `ProjectCreated`
- `START_BLOCK` – block to backfill existing projects (e.g., 9493638)
- `PROJECT_ADDRESSES` – optional comma-separated seed projects in addition to registry discovery
- `WORKER_PRIVATE_KEY` – local only; unused in EigenCloud (TEE injects `MNEMONIC`)
- `IPFS_GATEWAYS` – comma-separated gateways
- `LOG_LEVEL` – optional tuning

## Run locally
```bash
cd eigencloud
npm install
npm start
```
The worker will log `job.received` and `job.completed` (or `job.failed`).

## Docker / EigenCloud
- Build: `docker build --platform=linux/amd64 -t <image> .`
- Run: `docker run --env-file .env <image>`
- Deploy with EigenX CLI: `eigenx app deploy --dockerfile eigencloud/Dockerfile --env-file eigencloud/.env`

## Notes
- No frontend changes; visibility via logs only.
- Idempotent per `jobId` (derived on-chain). Duplicate events are ignored in-memory.
- Fetch uses multiple gateways + retries; no size/time caps enforced currently.
