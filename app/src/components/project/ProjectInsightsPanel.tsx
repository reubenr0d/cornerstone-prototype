import { useId } from "react";

import { cn } from "@/lib/utils";
import type { ProjectInsightsData } from "@/lib/project-insights";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Area, CartesianGrid, ComposedChart, ReferenceArea, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";

type Props = {
  loading: boolean;
  data: ProjectInsightsData;
  tokenSymbol: string;
  className?: string;
};

const minecraftColors = {
  grass: "#3B873E",
  leaf: "#4DAE4A",
  dirt: "#8B5A2B",
  water: "#2F7A9A",
  gold: "#C0841A",
  stone: "#4B5563",
} as const;

const chartConfig = {
  deposits: {
    label: "Cumulative Deposits",
    color: minecraftColors.leaf,
  },
  withdrawals: {
    label: "Cumulative Withdrawals",
    color: minecraftColors.dirt,
  },
  net: {
    label: "Net Exposure",
    color: minecraftColors.water,
  },
} as const;

const phaseTone: Record<"past" | "current" | "upcoming", { fill: string; stroke: string }> = {
  past: {
    fill: "rgba(59, 135, 62, 0.2)",
    stroke: "rgba(77, 174, 74, 0.45)",
  },
  current: {
    fill: "rgba(47, 122, 154, 0.24)",
    stroke: "rgba(47, 122, 154, 0.45)",
  },
  upcoming: {
    fill: "rgba(139, 90, 43, 0.18)",
    stroke: "rgba(139, 90, 43, 0.38)",
  },
};

function formatAxisLabel(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatAmount(value: number, symbol: string) {
  if (!Number.isFinite(value)) return `0 ${symbol}`;
  const formatted = Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2,
  }).format(value);
  return `${formatted} ${symbol}`;
}

export function ProjectInsightsPanel({ loading, data, tokenSymbol, className }: Props) {
  const gradientDepositsId = useId().replace(/:/g, "") + "-deposits";
  const gradientWithdrawalsId = useId().replace(/:/g, "") + "-withdrawals";
  const gradientNetId = useId().replace(/:/g, "") + "-net";

  const points = data.points.length
    ? data.points
    : [{ timestamp: data.domain.start, cumulativeDeposits: 0, cumulativeWithdrawals: 0, netExposure: 0 }];

  const maxSeries = points.reduce(
    (acc, point) =>
      Math.max(acc, point.cumulativeDeposits, point.cumulativeWithdrawals, Math.abs(point.netExposure)),
    0,
  );
  const yPad = maxSeries > 0 ? maxSeries * 0.12 : 10;

  const domainSpan = Math.max(1, data.domain.end - data.domain.start);
  return (
    <div
      className={cn(
        "relative flex h-full min-h-[26rem] flex-col gap-5 rounded-3xl border border-emerald-200/50 bg-emerald-50/70 p-5 shadow-soft backdrop-blur dark:border-emerald-900/60 dark:bg-slate-950/45",
        className,
      )}
    >
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">Project Flow Insights</h2>
          {loading ? (
            <Skeleton className="h-4 w-32" />
          ) : data.totals.lastUpdated ? (
            <span className="text-xs text-stone-600 dark:text-stone-300/80">
              Updated {new Date(data.totals.lastUpdated).toLocaleString()}
            </span>
          ) : (
            <span className="text-xs text-stone-600 dark:text-stone-300/80">Awaiting activity</span>
          )}
        </div>
        <p className="text-sm text-emerald-800/90 dark:text-emerald-200">
          Cumulative deposits, developer withdrawals, and phase unlocks rendered over time.
        </p>
      </header>

      <div className="relative flex-1">
        <div
          className="absolute inset-0 -z-10 rounded-3xl opacity-95 dark:opacity-80"
          style={{
            background:
              "linear-gradient(135deg, rgba(59,135,62,0.22) 0%, rgba(91,160,48,0.2) 42%, rgba(139,90,43,0.18) 100%)",
          }}
        />
        <div className="relative h-full rounded-3xl border border-emerald-200/60 bg-white/70 p-3 dark:border-emerald-900/50 dark:bg-slate-950/60">
          <ChartContainer
            config={chartConfig}
            className="h-full w-full [&_.recharts-cartesian-grid_line]:stroke-emerald-200/60 dark:[&_.recharts-cartesian-grid_line]:stroke-emerald-900/50"
          >
            <ComposedChart data={points} margin={{ top: 24, right: 24, bottom: 16, left: 8 }}>
                <defs>
                  <linearGradient id={gradientDepositsId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor={minecraftColors.leaf} stopOpacity={0.55} />
                    <stop offset="95%" stopColor={minecraftColors.leaf} stopOpacity={0.08} />
                  </linearGradient>
                  <linearGradient id={gradientWithdrawalsId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor={minecraftColors.dirt} stopOpacity={0.52} />
                    <stop offset="95%" stopColor={minecraftColors.dirt} stopOpacity={0.08} />
                  </linearGradient>
                  <linearGradient id={gradientNetId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor={minecraftColors.water} stopOpacity={0.55} />
                    <stop offset="95%" stopColor={minecraftColors.water} stopOpacity={0.08} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" vertical={false} />

                {data.phases.map((phase) => {
                  const tone = phaseTone[phase.status];
                  return (
                    <ReferenceArea
                      key={`phase-${phase.phaseId}`}
                      x1={phase.start}
                      x2={phase.end}
                      stroke={tone.stroke}
                      fill={tone.fill}
                      fillOpacity={1}
                      strokeOpacity={0.4}
                    />
                  );
                })}

                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={[data.domain.start, data.domain.end]}
                  tickFormatter={formatAxisLabel}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={0}
                  domain={[Math.min(0, -yPad), maxSeries + yPad]}
                  hide
                />

                <Area
                  dataKey="cumulativeDeposits"
                  type="monotone"
                  stroke={minecraftColors.leaf}
                  strokeWidth={2}
                  fill={`url(#${gradientDepositsId})`}
                  name="deposits"
                  isAnimationActive={false}
                />
                <Area
                  dataKey="cumulativeWithdrawals"
                  type="monotone"
                  stroke={minecraftColors.dirt}
                  strokeWidth={2}
                  fill={`url(#${gradientWithdrawalsId})`}
                  name="withdrawals"
                  isAnimationActive={false}
                />
                <Area
                  dataKey="netExposure"
                  type="monotone"
                  stroke={minecraftColors.water}
                  strokeWidth={2}
                  fill={`url(#${gradientNetId})`}
                  name="net"
                  isAnimationActive={false}
                />

                <ChartTooltip
                  cursor={{ strokeDasharray: "4 4", stroke: "rgba(15, 23, 42, 0.2)" }}
                  content={<InsightsTooltip tokenSymbol={tokenSymbol} />}
                />
              </ComposedChart>
          </ChartContainer>

          {data.phases.length > 0 ? (
            <>
              <div className="mt-5 hidden lg:block">
                <div className="-mx-2 overflow-x-auto pb-3">
                  <div className="flex items-stretch gap-3 px-2">
                    {data.phases.map((phase) => {
                      const duration = Math.max(0, phase.end - phase.start);
                      const durationRatio = Math.max(0.05, duration / domainSpan);
                      const widthRem = 13 + durationRatio * 18;
                      return (
                        <div
                          key={`phase-card-${phase.phaseId}`}
                          className="flex min-h-[4.5rem] flex-shrink-0 flex-col justify-between rounded-2xl border border-emerald-200/60 bg-emerald-100/70 px-4 py-3 text-[0.65rem] uppercase tracking-[0.28em] text-emerald-800 shadow-soft transition-transform hover:-translate-y-1 hover:shadow-lg dark:border-emerald-900/50 dark:bg-slate-900/70 dark:text-emerald-100"
                          style={{
                            minWidth: `${widthRem}rem`,
                          }}
                        >
                          <span className="truncate font-semibold tracking-[0.22em] text-emerald-900 dark:text-emerald-100">
                            {phase.label}
                          </span>
                          <span className="mt-2 flex items-center justify-between gap-3 text-[0.6rem] normal-case tracking-normal text-emerald-700 dark:text-emerald-200">
                            <span>{phase.aprPercent ? `${phase.aprPercent.toFixed(2)}% APY` : "APR TBD"}</span>
                            <Badge
                              className="rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.22em]"
                              style={{
                                backgroundColor: "rgba(77, 174, 74, 0.2)",
                                color: minecraftColors.leaf,
                              }}
                            >
                              {phase.capAmount ? `${Math.round(phase.capAmount).toLocaleString()} ${tokenSymbol}` : "Cap TBD"}
                            </Badge>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="-mx-2 mt-4 flex gap-2 overflow-x-auto pb-2 lg:hidden">
                {data.phases.map((phase) => (
                  <div
                    key={`phase-chip-${phase.phaseId}`}
                    className="min-w-[14rem] flex-shrink-0 rounded-2xl border border-emerald-200/60 bg-emerald-100/70 p-3 text-sm shadow-soft dark:border-emerald-900/50 dark:bg-slate-900/65"
                  >
                    <p className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-emerald-800 dark:text-emerald-200">
                      Phase {phase.phaseId + 1}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-emerald-900 dark:text-emerald-100">{phase.label}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-200">
                      <span>{phase.aprPercent ? `${phase.aprPercent.toFixed(2)}% APY` : "APR TBD"}</span>
                      <Badge
                        className="rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.25em]"
                        style={{
                          backgroundColor: "rgba(77, 174, 74, 0.2)",
                          color: minecraftColors.leaf,
                        }}
                      >
                        {phase.capAmount ? `${Math.round(phase.capAmount).toLocaleString()} ${tokenSymbol}` : "Cap TBD"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

    </div>
  );
}

export default ProjectInsightsPanel;

type InsightsTooltipProps = TooltipProps<number, string> & {
  tokenSymbol: string;
};

function InsightsTooltip({ active, payload, label, tokenSymbol }: InsightsTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const metricEntries = payload;
  const labelText =
    typeof label === "number"
      ? new Date(label).toLocaleString()
      : typeof label === "string"
      ? label
      : "Timeline";

  return (
    <div className="min-w-[14rem] rounded-2xl border border-emerald-200/70 bg-emerald-50/95 p-3 text-xs shadow-soft ring-1 ring-emerald-200/40 dark:border-emerald-900/60 dark:bg-slate-900">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-emerald-700 dark:text-emerald-200">
        {labelText}
      </p>

      {metricEntries.length > 0 ? (
        <div className="mt-2 grid gap-1.5">
          {metricEntries.map((item) => (
            <div
              key={item.dataKey}
              className="flex items-center justify-between text-[0.7rem] text-emerald-700 dark:text-emerald-200"
            >
              <span>{chartConfig[item.name as keyof typeof chartConfig]?.label || item.name}</span>
              <span className="font-mono text-emerald-900 dark:text-emerald-100">
                {formatAmount(Number(item.value) || 0, tokenSymbol)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
