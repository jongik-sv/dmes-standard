#!/usr/bin/env node
// decisions.mjs — 공용 결정 기록(decisions.md)의 머지 처리 (decisions.sh 의 node 이식).
// /dflow-merge 가 머지 자리에서 부른다(SKILL.md 「결정 번호 매김」).
//
// 사용:
//   decisions.mjs merge-conflicts [-C <dir>]
//     머지 도중 충돌한 decisions.md 만 기계적으로 푼다. 출력 DECISIONS_RESOLVED·DECISIONS_LEFT. 늘 exit 0(사용 오류 2).
//   decisions.mjs renumber [-C <dir>] [--tsk <TSK>] [--order <주문 UUID>]
//     임시 ID(`## D-TSK-…-<n>`)를 다음 전역 번호로 바꾸고 참조를 치환해 커밋 하나로 남긴다.
//     출력 RENUMBERED·REFS·COMMITTED·NO_TEMP_IDS(exit 0) · DUP_RENUMBERED·DUP_REF_*·DUP_LEFT·
//     DECISIONS_SEQ·RENUMBER_DUP·UNION_SET(경고) · RENUMBER_DIRTY·RENUMBER_FAILED(exit 1) · usage(exit 2).
//
// 파일 잠금(`<decisions.md>.lock` 디렉터리, 15초 대기·10분 stale)은
// dflow-wbs decision-log.mjs append 와 같은 방식이라 둘이 서로를 기다린다.
// sh 판과 맞춘 점: 인자·git 조회 묶음·블록 분리(`## ` 머리부터 다음 머리 앞까지)·
// 머리 판정·치환 앞자리 가드·커밋 문구·출력 줄 형식·종료 코드.
// 알고 둔 차이: --help(짧은 도움말, exit 0)는 추가. usage 문구의 스크립트 이름은 mjs.
//   바이트 의미 연산(LC_ALL=C awk substr/match)은 ASCII 구간 연산과 결과가 같게 정규식 치환으로 구현했다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OK, USAGE, finish } from '../../_shared/node/args.mjs';

// stdout/stderr 쓰기. writeSync 반환 바이트만큼 루프(64KB 넘는 파이프 잘림 방지).
function writeFd(fd, s) {
  const b = Buffer.from(s, 'utf8');
  for (let off = 0; off < b.length;) {
    let n = 0;
    try {
      n = fs.writeSync(fd, b, off);
    } catch {
      break;
    }
    if (n <= 0) break;
    off += n;
  }
}
const writeOut = (s) => writeFd(1, s);
const writeErr = (s) => writeFd(2, s);

const PROG = path.basename(fileURLToPath(import.meta.url));const USAGE_MSG = `usage: ${PROG} merge-conflicts|renumber [-C <dir>] [--tsk <TSK>] [--order <UUID>]`;
function dieUsage() {
  writeErr(USAGE_MSG + '\n');
  return finish(USAGE);
}

// 결정 항목 머리 정본. decision-log.mjs ENTRY_RE 와 같은 규칙:
// `## D-<숫자> (<시각>)` 뒤에 공백만 있고 줄이 끝나야 한다.
const HRE = /^## D-[0-9]+ \([^)]+\)[ \t\v\f\r]*$/;
const isDecisions = (p) => p === 'decisions.md' || p.endsWith('/decisions.md');
const isClaude = (p) => p.startsWith('.claude/');
const fmtD = (n) => 'D-' + String(n).padStart(3, '0');

function git(cwd, args, { input } = {}) {
  const r = spawnSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8', input, cwd, windowsHide: true, maxBuffer: 256 * 1024 * 1024,
  });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// 줄 나누기(끝 개행 뒤 빈 조각만 버린다. \r 은 남긴다 — awk 와 같다).
function splitRaw(text) {
  if (text === '') return [];
  const a = text.split('\n');
  if (a.length && a[a.length - 1] === '') a.pop();
  return a;
}
const byteSort = (arr) => arr.slice().sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));

function numOf(head) {
  const m = /^## D-([0-9]+)/.exec(head);
  return m ? parseInt(m[1], 10) : NaN;
}
const tokOf = (head) => head.slice(3).split(' ')[0];

// 토큰 치환. 앞자리가 [A-Za-z0-9_-] 이면 바꾸지 않는다(awk match 루프와 같다).
function substLine(line, map, tokRe) {
  return line.replace(tokRe, (m, off, s) => {
    const prev = off === 0 ? '' : s[off - 1];
    if (/[A-Za-z0-9_-]/.test(prev)) return m;
    return map.has(m) ? map.get(m) : m;
  });
}
// ## 줄·필드 줄은 참조가 아니다.
function substNonHead(line, map, tokRe) {
  if (line.startsWith('## ') || /^- \*\*(Renumbered from|Temp ID)\*\*:/.test(line)) return line;
  return substLine(line, map, tokRe);
}
const DNUM_RE = /D-[0-9]+/g;
const TSK_RE = /D-TSK(?:-[0-9]+)+/g;

// 블록 나누기(`## ` 머리부터 다음 머리 앞까지, 끝 빈 줄 제외).
function tokenize(text) {
  const occ = [];
  let cur = null;
  for (const line of splitRaw(text)) {
    if (line.startsWith('## ')) {
      if (cur) {
        cur.body = cur.body.replace(/\n+$/, '');
        occ.push(cur);
      }
      cur = { head: line, body: line };
    } else if (cur) cur.body += '\n' + line;
  }
  if (cur) {
    cur.body = cur.body.replace(/\n+$/, '');
    occ.push(cur);
  }
  return occ;
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function main(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    writeOut(USAGE_MSG + '\n공용 decisions.md 의 머지 처리. merge-conflicts(충돌 기계 해소) · renumber(임시 ID 번호 매김).\n');
    return finish(OK);
  }
  if (!argv.length) return dieUsage();
  const cmd = argv[0];
  let dir = '.', tsk = '', order = '';
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '-C' || a === '--tsk' || a === '--order') && i + 1 < argv.length) {
      const v = argv[++i];
      if (a === '-C') dir = v;
      else if (a === '--tsk') tsk = v;
      else order = v;
    } else return dieUsage();
  }
  const errTag = cmd === 'merge-conflicts' ? 'DECISIONS_FAILED' : 'RENUMBER_FAILED';
  try {
    process.chdir(dir);
  } catch {
    writeOut(`${errTag} cd ${dir}\n`);
    return finish(1);
  }
  const t = git(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (t.status !== 0) {
    writeOut(`${errTag} not-a-repo\n`);
    return finish(1);
  }
  const top = t.stdout.replace(/\n+$/, '');
  process.chdir(top);

  let tmp;
  try {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dflowdec-'));
  } catch {
    writeOut(`${errTag} mktemp\n`);
    return finish(1);
  }
  const locksFile = path.join(tmp, 'locks');
  const changed = new Set();
  let cleaned = false;

  const dlock = (base) => {
    const l = base + '.lock';
    const end = Date.now() + 15000;
    let none = 0;
    for (;;) {
      try {
        fs.mkdirSync(l);
        fs.appendFileSync(locksFile, l + '\n');
        return true;
      } catch { /* 잡기 시도 */ }
      let exists = false, isDir = false;
      try {
        exists = true;
        isDir = fs.statSync(l).isDirectory();
      } catch {
        exists = false;
      }
      if (!exists) {
        none++;
        if (none > 5) return false;
      } else if (isDir) {
        let mtime = 0;
        try {
          mtime = fs.statSync(l).mtimeMs;
        } catch { /* 무시 */ }
        if (Date.now() - mtime > 10 * 60 * 1000) {
          const grave = `${l}.stale.${process.pid}.${end}`;
          try {
            fs.renameSync(l, grave);
            let gmtime = 0;
            try {
              gmtime = fs.statSync(grave).mtimeMs;
            } catch { /* 무시 */ }
            if (Date.now() - gmtime > 10 * 60 * 1000) {
              try { fs.rmdirSync(grave); } catch { /* 무시 */ }
            } else {
              try { fs.renameSync(grave, l); } catch { /* 무시 */ }
            }
          } catch { /* 다른 쪽이 먼저 치움 */ }
        }
      }
      if (Date.now() >= end) return false;
      sleepMs(200);
    }
  };
  const dunlock = (base) => {
    const l = base + '.lock';
    try { fs.rmdirSync(l); } catch { /* 무시 */ }
    try {
      const kept = splitRaw(fs.readFileSync(locksFile, 'utf8')).filter((x) => x !== l);
      fs.writeFileSync(locksFile, kept.length ? kept.join('\n') + '\n' : '');
    } catch { /* 무시 */ }
  };
  const releaseLocks = () => {
    let lines = [];
    try {
      lines = splitRaw(fs.readFileSync(locksFile, 'utf8'));
    } catch {
      return;
    }
    for (const x of lines) {
      try { fs.rmdirSync(x); } catch { /* 무시 */ }
    }
    try { fs.writeFileSync(locksFile, ''); } catch { /* 무시 */ }
  };
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    releaseLocks();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 무시 */ }
  };
  process.on('exit', cleanup);
  const sigExit = () => { cleanup(); process.exit(130); };
  process.on('SIGHUP', sigExit);
  process.on('SIGINT', sigExit);
  process.on('SIGTERM', sigExit);
  const fail = (step) => {
    writeOut(`RENUMBER_FAILED ${step}\n`);
    for (const c of byteSort([...changed])) {
      git(top, ['reset', '-q', '--', c]);
      git(top, ['checkout', '-q', '--', c]);
    }
    cleanup();
    return finish(1);
  };

  if (cmd === 'merge-conflicts') {
    const d = git(top, ['diff', '--name-only', '--diff-filter=U']);
    if (d.status !== 0) {
      writeOut('DECISIONS_FAILED diff\n');
      cleanup();
      return finish(1);
    }
    for (const p of splitRaw(d.stdout)) {
      if (!isDecisions(p)) continue;
      const u = git(top, ['ls-files', '-u', '--', p]);
      const stages = [...new Set(splitRaw(u.stdout).map((l) => (l.split(/\s+/)[2] ?? '')))].sort().join('');
      let baseText;
      if (stages === '123') {
        const rb = git(top, ['show', `:1:${p}`]);
        if (rb.status !== 0) {
          writeOut(`DECISIONS_LEFT ${p} read-base\n`);
          continue;
        }
        baseText = rb.stdout;
      } else if (stages === '23') baseText = '';
      else {
        writeOut(`DECISIONS_LEFT ${p} stages=${stages}\n`);
        continue;
      }
      const ro = git(top, ['show', `:2:${p}`]);
      const rt = git(top, ['show', `:3:${p}`]);
      if (ro.status !== 0 || rt.status !== 0) {
        writeOut(`DECISIONS_LEFT ${p} read-stage\n`);
        continue;
      }
      // 그 쪽 블록 중 merge-base 에 없던 머리만 우리 쪽 뒤에 붙인다.
      const bb = new Map(tokenize(baseText).map((o) => [o.head, o.body]));
      const ob = new Set(tokenize(ro.stdout).map((o) => o.head));
      const th = tokenize(rt.stdout);
      let edited = false, add = '';
      for (const o of th) {
        if (bb.has(o.head)) {
          if (bb.get(o.head) !== o.body) {
            edited = true;
            break;
          }
          continue;
        }
        if (ob.has(o.head)) continue;
        add += '\n' + o.body + '\n';
      }
      if (edited) {
        writeOut(`DECISIONS_LEFT ${p} edited-existing-block\n`);
        continue;
      }
      if (!dlock(p)) {
        writeOut(`DECISIONS_LEFT ${p} lock\n`);
        continue;
      }
      const ours = ro.stdout;
      const out = ours + ((ours !== '' && !ours.endsWith('\n')) ? '\n' : '') + add;
      let ok = false;
      try {
        fs.writeFileSync(path.join(top, p), out);
        ok = git(top, ['add', '--', p]).status === 0;
      } catch { /* 무시 */ }
      writeOut(ok ? `DECISIONS_RESOLVED ${p}\n` : `DECISIONS_LEFT ${p} write\n`);
      dunlock(p);
    }
    cleanup();
    return finish(OK);
  }

  if (cmd !== 'renumber') return dieUsage();

  const readTop = (p) => {
    try {
      return fs.readFileSync(path.join(top, p), 'utf8');
    } catch {
      return null;
    }
  };

  // -- renumber --
  const lfr = git(top, ['ls-files']);
  if (lfr.status !== 0) {
    writeOut('RENUMBER_FAILED ls-files\n');
    cleanup();
    return finish(1);
  }
  const dfiles = [];
  for (const p of splitRaw(lfr.stdout)) {
    if (isClaude(p)) continue;
    if (!isDecisions(p)) continue;
    try {
      if (fs.statSync(path.join(top, p)).isFile()) dfiles.push(p);
    } catch { /* 없음 */ }
  }
  for (const p of dfiles) {
    if (!dlock(p)) {
      writeOut(`RENUMBER_FAILED lock ${p}\n`);
      cleanup();
      return finish(1);
    }
  }
  const clean1 = git(top, ['diff', '--quiet']).status === 0;
  const clean2 = git(top, ['diff', '--cached', '--quiet']).status === 0;
  const unmerged = splitRaw(git(top, ['ls-files', '-u']).stdout).length > 0;
  if (!clean1 || !clean2 || unmerged) {
    writeOut('RENUMBER_DIRTY\n');
    cleanup();
    return finish(1);
  }

  // 0) 전역 번호 중복 바로잡기(HEAD 가 머지 커밋일 때만).
  const dupmap = []; // [파일, 옛번호, 새번호, 모호0|1]
  let P1 = '', P2 = '', MB = '';
  let mfiles = [];
  if (git(top, ['rev-parse', '-q', '--verify', 'HEAD^2']).status === 0) {
    const r1 = git(top, ['rev-parse', 'HEAD^1']);
    const r2 = git(top, ['rev-parse', 'HEAD^2']);
    if (r1.status !== 0 || r2.status !== 0) return fail('rev-parse');
    P1 = r1.stdout.replace(/\n+$/, '');
    P2 = r2.stdout.replace(/\n+$/, '');
    MB = git(top, ['merge-base', P1, P2]).stdout.split('\n')[0] ?? '';
    const dm = git(top, ['diff', '--name-only', P1, 'HEAD']);
    if (dm.status === 0) mfiles = splitRaw(dm.stdout);
  }
  const showRev = (rev, p) => {
    const r = git(top, ['show', `${rev}:${p}`]);
    return r.status === 0 ? r.stdout : '';
  };
  const headsOf = (text) => splitRaw(text).filter((l) => HRE.test(l));

  for (const p of dfiles) {
    const text = readTop(p) ?? '';
    const counts = new Map();
    for (const l of splitRaw(text)) {
      if (!HRE.test(l)) continue;
      const n = numOf(l);
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    const dups = byteSort([...counts.entries()].filter(([, c]) => c > 1).map(([n]) => fmtD(n)));
    if (!dups.length) continue;
    if (!P2 || !MB) {
      const why = !P2 ? 'not-a-merge' : 'no-merge-base';
      for (const dd of dups) writeOut(`DUP_LEFT ${p} ${dd} ${why}\n`);
      continue;
    }
    const hv1 = new Set(headsOf(showRev(P1, p)));
    const hv2 = new Set(headsOf(showRev(P2, p)));
    const hvb = new Set(headsOf(showRev(MB, p)));
    const inc = new Set([...hv2].filter((h) => !hvb.has(h) && !hv1.has(h)));
    // 1차: 블록 목록·최대 번호 → 옮길 블록과 새 번호. 2차: 다시 쓰기.
    const lines = splitRaw(text);
    const pre = [];
    const blocks = [];
    for (const line of lines) {
      if (line.startsWith('## ')) blocks.push({ head: line, lines: [line] });
      else if (blocks.length) blocks[blocks.length - 1].lines.push(line);
      else pre.push(line);
    }
    let max = 0;
    const cnt = new Map(), dev = new Map();
    const gl = blocks.map((b) => HRE.test(b.head));
    blocks.forEach((b, i) => {
      if (!gl[i]) return;
      const n = numOf(b.head);
      if (n > max) max = n;
      cnt.set(n, (cnt.get(n) ?? 0) + 1);
      if (!inc.has(b.head)) dev.set(n, (dev.get(n) ?? 0) + 1);
    });
    const mv = new Map(), to = new Map(), ot = new Map(), amb = new Set(), ambOrder = [];
    const keptinc = new Set(), devw = new Set(), nm = new Map();
    const markAmb = (t) => {
      if (!amb.has(t)) {
        amb.add(t);
        ambOrder.push(t);
      }
    };
    blocks.forEach((b, i) => {
      if (!gl[i]) return;
      const n = numOf(b.head);
      if ((cnt.get(n) ?? 0) < 2) return;
      const t = tokOf(b.head);
      if (!inc.has(b.head)) {
        if ((dev.get(n) ?? 0) > 1 && !devw.has(n)) {
          devw.add(n);
          writeOut(`DUP_LEFT ${p} ${fmtD(n)} dev-side\n`);
        }
        return;
      }
      if (!(dev.get(n) ?? 0) && !keptinc.has(n)) {
        keptinc.add(n);
        markAmb(t);
        return;
      }
      max++;
      nm.set(t, (nm.get(t) ?? 0) + 1);
      if ((nm.get(t) ?? 0) > 1) markAmb(t);
      to.set(t, fmtD(max));
      ot.set(i, t);
      mv.set(i, max);
    });
    for (const i of [...mv.keys()].sort((a, b) => a - b)) {
      const t = ot.get(i);
      dupmap.push([p, t, fmtD(mv.get(i)), amb.has(t) ? 1 : 0]);
    }
    for (const t of ambOrder) {
      if (to.has(t)) writeOut(`DUP_LEFT ${p} ${t} ambiguous-refs\n`);
    }
    const toBody = new Map([...to.entries()].filter(([t]) => !amb.has(t)));
    const isin = blocks.map((b) => inc.has(b.head));
    let o = pre.length ? pre.join('\n') + '\n' : '';
    const movedIdx = [];
    blocks.forEach((b, i) => {
      let body;
      if (mv.has(i)) {
        const t = ot.get(i);
        body = '## ' + to.get(t) + b.head.slice(3 + t.length) + '\n- **Renumbered from**: ' + t + ' (중복 번호)';
        movedIdx.push(i);
      } else body = b.head;
      for (let k = 1; k < b.lines.length; k++) {
        const ln = b.lines[k];
        body += '\n' + ((isin[i] || mv.has(i)) ? substNonHead(ln, toBody, DNUM_RE) : ln);
      }
      if (!mv.has(i)) o += body + '\n';
      else blocks[i].newBody = body;
    });
    if (movedIdx.length) {
      o = o.replace(/\n+$/, '');
      for (const i of movedIdx) o += '\n\n' + blocks[i].newBody.replace(/\n+$/, '');
      o += '\n';
    }
    if (o !== text) {
      try {
        fs.writeFileSync(path.join(top, p), o);
      } catch {
        return fail(`dup ${p}`);
      }
      changed.add(p);
    }
  }

  // 0-1) 옮긴 번호의 참조 치환 — 머지 대상이 더하거나 바꾼 파일만 본다.
  if (dupmap.length) {
    const bd = git(top, ['diff', '--name-only', MB, P2]);
    if (bd.status !== 0) return fail('diff branch');
    const bfiles = splitRaw(bd.stdout);
    const dd = git(top, ['diff', '--name-only', MB, P1]);
    if (dd.status !== 0) return fail('diff dev');
    const devf = new Set(splitRaw(dd.stdout));
    const dupf = new Set(dupmap.map((r) => r[0]));
    const othernums = new Set();
    for (const f of bfiles) {
      if (isClaude(f)) continue;
      // sh 판과 같은 제외: decisions 파일이 아니거나 dup 대상 파일이면 건너뛴다.
      if (!(isDecisions(f) && !dupf.has(f))) continue;
      const ft = readTop(f) ?? '';
      for (const l of splitRaw(ft)) {
        if (!HRE.test(l)) continue;
        othernums.add(numOf(l));
      }
    }
    const cntOld = new Map(), toOld = new Map(), ambOld = new Set();
    for (const [, old, nw, am] of dupmap) {
      cntOld.set(old, (cntOld.get(old) ?? 0) + 1);
      toOld.set(old, nw);
      if (am) ambOld.add(old);
    }
    const toks = new Map(); // 옛번호 -> 새번호('-' = 모호)
    for (const [old, nw] of toOld) {
      const n = parseInt(old.slice(2), 10);
      toks.set(old, ((cntOld.get(old) ?? 0) > 1 || ambOld.has(old) || othernums.has(n)) ? '-' : nw);
    }
    for (const f of bfiles) {
      if (isClaude(f)) continue;
      let fbuf;
      try {
        fbuf = fs.readFileSync(path.join(top, f));
      } catch {
        continue;
      }
      if (dupf.has(f)) continue;
      if (fbuf.includes(0) || !/D-[0-9]+/.test(fbuf.toString('utf8'))) continue;
      const ftext = fbuf.toString('utf8');
      let why = '';
      if (isDecisions(f)) why = 'decisions';
      else if (devf.has(f)) why = 'dev-changed';
      const fb = showRev(MB, f);
      const inb = new Set();
      for (const l of splitRaw(fb)) {
        for (const m of l.match(/D-[0-9]+/g) ?? []) if (toks.has(m)) inb.add(m);
      }
      const outLines = [];
      const done = [];
      const doneSet = new Set();
      splitRaw(ftext).forEach((line, idx) => {
        if (HRE.test(line)) {
          outLines.push(line);
          return;
        }
        const nl = line.replace(/D-[0-9]+/g, (m, off, s) => {
          const prev = off === 0 ? '' : s[off - 1];
          if (!toks.has(m) || /[A-Za-z0-9_-]/.test(prev)) return m;
          let r = why;
          if (!r && inb.has(m)) r = 'base-mention';
          if (!r && toks.get(m) === '-') r = 'ambiguous';
          if (r) {
            writeOut(`DUP_REF_AMBIGUOUS ${f}:${idx + 1} ${m} ${r}\n`);
            return m;
          }
          if (!doneSet.has(m)) {
            doneSet.add(m);
            done.push(`${m}→${toks.get(m)}`);
          }
          return toks.get(m);
        });
        outLines.push(nl);
      });
      if (done.length) {
        // awk print 는 줄마다 개행을 붙인다(원본 끝 개행이 없어도 생긴다).
        const nt = outLines.join('\n') + '\n';
        if (nt !== ftext) {
          try {
            fs.writeFileSync(path.join(top, f), nt);
          } catch {
            return fail(`dup refs ${f}`);
          }
          changed.add(f);
          writeOut(`DUP_REF_REPLACED ${f} ${done.join(',')}\n`);
        }
      }
    }
  }

  // 1) 수집: NEW(머리 순서) · OLD(이미 매긴 것의 Temp ID 줄) · MAX(파일별 최대 전역 번호).
  const scan = []; // [NEW|OLD|MAX, a, b]
  for (const p of dfiles) {
    const text = readTop(p) ?? '';
    let max = 0, cur = '';
    for (const line of splitRaw(text)) {
      if (HRE.test(line)) {
        const n = numOf(line);
        if (n > max) max = n;
        cur = fmtD(n);
        continue;
      }
      const nm = /^## (\S+)( |$)/.exec(line);
      if (nm && /^D-TSK(?:-[0-9]+)+$/.test(nm[1])) {
        scan.push(['NEW', p, nm[1]]);
        cur = '';
        continue;
      }
      if (line.startsWith('## ')) {
        cur = '';
        continue;
      }
      const om = /^- \*\*Temp ID\*\*: *(D-TSK(?:-[0-9]+)+) *$/.exec(line);
      if (om && cur !== '') {
        scan.push(['OLD', om[1], cur]);
        continue;
      }
    }
    scan.push(['MAX', p, max]);
  }

  const cntNew = new Map(), hasOld = new Set();
  for (const [k, a, b] of scan) {
    if (k === 'NEW') cntNew.set(b, (cntNew.get(b) ?? 0) + 1);
    else if (k === 'OLD') hasOld.add(a);
  }
  const dupIds = byteSort([...cntNew.entries()].filter(([id, c]) => c > 1 || hasOld.has(id)).map(([id]) => id));
  for (const d of dupIds) writeOut(`RENUMBER_DUP ${d}\n`);
  const dupSet = new Set(dupIds);

  // 2) 번호 배정: 파일마다 그 파일의 최대 전역 번호 + 1 부터 머리 순서대로.
  // sh 판 awk 처럼 MAX 행을 먼저 전부 읽고(이미 매긴 번호 기준) NEW·OLD 행을 순서대로 처리한다.
  const maxOf = new Map();
  for (const [k, a, b] of scan) {
    if (k === 'MAX') maxOf.set(a, b);
  }
  const idMap = []; // [임시ID, D-NNN, 파일] (OLD 는 파일 '-')
  for (const [k, a, b] of scan) {
    if (k === 'MAX') continue;
    if (k === 'NEW') {
      if (dupSet.has(b)) continue;
      const m = (maxOf.get(a) ?? 0) + 1;
      maxOf.set(a, m);
      idMap.push([b, fmtD(m), a]);
    } else if (k === 'OLD') {
      if (dupSet.has(a)) continue;
      idMap.push([a, b, '-']);
    }
  }
  const renames = idMap.filter(([, , f]) => f !== '-');

  // 3) 머리 바꾸기(+ Temp ID 줄).
  if (renames.length) {
    const rfiles = byteSort([...new Set(renames.map(([, , f]) => f))]);
    const toFile = new Map(); // 파일 -> Map(임시ID -> D-NNN)
    for (const [id, num, f] of renames) {
      if (!toFile.has(f)) toFile.set(f, new Map());
      toFile.get(f).set(id, num);
    }
    for (const p of rfiles) {
      const text = readTop(p) ?? '';
      const map = toFile.get(p);
      const nl = splitRaw(text).map((line) => {
        if (!/^## D-TSK(?:-[0-9]+)+( |$)/.test(line)) return [line];
        const id = line.split(' ')[1] ?? '';
        if (!map.has(id)) return [line];
        const rest = line.slice(3 + id.length);
        return [`## ${map.get(id)}${rest}`, `- **Temp ID**: ${id}`];
      }).flat();
      // awk print 는 줄마다 개행을 붙인다(빈 파일은 그대로 둔다).
      const nt = nl.length ? nl.join('\n') + '\n' : '';
      if (nt !== text) {
        try {
          fs.writeFileSync(path.join(top, p), nt);
        } catch {
          return fail(`rewrite ${p}`);
        }
        changed.add(p);
      }
    }
  }

  // 4) 추적 파일 전체의 참조 치환(.claude/ 제외).
  if (idMap.length) {
    const refMap = new Map(idMap.map(([id, num]) => [id, num]));
    const gr = git(top, ['grep', '-l', '-I', '-E', 'D-TSK(-[0-9]+)+', '--', '.', ':(exclude).claude']);
    const reffiles = gr.status === 0 ? splitRaw(gr.stdout) : [];
    for (const p of reffiles) {
      let pbuf;
      try {
        pbuf = fs.readFileSync(path.join(top, p));
      } catch {
        continue;
      }
      if (!pbuf.length || pbuf.includes(0)) continue;
      const text = pbuf.toString('utf8');
      const nl = splitRaw(text).map((line) => {
        if (/^- \*\*Temp ID\*\*:/.test(line)) return line;
        return substLine(line, refMap, TSK_RE);
      });
      const nt = nl.length ? nl.join('\n') + '\n' : '';
      if (nt !== text) {
        try {
          fs.writeFileSync(path.join(top, p), nt);
        } catch {
          return fail(`refs ${p}`);
        }
        changed.add(p);
      }
    }
  }

  // merge=union 경고.
  for (const p of dfiles) {
    const ca = git(top, ['check-attr', 'merge', '--', p]);
    if (ca.status === 0 && splitRaw(ca.stdout).some((l) => l.endsWith(': merge: union'))) {
      writeOut(`UNION_SET ${p}\n`);
    }
  }

  const changedU = byteSort([...changed]);
  const seqSet = new Set([...mfiles, ...changedU]);
  const seqFiles = byteSort([...seqSet]);
  for (const p of seqFiles) {
    if (isClaude(p)) continue;
    if (!isDecisions(p)) continue;
    const text = readTop(p);
    if (text === null) continue;
    let i = 0;
    for (const line of splitRaw(text)) {
      if (!HRE.test(line)) continue;
      i++;
      const n = numOf(line);
      if (n !== i) {
        writeOut(`DECISIONS_SEQ ${p} at=${i} found=${fmtD(n)} want=${fmtD(i)}\n`);
        break;
      }
    }
  }

  if (!changedU.length) {
    writeOut('NO_TEMP_IDS\n');
    cleanup();
    return finish(OK);
  }

  for (const [f, old, nw] of dupmap) writeOut(`DUP_RENUMBERED ${old}=${nw} ${f}\n`);
  for (const [id, num, f] of renames) writeOut(`RENUMBERED ${id}=${num} ${f}\n`);
  writeOut(`REFS ${changedU.length}\n`);
  for (const p of changedU) {
    if (git(top, ['add', '--', p]).status !== 0) return fail(`add ${p}`);
  }
  const sumParts = [...dupmap.map(([, old, nw]) => `${old}→${nw}(중복)`),
    ...renames.map(([id, num]) => `${id}→${num}`)];
  const summary = sumParts.join(', ') || '남은 임시 ID 참조 치환';
  const subject = `chore${tsk ? `(${tsk})` : ''}: 결정 번호 매김 (${summary})`;
  let body = '공용 decisions.md 의 임시 ID 를 머지 시점의 다음 전역 번호로 바꾼다(/dflow-merge 결정 번호 매김).';
  if (dupmap.length) body += ' 머지 대상이 직접 매겨 개발 브랜치와 겹친 전역 번호는 개발 브랜치 쪽을 두고 머지 대상 쪽을 다음 번호로 옮긴다(옛 번호는 Renumbered from 줄).';
  const cargs = ['commit', '-q', '-m', subject, '-m', body];
  if (order) cargs.push('--trailer', `DFlow-Order: ${order}`);
  if (git(top, cargs).status !== 0) return fail('commit');
  writeOut(`COMMITTED ${git(top, ['rev-parse', 'HEAD']).stdout.replace(/\n+$/, '')}\n`);
  cleanup();
  return finish(OK);
}

finish(main(process.argv.slice(2)));
