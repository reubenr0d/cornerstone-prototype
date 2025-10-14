# Cornerstone Contracts

Cornerstone is a tokenized real‑estate investment protocol. This package contains the core Solidity smart contracts.

## Overview
- `ProjectRegistry`: Factory that deploys new `CornerstoneProject` instances and returns the project + token addresses. Supports custom token name/symbol.
- `CornerstoneProject`: Lifecycle and accounting for a single property portfolio with 5 hardcoded development phases (plus fundraising stage 0), developer withdraw caps, reserve‑funded on‑chain interest, proceeds routing, and pro‑rata distributions.
- `CornerstoneToken`: ERC‑20 shares (6 decimals) minted/burned by the project only. Clean ERC‑20 for DEX trading; includes a transfer hook to keep distributions fair across transfers.
- `mocks/MockUSDC`: Test stablecoin (6 decimals).

## Key Design
- 6 stages total numbered 0 → 5 (0 = fundraising pseudo‑phase; 1 → 5 are development stages). Fundraising remains open after stage 0 and closes when stage 4 is closed (entering stage 5).
- Developer must submit docs to close phases 0–5. Fundraising (stage 0) requires docs via `closePhase(0, docTypes, docHashes, metadataURIs)`; they are emitted in `PhaseClosed(0, ...)`.
- Withdraw caps per phase are expressed in bps of `maxRaise` and enforced cumulatively. Sum of caps must be ≤ 100%.
- Phase 5 supports progressive unlocks via `submitAppraisal(percentComplete)` until closure.
- Deposits allowed in stages 0–4; disabled in stage 5. During stage 0, deposits respect `fundraiseDeadline`. After stage 0, deposits continue until stage 5 starts. Fundraising closes when entering stage 5.
- On‑chain APR accrual by phase with compounding. Interest is funded by the developer reserve, credited pro‑rata to holders, and claimable.
- Sales proceeds first fill a principal buffer; investors redeem principal by burning shares. Excess proceeds are distributed as revenue pro‑rata and claimable.
- Transfer‑aware distributions using per‑share indices and balance corrections on transfers.
- Pausable and role‑gated (developer/owner only for admin actions).

## Lifecycle
1. Create project via `ProjectRegistry.createProjectWithTokenMeta(...)` with parameters:
   - `minRaise`, `maxRaise`, `fundraiseDeadline`
   - `phaseAPRs[5]` (bps), `phaseDurations[5]` (info only), `phaseWithdrawCaps[5]` (bps of `maxRaise`)
2. Fundraising (stage `0`): users `deposit(amount)`. Developer starts Stage 1 with `closePhase(0, ...)` and must provide docs; a `PhaseClosed(0, ...)` event is emitted. Fundraising remains open.
   - If `totalRaised < minRaise`: refunds enabled via `refundIfMinNotMet(user)`.
   - If successful: phase becomes `1` and interest accrual starts when accruer is triggered.
3. Phases 1–4: developer closes each phase with docs; per‑phase cap becomes unlocked cumulatively.
4. Phase 5: progressive unlock via `submitAppraisal(percentComplete)` until phase 5 is closed with docs; then full cap unlocked. Proceeds collection and distributions continue.
6. Proceeds: `submitSalesProceeds(amount)` routes to principal buffer first; when principal is fully covered, excess is distributed as revenue per‑share.
6. Fundraising closure: when Phase 4 is closed (entering Phase 5), emit `FundraiseClosed(successful)` based on whether `totalRaised >= minRaise` was ever achieved.
7. Principal redemption: holders call `withdrawPrincipal(shares)` to burn and redeem from the principal buffer.
8. Interest: anyone can trigger accrual; holders claim with `claimInterest(amount)`.
9. Revenue: holders claim with `claimRevenue(msg.sender)`.

## Interest Accrual
- Current APR is selected by active phase (1..5). No accrual during fundraising (phase 0).
- Continuous compounding via discrete steps when accrual is triggered:
  - `interest = accrualBase * aprBps * dt / (10000 * 365 days)`
  - Moves funds from `reserveBalance` → `poolBalance`, increases `accrualBase`, and increases `interestPerShare`.
  - Reserve must be sufficiently funded (`fundReserve(amount)` by developer), otherwise accrual reverts.

## Access Control
- Developer (project `owner`) only:
  - `closePhase`, `withdrawPhaseFunds`, `submitAppraisal`, `submitSalesProceeds`, `fundReserve`, `pause`, `unpause`.
- Users:
- `deposit` (phases 0–4), `withdrawPrincipal`, `claimInterest`, `claimRevenue`, `refundIfMinNotMet` (if unsuccessful fundraise).

## Caps and Withdrawals
- `getPhaseCap(phaseId)` returns `maxRaise * capBps / 10000`.
- Cumulative unlocked = sum of caps for closed phases; Phase 5 adds a progressive portion while active.
- `withdrawPhaseFunds(amount)` enforces `totalDevWithdrawn + amount <= unlocked` and transfers USDC to developer.

## Claimable Helpers
- `claimableInterest(address user)` and `claimableRevenue(address user)` report accrued amounts available to claim.

## Events
- `ProjectCreated(project, token, creator)` (registry)
- `Deposit(user, amountUSDC, sharesMinted)`
- `InterestClaimed(user, amount)`
- `ReserveFunded(amount, by)`
- `FundraiseClosed(successful)`
- `PhaseClosed(phaseId, docTypes, docHashes)`
- `PhaseFundsWithdrawn(phaseId, amount)`
- `AppraisalSubmitted(percentComplete, appraisalHash)`
- `SalesProceedsSubmitted(amount)`
- `PrincipalClaimed(user, amount)`
- `RevenueClaimed(user, amount)`

## Directory Structure
- `core/ProjectRegistry.sol` — factory
- `core/CornerstoneProject.sol` — project lifecycle & accounting
- `core/CornerstoneToken.sol` — ERC‑20 share token (6 decimals)
- `mocks/MockUSDC.sol` — test stablecoin

<!-- Foundry build/test removed in favor of Hardhat -->

## Build & Test (Hardhat)
- Prereqs: Node.js 18+, pnpm/npm/yarn
- From `contracts/` directory (this directory is the Hardhat project):
  - Install deps: `cd contracts && npm install`
  - Compile: `cd contracts && npm run compile`
  - Clean: `cd contracts && npm run clean`
  - Test: `cd contracts && npm test` (when JS/TS tests are added)

Notes:
- Solidity imports use npm package `@openzeppelin/contracts`.

<!-- CI section removed (Foundry workflow was deleted). -->

## Deployment
- Use the registry to deploy:
```solidity
(address project, address token) = registry.createProjectWithTokenMeta(
    "Cornerstone Example", "cEX",
    minRaise,
    maxRaise,
    fundraiseDeadline,
    phaseAPRs,
    phaseDurations,
    phaseCaps
);
```
- The project deploys its own token and exposes `token()`.

## Configuration Notes
- Token decimals = 6 (aligned to USDC).
- Deposits are allowed in phases 0–4; deposits revert in phase 5.
- Sum of phase caps must be ≤ 100% (bps ≤ 10000). Caps are based on `maxRaise`.
- `phaseDurations` are informational on‑chain (no enforcement), useful for UIs/ops.

## Security & Operational Notes
- Reserve must be funded to satisfy required interest accrual; accrual reverts if underfunded.
- Distributions are transfer‑aware to support secondary markets; ensure the token hook remains connected to the project.
- Critical functions are owner‑only and protected by reentrancy guards; contracts are pausable.
- Review and audits recommended before production deployment.

## Contracts Entry Points
- Registry: `contracts/core/ProjectRegistry.sol`
- Project: `contracts/core/CornerstoneProject.sol`
- Token: `contracts/core/CornerstoneToken.sol`

---
Questions or changes you want to explore (e.g., fee models, additional roles, KYC gates)? Open an issue or propose a PR in the monorepo.
