/**
 * 도메인 트리 표시 순수 함수(design.md §3.8, 기능설계서 G-001·G-004·D-003). 서버가 DFS 순서·DEPTH 를 준다.
 */
import type { DomainRow } from "./types";

const FULL_WIDTH_SPACE = "　";

/** 깊이 0 은 이름 그대로, 1 이상은 (깊이-1) 칸 전각 공백 + "└ ". */
export function indentLabel(name: string, depth: number): string {
  if (!depth || depth <= 0) return name;
  return `${FULL_WIDTH_SPACE.repeat(depth - 1)}└ ${name}`;
}

/** 부모 후보 — 자기와 자기 하위는 뺀다(순환 방지). selfId 가 null 이면(신규) 전부. */
export function parentCandidates(rows: DomainRow[], selfId: number | null): DomainRow[] {
  if (selfId === null) return rows;
  const excluded = new Set<number>([selfId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rows) {
      if (r.PARENT_DOMAIN_ID !== null && excluded.has(r.PARENT_DOMAIN_ID) && !excluded.has(r.DOMAIN_ID)) {
        excluded.add(r.DOMAIN_ID);
        grew = true;
      }
    }
  }
  return rows.filter((r) => !excluded.has(r.DOMAIN_ID));
}

const TYPE_LABEL: Record<string, string> = { NUMBER: "숫자", STRING: "문자", BOOLEAN: "불린", DATE: "일자" };

/** G-004 — 최상위는 "숫자 12,3", 자식은 "(상속)" 또는 좁힌 길이 "≤ 8". */
export function typeLabel(row: DomainRow): string {
  if (row.PARENT_DOMAIN_ID !== null && row.PARENT_DOMAIN_ID !== undefined) {
    if (row.LENGTH === null || row.LENGTH === undefined) return "(상속)";
    return `≤ ${row.LENGTH}${row.SCALE !== null && row.SCALE !== undefined ? `,${row.SCALE}` : ""}`;
  }
  const base = TYPE_LABEL[row.DATA_TYPE] ?? row.DATA_TYPE;
  if (row.LENGTH === null || row.LENGTH === undefined) return base;
  return `${base} ${row.LENGTH}${row.SCALE !== null && row.SCALE !== undefined ? `,${row.SCALE}` : ""}`;
}
