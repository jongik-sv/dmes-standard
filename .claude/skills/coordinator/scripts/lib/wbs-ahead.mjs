// wbs-ahead.mjs — WBS 「앞으로」 모드의 순수 함수(파일·프로세스를 건드리지 않는다). 정본: ../../references/contract.md §3.3
//   parseBriefTodo  : 착수 지시(brief.md) 「## 할 일」 번호 목록 → 항목 [{id, title, weight}]
//   reportDoneIds   : reports.md 글에서 「<id> … 완료|끝|done」 으로 끝난 항목 id 집합(추정)
//   laneView        : 레인 하나의 항목 보기(등록 항목 또는 brief 추정 항목)
//   closingSteps    : 조정자 마감 단계(closing.md 0~6) 와 끝남 판정
//   renderAhead     : `## 앞으로` 절 줄 배열
// node 18.17 이상, 외부 패키지 없음.

export const SIZE_WEIGHT = { S: 1, M: 2, L: 3 };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cell = (s) => String(s ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
const cut = (s, n) => { const a = Array.from(String(s)); return a.length > n ? `${a.slice(0, n - 1).join('')}…` : a.join(''); };
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * brief.md 글 → 「## 할 일」 절의 첫 번호 목록 항목.
 * 형식(templates/brief.md): `{n}. {id} {제목} (크기 {S|M|L})`. 목록 앞 설명 문단은 건너뛰고, 목록이 시작된 뒤
 * 들여 쓰지 않은 다른 줄(「참고:」 등)이나 제목 줄이 오면 끝. 들여 쓴 하위 줄·코드 블록은 무시한다.
 * id = 첫 낱말이 영문자로 시작하고(12자 이하, 끝 `:` 허용) 숫자를 포함하거나 소문자 4자 이하면 그것, 아니면 번호. 제목 = 괄호 밖 `: ` 앞까지, 60자.
 */
export function parseBriefTodo(text) {
  if (typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/);
  let i = lines.findIndex((l) => /^##\s+할\s*일(\s|$|[(:：])/.test(l));
  if (i < 0) return [];
  const out = [];
  const seen = new Set();
  let fence = false, started = false;
  for (i += 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
    if (fence) continue;
    if (/^#{1,6}\s/.test(l)) break;
    const m = /^(\d+)\.\s+(.*\S)\s*$/.exec(l);
    if (!m) {
      if (started && /^\S/.test(l)) break;
      continue;
    }
    started = true;
    let rest = m[2];
    let weight = 1;
    const sz = /\s*\((?:크기\s*)?([SML])\)(?=\s*$|\s)/.exec(rest);
    if (sz) { weight = SIZE_WEIGHT[sz[1]]; rest = (rest.slice(0, sz.index) + rest.slice(sz.index + sz[0].length)).trim(); }
    let id = m[1];
    const idm = /^([A-Za-z][A-Za-z0-9_.-]{0,11}):?\s+(\S.*)$/.exec(rest);
    if (idm && (/\d/.test(idm[1]) || /^[a-z]{1,4}$/.test(idm[1]))) { id = idm[1]; rest = idm[2]; }
    if (seen.has(id)) id = `${id}#${m[1]}`;
    seen.add(id);
    const title = cut(headOf(rest), 60);
    out.push({ id, title, weight });
  }
  return out;
}

/** 제목 = 괄호 밖 첫 `: ` 앞까지 */
function headOf(s) {
  let depth = 0;
  const a = Array.from(s);
  for (let i = 0; i < a.length; i++) {
    const ch = a[i];
    if ('(（[「'.includes(ch)) depth += 1;
    else if (')）]」'.includes(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && (ch === ':' || ch === '：') && (i + 1 >= a.length || /\s/.test(a[i + 1])) && i > 0) return a.slice(0, i).join('').trim();
  }
  return s.trim();
}

const TS_RE = /^\s*-?\s*\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:?\d{2})?/;
const tokOf = (t) => t.replace(/^[(\[「`'"☑]+|[)\]」`'".:]+$/g, '').toLowerCase();
const DONE_RE = /^(?:완료|끝(?!나면|나고|난\s*뒤|날)|done\b)/i;
const NEG_RE = /^(?:not|안|아직|미)$/i;
const ID_LIKE = /^[a-z][a-z0-9_.-]*\d[a-z0-9_.-]*$/i;   // 모르는 항목 id 꼴(영문으로 시작, 숫자 포함)

/**
 * reports.md 글 → 끝났다고 보이는 항목 id 집합(추정).
 * 줄 앞 시각을 떼고 마디(`,;·|` 앞까지)를 낱말로 나눈 뒤, id 낱말 뒤 4낱말 안(다른 id 가 나오면 멈춤)에 완료·끝·done 이 오면 끝남.
 * 바로 앞이 not·안·아직·미 면 아님(「미완료」 는 낱말 자체가 다름). 한 글자 id 는 바로 다음 낱말만 본다. `☑ <id>` 도 끝남.
 */
export function reportDoneIds(ids, reportsText) {
  const done = new Set();
  if (typeof reportsText !== 'string' || reportsText === '') return done;
  const want = new Map(ids.map((id) => [String(id).toLowerCase(), id]));
  for (const line of reportsText.split(/\r?\n/)) {
    for (const clause of line.replace(TS_RE, '').split(/[,;·|]/)) {
      const raw = clause.split(/\s+/).filter(Boolean);
      const toks = raw.map(tokOf);
      for (let j = 0; j < toks.length; j++) {
        const id = want.get(toks[j]);
        if (id === undefined || done.has(id)) continue;
        if (j > 0 && raw[j - 1] === '☑') { done.add(id); continue; }
        const max = Array.from(toks[j]).length <= 1 ? 1 : 4;
        for (let k = j + 1; k < toks.length && k <= j + max; k++) {
          if (DONE_RE.test(raw[k]) && !NEG_RE.test(raw[k - 1] ?? '')) { done.add(id); break; }
          if (want.has(toks[k]) || ID_LIKE.test(toks[k])) break;   // 다른 항목 id(모르는 것도 id 꼴이면)에서 멈춤
        }
      }
    }
  }
  return done;
}

/** memo.md → 「다음」 한 줄(`## 다음…` 절의 첫 줄 또는 `다음: …` 줄). 없으면 '' */
export function memoNext(text) {
  if (typeof text !== 'string') return '';
  const lines = text.split(/\r?\n/);
  const h = lines.findIndex((l) => /^#{2,4}\s+다음/.test(l));
  if (h >= 0) {
    for (let i = h + 1; i < lines.length && !/^#{1,4}\s/.test(lines[i]); i++) {
      const s = lines[i].replace(/^\s*(?:[-*]|\d+\.)\s*(?:\[[ xX]\]\s*)?/, '').trim();
      if (s !== '') return cut(s, 120);
    }
  }
  for (const l of lines) {
    const m = /^\s*(?:[-*]\s*)?(?:\*\*)?다음(?:\s*단계)?(?:\*\*)?\s*[:：=]\s*(\S.*)$/.exec(l);
    if (m) return cut(m[1].trim(), 120);
  }
  return '';
}

/** reports.md → 마지막 보고 한 줄(앞의 `- ` 뗌). 없으면 '' */
export function lastReport(text) {
  if (typeof text !== 'string') return '';
  const lines = text.split(/\r?\n/).map((l) => l.replace(/^\s*-\s*/, '').trim())
    .filter((l) => l.replace(/^\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:?\d{2})?/, '').trim() !== '');
  return lines.length ? cut(lines[lines.length - 1], 120) : '';
}

/**
 * 레인 하나의 항목 보기.
 * files = {brief, reports, memo}(글 또는 null). merged = merge.history 에 이 레인이 있음.
 * 반환 {mode: 'items'|'brief'|'none', items: [{id, title, weight, done, est, hint}]}
 *   items = 등록 항목(hint = 보고상 끝났지만 done 아님), brief = 추정 항목(레인 closed·머지됨이면 모두 끝, 아니면 보고로 판정), none = 둘 다 없음
 */
export function laneView(lane, files = {}, merged = false) {
  const reg = Array.isArray(lane?.items) ? lane.items : [];
  if (reg.length > 0) {
    const rd = reportDoneIds(reg.map((i) => String(i?.id ?? '')), files.reports);
    return {
      mode: 'items',
      items: reg.map((i) => {
        const done = i?.done === true;
        return { id: String(i?.id ?? ''), title: String(i?.title ?? ''), weight: typeof i?.weight === 'number' && Number.isFinite(i.weight) ? i.weight : 1,
          done, est: false, hint: !done && rd.has(String(i?.id ?? '')) };
      }),
    };
  }
  const bi = parseBriefTodo(files.brief);
  if (bi.length === 0) return { mode: 'none', items: [] };
  const all = lane?.state === 'closed' || merged;
  const rd = all ? null : reportDoneIds(bi.map((i) => i.id), files.reports);
  return { mode: 'brief', items: bi.map((i) => ({ ...i, done: all || rd.has(i.id), est: true, hint: false })) };
}

/** 마감 단계 정의(closing.md 0~6). cond = 해당할 때만 하는 단계(끝나지 않아도 남은 일로 세지 않음) */
export const CLOSING_STEPS = [
  { step: '0', title: '성능 측정(화면 프로파일링·성능 시험)', cond: '화면 레인이 머지됐거나 성능 시험 항목이 있는 회차만' },
  { step: '1', title: '마감 조건 확인' },
  { step: '2', title: '통합 확인' },
  { step: '3', title: 'SUMMARY(run-report.md)' },
  { step: '4', title: '정리 확인(워크트리·세션·감시)' },
  { step: '4.5', title: '측정(run-metrics.mjs)' },
  { step: '5', title: '마감 보고' },
  { step: '6', title: '닫기(close-run)' },
];

/**
 * 마감 단계와 끝남 판정.
 * ctx = {remaining: 남은 항목 수, unknown: 항목을 모르는 열린 레인 수, unmerged: 머지·닫힘 둘 다 아닌 레인 수, files: {runReport, metrics}, events: [{kind, data}]}
 * 공통: 이벤트 `close-step` data.step 이 같으면 끝남. 그 밖 근거는 단계마다 다르다(contract §3.3).
 */
export function closingSteps(st, ctx = {}) {
  const run = isObj(st?.run) ? st.run : {};
  const merge = isObj(st?.merge) ? st.merge : {};
  const lanes = isObj(st?.lanes) ? st.lanes : {};
  const events = Array.isArray(ctx.events) ? ctx.events : [];
  const files = isObj(ctx.files) ? ctx.files : {};
  const marked = new Set(events.filter((e) => e?.kind === 'close-step').map((e) => String(e?.data?.step ?? '')));
  const queue = Array.isArray(merge.queue) ? merge.queue : [];
  const windows = Array.isArray(st?.windows) ? st.windows : [];
  const remaining = Number(ctx.remaining) || 0;
  const laneList = Object.values(lanes);
  return CLOSING_STEPS.map((s) => {
    let done = marked.has(s.step), why = done ? 'close-step 이벤트' : '';
    if (!done) {
      if (s.step === '1') {
        const left = [];
        if (remaining > 0) left.push(`남은 항목 ${remaining}개`);
        if (Number(ctx.unknown) > 0) left.push(`항목 모르는 레인 ${ctx.unknown}개`);
        if (Number(ctx.unmerged) > 0) left.push(`머지 안 된 레인 ${ctx.unmerged}개`);
        if (merge.in_flight) left.push('머지 진행 중');
        if (queue.length) left.push(`머지 대기 ${queue.length}건`);
        if (windows.length) left.push(`열린 창 ${windows.length}개`);
        done = left.length === 0 && laneList.length > 0;
        why = done ? '계산' : left.join(' · ') || '레인 없음';
      } else if (s.step === '3') { done = files.runReport === true; if (done) why = 'run-report.md 있음'; }
      else if (s.step === '4') {
        done = laneList.length > 0 && laneList.every((l) => l?.state === 'closed') && !run.cron_id;
        if (!done) { const open = laneList.filter((l) => l?.state !== 'closed').length; why = [open ? `안 닫힌 레인 ${open}개` : '', run.cron_id ? 'cron 남음' : ''].filter(Boolean).join(' · '); }
        else why = '레인 모두 closed · cron 없음';
      } else if (s.step === '4.5') { done = files.metrics === true; if (done) why = 'metrics.md 있음'; }
      else if (s.step === '6') { done = !!run.closed_at; if (done) why = `closed_at ${run.closed_at}`; }
    }
    return { ...s, done, why };
  });
}

const box = (d) => (d ? '☑' : '☐');
const mergeLine = (m) => {
  if (!isObj(m)) return cell(m);
  const parts = [m.lane, m.branch, m.sha ?? m.expected_tree, m.granted_at ?? m.at].filter((x) => x !== undefined && x !== null && x !== '');
  return parts.map(cell).join(' · ');
};

/**
 * `## 앞으로` 절 줄 배열(끝에 빈 줄 하나).
 * views = Map(레인 → laneView 결과), ahead = {files: {<레인>: {brief, reports, memo}}, events, runFiles: {runReport, metrics}}
 * 시각이 흐르기만 해서 바뀌는 값(「n분 전」 등)은 넣지 않는다 — WBS.md 를 틱마다 다시 쓰지 않게.
 */
export function renderAhead(st, views, ahead = {}) {
  const lanes = isObj(st?.lanes) ? st.lanes : {};
  const merge = isObj(st?.merge) ? st.merge : {};
  const files = isObj(ahead.files) ? ahead.files : {};
  const out = ['## 앞으로', '', '### 레인', ''];
  let remaining = 0, unknown = 0, unmerged = 0;
  const mergedLanes = new Set((Array.isArray(merge.history) ? merge.history : []).map((h) => h?.lane).filter(Boolean));
  const names = Object.keys(lanes);
  if (names.length === 0) out.push('- 레인 없음');
  for (const name of names) {
    const lane = lanes[name];
    const v = views.get(name) ?? { mode: 'none', items: [] };
    const left = v.items.filter((i) => !i.done);
    remaining += left.length;
    if (lane?.state !== 'closed' && !mergedLanes.has(name)) { unmerged += 1; if (v.mode === 'none') unknown += 1; }
    const tag = v.mode === 'brief' ? ' (brief 추정)' : v.mode === 'none' ? ' (항목 미등록 · brief 없음)' : '';
    const st8 = cell(lane?.state ?? '-');
    if (lane?.state === 'closed' && left.length === 0) { out.push(`- **${cell(name)}** (${st8}) — 끝`); continue; }
    const head = v.mode === 'none' ? '남은 항목 알 수 없음' : left.length === 0 ? '항목 모두 끝 — 머지·정리 남음' : `남은 ${left.length}/${v.items.length}`;
    out.push(`- **${cell(name)}** (${st8}) — ${head}${tag}`);
    for (const i of left) out.push(`  - ☐ ${cell(i.id)}. ${cell(i.title)}${i.hint ? ' — 보고상 끝, `item-done` 필요' : ''}`);
    const f = isObj(files[name]) ? files[name] : {};
    const lr = lastReport(f.reports);
    if (lr) out.push(`  - 마지막 보고: ${cell(lr)}`);
    const nx = memoNext(f.memo);
    if (nx) out.push(`  - 다음(메모): ${cell(nx)}`);
    if (isObj(lane?.hold) && lane.hold.reason) out.push(`  - 보류: ${cell(lane.hold.reason)}${lane.hold.until ? ` (~${cell(lane.hold.until)})` : ''}`);
    if (isObj(lane?.question) && lane.question.text) out.push(`  - 질문 대기: ${cell(lane.question.text)}`);
  }
  out.push('', '### 머지', '');
  const queue = Array.isArray(merge.queue) ? merge.queue : [];
  if (merge.in_flight) out.push(`- 진행 중: ${mergeLine(merge.in_flight)}`);
  for (const q of queue) out.push(`- 대기: ${mergeLine(q)}`);
  if (!merge.in_flight && queue.length === 0) out.push('- 없음');
  for (const ph of Array.isArray(st?.wbs?.phases) ? st.wbs.phases : []) {
    for (const it of Array.isArray(ph?.items) ? ph.items : []) if (it?.done !== true) remaining += 1;
  }
  out.push('', '### 조정자 마감 단계', '');
  for (const s of closingSteps(st, { remaining, unknown, unmerged, files: ahead.runFiles, events: ahead.events })) {
    const note = s.done ? (s.why ? ` — ${s.why}` : '') : s.cond ? ` — 해당 시(${s.cond})` : s.why ? ` — ${s.why}` : '';
    out.push(`- ${box(s.done)} ${s.step}. ${s.title}${cell(note)}`);
  }
  out.push('', '### 사용자 결정 대기', '');
  const pu = Array.isArray(st?.pending_user) ? st.pending_user : [];
  const qs = names.filter((n) => isObj(lanes[n]?.question) && lanes[n].question.text);
  for (const p of pu) out.push(`- ${isObj(p) ? `${p.at ? `${cell(p.at)} ` : ''}${cell(p.text)}` : cell(p)}`);
  if (pu.length === 0) out.push('- 없음');
  if (qs.length) out.push(`- 레인 질문(조정자 답 대기): ${qs.map(cell).join(', ')}`);
  out.push('');
  return out;
}
