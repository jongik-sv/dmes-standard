// scripts/usage-band.sh 의 node 판(스위치 COORD_JS_USAGE_BAND — js-bridge.sh _jsb_exec).
//   stdout 한 줄: `BAND <G|Y|O|R|UNKNOWN> five=… week=… week_allow=… src=… at=… five_reset=… week_reset=… raw=…`
//   설정 usage.sources 순서대로 읽어 처음으로 유효한 출처 하나를 쓴다(cache · limits-dir · coord-dump). 읽기 전용, 종료 코드 0(잘못된 인자는 2).
// bash 판이 정답이다. 옮기며 같게 만든 것:
//   · jq 의 `// ""`·tostring·@tsv(탭·줄바꿈·역슬래시 이스케이프)와, 문서가 여럿이거나 오류가 있으면 그 파일은 못 쓴 것으로 보는 동작
//   · awk(onetrue-awk) 의 -v 값 비교: 숫자 꼴이면 수, 아니면 문자열(strcmp)  · printf "%d" 는 0 쪽 버림, 2^63-1 에서 멈춤
//   · bash 3.2 의 $(( )): 앞에 0 이 붙은 글은 8진수, 틀린 자리는 오류로 그 시점의 최상위 명령(여기서는 출처 while 루프)이 버려진다(스크립트는 계속), 64비트 감김
//   · `[ a -gt b ]`: 10진 정수 글이 아니거나 64비트 밖이면 거짓
// node 18.17 이상, 외부 패키지 없음.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as J from './lib/jq-json.mjs';
import { CoordDie, Ctx, cfgLoad, cfgSub, epochToIso, expand, isoToEpoch, nowEpoch } from './lib/common.mjs';
import { statMtime } from './lib/compat.mjs';
import { ArithAbort, arithVal, awkGe, awkInt, cmpInt, coordDefaultRepo, cutF, cutRest, stripNl, step, strOr, testInt, tsvEsc, walk } from './lib/common-ext.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';

export { awkGe, awkInt, arithVal, testInt };
export { awkNum } from './lib/common-ext.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const isnum = (s) => /^[0-9]+(?:\.[0-9]+)?$/.test(s);

/** coord_cfg 가 문서에서 읽는 글(절 이름 또는 [..., 숫자]). 오류는 '' */
function cfgAt(c, segs) {
  const { docs } = cfgLoad(c);
  let out = '';
  for (const d of docs().values) {
    try {
      const a = J.alt(walk(d, segs), undefined);
      if (a !== undefined) out += `${typeof a === 'string' || typeof a === 'number' || typeof a === 'boolean' || a instanceof J.JNum ? J.tostring(a) : J.tojson(a)}\n`;
    } catch (e) { if (!(e instanceof J.JqError)) throw e; c.log(`jq: error: ${e.message}`); }
  }
  return stripNl(out);
}

/** `.usage.sources | length` 의 coord_cfg_json 결과글(오류면 ''). */
function sourcesLen(c) {
  const { docs } = cfgLoad(c);
  let out = '';
  for (const d of docs().values) {
    try {
      const v = walk(d, ['usage', 'sources']);
      let n;
      if (v === null) n = '0';
      else if (Array.isArray(v)) n = String(v.length);
      else if (v instanceof Map) n = String(v.size);
      else if (typeof v === 'string') n = String(Array.from(v).length);
      else if (typeof v === 'number' || v instanceof J.JNum) n = J.numberText(Math.abs(Number(v)));
      else throw new J.JqError(`${J.typeName(v)} (${J.tojson(v)}) has no length`, 5);
      out += `${n}\n`;
    } catch (e) { if (!(e instanceof J.JqError)) throw e; }
  }
  return stripNl(out);
}

const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

/** jq 로 파일의 각 문서를 행으로 바꾼다. 오류(파싱·인덱스)가 한 번이라도 나면 null(= jq 종료 코드 ≠ 0). */
function jqRows(path, rowOf) {
  let text;
  try { text = readFileSync(path, 'latin1'); } catch { return null; }   // jq 가 파일을 못 읽으면 종료 코드 2
  const { values, error } = J.parseStreamPartial(text);
  const rows = [];
  let bad = error !== null;
  for (const d of values) {
    try { const r = rowOf(d); if (r !== undefined) rows.push(r); } catch (e) { if (!(e instanceof J.JqError)) throw e; bad = true; }
  }
  return bad ? null : rows.join('\n');
}

const cacheRow = (d) => [
  strOr(walk(d, ['five_hour', 'utilization'])), strOr(walk(d, ['seven_day', 'utilization'])),
  strOr(walk(d, ['five_hour', 'resets_at'])), strOr(walk(d, ['seven_day', 'resets_at'])),
].map(tsvEsc).join('\t');

const atOf = (v) => {
  if (typeof v === 'number' || v instanceof J.JNum) {
    const n = Number(v);
    return J.numberText(Math.floor(n > 100000000000 ? Math.floor(n / 1000) : n));
  }
  return J.tostring(v);
};
const limitsRow = (d) => {
  const at = walk(d, ['at']);
  const rl = walk(d, ['rate_limits']);
  if (rl === null) return undefined;
  const f = (...s) => strOr(walk(d, ['rate_limits', ...s]));
  return [atOf(at), f('five_hour', 'used_percentage'), f('seven_day', 'used_percentage'), f('five_hour', 'resets_at'), f('seven_day', 'resets_at')].map(tsvEsc).join('\t');
};

/** 출처 하나 읽기 → 전역 r_* (값 또는 ''), 쓸 수 없으면 null */
function readSrc(c, kind, path, now, maxAge) {
  let five = '', week = '', fr = '', wr = '', at = '';
  const iso = (s) => stripNl(isoToEpoch(c, s));
  if (kind === 'cache') {
    if (!isFile(path)) return null;
    const row = jqRows(path, cacheRow);
    if (row === null) return null;
    five = cutF(row, 1); week = cutF(row, 2);
    fr = iso(cutF(row, 3)); wr = iso(cutF(row, 4));
    at = statMtime(path) ?? '';
  } else if (kind === 'limits-dir' || kind === 'coord-dump') {
    if (!isDir(path)) return null;
    let names;
    try { names = readdirSync(path); } catch { names = []; }
    names = names.filter((n) => n.endsWith('.json') && !n.startsWith('.')).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    let best = '';
    for (const name of names) {
      const f = join(path, name);
      if (!isFile(f)) continue;
      if (name.endsWith('.settings.json')) continue;
      let row = jqRows(f, limitsRow);
      if (row === null || row === '') continue;
      let a = cutF(row, 1);
      if (a === '' || /[^0-9]/.test(a)) { a = iso(a); row = `${a}${cutRest(row)}`; }
      if (a === '') continue;
      if (best === '' || cmpInt(a, cutF(best, 1), 'gt')) best = row;
    }
    if (best === '') return null;
    at = cutF(best, 1); five = cutF(best, 2); week = cutF(best, 3); fr = cutF(best, 4); wr = cutF(best, 5);
  } else {
    c.log(`모르는 usage source kind: ${kind}`);
    return null;
  }
  if (!isnum(five)) five = '';
  if (!isnum(week)) week = '';
  if (/[^0-9]/.test(fr)) fr = '';
  if (/[^0-9]/.test(wr)) wr = '';
  if (at === '' || /[^0-9]/.test(at)) return null;
  if (BigInt.asIntN(64, BigInt(now) - arithVal(at)) > BigInt.asIntN(64, arithVal(maxAge) * 60n)) {
    if (fr === '' || cmpInt(fr, String(now), 'le')) five = '';
    if (wr === '' || cmpInt(wr, String(now), 'le')) week = '';
  }
  if (five === '' && week === '') return null;
  return { five, week, fr, wr, at };
}

const intOf = (s) => (s === '' ? '-' : awkInt(Number(s) + 0.5));

export function usageBand(c, now) {
  let maxAge = cfgSub(c, '.usage.max_age_min');
  if (maxAge === '' || /[^0-9]/.test(maxAge)) maxAge = '30';
  const nText = sourcesLen(c);
  const n = testInt(nText === '' ? '0' : nText);   // `${n:-0}`. 정수 글이 아니면 [ -lt ] 가 거짓
  let found = null, src = '';
  for (let i = 0; n !== null && BigInt(i) < n; i++) {
    const kind = cfgAt(c, ['usage', 'sources', i, 'kind']);
    const path = resolve(c.cwd, expand(cfgAt(c, ['usage', 'sources', i, 'path']), c.env));
    let r;
    try { r = readSrc(c, kind, path, now, maxAge); }
    catch (e) { if (e instanceof ArithAbort) { c.log(`bash: ${e.message}`); break; } throw e; }   // $(( )) 오류는 이 while 명령 전체를 버린다(스크립트는 계속)
    if (r) { found = r; src = kind; break; }
  }
  if (!found) return 'BAND UNKNOWN five=- week=- week_allow=- src=- at=- five_reset=- week_reset=- raw=-\n';

  const five = intOf(found.five), week = intOf(found.week);
  const rankOf = (v, k) => {
    if (v === '-') return 0;
    let r = 0, i = 0;
    for (const b of ['Y', 'O', 'R']) {
      i++;
      const t = cfgSub(c, `.usage.bands.${b}.${k}`);
      if (t !== '' && awkGe(v, t)) r = i;
    }
    return r;
  };
  const rf = rankOf(five, 'five');
  let rw = rankOf(week, 'week');

  let allow = '-';
  if (cfgSub(c, '.usage.week_pace') === 'true' && found.wr !== '') {
    let margin = cfgSub(c, '.usage.week_pace_margin');
    if (!isnum(margin)) margin = '20';
    let d = (Number(found.wr) - now) / 86400;
    if (d < 0) d = 0;
    if (d > 7) d = 7;
    allow = awkInt(100 * (7 - d) / 7 + Number(margin) + 0.5);
    if (week !== '-' && cmpInt(week, allow, 'gt') && rw < 3) rw += 1;
  }
  const r = Math.max(rf, rw);
  const raw = 'GYOR'[r];
  let band = raw;
  if (cfgSub(c, '.usage.relaxed') === 'true' && (band === 'Y' || band === 'O')) band = 'G';
  const dash = (e) => epochToIso(c, e) || '-';
  return `BAND ${band} five=${five} week=${week} week_allow=${allow} src=${src} at=${dash(found.at)} five_reset=${dash(found.fr)} week_reset=${dash(found.wr)} raw=${raw}\n`;
}

/** main — 종료 코드. {env, cwd, now} 는 맥락(now 는 epoch 초, 없으면 지금) */
export async function main(argv, { env = process.env, cwd = process.cwd(), now } = {}) {
  const c = new Ctx({ ...env }, cwd);
  const flush = () => { if (c.errs.length) process.stderr.write(c.err); };
  try {
    coordDefaultRepo(c);
    const a = argv[0] ?? '';
    if (a === '-h' || a === '--help') {
      const lines = readFileSync(join(HERE, 'usage-band.sh'), 'latin1').split('\n').slice(1, 12);
      process.stderr.write(Buffer.from(`${lines.join('\n')}\n`, 'latin1'));
      return 0;
    }
    if (a !== '') throw new CoordDie(2, '사용법: usage-band.sh (인자 없음)');
    const out = usageBand(c, now ?? Number(nowEpoch()));
    flush();
    process.stdout.write(out);
    return 0;
  } catch (e) {
    flush();
    if (e instanceof CoordDie) { process.stderr.write(`${e.message}\n`); return e.rc; }
    throw e;
  }
}
if (isMain(import.meta.url)) scriptMain(main);
