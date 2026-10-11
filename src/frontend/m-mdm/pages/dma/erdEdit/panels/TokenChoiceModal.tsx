"use client";

/**
 * 물리명 토막 고르기 창(스펙 4.1 NEEDS_CHOICE) — 논리명의 토막마다 약어를 하나씩 골라 물리명을 만든다.
 * 후보는 두 모양으로 온다. 서버 거절(ErdColumnFill)의 choices 는 후보가 평평하다({termId, termName, engAbbr, via}).
 * 미리보기(compare)의 tokens 는 후보가 {term:{…}, via} 다. toTokenChoices 가 둘을 같은 모양으로 푼다.
 * 후보가 없는 토막(NO_ABBR·UNKNOWN)은 약어를 직접 넣는다. 물리명은 약어를 대문자로 `_` 로 잇고(ColumnNameComposer.forward 와 같다),
 * Oracle 이름 규칙(ErdIds)을 지킬 때만 [적용] 을 켠다.
 */
import { useEffect, useState, type CSSProperties } from "react";

import { Badge, Button, Input, Select, type BadgeTone } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

/** 서버 ErdIds.ORACLE_ID 와 같은 규칙. */
export const ORACLE_ID_RE = /^[A-Z][A-Z0-9_$#]{0,127}$/;
const ABBR_RE = /^[A-Z0-9_$#]+$/;

export interface TokenChoice {
  seq: number;
  surface: string;
  status: string;
  /** 처음 고른 약어 — 미리보기의 selected, 아니면 MATCHED·SYNONYM 의 첫 후보, 아니면 빈 글. */
  current: string;
  candidates: { abbr: string; label: string }[];
}

export const TOKEN_STATUS_LABEL: Record<string, string> = {
  MATCHED: "일치", SYNONYM: "동의어", AMBIGUOUS: "후보 여럿", NO_ABBR: "약어 없음", UNKNOWN: "사전 없음",
};

/** 사전에 없는 토막인가 — 후보가 하나도 없어 약어를 직접 넣어야 하는 상태(NO_ABBR·UNKNOWN). tokenTone 의 danger 와 같은 판정이다. */
export function isUnknownToken(status: string): boolean {
  return status === "NO_ABBR" || status === "UNKNOWN";
}

export function tokenTone(status: string): BadgeTone {
  if (status === "MATCHED" || status === "SYNONYM") return "success";
  return status === "AMBIGUOUS" ? "warning" : "danger";
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function toTokenChoices(raw: unknown): TokenChoice[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => {
    const t = obj(item);
    const candidates: TokenChoice["candidates"] = [];
    for (const c of Array.isArray(t.candidates) ? t.candidates : []) {
      const co = obj(c);
      const term = co.term ? obj(co.term) : co;
      const abbr = typeof term.engAbbr === "string" ? term.engAbbr.trim().toUpperCase() : "";
      if (abbr === "" || candidates.some((x) => x.abbr === abbr)) continue;
      candidates.push({ abbr, label: `${abbr} · ${String(term.termName ?? "")}` });
    }
    const status = String(t.status ?? "UNKNOWN");
    const selected = obj(t.selected).engAbbr;
    const fixed = status === "MATCHED" || status === "SYNONYM";
    const current = typeof selected === "string" && selected !== "" ? selected.toUpperCase() : fixed && candidates[0] ? candidates[0].abbr : "";
    return { seq: typeof t.seq === "number" ? t.seq : i + 1, surface: String(t.surface ?? ""), status, current, candidates };
  });
}

export function composePhys(picks: readonly string[]): string | null {
  if (picks.length === 0) return null;
  const parts = picks.map((p) => p.trim().toUpperCase());
  if (parts.some((p) => !ABBR_RE.test(p))) return null;
  const phys = parts.join("_");
  return ORACLE_ID_RE.test(phys) ? phys : null;
}

const BODY: CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--spacing-sm)" };
const ROW: CSSProperties = { display: "grid", gridTemplateColumns: "160px minmax(0, 1fr)", alignItems: "center", gap: "var(--spacing-sm)" };
const MUTED: CSSProperties = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };

export interface TokenChoiceModalProps {
  opened: boolean;
  logical: string;
  tokens: TokenChoice[];
  onPick(phys: string): void;
  onClose(): void;
}

export function TokenChoiceModal({ opened, logical, tokens, onPick, onClose }: TokenChoiceModalProps) {
  const [picks, setPicks] = useState<string[]>(() => tokens.map((t) => t.current));
  useEffect(() => {
    setPicks(tokens.map((t) => t.current));
  }, [tokens]);
  const phys = composePhys(picks);
  const setAt = (i: number, v: string) => setPicks((cur) => cur.map((x, j) => (j === i ? v.toUpperCase() : x)));
  return (
    <Modal open={opened} title="물리명 토막 고르기" size="md" onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" data-testid="erd-token-apply" disabled={phys === null} onClick={() => phys && onPick(phys)}>
            적용
          </Button>
        </>
      }>
      {opened && (
        <div data-testid="erd-token-choice" style={BODY}>
          <div style={MUTED}>논리명 「{logical}」 의 토막마다 약어를 고르세요. 고른 약어를 _ 로 이어 물리명을 만듭니다.</div>
          {tokens.map((t, i) => (
            <div key={`${t.seq}-${i}`} style={ROW}>
              <span>
                {t.surface} <Badge label={TOKEN_STATUS_LABEL[t.status] ?? t.status} tone={tokenTone(t.status)} />
              </span>
              {t.candidates.length > 0 ? (
                <Select data-testid={`erd-token-${t.seq}`} aria-label={`${t.surface} 약어`} value={picks[i] ?? ""} placeholder="약어 고르기"
                  options={t.candidates.map((c) => ({ value: c.abbr, label: c.label }))} onChange={(v) => setAt(i, v)} />
              ) : (
                <Input data-testid={`erd-token-input-${t.seq}`} aria-label={`${t.surface} 약어`} value={picks[i] ?? ""}
                  placeholder="약어 입력(영문 대문자)" onChange={(v) => setAt(i, v)} />
              )}
            </div>
          ))}
          <div>
            물리명: <span className="erd-mono" data-testid="erd-token-phys">{phys ?? "약어를 모두 고르세요"}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}
