#!/usr/bin/env node
// timeout-guard.mjs — 긴 명령을 timeout 없이 부르지 못하게 막는 PreToolUse(Bash) 가드 훅 (timeout-guard.sh 의 node 이식).
// 사용법: stdin 으로 PreToolUse 훅 JSON(tool_name, tool_input.command·timeout·run_in_background)을 받는다.  --help = 이 도움말.
// 판정(명령 위치에 오는 대상만 본다):
//   대상  heavy.sh|heavy.mjs(하위 명령 status·snapshot·release·없음 제외), baseline.sh|mjs run, deps.sh|mjs,
//         gradlew, mvn, mvnw, playwright test(npx·pnpm·yarn 접두 포함). sh|bash <스크립트>, sh -c '<문자열>', node [옵션] <스크립트> 도 따라 들어간다.
//   1. 서버 기동(gradlew·mvn 의 bootRun·spring-boot:run)은 run_in_background: true 이거나 조각 끝이 & 면 통과(( )·{ } 묶음 뒤 & 포함).
//   2. 대상을 run_in_background: true 로 부르면 거부.
//   3. 대상인데 timeout 이 없거나 300000 미만이면 거부.
// 종료 코드: 거부 = stderr 이유 + exit 2, 그 밖(입력 불명·Bash 아님·내부 오류 포함)은 exit 0 (fail-open).

import fs from 'node:fs';
import { readStdinTextSync } from '../../_shared/node/io.mjs';

const USAGE = [
  'usage: <PreToolUse hook JSON> | node timeout-guard.mjs',
  '  stdin: tool_name, tool_input.command / timeout / run_in_background',
  '  target: heavy.sh|mjs (except status|snapshot|release), baseline.sh|mjs run, deps.sh|mjs, gradlew, mvn, mvnw, playwright test',
  '  reject: server-start not backgrounded / run_in_background on target / timeout < 300000 -> stderr + exit 2',
  '  else exit 0 (fail-open)',
].join('\n');

const SQ = "'";
const DQ = '"';
const PFX = new Set('then do else elif if while until { } ! time nohup exec command builtin rtk proxy'.split(' '));
const RETRY = '10분을 넘을 명령은 `node <dflow-dev>/scripts/heavy.mjs --detach <명령>` 으로 띄운 뒤 `heavy.mjs wait <id>` 를 끝날 때까지 반복 호출한다.';

// W 는 1부터 쓰는 낱말 배열(W[0] 은 자리표), nw 는 낱말 수.
function classify(W, nw, depth, out) {
  let k = 1;
  const srv = 0;
  let w, j;
  while (k <= nw) {
    w = W[k];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) { k++; continue; }
    if (/^[0-9]*&?[<>]/.test(w)) { if (/^[0-9]*&?[<>]+[&|]?$/.test(w)) k++; k++; continue; }
    if (PFX.has(w)) { k++; continue; }
    if (w === 'env' || w === 'nice' || w === 'sudo' || w === 'timeout' || w === 'gtimeout') {
      k++;
      while (k <= nw && /^-/.test(W[k])) { if (/^-[nuskC]$/.test(W[k])) k++; k++; }
      if ((w === 'timeout' || w === 'gtimeout') && k <= nw) k++;
      continue;
    }
    if (w === 'sh' || w === 'bash' || w === 'zsh' || w === 'dash') {
      j = k + 1;
      let cf = 0;
      while (j <= nw && /^-/.test(W[j])) { if (/^-[A-Za-z]*c/.test(W[j])) cf = 1; j++; }
      if (cf) { if (j <= nw && depth < 3) scan(W[j], depth + 1, out); return ''; }
      if (j <= nw) { k = j; continue; }
      return '';
    }
    if (w === 'node' || w === 'nodejs') {
      j = k + 1;
      while (j <= nw && /^-/.test(W[j])) {
        const o = W[j];
        if (o === '-e' || o === '--eval' || o === '-p' || o === '--print' || /^--(eval|print)=/.test(o) || /^-[pe]$/.test(o)) return '';
        if (o === '--require' || o === '-r' || o === '--import' || o === '--loader' || o === '--experimental-loader' || o === '--input-type' || o === '--conditions' || o === '-C') j++;
        j++;
      }
      if (j <= nw) { k = j; continue; }
      return '';
    }
    break;
  }
  if (k > nw) return '';
  let base = W[k].replace(/^[\s\S]*\//, '');
  if (base === 'heavy.sh' || base === 'heavy.mjs') {
    j = k + 1;
    while (j <= nw) {
      if (W[j] === '--pool') { j += 2; continue; }
      if (/^--pool=/.test(W[j])) { j++; continue; }
      break;
    }
    const v = j <= nw ? W[j] : '';
    if (v === 'status' || v === 'snapshot' || v === 'release' || v === '') return '';
    return base + ' ' + v + '\t' + srv;
  }
  if (base === 'baseline.sh' || base === 'baseline.mjs') { if (k + 1 <= nw && W[k + 1] === 'run') return base + ' run\t' + srv; return ''; }
  if (base === 'deps.sh' || base === 'deps.mjs') return base + '\t' + srv;
  if (base === 'gradlew' || base === 'mvn' || base === 'mvnw') {
    let s = srv;
    for (j = k + 1; j <= nw; j++) if (/bootRun|spring-boot:run/.test(W[j])) s = 1;
    return base + '\t' + s;
  }
  if (base === 'npx' || base === 'pnpm' || base === 'pnpx' || base === 'yarn' || base === 'bunx') {
    j = k + 1;
    while (j <= nw) {
      if (W[j] === '--filter' || W[j] === '-F' || W[j] === '-C' || W[j] === '--dir' || W[j] === '--cwd' || W[j] === '--package' || W[j] === '-p') { j += 2; continue; }
      if (/^-/.test(W[j]) || W[j] === 'exec' || W[j] === 'dlx') { j++; continue; }
      break;
    }
    k = j - 1;
    base = j <= nw ? W[j] : '';
  }
  if (base === 'playwright' && k + 2 <= nw && W[k + 2] === 'test') return 'playwright test\t' + srv;
  return '';
}

function flushGroup(bg, BUF, BAMP, bn, out) {
  for (let bi = 1; bi <= bn; bi++) out.push(BUF[bi] + '\t' + (bg ? 1 : BAMP[bi]));
}

function scan(s, depth, out) {
  const n = s.length;
  const ch = (p) => s.charAt(p - 1); // 1부터 세는 글자(범위 밖은 '')
  let i = 1, q = '', word = '', inw = 0, nw = 0, nh = 0, pdepth = 0, bn = 0;
  let W = [''];
  const hd = [], hs = [];
  const BUF = [], BAMP = [];
  let c, d;
  while (i <= n) {
    c = ch(i);
    if (q === SQ) { if (c === SQ) q = ''; else word += c; i++; continue; }
    if (q === DQ) {
      if (c === '\\') { d = ch(i + 1); if (d !== '\n') word += d; i += 2; continue; }
      if (c === DQ) q = ''; else word += c;
      i++; continue;
    }
    if (c === '\\') { d = ch(i + 1); if (d !== '\n') { word += d; inw = 1; } i += 2; continue; }
    if (c === SQ || c === DQ) { q = c; inw = 1; i++; continue; }
    if (c === ' ' || c === '\t') { if (inw) { W[++nw] = word; word = ''; inw = 0; } i++; continue; }
    if (c === '#' && !inw) { while (i <= n && ch(i) !== '\n') i++; continue; }
    if (c === '<' && ch(i + 1) === '<' && ch(i + 2) !== '<') {
      if (inw) { W[++nw] = word; word = ''; inw = 0; }
      i += 2;
      let strip = 0;
      if (ch(i) === '-') { strip = 1; i++; }
      while (ch(i) === ' ' || ch(i) === '\t') i++;
      let delim = '';
      while (i <= n) {
        d = ch(i);
        if (d === ' ' || d === '\t' || d === '\n' || d === ';' || d === '&' || d === '|' || d === '<' || d === '>' || d === '(' || d === ')') break;
        if (d !== SQ && d !== DQ && d !== '\\') delim += d;
        i++;
      }
      if (delim !== '') { nh++; hd[nh] = delim; hs[nh] = strip; }
      continue;
    }
    if (c === '&' && ch(i + 1) !== '&' && ((inw && /[<>]$/.test(word)) || ch(i + 1) === '>')) { word += c; inw = 1; i++; continue; }
    if (c === '\n' || c === ';' || c === '&' || c === '|' || c === '(' || c === ')' || c === '`') {
      if (inw) { W[++nw] = word; word = ''; inw = 0; }
      let amp = 0;
      if (c === '&') { if (ch(i + 1) === '&') i++; else amp = 1; }
      if (c === '|' && ch(i + 1) === '|') i++;
      if (nw > 0) {
        // `{ ...` 로 시작하는 조각은 중괄호 묶음에 들어간다.
        if (W[1] === '{') pdepth++;
        const res = classify(W, nw, depth, out);
        if (res !== '') {
          if (pdepth > 0) { bn++; BUF[bn] = res; BAMP[bn] = amp; } else out.push(res + '\t' + amp);
        }
        // 홀로 `}` 뿐인 조각 = 중괄호 묶음이 닫혔다.
        if (nw === 1 && W[1] === '}' && pdepth > 0) {
          pdepth--;
          if (pdepth === 0 && bn > 0) { flushGroup(amp, BUF, BAMP, bn, out); bn = 0; }
        }
      }
      nw = 0; W = ['']; i++;
      if (c === '(') pdepth++;
      if (c === ')') {
        if (pdepth > 0) pdepth--;
        if (pdepth === 0 && bn > 0) {
          // `)` 뒤(공백 건너뛰고)가 & (&& 아님)면 묶음 전체가 배경이다.
          let bg = 0, ii = i;
          while (ch(ii) === ' ' || ch(ii) === '\t') ii++;
          if (ch(ii) === '&' && ch(ii + 1) !== '&') bg = 1;
          flushGroup(bg, BUF, BAMP, bn, out); bn = 0;
        }
      }
      if (c === '\n' && nh > 0) {
        for (let h = 1; h <= nh; h++) {
          while (i <= n) {
            const e0 = s.indexOf('\n', i - 1);
            let line;
            if (e0 === -1) { line = s.slice(i - 1); i = n + 1; } else { line = s.slice(i - 1, e0); i = e0 + 2; }
            if (hs[h]) line = line.replace(/^\t+/, '');
            if (line === hd[h]) break;
          }
        }
        nh = 0;
      }
      continue;
    }
    word += c; inw = 1; i++;
  }
  if (inw) W[++nw] = word;
  if (nw > 0) {
    if (W[1] === '{') pdepth++;
    const res = classify(W, nw, depth, out);
    if (res !== '') {
      if (pdepth > 0) { bn++; BUF[bn] = res; BAMP[bn] = 0; } else out.push(res + '\t0');
    }
    if (nw === 1 && W[1] === '}' && pdepth > 0) {
      pdepth--;
      if (pdepth === 0 && bn > 0) { flushGroup(0, BUF, BAMP, bn, out); bn = 0; }
    }
  }
  // 끝까지 닫히지 않은 묶음(비정상 입력)은 배경 아님(0)으로 낸다 — fail-open.
  if (bn > 0) flushGroup(0, BUF, BAMP, bn, out);
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(USAGE + '\n');
    return;
  }
  let d;
  try { d = JSON.parse(readStdinTextSync()); } catch { return; }
  const ti = d && typeof d.tool_input === 'object' && d.tool_input !== null ? d.tool_input : {};
  const str = (v) => (typeof v === 'string' ? v : '');
  if (str(d && d.tool_name) !== 'Bash') return;
  const cmd = str(ti.command).replace(/\r/g, '');
  if (cmd === '') return;
  let n = 0;
  if (typeof ti.timeout === 'number') n = ti.timeout;
  else if (typeof ti.timeout === 'string' && ti.timeout.trim() !== '') n = Number(ti.timeout);
  n = Number.isFinite(n) ? Math.floor(n) : 0;
  const TO = n > 0 ? n : 0;
  const BG = ti.run_in_background === true;

  const hits = [];
  scan(cmd + '\n', 0, hits);
  for (const line of hits) {
    const [label, srv, amp] = line.split('\t');
    if (!label) continue;
    if (srv === '1' && (BG || amp === '1')) continue;
    if (BG) {
      process.stderr.write(`timeout-guard: \`${label}\` 를 run_in_background 로 부르지 않는다. 백그라운드 명령은 끝나도 서브에이전트가 완료 알림을 받지 못해 그대로 멈춘다. run_in_background 없이 Bash 의 timeout 을 300000~600000 으로 주고 다시 호출하라. ${RETRY}\n`);
      process.exitCode = 2;
      return;
    }
    if (TO >= 300000) continue;
    const now = TO > 0 ? `timeout ${TO}` : 'timeout 없음';
    const hint = srv === '1' ? ' E2E 서버를 띄우는 명령이면 run_in_background: true 로 부른다.' : '';
    process.stderr.write(`timeout-guard: \`${label}\` 는 오래 걸리는 명령이다(지금 ${now}). timeout 을 300000~600000 으로 주고 다시 호출하라. timeout 이 짧거나 없으면 120초 뒤 백그라운드로 옮겨지고 서브에이전트는 완료 알림을 받지 못한 채 멈춘다. ${RETRY}${hint}\n`);
    process.exitCode = 2;
    return;
  }
}

try { main(); } catch { process.exitCode = process.exitCode === 2 ? 2 : 0; }
