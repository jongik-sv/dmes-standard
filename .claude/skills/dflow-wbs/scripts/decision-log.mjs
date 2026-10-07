#!/usr/bin/env node
// decision-log.mjs — 자율 결정 감사 로그 헬퍼 (python `decision-log.py` 의 node 이식)
//
// LLM이 모호한 상황에서 자율적으로 내린 결정을 task/feature/project 디렉터리의
// `decisions.md`에 append-only 방식으로 기록한다. 사후 감사를 위해 진행단계 /
// 결정해야할 내용 / 결정사항 / 판단 근거 4-필드를 강제한다.
//
// 서브커맨드:
//   append --target DIR --phase P --decision-needed D --decision-made M --rationale R [--reversible yes|no] [--source S] [--scope-label LABEL]
//                                   타겟 디렉터리의 decisions.md에 항목 append
//   list --target DIR              decisions.md의 모든 항목 JSON 출력
//   validate --target DIR          포맷 정합성 검사 (D-N 누락, 필드 누락 등)
//
// Phase 화이트리스트:
//   design | build | test | refactor | wbs | feat-intake | prd-resolve | dev-team-merge | wbs-resolve
//
// 종료 코드: append 성공 0 · 입력 오류(빈 필드) 2 · list 0 · validate ok 0 / 위반 1 · 인자 오류 2.
//
// python 판과 같은 점: decisions.md 형식(머리글·`## D-NNN (UTC 시각)` 블록)·출력 JSON·종료 코드를 바이트까지 맞췄다.
//   python 판이 쓴 파일을 이 판이 읽고, 이 판이 쓴 파일을 python 판이 읽어도 같은 결과다(tests/decision-log.test.mjs 의 교차 시험).
//   파일은 BOM 을 남긴 채 읽고(python `read_text(encoding="utf-8")` 와 같다), 쓸 때는 UTF-8 + LF 로 쓴다.
//   시각은 UTC `YYYY-MM-DDTHH:MM:SSZ`(현재 시각). python 판에도 CLI 로 시각을 주입하는 길이 없어 이 판도 같게 두었다
//   (함수 `append_decision` 의 `timestamp` 인자로만 주입).
// python 판과 다른 점(알고 둔 것):
//   - 인자 해석 오류·도움말 문구는 `_shared/node/args.mjs` 의 한국어 문구다(종료 코드 2·0 은 같다).
//   - 잘못된 UTF-8 의 decisions.md 는 python 이 UnicodeDecodeError 로 끝내고 이 판도 예외로 끝난다(종료 코드 1, 문구만 다름).
//   - `D-` 번호가 2^53 을 넘으면 정확하지 않다(python 은 임의 정밀도). 현실에서는 일어나지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OK, VIOLATION, USAGE, finish, parseCli } from '../../_shared/node/args.mjs';
import { pyJsonDumps } from '../../_shared/node/pyjson.mjs';
import { pyReprStrList } from '../../_shared/node/pyrepr.mjs';
import { compareCodePoint } from '../../_shared/node/pytext.mjs';
import { PY_SPACE_CLASS, pyRstrip, pyStrip } from '../../dflow-export/scripts/_pystr.mjs';
import { pyPathStr } from '../../dflow-export/scripts/wbs-validate.mjs';
import { argparse_compat_argv, py_read_text } from './_pyio.mjs';

export const DECISIONS_FILE = 'decisions.md';

export const ALLOWED_PHASES = new Set([
  'design',
  'build',
  'test',
  'refactor',
  'wbs',
  'wbs-resolve',
  'feat-intake',
  'prd-resolve',
  'dev-team-merge',
]);

export const ALLOWED_REVERSIBLE = new Set(['yes', 'no']);

// python 정규식 의미 그대로: `^`·`$`(re.MULTILINE)는 `\n` 앞뒤만, `\s` 는 python 공백 집합, `\d` 는 유니코드 숫자.
const SP = `[${PY_SPACE_CLASS}]`;
const ENTRY_RE_SRC = `(?<![^\\n])## D-(\\p{Nd}+) \\(([^)]+)\\)${SP}*(?![^\\n])`;
const FIELD_RE_SRC = `(?<![^\\n])- \\*\\*([^*]+)\\*\\*:${SP}*([^\\n]*?)${SP}*(?![^\\n])`;
export const ENTRY_RE = new RegExp(ENTRY_RE_SRC, 'gu');
export const FIELD_RE = new RegExp(FIELD_RE_SRC, 'gu');

export const REQUIRED_FIELDS = new Set(['Phase', 'Decision needed', 'Decision made', 'Rationale']);
export const OPTIONAL_FIELDS = new Set(['Reversible', 'Source']);

/** python `ValueError` 대응. */
export class ValueError extends Error {}

// ---------------------------------------------------------------------------
// IO helpers
// ---------------------------------------------------------------------------

/** python `str(Path(target) / "decisions.md")` — `..` 는 접지 않고 빈 성분·`.` 만 정리한다. */
export function decisions_path_of(target) {
  const dir = pyPathStr(target);
  if (dir === '.') return DECISIONS_FILE;
  return `${dir}${dir.endsWith('/') || dir.endsWith('\\') ? '' : path.sep}${DECISIONS_FILE}`;
}

/** UTF-8 + LF 강제 쓰기. */
export function _write(file, content) {
  fs.writeFileSync(file, content, 'utf8');
}

/** UTC ISO-8601 timestamp, second precision, with trailing 'Z'. */
export function _utc_iso() {
  return `${new Date().toISOString().slice(0, 19)}Z`;
}

function pyResolveParts(target) {
  let abs = path.resolve(target);
  try {
    abs = fs.realpathSync(abs);
  } catch {
    // 존재하지 않거나 권한이 없으면 사전 경로 그대로
  }
  return abs.split(/[\\/]/).filter((p) => p !== '');
}

/**
 * 타겟 디렉터리 경로에서 사람이 읽기 좋은 라벨 도출.
 *   docs/tasks/TSK-04-02 → "TSK-04-02"
 *   docs/features/auth → "feature: auth"
 *   docs/ → "project"
 */
export function _scope_label_from_dir(target) {
  const parts = pyResolveParts(target);
  if (parts.includes('tasks')) {
    const i = parts.indexOf('tasks');
    if (i + 1 < parts.length) return parts[i + 1];
  }
  if (parts.includes('features')) {
    const i = parts.indexOf('features');
    if (i + 1 < parts.length) return `feature: ${parts[i + 1]}`;
  }
  return 'project';
}

// ---------------------------------------------------------------------------
// parse / append
// ---------------------------------------------------------------------------

// python `int("٣")` 처럼 유니코드 10진 숫자도 값으로 바꾼다(숫자 한 묶음은 0~9 순서로 이어진다).
function pyInt(digits) {
  let n = 0;
  for (const ch of digits) {
    let cp = ch.codePointAt(0);
    let back = 0;
    while (cp - back - 1 >= 0 && /^\p{Nd}$/u.test(String.fromCodePoint(cp - back - 1))) back += 1;
    n = n * 10 + (back % 10);
  }
  return n;
}

/**
 * decisions.md 내용을 파싱해 entry 리스트 반환.
 * 각 entry: {id: number, timestamp: string, fields: Map<key, val>, raw: string}
 */
export function _parse_entries(content) {
  const entries = [];
  const matches = [...content.matchAll(ENTRY_RE)];
  matches.forEach((m, idx) => {
    const entry_id = pyInt(m[1]);
    const timestamp = m[2];
    const body_start = m.index + m[0].length;
    const body_end = idx + 1 < matches.length ? matches[idx + 1].index : content.length;
    const body = content.slice(body_start, body_end);
    const fields = new Map();
    for (const fm of body.matchAll(FIELD_RE)) {
      fields.set(pyStrip(fm[1]), pyStrip(fm[2]));
    }
    entries.push({
      id: entry_id,
      timestamp,
      fields,
      raw: pyRstrip(content.slice(m.index, body_end)),
    });
  });
  return entries;
}

export function _next_id(entries) {
  if (entries.length === 0) return 1;
  return Math.max(...entries.map((e) => e.id)) + 1;
}

export function _format_entry(entry_id, timestamp, phase, decision_needed, decision_made, rationale, reversible, source) {
  const lines = [
    `## D-${String(entry_id).padStart(3, '0')} (${timestamp})`,
    `- **Phase**: ${phase}`,
    `- **Decision needed**: ${decision_needed}`,
    `- **Decision made**: ${decision_made}`,
    `- **Rationale**: ${rationale}`,
  ];
  if (reversible !== null && reversible !== undefined) lines.push(`- **Reversible**: ${reversible}`);
  if (source !== null && source !== undefined) lines.push(`- **Source**: ${source}`);
  return `${lines.join('\n')}\n`;
}

/**
 * decisions.md에 항목을 append. 파일 없으면 헤더와 함께 생성.
 * 반환: {id, timestamp, path}  (python 판과 같이 인자 순서를 맞췄다)
 */
export function append_decision(
  target,
  phase,
  decision_needed,
  decision_made,
  rationale,
  reversible = null,
  source = null,
  scope_label = null,
  timestamp = null,
) {
  if (!ALLOWED_PHASES.has(phase)) {
    throw new ValueError(`phase '${phase}' not in allowed set: ${pyReprStrList([...ALLOWED_PHASES].sort(compareCodePoint))}`);
  }
  if (reversible !== null && reversible !== undefined && !ALLOWED_REVERSIBLE.has(reversible)) {
    throw new ValueError(`reversible must be 'yes' or 'no', got '${reversible}'`);
  }
  for (const [label, value] of [
    ['decision_needed', decision_needed],
    ['decision_made', decision_made],
    ['rationale', rationale],
  ]) {
    if (!value || !pyStrip(value)) {
      throw new ValueError(`${label} must be non-empty`);
    }
  }

  if (target === '') target = '.'; // python Path('') == Path('.')
  fs.mkdirSync(target, { recursive: true });
  const decisions_path = decisions_path_of(target);
  const label = scope_label || _scope_label_from_dir(target);
  const ts = timestamp || _utc_iso();

  let next_id;
  let new_content;
  if (fs.existsSync(decisions_path)) {
    let existing = py_read_text(decisions_path);
    const entries = _parse_entries(existing);
    next_id = _next_id(entries);
    const entry_block = _format_entry(next_id, ts, phase, decision_needed, decision_made, rationale, reversible, source);
    if (!existing.endsWith('\n')) existing += '\n';
    new_content = `${existing}\n${entry_block}`;
  } else {
    next_id = 1;
    const header =
      `# Decisions Log — ${label}\n\n` +
      '> Append-only audit trail of autonomous decisions made during DDTR/feat/wbs cycles.\n' +
      '> Edit prior entries forbidden — record reversals as new entries instead.\n\n';
    const entry_block = _format_entry(next_id, ts, phase, decision_needed, decision_made, rationale, reversible, source);
    new_content = header + entry_block;
  }

  _write(decisions_path, new_content);
  return { id: next_id, timestamp: ts, path: decisions_path };
}

// ---------------------------------------------------------------------------
// list / validate
// ---------------------------------------------------------------------------

/** decisions.md의 모든 항목을 Map 리스트로 반환(키 순서·덮어쓰기 위치가 python dict 와 같다). 파일 없으면 []. */
export function list_decisions(target) {
  const decisions_path = decisions_path_of(target);
  if (!fs.existsSync(decisions_path)) return [];
  const content = py_read_text(decisions_path);
  return _parse_entries(content).map((e) => {
    const row = new Map([
      ['id', e.id],
      ['timestamp', e.timestamp],
    ]);
    for (const [k, v] of e.fields) row.set(k.toLowerCase().replaceAll(' ', '_'), v);
    return row;
  });
}

/**
 * decisions.md 정합성 검사.
 *   - id 연속성 (D-001, D-002, ...)
 *   - 필수 필드(Phase, Decision needed, Decision made, Rationale) 존재
 *   - phase 화이트리스트 적합
 * 반환: {ok, errors, entry_count}
 */
export function validate_decisions(target) {
  const decisions_path = decisions_path_of(target);
  if (!fs.existsSync(decisions_path)) return { ok: true, errors: [], entry_count: 0 };

  const content = py_read_text(decisions_path);
  const entries = _parse_entries(content);
  const errors = [];
  const idStr = (e) => String(e.id).padStart(3, '0');

  entries.forEach((e, i) => {
    const idx = i + 1;
    if (e.id !== idx) errors.push(`D-${idStr(e)}: expected id ${idx} (id sequence broken)`);
    const missing = [...REQUIRED_FIELDS].filter((f) => !e.fields.has(f)).sort(compareCodePoint);
    if (missing.length) errors.push(`D-${idStr(e)}: missing fields ${pyReprStrList(missing)}`);
    const phase = pyStrip(e.fields.get('Phase') ?? '');
    if (phase && !ALLOWED_PHASES.has(phase)) errors.push(`D-${idStr(e)}: phase '${phase}' not in allowed set`);
    const rev = e.fields.get('Reversible');
    if (rev !== undefined && !ALLOWED_REVERSIBLE.has(pyStrip(rev))) {
      errors.push(`D-${idStr(e)}: reversible '${rev}' not in {yes,no}`);
    }
  });

  return { ok: errors.length === 0, errors, entry_count: entries.length };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const SPEC = {
  prog: 'decision-log.mjs',
  description: '자율 결정 감사 로그 헬퍼',
  commands: {
    append: {
      options: {
        target: { type: 'string', required: true },
        phase: { type: 'string', required: true, choices: [...ALLOWED_PHASES].sort(compareCodePoint) },
        'decision-needed': { type: 'string', required: true },
        'decision-made': { type: 'string', required: true },
        rationale: { type: 'string', required: true },
        reversible: { type: 'string', choices: ['yes', 'no'] },
        source: { type: 'string' },
        'scope-label': { type: 'string' },
      },
    },
    list: { options: { target: { type: 'string', required: true } } },
    validate: { options: { target: { type: 'string', required: true } } },
  },
};

const OPTION_KINDS = Object.fromEntries(
  Object.entries(SPEC.commands).map(([c, s]) => [c, Object.fromEntries(Object.entries(s.options).map(([n, o]) => [n, o.type]))]),
);

/**
 * 종료 코드를 돌려준다(process.exit 는 부르지 않는다). 사용 오류면 args.mjs 가 stderr 에 쓰고 2 를 돌려준다.
 * @param {string[]} [argv]
 * @returns {number}
 */
export function main(argv = process.argv.slice(2)) {
  const cli = parseCli(argparse_compat_argv(argv, OPTION_KINDS), SPEC);
  if (!cli) return Number(process.exitCode ?? USAGE);
  const v = cli.values;

  if (cli.command === 'append') {
    let result;
    try {
      result = append_decision(
        v.target,
        v.phase,
        v['decision-needed'],
        v['decision-made'],
        v.rationale,
        v.reversible ?? null,
        v.source ?? null,
        v['scope-label'] ?? null,
      );
    } catch (e) {
      if (!(e instanceof ValueError)) throw e;
      process.stderr.write(`${pyJsonDumps({ ok: false, error: e.message })}\n`);
      return USAGE;
    }
    process.stdout.write(`${pyJsonDumps({ ok: true, ...result }, { ensureAscii: false })}\n`);
    return OK;
  }

  if (cli.command === 'list') {
    process.stdout.write(`${pyJsonDumps(list_decisions(v.target), { indent: 2, ensureAscii: false })}\n`);
    return OK;
  }

  if (cli.command === 'validate') {
    const result = validate_decisions(v.target);
    process.stdout.write(`${pyJsonDumps(result, { ensureAscii: false })}\n`);
    return result.ok ? OK : VIOLATION;
  }

  return VIOLATION;
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1]));
  } catch {
    return false;
  }
}

if (isMain()) finish(main());
