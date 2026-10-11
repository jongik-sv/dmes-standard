"use client";

/**
 * 위 막대(스펙 2.2·4.4, UX 1차 U15) — 한 줄: [모델 단추들] [+ 모델] · 요약 줄 · [버전 ▾] · [읽기 전용] 칩 · 접속자 · (빈 칸)
 * · [논리|물리] · 보기 프리셋 · [범례] · [DB 에서 가져오기](표 없는 모델만). 끊김 띠는 있을 때만 그 아래 줄.
 * 길이가 바뀌는 요약 글은 고정 칸(넘치면 …, title 에 전문)에 둔다(Local-Rules §38). 메시지는 toast + 숨은 live region(ErdViewer).
 * 팝오버(읽기 전용·범례) 열림은 이 부품 안 상태다. 읽기 전용 이유는 모델·이유별로 처음 한 번만 저절로 연다(roAutoKey, U19).
 */
import { memo, useEffect, useState, type ReactNode } from "react";

import { DetailPopover } from "@dk-oasis/shared/detail-popover";
import { Button } from "@dk-oasis/shared/form";

import type { ErdMode, ErdPreset } from "../canvas/erd-flow";
import type { ErdStreamStatus } from "../state/useErdStream";
import { LOST_TEXT } from "../state/permissions";
import type { ErdClaim, ErdModelRow, ErdPresence, ErdState } from "../types";
import { Legend } from "./DiagramTree";

export const PRESETS: readonly { value: ErdPreset; label: string }[] = [
  { value: "basic", label: "기본" },
  { value: "overview", label: "E-R 개요" },
  { value: "both", label: "논리+물리 동시" },
];

export const nextMode = (m: ErdMode): ErdMode => (m === "logical" ? "physical" : "logical");

/** 읽기 전용 이유 — state/permissions.ts 로 옮겼다(S2-20). 단계 1 경로를 남긴다. */
export { readOnlyReason } from "../state/permissions";

/** 접속자 동그라미 글자 — 내 세션은 "나", 사람은 사용자 ID, LLM 은 세션 이름. */
export function avatarLabel(p: ErdPresence, mySession: string): string {
  if (p.session === mySession) return "나";
  return p.source === "UI" ? p.userId : p.session;
}

export interface Avatar { session: string; label: string; source: "ui" | "llm"; title: string }

const hhmm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * 접속자 동그라미(D17, S2-11) — 나 → 사람 → Claude·CLI 세션 순. 만료 시각이 지난 시한 항목은 뺀다(서버가 15초마다 지우기 전 사이).
 * 제목에 사용자·세션·출처·만료 시각과 살아 있는 작업 중 표 수를 적는다(작업 중 표시 만료는 방송하지 않는다, S2-26).
 */
export function presenceAvatars(list: readonly ErdPresence[], claims: readonly ErdClaim[], mySession: string, now: number): Avatar[] {
  const rank = (p: ErdPresence) => (p.session === mySession ? 0 : p.source === "UI" ? 1 : 2);
  return list
    .filter((p) => !p.expiresAt || Date.parse(p.expiresAt) > now)
    .sort((a, b) => rank(a) - rank(b) || a.session.localeCompare(b.session))
    .map((p) => {
      const held = claims.filter((c) => c.session === p.session && Date.parse(c.expiresAt) > now).length;
      const parts = [p.userId, p.session, p.source];
      if (p.expiresAt) parts.push(`${hhmm(p.expiresAt)}까지`);
      if (held > 0) parts.push(`작업 중 표 ${held}개`);
      return { session: p.session, label: avatarLabel(p, mySession), source: p.source === "UI" ? "ui" : "llm", title: parts.join(" · ") };
    });
}

/** 읽기 전용 안내 — 칩 title(짧은 이유)과 팝오버 글(긴 이유와 할 일). */
export interface ReadOnlyInfo { short: string; text: string }

export interface TopBarProps {
  models: ErdModelRow[];
  modelId: string | null;
  onModelChange(modelId: string): void;
  state: ErdState | null;
  mySession: string;
  /** 모델 요약 줄 글(U26). 모델을 읽기 전이면 null. */
  summary: string | null;
  /** [버전 ▾](VersionBar). 편집 문맥이 있을 때만. */
  versionSlot: ReactNode;
  /** 읽기 전용이면 칩을 보인다(U19). */
  readOnly: ReadOnlyInfo | null;
  /** 이 키면 칩 팝오버를 저절로 한 번 연다(모델·이유별 처음 한 번). 열면 onReadOnlySeen 으로 알린다. */
  readOnlyAutoKey: string | null;
  onReadOnlySeen(key: string): void;
  mode: ErdMode;
  onModeChange(mode: ErdMode): void;
  preset: ErdPreset;
  onPresetChange(preset: ErdPreset): void;
  streamStatus: ErdStreamStatus;
  canReg: boolean;
  canImport: boolean;
  /** 읽기 전용·연결 끊김·처리 중 — 쓰기 단추를 막는다. */
  locked: boolean;
  /** [+ 모델] — 등록 창을 연다. */
  onOpenRegister(): void;
  onImport(): void;
}

const BOTH_MODE_TITLE = "논리+물리 동시 보기에서는 쓰지 않습니다";

export const TopBar = memo(function TopBar(p: TopBarProps) {
  const [roOpen, setRoOpen] = useState(false);
  const s = p.state;
  const empty = !!s && Object.keys(s.model.tables).length === 0;
  const { readOnlyAutoKey: autoKey, onReadOnlySeen } = p;
  useEffect(() => {
    if (!autoKey) return;
    setRoOpen(true);
    onReadOnlySeen(autoKey);
  }, [autoKey, onReadOnlySeen]);
  const both = p.preset === "both";
  return (
    <div className="erd-bar" data-testid="erd-bar">
      <div className="erd-bar__row erd-bar__row--top">
        <span className="erd-bar__group erd-bar__models">
          {p.models.map((m) => (
            <Button
              key={m.modelId}
              size="sm"
              variant={m.modelId === p.modelId ? "primary" : "default"}
              data-testid={`erd-model-${m.modelId}`}
              title={`${m.moduleId} · ${m.schemaName}`}
              onClick={() => p.onModelChange(m.modelId)}
            >
              {m.modelName}
            </Button>
          ))}
          {p.canReg && (
            <Button size="sm" data-testid="erd-reg-open" title="새 모델 등록" onClick={p.onOpenRegister}>
              + 모델
            </Button>
          )}
        </span>
        {p.summary !== null && (
          <span className="erd-bar__summary" data-testid="erd-summary" title={p.summary}>
            {p.summary}
          </span>
        )}
        {p.versionSlot}
        {p.readOnly && (
          <DetailPopover opened={roOpen} onOpenChange={setRoOpen} title="읽기 전용" width={420} testId="erd-readonly"
            className="erd-chip erd-chip--warn" triggerLabel={`읽기 전용 — ${p.readOnly.short}`}
            content={<div className="erd-readonly-pop" data-testid="erd-readonly-pop">{p.readOnly.text}</div>}>
            <span className="erd-chip__text" data-testid="erd-readonly-chip" title={p.readOnly.short}>읽기 전용</span>
          </DetailPopover>
        )}
        {s && (
          <span className="erd-bar__people" data-testid="erd-presence" title="접속자">
            {presenceAvatars(s.presence, s.claims, p.mySession, Date.now()).map((a) => (
              <span key={a.session} className="erd-avatar" data-source={a.source} title={a.title} data-testid={`erd-avatar-${a.session}`}>
                {a.label}
              </span>
            ))}
          </span>
        )}
        <span className="erd-bar__spacer" />
        <span className="erd-bar__group" role="group" aria-label="논리·물리 전환 (F3)" title={both ? BOTH_MODE_TITLE : undefined}>
          <Button size="sm" variant={p.mode === "logical" ? "primary" : "default"} aria-pressed={p.mode === "logical"} disabled={both}
            data-testid="erd-mode-logical" title={both ? BOTH_MODE_TITLE : "논리 모드 (F3)"} onClick={() => p.onModeChange("logical")}>
            논리
          </Button>
          <Button size="sm" variant={p.mode === "physical" ? "primary" : "default"} aria-pressed={p.mode === "physical"} disabled={both}
            data-testid="erd-mode-physical" title={both ? BOTH_MODE_TITLE : "물리 모드 (F3)"} onClick={() => p.onModeChange("physical")}>
            물리
          </Button>
        </span>
        <span className="erd-bar__group" role="group" aria-label="보기 프리셋">
          {PRESETS.map((x) => (
            <Button key={x.value} size="sm" variant={p.preset === x.value ? "primary" : "default"} aria-pressed={p.preset === x.value}
              data-testid={`erd-preset-${x.value}`} onClick={() => p.onPresetChange(x.value)}>
              {x.label}
            </Button>
          ))}
        </span>
        <DetailPopover title="범례" width={420} testId="erd-legend-pop" className="erd-chip" triggerLabel="범례 보기"
          content={<Legend />}>
          <span className="erd-chip__text" data-testid="erd-legend-open">범례</span>
        </DetailPopover>
        {empty && p.canImport && (
          <Button size="sm" variant="primary" data-testid="erd-import" disabled={p.locked} onClick={p.onImport}>
            DB 에서 가져오기
          </Button>
        )}
      </div>
      {p.streamStatus === "lost" && (
        <div className="erd-banner" data-kind="lost" role="alert" data-testid="erd-banner-lost">
          {LOST_TEXT}
        </div>
      )}
    </div>
  );
});
