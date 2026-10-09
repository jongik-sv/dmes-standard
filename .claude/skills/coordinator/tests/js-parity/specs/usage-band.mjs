// scripts/usage-band.sh ↔ usage-band.mjs 대조 명세(kind 'script', 스위치 COORD_JS_USAGE_BAND).
//   · sh·mjs 는 fixtures/usage-parity.{sh,mjs} 래퍼다: 작업 폴더의 `.mtimes.json`(상대 경로 → epoch 초)대로 파일 mtime 을 맞춘 뒤 스크립트를 돌린다.
//     그래서 cache 출처의 `at=`(= mtime)도 두 쪽이 같은 값이고 normalize 가 필요 없다.
//   · 시간은 gen 시점의 현재 시각 상대값이다. 임계(max_age_min·reset)에서 ±2분 이상 떨어진 값만 만든다(실행 지연 ≪ 경계).
//   · 모든 사례 COORD_REPO=<WORK>, usage.sources 를 항상 덮어쓴다(기본값은 실제 /tmp·~/.dflow 파일을 가리킨다).
//   · awk 의 -v 비교(수 꼴/문자열), printf %d, bash 3.2 의 앞 0(8진) 같은 가장자리는 fixed 와 임계값 변형으로 본다.
const NOW = () => Math.floor(Date.now() / 1000);
const pad = (n, w = 2) => String(n).padStart(w, '0');
/** epoch → ISO(+tz 분) */
function iso(e, tzMin = 0, z = false) {
  const d = new Date((e + tzMin * 60) * 1000);
  const base = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  if (z) return `${base}Z`;
  const a = Math.abs(tzMin);
  return `${base}${tzMin < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
const TZ = [0, 540, -300, 330];
const isoR = (rng, e) => (rng.chance(0.25) ? iso(e, 0, true) : iso(e, rng.pick(TZ)));

const PCT = (rng) => rng.pick([0, 5, 12, 12.5, 29.4, 29.5, 30, 49.5, 50, 50.4, 60, 69.9, 70, 79.5, 80, 89.5, 90, 95, 100, 100.5, 120, '12.5', '"x"', 'null', '"7"', 'true', '[1]', '1e1', 33.333, '"1.5e1"', '""']);
const MAXAGE = [30, 10, 5, 60];

/** cache 문서 글 */
function cacheDoc(rng, now) {
  const r = rng.next();
  if (r < 0.03) return '';
  if (r < 0.06) return rng.pick(['{', 'not json', '[]', 'null', '"s"', '7', '{"five_hour":"x"}', '{"five_hour":[1]}', '{"five_hour":{"utilization":5}}{"b":']);
  if (r < 0.08) return `{"five_hour":{"utilization":${PCT(rng)}}}\n{"seven_day":{"utilization":${PCT(rng)}}}`;
  const parts = [];
  const f = [];
  if (rng.chance(0.9)) f.push(`"utilization":${PCT(rng)}`);
  if (rng.chance(0.8)) f.push(`"resets_at":${rng.chance(0.75) ? JSON.stringify(isoR(rng, now + rng.pick([-90000, -3700, -200, 200, 3700, 9000, 172800, 400000]))) : rng.pick(['null', '"garbage"', '1893456000', '""', '"2026-10-09 10:00:00"'])}`);
  if (f.length || rng.chance(0.2)) parts.push(`"five_hour":{${f.join(',')}}`);
  const g = [];
  if (rng.chance(0.9)) g.push(`"utilization":${PCT(rng)}`);
  if (rng.chance(0.85)) g.push(`"resets_at":${rng.chance(0.8) ? JSON.stringify(isoR(rng, now + rng.pick([-90000, -3700, 400, 3700, 86400, 150000, 400000, 604800, 900000]))) : rng.pick(['null', '"garbage"', '""'])}`);
  if (g.length || rng.chance(0.2)) parts.push(`"seven_day":{${g.join(',')}}`);
  if (rng.chance(0.15)) parts.push('"extra":{"a":1}');
  return `{${parts.join(',')}}`;
}

/** limits-dir·coord-dump 문서 글 */
function limitsDoc(rng, now, ageSec) {
  const r = rng.next();
  if (r < 0.04) return rng.pick(['{', '', '[]', 'null', '{"at":1}', '{"at":1,"rate_limits":false}', '{"at":1,"rate_limits":5}', '{"at":1,"rate_limits":{"five_hour":"x"}}']);
  const t = now - ageSec;
  const atv = rng.pick([`${t}`, `${t}`, `${t}`, `${t * 1000}`, `${t}.7`, `${t * 1000 + 123}`, JSON.stringify(isoR(rng, t)), 'null', '"x"', '"0123"', `"${t}"`, 'true']);
  const win = (hr) => {
    const f = [];
    if (rng.chance(0.9)) f.push(`"used_percentage":${PCT(rng)}`);
    if (rng.chance(0.8)) {
      const e = now + hr;
      f.push(`"resets_at":${rng.pick([`${e}`, `${e}`, `${e}`, `${e * 1000}`, `${e}.5`, JSON.stringify(String(e)), JSON.stringify(isoR(rng, e)), 'null', '"x"'])}`);
    }
    return `{${f.join(',')}}`;
  };
  const rl = [];
  if (rng.chance(0.9)) rl.push(`"five_hour":${win(rng.pick([-7200, -400, 300, 3600, 14000]))}`);
  if (rng.chance(0.9)) rl.push(`"seven_day":${win(rng.pick([-100000, -400, 3000, 86400, 200000, 500000]))}`);
  const doc = [`"at":${atv}`];
  if (rng.chance(0.7)) doc.push(`"session_id":"s${rng.int(1, 9)}"`);
  if (rng.chance(0.95)) doc.push(`"rate_limits":{${rl.join(',')}}`);
  return `{${doc.join(',')}}`;
}

function limitsDir(rng, now, maxAge, dir, files, mtimes, home) {
  const n = rng.int(0, 5);
  // 글롭 순서는 bash 의 로캘(en_US 에서는 대소문자·악센트 무시)에 따라 달라 동점 때 고르는 파일이 갈린다 → 소문자 ASCII 이름만 쓴다(이 경우 C 순서와 같다)
  const names = ['a.json', 'b.json', 'sess-1.json', 'z.json', 'x.settings.json', '.hidden.json', 'notes.txt', 'dir.json', 'a.settings.json', 'm.json', 'k9.json'];
  const used = new Set();
  const prefix = (p) => (home ? `home/${p}` : p);
  for (let i = 0; i < n; i++) {
    const name = rng.pick(names);
    if (used.has(name)) continue;
    used.add(name);
    const p = `${dir}/${name}`;
    if (name === 'dir.json') { files[prefix(`${p}/inner.json`)] = limitsDoc(rng, now, 10); continue; }
    const age = rng.pick([5, 30, 120, 600, maxAge * 60 - 120, maxAge * 60 + 120, maxAge * 60 + 3600, 86400]);
    files[prefix(p)] = limitsDoc(rng, now, Math.max(age, 1));
  }
  return mtimes;
}

function build(rng) {
  const now = NOW();
  const files = {};
  const mtimes = {};
  const maxAge = rng.pick(MAXAGE);
  const usage = {};
  const mode = rng.int(0, 11);
  const srcs = [];
  const kinds = [];
  const nsrc = mode === 0 ? 0 : rng.pick([1, 1, 2, 2, 3]);
  for (let i = 0; i < nsrc; i++) kinds.push(rng.pick(['cache', 'cache', 'limits-dir', 'coord-dump', 'limits-dir', 'weird']));
  kinds.forEach((kind, i) => {
    const viaHome = rng.chance(0.25);
    const path = kind === 'cache' ? (viaHome ? `~/u${i}.json` : `c${i}.json`) : (viaHome ? `~/d${i}` : `d${i}`);
    srcs.push({ kind, path: rng.chance(0.05) ? `missing/${path}` : path });
    if (kind === 'cache') {
      if (rng.chance(0.93)) {
        const key = viaHome ? `home/u${i}.json` : `c${i}.json`;
        files[key] = cacheDoc(rng, now);
        const age = rng.pick([3, 60, 900, maxAge * 60 - 120, maxAge * 60 + 120, maxAge * 60 + 7200, 100000]);
        mtimes[viaHome ? `../home/u${i}.json` : `c${i}.json`] = now - age;
      }
    } else if (kind !== 'weird') {
      limitsDir(rng, now, maxAge, viaHome ? `d${i}` : `d${i}`, files, mtimes, viaHome);
    }
  });
  if (mode >= 1) usage.sources = srcs;
  if (mode === 1) usage.sources = rng.pick([{ kind: 'cache', path: 'c0.json' }, 'abc', 7, null, [], '', 2.5, -1, true]);
  if (rng.chance(0.5)) usage.max_age_min = rng.pick([maxAge, String(maxAge), '', 'x', 0, '0', 1000]);
  else usage.max_age_min = maxAge;
  if (rng.chance(0.35)) {
    usage.bands = {};
    for (const b of ['Y', 'O', 'R']) {
      if (rng.chance(0.7)) usage.bands[b] = { five: rng.pick([20, 50, 70, 90, '40', '55.5', '', 'abc', ' 30', '0x1e', 'inf', 'nan', 1e2, '1e1', '-5', 0]), week: rng.pick([20, 50, 70, 90, '40', '', 'zz', 0]) };
    }
  }
  if (rng.chance(0.55)) usage.week_pace = rng.pick([true, true, false, 'true', 'yes', 1]);
  if (rng.chance(0.4)) usage.week_pace_margin = rng.pick([0, 20, 10, '15', 12.5, '12.5', 'abc', '', -5, 100, '007', 1e3, '99999999999999999999']);
  if (rng.chance(0.3)) usage.relaxed = rng.pick([true, true, false, 'true', 'x']);
  files['.coord.local.json'] = JSON.stringify({ usage });
  files['.mtimes.json'] = JSON.stringify(mtimes);
  return { args: [], files, env: {} };
}

export default {
  module: 'usage-band',
  kind: 'script',
  sh: 'tests/js-parity/fixtures/usage-parity.sh',
  mjs: 'tests/js-parity/fixtures/usage-parity.mjs',
  switchEnv: 'COORD_JS_USAGE_BAND',
  env: { COORD_REPO: '<WORK>' },
  functions: {
    run: {
      gen: build,
      fixed: [
        {
          label: '출처 없음(UNKNOWN)', args: [], env: {}, files: { '.coord.local.json': '{"usage":{"sources":[]}}' },
        },
        { label: '잘못된 인자', args: ['x'], env: {}, files: { '.coord.local.json': '{"usage":{"sources":[]}}' } },
        { label: '-h', args: ['-h'], env: {}, files: { '.coord.local.json': '{"usage":{"sources":[]}}' } },
        { label: '--help', args: ['--help'], env: {}, files: { '.coord.local.json': '{"usage":{"sources":[]}}' } },
        {
          label: 'cache 단독(최근)', args: [], env: {},
          files: { '.coord.local.json': '{"usage":{"sources":[{"kind":"cache","path":"c.json"}]}}', 'c.json': '{"five_hour":{"utilization":42.5,"resets_at":"2026-10-09T20:00:00+09:00"},"seven_day":{"utilization":80}}' },
        },
        {
          label: '앞 0 이 붙은 max_age_min(8진 오류로 종료)', args: [], env: {},
          files: { '.coord.local.json': '{"usage":{"max_age_min":"08","sources":[{"kind":"cache","path":"c.json"}]}}', 'c.json': '{"five_hour":{"utilization":42.5}}' },
        },
      ],
    },
  },
};
