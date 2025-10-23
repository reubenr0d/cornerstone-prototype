import { useId } from "react";

import { cn } from "@/lib/utils";
import type { ProjectInsightsData } from "@/lib/project-insights";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Area, CartesianGrid, ComposedChart, ReferenceArea, ReferenceLine, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";

type Props = {
  loading: boolean;
  data: ProjectInsightsData;
  tokenSymbol: string;
  className?: string;
};

const minecraftColors = {
  grass: "#4CAF50",
  leaf: "#66BB6A", 
  dirt: "#8D6E63",
  water: "#2196F3",
  gold: "#FF9800",
  stone: "#607D8B",
  success: "#2E7D32",
  warning: "#F57C00",
  error: "#D32F2F",
} as const;

const chartConfig = {
  deposits: {
    label: "Deposits",
    color: minecraftColors.success,
  },
  withdrawals: {
    label: "Withdrawals",
    color: minecraftColors.error,
  },
  reserveFunded: {
    label: "Interest Reserve",
    color: minecraftColors.water,
  },
} as const;

const phaseTone: Record<"past" | "current" | "upcoming", { fill: string; stroke: string }> = {
  past: {
    fill: "rgba(46, 125, 50, 0.15)",
    stroke: "rgba(46, 125, 50, 0.4)",
  },
  current: {
    fill: "rgba(33, 150, 243, 0.2)",
    stroke: "rgba(33, 150, 243, 0.5)",
  },
  upcoming: {
    fill: "rgba(141, 110, 99, 0.15)",
    stroke: "rgba(141, 110, 99, 0.4)",
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
  const gradientReserveFundedId = useId().replace(/:/g, "") + "-reserve-funded";

  const points = data.points.length
    ? data.points
    : [{ timestamp: data.domain.start, cumulativeDeposits: 0, cumulativeWithdrawals: 0, netExposure: 0 }];

  const maxSeries = Math.max(
    ...points.map(point => Math.max(point.cumulativeDeposits, point.cumulativeWithdrawals, point.cumulativeReserveFunded || 0)),
    0
  );
  
  // Calculate scaling for break in Y-axis
  const phase0 = data.phases.find(phase => phase.phaseId === 0);
  const phase0Cap = phase0?.capAmount || 0;
  
  // If phase 0 cap is much higher than data, create a break
  const needsBreak = phase0Cap > 0 && phase0Cap > maxSeries * 1.5;
  const breakPoint = needsBreak ? maxSeries + (maxSeries * 0.2) : maxSeries;
  const yPad = maxSeries > 0 ? maxSeries * 0.3 : 10;

  const domainSpan = Math.max(1, data.domain.end - data.domain.start);
  return (
    <div
      className={cn(
        "relative flex h-full min-h-[26rem] flex-col",
        className,
      )}
    >
      <div className="relative flex-1">
          <ChartContainer
            config={chartConfig}
            className="h-full w-full [&_.recharts-cartesian-grid_line]:stroke-gray-300/40"
          >
            <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <defs>
                  <linearGradient id={gradientDepositsId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor={minecraftColors.success} stopOpacity={0.6} />
                    <stop offset="95%" stopColor={minecraftColors.success} stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id={gradientWithdrawalsId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor={minecraftColors.error} stopOpacity={0.6} />
                    <stop offset="95%" stopColor={minecraftColors.error} stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id={gradientReserveFundedId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor={minecraftColors.water} stopOpacity={0.6} />
                    <stop offset="95%" stopColor={minecraftColors.water} stopOpacity={0.1} />
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


                {/* Horizontal lines for phase caps - spanning full graph width */}
                {data.phases.map((phase) => {
                  if (phase.capAmount <= 0) return null;
                  const isCurrentOrPast = phase.status === "current" || phase.status === "past";
                  return (
                    <ReferenceLine
                      key={`cap-line-${phase.phaseId}`}
                      y={phase.capAmount}
                      x1={data.domain.start}
                      x2={data.domain.end}
                      stroke={isCurrentOrPast ? minecraftColors.warning : minecraftColors.stone}
                      strokeWidth={isCurrentOrPast ? 3 : 2}
                      strokeDasharray={isCurrentOrPast ? "8 4" : "4 4"}
                      strokeOpacity={isCurrentOrPast ? 1 : 0.7}
                        label={{
                          value: `Phase ${phase.phaseId + 1} withdraw limit: ${Math.round(phase.capAmount).toLocaleString()} ${tokenSymbol}`,
                          position: "insideTopRight",
                        style: {
                          fontSize: "11px",
                          fill: "#2D1B00",
                          fontWeight: "bold",
                          textShadow: "1px 1px 2px rgba(255,255,255,0.8)",
                          fontFamily: "monospace",
                          letterSpacing: "0.3px",
                          backgroundColor: "rgba(255, 215, 0, 0.9)",
                          border: "2px solid #654321",
                          borderRadius: "4px",
                          padding: "4px 8px",
                          boxShadow: "2px 2px 0px rgba(0,0,0,0.3)",
                        },
                      }}
                    />
                  );
                })}

                {/* Fixed line at phase 0 withdrawal limit */}
                {(() => {
                  const phase0 = data.phases.find(phase => phase.phaseId === 0);
                  const phase0Cap = phase0?.capAmount || 0;
                  
                  if (phase0Cap > 0) {
                    return (
                      <ReferenceLine
                        y={phase0Cap}
                        x1={data.domain.start}
                        x2={data.domain.end}
                        stroke={minecraftColors.warning}
                        strokeWidth={2}
                        strokeOpacity={0.8}
                      />
                    );
                  }
                  return null;
                })()}

                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={points.length > 0 ? [points[0].timestamp, points[points.length - 1].timestamp] : [data.domain.start, data.domain.end]}
                  tickFormatter={formatAxisLabel}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={0}
                  domain={needsBreak ? [Math.min(0, -yPad), phase0Cap + (phase0Cap * 0.1)] : [Math.min(0, -yPad), maxSeries + yPad]}
                  hide
                />
                
                {/* Break indicators when there's a large gap */}
                {needsBreak && (
                  <>
                    <ReferenceLine
                      y={breakPoint}
                      stroke="#999"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      strokeOpacity={0.7}
                    />
                    <ReferenceLine
                      y={breakPoint + (phase0Cap - breakPoint) * 0.1}
                      stroke="#999"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      strokeOpacity={0.7}
                    />
                  </>
                )}

                <Area
                  dataKey="cumulativeDeposits"
                  type="monotone"
                  stroke={minecraftColors.success}
                  strokeWidth={3}
                  fill={`url(#${gradientDepositsId})`}
                  name="deposits"
                  isAnimationActive={false}
                />
                <Area
                  dataKey="cumulativeWithdrawals"
                  type="monotone"
                  stroke={minecraftColors.error}
                  strokeWidth={3}
                  fill={`url(#${gradientWithdrawalsId})`}
                  name="withdrawals"
                  isAnimationActive={false}
                />
                <Area
                  dataKey="cumulativeReserveFunded"
                  type="monotone"
                  stroke={minecraftColors.water}
                  strokeWidth={3}
                  fill={`url(#${gradientReserveFundedId})`}
                  name="reserveFunded"
                  isAnimationActive={false}
                />

                <ChartTooltip
                  cursor={{ strokeDasharray: "4 4", stroke: "rgba(15, 23, 42, 0.2)" }}
                  content={<InsightsTooltip tokenSymbol={tokenSymbol} />}
                />
              </ComposedChart>
          </ChartContainer>
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
    <div className="min-w-[14rem] border-4 border-[#654321] bg-gradient-to-b from-[#FFD700]/20 to-[#FFD700]/10 p-3 text-xs shadow-[3px_3px_0_rgba(0,0,0,0.3)] backdrop-blur-sm">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.32em] text-black">
        {labelText}
      </p>

      {metricEntries.length > 0 ? (
        <div className="mt-2 grid gap-1.5">
          {metricEntries.map((item) => (
            <div
              key={item.dataKey}
              className="flex items-center justify-between text-[0.7rem] text-black"
            >
              <span className="font-semibold">{chartConfig[item.name as keyof typeof chartConfig]?.label || item.name}</span>
              <span className="font-mono font-bold text-black">
                {formatAmount(Number(item.value) || 0, tokenSymbol)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
