// scripts/stall-check.sh ↔ stall-check.mjs 대조 명세(kind 'script', 스위치 COORD_JS_STALL_CHECK).
//   · sh·mjs 는 fixtures/stall-parity.{sh,mjs} 래퍼다: 작업 폴더의 `.wt.json` 으로 워크트리용 git 리포를 만들고(커밋 시각·파일 mtime 은 gen 시점 기준 절대 시각),
//     스크립트를 돌린 뒤 tick 파일(sr/r1/ticks/stall-*)을 시각을 <NOW> 로 지우고 cpu= 항목을 정렬해 찍는다.
//   · ps·lsof 는 <WORK>/bin 의 가짜(FAKE_PS_TABLE·FAKE_LSOF_MAP). git·cksum·stat 은 진짜다.
//   · tick 파일은 스크립트 자신이 쓰는 파일이라 숫자·빈 값만 만든다(손상돼 `zz` 같은 글이 들어가면 bash 는 set -u 로 스크립트가 중단된다 — 의심 목록).
//   · 시간: quiet 분은 분 중간(+30초), 직전 관측(at)은 60초 임계에서 ±45초 이상 떨어뜨린다.
import { spawnSync } from 'node:child_process';
const NOW = () => Math.floor(Date.now() / 1000);

const FAKE_PS = { data: '#!/bin/sh\n[ -f "$FAKE_PS_TABLE" ] && cat "$FAKE_PS_TABLE"\nexit 0\n', mode: 0o755 };
const FAKE_LSOF = { data: `#!/bin/sh
pids=""; while [ $# -gt 0 ]; do case "$1" in -p) pids="$2" ;; esac; shift; done
oldIFS="$IFS"; IFS=','
for p in $pids; do
  c=$(awk -F'\\t' -v p="$p" '$1==p{print $2; exit}' "$FAKE_LSOF_MAP" | sed "s#<WORK>#$FAKE_WORK#")
  [ -n "$c" ] && { printf 'p%s\\n' "$p"; printf 'n%s\\n' "$c"; }
done
IFS="$oldIFS"
exit 0
`, mode: 0o755 };
const FAKE_HEAVY = { data: `#!/bin/sh
if [ "$1" = snapshot ] && [ -n "$FAKE_HEAVY" ]; then printf 'RUN\\t123\\t0\\tgradle\\t%s/wt/%s\\t00:01\\n' "$FAKE_WORK" "$FAKE_HEAVY"; fi
exit 0
`, mode: 0o755 };

const PROCS = [
  [100, 1, '0:05.00', '/bin/claude --session'], [200, 100, '0:01.23', '/usr/bin/java -jar app.jar'], [210, 200, '0:00.50', 'java -cp x Worker'],
  [300, 1, '0:02.00', 'node /x/vitest run'], [310, 300, '1:02:03', 'node child'], [400, 1, '0:10.00', 'gradle GradleDaemon 8'], [500, 100, '0:00.10', 'node mcp-server'],
  [600, 1, '1-02:03:04.5', '/x/gradlew test'], [610, 600, '12:34.56', 'org.gradle.launcher.GradleMain :x'], [700, 1, '0:00.00', 'awk {print}'],
  [710, 1, '5:00', 'npx tsc -b'], [720, 1, '0:03.30', 'typescript/bin/tsc --watch'], [730, 1, '0:03.30', 'node jest'], [740, 1, '0:03.30', 'unrelated'],
  [800, 740, '0:01.00', 'java other'], [900, 1, '0:07.77', 'java -Dbe.run.module=aps bootRun'], [910, 1, '0:00.40', 'GradleWorkerMain x'],
  [920, 1, '0:00.40', '/usr/bin/gradle --no-daemon test'], [930, 1, '0:00.40', 'Gradle Test Executor 3'],
];
const LANES = ['a1', 'b2'];

const cksumOf = (s) => spawnSync('cksum', [], { input: s, encoding: 'utf8' }).stdout.split(' ')[0];

function lane(rng, i, now) {
  const name = LANES[i];
  const files = {};
  const wtDir = `wt/${name}`;
  // 워크트리 안/밖 프로세스 표
  const rows = PROCS.filter(() => rng.chance(0.6));
  const insideCwd = `<WORK>/${wtDir}`;
  const lsof = rows.filter(() => rng.chance(0.9)).map(([p]) => `${p}\t${rng.chance(0.85) ? insideCwd : rng.pick(['/elsewhere', `<WORK>/${wtDir}x`, ''])}\n`).join('');
  // 산출물
  const old = now - 200000;
  const untracked = {};
  const mtimes = {};
  const nUnt = rng.pick([0, 0, 0, 0, 0, 1, 2, 3]);
  for (let k = 0; k < nUnt; k++) {
    const nm = rng.pick(['u1.txt', 'sub/u2.txt', 'u 3.txt', 'u"4.txt', 'z.log']);
    untracked[nm] = `x${k}\n`;
    mtimes[nm] = rng.pick([old, now - 30, now - 630, now - 1830, now - 4000]);
  }
  const w = { commitTs: rng.pick([old, old, old, old, now - 5000, now - 30]), files: { 'f.txt': 'a\n', 'g/h.txt': 'b\n' }, untracked, mtimes };
  const dirOk = !rng.chance(0.1);
  // 직전 tick: 목록이 비면 sig 는 빈 입력의 cksum(4294967295)이라 직전 관측과 같게 만들 수 있다 → STALL 쪽으로 가는 사례가 나온다
  let tick = null;
  if (rng.chance(0.85)) {
    const names = Object.keys(untracked).sort();
    const list = names.map((n) => `?? ${n.includes('"') || n.includes(' ') ? `"${n.replace(/"/g, '\\"')}"` : n}`).join('\n');
    const sig = names.length === 0 && rng.chance(0.85) ? '4294967295' : (rng.chance(0.4) ? cksumOf(list) : '12345');
    const secOf = (t) => { let d = 0, x = t; if (x.includes('-')) { const a = x.split('-'); d = Number(a[0]); x = a[1]; } return x.split(':').reduce((acc, v) => acc * 60 + Number(v), 0) + d * 86400; };
    const cpuPrev = rows.filter(() => rng.chance(0.85)).map(([p, , t]) => `${p}:${Math.max(0, secOf(t) - rng.pick([0, 0, 0, 0, 0, 0, 0, 0, 0, 0.4, 3])).toFixed(2)}`).join(',');
    tick = `at=${rng.pick([now - 200, now - 200, now - 200, now - 20, now - 5000, ''])}\nsig=${sig}\nchange_at=${rng.pick([now - 7230, now - 7230, now - 1230, now - 90, ''])}\ncpu=${cpuPrev}\n`;
  }
  return { name, rows, lsof, wt: { dir: wtDir, w, dirOk }, tick };
}

function build(rng) {
  const now = NOW();
  const files = {};
  const lanes = {};
  const wts = {};
  let rows = [];
  let lsof = '';
  const n = rng.pick([1, 1, 2]);
  const picked = [];
  for (let i = 0; i < n; i++) {
    const r = lane(rng, i, now);
    picked.push(r.name);
    const sess = rng.chance(0.5) ? { pid: 100, session_id: `sid-${r.name}` } : { pid: 0, session_id: `sid-${r.name}` };
    lanes[r.name] = { state: rng.pick(['active', 'active', 'active', 'done']), session: sess, worktree: r.wt.dir };
    if (r.wt.dirOk) wts[r.wt.dir] = r.wt.w;
    if (r.tick !== null) files[`sr/r1/ticks/stall-${r.name}`] = r.tick;
    if (i === 0) { rows = r.rows; lsof = r.lsof; }
    if (sess.pid === 0 && rng.chance(0.8)) files[`home/.claude/sessions/s-${r.name}.json`] = JSON.stringify({ sessionId: sess.session_id, pid: 100 });
  }
  files['sr/r1/state.json'] = JSON.stringify({ schema: 1, run: { id: 'r1' }, lanes });
  files['sr/current'] = 'r1\n';
  files['.wt.json'] = JSON.stringify({ wts });
  files['ps.txt'] = rows.map(([p, pp, t, a]) => `  ${p} ${pp} ${t} ${a}\n`).join('');
  files['lsof.txt'] = lsof;
  files['bin/ps'] = FAKE_PS; files['bin/lsof'] = FAKE_LSOF; files['heavy.sh'] = FAKE_HEAVY;
  const cfg = { heavy: { script: 'heavy.sh' } };
  if (rng.chance(0.3)) cfg.stall = { quiet_min: rng.pick([20, 5, 1, 'x', '010']) };
  files['.coord.local.json'] = JSON.stringify(cfg);
  const env = {
    COORD_RUN: 'r1', COORD_STATE_ROOT: '<WORK>/sr', FAKE_PS_TABLE: '<WORK>/ps.txt', FAKE_LSOF_MAP: '<WORK>/lsof.txt', FAKE_WORK: '<WORK>',
    PATH: `<WORK>/bin:${process.env.PATH}`, FAKE_HEAVY: rng.chance(0.3) ? picked[0] : '',
  };
  const args = rng.pick([[], [], [picked[0]], [...picked, 'ghost']]);
  return { args, files, env };
}

export default {
  module: 'stall-check',
  kind: 'script',
  sh: 'tests/js-parity/fixtures/stall-parity.sh',
  mjs: 'tests/js-parity/fixtures/stall-parity.mjs',
  switchEnv: 'COORD_JS_STALL_CHECK',
  env: { COORD_REPO: '<WORK>', LC_ALL: 'C' },
  functions: {
    run: {
      compareFiles: false,
      gen: build,
      fixed: [
        { label: '-h', args: ['-h'], env: {}, files: {} },
        { label: '모르는 옵션(die 2)', args: ['-x'], env: {}, files: {} },
        { label: '회차 없음(die 3)', args: [], env: { COORD_RUN: '' }, files: {} },
      ],
    },
  },
};
