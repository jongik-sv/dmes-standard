// 재배치 V 파일: 규칙 순서로 INVISIBLE → VISIBLE 해 컬럼을 다시 줄 세운다(Oracle 12c+).
// INVISIBLE 컬럼은 순서에서 빠지고 VISIBLE 로 돌아오면 맨 끝에 붙는다. 그래서 앞에 둘 컬럼(keep)만 남기고
// 나머지를 모두 숨긴 뒤 규칙 순서대로 하나씩 보이면 규칙 순서가 된다. 다시 돌려도 결과가 같다(멱등).
// keep = PK 컬럼(두 모양 모두에서 PK 제약 순서로 이미 앞에 있을 때). 아니면 그렇게 맞는 앞부분만(최소 1개).

/** 모양(shape) 안에서 cols 의 상대 순서가 그대로인지. */
const relativeOk = (shape, cols) => {
  const idx = cols.map((c) => shape.cols.indexOf(c));
  return idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1]));
};

/** 앞에 남겨 둘 컬럼. 규칙 순서의 PK 머리 중 모든 모양에서 상대 순서가 맞는 가장 긴 앞부분(최소 1개). */
export function keepColumns(rule, shapes) {
  const pk = rule.order.filter((o) => o.group === "pk").map((o) => o.col);
  const head = pk.length ? pk : [rule.order[0].col];
  let k = head.length;
  while (k > 1 && !shapes.every((sh) => relativeOk(sh, head.slice(0, k)))) k--;
  return head.slice(0, k);
}

/** 재배치가 필요한 표: 새 DB(V1 부터)·기존 DB(base) 모양 중 하나라도 규칙과 다른 표. 지운 표는 뺀다. */
export function relocationTargets(schema) {
  const out = [];
  for (const [t, rule] of schema.rules) {
    const want = rule.order.map((o) => o.col);
    const shapes = [schema.pre.get(t), schema.basePre?.get(t)].filter((x) => x && !x.dropped);
    if (!shapes.length) continue;
    if (shapes.every((sh) => sh.cols.length === want.length && sh.cols.every((c, i) => c === want[i]))) continue;
    const keep = keepColumns(rule, shapes);
    const move = want.filter((c) => !keep.includes(c));
    const pkMoved = rule.order.filter((o) => o.group === "pk" && move.includes(o.col)).map((o) => o.col);
    out.push({ table: t, keep, move, pkMoved });
  }
  return out;
}

export function relocationSql(schema, targets) {
  const out = [];
  out.push("-- ============================================================================");
  out.push(`-- ${schema.key.toUpperCase()} 컬럼 순서 재배치 — 자동 생성 파일. 직접 고치지 말고 생성기를 다시 돌린다.`);
  out.push("--   생성기: node scripts/db-order/gen.mjs relocate --base <기존 DB 기준 ref> --write");
  out.push("--   규칙: PK(PK 제약 순서) → 엔티티 필드 선언 순서 → 버전(VER·AUD_VER·ROW_VERSION) → 감사 8개(scripts/db-order/lib/rule.mjs)");
  out.push("-- 방식: 표마다 앞에 둘 PK 컬럼만 남기고 나머지를 INVISIBLE 로 숨긴 뒤 규칙 순서대로 하나씩 VISIBLE 로 되돌린다.");
  out.push("--   VISIBLE 로 돌아온 컬럼은 맨 끝에 붙으므로 결과 = 규칙 순서. 데이터·타입·NULL·기본값·제약·인덱스는 그대로다.");
  out.push("--   새 DB(V1 부터 적용)·기존 DB 모두 이 파일 뒤 규칙 순서가 된다. 다시 적용해도 결과가 같다(멱등).");
  out.push("-- 운영(Flyway 끔): DBA 가 앞 V 파일 다음 차례로 이 파일을 그대로 적용한다.");
  out.push("-- ============================================================================");
  for (const t of targets) {
    out.push("");
    out.push(`-- ${t.table}: 앞에 남김 ${t.keep.join(",")}${t.pkMoved.length ? ` (PK 상대 순서 보정: ${t.pkMoved.join(",")})` : ""}`);
    out.push(`alter table ${t.table} modify (${t.move.map((c) => `${c} invisible`).join(", ")});`);
    for (const c of t.move) out.push(`alter table ${t.table} modify (${c} visible);`);
  }
  // 표 DDL 로 무효가 된 뷰를 바로 다시 컴파일한다(쓰일 때 자동 컴파일되지만 INVALID 로 남지 않게).
  if (schema.views?.length) {
    out.push("");
    out.push("-- 뷰 다시 컴파일");
    for (const v of schema.views) out.push(`alter view ${v} compile;`);
  }
  out.push("");
  return out.join("\n");
}
