/**
 * 마스터코드 — 코드 묶음 목록·찾기·항목 열(순수 함수). 코드 이름·속성 라벨은 catalog(CODES), 화면 목록은 SCREEN_CODES 가 정본이다.
 */
import type { GridColumn } from "@dk-oasis/shared/grid";

import {
  CATALOG,
  type Catalog,
  type CodeItem,
  type CodeSet,
} from "@/common/rule";
import { SCREENS } from "@/common/screens";

import { NA, norm } from "../common/codes";

export const SCREEN_ID = "masterCode";

/** 분류 — 코드 묶음이 어디서 왔고 무엇에 쓰나. 등록 묶음(scripts/mqc-demo/mdm/codes.mjs)의 나눔과 같다. */
export const CATEGORIES: { key: string; label: string; codeIds: string[] }[] = [
  {
    key: "asis",
    label: "AS-IS 마스터코드",
    codeIds: [
      "QC_PRODUCT_TYPE",
      "QC_QUALITY_STATUS",
      "QC_USE_YN",
      "QC_ORD_THK_MNG_CD",
      "QC_THK_COR_UNT",
      "QC_PRD_NM_CD",
    ],
  },
  {
    key: "status",
    label: "상태 코드",
    codeIds: [
      "QC_SPEC_STATUS",
      "QC_DESIGN_STATUS",
      "QC_JUDGE_ITEM_RESULT",
      "QC_QCERT_STATUS",
      "QC_MTC_STATUS",
      "QC_TAG_STATUS",
      "QC_TAG_KIND",
      "QC_IF_DIR",
      "QC_IF_RESULT",
      "QC_FEAS_STATE",
      "QC_SIM_CASE_STATUS",
    ],
  },
  {
    key: "master",
    label: "고객·규격·재질",
    codeIds: ["QC_CUSTOMER", "QC_SPEC_CD", "QC_MATL_CD", "QC_RAW_MATL_CD"],
  },
  {
    key: "legend",
    label: "룰 조건 범례",
    codeIds: [
      "QC_RULE_KIND",
      "QC_LEGACY_RULE_TYPE",
      "QC_THK_STD",
      "QC_SPEC_ORG",
      "QC_GW_ASG_CD",
      "QC_ORD_USG_CD",
      "QC_LINE_PROC_CD",
      "QC_EDGE_TP",
      "QC_PRD_SHP",
      "QC_COAT_WAY",
      "QC_RESIN_TP",
      "QC_ORD_WGT_LIMIT",
    ],
  },
  {
    key: "feas",
    label: "생산가부·주문정합성",
    codeIds: [
      "QC_FEAS_SHEET",
      "QC_FEAS_MATL_GRP",
      "QC_OC_FIELD",
      "QC_OC_VALUE_LABEL",
      "QC_OC_ERR_CATEGORY",
      "QC_OC_ACTOR",
    ],
  },
];

export const OTHER_CATEGORY = { key: "other", label: "기타" };

const CATEGORY_OF = new Map(
  CATEGORIES.flatMap((c) => c.codeIds.map((id) => [id, c] as const)),
);

export function categoryOf(codeId: string): { key: string; label: string } {
  return CATEGORY_OF.get(codeId) ?? OTHER_CATEGORY;
}

/** 조회 조건 「분류」 선택지(목록에 있는 분류만, 정의 순서). */
export function categoryOptions(
  codeIds: readonly string[],
): { value: string; label: string }[] {
  const used = new Set(codeIds.map((id) => categoryOf(id).key));
  return [
    { value: "", label: "전체" },
    ...[...CATEGORIES, OTHER_CATEGORY]
      .filter((c) => used.has(c.key))
      .map((c) => ({ value: c.key, label: c.label })),
  ];
}

/** 코드 ID → 그 코드를 쓰는 화면 이름(마스터코드 자신은 뺀다, catalog SCREEN_CODES 순서). */
export function usedByScreens(
  codeId: string,
  catalog: Catalog = CATALOG,
): string[] {
  return Object.entries(catalog.SCREEN_CODES)
    .filter(([screen, ids]) => screen !== SCREEN_ID && ids.includes(codeId))
    .map(([screen]) => SCREENS[screen]?.title ?? screen);
}

export interface GroupRow {
  codeId: string;
  title: string;
  categoryKey: string;
  category: string;
  /** 적용 버전(없으면 null — Maru 에 RELEASED 가 없다). */
  ver: string | null;
  itemCount: number;
  /** 검색어에 맞은 항목 수(검색어가 없으면 null). */
  matchCount: number | null;
  desc: string;
  usedBy: string[];
}

export interface GroupFilter {
  /** 분류 키. 빈 글 = 전체. */
  category: string;
  /** 통합 검색 — 코드 ID·이름·설명, 항목 코드·이름·별칭·계층·속성에 든 글(대소문자 무시). */
  keyword: string;
}

export const EMPTY_GROUP_FILTER: GroupFilter = { category: "", keyword: "" };

/** 항목이 검색어에 맞나. */
export function itemMatches(item: CodeItem, keyword: string): boolean {
  const k = norm(keyword);
  if (k === "") return true;
  return [
    item.code,
    item.name,
    item.alterName,
    ...item.lvl,
    ...item.attrs,
  ].some((v) => norm(v).includes(k));
}

/**
 * 코드 묶음 목록 — codeIds 순서. 조회 응답에 없는 코드도 행으로 둔다(항목 0, 버전 없음 — Maru 등록 누락이 보이게).
 * 검색어는 묶음 머리(ID·이름·설명)나 항목 하나라도 맞으면 남긴다.
 */
export function groupRows(
  codeIds: readonly string[],
  codes: readonly CodeSet[],
  filter: GroupFilter,
  catalog: Catalog = CATALOG,
): GroupRow[] {
  const byId = new Map(codes.map((c) => [c.codeId, c]));
  const k = norm(filter.keyword);
  const out: GroupRow[] = [];
  for (const codeId of codeIds) {
    const cat = categoryOf(codeId);
    if (filter.category && cat.key !== filter.category) continue;
    const meta = catalog.CODES[codeId];
    const set = byId.get(codeId);
    const items = set?.items ?? [];
    const title = meta?.title || codeId;
    const desc = meta?.desc ?? "";
    let matchCount: number | null = null;
    if (k !== "") {
      matchCount = items.filter((i) => itemMatches(i, k)).length;
      const headHit = [codeId, title, desc].some((v) => norm(v).includes(k));
      if (!headHit && matchCount === 0) continue;
    }
    out.push({
      codeId,
      title,
      categoryKey: cat.key,
      category: cat.label,
      ver: set?.ver ?? null,
      itemCount: items.length,
      matchCount,
      desc,
      usedBy: usedByScreens(codeId, catalog),
    });
  }
  return out;
}

/** 분류별 묶음 수 — "" 는 전체. */
export function categoryCounts(
  rows: readonly GroupRow[],
): Record<string, number> {
  const out: Record<string, number> = { "": rows.length };
  for (const r of rows) out[r.categoryKey] = (out[r.categoryKey] ?? 0) + 1;
  return out;
}

// ── 항목 그리드 ─────────────────────────────────────────

/** 값이 하나라도 있는 마지막 칸 번호 + 1. */
function usedLength(
  items: readonly CodeItem[],
  pick: (i: CodeItem) => (string | null)[],
): number {
  let n = 0;
  for (const it of items) {
    const vals = pick(it);
    for (let i = vals.length - 1; i >= n; i--)
      if ((vals[i] ?? "").trim() !== "") {
        n = i + 1;
        break;
      }
  }
  return n;
}

export interface ItemColumnSpec {
  hasAlter: boolean;
  /** 계층 열 라벨(lvl1 부터). */
  lvls: string[];
  /** 속성 열 라벨(attr01 부터). */
  attrs: string[];
}

/**
 * 항목 열 — catalog 라벨이 있는 칸 + 라벨은 없지만 값이 든 칸(「계층 n」·「속성 n」). 별칭은 값이 있을 때만.
 */
export function itemColumnSpec(
  codeId: string,
  items: readonly CodeItem[],
  catalog: Catalog = CATALOG,
): ItemColumnSpec {
  const meta = catalog.CODES[codeId];
  const lvlNames = meta?.lvlNames ?? [];
  const attrNames = meta?.attrNames ?? [];
  const lvlLen = Math.max(
    lvlNames.length,
    usedLength(items, (i) => i.lvl),
  );
  const attrLen = Math.max(
    attrNames.length,
    usedLength(items, (i) => i.attrs),
  );
  return {
    hasAlter: items.some((i) => (i.alterName ?? "").trim() !== ""),
    lvls: Array.from(
      { length: lvlLen },
      (_, i) => lvlNames[i] || `계층 ${i + 1}`,
    ),
    attrs: Array.from(
      { length: attrLen },
      (_, i) => attrNames[i] || `속성 ${i + 1}`,
    ),
  };
}

export function itemColumns(spec: ItemColumnSpec): GridColumn[] {
  return [
    {
      key: "seq",
      header: "순번",
      width: 60,
      align: "right",
      type: "number",
      meta: false,
    },
    {
      key: "code",
      header: "코드",
      width: 120,
      align: "left",
      meta: false,
      tooltip: true,
    },
    {
      key: "name",
      header: "이름",
      width: 200,
      align: "left",
      meta: false,
      tooltip: true,
    },
    ...(spec.hasAlter
      ? [
          {
            key: "alterName",
            header: "별칭",
            width: 120,
            align: "left",
            meta: false,
          } as GridColumn,
        ]
      : []),
    ...spec.lvls.map<GridColumn>((label, i) => ({
      key: `lvl${i}`,
      header: label,
      width: 110,
      align: "left",
      meta: false,
      tooltip: true,
    })),
    ...spec.attrs.map<GridColumn>((label, i) => ({
      key: `attr${i}`,
      header: label,
      width: 140,
      align: "left",
      meta: false,
      tooltip: true,
    })),
  ];
}

export function itemRows(
  items: readonly CodeItem[],
): Record<string, unknown>[] {
  return items.map((item) => {
    const row: Record<string, unknown> = {
      seq: item.seq,
      code: item.code,
      name: item.name ?? "",
      alterName: item.alterName ?? "",
    };
    item.lvl.forEach((v, i) => (row[`lvl${i}`] = v ?? ""));
    item.attrs.forEach((v, i) => (row[`attr${i}`] = v ?? ""));
    return row;
  });
}

/** 목록 칸 「사용 화면」 글. */
export function usedByText(usedBy: readonly string[]): string {
  return usedBy.length === 0 ? NA : usedBy.join(", ");
}
