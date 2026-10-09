// scripts/merge-gate.sh 의 node 판(스위치 COORD_JS_MERGE_GATE — js-bridge.sh _jsb_exec).
//   사용법: merge-gate.mjs <레인> | --branch <브랜치>
//   첫 줄 `GATE <ok|wait|conflict> branch=<b> base=<integration> tree=<hash|-> files=<n>` 뒤에 CONFLICT·FORBIDDEN·OUTSIDE·SHARED_API·RESTART·WINDOW·INFLIGHT 사유 줄.
// bash 판이 정답이다. 옮기며 같게 만든 것:
//   · glob_re: `**/`=(.*/)?  `**`=.*  `*`=[^/]*  `?`=[^/]  끝이 / 이면 아래 전부. 글자 단위(UTF-8)로 풀고 정규식도 글자 단위로 맞춘다(bash [[ =~ ]] 의 UTF-8 로캘)
//   · is_shared_api 는 case 패턴이라 `*` 가 / 까지 맞는다 — glob_re 와 따로 구현
//   · 상태 파일은 jq 식 그대로의 뜻으로 JS 에서 읽는다: `.lanes[$l].owned[]? // empty`(참인 원소만), `.windows[]? | select(.kind == "measure")`, `.merge.in_flight` 대조
//   · 레인 이름은 bash 판에서 jq 프로그램 글에 들어간다 — `"`·`\` 가 든 이름은 jq 컴파일 오류(→ die 2)와 같게 처리(보간 `\(…)` 추적은 안 함: 의심 목록)
//   · git merge-tree --write-tree --name-only --no-messages 의 종료 코드 0/1/그 밖 → 트리 / 충돌 목록(sort -u, C 순서 — bash 판은 로캘 순서) / die 4
// node 18.17 이상, 외부 패키지 없음.
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as J from './lib/jq-json.mjs';
import { CoordDie, Ctx, cfgSub, hasRun, laneGet, stateFile } from './lib/common.mjs';
import { cfgAtSegs, cfgLenAt, coordGit, laneType, rawOut, stripNl, testInt, walk } from './lib/common-ext.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** 글롭 → 정규식 글(bash glob_re 와 같은 변환; 글자 단위) */
export function globRe(g0) {
  let g = g0;
  if (g.endsWith('/')) g += '**';
  const cs = Array.from(g);
  let re = '';
  let i = 0;
  while (i < cs.length) {
    const c = cs[i];
    if (c === '*') {
      if (cs[i + 1] === '*') {
        if (cs[i + 2] === '/') { re += '(.*/)?'; i += 3; continue; }
        re += '.*'; i += 2; continue;
      }
      re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('.+()|^$[]{}\\'.includes(c)) re += `\\${c}`;
    else re += c;
    i += 1;
  }
  return `^${re}$`;
}
/** bash 의 글자 모드: LC_ALL → LC_CTYPE → LANG 순 첫 비어 있지 않은 값이 UTF-8 이면 글자, 아니면(C·POSIX·없음) 바이트 */
export function isUtf8Locale(env) {
  const v = env.LC_ALL || env.LC_CTYPE || env.LANG || '';
  return /utf-?8/i.test(v);
}
const toBytes = (s) => Buffer.from(s, 'utf8').toString('latin1');
/** glob_match <경로> <글롭…>: 하나라도 맞으면 true (빈 글롭은 건너뜀). utf8=false 면 바이트 단위로 맞춘다 */
export function globMatch(p, globs, utf8 = true) {
  for (const g of globs) {
    if (g === '') continue;
    let rx;
    try { rx = utf8 ? new RegExp(globRe(g), 'su') : new RegExp(globRe(toBytes(g)), 's'); } catch { continue; }   // 정규식 오류는 =~ 가 2 를 돌려줘 불일치
    if (rx.test(utf8 ? p : toBytes(p))) return true;
  }
  return false;
}

/** is_shared_api — bash case 패턴(`*` 가 / 도 맞음) */
export function isSharedApi(p) {
  if (!p.startsWith('src/frontend/shared/')) return false;
  return p.endsWith('/index.ts') || p.endsWith('/index.tsx') || p.endsWith('.d.ts') || p.endsWith('/types.ts') || p.endsWith('.types.ts')
    || p.endsWith('Types.ts') || p.endsWith('Props.ts') || p.includes('/types/') || p === 'src/frontend/shared/package.json';
}

const readJson = (file) => {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { return null; }
  return J.parseStreamPartial(text).values;
};
const lines = (s) => s.split('\n').filter((l) => l !== '');

/** jq -r '.lanes[$l].owned[]? // empty' (또는 forbidden): 참인 원소의 출력글을 줄 단위로 */
function laneGlobs(docs, lane, key) {
  const out = [];
  for (const d of docs ?? []) {
    try {
      const v = walk(d, ['lanes']);
      const item = J.index(v, lane);
      const arr = J.index(item, key);
      let els;
      if (Array.isArray(arr)) els = arr;
      else if (arr instanceof Map) els = [...arr.values()];
      else continue;   // null·문자열·수: `[]?` 가 오류를 삼켜 출력 없음
      for (const e of els) if (J.alt(e, undefined) !== undefined) out.push(rawOut(e));
    } catch (e) { if (!(e instanceof J.JqError)) throw e; }
  }
  return out.flatMap((s) => s.split('\n')).filter((l) => l !== '');
}

/** jq -r '.windows[]? | select(.kind == "measure") | "\(.kind) until=\(.until // "-")"' */
function measureWindows(docs) {
  const out = [];
  for (const d of docs ?? []) {
    try {
      const w = J.index(d, 'windows');
      let els;
      if (Array.isArray(w)) els = w;
      else if (w instanceof Map) els = [...w.values()];
      else continue;
      for (const e of els) {
        if (J.index(e, 'kind') === 'measure') out.push(`measure until=${J.tostring(J.alt(J.index(e, 'until'), '-'))}`);
      }
    } catch (e) { if (!(e instanceof J.JqError)) throw e; }
  }
  return out.flatMap((s) => s.split('\n')).filter((l) => l !== '');
}

/** jq -r --arg l --arg b '.merge.in_flight // empty | select(…) | (.lane // .branch // "?")' → 줄바꿈 뗀 글 */
function inFlight(docs, lane, branch) {
  let out = '';
  for (const d of docs ?? []) {
    try {
      const x = J.alt(J.index(J.index(d, 'merge'), 'in_flight'), undefined);
      if (x === undefined) continue;
      const keep = lane !== '' ? J.alt(J.index(x, 'lane'), '') !== lane : J.alt(J.index(x, 'branch'), '') !== branch;
      if (!keep) continue;
      out += `${rawOut(J.alt(J.alt(J.index(x, 'lane'), J.index(x, 'branch')), '?'))}\n`;
    } catch (e) { if (!(e instanceof J.JqError)) throw e; }
  }
  return stripNl(out);
}

/** main — 종료 코드 */
export async function main(argv, { env = process.env, cwd = process.cwd() } = {}) {
  const c = new Ctx({ ...env }, cwd);
  const flush = () => { if (c.errs.length) process.stderr.write(c.err); };
  const out = [];
  try {
    let lane = '', branch = '';
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === '--branch') { branch = argv[i + 1] ?? ''; i++; }
      else if (a === '-h' || a === '--help') {
        const ls = readFileSync(join(HERE, 'merge-gate.sh'), 'latin1').split('\n').slice(1, 7);
        process.stdout.write(Buffer.from(`${ls.join('\n')}\n`, 'latin1'));
        return 0;
      } else if (a.startsWith('-')) throw new CoordDie(2, `모르는 옵션: ${a}`);
      else lane = a;
    }
    const utf8 = isUtf8Locale(env);
    if (lane === '' && branch === '') throw new CoordDie(2, '사용법: merge-gate.sh <레인> | --branch <브랜치>');

    if (env.MERGE_GATE_SELFTEST === '1') {
      const t = (p, g, want) => {
        const r = globMatch(p, [g], utf8) ? 'match' : 'no';
        out.push(r === want ? `PASS ${g} ~ ${p} → ${r}` : `FAIL ${g} ~ ${p} → ${r} (기대 ${want})`);
      };
      t('src/backend/a/b/C.java', 'src/backend/**', 'match');
      t('src/backend', 'src/backend/**', 'no');
      t('src/frontend/shared/src/index.ts', '**/index.ts', 'match');
      t('index.ts', '**/index.ts', 'match');
      t('src/a.ts', 'src/*.ts', 'match');
      t('src/a/b.ts', 'src/*.ts', 'no');
      t('docs/x/y.md', 'docs/', 'match');
      t('docsx/y.md', 'docs/', 'no');
      t('src/a.b.ts', 'src/a?b.ts', 'match');
      t('src/a+b.ts', 'src/a+b.ts', 'match');
      t('src/aXb.ts', 'src/a.b.ts', 'no');
      process.stdout.write(`${out.join('\n')}\n`);
      return 0;
    }

    const run = hasRun(c);
    let owned = [], forbidden = [];
    let docs = null;
    const loadDocs = () => { if (docs === null) docs = readJson(stateFile(c, '')); return docs; };
    if (lane !== '') {
      if (!run) throw new CoordDie(3, '현재 회차가 없다(레인 이름으로 부르려면 회차가 필요)');
      // 레인 이름은 jq 프로그램 글에 들어간다: `"`·`\` 가 있으면 컴파일 오류(빈 글) 또는 다른 이름 → 어느 쪽이든 「상태에 없는 레인」으로 본다
      const typ = /["\\]/.test(lane) ? '' : laneType(loadDocs(), lane);
      if (typ !== 'object') throw new CoordDie(2, `상태에 없는 레인: ${lane}`);
      if (branch === '') branch = stripNl(laneGet(c, lane, '.branch').out ?? '');
      if (branch === '') throw new CoordDie(3, `레인 ${lane} 의 branch 가 비어 있다`);
      owned = laneGlobs(loadDocs(), lane, 'owned');
      forbidden = laneGlobs(loadDocs(), lane, 'forbidden');
    }

    // merge-tree 의 경로는 현재 폴더 기준이라 작업 트리 맨 위에서 돈다
    const topR = coordGit(c, ['rev-parse', '--show-toplevel']);
    const top = stripNl(topR.out.toString('utf8'));
    if (topR.rc === 0 && top !== '') c.cwd = top;

    let base = '';
    if (run) {
      for (const d of loadDocs() ?? []) {
        try {
          const v = J.alt(J.index(J.index(d, 'run'), 'integration_branch'), undefined);
          if (v !== undefined) base += `${rawOut(v)}\n`;
        } catch (e) { if (!(e instanceof J.JqError)) throw e; }
      }
      base = stripNl(base);
    }
    if (base === '') base = cfgSub(c, '.integration_branch');
    if (coordGit(c, ['rev-parse', '--verify', '-q', `${base}^{commit}`]).rc !== 0) throw new CoordDie(4, `통합 브랜치가 없다: ${base}`);
    if (coordGit(c, ['rev-parse', '--verify', '-q', `${branch}^{commit}`]).rc !== 0) throw new CoordDie(2, `브랜치가 없다: ${branch}`);

    // 1. 충돌·예상 트리
    const mtR = coordGit(c, ['merge-tree', '--write-tree', '--name-only', '--no-messages', base, branch]);
    const mt = stripNl(mtR.out.toString('utf8'));
    let tree = '';
    let conflicts = [];
    if (mtR.rc === 0) tree = mt.split('\n')[0];
    else if (mtR.rc === 1) {
      tree = '-';
      const rest = mt.split('\n').slice(1).filter((l) => l !== '');
      conflicts = [...new Set(rest)].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    } else throw new CoordDie(4, `git merge-tree 실패(rc=${mtR.rc}). git 2.38 이상이 필요하다`);

    // 2. 범위
    const files = lines(stripNl(coordGit(c, ['diff', '--name-only', `${base}...${branch}`]).out.toString('utf8')));

    const reasons = [];
    let wait = false;
    for (const p of conflicts) reasons.push(`CONFLICT ${p}`);
    if (files.length > 0) {
      for (const p of files) {
        if (forbidden.length > 0 && globMatch(p, forbidden, utf8)) { reasons.push(`FORBIDDEN ${p}`); wait = true; }
        else if (owned.length > 0 && !globMatch(p, owned, utf8)) reasons.push(`OUTSIDE ${p}`);
        if (isSharedApi(p)) reasons.push(`SHARED_API ${p}`);
      }
      // 5. 재기동 영향(규칙마다 한 번)
      const nText = cfgLenAt(c, ['restart_rules']);
      const nrules = testInt(nText === '' ? '0' : nText);
      for (let i = 0; nrules !== null && BigInt(i) < nrules; i++) {
        const rg = cfgAtSegs(c, ['restart_rules', i, 'glob']);
        const note = cfgAtSegs(c, ['restart_rules', i, 'note']);
        for (const p of files) {
          if (globMatch(p, [rg], utf8)) { reasons.push(`RESTART ${note !== '' ? note : rg}`); break; }
        }
      }
    }

    // 6. 측정 창 · 진행 중 머지
    if (run) {
      for (const w of measureWindows(loadDocs())) { reasons.push(`WINDOW ${w}`); wait = true; }
      const inf = inFlight(loadDocs(), lane, branch);
      if (inf !== '') { reasons.push(`INFLIGHT ${inf}`); wait = true; }
    }

    const g = conflicts.length > 0 ? 'conflict' : wait ? 'wait' : 'ok';
    out.push(`GATE ${g} branch=${branch} base=${base} tree=${tree} files=${files.length}`);
    for (const r of reasons) out.push(r);
    flush();
    process.stdout.write(`${out.join('\n')}\n`);
    return 0;
  } catch (e) {
    flush();
    if (e instanceof CoordDie) { process.stderr.write(`${e.message}\n`); return e.rc; }
    throw e;
  }
}
if (isMain(import.meta.url)) scriptMain(main);
