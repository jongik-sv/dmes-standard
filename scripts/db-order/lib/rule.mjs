// 컬럼 순서 규칙(사용자 결정 10-11·10-12, docs/idea.md 「DB 컬럼 순서 맞추기」):
//   PK(PK 제약 순서) → 엔티티 필드 선언 순서(부모 먼저) → 버전 컬럼 → 감사 컬럼(가진 것만).
//   엔티티 없는 표 = PK 맨 앞, 버전·감사 맨 뒤, 나머지는 지금 순서 유지.
import { resolveColumn } from "./java-entities.mjs";

/** 감사 8개 표준 순서 = 감사 기반 클래스(McmAuditEntity·CactusAuditEntity·CaravanAuditBase·ConsoleAuditEntity) 선언 순서. */
export const AUDIT_COLUMNS = ["C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID"];
/** 버전 컬럼. 여럿이면 이 순서. PK 에 든 VER(업무 버전)는 PK 묶음으로 간다. */
export const VERSION_COLUMNS = ["VER", "AUD_VER", "ROW_VERSION"];

/**
 * 표 하나의 규칙 순서를 낸다.
 * @param cols  지금 컬럼 순서(최종 모양)
 * @param pk    PK 제약 컬럼 순서
 * @param entity flattenEntities 의 엔티티(없으면 null)
 * @returns {order:[{col, group}], issues:[...]}  group = pk|field|other|version|audit
 */
export function ruleOrder(cols, pk, entity) {
  const issues = [];
  const pkSet = new Set(pk);
  const placed = new Set(pk);
  const order = pk.map((col) => ({ col, group: "pk" }));
  for (const c of pk) if (!cols.includes(c)) issues.push(`PK 컬럼 ${c} 가 표에 없음`);
  const isVersion = (c) => VERSION_COLUMNS.includes(c) && !pkSet.has(c);
  const isAudit = (c) => AUDIT_COLUMNS.includes(c) && !pkSet.has(c);
  const middle = [];
  if (entity) {
    for (const f of entity.cols) {
      if (f.embeddedId) continue;
      const name = f.column ? f.column.toUpperCase() : resolveColumn(f.field, cols);
      if (!name) {
        issues.push(`엔티티 ${entity.name}.${f.field}: 컬럼 이름을 정하지 못함`);
        continue;
      }
      if (!cols.includes(name)) {
        // 감사·버전 컬럼은 "가진 것만" 이라 표에 없어도 정상이다.
        if (!isAudit(name) && !VERSION_COLUMNS.includes(name)) issues.push(`엔티티 ${entity.name}.${f.field} → ${name} 가 표에 없음`);
        continue;
      }
      if (placed.has(name) || isVersion(name) || isAudit(name)) continue;
      if (f.version) {
        issues.push(`엔티티 ${entity.name}.${f.field} → ${name} 는 @Version 인데 버전 컬럼 이름이 아님`);
      }
      middle.push({ col: name, group: "field" });
      placed.add(name);
    }
  }
  // 엔티티에 없는 일반 컬럼 = 지금 순서 유지. 엔티티가 있는데 남으면 엔티티와 DDL 이 어긋난 것이라 알린다.
  for (const c of cols) {
    if (placed.has(c) || isVersion(c) || isAudit(c)) continue;
    if (entity) issues.push(`컬럼 ${c} 가 엔티티 ${entity.name} 에 없음(지금 자리 유지, 필드 뒤)`);
    middle.push({ col: c, group: entity ? "other" : "field" });
    placed.add(c);
  }
  order.push(...middle);
  for (const c of VERSION_COLUMNS) if (cols.includes(c) && !pkSet.has(c)) order.push({ col: c, group: "version" });
  for (const c of AUDIT_COLUMNS) if (cols.includes(c) && !pkSet.has(c)) order.push({ col: c, group: "audit" });
  return { order, issues };
}

export const sameOrder = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
