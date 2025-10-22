import { useId } from "react";

import { cn } from "@/lib/utils";
import type { ProjectInsightsData } from "@/lib/project-insights";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Area, CartesianGrid, ComposedChart, ReferenceArea, Scatter, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";

type Props = {
  loading: boolean;
  data: ProjectInsightsData;
  tokenSymbol: string;
  className?: string;
};

const chartConfig = {
  deposits: {
    label: "Cumulative Deposits",
    color: "hsl(var(--primary))",
  },
  withdrawals: {
    label: "Cumulative Withdrawals",
    color: "hsl(var(--accent))",
  },
  net: {
    label: "Net Exposure",
    color: "hsl(var(--secondary))",
  },
  event: {
    label: "Events",
  },
} as const;

const phaseTone: Record<"past" | "current" | "upcoming", { fill: string; stroke: string }> = {
  past: {
    fill: "rgba(15, 118, 110, 0.12)",
    stroke: "rgba(13, 148, 136, 0.3)",
  },
  current: {
    fill: "rgba(37, 99, 235, 0.18)",
    stroke: "rgba(59, 130, 246, 0.32)",
  },
  upcoming: {
    fill: "rgba(148, 163, 184, 0.12)",
    stroke: "rgba(148, 163, 184, 0.24)",
  },
};

const eventTone: Record<
  "primary" | "success" | "warning" | "info",
  { border: string; background: string }
> = {
  primary: { border: "rgba(37, 99, 235, 0.8)", background: "rgba(37, 99, 235, 0.12)" },
  success: { border: "rgba(16, 185, 129, 0.8)", background: "rgba(16, 185, 129, 0.14)" },
  warning: { border: "rgba(234, 179, 8, 0.8)", background: "rgba(234, 179, 8, 0.14)" },
  info: { border: "rgba(14, 165, 233, 0.8)", background: "rgba(14, 165, 233, 0.14)" },
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
  const eventBaseline = maxSeries + yPad * 0.8;
  const scatterData = data.events.map((event) => ({
    ...event,
    timestamp: event.timestamp,
    value: eventBaseline,
  }));

  const domainSpan = Math.max(1, data.domain.end - data.domain.start);
  const primaryMetrics = [
    { id: "totalDeposited", label: "Total Deposited", value: data.totals.totalDeposited },
    { id: "totalWithdrawn", label: "Total Withdrawn", value: data.totals.totalWithdrawn },
    { id: "netExposure", label: "Net Exposure", value: data.totals.netExposure },
  ] as const;

  return (
    <div
      className={cn(
        "relative flex h-full min-h-[26rem] flex-col gap-5 rounded-3xl border border-white/30 bg-white/65 p-5 shadow-soft backdrop-blur dark:border-white/10 dark:bg-slate-950/40",
        className,
      )}
    >
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Project Flow Insights</h2>
          {loading ? (
            <Skeleton className="h-4 w-32" />
          ) : data.totals.lastUpdated ? (
            <span className="text-xs text-slate-500 dark:text-slate-300/75">
              Updated {new Date(data.totals.lastUpdated).toLocaleString()}
            </span>
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-300/75">Awaiting activity</span>
          )}
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Cumulative deposits, developer withdrawals, and phase unlocks rendered over time.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {primaryMetrics.map((metric) => (
            <div
              key={metric.id}
              className="rounded-2xl border border-white/40 bg-white/70 p-3 text-sm shadow-soft dark:border-white/10 dark:bg-slate-900/50"
            >
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-300">
                {metric.label}
              </p>
              {loading ? (
                <Skeleton className="mt-2 h-4 w-24" />
              ) : (
                <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white">
                  {formatAmount(metric.value ?? 0, tokenSymbol)}
                </p>
              )}
            </div>
          ))}
        </div>
      </header>

      <div className="relative flex-1">
        <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/20" />
        <div className="relative h-full rounded-3xl border border-white/40 bg-white/60 p-3 dark:border-white/10 dark:bg-slate-950/50">
          <ChartContainer
            config={chartConfig}
            className="h-full w-full [&_.recharts-cartesian-grid_line]:stroke-white/30 dark:[&_.recharts-cartesian-grid_line]:stroke-slate-800/60"
          >
            <ComposedChart data={points} margin={{ top: 24, right: 24, bottom: 16, left: 8 }}>
                <defs>
                  <linearGradient id={gradientDepositsId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id={gradientWithdrawalsId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id={gradientNetId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0.1} />
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
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill={`url(#${gradientDepositsId})`}
                  name="deposits"
                  isAnimationActive={false}
                />
                <Area
                  dataKey="cumulativeWithdrawals"
                  type="monotone"
                  stroke="hsl(var(--accent))"
                  strokeWidth={2}
                  fill={`url(#${gradientWithdrawalsId})`}
                  name="withdrawals"
                  isAnimationActive={false}
                />
                <Area
                  dataKey="netExposure"
                  type="monotone"
                  stroke="hsl(var(--secondary))"
                  strokeWidth={2}
                  fill={`url(#${gradientNetId})`}
                  name="net"
                  isAnimationActive={false}
                />

                {scatterData.length > 0 ? (
                  <Scatter
                    data={scatterData}
                    dataKey="value"
                    name="event"
                    shape={(props) => <EventMarker {...props} />}
                    isAnimationActive={false}
                  />
                ) : null}

                <ChartTooltip
                  cursor={{ strokeDasharray: "4 4", stroke: "rgba(15, 23, 42, 0.2)" }}
                  content={<InsightsTooltip tokenSymbol={tokenSymbol} />}
                />
              </ComposedChart>
          </ChartContainer>

          {data.phases.length > 0 ? (
            <>
              <div className="pointer-events-none absolute inset-x-6 top-6 hidden lg:flex gap-2">
                {data.phases.map((phase) => {
                  const left = ((phase.start - data.domain.start) / domainSpan) * 100;
                  const width = ((phase.end - phase.start) / domainSpan) * 100;
                  const constrainedLeft = Math.max(0, Math.min(100, left));
                  const constrainedWidth = Math.max(12, Math.min(100 - constrainedLeft, width));
                  return (
                    <div
                      key={`phase-pill-${phase.phaseId}`}
                      className="pointer-events-none absolute flex translate-y-[-1.5rem] flex-col gap-1 rounded-2xl bg-white/70 px-3 py-2 text-[0.65rem] uppercase tracking-[0.32em] text-slate-600 shadow-soft dark:bg-slate-900/70 dark:text-slate-200"
                      style={{
                        left: `${constrainedLeft}%`,
                        width: `${constrainedWidth}%`,
                      }}
                    >
                      <span className="truncate font-semibold tracking-[0.25em] text-slate-500 dark:text-slate-300">
                        {phase.label}
                      </span>
                      <span className="flex items-center justify-between gap-2 text-[0.6rem] normal-case tracking-normal">
                        <span>{phase.aprPercent ? `${phase.aprPercent.toFixed(2)}% APY` : "APR TBD"}</span>
                        <span>{phase.capAmount ? `${Math.round(phase.capAmount).toLocaleString()} ${tokenSymbol}` : "Cap TBD"}</span>
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="-mx-2 mt-4 flex gap-2 overflow-x-auto pb-2 lg:hidden">
                {data.phases.map((phase) => (
                  <div
                    key={`phase-chip-${phase.phaseId}`}
                    className="min-w-[14rem] flex-shrink-0 rounded-2xl border border-white/40 bg-white/75 p-3 text-sm shadow-soft dark:border-white/10 dark:bg-slate-900/60"
                  >
                    <p className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-200">
                      Phase {phase.phaseId + 1}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{phase.label}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                      <span>{phase.aprPercent ? `${phase.aprPercent.toFixed(2)}% APY` : "APR TBD"}</span>
                      <Badge className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-primary">
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

      {data.events.length > 0 ? (
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
          {data.events.map((event) => {
            const tone = eventTone[event.tone];
            return (
              <div
                key={event.id}
                className="min-w-[12rem] flex-shrink-0 rounded-2xl border px-3 py-2 text-xs shadow-soft"
                style={{
                  borderColor: tone.border,
                  background: tone.background,
                }}
              >
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-slate-600 dark:text-slate-200">
                  {new Date(event.timestamp).toLocaleDateString()}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{event.title}</p>
                {event.subtitle ? (
                  <p className="mt-1 text-[0.7rem] text-slate-600 dark:text-slate-300">{event.subtitle}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

type EventMarkerProps = {
  cx?: number;
  cy?: number;
  payload?: (typeof chartConfig)["event"] & { tone?: keyof typeof eventTone };
};

function EventMarker({ cx = 0, cy = 0, payload }: EventMarkerProps) {
  const tone = payload?.tone ? eventTone[payload.tone] : eventTone.info;
  return (
    <g transform={`translate(${cx}, ${cy})`} className="pointer-events-none">
      <circle r={6} fill={tone.border} opacity={0.8} />
      <circle r={3} fill="white" />
    </g>
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

  const eventEntry = payload.find((item) => item.name === "event");
  const metricEntries = payload.filter((item) => item.name !== "event");
  const labelText =
    typeof label === "number"
      ? new Date(label).toLocaleString()
      : typeof label === "string"
      ? label
      : "Timeline";

  return (
    <div className="min-w-[14rem] rounded-2xl border border-white/60 bg-white/95 p-3 text-xs shadow-soft ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-slate-500 dark:text-slate-300">
        {labelText}
      </p>

      {eventEntry?.payload ? (
        <div className="mt-2 rounded-xl border border-dashed border-slate-300/60 bg-white/85 p-2 text-[0.7rem] dark:border-slate-700 dark:bg-slate-800/60">
          <p className="font-semibold text-slate-900 dark:text-white">
            {eventEntry.payload.title || "Timeline Event"}
          </p>
          {eventEntry.payload.subtitle ? (
            <p className="mt-0.5 text-[0.65rem] text-slate-600 dark:text-slate-300">
              {eventEntry.payload.subtitle}
            </p>
          ) : null}
        </div>
      ) : null}

      {metricEntries.length > 0 ? (
        <div className="mt-2 grid gap-1.5">
          {metricEntries.map((item) => (
            <div
              key={item.dataKey}
              className="flex items-center justify-between text-[0.7rem] text-slate-600 dark:text-slate-300"
            >
              <span>{chartConfig[item.name as keyof typeof chartConfig]?.label || item.name}</span>
              <span className="font-mono text-slate-900 dark:text-white">
                {formatAmount(Number(item.value) || 0, tokenSymbol)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
