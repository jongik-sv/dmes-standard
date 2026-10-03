/**
 * 부모 도메인 검색형 선택(DomainField)에 꽂는 검색 함수. domainMng 자기 `search` 결과(MATCHED 표시 + 조상 행)를 받아 후보 규칙으로 거른다.
 * 후보 규칙(`parentCandidates`·`linkCandidates`)은 부모 연결을 따라 자기 하위를 찾으므로, MATCHED 로 줄이기 **전** 전체 결과에 적용한다.
 * 하위 도메인이 검색어에 맞으면 서버가 그 조상(자기 포함)을 함께 주므로 전체 트리 없이도 하위를 빠짐없이 뺀다.
 */
import { DOMAIN_LIMIT, type DomainRow as PickerRow, type DomainSearchFn } from "@/domain";
import type { DomainRow } from "./types";

/** domainMng 목록 행 → DomainField 찾기 줄. */
export function toPickerRow(r: DomainRow): PickerRow {
  return {
    domainId: r.DOMAIN_ID, stdName: r.STD_NAME, domainName: r.DOMAIN_NAME, domainKind: r.DOMAIN_KIND,
    dataType: r.DATA_TYPE as PickerRow["dataType"], length: r.LENGTH, scale: r.SCALE, stdRule: r.STD_RULE,
  };
}

/** 정렬 순위 — 표준명·도메인명이 글자와 같으면 0, 앞부분이 같으면 1, 나머지 2(ruleEdit 도메인 검색과 같은 기준). */
function rank(r: PickerRow, keyword: string): number {
  const k = keyword.trim().toUpperCase();
  if (k === "") return 2;
  const names = [r.stdName, r.domainName ?? ""].map((n) => n.trim().toUpperCase());
  if (names.some((n) => n === k)) return 0;
  return names.some((n) => n.startsWith(k)) ? 1 : 2;
}

/**
 * @param fetchRows 서버 조회(keyword 부분 일치, 빈 글자는 전체)
 * @param narrow 후보 규칙 — 고를 수 없는 도메인(자기·하위 등)을 뺀다
 * @param onRows 후보로 남은 원본 행(EFF_*·HAS_BIZ 포함)을 알린다 — 화면이 고른 부모의 원본을 보관하는 데 쓴다
 * 결과는 정확히 일치 → 앞부분 일치 → 나머지 순으로 정렬해 `DOMAIN_LIMIT` 건까지만 준다(찾기 팝업의 "더 좁혀 검색" 안내와 맞춘다).
 */
export function makeParentSearch(fetchRows: (keyword: string) => Promise<DomainRow[]>, narrow: (rows: DomainRow[]) => DomainRow[], onRows?: (rows: DomainRow[]) => void): DomainSearchFn {
  return async (keyword) => {
    const matched = narrow(await fetchRows(keyword)).filter((r) => r.MATCHED);
    onRows?.(matched);
    const rows = matched.map(toPickerRow);
    return rows
      .map((r, i) => ({ r, i, k: rank(r, keyword) }))
      .sort((a, b) => a.k - b.k || a.i - b.i)
      .slice(0, DOMAIN_LIMIT)
      .map((x) => x.r);
  };
}
