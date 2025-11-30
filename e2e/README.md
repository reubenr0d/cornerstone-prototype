# End-to-End Tests

Document verification end-to-end tests live under `document-verification/` and exercise the full flow:

- Spin up a local Hardhat node
- Deploy the registry and a mock USD stablecoin
- Start the Eigen worker against the local registry
- Create a project, deposit funds, close a phase with a PDF doc, and assert the worker returns the verification result on-chain

## Running locally

```bash
cd e2e
npm install
npm test          # or: npm run test:document-verification
```

The test writes a cached deployment to `.deployments/document-verification.json` so reruns reuse the same contracts while the Hardhat node stays alive. Delete that file if you need a fresh deploy. The mocha suite will spin up Hardhat and the Eigen worker for you; if you want to point at an already-running node, set `E2E_RPC_URL` and `E2E_REUSE_NODE=1` when running `npm test`.
