"use client";

/**
 * 세트 입출력 표(TSK-08-06 design §6.2·§6.9) — 입력 변수 표와 결과 변수 표. 흐름을 펼친 룰 순서에서 `flowIo` 로 계산하고 저장하지 않는다(I10).
 * 결과 변수는 최종 먼저, 그다음 중간이다. 2단계부터 캔버스 오른쪽 패널(기본 폭 360)에 놓이므로 열 폭을 좁게 잡는다.
 */
import { useMemo, type CSSProperties, type ReactNode } from "react";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { badgeStyle } from "@/shell";

import { NO_LINK_TITLE, condTarget, openVar, resultTarget, type VarTarget } from "../links";
import { isFinalResult } from "../set-model";
import type { IoSource, SetIo } from "../types";

export const SOURCE_LABEL: Record<IoSource, string> = { DICT: "컬럼 사전", PROG: "프로그램 변수", NONE: "어디에도 없음" };
export const SOURCE_TONE = { DICT: "success", PROG: "info", NONE: "warning" } as const;

// 글자 링크도 컨트롤 높이 26px 를 지킨다(UI-Visual-Standard, 클릭 영역).
const LINK_STYLE: CSSProperties = {
  minHeight: "var(--form-height)",
  display: "inline-flex",
  alignItems: "center",
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

const INPUT_COLUMNS: GridColumn[] = [
  {
    key: "name",
    header: "변수",
    width: 120,
    tooltip: false,
    render: (_v, row) => <VarName name={String(row.name)} target={row.target as VarTarget} />,
  },
  { key: "label", header: "표시명", width: 100 },
  { key: "type", meta: false, header: "타입", width: 90 },
  {
    key: "source",
    meta: false,
    header: "출처",
    width: 100,
    tooltip: false,
    render: (_v, row) => <span style={badgeStyle(SOURCE_TONE[row.source as IoSource])}>{SOURCE_LABEL[row.source as IoSource]}</span>,
  },
  { key: "users", meta: false, header: "읽는 룰", width: 140 },
];

const RESULT_COLUMNS: GridColumn[] = [
  {
    key: "name",
    header: "변수",
    width: 120,
    tooltip: false,
    render: (_v, row) => <VarName name={String(row.name)} target={row.target as VarTarget} />,
  },
  { key: "type", meta: false, header: "타입", width: 90 },
  {
    key: "kind",
    header: "구분",
    width: 70,
    tooltip: false,
    render: (_v, row) => <span style={badgeStyle(row.final ? "success" : "neutral")}>{row.final ? "최종" : "중간"}</span>,
  },
  {
    key: "by",
    meta: false,
    header: "만드는 룰",
    width: 140,
    tooltip: false,
    render: (_v, row) => (
      <>
        {String(row.by)}
        {row.overwritten === true && <span style={{ ...badgeStyle("warning"), marginLeft: 4 }}>덮어씀</span>}
      </>
    ),
  },
  { key: "readers", meta: false, header: "읽는 룰", width: 140 },
];

export function SetIoTables({ io }: { io: SetIo }) {
  const finals = io.results.filter(isFinalResult);
  const middles = io.results.filter((r) => !isFinalResult(r));
  const inputRows = useMemo(
    () =>
      io.inputs.map((r) => ({
        name: r.name,
        target: condTarget(r.source, null),
        label: r.label ?? "-",
        type: typeText(r),
        source: r.source ?? "NONE",
        users: r.users.join(", "),
      })),
    [io.inputs],
  );
  const resultRows = useMemo(
    () =>
      [...finals, ...middles].map((r) => ({
        name: r.name,
        target: resultTarget(r.by),
        type: typeText(r),
        kind: isFinalResult(r) ? "최종" : "중간",
        final: isFinalResult(r),
        by: r.by.join(", "),
        overwritten: r.by.length > 1,
        readers: r.readers.length ? r.readers.join(", ") : "-",
      })),
    [io.results],
  );
  return (
    <div data-testid="set-io">
      <p style={{ margin: "var(--spacing-sm) 0 var(--spacing-xs)", fontWeight: 600 }}>세트 입출력 — 흐름에서 계산한다. 저장하지 않는다</p>

      <div data-testid="set-io-inputs">
        <Caption>{`입력 변수 ${io.inputs.length}개 · 세트를 부를 때 레코드에 넣어야 하는 값`}</Caption>
        <AgDataGrid
          columns={INPUT_COLUMNS}
          data={inputRows}
          rowKey="name"
          height="auto"
          columnSizing="fit"
          sortable={false}
          emptyMessage="입력 변수가 없습니다."
          ariaLabel="세트 입력 변수"
        />
      </div>

      <div data-testid="set-io-results">
        <Caption>{`결과 변수 ${io.results.length}개 · 최종 ${finals.length}개, 중간 ${middles.length}개`}</Caption>
        <AgDataGrid
          columns={RESULT_COLUMNS}
          data={resultRows}
          rowKey="name"
          height="auto"
          columnSizing="fit"
          sortable={false}
          emptyMessage="결과 변수가 없습니다."
          ariaLabel="세트 결과 변수"
        />
      </div>

      <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
        세트를 부르면 최종과 중간 결과 변수를 모두 돌려준다. 최종은 세트 안의 어떤 룰도 다시 읽지 않는 결과 변수이고, 중간은 뒤 룰이 조건으로 읽는 결과
        변수다. 앞 룰이 만들기 전에 읽는 이름은 입력 변수로 잡히고 출처로 문제가 드러난다.
      </p>
    </div>
  );
}
