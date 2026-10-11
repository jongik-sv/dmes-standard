/**
 * Space 속성 창(2차 c4) 순수 부분 — 표 하나의 초안(표 기본·컬럼 기본 칸·키·관계)과, 초안을 고친 만큼만 명령 한 묶음으로 만드는 일.
 * 한 묶음 = 되돌리기 1번. 서버 규칙(ErdCommandEngine·ErdRelationOps)을 먼저 보고 틀리면 보내지 않는다.
 * 컬럼은 기본 칸(논리·물리·도메인·NULL 허용·PK)만 다룬다. 타입·길이·기본값·설명 같은 자세한 칸은 컬럼 그리드에서 고친다.
 * 키: PK 는 컬럼 행의 PK 칸으로 정한다(setPrimaryKey). UK·IX 는 이름·컬럼을 고치고, 더하고, 지운다.
 * 관계: 이 표가 자식이거나 부모인 관계. 식별·카디널리티·DB FK 를 고치고, 추정 관계는 확정·기각, 그리고 지운다.
 */
import type { ErdCommandJson, ErdModelJson, ErdRelationState } from "../types";
import { MAX_BATCH } from "./erd-commands";

export const PARENT_CARDS = ["ONE", "ZERO_OR_ONE"] as const;
export const CHILD_CARDS = ["ZERO_OR_MORE", "ONE_OR_MORE", "ZERO_OR_ONE", "ONE"] as const;
export const CARD_LABEL: Readonly<Record<string, string>> = {
  ONE: "1", ZERO_OR_ONE: "0..1", ZERO_OR_MORE: "0..n", ONE_OR_MORE: "1..n",
};

export interface DraftColumn {
  id: string;
  phys: string;
  logical: string;
  domainId: number | null;
  /** NULL 허용 = !notNull. PK 컬럼은 서버가 NOT NULL 로 둔다. */
  notNull: boolean;
  pk: boolean;
}

export interface DraftKey {
  /** 새로 더한 키는 null. */
  id: string | null;
  kind: "UK" | "IX";
  name: string;
  columns: string[];
  deleted: boolean;
}

export type RelationDecision = "confirm" | "reject" | null;

export interface DraftRelation {
  id: string;
  /** 상대 표 id(자기 참조면 같은 표). */
  other: string;
  /** 이 표가 자식인가. */
  asChild: boolean;
  state: ErdRelationState;
  identifying: boolean;
  parentCard: string;
  childCard: string;
  dbFk: boolean;
  /** 다른 모델 부모(DB FK 불가). */
  crossModel: boolean;
  decision: RelationDecision;
  deleted: boolean;
}

export interface PropsDraft {
  table: string;
  phys: string;
  logical: string;
  comment: string;
  columns: DraftColumn[];
  keys: DraftKey[];
  relations: DraftRelation[];
}

/** 표의 지금 값으로 초안을 만든다. 표가 없으면 null. */
export function draftOf(model: ErdModelJson, tableId: string): PropsDraft | null {
  const t = model.tables[tableId];
  if (!t) return null;
  const pk = new Set(Object.values(model.keys).filter((k) => k.table === tableId && k.kind === "PK").flatMap((k) => k.columns));
  const columns = t.columnOrder.filter((c) => model.columns[c]).map((id): DraftColumn => {
    const c = model.columns[id];
    return { id, phys: c.phys, logical: c.logical ?? "", domainId: c.domainId, notNull: c.notNull, pk: pk.has(id) };
  });
  const keys = Object.entries(model.keys)
    .filter(([, k]) => k.table === tableId && k.kind !== "PK")
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    .map(([id, k]): DraftKey => ({ id, kind: k.kind as "UK" | "IX", name: k.name, columns: [...k.columns], deleted: false }));
  const relations = Object.entries(model.relations)
    .filter(([, r]) => r.state !== "REJECTED" && (r.child === tableId || r.parent === tableId))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, r]): DraftRelation => {
      const asChild = r.child === tableId;
      return {
        // 다른 모델 부모는 parent 가 null 이다(서버 ErdRelationOps) — 그 모델의 표 id 를 보인다.
        id, other: asChild ? (r.parent ?? r.parentRef?.table ?? "") : r.child, asChild, state: r.state, identifying: r.identifying,
        parentCard: r.cardinality.parent, childCard: r.cardinality.child, dbFk: r.dbFk, crossModel: r.parentRef != null,
        decision: null, deleted: false,
      };
    });
  return { table: tableId, phys: t.phys, logical: t.logical ?? "", comment: t.comment ?? "", columns, keys, relations };
}

const ORACLE_ID = /^[A-Z][A-Z0-9_$#]{0,127}$/;

export interface PropsPlan {
  commands: ErdCommandJson[];
  /** 받을 수 없는 값. 있으면 commands 는 빈 목록. */
  error: string | null;
}

const fail = (error: string): PropsPlan => ({ commands: [], error });
const conflict = (what: string): PropsPlan => fail(`${what}을(를) 다른 사람이 먼저 바꿨습니다. 창을 닫고 다시 여세요.`);
const gone = (what: string): PropsPlan => fail(`${what}이(가) 지워졌습니다. 창을 닫고 다시 여세요.`);

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, k) => x === b[k]);
const tr = (v: string | null | undefined): string => (v ?? "").trim();

/**
 * 초안 → 명령 한 묶음(고친 칸만). base = 창을 열 때의 초안(draftOf). 고쳤는지는 base 와 비교한다 — 지금 모델과 비교하면
 * 창을 연 뒤 남이 바꾼 칸을 옛 값으로 덮는다(서버 baseRev 는 보낼 때 rev 라 CONFLICT 가 나지 않는다).
 * 내가 고친 칸을 남도 바꿨거나 지웠으면 보내지 않고 다시 열라고 알린다.
 * 이름 형식은 고친 행·새 행만 본다(가져온 옛 이름이 다른 칸 고치기를 막지 않게). 겹침은 앞에서부터 하나씩 바꾸며 본다(서버도 차례로 돌린다).
 * 순서 = 표 → 컬럼 → PK → 키(지우기·고치기·더하기) → 관계(지우기·고치기·확정/기각).
 * PK 를 관계보다 먼저 보낸다 — 식별 여부를 바꾸면 서버가 자식 PK 를 맞추므로 그 뒤에 와야 한다.
 */
export function propsCommands(model: ErdModelJson, base: PropsDraft, draft: PropsDraft, newKeyId: () => string): PropsPlan {
  const cur = draftOf(model, draft.table);
  if (!cur) return gone("표");
  const out: ErdCommandJson[] = [];
  const id = draft.table;

  // 표
  const tset: Record<string, unknown> = {};
  const phys = draft.phys.trim();
  if (phys !== tr(base.phys)) {
    if (tr(cur.phys) !== tr(base.phys)) return conflict("표 물리명");
    if (!ORACLE_ID.test(phys)) return fail("표 물리명은 영문 대문자로 시작하고 대문자·숫자·_·$·# 만 씁니다(128자 이내).");
    if (Object.entries(model.tables).some(([tid, t]) => tid !== id && t.phys === phys)) return fail(`같은 물리명의 표가 이미 있습니다: ${phys}`);
    tset.phys = phys;
  }
  if (tr(draft.logical) !== tr(base.logical)) {
    if (tr(cur.logical) !== tr(base.logical)) return conflict("표 논리명");
    tset.logical = tr(draft.logical);
  }
  if (draft.comment !== base.comment) {
    if (cur.comment !== base.comment) return conflict("표 설명");
    tset.comment = draft.comment;
  }
  if (Object.keys(tset).length > 0) out.push({ op: "updateTable", id, set: tset });

  // 컬럼 기본 칸
  const baseCol = new Map(base.columns.map((c) => [c.id, c] as const));
  const curCol = new Map(cur.columns.map((c) => [c.id, c] as const));
  const draftCol = new Map(draft.columns.map((c) => [c.id, c] as const));
  const colNames = new Map(cur.columns.map((c) => [c.id, c.phys] as const));
  const domains: ErdCommandJson[] = [];
  for (const c of draft.columns) {
    const b = baseCol.get(c.id);
    if (!b) continue;
    const cp = c.phys.trim();
    const physChanged = cp !== tr(b.phys);
    const logicalChanged = tr(c.logical) !== tr(b.logical);
    const nullChanged = c.notNull !== b.notNull && !c.pk;
    const domainChanged = c.domainId !== b.domainId;
    if (!physChanged && !logicalChanged && !nullChanged && !domainChanged && c.pk === b.pk) continue;
    const now = curCol.get(c.id);
    if (!now) return gone(`컬럼 ${b.phys}`);
    const set: Record<string, unknown> = {};
    if (physChanged) {
      if (now.phys !== b.phys) return conflict(`컬럼 ${b.phys} 물리명`);
      if (!ORACLE_ID.test(cp)) return fail(`컬럼 물리명이 틀렸습니다: ${cp || "(빈 값)"}`);
      const clash = [...colNames].find(([oid, n]) => oid !== c.id && n === cp)?.[0];
      if (clash) {
        const swap = draftCol.get(clash) && draftCol.get(clash)!.phys.trim() !== colNames.get(clash);
        return fail(swap ? `컬럼 물리명 ${cp} 를 한 번에 맞바꿀 수 없습니다. 하나씩 적용하세요.` : `같은 물리명의 컬럼이 있습니다: ${cp}`);
      }
      colNames.set(c.id, cp);
      set.phys = cp;
    }
    if (logicalChanged) {
      if (tr(now.logical) !== tr(b.logical)) return conflict(`컬럼 ${b.phys} 논리명`);
      set.logical = tr(c.logical);
    }
    if (nullChanged) {
      if (now.notNull !== b.notNull) return conflict(`컬럼 ${b.phys} NULL 허용`);
      set.notNull = c.notNull;
    }
    if (domainChanged) {
      if (now.domainId !== b.domainId) return conflict(`컬럼 ${b.phys} 도메인`);
      // 떼기는 updateColumn, 붙이기는 applyDomain(서버가 도메인 타입·길이를 함께 넣는다)
      if (c.domainId === null) set.domainId = null;
      else domains.push({ op: "applyDomain", id: c.id, domainId: c.domainId });
    }
    if (Object.keys(set).length > 0) out.push({ op: "updateColumn", id: c.id, set });
    out.push(...domains.splice(0));
  }

  // PK — 지금 PK 순서를 지키고, 끈 컬럼만 빼고 켠 컬럼은 뒤에 붙인다(복합 PK 순서를 말없이 바꾸지 않게).
  const pkOff = new Set(draft.columns.filter((c) => !c.pk && baseCol.get(c.id)?.pk).map((c) => c.id));
  const pkOn = draft.columns.filter((c) => c.pk && baseCol.get(c.id) && !baseCol.get(c.id)!.pk).map((c) => c.id);
  if (pkOff.size > 0 || pkOn.length > 0) {
    const pkNow = Object.values(model.keys).find((k) => k.table === id && k.kind === "PK")?.columns ?? [];
    const pkAfter = pkNow.filter((c) => !pkOff.has(c));
    for (const c of pkOn) if (!pkAfter.includes(c)) pkAfter.push(c);
    if (!sameList(pkAfter, pkNow)) out.push({ op: "setPrimaryKey", table: id, columns: pkAfter });
  }

  // 키(UK·IX)
  const baseKey = new Map(base.keys.filter((k) => k.id).map((k) => [k.id!, k] as const));
  const curKey = new Map(cur.keys.map((k) => [k.id!, k] as const));
  const keyNames = new Map(Object.entries(model.keys).map(([kid, k]) => [kid, k.name] as const));
  const checkKeyName = (nm: string, self: string | null): PropsPlan | null => {
    if (!ORACLE_ID.test(nm)) return fail(`키 이름이 틀렸습니다: ${nm || "(빈 값)"}`);
    if ([...keyNames].some(([kid, n]) => kid !== self && n === nm)) return fail(`같은 이름의 키가 있습니다: ${nm}`);
    return null;
  };
  for (const k of draft.keys) {
    if (!k.deleted || !k.id || !curKey.has(k.id)) continue; // 남이 이미 지운 키는 보내지 않는다
    out.push({ op: "deleteKey", id: k.id });
    keyNames.delete(k.id);
  }
  for (const k of draft.keys) {
    if (k.deleted || !k.id) continue;
    const b = baseKey.get(k.id);
    if (!b) continue;
    const nm = k.name.trim();
    const nameChanged = nm !== b.name;
    const colsChanged = !sameList(k.columns, b.columns);
    if (!nameChanged && !colsChanged) continue;
    const now = curKey.get(k.id);
    if (!now) return gone(`키 ${b.name}`);
    const set: Record<string, unknown> = {};
    if (nameChanged) {
      if (now.name !== b.name) return conflict(`키 ${b.name} 이름`);
      const bad = checkKeyName(nm, k.id);
      if (bad) return bad;
      keyNames.set(k.id, nm);
      set.name = nm;
    }
    if (colsChanged) {
      if (!sameList(now.columns, b.columns)) return conflict(`키 ${b.name} 컬럼`);
      if (k.columns.length === 0) return fail(`키 ${nm} 에 컬럼을 하나 이상 고르세요.`);
      if (k.columns.some((c) => !model.columns[c])) return gone(`키 ${nm} 의 컬럼`);
      set.columns = [...k.columns];
    }
    out.push({ op: "updateKey", id: k.id, set });
  }
  for (const k of draft.keys) {
    if (k.deleted || k.id) continue;
    const nm = k.name.trim();
    const bad = checkKeyName(nm, null);
    if (bad) return bad;
    if (k.columns.length === 0) return fail(`키 ${nm} 에 컬럼을 하나 이상 고르세요.`);
    if (k.columns.some((c) => !model.columns[c])) return gone(`키 ${nm} 의 컬럼`);
    const kid = newKeyId();
    keyNames.set(kid, nm);
    out.push({ op: "addKey", id: kid, table: id, kind: k.kind, name: nm, columns: [...k.columns] });
  }

  // 관계
  const baseRel = new Map(base.relations.map((r) => [r.id, r] as const));
  const curRel = new Map(cur.relations.map((r) => [r.id, r] as const));
  for (const r of draft.relations) if (r.deleted && curRel.has(r.id)) out.push({ op: "deleteRelation", id: r.id });
  for (const r of draft.relations) {
    const b = baseRel.get(r.id);
    if (!b || r.deleted) continue;
    const idChanged = r.identifying !== b.identifying;
    const cardChanged = r.parentCard !== b.parentCard || r.childCard !== b.childCard;
    const fkChanged = r.dbFk !== b.dbFk;
    if (!idChanged && !cardChanged && !fkChanged && !r.decision) continue;
    const now = curRel.get(r.id);
    if (!now) return gone("관계");
    const set: Record<string, unknown> = {};
    if (idChanged) {
      if (now.identifying !== b.identifying) return conflict("관계 식별 여부");
      set.identifying = r.identifying;
    }
    if (cardChanged) {
      if (now.parentCard !== b.parentCard || now.childCard !== b.childCard) return conflict("관계 기수");
      set.cardinality = { parent: r.parentCard, child: r.childCard };
    }
    if (fkChanged) {
      if (now.dbFk !== b.dbFk) return conflict("관계 DB FK");
      if (r.dbFk && r.crossModel) return fail("다른 모델 표와의 관계는 DB FK 로 만들 수 없습니다.");
      set.dbFk = r.dbFk;
    }
    if (Object.keys(set).length > 0) out.push({ op: "updateRelation", id: r.id, set });
    if (r.decision) {
      if (now.state !== "INFERRED") return conflict("관계 판정");
      out.push({ op: r.decision === "confirm" ? "confirmRelation" : "rejectRelation", id: r.id });
    }
  }
  if (out.length > MAX_BATCH) return fail(`한 번에 ${MAX_BATCH}건까지 적용할 수 있습니다(지금 ${out.length}건). 나눠서 적용하세요.`);
  return { commands: out, error: null };
}
