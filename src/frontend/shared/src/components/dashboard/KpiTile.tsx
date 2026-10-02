"use client";

/**
 * KPI 타일 — 지표 이름, 값·단위, 추이 선, 기준(계획·목표) 문구, 전일 대비 증감, 기준 대비 막대, 주의 표시를 한 칸에 보인다.
 * 값·증감 문구의 숫자 형식은 화면이 정해 넘긴다(천 단위 구분·소수 자리·%p 등).
 * 주의(warn)는 배지와 막대·추이 선 색(경고색)으로만 보인다 — 한 변 컬러 바를 쓰지 않는다(Local-Rules §8).
 */
import type { ReactNode } from "react";

import { Badge } from "../form/Badge";
import { Sparkline } from "./Sparkline";
import { DashboardStyle } from "./styles";

export type KpiDeltaTone = "good" | "bad" | "neutral";

export interface KpiTileProps {
  /** 지표 이름. */
  label: ReactNode;
  /** 표시할 값(화면이 형식을 정한 문자열 또는 숫자). */
  value: ReactNode;
  /** 값 뒤 단위(t, % 등). */
  unit?: ReactNode;
  /** 추이 선 값(시간 순). 2개 미만이면 그리지 않는다. */
  trend?: number[];
  /** 기준 문구(예: "계획 6,000t", "목표 ≤ 0.45%"). */
  target?: ReactNode;
  /** 증감 문구(예: "전일 +1.4%"). */
  delta?: ReactNode;
  /** 증감의 좋고 나쁨 — good 초록 · bad 빨강 · neutral 흐린 글자(기본). */
  deltaTone?: KpiDeltaTone;
  /** 기준 대비 달성률(0~100, 넘으면 100 으로 자른다). 없으면 막대를 그리지 않는다. */
  progress?: number;
  /** 주의 표시(배지 + 경고색 막대·추이 선). */
  warn?: boolean;
  /** 주의 배지 문구(기본 "주의"). */
  warnLabel?: string;
  /** 뿌리에 더할 클래스. */
  className?: string;
  /** 뿌리 data-testid. */
  testId?: string;
}

export function clampPercent(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

export function KpiTile({
  label,
  value,
  unit,
  trend,
  target,
  delta,
  deltaTone = "neutral",
  progress,
  warn = false,
  warnLabel = "주의",
  className,
  testId,
}: KpiTileProps) {
  const classes = ["cm-kpi"];
  if (warn) classes.push("cm-kpi--warn");
  if (className) classes.push(className);
  const pct = progress == null ? null : clampPercent(progress);
  return (
    <div className={classes.join(" ")} data-testid={testId} data-warn={warn ? "true" : undefined}>
      <DashboardStyle />
      <div className="cm-kpi__label">
        <span>{label}</span>
        {warn && <Badge tone="warning" label={warnLabel} />}
      </div>
      <div className="cm-kpi__main">
        <span className="cm-kpi__value">
          {value}
          {unit != null && <small className="cm-kpi__unit">{unit}</small>}
        </span>
        {trend && trend.length >= 2 && (
          <span className="cm-kpi__spark">
            <Sparkline
              values={trend}
              color={warn ? "var(--color-warning)" : "var(--color-primary)"}
            />
          </span>
        )}
      </div>
      {(target != null || delta != null) && (
        <div className="cm-kpi__foot">
          <span>{target}</span>
          {delta != null && (
            <span
              className={
                deltaTone === "neutral"
                  ? "cm-kpi__delta"
                  : `cm-kpi__delta cm-kpi__delta--${deltaTone}`
              }
              data-tone={deltaTone}
            >
              {delta}
            </span>
          )}
        </div>
      )}
      {pct != null && (
        <div
          className="cm-kpi__bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <i style={{ width: `${pct.toFixed(1)}%` }} />
        </div>
      )}
    </div>
  );
}

export interface KpiTileGroupProps {
  /** KpiTile 들. */
  children: ReactNode;
  /** 타일 최소 폭(px, 기본 150 — 12칸 위젯에서 6개가 한 줄). 폭이 모자라면 다음 줄로 넘어간다. */
  minTileWidth?: number;
  /** 뿌리 aria-label. */
  ariaLabel?: string;
  /** 뿌리 data-testid. */
  testId?: string;
}

/** KPI 타일 묶음 — 카드(위젯) 하나 안에 타일 여러 개를 폭에 맞춰 줄바꿈해 놓는다. */
export function KpiTileGroup({
  children,
  minTileWidth = 150,
  ariaLabel,
  testId,
}: KpiTileGroupProps) {
  return (
    <div
      className="cm-kpi-group"
      style={{ ["--cm-kpi-min" as string]: `${Math.max(80, Math.round(minTileWidth))}px` }}
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <DashboardStyle />
      {children}
    </div>
  );
}
