/**
 * DB 뷰어 (anl/dbViewer) — 컬럼 속성 「컬럼명」 칸의 값을 만든다.
 * 출처 순서(조정 확정): (1) MDM 컬럼 사전 이름 → (2) Oracle 칼럼 주석(ALL_COL_COMMENTS) → (3) 빈칸.
 * MDM 이름은 다른 화면 그리드 헤더 툴팁과 같은 길(shared mdm-meta)로 얻는다.
 */

import { mdmCaption, type MdmScreenColumn } from "@dk-oasis/shared/mdm-meta";
import type { DbColumnInfo } from "./types";

/**
 * 컬럼 사전을 물을 업무 모듈. DB 뷰어가 다루는 스키마(MCMAPUSER·MCM_SOURCE·MCM_BACKUP·MCAAPUSER·MDMAPUSER)는
 * 모두 mcm·mdm 계열인데, `/api/mdm/mdmMeta` 는 404(cactus.mdm.enabled 꺼짐)고 `/api/mcm/mdmMeta` 가 같은 컬럼 사전을
 * 준다(shared mdm-meta context.tsx MDM_META_TAB_MODULES, 2026-10-05 실측). 사전 자체는 전사 표준이라 물리명 매칭은
 * 모듈과 무관하다 — 살아 있는 mcm 하나로 충분하다. 모듈이 죽으면(404·연결 실패) store 가 세션 동안 끄고 빈 Map 을
 * 돌려주므로 조용히 (2) 칼럼 주석으로 넘어간다.
 */
export const MDM_META_MODULE = "mcm";

/** 칼럼 물리명 → MDM 사전 이름(한글). 사전에 없거나 알 수 없으면 키가 없다. */
export type MdmNameMap = Map<string, string>;

/** MDM 컬럼 메타 맵(requestColumns 결과)에서 보일 이름을 뽑는다 — 그리드 헤더와 같은 캡션 규칙(labelShort → … → columnName). */
export function mdmNamesOf(
  columns: Pick<DbColumnInfo, "COLUMN_NAME">[],
  metas: Map<string, MdmScreenColumn | null>,
): MdmNameMap {
  const out: MdmNameMap = new Map();
  for (const col of columns) {
    const meta = metas.get(col.COLUMN_NAME);
    if (!meta) continue;
    const caption = mdmCaption(meta, "grid");
    if (caption) out.set(col.COLUMN_NAME, caption);
  }
  return out;
}

/** 컬럼명 칸 값 — (1) MDM 사전 이름 → (2) 칼럼 주석 → (3) 빈칸. 주석은 앞뒤 공백을 떼고 보인다. */
export function columnCaptionOf(
  mdmName: string | undefined,
  comments: string | null | undefined,
): string {
  if (mdmName) return mdmName;
  const text = comments?.trim();
  return text ? text : "";
}
