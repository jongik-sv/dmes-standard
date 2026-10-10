/**
 * DB 뷰어 (anl/dbViewer) — 컬럼 속성의 「MDM 이름」·「DB 주석」 두 칸의 값을 만든다.
 * 두 칸은 서로 대체하지 않는다: MDM 이름은 사전이 도착해야 채워지고(없으면 빈칸), DB 주석(ALL_COL_COMMENTS)은 곧바로 보인다.
 * MDM 이름은 다른 화면 그리드 헤더 툴팁과 같은 길(shared mdm-meta)로 얻는다.
 */

import { mdmCaption, type MdmScreenColumn } from "@dk-oasis/shared/mdm-meta";
import type { DbColumnInfo } from "./types";

/**
 * 컬럼 사전을 물을 업무 모듈. DB 뷰어가 다루는 스키마(MCMAPUSER·MCM_SOURCE·MCM_BACKUP·MCAAPUSER·MDMAPUSER)는
 * 모두 mcm·mdm 계열인데, `/api/mdm/mdmMeta` 는 404(cactus.mdm.enabled 꺼짐)고 `/api/mcm/mdmMeta` 가 같은 컬럼 사전을
 * 준다(shared mdm-meta context.tsx MDM_META_TAB_MODULES, 2026-10-05 실측). 사전 자체는 전사 표준이라 물리명 매칭은
 * 모듈과 무관하다 — 살아 있는 mcm 하나로 충분하다. 모듈이 죽으면(404·연결 실패) store 가 세션 동안 끄고 빈 Map 을
 * 돌려주므로 조용히 「MDM 이름」 칸만 빈칸으로 남는다.
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

/** DB 주석 칸 값 — Oracle 칼럼 주석의 앞뒤 공백을 떼고, 없으면 빈칸. */
export function dbCommentOf(comments: string | null | undefined): string {
  return comments?.trim() ?? "";
}
