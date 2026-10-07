#!/usr/bin/env node
// OASIS/cactus 계약 위반 검사기 (check_oasis_contract.py 의 node 이식판. 윈도우에는 node 만 있다).
//
// 정본: docs/guide/BackEnd/standard-v2/backend-standard/02-structure-naming-constraints.md §6-B~6-E
//
// 검사 대상은 BPMN 의 camunda:class 로 참조되는 진입점 bean 이다.
// 디렉터리 glob 이 아니라 BPMN 을 근거로 대상을 정하므로, service/ 밖에 있는
// Service(mqc/domain, mls/common 등)도 빠짐없이 잡힌다.
//
// 주석/문자열 리터럴은 제거한 뒤 판정한다. 코드가 "@Transactional 미부착(cactus 경계)"
// 처럼 규칙 자체를 Javadoc 에 적어두는 경우가 많아, 소박한 grep 은 대량 오탐을 낸다.
//
// CLI: --root --module(반복) --json --all --severity ERROR|WARN|INFO
// 종료 코드: 0=위반 없음, 1=기준 이상 위반, 2=BPMN 0건 또는 사용 오류. (python 판과 같다.)
// 훅(hook_post_edit.mjs)은 runCheck() 를 같은 프로세스에서 호출한다.
//
// python 판과 맞춘 방언 차이: python3 의 \w·\s·\b 는 유니코드 기준이라 아래 정규식은 \p{L}\p{N}_ 와
// python 의 공백 집합을 직접 쓴다. 파일 읽기는 read_text(errors="ignore") 처럼 잘못된 바이트를 버리고
// CRLF/CR 을 LF 로 바꾼다(BOM 은 python 처럼 그대로 둔다).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { walkSorted, toPosix } from '../../_shared/node/paths.mjs';
import { compareCodePoint } from '../../_shared/node/pytext.mjs';
import { pyJsonDumps } from '../../_shared/node/pyjson.mjs';
import { parseCli, finish, OK, VIOLATION, USAGE } from '../../_shared/node/args.mjs';

export const MES_MODULES = ['mcm', 'mls', 'mqc', 'mpp', 'mas', 'mcm-core'];
const FE_MODULES = ['mcm', 'mls', 'mqc', 'mpp', 'mas'];
const SKIP_DIR_PARTS = new Set(['build', 'node_modules', '.next', 'dist', 'out', '.git']);
const SEVERITY_ORDER = { ERROR: 0, WARN: 1, INFO: 2 };

// ---------------------------------------------------------------------------
// python 정규식 방언 대응 조각
// ---------------------------------------------------------------------------
// python3 str 패턴의 \s (= str.isspace). JS \s 와 달리 \x1c-\x1f·\x85 를 포함하고 \ufeff 는 뺀다.
const S = String.raw`[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]`;
// python3 의 \w (= isalnum 또는 '_'). \b 는 JS 가 ASCII 기준이라 `(?!W)` 로 직접 쓴다.
const W = String.raw`[\p{L}\p{N}_]`;
const NOT_W_AHEAD = String.raw`(?![\p{L}\p{N}_])`;

const RE_BLOCK_COMMENT = /\/\*.*?\*\//gs;
const RE_LINE_COMMENT = /\/\/[^\n]*/g;
const RE_STRING_LITERAL = /"(?:\\[^\n]|[^"\\])*"/g; // python `.` 는 \n 만 제외한다
const RE_CAMUNDA_CLASS = /camunda:class="([^"]+)"/g;
const RE_SERVICE_NAME = new RegExp(String.raw`@Service\(${S}*"([^"]+)"${S}*\)`, 'g');
const RE_TRANSACTIONAL = new RegExp(String.raw`@Transactional${NOT_W_AHEAD}[^\n]*`, 'u');
const RE_SERVICE_TASK = new RegExp(String.raw`<bpmn:serviceTask${NOT_W_AHEAD}(.*?)</bpmn:serviceTask>`, 'gsu');
const RE_CONDITION = new RegExp(String.raw`<(?:bpmn:)?conditionExpression${NOT_W_AHEAD}`, 'gu');
const RE_PARAMS = new RegExp(String.raw`params${S}*:${S}*\{([^}]*)\}`, 'gu');
const RE_PARAMS_BAD = new RegExp(String.raw`(${W}+)${S}*:${S}*(rows${NOT_W_AHEAD}|\[|${W}*[Rr]ows${NOT_W_AHEAD})`, 'u');
const RE_GRIDS_KEY = new RegExp(String.raw`grids${S}*:${S}*\{${S}*([A-Za-z_][A-Za-z0-9_]*)`, 'gu');
const RE_MAP_RETURN = new RegExp(String.raw`public${S}+Map<String,${S}*Object>${S}+${W}+${S}*\(`, 'u');

// python str.strip() 의 공백 집합 (= isspace)
const PY_STRIP = new RegExp(String.raw`^${S}+|${S}+$`, 'g');
const pyStrip = (s) => s.replace(PY_STRIP, '');

// ---------------------------------------------------------------------------
// 파일 읽기: python read_text(encoding="utf-8", errors="ignore") 와 같게
// ---------------------------------------------------------------------------
function decodeUtf8Ignore(buf) {
  // 잘못된 바이트(최대 부분열 단위)를 버린다. 정상 U+FFFD(EF BF BD)는 그대로 둔다.
  let out = '';
  const n = buf.length;
  let i = 0;
  while (i < n) {
    const b = buf[i];
    if (b < 0x80) { out += String.fromCharCode(b); i++; continue; }
    let need;
    let cp;
    let lo = 0x80;
    let hi = 0xbf;
    if (b >= 0xc2 && b <= 0xdf) { need = 1; cp = b & 0x1f; }
    else if (b >= 0xe0 && b <= 0xef) { need = 2; cp = b & 0x0f; if (b === 0xe0) lo = 0xa0; if (b === 0xed) hi = 0x9f; }
    else if (b >= 0xf0 && b <= 0xf4) { need = 3; cp = b & 0x07; if (b === 0xf0) lo = 0x90; if (b === 0xf4) hi = 0x8f; }
    else { i++; continue; }
    let j = i + 1;
    let ok = true;
    for (let k = 0; k < need; k++, j++) {
      if (j >= n || buf[j] < lo || buf[j] > hi) { ok = false; break; }
      cp = (cp << 6) | (buf[j] & 0x3f);
      lo = 0x80;
      hi = 0xbf;
    }
    if (ok) out += String.fromCodePoint(cp);
    i = j;
  }
  return out;
}

const strictUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export function readSource(file) {
  const buf = fs.readFileSync(file);
  let text = buf.toString('utf8');
  if (text.includes('\ufffd')) {
    try { strictUtf8.decode(buf); } catch { text = decodeUtf8Ignore(buf); }
  }
  // python 텍스트 모드의 universal newlines (BOM 은 utf-8 이라 남는다)
  if (text.includes('\r')) text = text.replace(/\r\n?/g, '\n');
  return text;
}

// ---------------------------------------------------------------------------
// 주석/문자열 제거
// ---------------------------------------------------------------------------
/** 주석과 문자열 리터럴을 제거한다. 판정은 반드시 이 결과 위에서 한다. */
export function stripJava(src) {
  return src.replace(RE_BLOCK_COMMENT, '').replace(RE_LINE_COMMENT, '').replace(RE_STRING_LITERAL, '""');
}

export function stripTs(src) {
  return src.replace(RE_BLOCK_COMMENT, '').replace(RE_LINE_COMMENT, '');
}

function finding(rule, severity, target, detail) {
  return { rule, severity, target, detail };
}

// ---------------------------------------------------------------------------
// 파일 수집 (walkSorted: 코드포인트 순, 폴더 가지치기)
// ---------------------------------------------------------------------------
const skipDir = (name) => SKIP_DIR_PARTS.has(name);
const hasSkippedPart = (abs) => abs.split(/[\\/]/).some((part) => SKIP_DIR_PARTS.has(part));

// python Path 정렬(성분별 코드포인트 순)
function comparePaths(a, b) {
  const pa = a.split(/[\\/]/);
  const pb = b.split(/[\\/]/);
  const n = Math.min(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const c = compareCodePoint(pa[i], pb[i]);
    if (c !== 0) return c;
  }
  return pa.length - pb.length;
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

/** src/backend 를 한 번만 걸어 BPMN·Java 를 함께 모은다. */
function collectBackend(root, modules) {
  const backend = path.join(root, 'src', 'backend');
  const bpmnSet = new Set();
  const javas = [];
  let backendFiles = null;
  const walkBackend = () => {
    if (!backendFiles) {
      backendFiles = isDir(backend) && !hasSkippedPart(backend)
        ? walkSorted(backend, { skipDirs: skipDir, extensions: ['.bpmn', '.java'] })
        : [];
    }
    return backendFiles;
  };

  // python 판처럼 경로 자체(루트 위쪽 포함)에 build/node_modules/... 성분이 있으면 그 아래 파일은 모두 제외된다
  for (const m of modules) {
    const base = path.resolve(backend, m);
    if (!isDir(base) || hasSkippedPart(base)) continue;
    if (base === backend || base.startsWith(backend + path.sep)) {
      // backend 안쪽이면 한 번 걸은 결과에서 걸러낸다
      const prefix = base + path.sep;
      for (const f of walkBackend()) {
        if (f.endsWith('.bpmn') && (base === backend || f.startsWith(prefix))) bpmnSet.add(f);
      }
    } else {
      for (const f of walkSorted(base, { skipDirs: skipDir, extensions: ['.bpmn'] })) bpmnSet.add(f);
    }
  }
  for (const f of walkBackend()) {
    if (f.endsWith('.java') && !toPosix(f).includes('/src/test/')) javas.push(f);
  }
  return { bpmns: [...bpmnSet].sort(comparePaths), javas };
}

function javaStem(p) {
  const b = path.basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(0, i) : b;
}

function capitalizeFirst(b) {
  const first = String.fromCodePoint(b.codePointAt(0));
  return first.toUpperCase() + b.slice(first.length);
}

/** camunda:class 는 FQCN 이 아니라 Spring bean 이름이다. */
function resolveBeans(bpmns, javas, bpmnText) {
  const beans = new Map();
  for (const p of bpmns) {
    for (const m of bpmnText(p).matchAll(RE_CAMUNDA_CLASS)) {
      const list = beans.get(m[1]);
      if (list) list.push(p); else beans.set(m[1], [p]);
    }
  }

  const byStem = new Map();
  const byExplicit = new Map();
  for (const p of javas) {
    const stem = javaStem(p);
    if (!byStem.has(stem)) byStem.set(stem, p);
    const txt = readSource(p);
    if (!txt.includes('@Service')) continue;
    for (const m of txt.matchAll(RE_SERVICE_NAME)) byExplicit.set(m[1], p);
  }

  const resolved = new Map();
  const unresolved = [];
  for (const b of [...beans.keys()].sort(compareCodePoint)) {
    const p = byExplicit.get(b) || byStem.get(capitalizeFirst(b));
    if (p) resolved.set(b, p); else unresolved.push(b);
  }
  return { beans, resolved, unresolved };
}

const relOf = (root, p) => toPosix(path.relative(root, p));

/** 진입점 Service 의 @Transactional -> CGLIB proxy -> ParameterName must not be null. */
function check6B(resolved, root, javaCode, findings) {
  for (const [bean, p] of resolved) {
    const m = RE_TRANSACTIONAL.exec(javaCode(p));
    if (m) {
      findings.push(finding(
        '6-B-1',
        'ERROR',
        relOf(root, p),
        `진입점 bean '${bean}' 에 ${pyStrip(m[0])} 잔존. ` +
          'CGLIB proxy 생성으로 parameter name 유실 -> ' +
          "IllegalArgumentException('ParameterName must not be null'). " +
          '제거하고 BPMN process 의 camunda:property name="tx" 로 대체할 것.',
      ));
    }
  }
}

function checkBpmn(bpmns, root, bpmnText, findings) {
  for (const p of bpmns) {
    const txt = bpmnText(p);
    const rel = relOf(root, p);

    for (const m of txt.matchAll(RE_SERVICE_TASK)) {
      const blk = m[0];
      const tidM = /id="([^"]+)"/.exec(blk);
      const tid = tidM ? tidM[1] : '?';

      // 6-C-1: JavaServiceTask 는 grid property 미지원
      if (blk.includes('name="grid"')) {
        findings.push(finding(
          '6-C-1',
          'ERROR',
          `${rel}:${tid}`,
          'serviceTask 에 grid property 사용. JavaServiceTaskExecutable 미지원 -> ' +
            "PropertyException('[grid] is an unavailable attribute') + 롤백. " +
            'method parameter 이름 <-> grids.{key} 자동 binding 을 쓸 것.',
        ));
      }

      // 6-C-2: output 누락 -> 응답에 data/grids 미생성 (성공처럼 보이는 실패)
      if (!blk.includes('name="output"')) {
        findings.push(finding(
          '6-C-2',
          'ERROR',
          `${rel}:${tid}`,
          'serviceTask 에 output property 누락. 반환값이 ServiceResult 에 ' +
            '등록되지 않아 응답이 {"meta":{...}} 만 되고 화면 0 건. ' +
            '단일 List -> output="{listKey}", 단일 값 -> output="{valueKey}".',
        ));
      }
    }

    // 6-C-3: sequenceFlow name 만으로 분기.
    // 문서상 '불필요' 이지 금지가 아니고 기존 38 파일이 이미 쓰고 있다(baseline).
    // ERROR/WARN 으로 올리면 첫 실행부터 노이즈가 신호를 덮으므로 INFO 로 둔다.
    // 접두사 있는 형태(mqc)와 없는 형태(mcm)가 공존한다.
    const n = (txt.match(RE_CONDITION) || []).length;
    if (n) {
      findings.push(finding(
        '6-C-3',
        'INFO',
        rel,
        `conditionExpression ${n} 건. OASIS 는 actionGateway 의 input 값을 ` +
          'sequenceFlow name 과 매칭하므로 불필요하다. 정본 reference' +
          '(secObj.bpmn 등)는 name 만 쓴다. 기존 파일이면 유지해도 동작한다.',
      ));
    }
  }
}

function lineCounter(src) {
  // 오름차순 위치에 대한 줄 번호(1부터)를 증분으로 센다
  let pos = 0;
  let line = 1;
  return (idx) => {
    for (let i = src.indexOf('\n', pos); i !== -1 && i < idx; i = src.indexOf('\n', pos)) {
      line++;
      pos = i + 1;
    }
    return line;
  };
}

function checkFrontend(root, findings) {
  const files = [];
  for (const m of FE_MODULES) {
    const base = path.join(root, 'src', 'frontend', `m-${m}`);
    if (!isDir(base) || hasSkippedPart(base)) continue;
    // python 판은 *.ts 전부 뒤에 *.tsx 를 붙이지만 아래에서 finding 정렬이 순서를 정하므로 한 번에 걷는다
    const found = walkSorted(base, { skipDirs: skipDir, extensions: ['.ts', '.tsx'] });
    files.push(...found.filter((f) => f.endsWith('.ts')), ...found.filter((f) => f.endsWith('.tsx')));
  }

  for (const p of files) {
    const src = stripTs(readSource(p));
    if (!src.includes('params') && !src.includes('grids')) continue;
    const rel = relOf(root, p);
    const lineAt = lineCounter(src);

    // 6-E-2: params 에 List -> CactusRequestConverter 가 throw
    RE_PARAMS.lastIndex = 0;
    for (let m = RE_PARAMS.exec(src); m; m = RE_PARAMS.exec(src)) {
      const bad = RE_PARAMS_BAD.exec(m[1]);
      if (bad) {
        findings.push(finding(
          '6-E-2',
          'ERROR',
          `${rel}:${lineAt(m.index)}`,
          `params 에 배열로 보이는 값('${pyStrip(bad[0])}') 전달. ` +
            'CactusRequestConverter 가 TypeReference 없이 wrap 하여 ' +
            "IllegalArgumentException('Generic type ...') throw. " +
            'grids: {{key}: {rows: [...]}} 로 옮길 것.',
        ));
      }
    }

    // 6-E-3: grids key 는 Java parameter 이름과 글자 단위로 일치해야 한다 -> camelCase
    const lineAt2 = lineCounter(src);
    RE_GRIDS_KEY.lastIndex = 0;
    for (let m = RE_GRIDS_KEY.exec(src); m; m = RE_GRIDS_KEY.exec(src)) {
      const key = m[1];
      if (key.includes('_')) {
        const camel = key.replace(/_(\w)/g, (_, c) => c.toUpperCase());
        findings.push(finding(
          '6-E-3',
          'ERROR',
          `${rel}:${lineAt2(m.index)}`,
          `grids key '${key}' 에 snake_case 사용. Java parameter 이름과 ` +
            `글자 단위로 일치해야 binding 된다. '${camel}' 로 통일할 것.`,
        ));
      }
    }
  }
}

/** Map 반환 + output 명시 -> FE 가 unwrapPayload 로 풀어야 한다 (비표준). */
function check6D(resolved, root, javaCode, findings) {
  for (const [bean, p] of resolved) {
    if (RE_MAP_RETURN.test(javaCode(p))) {
      findings.push(finding(
        '6-D-2',
        'INFO',
        relOf(root, p),
        `진입점 bean '${bean}' 이 Map 을 반환한다. cactus 는 Map 내부 List 를 ` +
          '자동 분리하지 않아 응답이 data.{key} 에 Map 통째로 담긴다. ' +
          'FE 에 대응 unwrapPayload 가 있는지 확인할 것. ' +
          '권장은 List/단일값 직접 반환 + serviceTask 분기.',
      ));
    }
  }
}

function pyListRepr(items) {
  return `[${items.map((s) => (s.includes("'") && !s.includes('"') ? `"${s}"` : `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)).join(', ')}]`;
}

/**
 * 검사를 실행한다(출력 없음).
 * @param {{root?: string, modules?: string[]|null, severity?: 'ERROR'|'WARN'|'INFO'}} [opts]
 * @returns {{exitCode:number, noBpmn?:true, root:string, modules:string[], scanned?:object, counts?:object, findings?:object[],
 *            bpmnCount?:number, beanCount?:number, resolvedCount?:number, unresolvedCount?:number}}
 */
export function runCheck({ root = '.', modules = null, severity = 'ERROR' } = {}) {
  let rootAbs = path.resolve(root);
  try { rootAbs = fs.realpathSync(rootAbs); } catch { /* 없는 경로면 그대로(결과는 BPMN 0건) */ }
  const mods = modules && modules.length ? modules : MES_MODULES;

  const { bpmns, javas } = collectBackend(rootAbs, mods);
  if (!bpmns.length) return { exitCode: USAGE, noBpmn: true, root: rootAbs, modules: mods };

  const bpmnCache = new Map();
  const bpmnText = (p) => {
    let t = bpmnCache.get(p);
    if (t === undefined) { t = readSource(p); bpmnCache.set(p, t); }
    return t;
  };
  const codeCache = new Map();
  const javaCode = (p) => {
    let t = codeCache.get(p);
    if (t === undefined) { t = stripJava(readSource(p)); codeCache.set(p, t); }
    return t;
  };

  const { beans, resolved, unresolved } = resolveBeans(bpmns, javas, bpmnText);

  const findings = [];
  check6B(resolved, rootAbs, javaCode, findings);
  checkBpmn(bpmns, rootAbs, bpmnText, findings);
  checkFrontend(rootAbs, findings);
  check6D(resolved, rootAbs, javaCode, findings);

  for (const b of unresolved) {
    findings.push(finding(
      'RESOLVE',
      'WARN',
      b,
      'camunda:class 가 가리키는 bean 의 Java 클래스를 찾지 못했다. ' +
        '@Service("이름") 명시 누락이거나 다른 모듈 소유일 수 있다. ' +
        '미해석 bean 은 6-B/6-D 검사에서 제외되었다.',
    ));
  }

  findings.sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
    compareCodePoint(a.rule, b.rule) ||
    compareCodePoint(a.target, b.target));
  const counts = { ERROR: 0, WARN: 0, INFO: 0 };
  for (const f of findings) counts[f.severity]++;

  const threshold = SEVERITY_ORDER[severity];
  const exitCode = findings.some((f) => SEVERITY_ORDER[f.severity] <= threshold) ? VIOLATION : OK;
  return {
    exitCode,
    root: rootAbs,
    modules: mods,
    scanned: { bpmn: bpmns.length, entrypoint_beans: beans.size, resolved: resolved.size, unresolved: unresolved.length },
    counts,
    findings,
  };
}

/** `--json` 출력 문자열(끝 개행 포함). python `json.dumps(ensure_ascii=False, indent=2)` 와 바이트 동일. */
export function formatJson(result) {
  return pyJsonDumps(
    { scanned: result.scanned, counts: result.counts, findings: result.findings },
    { indent: 2, ensureAscii: false },
  ) + '\n';
}

/** 텍스트 출력 문자열(끝 개행 포함). */
export function formatText(result, all = false) {
  const { scanned, counts, findings } = result;
  const out = [];
  out.push(`BPMN ${scanned.bpmn} / 진입점 bean ${scanned.entrypoint_beans} (해석 ${scanned.resolved}, 미해석 ${scanned.unresolved})`);
  out.push(`ERROR ${counts.ERROR} / WARN ${counts.WARN} / INFO ${counts.INFO}`);

  // ERROR 는 전문 출력. WARN/INFO 는 기본적으로 규칙별 집계만 낸다.
  // baseline 성 항목(6-C-3 38 건, 6-D-2 49 건)이 ERROR 를 덮는 것을 막는다.
  const shown = findings.filter((f) => f.severity === 'ERROR' || all);
  if (shown.length) out.push('');
  for (const f of shown) {
    out.push(`[${f.severity}] ${f.rule}  ${f.target}`);
    out.push(`    ${f.detail}`);
  }

  if (!all) {
    const rest = findings.filter((f) => f.severity !== 'ERROR');
    if (rest.length) {
      const byRule = new Map();
      for (const f of rest) {
        const k = `${f.severity}\u0000${f.rule}`;
        byRule.set(k, (byRule.get(k) || 0) + 1);
      }
      out.push('');
      out.push('-- 참고 (--all 로 전문 출력) --');
      const keys = [...byRule.keys()].sort((a, b) => {
        const [sa, ra] = a.split('\u0000');
        const [sb, rb] = b.split('\u0000');
        return compareCodePoint(sa, sb) || compareCodePoint(ra, rb);
      });
      for (const k of keys) {
        const [sev, rule] = k.split('\u0000');
        out.push(`[${sev}] ${rule}  ${byRule.get(k)} 건`);
      }
    }
  }

  if (!findings.length) {
    out.push('');
    out.push('위반 없음.');
  }
  return out.join('\n') + '\n';
}

export function main(argv = process.argv.slice(2)) {
  const cli = parseCli(argv, {
    prog: 'check_oasis_contract.mjs',
    options: {
      root: { type: 'string', default: '.', help: '저장소 루트' },
      module: { type: 'string', multiple: true, help: '검사할 모듈 (기본: MES 전체)' },
      json: { type: 'boolean', help: 'JSON 출력' },
      all: { type: 'boolean', help: 'WARN/INFO 도 전문 출력' },
      severity: { type: 'string', default: 'ERROR', choices: ['ERROR', 'WARN', 'INFO'], help: '이 등급 이상이 있으면 exit 1 (기본 ERROR)' },
    },
  });
  if (!cli) return;
  const { values } = cli;

  const result = runCheck({ root: values.root, modules: values.module, severity: values.severity });
  if (result.noBpmn) {
    process.stderr.write(`검사 대상 BPMN 이 없다. root=${result.root} modules=${pyListRepr(result.modules)}\n`);
    return finish(USAGE);
  }
  process.stdout.write(values.json ? formatJson(result) : formatText(result, values.all));
  return finish(result.exitCode);
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1]));
  } catch {
    return false;
  }
}

if (isMain()) main();
