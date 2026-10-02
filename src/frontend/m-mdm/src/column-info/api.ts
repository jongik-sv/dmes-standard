/**
 * 컬럼 정보 팝오버의 조회 — 컬럼 사전 `columnMng` action=view 를 표준 물리명(physName)으로 부른다. 서버는 물리명 조회일 때
 * 도메인 상세(이름·표준명·상속 조립한 타입·길이·소수·단위)를 `domain` 에 싣는다(ColumnMngService.view).
 *
 * 같은 물리명은 모듈 범위 캐시로 한 번만 조회한다. 진행 중인 조회(Promise)를 캐시해 동시에 여러 팝오버가 열려도 한 번만 부른다.
 * 실패(없는 컬럼 포함)는 캐시하지 않는다 — 다음에 열 때 다시 묻는다.
 */
import { callOasis } from "@/dme/oasis-call";

export interface ColumnInfoColumn {
  columnId: number;
  columnName: string;
  physName: string;
  labelLong?: string | null;
  labelMid?: string | null;
  labelShort?: string | null;
  description?: string | null;
  domainId?: number | null;
  required?: boolean | null;
  defaultValue?: string | null;
  refKind?: string | null;
  refTarget?: string | null;
  refCateId?: string | null;
  usageNote?: string | null;
}

export interface ColumnInfoDomain {
  domainId: number;
  domainName?: string | null;
  stdName?: string | null;
  domainKind?: string | null;
  dataType?: string | null;
  length?: number | null;
  scale?: number | null;
  unitCode?: string | null;
}

export interface ColumnInfoTerm {
  termId: number | null;
  termName?: string | null;
  senseNo?: number | null;
  engAbbr?: string | null;
  missing?: boolean;
}

export interface ColumnInfoSystem {
  systemCode: string;
  physName: string;
  transform?: string | null;
  note?: string | null;
}

export interface ColumnInfo {
  column: ColumnInfoColumn;
  domain: ColumnInfoDomain | null;
  terms: ColumnInfoTerm[];
  systems: ColumnInfoSystem[];
}

const cache = new Map<string, Promise<ColumnInfo>>();

const keyOf = (physName: string) => physName.trim().toUpperCase();

/** 표준 물리명으로 컬럼 정보를 읽는다. 없는 컬럼·서버 거부는 reject(메시지는 서버 문구). */
export function loadColumnInfo(physName: string): Promise<ColumnInfo> {
  const key = keyOf(physName);
  if (!key) return Promise.reject(new Error("물리명이 비어 있습니다"));
  const hit = cache.get(key);
  if (hit) return hit;
  const p = callOasis<Partial<ColumnInfo>>("columnMng", "view", { physName: physName.trim(), withDomain: true }).then(
    (res) => {
      if (!res.column) throw new Error("컬럼 정보가 없습니다");
      return {
        column: res.column,
        domain: res.domain ?? null,
        terms: res.terms ?? [],
        systems: res.systems ?? [],
      };
    },
  );
  cache.set(key, p);
  p.catch(() => {
    if (cache.get(key) === p) cache.delete(key);
  });
  return p;
}

/** 캐시를 비운다(테스트, 컬럼 사전을 고친 뒤 새로 보이게 할 때). 물리명을 주면 그것만. */
export function clearColumnInfoCache(physName?: string): void {
  if (physName === undefined) cache.clear();
  else cache.delete(keyOf(physName));
}

const HTML_TAG = /<\/?(p|div|br|span|b|strong|i|em|u|s|ul|ol|li|a|table|thead|tbody|tr|th|td|h[1-6]|code|pre|blockquote|img|hr)\b[^>]*>/i;

/**
 * 설명 글의 형식. 알려진 HTML 태그가 있으면 HTML, 아니면 일반 글(TEXT — 줄바꿈 보존, `<`·`>` 가 글자로 남는다).
 * `Map<String>`·`a < b` 같은 사전 설명이 HTML 소독으로 사라지지 않게 아무 `<…>` 가 아니라 알려진 태그만 본다.
 */
export function descriptionFormat(text: string | null | undefined): "HTML" | "TEXT" {
  return text && HTML_TAG.test(text) ? "HTML" : "TEXT";
}
