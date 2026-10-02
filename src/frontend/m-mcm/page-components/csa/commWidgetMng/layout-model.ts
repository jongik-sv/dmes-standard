/**
 * 위젯관리 「기본 배치」 탭의 순수 로직 — 배치 목록·표시 이름·서버 줄 변환(스펙 2026-10-02-widget-admin-generic §4.2·§10.2).
 * shared 런타임을 import 하지 않는다(타입만) — m-mcm vitest 가 shared dist 없이 시험한다.
 */
import type { WidgetItem, WidgetTab } from "@dk-oasis/shared/widget";

/** 전사 기본 배치의 키. */
export const COMPANY_LAYOUT_KEY = "*";
export const COMPANY_LAYOUT_NAME = "전사";
/** 기본 배치는 「홈」 탭 하나만 다룬다(shared HOME_TAB_ID 와 같은 값). */
export const HOME_TAB_ID = "home";
export const HOME_TAB_NAME = "홈";

/** commWidgetMng/searchLayouts 한 줄 — 기본 배치가 저장된 키. */
export type LayoutSummary = { layoutKey: string; deptNm: string; count: number };

/** commWidgetMng/searchDepts 한 줄. */
export type DeptRow = { deptCd: string; deptNm: string; upperDeptCd: string | null };

/** [부서 추가]로 골랐지만 아직 저장하지 않은 부서. */
export type PendingDept = { layoutKey: string; deptNm: string };

/** commWidgetMng/loadLayout 결과 — sourceKey 는 실제로 읽어 온 키(상속이면 layoutKey 와 다르고, 아무것도 없으면 null). */
export type LoadedLayout = { layoutKey: string; sourceKey: string | null; items: WidgetItem[] };

/** 왼쪽 배치 목록 한 줄(그리드 행). */
export type LayoutListRow = {
  layoutKey: string;
  deptNm: string;
  /** 저장된 위젯 수(저장 전이면 0). */
  count: number;
  /** 서버에 행이 있는가 — [기본 배치 지우기] 활성 조건. */
  saved: boolean;
  label: string;
};

/** 서버 배치 줄(Map) — 값은 숫자·문자열이 섞여 올 수 있다. */
export type LayoutItemRow = Record<string, unknown>;

const byDeptNameThenKey = (a: { deptNm: string; layoutKey: string }, b: { deptNm: string; layoutKey: string }) =>
  a.deptNm.localeCompare(b.deptNm, "ko") || a.layoutKey.localeCompare(b.layoutKey);

/** 부서 이름이 비었으면 코드로 대신한다. */
const deptName = (layoutKey: string, deptNm: string | null | undefined) => deptNm?.trim() || layoutKey;

function companyLabel(saved: boolean, count: number): string {
  return `${COMPANY_LAYOUT_NAME}(${COMPANY_LAYOUT_KEY}) · ${saved ? `${count}개` : "코드 기본값 사용 중"}`;
}

function deptLabel(layoutKey: string, deptNm: string, saved: boolean, count: number): string {
  const name = deptNm === layoutKey ? layoutKey : `${deptNm}(${layoutKey})`;
  return `${name} · ${saved ? `${count}개` : "저장 전"}`;
}

/**
 * 배치 목록 — 전사(*)는 행이 없어도 늘 첫 줄, 그다음 부서(서버 행 + 저장 전 부서)를 이름 순으로.
 * 같은 키가 서버에도 있으면 서버 행이 이긴다.
 */
export function buildLayoutList(summaries: readonly LayoutSummary[], pending: readonly PendingDept[]): LayoutListRow[] {
  const company = summaries.find((s) => s.layoutKey === COMPANY_LAYOUT_KEY);
  const companyRow: LayoutListRow = {
    layoutKey: COMPANY_LAYOUT_KEY,
    deptNm: COMPANY_LAYOUT_NAME,
    count: company?.count ?? 0,
    saved: company != null,
    label: companyLabel(company != null, company?.count ?? 0),
  };

  const depts: LayoutListRow[] = [];
  const seen = new Set<string>([COMPANY_LAYOUT_KEY]);
  for (const s of summaries) {
    if (seen.has(s.layoutKey)) continue;
    seen.add(s.layoutKey);
    const deptNm = deptName(s.layoutKey, s.deptNm);
    depts.push({ layoutKey: s.layoutKey, deptNm, count: s.count, saved: true, label: deptLabel(s.layoutKey, deptNm, true, s.count) });
  }
  for (const p of pending) {
    if (seen.has(p.layoutKey)) continue;
    seen.add(p.layoutKey);
    const deptNm = deptName(p.layoutKey, p.deptNm);
    depts.push({ layoutKey: p.layoutKey, deptNm, count: 0, saved: false, label: deptLabel(p.layoutKey, deptNm, false, 0) });
  }
  depts.sort(byDeptNameThenKey);
  return [companyRow, ...depts];
}

/**
 * [부서 추가]로 고른 부서를 저장 전 목록에 더한다. 전사 키·빈 코드·이미 있는 부서는 그대로(같은 참조)다.
 * 이미 배치가 있는 부서를 골라도 목록은 안 늘고 화면이 그 줄을 고르기만 한다.
 */
export function addPendingDept(
  pending: readonly PendingDept[],
  summaries: readonly LayoutSummary[],
  dept: Pick<DeptRow, "deptCd" | "deptNm">
): readonly PendingDept[] {
  const key = dept.deptCd.trim();
  if (!key || key === COMPANY_LAYOUT_KEY) return pending;
  if (pending.some((p) => p.layoutKey === key) || summaries.some((s) => s.layoutKey === key)) return pending;
  return [...pending, { layoutKey: key, deptNm: dept.deptNm }];
}

/**
 * 부서 검색 결과 → shared LookupModal 한 페이지({code=부서코드, name=부서명}). 서버는 페이지를 모르고 최대 50건만 주므로 화면에서 자른다.
 */
export function pageDeptLookupRows(
  depts: readonly DeptRow[],
  page: number,
  size: number
): { rows: { code: string; name: string }[]; totalElements: number } {
  const start = Math.max(0, page) * Math.max(1, size);
  return {
    rows: depts.slice(start, start + Math.max(1, size)).map((d) => ({ code: d.deptCd, name: d.deptNm })),
    totalElements: depts.length,
  };
}

/** 목록을 새로 받아 서버에 생긴 부서는 저장 전 목록에서 뺀다(나중에 지워져도 저장 전 줄로 되살아나지 않게). */
export function prunePending(pending: readonly PendingDept[], summaries: readonly LayoutSummary[]): PendingDept[] {
  return pending.filter((p) => !summaries.some((s) => s.layoutKey === p.layoutKey));
}

/** 키의 표시 이름 — 전사 / 목록의 부서명 / 목록에 없으면 코드. */
export function layoutDisplayName(layoutKey: string, rows: readonly LayoutListRow[]): string {
  if (layoutKey === COMPANY_LAYOUT_KEY) return COMPANY_LAYOUT_NAME;
  return rows.find((r) => r.layoutKey === layoutKey)?.deptNm || layoutKey;
}

/** 보드 위 제목 — 「전사 기본 배치」·「{부서명} 기본 배치」. */
export function boardTitle(layoutKey: string, rows: readonly LayoutListRow[]): string {
  return `${layoutDisplayName(layoutKey, rows)} 기본 배치`;
}

/** 물려받은 배치를 보고 있을 때의 안내(스펙 §10.2). 자기 배치이거나 아무것도 없으면 null. */
export function inheritNotice(layoutKey: string, sourceKey: string | null, rows: readonly LayoutListRow[]): string | null {
  if (!sourceKey || sourceKey === layoutKey) return null;
  return `${layoutDisplayName(sourceKey, rows)} 배치를 물려받아 보이는 중입니다. 저장하면 이 부서 배치가 생깁니다`;
}

/** [기본 배치 지우기] 확인 문구 — 지우면 어떤 배치가 적용되는지(스펙 §4.2 적용 순서). */
export function deleteConfirmMessage(layoutKey: string, rows: readonly LayoutListRow[]): string {
  const name = boardTitle(layoutKey, rows);
  return layoutKey === COMPANY_LAYOUT_KEY
    ? `${name}를 삭제하시겠습니까? 삭제하면 코드 기본값이 적용됩니다.`
    : `${name}를 삭제하시겠습니까? 삭제하면 상위 부서 또는 전사 배치가 적용됩니다.`;
}

/** 유형 등록부 → 서랍이 정의 위젯 옆에 보이는 유형 이름(ID → 이름). */
export function buildTypeTitles(types: Readonly<Record<string, { meta: { title: string } }>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, entry] of Object.entries(types)) out[id] = entry.meta.title;
  return out;
}

/** 숫자가 아니면(NaN·무한대·빈 값) 0 — 보드(sanitizeLayout)가 위젯별 범위로 다시 자른다. home 의 homeItemsFromRows 와 같다. */
const int = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** 서버 배치 줄 → 위젯 항목(문자열 숫자 변환, lockYn Y → locked, 기본 배치에는 인스턴스 설정이 없어 config 는 null). instId·widgetId 가 빈 줄은 건너뛴다. */
export function layoutItemsFromRows(rows: unknown): WidgetItem[] {
  if (!Array.isArray(rows)) return [];
  const out: WidgetItem[] = [];
  for (const raw of rows) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const r = raw as LayoutItemRow;
    const instId = String(r.instId ?? "");
    const widgetId = String(r.widgetId ?? "");
    if (!instId || !widgetId) continue;
    out.push({
      instId,
      widgetId,
      x: int(r.posX),
      y: int(r.posY),
      w: int(r.sizeW),
      h: int(r.sizeH),
      locked: r.lockYn === "Y",
      config: null,
    });
  }
  return out;
}

/** 위젯 항목 → 서버 배치 줄(saveLayout grids.widgets.rows). */
export function layoutItemsToRows(items: readonly WidgetItem[]): LayoutItemRow[] {
  return items.map((i) => ({
    instId: i.instId,
    widgetId: i.widgetId,
    posX: i.x,
    posY: i.y,
    sizeW: i.w,
    sizeH: i.h,
    lockYn: i.locked ? "Y" : "N",
  }));
}

/**
 * loadLayout 결과 → WidgetStore.load 결과. 항목이 있으면 「홈」 탭 하나, 없으면 빈 배열
 * (WidgetWorkspace 가 homeDefault=코드 기본 배치를 쓴다).
 */
export function tabsFromLayout(layout: LoadedLayout): WidgetTab[] {
  if (layout.items.length === 0) return [];
  return [{ tabId: HOME_TAB_ID, name: HOME_TAB_NAME, seq: 0, locked: false, items: layout.items }];
}
