"use client";

/**
 * 세트 입출력 표(TSK-08-06 design §6.2·§6.9) — 입력 변수 표와 결과 변수 표. 목록 순서에서 `setIo` 로 계산하고 저장하지 않는다(I10).
 * 결과 변수는 최종 먼저, 그다음 중간이다.
 */
import type { CSSProperties, ReactNode } from "react";

import { badgeStyle } from "@/shell";

import { NO_LINK_TITLE, condTarget, openVar, resultTarget, type VarTarget } from "../links";
import { isFinalResult } from "../set-model";
import type { IoSource, SetIo } from "../types";

const SOURCE_LABEL: Record<IoSource, string> = { DICT: "컬럼 사전", PROG: "프로그램 변수", NONE: "어디에도 없음" };
const SOURCE_TONE = { DICT: "success", PROG: "info", NONE: "warning" } as const;

const TABLE_STYLE: CSSProperties = { width: "100%", borderCollapse: "collapse", marginBottom: "var(--spacing-sm)" };
const HEAD_STYLE: CSSProperties = { textAlign: "left", color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border-light)" };
const LINK_STYLE: CSSProperties = {
  border: "none",
  background: "none",
  padding: 0,
  cursor: "pointer",
  color: "var(--color-primary)",
  textDecoration: "underline",
  font: "inherit",
};

/** 타입 표시 — NUMBER 는 `Number(scale)`, 일자 String·코드 String, 그 밖은 dataType, 없으면 "-". */
export function typeText(t: { dataType: string | null; scale: number | null; dateString: boolean; maruCodeId: string | null }): string {
  if (t.dataType === "NUMBER") return `Number(${t.scale ?? "-"})`;
  if (t.dateString) return "일자 String";
  if (t.maruCodeId) return "코드 String";
  return t.dataType ?? "-";
}

function VarName({ name, target }: { name: string; target: VarTarget }) {
  if (!target) {
    return (
      <code title={NO_LINK_TITLE}>
        {name}
      </code>
    );
  }
  return (
    <button type="button" data-testid={`set-var-link-${name}`} style={LINK_STYLE} onClick={() => openVar(target)}>
      <code>{name}</code>
    </button>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <p style={{ margin: "var(--spacing-xs) 0", fontWeight: 600 }}>{children}</p>;
}

export function SetIoTables({ io }: { io: SetIo }) {
  const finals = io.results.filter(isFinalResult);
  const middles = io.results.filter((r) => !isFinalResult(r));
  return (
    <div data-testid="set-io">
      <p style={{ margin: "var(--spacing-sm) 0 var(--spacing-xs)", fontWeight: 600 }}>세트 입출력 — 룰 순서에서 계산한다. 저장하지 않는다</p>

      <div data-testid="set-io-inputs">
        <Caption>{`입력 변수 ${io.inputs.length}개 · 세트를 부를 때 레코드에 넣어야 하는 값`}</Caption>
        <table style={TABLE_STYLE}>
          <thead>
            <tr style={HEAD_STYLE}>
              <th>변수</th>
              <th>표시명</th>
              <th>타입</th>
              <th>출처</th>
              <th>읽는 룰</th>
            </tr>
          </thead>
          <tbody>
            {io.inputs.map((r) => {
              const source = r.source ?? "NONE";
              return (
                <tr key={r.name} data-testid={`set-io-input-${r.name}`}>
                  <td>
                    <VarName name={r.name} target={condTarget(r.source, null)} />
                  </td>
                  <td>{r.label ?? "-"}</td>
                  <td>{typeText(r)}</td>
                  <td>
                    <span style={badgeStyle(SOURCE_TONE[source])}>{SOURCE_LABEL[source]}</span>
                  </td>
                  <td>{r.users.join(", ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div data-testid="set-io-results">
        <Caption>{`결과 변수 ${io.results.length}개 · 최종 ${finals.length}개, 중간 ${middles.length}개`}</Caption>
        <table style={TABLE_STYLE}>
          <thead>
            <tr style={HEAD_STYLE}>
              <th>변수</th>
              <th>타입</th>
              <th>구분</th>
              <th>만드는 룰</th>
              <th>읽는 룰</th>
            </tr>
          </thead>
          <tbody>
            {[...finals, ...middles].map((r) => (
              <tr key={r.name} data-testid={`set-io-result-${r.name}`}>
                <td>
                  <VarName name={r.name} target={resultTarget(r.by)} />
                </td>
                <td>{typeText(r)}</td>
                <td>
                  <span style={badgeStyle(isFinalResult(r) ? "success" : "neutral")}>{isFinalResult(r) ? "최종" : "중간"}</span>
                </td>
                <td>
                  {r.by.join(", ")}
                  {r.by.length > 1 && <span style={{ ...badgeStyle("warning"), marginLeft: 4 }}>덮어씀</span>}
                </td>
                <td>{r.readers.length ? r.readers.join(", ") : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
        세트를 부르면 최종과 중간 결과 변수를 모두 돌려준다. 최종은 세트 안의 어떤 룰도 다시 읽지 않는 결과 변수이고, 중간은 뒤 룰이 조건으로 읽는 결과
        변수다. 앞 룰이 만들기 전에 읽는 이름은 입력 변수로 잡히고 출처로 문제가 드러난다.
      </p>
    </div>
  );
}
