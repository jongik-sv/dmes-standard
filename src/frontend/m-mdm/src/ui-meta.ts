/**
 * 컬럼 사전(MDM) 연결 도우미 — 화면의 열·라벨이 사전과 이어지는지 한곳에서 적는다.
 * shared 가 아니라 모듈 안에 두는 이유: 어느 칸을 사전에서 끌지는 업무 화면이 정하고, shared 는 `meta` 한 칸만 안다.
 */
import type { GridColumn } from "@dk-oasis/shared/grid";

/**
 * 사전과 이어지지 않는 열 모음 — `dictKeys` 에 없는 열에 `meta: false` 를 채운다.
 * 이미 `meta` 를 적은 열(`meta: "물리명"` 포함)과 `dictKeys` 에 든 열(key 를 물리명으로 바꿔 사전에서 찾는 열)은 그대로 둔다.
 * 열 묶음(`children`)도 같은 규칙으로 안쪽까지 푼다. 새 배열을 돌려주고 원본은 바꾸지 않는다.
 */
export function uiCols(cols: GridColumn[], dictKeys: readonly string[] = []): GridColumn[] {
  return cols.map((c) => {
    const next: GridColumn = "meta" in c || dictKeys.includes(c.key) ? c : { ...c, meta: false };
    return c.children ? { ...next, children: uiCols(c.children, dictKeys) } : next;
  });
}

/** 뜻이 화면마다 다른 일반 키 `description`·`source` 의 라벨 — 사전 카드는 끈다(범용 키라 어느 컬럼 설명인지 정할 수 없다). 모듈마다 두는 사본이라 m-mcm/lib/ui-meta.ts 와 함께 고친다. */
export const DESCRIPTION_LABEL = { name: "description", label: "설명", meta: false } as const;
export const SOURCE_LABEL = { name: "source", label: "원천", meta: false } as const;
