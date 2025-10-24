import { fromStablecoin, ProjectStaticConfig } from "@/lib/eth";
import {
  AppraisalSubmittedEvent,
  DepositEvent,
  FundraiseClosedEvent,
  PhaseClosedEvent,
  PhaseMetrics,
  PhaseFundsWithdrawnEvent,
  Project,
  ReserveFundedEvent,
  SalesProceedsSubmittedEvent,
} from "@/lib/envio";

const PHASE_LABELS = [
  "Fundraising and Acquisition",
  "Design and Architectural",
  "Permitting",
  "Abatement/Demolition",
  "Construction",
  "Revenue and Sales",
] as const;

const DAY_MS = 86_400_000;

type DailyBucket = {
  deposits: number;
  withdrawals: number;
};

export type InsightChartPoint = {
  timestamp: number;
  isoLabel: string;
  dailyDeposits: number;
  dailyWithdrawals: number;
  dailyReserveFunded: number;
  cumulativeDeposits: number;
  cumulativeWithdrawals: number;
  cumulativeReserveFunded: number;
  netExposure: number;
};

export type InsightPhaseOverlay = {
  phaseId: number;
  label: string;
  start: number;
  end: number;
  aprPercent: number;
  capAmount: number;
  capPercent: number;
  status: "past" | "current" | "upcoming";
};

export type InsightEventMarker = {
  id: string;
  type: "deposit" | "withdrawal" | "phase" | "reserve" | "proceeds" | "fundraise" | "appraisal";
  timestamp: number;
  title: string;
  subtitle?: string;
  amount?: number;
  phaseId?: number;
  tone: "primary" | "success" | "warning" | "info";
};

export type ProjectInsightsData = {
  points: InsightChartPoint[];
  phases: InsightPhaseOverlay[];
  events: InsightEventMarker[];
  totals: {
    totalDeposited: number;
    totalWithdrawn: number;
    netExposure: number;
    lastUpdated: number | null;
  };
  domain: {
    start: number;
    end: number;
  };
};

type BuildArgs = {
  project: Project | null;
  staticConfig: ProjectStaticConfig | null;
  tokenSymbol?: string;
  now?: number;
};

const ZERO_DATA: ProjectInsightsData = {
  points: [],
  phases: [],
  events: [],
  totals: {
    totalDeposited: 0,
    totalWithdrawn: 0,
    netExposure: 0,
    lastUpdated: null,
  },
  domain: {
    start: Date.now(),
    end: Date.now(),
  },
};

export function buildProjectInsightsData({
  project,
  staticConfig,
  tokenSymbol,
  now = Date.now(),
}: BuildArgs): ProjectInsightsData {
  if (!project) {
    return ZERO_DATA;
  }

  const deposits = (project.deposits || []).slice().sort(byTimestamp);
  const withdrawals = (project.fundWithdrawn || []).slice().sort(byTimestamp);
  const reserveFunded = (project.reserveFunded || []).slice().sort(byTimestamp);
  
  // Create individual events for each deposit, withdrawal, and reserve funding
  const allEvents: Array<{ timestamp: number; type: 'deposit' | 'withdrawal' | 'reserveFunded'; amount: number }> = [];
  
  for (const event of deposits) {
    const ts = parseTimestamp(event.blockTimestamp);
    if (ts === null) continue;
    allEvents.push({
      timestamp: ts,
      type: 'deposit',
      amount: toTokenAmount(event.amountPYUSD),
    });
  }

  for (const event of withdrawals) {
    const ts = parseTimestamp(event.blockTimestamp);
    if (ts === null) continue;
    allEvents.push({
      timestamp: ts,
      type: 'withdrawal',
      amount: toTokenAmount(event.amount),
    });
  }

  for (const event of reserveFunded) {
    const ts = parseTimestamp(event.blockTimestamp);
    if (ts === null) continue;
    allEvents.push({
      timestamp: ts,
      type: 'reserveFunded',
      amount: toTokenAmount(event.amount),
    });
  }

  // Sort all events by timestamp
  allEvents.sort((a, b) => a.timestamp - b.timestamp);

  const points: InsightChartPoint[] = [];
  let runningDeposits = 0;
  let runningWithdrawals = 0;
  let runningReserveFunded = 0;

  for (const event of allEvents) {
    if (event.type === 'deposit') {
      runningDeposits += event.amount;
    } else if (event.type === 'withdrawal') {
      runningWithdrawals += event.amount;
    } else if (event.type === 'reserveFunded') {
      runningReserveFunded += event.amount;
    }
    
    points.push({
      timestamp: event.timestamp,
      isoLabel: new Date(event.timestamp).toISOString(),
      dailyDeposits: event.type === 'deposit' ? event.amount : 0,
      dailyWithdrawals: event.type === 'withdrawal' ? event.amount : 0,
      dailyReserveFunded: event.type === 'reserveFunded' ? event.amount : 0,
      cumulativeDeposits: runningDeposits,
      cumulativeWithdrawals: runningWithdrawals,
      cumulativeReserveFunded: runningReserveFunded,
      netExposure: runningDeposits - runningWithdrawals,
    });
  }

  const lastPointTs = points.at(-1)?.timestamp ?? parseTimestamp(project.projectState?.lastUpdatedTimestamp) ?? now;
  const firstPointTs =
    points[0]?.timestamp ??
    parseTimestamp(project.createdAtTimestamp) ??
    (lastPointTs ? Math.max(lastPointTs - 14 * DAY_MS, 0) : now);

  const phases = derivePhaseOverlays({
    project,
    staticConfig,
    seriesStart: firstPointTs,
    seriesEnd: lastPointTs,
    now,
  });

  const events = deriveEventMarkers({
    project,
    tokenSymbol,
  });

  const totalDeposited = toTokenAmount(project.projectState?.totalRaised);
  const totalWithdrawn = toTokenAmount(project.projectState?.totalDevWithdrawn);
  const netExposure = totalDeposited - totalWithdrawn;

  const domainStart =
    phases.length > 0 ? Math.min(firstPointTs, ...phases.map((phase) => phase.start)) : firstPointTs;
  const domainEnd = phases.length > 0 ? Math.max(lastPointTs, ...phases.map((phase) => phase.end)) : lastPointTs;

  return {
    points,
    phases,
    events,
    totals: {
      totalDeposited,
      totalWithdrawn,
      netExposure,
      lastUpdated: parseTimestamp(project.projectState?.lastUpdatedTimestamp),
    },
    domain: {
      start: domainStart,
      end: domainEnd,
    },
  };
}

function byTimestamp(a: { blockTimestamp?: string | null }, b: { blockTimestamp?: string | null }) {
  return (Number(a.blockTimestamp ?? 0) || 0) - (Number(b.blockTimestamp ?? 0) || 0);
}

function parseTimestamp(value?: string | number | null): number | null {
  if (value === undefined || value === null) return null;
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) return null;
  if (numeric === 0) return null;
  return Math.floor(numeric) * 1000;
}

function truncateToDay(ts: number): number {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function ensureBucket(store: Map<number, DailyBucket>, key: number): DailyBucket {
  let entry = store.get(key);
  if (!entry) {
    entry = { deposits: 0, withdrawals: 0 };
    store.set(key, entry);
  }
  return entry;
}

function toTokenAmount(value?: string | bigint | null): number {
  if (value === undefined || value === null) return 0;
  try {
    const big = typeof value === "bigint" ? value : BigInt(value);
    return Number(fromStablecoin(big));
  } catch {
    return 0;
  }
}

function derivePhaseOverlays({
  project,
  staticConfig,
  seriesStart,
  seriesEnd,
  now,
}: {
  project: Project;
  staticConfig: ProjectStaticConfig | null;
  seriesStart: number;
  seriesEnd: number;
  now: number;
}): InsightPhaseOverlay[] {
  const metrics = (project.projectState?.phases || []).slice().sort((a, b) => a.phaseId - b.phaseId);
  const metricsById = new Map<number, PhaseMetrics>();
  for (const metric of metrics) {
    metricsById.set(metric.phaseId, metric);
  }


  const latestConfig = project.phaseConfigurations?.[0];

  const perPhaseAprBps = Array.from({ length: PHASE_LABELS.length }, (_, i) => {
    const metric = metricsById.get(i);
    if (metric && metric.aprBps && metric.aprBps !== '0') {
      return Number(metric.aprBps);
    }
    if (latestConfig?.aprBps?.[i]) {
      const parsed = Number(latestConfig.aprBps[i]);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  });
  const targetAmount = latestConfig?.phaseCaps?.length
    ? latestConfig.phaseCaps.reduce((sum, cap) => sum + toTokenAmount(cap), 0)
    : staticConfig
      ? Number(fromStablecoin(staticConfig.maxRaise))
      : 0;

  const perPhaseCap: number[] = [];
  const cumulativeCap: number[] = [];
  for (let i = 0; i < PHASE_LABELS.length; i++) {
    const metric = metricsById.get(i);
    // Use Envio data if available, otherwise fallback to contract data
    const capAmount = metric && metric.phaseCap !== '0'
      ? toTokenAmount(metric.phaseCap)
      : latestConfig?.phaseCaps?.[i]
        ? toTokenAmount(latestConfig.phaseCaps[i])
        : 0;
    perPhaseCap[i] = capAmount;
    cumulativeCap[i] = (cumulativeCap[i - 1] || 0) + capAmount;
    
  }

  const currentPhase = project.projectState?.currentPhase ?? 0;
  const overlays: InsightPhaseOverlay[] = [];
  let cursor = seriesStart;

  for (let i = 0; i < PHASE_LABELS.length; i++) {
    const metric = metricsById.get(i);
    const isClosed = metric?.isClosed ?? false;
    const start = cursor;
    let end = metric?.closedAtTimestamp ? parseTimestamp(metric.closedAtTimestamp) ?? cursor : undefined;

    if (!end) {
      if (i < currentPhase) {
        end = parseTimestamp(project.projectState?.lastUpdatedTimestamp) ?? seriesEnd;
      } else if (i === currentPhase) {
        end = seriesEnd || now;
      } else {
        let durationMs = metric?.duration ? Number(metric.duration) * 1000 : 0;
        if (!durationMs && latestConfig?.durations?.[i]) {
          const seconds = Number(latestConfig.durations[i]);
          if (Number.isFinite(seconds)) {
            durationMs = seconds * 1000;
          }
        }
        end = (overlays.at(-1)?.end || seriesEnd || now) + (durationMs || 21 * DAY_MS);
      }
    }

    if (end <= start) {
      end = start + DAY_MS;
    }

    cursor = end;

    const status: InsightPhaseOverlay["status"] =
      i < currentPhase ? "past" : i === currentPhase ? "current" : "upcoming";

    const aprPercent = perPhaseAprBps[i] ? perPhaseAprBps[i] / 100 : 0;
    const capAmount = cumulativeCap[i] ?? 0;
    const capPercent = targetAmount > 0 ? Math.min(100, (capAmount / targetAmount) * 100) : 0;

    overlays.push({
      phaseId: i,
      label: PHASE_LABELS[i],
      start,
      end,
      aprPercent,
      capAmount,
      capPercent,
      status: isClosed ? "past" : status,
    });
  }

  return overlays;
}

function deriveEventMarkers({
  project,
  tokenSymbol,
}: {
  project: Project;
  tokenSymbol?: string;
}): InsightEventMarker[] {
  const symbol = tokenSymbol || "tokens";
  const markers: InsightEventMarker[] = [];

  const withdrawals = project.fundWithdrawn || [];
  if (withdrawals.length > 0) {
    const recent = withdrawals.slice(-2);
    for (const event of recent) {
      pushMarker(markers, {
        id: `withdraw-${event.id}`,
        type: "withdrawal",
        timestamp: parseTimestamp(event.blockTimestamp),
        title: `Phase ${event.phaseId + 1} Withdrawal`,
        subtitle: formatAmountSubtitle(event.amount, symbol),
        amount: toTokenAmount(event.amount),
        tone: "warning",
        phaseId: event.phaseId,
      });
    }
  }

  const reserveEvents = project.reserveFunded || [];
  for (const event of reserveEvents.slice(-2)) {
    pushMarker(markers, {
      id: `reserve-${event.id}`,
      type: "reserve",
      timestamp: parseTimestamp(event.blockTimestamp),
      title: "Reserve Funded",
      subtitle: formatAmountSubtitle(event.amount, symbol),
      amount: toTokenAmount(event.amount),
      tone: "success",
    });
  }

  const proceedsEvents = project.salesProceeds || [];
  for (const event of proceedsEvents.slice(-2)) {
    pushMarker(markers, {
      id: `proceeds-${event.id}`,
      type: "proceeds",
      timestamp: parseTimestamp(event.blockTimestamp),
      title: "Sales Proceeds Submitted",
      subtitle: formatAmountSubtitle(event.amount, symbol),
      amount: toTokenAmount(event.amount),
      tone: "success",
    });
  }

  const fundraiseEvents = project.fundraiseClosed || [];
  for (const event of fundraiseEvents) {
    pushMarker(markers, {
      id: `fundraise-${event.id}`,
      type: "fundraise",
      timestamp: parseTimestamp(event.blockTimestamp),
      title: event.successful ? "Fundraise Closed — Successful" : "Fundraise Closed",
      tone: event.successful ? "success" : "info",
    });
  }

  const phaseClosedEvents = project.phasesClosed || [];
  for (const event of phaseClosedEvents) {
    pushMarker(markers, {
      id: `phase-${event.id}`,
      type: "phase",
      timestamp: parseTimestamp(event.blockTimestamp),
      title: `Phase ${event.phaseId + 1} Closed`,
      tone: "info",
      phaseId: event.phaseId,
    });
  }

  const appraisals = project.appraisals || [];
  for (const event of appraisals.slice(-2)) {
    pushMarker(markers, {
      id: `appraisal-${event.id}`,
      type: "appraisal",
      timestamp: parseTimestamp(event.blockTimestamp),
      title: "Appraisal Submitted",
      subtitle: event.percentComplete ? `${Number(event.percentComplete) / 100}% complete` : undefined,
      tone: "info",
    });
  }

  return markers
    .filter((marker): marker is InsightEventMarker & { timestamp: number } => typeof marker.timestamp === "number")
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-18);
}

function pushMarker(
  bucket: InsightEventMarker[],
  marker: Omit<InsightEventMarker, "timestamp"> & { timestamp: number | null },
) {
  if (marker.timestamp === null) return;
  bucket.push({ ...marker, timestamp: marker.timestamp });
}

function formatAmountSubtitle(value: string | bigint | undefined, symbol: string) {
  const amount = toTokenAmount(value);
  if (!amount) return undefined;
  return `${formatNumber(amount)} ${symbol}`;
}

function formatNumber(value: number): string {
  return Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2,
  }).format(value);
}
