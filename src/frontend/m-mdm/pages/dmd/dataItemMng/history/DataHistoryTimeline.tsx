"use client";

/**
 * 선분 타임라인 — 항목 편집 화면의 항목 이력·카테고리 이력 패널이 같이 쓰는 표시 전용 컴포넌트(D8, D-104).
 *
 * 서버가 준 행을 valid_from 순서 그대로 그리고, `gapFrom` 이 있는 행 앞에 "닫혀 있던 구간" 줄을 서버 값 그대로 끼운다.
 * 사건·상태를 다시 계산하지 않는다(H2 — 계산은 서버 한 곳).
 *
 * 두 패널 모두 화면 오른쪽 열(약 34%, 1280 폭에서 이력 칸 실측 약 325px)에 놓이므로, 판단에 필요한 열이 가로 스크롤 없이 보이게
 * 칸 안에 여러 줄로 쌓는다(D-104 회귀 — 넓은 열을 늘어놓으면 열 가상화로 뒤 열이 DOM 에도 없다).
 *  - 열 폭: fit 그리드는 칸이 좁으면 각 열이 minWidth 까지 줄고, 그 합이 칸보다 넓으면 가로로 넘친다. 카테고리·소속 이력은 최소 폭 합을
 *    325px 에서 세로 스크롤바(Windows 고정 약 17px) 몫을 뺀 308px 이하로 둔다 — 사건·시작·끝(70+88+88)은 배지·날짜가 잘리지 않는
 *    폭이라 그대로 두고, 말줄임·제목(title)이 있는 넷째 칸이 56px 까지 줄어든다(e2e dataItemMng S10, 2026-10-03). 그 칸의 머리글은
 *    말줄임될 수 있어 머리 툴팁(headerTooltip)에 전체를 둔다.
 *  - 사건 칸: 사건 배지 위, 행 상태 배지 아래.
 *  - 시작·끝 칸: 날짜 위, 시각 아래(두 칸은 따로 둔다 — 앞 행의 끝과 다음 행의 시작이 같은 글자로 이어진다).
 *  - 대상별 칸: 항목은 이름(아래 약칭), 카테고리는 이름·종류·대상·정규식을 세 줄로, 소속은 항목 키.
 * 항목의 순서·계층·추가 컬럼·행 버전처럼 덜 중요한 칸은 뒤에 두어 필요할 때 가로로 민다. 줄이 넘치면 말줄임하고 칸의
 * 마우스오버 제목(title)에 전체 값을 둔다.
 */
import { Fragment, useMemo, type ReactNode } from "react";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { badgeStyle, type MdmBadgeTone } from "@/shell";

import {
  EVENT_LABELS,
  GAP_LABEL,
  ROW_STATE_LABELS,
  STATE_LABELS,
  type DataHistoryResult,
  type HistoryRowState,
  type HistoryTarget,
} from "./types";

export interface DataHistoryTimelineProps {
  result: DataHistoryResult | null;
  /** 그리드 이름 — 부모가 둘이라 호출처가 구분 값을 넘긴다(기본 항목 이력). */
  gridId?: string;
}

const ROW_TONE: Record<HistoryRowState, MdmBadgeTone> = { OPEN: "success", PAST: "neutral", CLOSED: "muted" };

/** 칸 안 한 줄 높이(px) — 배지(18px)가 들어가는 높이. 행 높이는 줄 수 × 이 값 + 위아래 여백. */
const LINE = 20;
const rowHeightOf = (target: HistoryTarget) => (target === "CATE" ? 3 : 2) * LINE + 6;

const muted = { color: "var(--color-text-muted)" } as const;
const clip = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

function badge(text: string, tone: MdmBadgeTone) {
  return <span style={badgeStyle(tone)}>{text}</span>;
}

/** 여러 줄 칸 — 각 줄은 넘치면 말줄임한다. title 에 전체 값을 둔다. */
function lines(parts: ReactNode[], opts: { align?: "left" | "center"; title?: string } = {}) {
  const center = opts.align === "center";
  return (
    <div
      title={opts.title}
      style={{
        display: "flex", flexDirection: "column", justifyContent: "center", alignItems: center ? "center" : "stretch",
        height: "100%", lineHeight: `${LINE}px`, minWidth: 0,
      }}
    >
      {parts.map((p, i) => (
        <Fragment key={i}>
          {/* 줄 사이 공백 — 화면에는 안 보이고(flex 가 공백 글자를 버린다) 글자로 읽을 때(textContent·복사) 두 줄이 붙지
              않게 한다. 시작·끝 칸이 "2026-08-20 09:05:00" 한 글자로 읽혀야 앞 행 끝과 다음 행 시작을 맞대 볼 수 있다. */}
          {i > 0 && " "}
          <div style={{ ...clip, maxWidth: "100%", textAlign: center ? "center" : "left" }}>{p}</div>
        </Fragment>
      ))}
    </div>
  );
}

/** "yyyy-MM-dd HH:mm:ss" 를 날짜·시각 두 줄로. 그 밖의 값(열림 등)은 한 줄. */
function dateTime(value: unknown) {
  const text = String(value ?? "");
  const [date, time] = text.split(" ");
  return lines(time ? [date, time] : [text], { align: "center", title: text });
}

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/**
 * 대상별 타임라인 열. `columnSizing="fit"` 이라 `width` 는 비율이고, 칸이 좁으면 `minWidth` 까지 줄어든 뒤 가로로 넘친다.
 */
export function timelineColumns(target: HistoryTarget, header: DataHistoryResult["header"] | null, key: string | null | undefined): GridColumn[] {
  const cols: GridColumn[] = [
    {
      key: "eventLabel",
      header: "사건",
      meta: false,
      width: 74,
      minWidth: 70,
      align: "center",
      tooltip: false,
      render: (value, row) => {
        if (row.gap) {
          // 빈 구간 줄은 배지 하나 — 좁은 칸에서는 두 줄로 접힌다.
          return lines([
            <span key="g" style={{ ...badgeStyle("warning"), height: "auto", whiteSpace: "normal", lineHeight: "16px",
              padding: "1px 6px", textAlign: "center" }}>{String(value)}</span>,
          ], { align: "center" });
        }
        const tone = ROW_TONE[(row.rowState as HistoryRowState) ?? "PAST"] ?? "neutral";
        return lines([badge(String(value), "info"), badge(String(row.rowStateLabel ?? ""), tone)], { align: "center" });
      },
    },
    { key: "validFrom", header: "시작", width: 92, minWidth: 88, align: "center", tooltip: false, render: dateTime },
    { key: "validTo", header: "끝", width: 92, minWidth: 88, align: "center", tooltip: false, render: dateTime },
  ];
  if (target === "ITEM") {
    cols.push({
      key: "name",
      header: "이름",
      meta: false,
      width: 140,
      minWidth: 80,
      tooltip: false,
      render: (value, row) => {
        const alter = text(row.alterName);
        return lines(alter ? [text(value), <span key="a" style={muted}>{alter}</span>] : [text(value)], {
          title: alter ? `${text(value)} (약칭 ${alter})` : text(value),
        });
      },
    });
    // 덜 중요한 칸은 뒤에 둔다 — 좁은 패널에서는 가로로 밀어 본다.
    cols.push({ key: "seq", header: "순서", meta: false, width: 60, align: "right" });
    const lvlCnt = Math.max(0, Math.min(5, header?.lvlCnt ?? 0));
    for (let i = 1; i <= lvlCnt; i++) {
      cols.push({ key: `lvl${i}`, header: `${i}차`, width: 80, align: "left" });
    }
    for (const label of header?.attrLabels ?? []) {
      cols.push({ key: label.field, header: label.label, width: 100, align: "left" });
    }
    cols.push({ key: "rowVersion", header: "행 버전", width: 70, align: "right" });
  } else if (target === "CATE") {
    cols.push({
      key: "cateName",
      header: "카테고리 정의",
      headerTooltip: "카테고리 정의",
      width: 160,
      minWidth: 56,
      tooltip: false,
      render: (value, row) => {
        if (row.gap) return "";
        const kindTarget = [text(row.defKind), text(row.defTarget)].filter(Boolean).join(" · ");
        const expr = text(row.defExpr);
        return lines([text(value), <span key="k" style={muted}>{kindTarget}</span>, expr], {
          title: [
            `이름 ${text(value)}`,
            `종류 ${text(row.defKind)}`,
            row.defTarget ? `대상 ${text(row.defTarget)}` : "",
            expr ? `정규식 ${expr}` : "",
          ].filter(Boolean).join(" · "),
        });
      },
    });
  } else {
    // 소속 — 행마다 같은 항목 키지만, 좁은 패널에서 무엇의 선분인지 줄마다 보이게 둔다.
    cols.push({
      key: "memberKey",
      header: "항목 키",
      meta: false,
      headerTooltip: "항목 키",
      width: 120,
      minWidth: 56,
      tooltip: false,
      render: (_v, row) => (row.gap ? "" : lines([text(key)], { title: text(key) })),
    });
  }
  return cols;
}

export function DataHistoryTimeline({ result, gridId = "itemHistory" }: DataHistoryTimelineProps) {
  const target: HistoryTarget = result?.target ?? "ITEM";
  const header = result?.header ?? null;

  const gridRows = useMemo(() => {
    const out: Record<string, unknown>[] = [];
    (result?.rows ?? []).forEach((row, i) => {
      if (row.gapFrom) {
        out.push({ rowId: `gap${i}`, gap: true, eventLabel: GAP_LABEL, validFrom: row.gapFrom, validTo: row.gapTo });
      }
      out.push({
        ...row,
        rowId: `r${i}`,
        gap: false,
        eventLabel: EVENT_LABELS[row.event] ?? row.event,
        rowStateLabel: ROW_STATE_LABELS[row.rowState] ?? row.rowState,
        validTo: row.open ? "열림" : row.validTo,
      });
    });
    return out;
  }, [result]);

  const columns = useMemo(() => timelineColumns(target, header, result?.key), [target, header, result?.key]);

  const rows = result?.rows ?? [];
  const state = result?.state ?? "NONE";

  return (
    <div data-testid="history-timeline" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: "var(--spacing-sm)", alignItems: "center", padding: "var(--spacing-xs) 0" }}>
        <span data-testid="history-state">
          {result ? `${result.key ?? ""} · ${STATE_LABELS[state] ?? state} · ${rows.length}행` : "조회 전"}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <AgDataGrid gridId={gridId}
          title="이력"
          columns={columns}
          data={gridRows}
          rowKey="rowId"
          sortable={false}
          columnSizing="fit"
          getRowHeight={() => rowHeightOf(target)}
          emptyMessage="행이 없습니다"
          emptyTestId="history-empty"
        />
      </div>
    </div>
  );
}
