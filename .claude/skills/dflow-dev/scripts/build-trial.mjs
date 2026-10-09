#!/usr/bin/env node
// build-trial.mjs — /dflow-dev Phase 01 5번의 Build 모델 시험 판정. build-trial.sh 의 node 판.
// 배정표가 opus 로 정한 Build 중 일부를 sonnet 으로 돌릴지 정한다.
// 규칙의 정본은 dflow-dev/references/dev-discipline.md 「Build 모델 시험(build_model_trial)」 이고, 이 스크립트는 그 실행체다.
//
// 사용: build-trial.mjs <external_ref> <build_model_base>   cwd = 리포(워크트리) 루트
//   <external_ref> 는 show 의 item.external_ref(모듈 접두 `dict/TSK-02-05` 도 된다). 비율 판정은 마지막 칸(state.json `tsk`)으로 한다.
//   <build_model_base> 는 배정표가 정한 Build 모델(opus|sonnet 또는 전체 id).
// 설정(.dflow.local, 개인 — dflow-work/scripts/dflow-config.sh): 이미 export 된 env 가 이긴다.
//   build_model_trial=sonnet          (DFLOW_BUILD_MODEL_TRIAL — 비면 꺼짐. sonnet 밖의 값은 꺼짐으로 본다: haiku Build 금지)
//   build_model_trial_rate=<0~100>    (DFLOW_BUILD_MODEL_TRIAL_RATE — 비율%. 목록이 비었을 때만 쓴다)
//   build_model_trial_tasks=<목록>    (DFLOW_BUILD_MODEL_TRIAL_TASKS — 쉼표. TSK-02-05·TSK-02(접두)·WP-02·dict/WP-02. 있으면 비율보다 우선)
// 출력 한 줄(늘 exit 0, 인자가 틀리면 exit 2):
//   BUILD_TRIAL on  model=sonnet reason=<list|rate> bucket=<n>
//   BUILD_TRIAL off reason=<disabled|unsupported|base|not-listed|rate|bad-rate> bucket=<n|->
// bucket 은 TSK 문자열의 POSIX cksum 첫 값 mod 100 이다 — 같은 TSK 는 어느 PC·재개에서도 같은 값이다.
// 판정은 Phase 01 에서 한 번만 하고 state.json 에 적는다. 재개는 state.json 값을 쓰고 이 스크립트를 다시 부르지 않는다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const out = (s) => { for (;;) { try { fs.writeSync(1, s); return; } catch (e) { if (e.code !== 'EAGAIN') return; } } };
const err = (s) => { for (;;) { try { fs.writeSync(2, s); return; } catch (e) { if (e.code !== 'EAGAIN') return; } } };

// POSIX cksum (확인: `printf %s TSK-02-05 | cksum` = 2605955225).
const CRC_POLY = 0x04c11db7;
const CRC_TAB = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n << 24;
  for (let k = 0; k < 8; k++) c = (c & 0x80000000) ? ((c << 1) ^ CRC_POLY) : (c << 1);
  CRC_TAB[n] = c >>> 0;
}
function cksumFirst(buf) {
  let crc = 0;
  for (const b of buf) crc = ((crc << 8) ^ CRC_TAB[((crc >>> 24) ^ b) & 0xff]) >>> 0;
  let len = buf.length;
  while (len > 0) { crc = ((crc << 8) ^ CRC_TAB[((crc >>> 24) ^ (len & 0xff)) & 0xff]) >>> 0; len >>>= 8; }
  return (~crc) >>> 0;
}

// dflow-config.sh 의 읽기 규칙을 세 키에만 적용한다: 이미 export 된 env 가 이기며,
// 파일(.dflow.local 먼저·.dflow 나중 — 둘 다 받는 키는 먼저 쓴 쪽이 이긴다)의 값을 실행하지 않고 읽는다.
function parseKv(text) {
  const rows = [];
  const lines = text.replace(/\r$/, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/\r$/, '').replace(/^[ \t]+/, '');
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue; // BAD_LINE — build-trial 판정과 무관하므로 건너뛴다
    let k = line.slice(0, eq).replace(/[ \t]+$/, '');
    let v = line.slice(eq + 1).replace(/^[ \t]+/, '').replace(/[ \t]+#.*$/, '').replace(/[ \t]+$/, '');
    rows.push([k, v]);
  }
  return rows;
}
function configTop() {
  if (process.env.DFLOW_CONFIG_DIR) return process.env.DFLOW_CONFIG_DIR;
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true });
  if (r.status === 0 && typeof r.stdout === 'string' && r.stdout.trim() !== '') return r.stdout.trim();
  return '';
}
function loadTrialConfig() {
  // dflow-config.sh 와 같은 조건: 이미 export 된 env 가 이기고, 개인 키(trial 3종)는
  // .dflow.local 에서만 오며, .dflow(파일 또는 origin/<dev>·origin/HEAD 안)가 있을 때만 적용된다.
  // 둘 중 하나라도 없으면 dflow_config_load 가 오류로 끝나 값을 세팅하지 않는다(.sh 는 `|| :` 로 무시).
  // 레거시 .env 경로는 trial 키와 무관하므로 다루지 않는다.
  const need = [];
  if (!process.env.DFLOW_BUILD_MODEL_TRIAL) need.push('build_model_trial');
  if (!process.env.DFLOW_BUILD_MODEL_TRIAL_RATE) need.push('build_model_trial_rate');
  if (!process.env.DFLOW_BUILD_MODEL_TRIAL_TASKS) need.push('build_model_trial_tasks');
  if (need.length === 0) return;
  const top = configTop();
  if (!top) return;
  const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
  const localText = read(path.join(top, '.dflow.local'));
  if (localText === null) return;
  let dotText = read(path.join(top, '.dflow'));
  if (dotText === null) {
    // detach 된 옛 커밋의 폴백: 개발 브랜치의 .dflow 를 git show 로 찾는다(dflow-config.sh 와 같은 순서).
    let dev = process.env.DFLOW_DEV_BRANCH ?? '';
    if (!dev) {
      for (const [k, v] of parseKv(localText)) if (k === 'dev_branch' && v !== '') { dev = v; break; }
    }
    const refs = [...(dev ? [`origin/${dev}`] : []), 'origin/HEAD'];
    for (const r of refs) {
      const g = spawnSync('git', ['-C', top, 'show', `${r}:.dflow`], { encoding: 'utf8', windowsHide: true });
      if (g.status === 0 && typeof g.stdout === 'string') { dotText = g.stdout; break; }
    }
    if (dotText === null) return;
  }
  void dotText;
  const envName = (k) => (k === 'build_model_trial' ? 'DFLOW_BUILD_MODEL_TRIAL'
    : k === 'build_model_trial_rate' ? 'DFLOW_BUILD_MODEL_TRIAL_RATE' : 'DFLOW_BUILD_MODEL_TRIAL_TASKS');
  // _dfc_apply 는 비어 있는 변수만 채운다(먼저 쓴 쪽이 이긴다) — 개인 키는 .dflow.local 것만 쓴다.
  for (const [k, v] of parseKv(localText)) {
    if (!need.includes(k)) continue;
    const n = envName(k);
    if (!process.env[n]) process.env[n] = v;
  }
}

const stripSpaces = (s) => s.replace(/[ \r]/g, '');
const n0 = (s) => { const v = s.replace(/^0*/, ''); return v === '' ? '0' : v; };

function main(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    out('사용: build-trial.mjs <external_ref> <build_model_base>\n출력: BUILD_TRIAL on|off … bucket=<n> (늘 exit 0, 인자가 틀리면 exit 2)\n');
    return 0;
  }
  if (argv.length !== 2 || argv[0] === '' || argv[1] === '') {
    err('사용: build-trial.mjs <external_ref> <build_model_base>\n');
    return 2;
  }
  const ref = argv[0];
  const base = argv[1];
  const slash = ref.lastIndexOf('/');
  const tsk = slash === -1 ? ref : ref.slice(slash + 1);
  const mod = slash === -1 ? '' : ref.slice(0, slash);

  loadTrialConfig();

  const trial = stripSpaces(process.env.DFLOW_BUILD_MODEL_TRIAL ?? '');
  const rate = stripSpaces(process.env.DFLOW_BUILD_MODEL_TRIAL_RATE ?? '');
  const list = stripSpaces(process.env.DFLOW_BUILD_MODEL_TRIAL_TASKS ?? '');

  const bucket = cksumFirst(Buffer.from(tsk, 'utf8')) % 100;

  if (trial === '') { out(`BUILD_TRIAL off reason=disabled bucket=${bucket}\n`); return 0; }
  if (trial !== 'sonnet') { out(`BUILD_TRIAL off reason=unsupported bucket=${bucket}\n`); return 0; }
  if (!base.includes('opus')) { out(`BUILD_TRIAL off reason=base bucket=${bucket}\n`); return 0; }

  if (list !== '') {
    let wpn = '';
    const m = /^TSK-([0-9][0-9]*)-.*$/.exec(tsk);
    if (m) wpn = n0(m[1]);
    for (const e of list.split(',').filter((x) => x !== '')) {
      const s = e.lastIndexOf('/');
      const emod = s === -1 ? '' : e.slice(0, s);
      const eid = s === -1 ? e : e.slice(s + 1);
      if (emod !== '' && emod !== mod) continue;
      if (eid.startsWith('WP-')) {
        const en = eid.slice(3);
        if (!/^[0-9]+$/.test(en)) continue;
        if (wpn !== '' && n0(en) === wpn) {
          out(`BUILD_TRIAL on model=sonnet reason=list bucket=${bucket}\n`);
          return 0;
        }
      } else if (tsk === eid || tsk.startsWith(`${eid}-`)) {
        out(`BUILD_TRIAL on model=sonnet reason=list bucket=${bucket}\n`);
        return 0;
      }
    }
    out(`BUILD_TRIAL off reason=not-listed bucket=${bucket}\n`);
    return 0;
  }

  if (!/^[0-9]+$/.test(rate) || Number(rate) > 100) {
    out(`BUILD_TRIAL off reason=bad-rate bucket=${bucket}\n`);
    return 0;
  }
  if (bucket < Number(rate)) out(`BUILD_TRIAL on model=sonnet reason=rate bucket=${bucket}\n`);
  else out(`BUILD_TRIAL off reason=rate bucket=${bucket}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
