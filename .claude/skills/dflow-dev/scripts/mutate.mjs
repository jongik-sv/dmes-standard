// mutate.sh 의 본체(변이 검증 드라이버). 형식·결과 줄·종료 코드의 정본은 mutate.sh 머리 주석이다.
// perl 이던 것을 옮겼다(macOS·Git Bash 모두 node 만 있으면 돈다). 인자: <git-dir> run 뒤의 인자들(<폴더|파일.mut>… [--ids M1,M3]).
// 파일은 바이트 그대로(latin1) 읽고 써서 인코딩·줄바꿈을 건드리지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const out = (s) => { for (;;) { try { fs.writeSync(1, s); return; } catch (e) { if (e.code !== 'EAGAIN') return; } } };
const err = (s) => { for (;;) { try { fs.writeSync(2, s); return; } catch (e) { if (e.code !== 'EAGAIN') return; } } };

const [gitdir, ...rest] = process.argv.slice(2);
const inputs = []; let ids;
for (let i = 0; i < rest.length; i++) { if (rest[i] === '--ids') { ids = rest[++i] ?? ''; } else inputs.push(rest[i]); }
if (!inputs.length) { err('사용법: mutate.sh run <폴더|파일.mut>… [--ids M1,M3]\n'); process.exit(2); }
const want = new Set(ids === undefined ? [] : ids.split(',').filter((x) => x.length));
const bak = `${gitdir}/dflow-bak/mutate`;
const logs = `${gitdir}/dflow-bak/mutate-logs`;

const slurp = (f) => { try { return fs.readFileSync(f, 'latin1'); } catch { return undefined; } };
const spit = (f, c) => { try { fs.writeFileSync(f, c, 'latin1'); return true; } catch { return false; } };
const cpPlain = (from, to) => { const c = slurp(from); return c !== undefined && spit(to, c); };  // 평범한 복사: mtime 이 새로 찍힌다
// 첫 표지 줄 기준 둘로 가른다(perl split /^표지\n/m, 2 와 같다)
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
  const [head, r1] = splitOnce(c, /^--- find\n/m); if (r1 === undefined) bad(f, '--- find 표지 없음');
  const [find, repl] = splitOnce(r1, /^--- replace\n/m); if (repl === undefined) bad(f, '--- replace 표지 없음');
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

const n = { total: 0, caught: 0, survived: 0, anchor: 0, busy: 0 };
const nowS = () => Math.floor(Date.now() / 1000);
for (const m of muts) {
  n.total++;
  let src = slurp(m.file);
  let count = 0;
  if (src !== undefined) { let pos = 0, i; while ((i = src.indexOf(m.find, pos)) >= 0) { count++; pos = i + 1; } }
  if (count !== 1) { n.anchor++; out(`MUTATION_RESULT ${m.id} anchor count=${count} file=${m.file}\n`); continue; }
  const b = `${bak}/${m.file}`; fs.mkdirSync(path.dirname(b), { recursive: true });
  if (!cpPlain(m.file, b)) { err(`MUTATION_RESTORE_FAIL ${m.file} 사본을 만들 수 없음\n`); process.exit(3); }
  curFile = m.file; curBak = b;
  const i = src.indexOf(m.find);
  src = src.slice(0, i) + m.repl + src.slice(i + m.find.length);
  if (!spit(m.file, src)) { restore(); err(`MUTATION_RESTORE_FAIL ${m.file} 쓸 수 없음\n`); process.exit(3); }
  const log = `${logs}/${m.id}.log`; const t0 = nowS();
  const rc = await runTest(m.test, log);
  if (!restore()) { err(`MUTATION_RESTORE_FAIL ${m.file}\n`); process.exit(3); }
  const res = rc === 75 ? 'busy' : rc === 0 ? 'survived' : 'caught'; n[res]++;
  out(`MUTATION_RESULT ${m.id} ${res} rc=${rc} sec=${nowS() - t0} e2e=${m.e2e} log=${log}\n`);
}
out(`MUTATION_SUMMARY total=${n.total} caught=${n.caught} survived=${n.survived} anchor=${n.anchor} busy=${n.busy}\n`);
process.exit(0);
