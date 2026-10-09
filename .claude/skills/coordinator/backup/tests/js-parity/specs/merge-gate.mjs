// scripts/merge-gate.sh ↔ merge-gate.mjs 대조 명세(kind 'script', 스위치 COORD_JS_MERGE_GATE).
//   · sh·mjs 는 fixtures/gate-parity.{sh,mjs} 래퍼다: 작업 폴더의 `.repo.json`(레시피)으로 실제 git 리포를 만든 뒤 스크립트를 돌린다.
//     커밋 시각·작성자를 고정해 같은 레시피면 객체가 같고, `tree=`(merge-tree 결과 트리)도 결정적이다. git 설정은 전역·시스템 모두 끈다.
//   · 상태 뿌리 COORD_STATE_ROOT=<WORK>/sr, 회차 r1. 설정은 <WORK>/.coord.local.json(integration_branch·restart_rules).
//   · LC_ALL=C 를 기본으로 둔다(sort -u·글롭 순서 로캘 의존 제거, 글자=바이트). UTF-8 사례는 fixed 에서 따로 본다.
//   · 남긴 파일 비교는 끈다(.git/index 의 mtime 때문에 바이트가 달라진다). 스크립트는 git 객체 말고는 쓰지 않는다.
const GIT_ENV = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', LC_ALL: 'C' };

const POOL = [
  'src/backend/a/B.java', 'src/backend/x.txt', 'src/frontend/shared/index.ts', 'src/frontend/shared/src/types.ts', 'src/frontend/shared/package.json',
  'src/frontend/shared/x.d.ts', 'src/frontend/shared/types/a.ts', 'src/frontend/shared/UserProps.ts', 'src/frontend/shared/ok.ts',
  'src/frontend/app/main.ts', 'docs/a.md', 'docs/sub/b.md', 'README.md', 'scripts/x.sh', 'a.b.ts', 'src/a+b.ts', 'src/a.ts', 'src/aXb.ts', 'src/a/b.ts',
  'my file.txt', 'zz.txt', '한글.txt', 'notes/index.ts',
];
const GLOBS = [
  'src/backend/**', 'src/frontend/**', 'docs/', '**/index.ts', 'src/*.ts', 'src/a?b.ts', 'README.md', '', 'src/frontend/shared/**', '**', '*.md', 'scripts/',
  'a.b.ts', 'src/a+b.ts', 'src/(x)/**', 'docs/**/*.md', '**/types/**', '*', '?', 'src/**/a.ts', 'my file.txt', '[ab].ts', 'src/{a,b}.ts', 'a$.ts', '^README', 'docs\\a',
];
const LANES = ['la', 'lb', 'lc'];

function content(rng) { return `${rng.pick(['x', 'y', 'hello', 'v1', 'v2'])}\n${rng.int(0, 9)}\n`; }

function recipe(rng) {
  const base = {};
  const files = [];
  for (const p of POOL) if (rng.chance(0.5)) { base[p] = content(rng); files.push(p); }
  if (files.length === 0) { base['README.md'] = 'r\n'; files.push('README.md'); }
  const branches = {};
  const nb = rng.pick([2, 2, 2, 1]);
  const changed = [];
  for (let b = 0; b < nb; b++) {
    const changes = {};
    const k = rng.int(0, 6);
    for (let i = 0; i < k; i++) {
      const p = rng.pick(POOL);
      if (p in changes) continue;
      if (p in base && rng.chance(0.25)) changes[p] = null;
      else changes[p] = `${content(rng)}b${b}\n`;
    }
    branches[b === 0 ? 'feat/x' : 'other'] = { changes };
    if (b === 0) changed.push(...Object.keys(changes));
  }
  const integChanges = {};
  if (rng.chance(0.4)) {
    // 통합 브랜치에도 같은 파일을 달리 고쳐 충돌을 만든다(이름 첫 글자가 서로 다른 파일들이라 sort 순서가 같다)
    for (const p of changed) if (p in base && rng.chance(0.6)) integChanges[p] = `${content(rng)}integ\n`;
    if (rng.chance(0.5)) integChanges['zz-new.txt'] = 'n\n';
  }
  return { integ: rng.chance(0.1) ? 'main' : 'dev', base, branches, integChanges };
}

function stateDoc(rng, rec) {
  const lanes = {};
  for (const l of LANES) {
    if (!rng.chance(0.9)) continue;
    const o = {};
    if (rng.chance(0.95)) o.branch = rng.pick(['feat/x', 'feat/x', 'feat/x', 'feat/x', 'feat/x', 'other', 'other', rng.chance(0.1) ? 'nope' : 'feat/x']);
    if (rng.chance(0.6)) o.owned = rng.pick([[], [rng.pick(GLOBS)], [rng.pick(GLOBS), rng.pick(GLOBS)], 'src/**', null, { a: 'docs/' }, [null, false, 'docs/', 5], [''], 5]);
    if (rng.chance(0.4)) o.forbidden = rng.pick([[], [rng.pick(GLOBS)], [rng.pick(GLOBS), rng.pick(GLOBS)], null, 'x', [''], { z: 'README.md' }]);
    lanes[l] = rng.chance(0.04) ? rng.pick(['str', 5, null, [1]]) : o;
  }
  const doc = { lanes };
  if (rng.chance(0.3)) doc.run = { integration_branch: rng.pick([rec.integ, rec.integ, rec.integ, 'nope', '', null, 5]) };
  if (rng.chance(0.4)) doc.windows = rng.pick([[{ kind: 'measure', until: '2026-10-09T01:00:00Z' }], [{ kind: 'other' }], [{ kind: 'measure' }, { kind: 'measure', until: 5 }], { a: { kind: 'measure', until: 'x' } }, 'str', null, [1, { kind: 'measure' }], [{ kind: 'measure', until: { a: 1 } }]]);
  if (rng.chance(0.4)) doc.merge = rng.pick([{ in_flight: { lane: 'lb' } }, { in_flight: { branch: 'other' } }, { in_flight: { lane: 'la' } }, { in_flight: {} }, { in_flight: null }, { in_flight: 'str' }, { in_flight: [1] }, 5, { in_flight: { lane: 'lb', branch: 'x' } }, { in_flight: { branch: 'feat/x' } }]);
  return rng.chance(0.03) ? rng.pick(['{', '[]', '']) : JSON.stringify(doc);
}

function build(rng) {
  const rec = recipe(rng);
  const files = {};
  const env = { ...GIT_ENV, COORD_STATE_ROOT: '<WORK>/sr' };
  const withRun = rng.chance(0.9);
  if (withRun) { files['sr/r1/state.json'] = stateDoc(rng, rec); env.COORD_RUN = 'r1'; }
  else env.COORD_RUN = '';
  const cfg = {};
  if (rec.integ !== 'dev' && !rng.chance(0.08)) cfg.integration_branch = rec.integ;
  else if (rng.chance(0.06)) cfg.integration_branch = rng.pick(['nope', 'main', 'dev']);
  if (rng.chance(0.5)) {
    cfg.restart_rules = rng.pick([
      [{ glob: 'src/backend/**', note: '백엔드 재기동' }], [{ glob: 'docs/', note: '' }, { glob: '**/*.md' }], [{ glob: '' }], [{ note: 'x' }],
      [{ glob: 'src/frontend/shared/**', note: 'shared 재빌드' }, { glob: 'README.md', note: 'r' }], 'abc', { a: 1 }, null, 7, [5, { glob: '**' }], [{ glob: 'zz.txt', note: null }],
    ]);
  }
  files['.coord.local.json'] = JSON.stringify(cfg);
  files['.repo.json'] = JSON.stringify(rec);
  const args = [];
  const mode = rng.pick(['lane', 'lane', 'lane', 'lane', 'lane', 'branch', 'branch', 'both', rng.chance(0.15) ? 'none' : 'lane']);
  const lane = rng.pick(LANES);
  const br = rng.pick(['feat/x', 'feat/x', 'feat/x', 'feat/x', 'other', 'other', rec.integ, rng.chance(0.1) ? 'nope' : 'feat/x']);
  if (mode === 'lane') args.push(lane);
  else if (mode === 'branch') args.push('--branch', br);
  else if (mode === 'both') args.push(lane, '--branch', br);
  if (rng.chance(0.02)) args.push(rng.pick(['--bogus', '-x']));
  return { args, files, env };
}

const rec1 = (over = {}) => JSON.stringify({ integ: 'dev', base: { 'README.md': 'r\n', 'src/a.ts': 'a\n' }, branches: { 'feat/x': { changes: { 'src/a.ts': 'b\n', 'src/frontend/shared/index.ts': 'i\n' } } }, integChanges: {}, ...over });
const st1 = (lane) => JSON.stringify({ lanes: { la: lane } });

export default {
  module: 'merge-gate',
  kind: 'script',
  sh: 'tests/js-parity/fixtures/gate-parity.sh',
  mjs: 'tests/js-parity/fixtures/gate-parity.mjs',
  switchEnv: 'COORD_JS_MERGE_GATE',
  env: { COORD_REPO: '<WORK>', ...GIT_ENV },
  functions: {
    run: {
      compareFiles: false,
      gen: build,
      fixed: [
        { label: '인자 없음', args: [], env: {}, files: {} },
        { label: '-h(stdout 2~7줄)', args: ['-h'], env: {}, files: {} },
        { label: '모르는 옵션', args: ['--zzz'], env: {}, files: {} },
        { label: 'SELFTEST', args: ['x'], env: { MERGE_GATE_SELFTEST: '1' }, files: {} },
        { label: 'SELFTEST (UTF-8 로캘)', args: ['x'], env: { MERGE_GATE_SELFTEST: '1', LC_ALL: 'en_US.UTF-8' }, files: {} },
        { label: '--branch 만(회차 없음): ok + SHARED_API', args: ['--branch', 'feat/x'], env: { COORD_RUN: '' }, files: { '.repo.json': rec1() } },
        { label: '레인인데 회차 없음(die 3)', args: ['la'], env: { COORD_RUN: '' }, files: { '.repo.json': rec1() } },
        { label: '상태에 없는 레인(die 2)', args: ['zz'], env: { COORD_RUN: 'r1', COORD_STATE_ROOT: '<WORK>/sr' }, files: { 'sr/r1/state.json': st1({ branch: 'feat/x' }), '.repo.json': rec1() } },
        { label: '레인 이름에 따옴표(jq 컴파일 오류 → die 2)', args: ['a"b'], env: { COORD_RUN: 'r1', COORD_STATE_ROOT: '<WORK>/sr' }, files: { 'sr/r1/state.json': st1({ branch: 'feat/x' }), '.repo.json': rec1() } },
        { label: '레인 branch 비어 있음(die 3)', args: ['la'], env: { COORD_RUN: 'r1', COORD_STATE_ROOT: '<WORK>/sr' }, files: { 'sr/r1/state.json': st1({}), '.repo.json': rec1() } },
        { label: '통합 브랜치 없음(die 4)', args: ['--branch', 'feat/x'], env: { COORD_RUN: '' }, files: { '.coord.local.json': '{"integration_branch":"nope"}', '.repo.json': rec1() } },
        { label: '브랜치 없음(die 2)', args: ['--branch', 'nope'], env: { COORD_RUN: '' }, files: { '.repo.json': rec1() } },
        {
          label: '충돌 → conflict + CONFLICT 줄', args: ['--branch', 'feat/x'], env: { COORD_RUN: '' },
          files: { '.repo.json': rec1({ integChanges: { 'src/a.ts': 'integ\n' } }) },
        },
        {
          label: '소유 밖·금지·WINDOW·INFLIGHT·RESTART', args: ['la'], env: { COORD_RUN: 'r1', COORD_STATE_ROOT: '<WORK>/sr' },
          files: {
            'sr/r1/state.json': JSON.stringify({ lanes: { la: { branch: 'feat/x', owned: ['src/a.ts'], forbidden: ['src/frontend/**'] } }, windows: [{ kind: 'measure', until: '2026-10-09T01:00:00Z' }], merge: { in_flight: { lane: 'lb' } } }),
            '.coord.local.json': '{"restart_rules":[{"glob":"src/**","note":"재기동 필요"}]}',
            '.repo.json': rec1(),
          },
        },
        {
          label: 'UTF-8 로캘 + quotepath=false: 한글 경로와 ? 글롭', args: ['la'],
          env: { LC_ALL: 'en_US.UTF-8', COORD_RUN: 'r1', COORD_STATE_ROOT: '<WORK>/sr', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.quotepath', GIT_CONFIG_VALUE_0: 'false' },
          files: {
            'sr/r1/state.json': JSON.stringify({ lanes: { la: { branch: 'feat/x', owned: ['한?.txt', '한글/**'] } } }),
            '.repo.json': JSON.stringify({ integ: 'dev', base: { 'README.md': 'r\n' }, branches: { 'feat/x': { changes: { '한글.txt': 'a\n', '한/b.txt': 'b\n', '한글/c.txt': 'c\n' } } }, integChanges: {} }),
          },
        },
      ],
    },
  },
};
