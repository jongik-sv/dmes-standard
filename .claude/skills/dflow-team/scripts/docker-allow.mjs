#!/usr/bin/env node
// /dflow-team 도커 허용 판정 — 포인터의 DOCKER 값을 작업의 서버 tags 로 정한다. (옛 docker-allow.sh 를 node 로 옮긴 것.)
// 사용: docker-allow.mjs <id8|order UUID> [--reuse-dir <dir>] | docker-allow.mjs --json (show 응답 JSON 을 stdin 으로)
// 출력 한 줄(stdout), 늘 exit 0: DOCKER=allow tag=docker · DOCKER=ban tag=none · DOCKER=ban show-failed
// node 18.17 이상, 외부 패키지 없음.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USAGE = '사용법: docker-allow.mjs <id8|order> [--reuse-dir <dir>] | --json';
const HELP = '/dflow-team 도커 허용 판정 — 포인터의 DOCKER 값을 작업의 서버 tags 로 정한다.\n'
  + USAGE + '\n'
  + '출력 한 줄, 늘 exit 0: DOCKER=allow tag=docker · DOCKER=ban tag=none · DOCKER=ban show-failed\n';

function dflowBin(env, cwd) {
  if (env.DFLOW_SH) return env.DFLOW_SH;
  return path.join(HERE, '..', '..', 'dflow-work', 'scripts', 'dflow.mjs');
}

function decide(jsonText) {
  let j;
  try { j = JSON.parse(jsonText); } catch { return 'DOCKER=ban show-failed'; }
  if (j === null || typeof j !== 'object' || Array.isArray(j)) return 'DOCKER=ban show-failed';
  const order = j.order;
  if (order === null || typeof order !== 'object' || Array.isArray(order)) return 'DOCKER=ban show-failed';
  const oid = (order.id === null || order.id === undefined || order.id === false) ? '' : order.id;
  if (oid === '') return 'DOCKER=ban show-failed';
  const tags = (order.item !== null && typeof order.item === 'object' && !Array.isArray(order.item) && order.item.tags !== null && order.item.tags !== undefined)
    ? order.item.tags : [];
  if (!Array.isArray(tags)) return 'DOCKER=ban show-failed';
  let lowered;
  try {
    lowered = tags.map((t) => {
      if (typeof t !== 'string') throw new Error('tag');
      return t.replace(/[A-Z]/g, (c) => c.toLowerCase());
    });
  } catch { return 'DOCKER=ban show-failed'; }
  return lowered.includes('docker') ? 'DOCKER=allow tag=docker' : 'DOCKER=ban tag=none';
}

function main(argv, env = process.env, cwd = process.cwd()) {
  for (const a of argv) {
    if (a === '-h' || a === '--help') { process.stdout.write(HELP); return 0; }
  }
  let json = '';
  if (argv[0] === '--json' && argv.length === 1) {
    try { json = fs.readFileSync(0, 'utf8'); } catch { json = ''; }
  } else if (argv.length >= 1 && argv[0] !== '' && !argv[0].startsWith('-')) {
    const ref = argv[0];
    if (argv.length === 1) { /* show 로 읽는다 */ }
    else if (argv.length === 3 && argv[1] === '--reuse-dir' && argv[2] !== '') {
      const f = path.join(argv[2], `show-${ref.slice(0, 8)}.json`);
      try {
        const st = fs.statSync(f);
        if (st.isFile()) {
          const age = Math.floor(Date.now() / 1000) - Math.floor(st.mtimeMs / 1000);
          if (age < 5 * 60) {
            try {
              const t = fs.readFileSync(f, 'utf8');
              const j = JSON.parse(t);
              const oid = j?.order?.id ?? '';
              if (oid !== '' && String(oid).startsWith(ref)) json = t;
            } catch { /* 못 쓰면 show 로 다시 읽는다 */ }
          }
        }
      } catch { /* 없음 */ }
      try { fs.unlinkSync(f); } catch { /* 무시 */ }
    } else { process.stderr.write(USAGE + '\n'); return 2; }
    if (json === '') {
      const DFLOW = dflowBin(env, cwd);
      try {
        const r = DFLOW.endsWith('.mjs')
          ? spawnSync(process.execPath, [DFLOW, 'show', ref], { encoding: 'utf8', windowsHide: true })
          : spawnSync(DFLOW, ['show', ref], { encoding: 'utf8', windowsHide: true });
        if (!r.error && r.status === 0) json = r.stdout ?? '';
      } catch { /* 모르면 금지 */ }
    }
  } else { process.stderr.write(USAGE + '\n'); return 2; }
  process.stdout.write(decide(json) + '\n');
  return 0;
}

// 직접 실행·심링크 경로에서도 늘 main 을 실행한다(진입 가드 없음).
{
  let rc = 0;
  try { rc = main(process.argv.slice(2)); } catch (e) {
    try { process.stdout.write('DOCKER=ban show-failed\n'); } catch { /* 무시 */ }
    rc = 0;
  }
  process.exitCode = rc ?? 0;
}

