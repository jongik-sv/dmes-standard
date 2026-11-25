"use client";

/**
 * 주문정합성 화면 조각 — 조건 문장 한 줄(CondLine), 출처 배지, 룰 머리 줄. 룰 목록·시뮬레이션·검토 이슈가 같이 쓴다.
 */
import { useState, type CSSProperties, type ReactNode } from "react";

import { Badge, type BadgeTone } from "@dk-oasis/shared/form";
import { MutedText } from "@dk-oasis/shared/card";

import type { CondPhrase } from "./sentence";
import type { OcRule } from "./model";

const CHIP_BUTTON: CSSProperties = {
  all: "unset",
  cursor: "pointer",
  marginLeft: 4,
  padding: "0 6px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  fontSize: 11,
  color: "var(--color-primary)",
};

/** 조건 구절 한 줄 — 항목 라벨(굵게)·조사·값(사전 라벨 괄호)·꼬리 글·원 연산자 표지·추정 표지. */
export function CondLine({ p }: { p: CondPhrase }) {
  const [open, setOpen] = useState(false);
  const fold = p.foldAfter !== null && p.values.length > p.foldAfter;
  const shown = fold && !open ? p.values.slice(0, p.foldAfter!) : p.values;
  return (
    <span>
      <b title={p.field}>{p.label}</b>
      {p.subject} {p.head}
      {shown.map((v, i) => (
        <span key={`${v.value}-${i}`}>
          {i > 0 ? "·" : ""}
          {v.value}
          {v.label ? (
            <MutedText>
              ({v.label}
              {v.certainty && v.certainty !== "확정" ? "*" : ""})
            </MutedText>
          ) : null}
        </span>
      ))}
      {fold ? (
        <button
          type="button"
          style={CHIP_BUTTON}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          {open ? "접기" : `외 ${p.values.length - p.foldAfter!}개`}
        </button>
      ) : null}
      {p.tail}{" "}
      <Badge
        label={p.opBadge}
        tone="neutral"
        variant="outline"
        mono
        title="원 연산자"
      />
      {p.estimated ? (
        <>
          {" "}
          <Badge
            label="추정"
            tone="warning"
            variant="outline"
            title="에러 메시지에서 거꾸로 추론한 추정 라벨(*)이 들어 있습니다"
          />
        </>
      ) : null}
    </span>
  );
}

const SOURCE_TONE: Record<string, BadgeTone> = {
  공통: "neutral",
  order: "primary",
  cross: "warning",
};

export function SourceBadge({ source }: { source: string }) {
  if (!source) return null;
  return (
    <Badge
      label={source === "user" ? "직접등록" : source}
      tone={SOURCE_TONE[source] ?? "success"}
      title="공통 = order·cross 조건 동일 · order = C10B2220 · cross = C10B2221"
    />
  );
}

/** 룰 머리 줄 — 에러코드·메시지·[담당 부서→조치 주체]·출처·경고 후보·검토 이슈·룰 키. */
export function RuleHead({
  rule,
  issueIds,
  extra,
}: {
  rule: OcRule;
  issueIds?: readonly string[];
  extra?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
      }}
    >
      <Badge label={rule.errCode || "?"} tone="danger" mono />
      <b>{rule.message}</b>
      <MutedText>
        [{rule.ownerDept}→{rule.actor}]
      </MutedText>
      <SourceBadge source={rule.source} />
      {rule.warnCandidate ? (
        <Badge
          label="경고 후보"
          tone="warning"
          title="메시지에 협의·문의·확인이 있어 경고로 바꿀 후보"
        />
      ) : null}
      {(issueIds ?? []).map((id) => (
        <Badge
          key={id}
          label={id}
          tone="warning"
          variant="outline"
          title="연결된 검토 이슈"
        />
      ))}
      <span
        style={{
          fontFamily: "var(--font-mono, monospace)",
          color: "var(--color-text-muted)",
        }}
      >
        {rule.key}
      </span>
      {extra}
    </div>
  );
}
