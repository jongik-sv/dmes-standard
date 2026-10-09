#!/usr/bin/env node
// worker-trim — 팀원 전용 설정(<id8>.settings.json)에 합칠 "첫 턴 컨텍스트 줄이기" 조각을 만든다.
// (옛 worker-trim.sh 를 node 로 옮긴 것. jq·find·grep·sed 호출 없이 node API 로 처리한다.)
// 사용: worker-trim.mjs <MAIN> [<끌 플러그인 JSON>] [<MCP 출력 접두>]
// 출력(stdout): 종전 설정 위에 덮어 합칠 조각 JSON 한 줄. 늘 exit 0. 무엇이 실패하든 {} 를 낸다.
// node 18.17 이상, 외부 패키지 없음.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const USAGE = '사용: worker-trim.mjs <MAIN> [<끌 플러그인 JSON> [<MCP 출력 접두>]]';
const HELP = '팀원 전용 설정에 합칠 "첫 턴 컨텍스트 줄이기" 조각 JSON 한 줄을 만든다.\n'
  + USAGE + '\n'
  + '출력: 조각 JSON 한 줄. 늘 exit 0(실패해도 {})\n';

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// grep -iwF 대응: 고정 문자열이 낱말 단위로 나오는지(대소문자 무시)
const containsWord = (hay, needle) => {
  if (!needle) return false;
  return new RegExp(`(?:^|[^A-Za-z0-9_])${escRe(needle)}(?:$|[^A-Za-z0-9_])`, 'i').test(hay);
};
const NEG_RE = /않|금지|말고|말 것|마라|don't|do not|never|avoid/i;

// tr ',' '\n' | tr -d ' \r' | sed '/^$/d' 대응
const toList = (s) => String(s ?? '').split(',').map((x) => x.replace(/[ \r]/g, '')).filter((x) => x !== '');
const linesOf = (s) => String(s ?? '').split('\n').filter((x) => x.length > 0);

// _dfc_parse 와 같은 정규화
function parseKv(text) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    const ln = raw.replace(/\r$/, '').replace(/^[ \t]+/, '');
    if (ln === '' || ln.startsWith('#')) continue;
    const i = ln.indexOf('=');
    if (i < 2) continue;
    const k = ln.slice(0, i).replace(/[ \t]+$/, '');
    const v = ln.slice(i + 1).replace(/^[ \t]+/, '').replace(/[ \t]+#.*$/, '').replace(/[ \t]+$/, '');
    if (k === '') continue;
    out.push([k, v]);
  }
  return out;
}

// 설정 읽기: 이미 export 된 env > .dflow.local > 레거시 .env. 실패하면 env 만 쓴다.
function loadWorkerEnv(mainDir, env) {
  const out = { ...env };
  const fill = ( pairs ) => {
    for (const [k, v] of pairs) {
      const n = { worker_keep_skills: 'DFLOW_WORKER_KEEP_SKILLS', worker_skills_off: 'DFLOW_WORKER_SKILLS_OFF', worker_keep_plugins: 'DFLOW_WORKER_KEEP_PLUGINS', worker_output_style: 'DFLOW_WORKER_OUTPUT_STYLE' }[k];
      if (n && (out[n] === undefined || out[n] === '')) out[n] = v;
    }
  };
  try {
    const t = fs.readFileSync(path.join(mainDir, '.dflow.local'), 'utf8');
    fill(parseKv(t));
    return out;
  } catch { /* 없음 */ }
  // 레거시: .env 를 셸 실행 없이 읽는다(export 접두·따옴표 처리)
  try {
    const t = fs.readFileSync(path.join(mainDir, '.env'), 'utf8');
    const pairs = [];
    for (const raw of t.split('\n')) {
      let ln = raw.replace(/\r$/, '').trim();
      if (ln === '' || ln.startsWith('#')) continue;
      ln = ln.replace(/^export\s+/, '');
      const i = ln.indexOf('=');
      if (i < 1) continue;
      let k = ln.slice(0, i).trim();
      let v = ln.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) v = v.slice(1, -1);
      if (/^DFLOW_WORKER_/.test(k)) pairs.push([k.replace(/^DFLOW_/, '').toLowerCase(), v]);
    }
    fill(pairs);
  } catch { /* 없음 */ }
  return out;
}

// 스킬 이름: 폴더 이름과 SKILL.md 머리말의 name 둘 다. 심링크 폴더도 따라간다.
function skillNames(root) {
  const out = [];
  let subs = [];
  try { subs = fs.readdirSync(root); } catch { return ''; }
  for (const d of subs) {
    const sd = path.join(root, d);
    let st = null;
    try { st = fs.statSync(sd); } catch { continue; }
    if (!st.isDirectory()) continue;
    const f = path.join(sd, 'SKILL.md');
    try { if (!fs.statSync(f).isFile()) continue; } catch { continue; }
    out.push(d);
    try {
      const t = fs.readFileSync(f, 'utf8');
      const m = /^name:[ \t]*(.*)$/m.exec(t);
      if (m) {
        const n = m[1].replace(/[\r"' ]/g, '');
        if (n !== '') out.push(n);
      }
    } catch { /* 무시 */ }
  }
  return out.filter((x) => x !== '').join('\n');
}

// ~/.claude/CLAUDE.md 와 @ 포함 파일 본문. 없으면 null
function guideText(home) {
  const first = path.join(home, '.claude', 'CLAUDE.md');
  try { if (!fs.statSync(first).isFile()) return null; } catch { return null; }
  try { fs.readFileSync(first, 'utf8'); } catch { return null; }
  const seen = new Set();
  let queue = [first];
  let out = '';
  let depth = 0;
  while (queue.length > 0 && depth <= 5) {
    const next = [];
    for (const fp of queue) {
      if (seen.has(fp)) continue;
      seen.add(fp);
      let body;
      try { body = fs.readFileSync(fp, 'utf8'); } catch { continue; }
      out += body + '\n';
      const dir = path.dirname(fp);
      const re = /(?:^|\s)@(\S+)/g;
      let m;
      while ((m = re.exec(body)) !== null) {
        let inc = m[1].replace(/[.,;:)]+$/, '');
        if (inc === '') continue;
        if (inc.startsWith('~/')) inc = path.join(home, inc.slice(2));
        else if (!inc.startsWith('/')) inc = path.join(dir, inc);
        try { if (fs.statSync(inc).isFile()) next.push(inc); } catch { /* 없음 */ }
      }
    }
    queue = next;
    depth += 1;
  }
  return out;
}

// 지침을 문장으로 나누고 부정 문장을 뺀 본문. 지침이 없으면 null
function guidePositive(home) {
  const g = guideText(home);
  if (g === null || g === '') return null;
  return g.replace(/\. /g, '.\n').split('\n').filter((ln) => !NEG_RE.test(ln)).join('\n');
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ${CLAUDE_PLUGIN_ROOT} 치환을 재귀 적용한다
function substRoot(v, root) {
  if (typeof v === 'string') return v.split('${CLAUDE_PLUGIN_ROOT}').join(root);
  if (Array.isArray(v)) return v.map((x) => substRoot(x, root));
  if (isPlainObject(v)) {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = substRoot(x, root);
    return o;
  }
  return v;
}

function main(argv, env = process.env) {
  try {
    for (const a of argv) {
      if (a === '-h' || a === '--help') { process.stdout.write(HELP); return 0; }
    }
    const home = env.HOME ?? os.homedir();
    const MAIN = path.resolve(argv[0] ?? '.');
    let P = argv[1] ?? '{}';
    const OUTP = argv[2] ?? '';
    if (OUTP !== '') {
      try { fs.unlinkSync(`${OUTP}.mcp.json`); } catch { /* 없음 */ }
      try { fs.unlinkSync(`${OUTP}.chrome`); } catch { /* 없음 */ }
    }
    try {
      const pv = JSON.parse(P);
      if (!isPlainObject(pv)) P = {};
      else P = pv;
    } catch { P = {}; }

    const cfg = loadWorkerEnv(MAIN, env);
    let KS = toList(cfg.DFLOW_WORKER_KEEP_SKILLS ?? '').join('\n');
    const KO = toList(cfg.DFLOW_WORKER_SKILLS_OFF ?? '').join('\n');
    let KP = toList(cfg.DFLOW_WORKER_KEEP_PLUGINS ?? '').join('\n');
    const ST = String(cfg.DFLOW_WORKER_OUTPUT_STYLE ?? '').replace(/[ \r]/g, '');
    const PK = cfg.DFLOW_WORKER_PLUGINS ?? '';

    const PN = skillNames(path.join(MAIN, '.claude', 'skills'));
    let UN = '';
    if (KS !== '') UN = skillNames(path.join(home, '.claude', 'skills'));

    let GA = null; let GOK = false;
    if ([...linesOf(KS), ...linesOf(KP)].includes('auto')) {
      GA = guidePositive(home);
      GOK = GA !== null;
    }
    if (linesOf(KS).includes('auto')) {
      if (GOK) {
        const G = GA;
        const aks = [];
        let subs = [];
        try { subs = fs.readdirSync(path.join(home, '.claude', 'skills')); } catch { subs = []; }
        for (const d of subs) {
          const f = path.join(home, '.claude', 'skills', d, 'SKILL.md');
          try { if (!fs.statSync(f).isFile()) continue; } catch { continue; }
          let n = '';
          try {
            const t = fs.readFileSync(f, 'utf8');
            const m = /^name:[ \t]*(.*)$/m.exec(t);
            if (m) n = m[1].replace(/[\r"' ]/g, '');
          } catch { /* 무시 */ }
          if (containsWord(G, d) || (n !== '' && containsWord(G, n))) {
            aks.push(d);
            if (n !== '') aks.push(n);
          }
        }
        const AK = [...new Set(aks)].sort().join('\n');
        process.stderr.write(`WORKER_SKILLS_AUTO kept=${AK.split('\n').filter((x) => x !== '').join(',') || '-'}\n`);
        KS = [...linesOf(KS), ...linesOf(AK)].filter((x) => x !== 'auto' && x !== '').join('\n');
        if (KS === '') KS = 'none';
      } else {
        process.stderr.write('WORKER_SKILLS_AUTO kept=- — ~/.claude/CLAUDE.md 를 읽지 못해 사용자 스킬을 끄지 않는다\n');
        KS = ''; UN = '';
      }
    }

    if (linesOf(KP).includes('auto')) {
      let AP = '';
      if (GOK) {
        const GP = String(GA).split('\n').filter((ln) => /플러그인|plugin|mcp/i.test(ln)).join('\n');
        const aks = [];
        for (const k of Object.keys(P)) {
          const n = k.split('@')[0];
          if (containsWord(GA, k) || containsWord(GP, n)) aks.push(k);
        }
        AP = aks.join('\n');
        process.stderr.write(`WORKER_PLUGINS_AUTO kept=${AP.split('\n').filter((x) => x !== '').join(',') || '-'}\n`);
      } else {
        process.stderr.write('WORKER_PLUGINS_AUTO kept=- — ~/.claude/CLAUDE.md 를 읽지 못해 auto 로 켜 둘 플러그인이 없다\n');
      }
      KP = [...linesOf(KP), ...linesOf(AP)].filter((x) => x !== 'auto' && x !== '').join('\n');
      if (KP === '') KP = 'none';
    }

    // MCP·chrome
    if (OUTP !== '' && KP !== '' && KP !== 'none') {
      let merged = {};
      try {
        const IP = path.join(home, '.claude', 'plugins', 'installed_plugins.json');
        const inst = JSON.parse(fs.readFileSync(IP, 'utf8'));
        for (const k of linesOf(KP)) {
          if (k === 'none') continue;
          let d = null;
          try { d = inst?.plugins?.[k]?.[0]?.installPath ?? null; } catch { d = null; }
          if (typeof d !== 'string' || d === '') continue;
          try { if (!fs.statSync(d).isDirectory()) continue; } catch { continue; }
          for (const fp of [path.join(d, '.mcp.json'), path.join(d, '.claude-plugin', 'plugin.json')]) {
            let isFile = false;
            try { isFile = fs.statSync(fp).isFile(); } catch { isFile = false; }
            if (!isFile) continue;
            try {
              const p = JSON.parse(fs.readFileSync(fp, 'utf8'));
              let servers;
              if (isPlainObject(p) && Object.prototype.hasOwnProperty.call(p, 'mcpServers')) servers = p.mcpServers;
              else if (fp.endsWith('plugin.json')) servers = {};
              else servers = p;
              if (!isPlainObject(servers)) servers = {};
              Object.assign(merged, substRoot(servers, d));
            } catch { /* 깨진 파일은 건너뜀 */ }
          }
        }
      } catch { /* 설치 목록이 없으면 MCP 없음 */ }
      if (Object.keys(merged).length > 0) {
        try { fs.writeFileSync(`${OUTP}.mcp.json`, JSON.stringify({ mcpServers: merged }, null, 2) + '\n'); }
        catch { try { fs.unlinkSync(`${OUTP}.mcp.json`); } catch { /* 무시 */ } }
      }
    }
    if (OUTP !== '' && GOK && containsWord(GA, 'claude-in-chrome')) {
      try {
        fs.writeFileSync(`${OUTP}.chrome`, '');
        process.stderr.write('WORKER_CHROME_AUTO on — 지침이 claude-in-chrome 을 쓴다(--no-chrome 을 뺀다)\n');
      } catch { /* 무시 */ }
    }

    // 경고
    if (KS !== '') {
      const known = [...linesOf(UN), ...linesOf(PN)];
      for (const s of linesOf(KS)) {
        if (s === 'none' || s === 'auto' || s.startsWith('dflow-')) continue;
        if (!known.includes(s)) process.stderr.write(`WORKER_SKILL_NOT_FOUND ${s} — worker_keep_skills 의 스킬이 이 PC 에 없다(무시하고 진행)\n`);
      }
    }
    if (KP !== '' && PK !== 'keep') {
      for (const s of linesOf(KP)) {
        if (s === 'none' || s === 'auto') continue;
        if (!Object.prototype.hasOwnProperty.call(P, s)) process.stderr.write(`WORKER_PLUGIN_NOT_FOUND ${s} — worker_keep_plugins 의 플러그인이 이 PC 에서 켜져 있지 않다(무시하고 진행)\n`);
      }
    }
    if (ST !== '' && ST !== 'default') {
      let has = false;
      try { has = fs.statSync(path.join(home, '.claude', 'output-styles', `${ST}.md`)).isFile(); } catch { has = false; }
      if (!has) {
        try { has = fs.statSync(path.join(MAIN, '.claude', 'output-styles', `${ST}.md`)).isFile(); } catch { has = false; }
      }
      if (!has) process.stderr.write(`WORKER_OUTPUT_STYLE_NOT_FOUND ${ST} — 스타일 파일이 없다(내장 스타일이면 무시해도 된다. 그대로 넘긴다)\n`);
    }

    const proj = linesOf(PN);
    const keep = linesOf(KS);
    const keepP = linesOf(KP);
    const plugins = Object.fromEntries(Object.entries(P).filter(([k]) => !keepP.includes(k)));
    const offList = [
      ...(keep.length > 0 ? linesOf(UN).filter((x) => !keep.includes(x)) : []),
      ...linesOf(KO),
    ].filter((s) => !(s.startsWith('dflow-') || proj.includes(s)));
    const off = Object.fromEntries([...new Set(offList)].sort().map((s) => [s, 'off']));
    const result = {};
    if (keepP.length > 0 && Object.keys(P).length > 0) result.enabledPlugins = plugins;
    if (keepP.length > 0 && PK !== 'keep') result.syncClaudeAiPlugins = false;
    if (Object.keys(off).length > 0) result.skillOverrides = off;
    if (keep.length > 0) result.syncClaudeAiSkills = false;
    if (ST !== '') result.outputStyle = ST;
    process.stdout.write(JSON.stringify(result) + '\n');
    return 0;
  } catch (e) {
    try { process.stdout.write('{}\n'); } catch { /* 무시 */ }
    return 0;
  }
}

function isMainEntry() {
  try {
    if (!process.argv[1]) return false;
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch { return false; }
}
if (isMainEntry()) {
  let rc = 0;
  try { rc = main(process.argv.slice(2)); } catch (e) {
    try { process.stdout.write('{}\n'); } catch { /* 무시 */ }
    rc = 0;
  }
  process.exitCode = rc ?? 0;
}

