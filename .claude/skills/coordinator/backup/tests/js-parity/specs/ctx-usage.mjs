// scripts/ctx-usage.sh ↔ ctx-usage.mjs 대조 명세(kind 'script', 스위치 COORD_JS_CTX_USAGE).
//   · 전부 임시 HOME·작업 폴더 안: COORD_REPO=<WORK>, COORD_STATE_ROOT=<WORK>/sr, 세션 폴더·transcript 폴더는 기본값(~/.claude/…)이 HOME 아래다.
//   · 시간은 gen 시점의 현재 시각 상대값이다(덤프 30분 임계에서 ±2분 이상 떨어진 값만).
//   · 글롭 순서(여러 프로젝트 폴더에 같은 세션 id)는 bash 가 로캘 순서라 폴더 이름을 소문자 ASCII 하나씩만 쓴다.
const NOW = () => Math.floor(Date.now() / 1000);
const pad = (n, w = 2) => String(n).padStart(w, '0');
function iso(e, tzMin = 0, z = false) {
  const d = new Date((e + tzMin * 60) * 1000);
  const base = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  if (z) return `${base}Z`;
  const a = Math.abs(tzMin);
  return `${base}${tzMin < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
const isoR = (rng, e) => (rng.chance(0.3) ? iso(e, 0, true) : iso(e, rng.pick([0, 540, -300])));

const SIDS = ['sess-1', 'abc123', 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6', 's.x_y', '한글세션', 'a b'];
const CWDS = ['/Users/x/proj', '/home/a.b/c d', '/tmp', '/Users/한글/프로젝트', '/a/b.c/d'];
const projDir = (cwd) => cwd.replace(/[/.]/g, '-');

const NUMV = (rng) => rng.pick(['0', '1', '100', '12345', '50000', '150000', '99.5', '"7"', '"x"', 'null', 'true', '[1]', '{}', '1e3', '"12"', '""', '0.0', '2.0']);
const usageObj = (rng) => {
  const f = [];
  if (rng.chance(0.9)) f.push(`"input_tokens":${NUMV(rng)}`);
  if (rng.chance(0.8)) f.push(`"cache_read_input_tokens":${NUMV(rng)}`);
  if (rng.chance(0.7)) f.push(`"cache_creation_input_tokens":${NUMV(rng)}`);
  if (rng.chance(0.4)) f.push('"output_tokens":99');
  return `{${f.join(',')}}`;
};
const GOODNUM = (rng) => rng.pick(['0', '1', '100', '12345', '50000', '150000', '2000', '31000']);
const goodUsage = (rng) => `{"input_tokens":${GOODNUM(rng)},"cache_read_input_tokens":${GOODNUM(rng)},"cache_creation_input_tokens":${GOODNUM(rng)}}`;

function assistantLine(rng, now, i, good = false) {
  const f = ['"type":"assistant"'];
  if (rng.chance(0.85)) f.push(`"timestamp":${rng.pick([JSON.stringify(isoR(rng, now - 3600 + i * 7)), JSON.stringify(isoR(rng, now - 3600 + i * 7)), 'null', '1790000000', '"garbage"', '"2026-10-09 10:00:00"'])}`);
  if (rng.chance(0.15)) f.push(`"isSidechain":${rng.pick(['true', 'false', '"x"', 'null'])}`);
  const m = [];
  if (rng.chance(0.4)) m.push(`"model":${rng.pick(['"claude-opus-4"', '"<synthetic>"', 'null', '5', '"x"'])}`);
  const usage = rng.chance(good ? 1 : 0.85) ? (good || rng.chance(0.6) ? goodUsage(rng) : rng.pick([usageObj(rng), usageObj(rng), '"x"', '5', '[1]', 'false', 'null', '{}'])) : null;
  if (usage !== null) m.push(`"usage":${usage}`);
  if (rng.chance(0.3)) m.push('"content":[{"type":"text","text":"hi"}]');
  if (rng.chance(0.06)) f.push(`"message":${rng.pick(['"str"', '5', '[1]', 'null'])}`);
  else f.push(`"message":{${m.join(',')}}`);
  if (rng.chance(0.3)) f.push(`"uuid":"u${i}"`);
  return `{${f.join(',')}}`;
}
const otherLine = (rng, i) => rng.pick([
  `{"type":"user","message":{"content":"q${i}"},"timestamp":"2026-10-09T00:00:00Z"}`,
  `{"type":"system","subtype":"x"}`, '', '   ', 'not json', '{', '[]', 'null', '"s"', `{"type":"assistant"}garbage`,
]);

function transcript(rng, now, big) {
  const lines = [];
  const n = rng.int(0, 14);
  for (let i = 0; i < n; i++) lines.push(rng.chance(0.7) ? assistantLine(rng, now, i, rng.chance(0.4)) : otherLine(rng, i));
  if (rng.chance(0.55)) lines.push(assistantLine(rng, now, 99, true));   // 마지막에 쓸 수 있는 줄
  let tailJunk = [];
  if (big) {
    // 앞에 읽을 수 있는 줄, 뒤에 300KB 넘는 걸러지는 줄들 → 256KB 안에서는 못 찾고 2MB 로 넓혀야 한다
    const filler = JSON.stringify({ type: 'user', message: { content: 'x'.repeat(2000) } });
    tailJunk = Array.from({ length: rng.pick([140, 150, 1100]) }, () => filler);
  }
  const eol = rng.chance(0.1) ? '\r\n' : '\n';
  const body = [...lines, ...tailJunk].join(eol);
  return body + (rng.chance(0.8) ? eol : '');
}

function dumpDoc(rng, now) {
  const r = rng.next();
  if (r < 0.04) return rng.pick(['', '{', '[]', 'null', '5', '{"at":1}']);
  const fresh = rng.chance(0.75);
  const t = now - (fresh ? rng.pick([30, 600, 1500]) : rng.pick([2100, 4000, 90000]));
  const at = rng.pick([`${t}`, `${t}`, `${t}`, `${t}`, `${t}`, `${t * 1000}`, `${t}.5`, JSON.stringify(isoR(rng, t)), 'null', '"x"', `"${t}"`, 'true', '"0123"']);
  let cw;
  const k = rng.int(0, 6);
  if (k === 0) cw = rng.pick(['5', '"s"', '[1]', 'false', 'null', '{}']);
  else if (k <= 3) {
    const cu = rng.pick([goodUsage(rng), goodUsage(rng), usageObj(rng), '{}', '5', '"x"', 'null', 'false']);
    cw = `{"current_usage":${cu}${rng.chance(0.6) ? `,"context_window_size":${rng.pick(['200000', '1000000', '"200000"', 'null', '1e6', '50000.5', '0'])}` : ''}}`;
  } else {
    cw = `{"used_percentage":${rng.pick(['0', '10', '33.3', '50', '99.9', '"x"', 'null', 'true'])},"context_window_size":${rng.pick(['200000', '1000000', '"200000"', 'null', '123457', 'true', '0'])}}`;
  }
  const f = [`"at":${at}`, `"session_id":"s"`];
  if (rng.chance(0.93)) f.push(`"context_window":${cw}`);
  if (rng.chance(0.3)) f.push('"rate_limits":{}');
  const doc = `{${f.join(',')}}`;
  return rng.chance(0.05) ? `${doc}\n${doc}` : doc;
}

function build(rng) {
  const now = NOW();
  const files = {};
  const env = { COORD_STATE_ROOT: '<WORK>/sr' };
  const sid = rng.pick(SIDS);
  const cwd = rng.pick(CWDS);
  const pid = String(rng.int(1000, 90000));
  const args = [];
  const mode = rng.pick(['sid', 'sid', 'sid', 'pid', 'pid', 'lane', 'lane']);
  const lane = rng.pick(['L1', 'L2', 'ghost']);
  const hasSession = rng.chance(0.75);
  const sessId = rng.chance(mode === 'sid' ? 0.08 : 0.2) ? `${sid}-new` : sid;   // /clear 뒤 sessionId 가 바뀐 경우(sid 모드에서는 세션 파일을 못 찾는 경우가 된다)
  if (hasSession) {
    const f = [];
    if (rng.chance(0.93)) f.push(`"sessionId":${rng.pick([JSON.stringify(sessId), JSON.stringify(sessId), JSON.stringify(sessId), JSON.stringify(sessId), JSON.stringify(sessId), JSON.stringify(sessId), JSON.stringify(sessId), 'null', '5', '""', '{"a":1}'])}`);
    if (rng.chance(0.85)) f.push(`"cwd":${rng.chance(0.9) ? JSON.stringify(cwd) : rng.pick(['null', '""', '5'])}`);
    files[`home/.claude/sessions/${pid}.json`] = rng.chance(0.04) ? rng.pick(['{', '', '[]']) : `{${f.join(',')}}`;
  }
  // state (lane·window)
  if (mode === 'lane' || rng.chance(0.4)) {
    const w = rng.pick(['150000', '"300000"', 'null', '"x"', '500000', '12.5', 'true']);
    const lanes = {};
    lanes.L1 = `{"session":{"session_id":${JSON.stringify(sid)},"pid":${rng.pick([pid, `"${pid}"`, 'null'])},"window":${w}}}`;
    if (rng.chance(0.5)) lanes.L2 = `{"session":{"session_id":"other","window":${rng.pick(['100000', 'null'])}}}`;
    if (rng.chance(0.1)) lanes.L3 = rng.pick(['"str"', '5', 'null', '{}']);
    const body = `{"lanes":{${Object.entries(lanes).map(([k, v]) => `"${k}":${v}`).join(',')}}}`;
    if (!rng.chance(0.05)) { files['sr/r1/state.json'] = body; env.COORD_RUN = 'r1'; }
    else files['sr/r1/state.json'] = rng.pick(['{', '{"lanes":null}', '{"lanes":"x"}', '[]']);
  }
  if (mode === 'lane' && !env.COORD_RUN && rng.chance(0.6)) env.COORD_RUN = 'r1';
  if (mode === 'sid') args.push(sid);
  else if (mode === 'pid') args.push('--pid', pid);
  else args.push('--lane', lane);
  if (rng.chance(0.25)) args.push('--window', rng.pick(['100000', '0', '007', '250000']));
  if (rng.chance(0.05)) args.push(rng.pick(['--bogus', '-x']));
  if (rng.chance(0.03)) args.reverse();
  // 덤프
  const useSid = hasSession ? sessId : sid;
  if (rng.chance(0.6)) files[`sr/ctx/${useSid}.json`] = dumpDoc(rng, now);
  // transcript
  if (rng.chance(0.9)) {
    const dir = hasSession && rng.chance(0.8) ? projDir(cwd) : rng.pick(['x', 'y', 'proj']);
    files[`home/.claude/projects/${dir}/${useSid}.jsonl`] = transcript(rng, now, rng.chance(0.1));
    if (rng.chance(0.1)) files[`home/.claude/projects/other/${useSid}.jsonl`] = transcript(rng, now, false);
  }
  const cfg = {};
  if (rng.chance(0.3)) cfg.compact = { default_window: rng.pick([123456, '"x"', 0, '77777', 1000000]) };
  if (rng.chance(0.05)) cfg.claude_projects_dir = rng.pick(['~/nope', '', '~/.claude/projects/']);
  files['.coord.local.json'] = JSON.stringify(cfg, (k, v) => (typeof v === 'string' && /^".*"$/.test(v) ? v.slice(1, -1) : v));
  return { args, files, env };
}

// at= 이 지금 시각 근처(±90초)면 「지금」으로 바꾼다: 쓸 수 있는 timestamp 가 없을 때 두 판이 각자 date +%s 를 써서 1~2초 어긋난다.
const normalizeNow = (buf) => Buffer.from(buf.toString('latin1').replace(/ at=(\d{4}-\d\d-\d\dT[\d:]+\+00:00)/g, (m, t) => (Math.abs(Date.parse(t) / 1000 - NOW()) < 90 ? ' at=<NOW>' : m)), 'latin1');

export default {
  module: 'ctx-usage',
  normalize: normalizeNow,
  kind: 'script',
  sh: 'scripts/ctx-usage.sh',
  mjs: 'scripts/ctx-usage.mjs',
  switchEnv: 'COORD_JS_CTX_USAGE',
  env: { COORD_REPO: '<WORK>' },
  functions: {
    run: {
      gen: build,
      fixed: [
        { label: '인자 없음', args: [], env: {}, files: {} },
        { label: '-h', args: ['-h'], env: {}, files: {} },
        { label: '--help', args: ['--help'], env: {}, files: {} },
        { label: '--pid 값 없음', args: ['--pid'], env: {}, files: {} },
        { label: '--window 숫자 아님', args: ['s1', '--window', 'x'], env: {}, files: {} },
        { label: '위치 인자 둘', args: ['a', 'b'], env: {}, files: {} },
        { label: '세션 없음 → no-transcript', args: ['nope'], env: { COORD_STATE_ROOT: '<WORK>/sr' }, files: {} },
        { label: '--pid 세션 파일 없음', args: ['--pid', '4242'], env: { COORD_STATE_ROOT: '<WORK>/sr' }, files: {} },
        { label: '--lane 회차 없음(die 3)', args: ['--lane', 'L1'], env: { COORD_STATE_ROOT: '<WORK>/sr' }, files: {} },
        {
          label: '앞 0 이 붙은 덤프 at(8진 오류 → transcript)', args: ['s9'], env: { COORD_STATE_ROOT: '<WORK>/sr' },
          files: { 'sr/ctx/s9.json': '{"at":"08","context_window":{"current_usage":{"input_tokens":5}}}' },
        },
        ...[
          ['current_usage 합', `{"at":${NOW() - 30},"context_window":{"current_usage":{"input_tokens":1000,"cache_read_input_tokens":2000,"cache_creation_input_tokens":500},"context_window_size":400000}}`, []],
          ['used_percentage × size', `{"at":${NOW() - 30},"context_window":{"used_percentage":42.5,"context_window_size":200000}}`, []],
          ['ms at', `{"at":${(NOW() - 30) * 1000},"context_window":{"current_usage":{"input_tokens":7}}}`, []],
          ['ISO at(+09:00)', `{"at":"${iso(NOW() - 30, 540)}","context_window":{"current_usage":{"input_tokens":7}}}`, []],
          ['오래된 덤프 → transcript 없음', `{"at":${NOW() - 2400},"context_window":{"current_usage":{"input_tokens":7}}}`, []],
          ['창 크기: 덤프 size 가 우선', `{"at":${NOW() - 30},"context_window":{"current_usage":{"input_tokens":50000},"context_window_size":250000}}`, []],
          ['창 크기: --window 가 우선', `{"at":${NOW() - 30},"context_window":{"current_usage":{"input_tokens":50000},"context_window_size":250000}}`, ['--window', '100000']],
          ['창 크기 0 → pct 0', `{"at":${NOW() - 30},"context_window":{"current_usage":{"input_tokens":50000},"context_window_size":0}}`, ['--window', '0']],
        ].map(([label, doc, extra]) => ({ label, args: ['sd', ...extra], env: { COORD_STATE_ROOT: '<WORK>/sr' }, files: { 'sr/ctx/sd.json': doc } })),
        {
          label: 'sid 에 ../ (덤프 경로가 ctx 폴더 밖)', args: ['../zz'], env: { COORD_STATE_ROOT: '<WORK>/sr' },
          files: { 'sr/zz.json': `{"at":${NOW() - 30},"context_window":{"current_usage":{"input_tokens":9}}}`, 'sr/ctx/keep': '' },
        },
        {
          label: '256KB 밖의 마지막 usable 줄(2MB 로 넓혀 찾음)', args: ['big1'], env: {},
          files: {
            'home/.claude/projects/p/big1.jsonl': `${JSON.stringify({ type: 'assistant', timestamp: iso(NOW() - 500), message: { usage: { input_tokens: 123, cache_read_input_tokens: 4 } } })}\n${`${JSON.stringify({ type: 'user', message: { content: 'x'.repeat(1990) } })}\n`.repeat(160)}`,
          },
        },
        {
          label: '2MB 밖(16MB 로 넓혀 찾음)', args: ['big2'], env: {},
          files: {
            'home/.claude/projects/p/big2.jsonl': `${JSON.stringify({ type: 'assistant', timestamp: iso(NOW() - 500), message: { usage: { input_tokens: 321 } } })}\n${`${JSON.stringify({ type: 'user', message: { content: 'x'.repeat(1990) } })}\n`.repeat(1100)}`,
          },
        },
        {
          label: '마지막 줄 끝 줄바꿈 없음 · 합 0 줄은 건너뜀', args: ['nl'], env: {},
          files: {
            'home/.claude/projects/p/nl.jsonl': `${JSON.stringify({ type: 'assistant', timestamp: iso(NOW() - 900), message: { usage: { input_tokens: 70 } } })}\n${JSON.stringify({ type: 'assistant', timestamp: iso(NOW() - 800), message: { usage: { input_tokens: 0 } } })}\n${JSON.stringify({ type: 'assistant', timestamp: iso(NOW() - 700), message: { usage: { input_tokens: 80 } } })}`,
          },
        },
        {
          label: '덤프 우선(최근)', args: ['s1', '--window', '100000'], env: { COORD_STATE_ROOT: '<WORK>/sr' },
          files: { 'sr/ctx/s1.json': `{"at":${NOW() - 30},"context_window":{"current_usage":{"input_tokens":1000,"cache_read_input_tokens":2000}}}` },
        },
      ],
    },
  },
};
