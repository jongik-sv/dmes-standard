// MCP·CLI 결과 글(README "결과 글", S2-21). 순수 함수 — 네트워크·파일을 쓰지 않는다.
// 쓰기·거절·변경 글은 WRITE_TEXT_LIMIT 를 넘지 않는다. 넘치면 몸통 줄(변경 줄)을 자르고 마지막 줄(다음 baseRev·다음 할 일)은 남긴다.
// 서버가 아직 싣지 않을 수 있는 칸(byUserId·rowVersion·dryRun·summary)은 없으면 null 로 읽는다(S2-1).
import { describeTargets, modelOf, pickTableIds, tablesOfChange } from "./commands.mjs";
import { isAuditColumn } from "./audit.mjs";
import { tableArgs } from "./model-text.mjs";

/** 쓰기·변경 결과 글 상한(S2-21). getModelText 의 TEXT_LIMIT(40,000)보다 작다 — 한글이 많아 같은 글자 수에 토큰이 더 든다. */
export const WRITE_TEXT_LIMIT = 25000;
/** 경고는 코드마다 묶어 수를 적고, 코드마다 처음 50건만 이름을 적는다(S2-28). */
export const GROUP_LIMIT = 50;
/** NEEDS_CHOICE·INVALID 의 고를 값·해당 항목은 20건까지(README 결과 글). */
export const CHOICE_LIMIT = 20;
/** 값 하나(지금 값·고를 값)를 적는 글자 상한. 넘치면 "…(n자 더)". */
export const VALUE_LIMIT = 200;
/** 고를 값 하나를 적는 글자 상한(20건이 한 줄 LINE_LIMIT 안에 들도록 VALUE_LIMIT 보다 작다). */
export const CHOICE_VALUE_LIMIT = 90;
const LINE_LIMIT = 2000;
/** 고를 값 목록(앞머리·"외 n개" 꼬리를 뺀)의 글자 예산. 넘치면 값을 덜 적고 꼬리의 수를 늘린다. */
const CHOICE_TEXT_BUDGET = 1800;
const CHANGES_PER_DELTA = 10;
const TABLES_IN_LINE = 10;

/** 글에 "undefined"·"null" 이 새지 않게: 비면 "?". */
const q = (v) => v ?? "?";
const pad = (n) => String(n).padStart(2, "0");

/** 글을 n 자로 자르고 남은 길이를 적는다. */
export function clip(text, n = VALUE_LIMIT) {
  const s = String(text ?? "");
  return s.length <= n ? s : `${s.slice(0, n)}…(${s.length - n}자 더)`;
}

/** 한 줄을 LINE_LIMIT 안으로: 자른 뒤 붙는 "…(n자 더)" 까지 합쳐 넘지 않는다. */
function clipLine(s) {
  if (s.length <= LINE_LIMIT) return s;
  const suffix = (rest) => `…(${rest}자 더)`;
  const keep = LINE_LIMIT - suffix(s.length).length; // 접미사 길이의 상한(남은 길이 <= s.length)
  return `${s.slice(0, keep)}${suffix(s.length - keep)}`;
}

/** 값 하나를 JSON 글로(문자열은 따옴표), VALUE_LIMIT 안에서. */
export function valueText(v) {
  return v === null || v === undefined ? "null" : clip(JSON.stringify(v));
}

/** ISO 시각 → "14:20(+09:00)". opts.offsetMin(UTC 에서 동쪽으로 몇 분)은 시험용. */
export function clock(at, opts = {}) {
  const t = Date.parse(at);
  if (Number.isNaN(t)) return String(at ?? "-");
  const off = opts.offsetMin ?? -new Date(t).getTimezoneOffset();
  const d = new Date(t + off * 60000);
  const sign = off >= 0 ? "+" : "-";
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}(${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)})`;
}

/**
 * 블록 목록을 limit 글자 안의 글로 잇는다. 블록은 { lines, more? }. more 가 없는 블록은 그대로 남기고,
 * more 가 있는 블록은 남은 자리만큼 앞에서부터 싣고 more(남은 줄 수, 실은 줄 수) 한 줄을 붙인다(앞 블록이 먼저 자리를 받는다).
 * 줄 하나는 LINE_LIMIT 를 넘지 않는다. 고정 블록만으로 넘치면 마지막 줄을 남기고 앞을 자른다.
 * 반환 { text, kept }: kept[i] = i 번째 블록에서 실은 줄 수.
 */
export function fitBlocksDetail(blocks, limit) {
  const norm = blocks.map((b) => ({ ...b, lines: b.lines.map(clipLine) }));
  const kept = norm.map((b) => b.lines.length);
  const whole = norm.flatMap((b) => b.lines).join("\n");
  if (whole.length <= limit) return { text: whole, kept };
  const size = (lines) => lines.reduce((s, x) => s + x.length + 1, 0);
  let budget = limit + 1 - size(norm.filter((b) => !b.more).flatMap((b) => b.lines));
  budget -= norm.reduce((s, b) => s + (b.more ? b.more(b.lines.length, 0).length + 8 : 0), 0); // 더 줄 자리(숫자 자리 여유 포함)
  norm.forEach((b, i) => {
    if (!b.more) return;
    let n = 0;
    for (const s of b.lines) {
      if (s.length + 1 > budget) break;
      budget -= s.length + 1;
      n++;
    }
    kept[i] = n;
  });
  const out = norm
    .flatMap((b, i) => (!b.more || kept[i] === b.lines.length ? b.lines : [...b.lines.slice(0, kept[i]), b.more(b.lines.length - kept[i], kept[i])]))
    .join("\n");
  if (out.length <= limit) return { text: out, kept };
  const last = out.slice(out.lastIndexOf("\n") + 1);
  return { text: `${out.slice(0, Math.max(0, limit - last.length - 2))}…\n${last}`, kept };
}

/** fitBlocksDetail 의 글만. */
export function fitBlocks(blocks, limit) {
  return fitBlocksDetail(blocks, limit).text;
}

/** 이 변경에서 바뀐 속성. before(보내기 전 모델)가 있으면 값 비교, 없으면 _rev 가 이 rev 인 속성. 이전에 없던 요소는 "새". */
function propsText(c, before, rev) {
  const v = c.value;
  if (!v || typeof v !== "object") return "";
  const bucket = { table: "tables", column: "columns", key: "keys", relation: "relations" }[c.kind];
  if (before && bucket) {
    const old = before[bucket][c.id];
    if (!old) return " (새)";
    const props = Object.keys(v).filter((k) => k !== "_rev" && JSON.stringify(v[k]) !== JSON.stringify(old[k]));
    return props.length ? ` (${props.join(", ")})` : "";
  }
  const props = Object.entries(v._rev ?? {})
    .filter(([, pr]) => pr && pr.rev === rev)
    .map(([k]) => k);
  return props.length ? ` (${props.join(", ")})` : "";
}

function changeText(c, labels, before, rev) {
  let name = labels.get(c.id) ?? c.id;
  if (c.op === "delete" && name === c.id) name = `${c.id}(지움)`;
  return `${c.kind} ${c.op} ${name}${c.op === "delete" ? "" : propsText(c, before, rev)}`;
}

/** 값의 모든 속성이 이 rev 에서 정해졌나(_rev 가 비면 알 수 없으므로 참). 이름만 바꾼 표·논리명만 고친 컬럼은 거짓이다. */
const createdAt = (value, rev) => Object.values(value?._rev ?? {}).every((pr) => pr?.rev === rev);

/**
 * 변경 목록 → 줄 목록. 새 표(addTable)와 같이 생긴 감사 컬럼 upsert 2건 이상은 표마다 한 줄로 접는다(S2-30):
 * "column upsert TB_X.(감사 컬럼 8개 추가)".
 * - before(보내기 전 모델)가 있으면: 보내기 전에 없던 표.
 * - before 가 없으면(getChangesSince): 같은 목록에 표 upsert 가 있고, 그 표의 columnOrder 끝이 이 감사 컬럼들이고,
 *   표와 컬럼의 모든 속성이 이 rev 에서 정해진 경우만. 이름만 바꾼 표나 감사 컬럼의 값만 고친 경우는 접지 않는다.
 */
export function changeLinesOf(changes, labels, before, rev) {
  const auditOf = (c) => (c.kind === "column" && c.op === "upsert" && isAuditColumn(c.value?.phys) ? c.value.table : null);
  const newTables = new Set(
    changes
      .filter((c) => c.kind === "table" && c.op === "upsert" && !(before && before.tables[c.id]))
      .map((c) => c.id),
  );
  if (!before) {
    for (const tc of changes) {
      if (!newTables.has(tc.id) || tc.kind !== "table") continue;
      const mine = changes.filter((c) => auditOf(c) === tc.id);
      const order = tc.value?.columnOrder;
      const tail = Array.isArray(order) ? order.slice(Math.max(0, order.length - mine.length)) : [];
      const ok =
        mine.length >= 2 &&
        createdAt(tc.value, rev) &&
        mine.every((c) => createdAt(c.value, rev)) &&
        mine.length === tail.length &&
        mine.every((c) => tail.includes(c.id));
      if (!ok) newTables.delete(tc.id);
    }
  }
  const fold = (c) => {
    const t = auditOf(c);
    return t && newTables.has(t) ? t : null;
  };
  const counts = new Map();
  for (const c of changes) {
    const t = fold(c);
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const done = new Set();
  const out = [];
  for (const c of changes) {
    const t = fold(c);
    if (t && counts.get(t) >= 2) {
      if (!done.has(t)) {
        done.add(t);
        out.push(`column upsert ${labels.get(t) ?? t}.(감사 컬럼 ${counts.get(t)}개 추가)`);
      }
    } else out.push(changeText(c, labels, before, rev));
  }
  return out;
}

/** 접속자 목록에서 세션 → 사용자. CLAIMED 경고에는 사용자 칸이 없다(claimedBy 는 세션이다). */
function userOf(presence, session) {
  return (presence ?? []).find((p) => p.session === session)?.userId ?? null;
}

/** 경고 묶음: [요약 줄, CLAIMED 줄들], [STD 등 줄들]. 코드마다 GROUP_LIMIT 건까지 이름을 적는다. */
function warningBlocks(warnings, labels, presence, opts) {
  if (!warnings.length) return { head: [], rest: [] };
  const groups = new Map();
  for (const w of warnings) {
    const code = w?.code ?? "?";
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(w);
  }
  const codes = [...groups.keys()].sort();
  const head = [`경고: ${codes.map((c) => `${c} ${groups.get(c).length}`).join(", ")}`];
  const rest = [];
  for (const code of codes) {
    const list = groups.get(code);
    const into = code === "CLAIMED" ? head : rest;
    for (const w of list.slice(0, GROUP_LIMIT)) {
      const name = labels.get(w.elementId) ?? w.elementId ?? "-";
      if (code === "CLAIMED") {
        const user = userOf(presence, w.claimedBy);
        const until = w.expiresAt ? `, ${clock(w.expiresAt, opts)}까지` : "";
        into.push(`${name} 작업 중: ${w.claimedBy ?? "?"}${user ? ` (${user})` : ""}${until}`);
      } else into.push(`${code} ${name}: ${w.message ?? ""}`);
    }
    if (list.length > GROUP_LIMIT) into.push(`… ${code} ${list.length - GROUP_LIMIT}건 더(이름은 처음 ${GROUP_LIMIT}건만 적는다)`);
  }
  return { head, rest };
}

/** baseRev 뒤 다른 세션 변경 한 줄. others = { reload, deltas }(이미 다른 세션·rev 범위로 거른 것). */
export function othersLine(others, baseRev, view) {
  if (!others) return null;
  if (others.reload) {
    return `baseRev ${baseRev} 뒤 변경을 다 읽지 못했습니다(500건이 넘거나 DRAFT 가 바뀌었습니다). getModelText 로 다시 읽으세요.`;
  }
  const ds = others.deltas ?? [];
  if (!ds.length) return null;
  const range = new Map();
  for (const d of ds) {
    const key = d.session ?? "?";
    const r = range.get(key) ?? { min: d.rev, max: d.rev };
    range.set(key, { min: Math.min(r.min, d.rev), max: Math.max(r.max, d.rev) });
  }
  const sessions = [...range].map(([s, r]) => `${s} rev ${r.min === r.max ? r.min : `${r.min}~${r.max}`}`).join(", ");
  const m = modelOf(view);
  const changes = ds.flatMap((d) => d.changes ?? []);
  const tableIds = [...new Set(changes.flatMap((c) => tablesOfChange(m, c)))];
  const labels = describeTargets(view, tableIds, changes);
  const names = [...new Set(tableIds.map((id) => labels.get(id)))].sort();
  const shown = names.slice(0, TABLES_IN_LINE).join(", ") + (names.length > TABLES_IN_LINE ? ` 외 ${names.length - TABLES_IN_LINE}개` : "");
  return `baseRev 뒤 다른 세션 변경 ${ds.length}건: ${sessions}${shown ? `, ${shown}` : ""}. getChangesSince(${baseRev}) 로 확인하세요.`;
}

function who(userId, session) {
  return userId ? `${userId} (세션 ${session ?? "?"})` : `세션 ${session ?? "?"}`;
}

/** 거절 줄: [자세한 줄들], 다음 할 일 한 줄. */
function rejectionDetail(rej, ctx) {
  const lines = [];
  let next;
  const choices = Array.isArray(rej.choices) ? rej.choices : rej.choices === null || rej.choices === undefined ? [] : [rej.choices];
  // 값은 CHOICE_LIMIT 건·CHOICE_TEXT_BUDGET 자까지 적고 못 적은 수는 꼬리에 정확히 적는다(줄 자르기에 꼬리가 잘리지 않게).
  const choiceText = () => {
    const parts = [];
    let used = 0;
    for (const v of choices.slice(0, CHOICE_LIMIT)) {
      const part = v === null || v === undefined ? "null" : clip(JSON.stringify(v), CHOICE_VALUE_LIMIT);
      if (parts.length && used + part.length + 2 > CHOICE_TEXT_BUDGET) break;
      parts.push(part);
      used += part.length + 2;
    }
    return parts.join(", ") + (choices.length > parts.length ? ` 외 ${choices.length - parts.length}개` : "");
  };
  if (rej.code !== "CONFLICT" && rej.message) lines.push(`내용: ${rej.message}`);
  switch (rej.code) {
    case "CONFLICT":
      lines.push(`바꾼 사람: ${who(rej.byUserId, rej.bySession)} rev ${rej.byRev ?? "?"} · 지금 값: ${valueText(rej.current)}`);
      next =
        ctx.op === "undo"
          ? `다음: rev ${ctx.undoRev} 뒤에 같은 속성이 바뀌어 되돌릴 수 없습니다. getChangesSince(${ctx.undoRev}) 로 뒤 변경을 읽고, 필요하면 apply 로 직접 고치세요.`
          : `다음: getChangesSince(${ctx.baseRev}) 로 바뀐 값을 읽고, 묶음 전체를 baseRev ${rej.byRev ?? "(마지막으로 읽은 rev)"} 이상으로 다시 보내세요.`;
      break;
    case "NOT_FOUND":
      lines.push(`지운 사람: ${who(rej.byUserId, rej.bySession)} rev ${rej.byRev ?? "?"}`);
      next = `다음: getChangesSince(${ctx.baseRev ?? ctx.undoRev}) 로 지운 변경을 확인하고, 그 요소를 뺀 묶음을 다시 보내세요.`;
      break;
    case "NEEDS_CHOICE":
      lines.push(`고를 수 있는 값 ${choices.length}개: ${choiceText()}`);
      next = "다음: addRelation 이면 onNameClash 를 REUSE(있는 컬럼 쓰기) 또는 RENAME(새 이름)으로 주고, 이름을 골라야 하면 phys 에 위 값 하나를 넣어 묶음을 다시 보내세요.";
      break;
    case "NOT_EDITOR":
      lines.push(`소유자: ${rej.ownerId ?? "없음"} · 서버가 보는 사용자(ERD_USER): ${ctx.user ?? "?"}`);
      next = rej.ownerId
        ? `다음: 소유자에게 execute kind=ADD_EDITOR 로 ERD_USER 값(${ctx.user ?? "?"})을 등록해 달라고 하세요.`
        : `다음: 이 버전에 소유자가 없습니다. 사람이 DRAFT 를 선점(lock)한 뒤, 소유자에게 execute kind=ADD_EDITOR 로 ERD_USER 값(${ctx.user ?? "?"})을 등록해 달라고 하세요.`;
      break;
    default:
      if (choices.length) lines.push(`해당 항목 ${choices.length}개: ${choiceText()}`);
      next = `다음: ${rej.hint ?? "입력을 고쳐 다시 보내세요."}`;
  }
  return { lines, next };
}

/**
 * apply·confirmRelation·rejectRelation·undo 결과 글. 반환 { text, isError }.
 * ctx: { op: "apply"|"undo", commands(보낸 명령, 해석 뒤), view(보내기 전 view), baseRev, undoRev, undone(되돌린 델타 또는 null),
 *        dryRun(요청), session, user, others, offsetMin?, limit? }
 */
export function formatWriteResult(result, ctx) {
  const r = result ?? {};
  const rej = r.rejection ?? null;
  const changes = r.changes ?? [];
  const warnings = r.warnings ?? [];
  const ignored = ctx.dryRun === true && r.applied === true && r.dryRun !== true; // 서버가 dryRun 을 몰라 저장했다
  const dry = ctx.dryRun === true && !ignored;
  const before = modelOf(ctx.view);
  const ids = [...changes.map((c) => c.id), ...warnings.map((w) => w?.elementId), rej?.elementId].filter((x) => typeof x === "string");
  const labels = describeTargets(ctx.view, [...new Set(ids)], changes);
  const undo = ctx.op === "undo";
  const where = undo ? `되돌리기 rev ${q(ctx.undoRev)}` : `baseRev ${q(ctx.baseRev)}`;
  const stats = `변경 ${changes.length} · 경고 ${warnings.length} · 세션 ${q(ctx.session)}`;

  const head = [];
  let next;
  if (rej) {
    const cmd = undo ? null : ctx.commands?.[rej.commandIndex];
    const el = rej.elementId ? ` ${labels.get(rej.elementId) ?? rej.elementId}${rej.property ? `.${rej.property}` : ""}` : "";
    // NOT_EDITOR 는 묶음 전체에 걸린다(서버는 commandIndex 0 을 싣는다) — 명령을 짚지 않는다.
    const target =
      rej.code === "NOT_EDITOR"
        ? null
        : undo
          ? `되돌리기 rev ${q(ctx.undoRev)}${el}`
          : `명령 #${(rej.commandIndex ?? 0) + 1}${cmd ? ` ${cmd.op}` : ""}${el}`;
    if (dry) head.push(`시험 실행(저장 안 함) · 거절 ${rej.code}`, !target || undo ? (target ?? where) : `${target} · ${where}`);
    else head.push(`거절 ${rej.code} · ${target ? `${target} · ` : ""}저장한 것 없음`);
    const d = rejectionDetail(rej, ctx);
    head.push(...d.lines);
    next = [d.next];
  } else if (ignored) {
    head.push(`주의: 서버가 시험 실행(dryRun)을 지원하지 않아 실제로 반영했습니다 · 반영 rev ${q(r.rev)} (${where}) · ${stats}`);
    next = [`다음: 저장을 원하지 않았다면 undo(rev=${q(r.rev)}) 로 되돌리세요.`, `다음 baseRev: ${q(r.rev)}`];
  } else if (dry) {
    head.push("시험 실행(저장 안 함) · 통과", `지금 rev ${q(r.rev)} (${where}) · ${stats}`);
    next = [undo ? "다음: dryRun 없이 다시 부르면 되돌린다(CLI 는 --apply)." : `다음: dryRun 없이 같은 묶음을 보내면 저장한다(CLI 는 --apply). baseRev 는 ${ctx.baseRev} 그대로 쓴다.`];
  } else {
    head.push(`반영 rev ${q(r.rev)} (${where}) · ${stats}`);
    next = [`다음 baseRev: ${q(r.rev)}`];
  }
  if (undo && !rej) {
    const d = ctx.undone;
    head.push(
      d
        ? `되돌린 변경: rev ${ctx.undoRev} · ${who(d.userId, d.session)} · ${(d.changes ?? []).length}건`
        : `되돌린 변경: rev ${ctx.undoRev} (누구의 변경인지 읽지 못했습니다)`,
    );
  }

  const changeLines = rej ? [] : changeLinesOf(changes, labels, before, r.rev);
  const w = warningBlocks(warnings, labels, ctx.view?.presence, ctx);
  const others = othersLine(ctx.others, ctx.baseRev, ctx.view);
  const moreFrom = ctx.baseRev ?? (r.rev ?? 1) - 1;
  const text = fitBlocks(
    [
      { lines: head },
      {
        lines: changeLines,
        // 시험 실행은 저장하지 않았으므로 getChangesSince 로는 읽을 수 없다.
        more: (n) => (dry ? `… ${n}줄 더 있습니다. 묶음을 나눠 시험 실행하세요.` : `… ${n}줄 더 있습니다. getChangesSince(${moreFrom}) 로 나눠 읽으세요.`),
      },
      { lines: w.head },
      { lines: w.rest, more: (n) => `… 경고 ${n}줄 더 있습니다.` },
      { lines: others ? [others] : [] },
      { lines: next },
    ],
    ctx.limit ?? WRITE_TEXT_LIMIT,
  );
  return { text, isError: rej !== null || ignored };
}

/** 이름 풀기 실패 글(서버를 부르지 않았다). commands 를 주면 명령 번호와 op 를 적는다. */
export function formatResolveErrors(errors, commands, limit = WRITE_TEXT_LIMIT) {
  const lines = errors.map((e) => {
    const where = commands && e.index >= 0 && commands[e.index] ? `명령 #${e.index + 1} ${commands[e.index].op} ${e.field}` : e.field;
    return `${where} ${JSON.stringify(e.value)}: ${e.message}${e.near?.length ? ` · 비슷한 이름: ${e.near.join(", ")}` : ""}`;
  });
  return fitBlocks(
    [
      { lines: [`이름 풀기 실패 ${errors.length}건 · 서버에 보내지 않음(저장한 것 없음)`] },
      { lines, more: (n) => `… ${n}줄 더 있습니다.` },
      { lines: ["다음: getModelText(tables=[…]) 로 물리명을 확인하고 묶음 전체를 다시 보내세요. id(t-·c-·k-·r-·d-)를 그대로 써도 됩니다."] },
    ],
    limit,
  );
}

/**
 * claimTable·releaseTable 글. rows = [{ label, result }], kind "CLAIM" | "RELEASE".
 * CLAIM 의 ok:false 는 오류가 아니다. claimedBy 가 null 이면(두 세션이 같은 때 처음 표시) 쥔 세션을 모를 뿐이다(README ErdClaimResult).
 */
export function formatClaimText(kind, rows, errors, ctx) {
  const head =
    kind === "CLAIM"
      ? `작업 중 표시 ${rows.length}개 · 세션 ${ctx.session} · 600초 뒤 저절로 풀린다(오래 걸리면 다시 부른다)`
      : `작업 중 표시 풀기 ${rows.length}개 · 세션 ${ctx.session}`;
  const lines = rows.map(({ label, result: res }) => {
    if (kind === "RELEASE") return `${label} 놓음`;
    const r = res ?? {};
    if (r.ok) return `${label} 잡음${r.expiresAt ? ` · ${clock(r.expiresAt, ctx)}까지` : ""}`;
    if (!r.claimedBy) return `${label} 못 잡음: 다른 세션이 같은 때 잡았습니다(누구인지 아직 모릅니다). 잠시 뒤 다시 부르세요.`;
    return `${label} 못 잡음: ${r.claimedBy}${r.userId ? ` (${r.userId})` : ""} 가 ${r.expiresAt ? `${clock(r.expiresAt, ctx)}까지 ` : ""}작업 중`;
  });
  const errs = errors.map((e) => `없는 표 ${JSON.stringify(e.value)}: ${e.message}${e.near?.length ? ` · 비슷한 이름: ${e.near.join(", ")}` : ""}`);
  return {
    text: fitBlocks([{ lines: [head] }, { lines: [...lines, ...errs], more: (n) => `… ${n}줄 더 있습니다.` }], ctx.limit ?? WRITE_TEXT_LIMIT),
    isError: rows.length === 0 && errors.length > 0,
  };
}

/**
 * getChangesSince 글. 반환 { text, raw }. raw 는 ctx.raw 일 때만 JSON 글(아니면 null). 둘을 합쳐 limit 를 넘지 않는다.
 * ctx: { view(지금 view, 이름 풀기), sinceRev, mySession, session(이 세션만), excludeMine, tables, raw, limit? }
 */
export function formatChangesText(cv, ctx) {
  const limit = ctx.limit ?? WRITE_TEXT_LIMIT;
  const textLimit = ctx.raw ? Math.floor(limit * 0.4) : limit;
  if (cv?.reload) {
    const text = `# reload: rev ${ctx.sinceRev} 이후 변경을 이어 줄 수 없습니다(DRAFT 를 새로 만들었거나 지웠거나, 500건을 넘었습니다). 현재 rev ${cv.rev}. getModelText 로 모델 전체를 다시 읽으세요.`;
    return { text, raw: ctx.raw ? JSON.stringify({ rev: cv.rev, reload: true, deltas: [] }) : null };
  }
  const all = cv?.deltas ?? [];
  const m = modelOf(ctx.view);
  const names = tableArgs(ctx.tables);
  const picked = names.length ? pickTableIds(ctx.view, names) : null;
  const shown = all.filter(
    (d) =>
      (!ctx.session || d.session === ctx.session) &&
      !(ctx.excludeMine && d.session === ctx.mySession) &&
      (!picked || (d.changes ?? []).some((c) => tablesOfChange(m, c).some((t) => picked.ids.has(t)))),
  );
  const filters = [
    ctx.session ? `세션 ${ctx.session} 만` : null,
    ctx.excludeMine ? `내 세션 ${ctx.mySession} 뺌` : null,
    names.length ? `표 ${names.join(",")}` : null,
  ].filter(Boolean);
  const head = [`# rev ${ctx.sinceRev} 이후 변경 ${all.length}건 (현재 rev ${q(cv?.rev)})${filters.length ? ` · 보인 것 ${shown.length}건(${filters.join(", ")})` : ""}`];
  if (picked?.missing.length) head.push(`없는 표: ${picked.missing.join(", ")}`);
  const allChanges = shown.flatMap((d) => d.changes ?? []);
  const labels = describeTargets(ctx.view, [...new Set(allChanges.map((c) => c.id))], allChanges);
  const lines = shown.map((d) => {
    const cs = d.changes ?? [];
    const parts = changeLinesOf(cs, labels, null, d.rev);
    const what = parts.slice(0, CHANGES_PER_DELTA);
    const rest = parts.length > CHANGES_PER_DELTA ? ` 외 ${parts.length - CHANGES_PER_DELTA}건` : "";
    return `rev ${q(d.rev)} ${q(d.userId)}/${q(d.session)} ${q(d.source)}: ${what.join(", ") || "(변경 없음)"}${rest}`;
  });
  const full = [...head, ...lines, `다음 baseRev: ${q(cv?.rev)}`].join("\n");
  let text = full;
  let keptDeltas = shown.length;
  if (full.length > textLimit) {
    const more = (n, k) => `… ${n}줄 더 있습니다. getChangesSince(${k ? shown[k - 1].rev : ctx.sinceRev}) 로 나눠 읽으세요.`;
    const fit = fitBlocksDetail([{ lines: head }, { lines, more }], textLimit);
    text = fit.text;
    keptDeltas = fit.kept[1];
  }
  if (!ctx.raw) return { text, raw: null };
  const room = limit - text.length - 1;
  let ds = shown.slice(0, keptDeltas);
  let raw = JSON.stringify({ rev: cv?.rev, reload: false, deltas: ds });
  while (raw.length > room && ds.length) {
    ds = ds.slice(0, Math.max(0, Math.floor(ds.length * 0.8)));
    raw = JSON.stringify({ rev: cv?.rev, reload: false, deltas: ds, truncated: shown.length - ds.length });
  }
  return { text, raw: raw.length <= room ? raw : JSON.stringify({ rev: cv?.rev, truncated: shown.length }) };
}
