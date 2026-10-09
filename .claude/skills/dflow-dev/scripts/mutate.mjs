// mutate.mjs — /dflow-dev 변이 검증 드라이버. mutate.sh 의 node 판으로, 옛 .sh 와 같은 인자를 그대로 받는다.
// 아래 머리 주석은 옛 backup/scripts/mutate.sh 의 것을 글자 그대로 옮겼다(mutate.sh → mutate.mjs, heavy.sh → heavy.mjs 로 읽는다).
// /dflow-dev 변이 검증 드라이버: 변이 기록 파일(*.mut)대로 변이를 넣고 → 대상 테스트를 돌리고 → 백업 사본으로 되돌린다.
//
//   mutate.sh run <폴더|파일.mut>… [--ids M1,M3]
//
// 왜: Verify 가 build-log 「변이 검증 기록」 의 변이를 다시 넣을 때 위치를 찾느라 소스를 다시 읽었다(2026-09-26
// dmes-standard TSK-08-05 Verify: Explore 11.1분 + 스크립트 작성 12분 + 원문 없는 7행 재작성 4분 ≈ 23분). Build 가 변이를
// 파일 경로·찾을 원문·치환문으로 남기고 Verify 는 같은 파일을 이 드라이버에 다시 넣으면 위치 찾기가 없어진다. Build 도 같은
// 드라이버로 돌린다(「한 번에, heavy.sh 안에서」 — 감싸는 쪽이 heavy.sh 다).
//
// 리포 최상위에서 부른다(파일 경로는 최상위 기준). 변이 기록 형식(한 변이 = 파일 하나, 이름 <ID>.mut, ID 는 [A-Za-z0-9_-]):
//   rule: <불변 규칙 — design.md 「불변 규칙」 의 문구>
//   file: <리포 최상위 기준 경로>
//   test: <대상 테스트 명령 한 줄 — 기준선 명령 줄에 좁히는 인자만 더한 것(sh -c 로 돈다)>
//   e2e: yes|no            (생략하면 no. E2E 스위트 전체가 대상인 변이면 yes)
//   --- find
//   <원문 — 파일에 정확히 한 번 나와야 한다. 여러 줄 가능>
//   --- replace
//   <치환문 — 여러 줄 가능. 비우면 원문을 지운다>
// `--- find`·`--- replace` 줄 뒤부터 다음 표지 줄(또는 파일 끝) 앞까지가 본문이다. 본문 끝의 줄바꿈 하나는 표지의 일부로
// 보고 떼지 않는다 — 원문을 그대로 붙여 넣으면 된다(끝 줄바꿈까지 같아야 찾는다).
//
// 변이마다(이름 순):
//   원문이 파일에 정확히 한 번 있는지 본다 → 아니면 넣지 않고 `MUTATION_RESULT <ID> anchor count=<n>`.
//   파일을 $(git rev-parse --git-dir)/dflow-bak/mutate/<경로> 에 복사해 두고 치환해 쓴 뒤 test 를 sh -c 로 돈다(출력은
//   dflow-bak/mutate-logs/<ID>.log). 끝나면 평범한 cp 로 되돌리고(mtime 이 새로 찍혀야 Gradle 이 재컴파일한다 —
//   phase-build.md 「되돌리기」) 사본을 지운다. 중단(INT·TERM)·오류에도 되돌린다.
//   결과: `MUTATION_RESULT <ID> caught|survived|busy rc=<rc> sec=<초> e2e=<yes|no> log=<경로>`
//     caught = test 가 0 이 아닌 코드로 끝남(빨강), survived = 0(변이가 안 잡힘), busy = 75(HEAVY_BUSY 등 — 판정 아님).
// 줄끝(CRLF): 표지 줄은 \n 도 \r\n 도 받는다. 대상 소스에 \r\n 이 있으면 원문·치환문의 줄바꿈도 \r\n 으로, 없으면 \n 으로 맞춰
//   찾고 치환한다(맞춘 원문이 없을 때만 적힌 그대로도 한 번 본다). 되돌리기는 바이트 사본이라 줄끝이 그대로 돌아온다.
// 윈도우(Git Bash) 한계: MSYS `kill -TERM` 이 node.exe 를 강제 종료하면 신호 핸들러가 돌지 못한다 — 사본은 남지만 다음 실행이 시작할 때
//   「지난 실행의 사본 되돌리기」 로 복구한다(MUTATION_RESTORED·MUTATION_RERUN_NEEDED).
// 마지막 줄: `MUTATION_SUMMARY total=<n> caught=<c> survived=<s> anchor=<a> busy=<b>` (stdout).
// 시작할 때 dflow-bak/mutate/ 에 지난 실행의 사본이 남아 있으면(중단된 실행) 먼저 되돌리고 `MUTATION_RESTORED <경로>` 와
// `MUTATION_RERUN_NEEDED` 를 낸다 — 그때만 Gradle 강제 재실행(--rerun-tasks)을 한 번 쓴다(dev-discipline 「강제 재실행」).
// exit: 0(판정을 냈다 — survived·anchor 가 있어도 0), 2(사용법·형식 오류: `MUTATION_BAD <파일> <사유>`), 3(되돌리기 실패).
// 10분 상한(phase-prompt 공통 규칙 4)을 넘길 것 같으면 --ids 로 나눠 부르거나 heavy.sh --detach 로 띄운다.
//
//   node mutate.mjs run <폴더|파일.mut>… [--ids M1,M3]   (리포 최상위에서 부른다)
//
// perl 이던 것을 옮겼다(macOS·Git Bash 모두 node 만 있으면 돈다).
// 파일은 바이트 그대로(latin1) 읽고 써서 인코딩·줄바꿈을 건드리지 않는다.
// `--help` 는 사용법을 내고 exit 0.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';

// fd 에 전부 쓸 때까지 루프한다(64KB 넘는 파이프도 잘리지 않는다).
const writeAll = (fd, data) => {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  let off = 0;
  while (off < buf.length) {
    let n;
    try { n = fs.writeSync(fd, buf, off); } catch (e) { if (e.code === 'EAGAIN') continue; return; }
    if (n <= 0) return;
    off += n;
  }
};
const out = (s) => { writeAll(1, s); };
const err = (s) => { writeAll(2, s); };

const USAGE = '사용법: mutate.sh run <폴더|파일.mut>… [--ids M1,M3]\n';
const argv = process.argv.slice(2);
if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) { out(USAGE); process.exit(0); }
if (argv[0] !== 'run') { err(USAGE); process.exit(2); }
// git-dir 는 스스로 구한다(옛 .sh 가 구해 넘기던 자리).
const gd = spawnSync('git', ['rev-parse', '--git-dir'], { encoding: 'utf8', windowsHide: true });
if (gd.status !== 0) { err('MUTATION_BAD . git 작업 트리 안에서 부른다\n'); process.exit(2); }
const gitdir = String(gd.stdout ?? '').replace(/\n+$/, '');
// 옛 .sh 와 같이 리포 최상위에서만 부른다(파일 경로·로그가 최상위 기준이다).
const topOut = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true });
const TOP = String(topOut.stdout ?? '').replace(/\n+$/, '');
let hereP = process.cwd();
let topP = TOP;
try { hereP = fs.realpathSync(process.cwd()); } catch { /* 그대로 */ }
try { topP = fs.realpathSync(TOP); } catch { /* 그대로 */ }
if (topOut.status !== 0 || hereP !== topP) { err(`MUTATION_BAD . 리포 최상위에서 부른다(${TOP})\n`); process.exit(2); }

const rest = argv.slice(1);
const inputs = []; let ids;
for (let i = 0; i < rest.length; i++) { if (rest[i] === '--ids') { ids = rest[++i] ?? ''; } else inputs.push(rest[i]); }
if (!inputs.length) { err(USAGE); process.exit(2); }
const want = new Set(ids === undefined ? [] : ids.split(',').filter((x) => x.length));
const bak = `${gitdir}/dflow-bak/mutate`;
const logs = `${gitdir}/dflow-bak/mutate-logs`;

const slurp = (f) => { try { return fs.readFileSync(f, 'latin1'); } catch { return undefined; } };
const spit = (f, c) => { try { fs.writeFileSync(f, c, 'latin1'); return true; } catch { return false; } };
const cpPlain = (from, to) => { const c = slurp(from); return c !== undefined && spit(to, c); };  // 평범한 복사: mtime 이 새로 찍힌다
// 첫 표지 줄 기준 둘로 가른다(perl split /^표지\n/m, 2 와 같다). 표지 줄 끝은 \n 도 \r\n 도 받는다(.mut 가 CRLF 로 체크아웃되는 윈도우)
const splitOnce = (s, re) => { const m = re.exec(s); return m ? [s.slice(0, m.index), s.slice(m.index + m[0].length)] : [s, undefined]; };

// 지난 실행의 사본 되돌리기
let leftover = false;
if (fs.existsSync(bak) && fs.statSync(bak).isDirectory()) {
  const stack = [bak];
  while (stack.length) {
    const d = stack.pop();
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) { stack.push(p); continue; }
      const rel = p.slice(bak.length + 1);
      if (cpPlain(p, rel)) { fs.unlinkSync(p); out(`MUTATION_RESTORED ${rel}\n`); leftover = true; }
      else { err(`MUTATION_RESTORE_FAIL ${rel}\n`); process.exit(3); }
    }
  }
}
if (leftover) out('MUTATION_RERUN_NEEDED\n');

// 변이 기록 모으기
const files = [];
for (const inp of inputs) {
  let st; try { st = fs.statSync(inp); } catch { st = undefined; }
  if (st?.isDirectory()) { files.push(...fs.readdirSync(inp).filter((n) => /\.mut$/.test(n)).sort().map((n) => `${inp}/${n}`)); }
  else if (st?.isFile()) files.push(inp);
  else { err(`MUTATION_BAD ${inp} 없음\n`); process.exit(2); }
}
const bad = (f, why) => { err(`MUTATION_BAD ${f} ${why}\n`); process.exit(2); };
const muts = [];
for (const f of files) {
  const id = path.basename(f).replace(/\.mut$/, '');
  if (!/^[A-Za-z0-9_-]+$/.test(id)) bad(f, 'ID 는 [A-Za-z0-9_-] 만');
  if (want.size && !want.has(id)) continue;
  const c = slurp(f); if (c === undefined) bad(f, '읽을 수 없음');
  const [head, r1] = splitOnce(c, /^--- find\r?\n/m); if (r1 === undefined) bad(f, '--- find 표지 없음');
  const [find, repl] = splitOnce(r1, /^--- replace\r?\n/m); if (repl === undefined) bad(f, '--- replace 표지 없음');
  if (!find.length) bad(f, '원문이 비었다');
  const h = {};
  // 헤더(file·test 등)는 UTF-8 글로 풀어 쓴다(본문 find·repl 은 바이트 그대로 latin1). perl 은 바이트를 그대로 넘겼다.
  for (const line of Buffer.from(head, 'latin1').toString('utf8').split('\n')) { const m = /^([a-z0-9]+):\s*(.*?)\s*$/.exec(line); if (m) h[m[1]] = m[2]; }
  for (const k of ['rule', 'file', 'test']) if (!h[k]) bad(f, `${k}: 없음`);
  muts.push({ id, file: h.file, test: h.test, e2e: (h.e2e ?? 'no') === 'yes' ? 'yes' : 'no', find, repl });
}
if (want.size) { const have = new Set(muts.map((m) => m.id)); for (const w of [...want].sort()) if (!have.has(w)) { err(`MUTATION_BAD ${w} 기록 파일 없음\n`); process.exit(2); } }
fs.mkdirSync(logs, { recursive: true });

let curFile, curBak, child;
const restore = () => {
  if (curBak === undefined) return true;
  const ok = cpPlain(curBak, curFile);
  if (ok) try { fs.unlinkSync(curBak); } catch { /* 이미 없음 */ }
  curBak = undefined; return ok;
};
// 중단(INT·TERM·HUP)에도 되돌린다. 돌던 시험은 같은 신호로 끊는다
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  process.on(sig, () => { try { child?.kill(sig); } catch { /* 이미 끝남 */ } restore(); process.exit(code); });
}
process.on('exit', () => { if (curBak !== undefined) restore(); });

const runTest = (cmd, logPath) => new Promise((resolve) => {
  const fd = fs.openSync(logPath, 'w');
  child = spawn('sh', ['-c', cmd], { stdio: ['inherit', fd, fd] });
  let finished = false;   // spawn 실패 때는 error 뒤에 close 도 온다 — 한 번만 끝낸다
  const done = (rc) => { if (finished) return; finished = true; fs.closeSync(fd); child = undefined; resolve(rc); };
  child.on('error', () => done(127));
  child.on('close', (code, sig) => done(sig ? 128 + (os.constants.signals[sig] ?? 0) : code ?? 127));
});

const toEol = (t, eol) => t.replace(/\r?\n/g, eol);   // 줄바꿈을 하나로 통일한다(\r\n·\n → eol)
const countOf = (s, f) => { let c = 0, pos = 0, i; while ((i = s.indexOf(f, pos)) >= 0) { c++; pos = i + 1; } return c; };
const n = { total: 0, caught: 0, survived: 0, anchor: 0, busy: 0 };
const nowS = () => Math.floor(Date.now() / 1000);
for (const m of muts) {
  n.total++;
  let src = slurp(m.file);
  let count = 0, find = m.find, repl = m.repl;
  if (src !== undefined) {
    // 줄바꿈 맞춤: 대상 소스가 CRLF 면 원문·치환문의 줄바꿈도 \r\n 으로, 아니면 \n 으로 맞춘다(.mut 와 소스의 줄끝이 달라도 찾는다).
    // 맞춘 원문이 하나도 없으면 적힌 그대로(바이트 일치)도 한 번 본다 — 줄끝이 섞인 소스·바이트까지 지정한 원문을 위해.
    const eolSrc = src.includes('\r\n') ? '\r\n' : '\n';
    const adj = (t) => toEol(t, eolSrc);
    const cands = [[adj(m.find), adj(m.repl)]];
    if (cands[0][0] !== m.find) cands.push([m.find, m.repl]);
    for (const [cf, cr] of cands) { count = countOf(src, cf); if (count > 0) { find = cf; repl = cr; break; } }
  }
  if (count !== 1) { n.anchor++; out(`MUTATION_RESULT ${m.id} anchor count=${count} file=${m.file}\n`); continue; }
  const b = `${bak}/${m.file}`; fs.mkdirSync(path.dirname(b), { recursive: true });
  if (!cpPlain(m.file, b)) { err(`MUTATION_RESTORE_FAIL ${m.file} 사본을 만들 수 없음\n`); process.exit(3); }
  curFile = m.file; curBak = b;
  const i = src.indexOf(find);
  src = src.slice(0, i) + repl + src.slice(i + find.length);
  if (!spit(m.file, src)) { restore(); err(`MUTATION_RESTORE_FAIL ${m.file} 쓸 수 없음\n`); process.exit(3); }
  const log = `${logs}/${m.id}.log`; const t0 = nowS();
  const rc = await runTest(m.test, log);
  if (!restore()) { err(`MUTATION_RESTORE_FAIL ${m.file}\n`); process.exit(3); }
  const res = rc === 75 ? 'busy' : rc === 0 ? 'survived' : 'caught'; n[res]++;
  out(`MUTATION_RESULT ${m.id} ${res} rc=${rc} sec=${nowS() - t0} e2e=${m.e2e} log=${log}\n`);
}
out(`MUTATION_SUMMARY total=${n.total} caught=${n.caught} survived=${n.survived} anchor=${n.anchor} busy=${n.busy}\n`);
process.exit(0);
