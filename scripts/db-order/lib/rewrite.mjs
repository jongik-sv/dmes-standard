// V1__baseline.sql 다시 쓰기: create table 안 컬럼 줄의 자리(slot)만 바꾼다.
// 자리마다 원래 쉼표 여부를 지키므로 마지막 컬럼 줄이 옮겨져도 문법이 맞다. 다른 줄은 손대지 않는다.
// 끝에 자체 검사: 표마다 컬럼 줄 본문 집합이 같고, 컬럼 줄이 아닌 줄은 한 글자도 안 바뀌었는지.
import { joinColumnLine, splitColumnLine } from "./ddl.mjs";

// 비교 열쇠 = 줄 전체에서 쉼표 하나만 뺀 것(들여쓰기는 자리 것이라 뺀다). 공백·주석 변화도 잡는다.
const key = (c) => `${c.core}\u0000${c.gap}\u0000${c.comment}`;

export function rewriteV1(text, parsed, rules) {
  const lines = [...parsed.lines];
  const changed = [];
  const errors = [];
  const touched = new Set();
  const creates = parsed.stmts.filter((s) => s.kind === "create");
  // 파서가 읽지 못한 모양이 있으면 줄 단위 다시 쓰기를 믿을 수 없다. 파일 전체를 멈춘다.
  if (parsed.issues.length) return { text, changed, errors: parsed.issues.map((i) => `파서: ${i}`) };
  for (const s of creates) {
    const rule = rules.get(s.table);
    if (!rule) continue;
    const names = s.colLines.map((c) => c.name);
    // 줄 단위로 읽은 컬럼 = 본문 전체를 나눠 읽은 컬럼이어야 한다(여러 줄 정의를 컬럼으로 오인하지 않게).
    if (names.join(",") !== (s.declared ?? []).join(",")) {
      errors.push(`${s.table}: 줄 단위 컬럼 ${names.join(",")} ≠ 본문 컬럼 ${(s.declared ?? []).join(",")}`);
      continue;
    }
    const target = rule.order.map((o) => o.col).filter((c) => names.includes(c));
    if (target.length !== names.length) {
      errors.push(`${s.table}: 규칙에 없는 V1 컬럼 ${names.filter((n) => !target.includes(n)).join(",")}`);
      continue;
    }
    if (target.every((c, i) => c === names[i])) continue;
    // 한 줄에 컬럼 여럿인 표는 줄 단위로 옮길 수 없다. 멈추고 알린다(V1 은 줄 단위 재배열만 한다).
    if (s.colLines.some((c) => c.multi)) {
      errors.push(`${s.table}: 한 줄에 컬럼 여럿인 줄이 있어 줄 단위로 다시 배열할 수 없음`);
      continue;
    }
    const byName = new Map(s.colLines.map((c) => [c.name, c]));
    s.colLines.forEach((slot, i) => {
      const src = byName.get(target[i]);
      // 들여쓰기·쉼표 = 자리 것, 본문·주석 = 옮겨 오는 줄 것.
      lines[slot.line] = joinColumnLine({ ...src, indent: slot.indent }, slot.comma);
      touched.add(slot.line);
    });
    changed.push(s.table);
  }
  // 자체 검사 1: 컬럼 줄이 아닌 줄은 그대로.
  parsed.lines.forEach((l, i) => {
    if (!touched.has(i) && lines[i] !== l) errors.push(`줄 ${i + 1} 이 바뀜`);
  });
  // 자체 검사 2: 표마다 컬럼 줄 본문(쉼표 뺀 정의 + 주석) 멀티셋이 같고 쉼표 자리도 같다.
  for (const s of creates) {
    const before = s.colLines.map(key).sort();
    const after = s.colLines.map((slot) => splitColumnLine(lines[slot.line]));
    if (JSON.stringify(before) !== JSON.stringify(after.map(key).sort())) errors.push(`${s.table}: 컬럼 줄 집합이 바뀜`);
    if (after.some((a, i) => a.comma !== s.colLines[i].comma)) errors.push(`${s.table}: 쉼표 자리가 바뀜`);
  }
  return { text: lines.join("\n"), changed, errors };
}
