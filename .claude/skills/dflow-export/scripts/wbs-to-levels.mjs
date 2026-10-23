#!/usr/bin/env node
// wbs-to-levels.mjs — 옛 표기 wbs.md(`## WP-` 아래 `### TSK-` 헤딩 + 열 0 `- field:` 줄)를 levels 계약 표기로 바꾼다.
//
// D'Flow 웹 "WBS 마크다운" 탭은 levels 표기만 읽는다(frontmatter levels 가 없으면 Task 마다 "미선언 접두어" 로 거부).
// 2026-10-20 이전 /dflow-wbs 가 만든 파일, 또는 그 이전 스킬을 쓰는 PC 에서 만든 파일을 탭에 올리기 전에 한 번 바꾼다.
// 출력 규칙 정본 = dflow-wbs/references/output-format.md. 바꾼 결과는 dflow-wbs-nlevel 검증기(role skeleton)를 통과해야
// 쓰고, 통과하지 못하면 아무것도 쓰지 않는다(fail-closed).
//
// 옮기는 규칙
//  - frontmatter: project = `# WBS - {이름}`, module = --module 또는 wbs.md 가 든 폴더 이름, start_date = 머리 `start-date:`.
//    ACT 헤딩이 있으면 4단계 levels, 없으면 3단계 levels.
//  - Task: `- [ ] {ID}: {제목} [@이메일] [w:{영업일}] [{시작}~{종료}]`. 상태는 늘 `[ ]`(D'Flow 가 정본), 담당이 이메일이 아니면 토큰을
//    생략한다. w 는 일정의 평일 수이며 최소 1 이다(일정을 다시 짜지 않는다).
//  - 상세 필드 10개만 남긴다. constraints → `제약:`, description → `설명:`, note → `비고:` 로 requirements 끝에 붙이고,
//    test-criteria 는 acceptance 항목으로 붙인다. tech-spec·api-spec·data-model·ui-spec 은 `PRD/TRD 절 번호` 뿐이면 prd-ref 에,
//    글이 있으면 `기술:`·`API:`·`데이터:`·`화면:` 으로 requirements 에 붙인다(웹은 이 두 필드만 받으므로 버리지 않는다).
//  - WP 의 schedule 줄은 버리고 description 은 `<!-- … -->` 한 줄로 남긴다. `## Dev Config` 절은 뺀다.
//  - 그 밖의 절(`## 의존 그래프` 등)은 그대로 두되, 웹 파서가 Task 필드로 읽어 버리는 줄이 있으면 실패한다.
// 옮기며 바꾼 것·버린 것은 stderr 리포트에 모두 적는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCli, finish } from '../../_shared/node/args.mjs';
import { parse_wbs, validate } from '../../dflow-wbs-nlevel/scripts/wbs-nlevel-parse.mjs';

const LEVELS = {
  3: [
    '  - { name: WP,      prefix: WP,  progress: rollup, report: weekly }',
    '  - { name: Task,    prefix: TSK, progress: input }',
    '  - { name: SubTask, prefix: STK, progress: checklist, optional: true, upload: fold }',
  ],
  4: [
    '  - { name: WP,       prefix: WP,  progress: rollup, report: weekly }',
    '  - { name: Activity, prefix: ACT, progress: rollup }',
    '  - { name: Task,     prefix: TSK, progress: input }',
    '  - { name: SubTask,  prefix: STK, progress: checklist, optional: true, upload: fold }',
  ],
};

// 웹 파서(src/lib/wbsmd/parse.ts FIELD_KEYS)가 읽는 상세 필드 — 이 순서로 쓴다
const FIELD_ORDER = ['category', 'domain', 'model', 'priority', 'tags', 'depends', 'prd-ref', 'entry-point', 'requirements', 'acceptance'];
const PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);
// 옛 Task 블록에서 알고 처리하는 키. 나머지는 버리고 리포트한다.
const KNOWN_TASK_KEYS = new Set([
  ...FIELD_ORDER, 'status', 'assignee', 'schedule', 'blocked-by', 'note', 'description',
  'constraints', 'test-criteria', 'tech-spec', 'api-spec', 'data-model', 'ui-spec',
]);
const SPEC_LABELS = [['tech-spec', '기술'], ['api-spec', 'API'], ['data-model', '데이터'], ['ui-spec', '화면']];

const YMD = String.raw`\d{4}-\d{2}-\d{2}`;
const WP_RE = /^##\s+(WP-\d+):\s*(.*)$/;
const ACT_RE = /^###\s+(ACT-\d+(?:-\d+)+):\s*(.*)$/;
const TSK_RE = /^(#{3,5})\s+(TSK-\d+(?:-\d+)+):\s*(.*)$/;
const HEADING_RE = /^(#{1,6})\s/;
const FIELD_RE = /^- ([a-zA-Z][a-zA-Z0-9_-]*):(.*)$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// `PRD 3, TRD 3.1·3.2` 처럼 절 번호만 있는 값
const POINTER_RE = /^(?:PRD|TRD)\s*\d[\d.·~]*(?:\s*,\s*(?:(?:PRD|TRD)\s*)?\d[\d.·~]*)*$/;
// 제목에 있으면 웹 파서가 토큰으로 떼어 가는 꼴(output-format.md 「Task 줄」)
const TITLE_TOKEN_RES = [/%/, /\s@\S/, /\sw:[\d.]/, new RegExp(String.raw`\s~${YMD}`), new RegExp(String.raw`${YMD}\s*~`), /\scredit:\S/, /\sif-id:\S/];
// 남기는 절에서 마지막 Task 의 필드로 붙거나 노드로 읽히는 줄
const STRAY_FIELD_RE = new RegExp(String.raw`^\s{2,}-\s+(?:${FIELD_ORDER.join('|')}):`);
const STRAY_CHECKBOX_RE = /^\s*-\s+\[( |x|M)\]\s/;
const STRAY_ID_HEADING_RE = /^#{1,6}\s+[A-Z][A-Z0-9]*(?:-[^\s:]+)*:\s*\S/;

class ConvertError extends Error {}

/** 시작~종료(포함) 평일 수. */
export function businessDays(start, end) {
  let n = 0;
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  for (; d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

/** 줄 배열을 펜스 안 여부와 함께 돌려준다. */
function markFences(lines) {
  let open = null;
  return lines.map((line) => {
    const m = FENCE_RE.exec(line);
    if (open) {
      if (m && m[1][0] === open[0] && m[1].length >= open.length) open = null;
      return { line, fenced: true };
    }
    if (m) {
      open = m[1];
      return { line, fenced: true };
    }
    return { line, fenced: false };
  });
}

/**
 * 옛 Task 블록 본문(헤딩 다음 줄부터)의 열 0 필드를 Map<key, string[]> 로 읽는다.
 * 한 줄 값은 항목 1개(쉼표로 나누지 않는다), `-` 는 빈 값, 값이 비면 밑의 `  - 항목` 줄들이 항목이다.
 * 4칸 이상 들여쓴 이어쓰기 줄은 직전 항목 뒤에 공백으로 잇는다(출력은 한 필드 한 줄이다).
 */
export function readTaskFields(body) {
  const fields = new Map();
  const stray = [];
  let items = null;
  for (const { line, fenced } of markFences(body)) {
    if (!fenced) {
      const m = FIELD_RE.exec(line);
      if (m) {
        const v = m[2].trim();
        const list = v && v !== '-' ? [v] : [];
        if (!fields.has(m[1])) fields.set(m[1], list);
        items = v ? null : list;
        continue;
      }
      if (items && line.startsWith('  - ')) {
        items.push(line.slice(4).trim());
        continue;
      }
      if (items && items.length && /^ {4,}\S/.test(line)) {
        items[items.length - 1] += ` ${line.trim().replace(/^-\s+/, '')}`;
        continue;
      }
      if (!line.trim() || HEADING_RE.test(line)) {
        items = null;
        continue;
      }
    }
    items = null;
    stray.push(line);
  }
  return { fields, stray };
}

function csv(list) {
  return list.flatMap((v) => v.split(',')).map((s) => s.trim()).filter((s) => s && s !== '-');
}

/** 옛 Task 하나를 levels 표기 줄 배열로. */
function convertTask(id, title, body, report) {
  const { fields, stray } = readTaskFields(body);
  const get = (k) => fields.get(k) ?? [];
  const one = (k) => get(k)[0] ?? null;
  const note = (msg) => report.push(`${id}: ${msg}`);

  if (TITLE_TOKEN_RES.some((re) => re.test(` ${title}`))) {
    throw new ConvertError(`${id}: 제목에 웹 파서가 토큰으로 떼어 가는 글자가 있습니다(%·@·w:·날짜~) — 제목을 고친 뒤 다시 돌리세요: ${title}`);
  }
  for (const k of fields.keys()) if (!KNOWN_TASK_KEYS.has(k)) note(`모르는 필드 '${k}' 를 버렸습니다: ${get(k).join(' | ')}`);
  for (const line of stray) note(`필드가 아닌 줄을 버렸습니다: ${line.trim()}`);

  const status = one('status');
  if (status && status !== '[ ]') note(`상태 ${status} 는 옮기지 않았습니다(상태 정본 = D'Flow)`);
  if (get('blocked-by').length) note(`blocked-by(${get('blocked-by').join(', ')}) 를 버렸습니다(차단은 D'Flow 가 관리)`);

  const tokens = [];
  const assignee = one('assignee');
  if (assignee && EMAIL_RE.test(assignee)) tokens.push(`@${assignee}`);
  else if (assignee) note(`담당 '${assignee}' 는 이메일이 아니라 토큰을 생략했습니다`);

  const schedule = one('schedule');
  const range = schedule && new RegExp(String.raw`^(${YMD})\s*~\s*(${YMD})$`).exec(schedule);
  const endOnly = schedule && new RegExp(String.raw`^~\s*(${YMD})$`).exec(schedule);
  if (range) {
    const [, start, end] = range;
    if (start > end) throw new ConvertError(`${id}: 일정 시작이 종료보다 늦습니다: ${schedule}`);
    let w = businessDays(start, end);
    if (w === 0) {
      w = 1;
      note(`일정 ${schedule} 에 평일이 없어 w:1 로 두었습니다`);
    }
    tokens.push(`w:${w}`, `${start}~${end}`);
  } else if (endOnly) {
    tokens.push(`~${endOnly[1]}`);
    note(`일정에 시작일이 없어 w 와 시작일을 생략했습니다: ${schedule}`);
  } else if (schedule) {
    note(`일정 '${schedule}' 을 읽지 못해 생략했습니다`);
  }

  const priority = one('priority');
  if (priority && !PRIORITIES.has(priority)) {
    throw new ConvertError(`${id}: priority '${priority}' 는 critical·high·medium·low 가 아니라 서버가 업로드 전체를 거부합니다`);
  }

  // prd-ref + 절 번호뿐인 명세 값
  const prdRef = csv(get('prd-ref'));
  const req = [...get('requirements')];
  const specClauses = [];
  for (const [key, label] of SPEC_LABELS) {
    for (const v of get(key)) {
      if (POINTER_RE.test(v)) {
        const added = csv([v]).filter((p) => !prdRef.includes(p));
        prdRef.push(...added);
        if (added.length) note(`${key} '${v}' → prd-ref 에 더함`);
      } else {
        specClauses.push(`${label}: ${v}`);
        note(`${key} → requirements '${label}:'`);
      }
    }
  }
  req.push(...get('constraints').map((c) => `제약: ${c}`), ...specClauses);
  req.push(...get('description').map((d) => `설명: ${d}`), ...get('note').map((n) => `비고: ${n}`));

  const acceptance = [...get('acceptance'), ...get('test-criteria')];
  const slashed = acceptance.find((a) => a.includes(' / '));
  if (slashed) {
    throw new ConvertError(`${id}: acceptance·test-criteria 항목에 ' / ' 가 있어 항목 구분과 겹칩니다 — 고친 뒤 다시 돌리세요: ${slashed}`);
  }

  const values = {
    category: one('category'),
    domain: one('domain'),
    model: one('model'),
    priority,
    tags: csv(get('tags')).join(', '),
    depends: csv(get('depends')).join(', '),
    'prd-ref': prdRef.join(', '),
    'entry-point': one('entry-point'),
    requirements: req.join('; '),
    acceptance: acceptance.join(' / '),
  };
  const out = [`- [ ] ${id}: ${title}${tokens.length ? ` ${tokens.join(' ')}` : ''}`];
  for (const k of FIELD_ORDER) if (values[k]) out.push(`  - ${k}: ${values[k]}`);
  return out;
}

/** WP·ACT 헤딩 밑 메타 줄 → 남길 주석 줄. */
function convertMeta(id, body, report) {
  const out = [];
  for (const line of body) {
    if (!line.trim()) continue;
    const m = FIELD_RE.exec(line);
    if (m && m[1] === 'schedule') continue;
    if (m && m[1] === 'description') {
      const v = m[2].trim();
      if (v && v !== '-') out.push(`<!-- ${v.replaceAll('-->', '—>')} -->`);
      continue;
    }
    if (m && m[1] === 'phase') throw new ConvertError(`${id}: phase 층은 이 변환기가 다루지 않습니다 — /dflow-wbs-nlevel 로 다시 만드세요`);
    report.push(`${id}: 헤딩 밑 줄을 버렸습니다: ${line.trim()}`);
  }
  return out;
}

/**
 * 옛 표기 텍스트 → { text, report, taskCount }.
 * @param {string} text
 * @param {{ module: string }} opts
 */
export function convertLegacyWbs(text, { module }) {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  if (lines[0].trim() === '---') throw new ConvertError('이미 frontmatter 가 있습니다 — levels 표기 파일은 바꾸지 않습니다.');
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(module)) {
    throw new ConvertError(`module '${module}' 이 형식(^[A-Za-z0-9_-]{1,32}$)에 맞지 않습니다 — --module 로 영문 코드를 주세요.`);
  }

  const marked = markFences(lines);
  const report = [];
  const head = [];
  const body = [];
  let project = null;
  let startDate = null;
  let hasAct = false;
  let taskCount = 0;
  let firstChapter = marked.findIndex(({ line, fenced }) => !fenced && /^## /.test(line));
  if (firstChapter < 0) firstChapter = lines.length;

  // 머리(첫 `## ` 앞): 제목·`>` 줄을 남기고 version 줄·가로줄은 뺀다
  for (const { line } of marked.slice(0, firstChapter)) {
    const t = /^# WBS\s*-\s*(.+)$/.exec(line);
    if (t) project = t[1].trim();
    const sd = new RegExp(String.raw`start-date:\s*(${YMD})`).exec(line);
    if (line.startsWith('>') && sd) startDate = sd[1];
    if (/^>\s*version:/.test(line) || /^\s*(-{3,}|\*{3,})\s*$/.test(line)) continue;
    head.push(line);
  }

  // 절 단위로 나눈다(`## ` 헤딩)
  const chapters = [];
  for (let i = firstChapter; i < marked.length; i++) {
    if (!marked[i].fenced && /^## /.test(marked[i].line)) chapters.push({ start: i, end: marked.length });
    if (chapters.length > 1) chapters[chapters.length - 2].end = chapters[chapters.length - 1].start;
  }

  for (const { start, end } of chapters) {
    const heading = lines[start];
    const wp = WP_RE.exec(heading);
    if (!wp) {
      if (/^##\s+Dev Config\b/i.test(heading)) {
        report.push('## Dev Config 절을 뺐습니다(levels 표기에 두지 않는다 — 원문은 git 이력, 품질 명령 정본은 대상 리포 TRD)');
        continue;
      }
      for (let i = start; i < end; i++) {
        const { line } = marked[i];
        if (STRAY_FIELD_RE.test(line) || STRAY_CHECKBOX_RE.test(line) || (i > start && STRAY_ID_HEADING_RE.test(line) && !marked[i].fenced)) {
          throw new ConvertError(`'${heading}' 절 ${i + 1}행을 웹 파서가 노드·필드로 읽습니다 — 고친 뒤 다시 돌리세요: ${line}`);
        }
      }
      body.push(...lines.slice(start, end));
      continue;
    }

    // WP 절: 헤딩마다 [헤딩 줄, 본문 줄들] 로 나눈다
    body.push(`## ${wp[1]}: ${wp[2].trim()}`);
    let i = start + 1;
    const take = (stop) => {
      const got = [];
      while (i < end && !stop(marked[i])) got.push(lines[i++]);
      return got;
    };
    body.push(...convertMeta(wp[1], take(({ line, fenced }) => !fenced && HEADING_RE.test(line)), report));
    while (i < end) {
      const line = lines[i];
      const act = ACT_RE.exec(line);
      const tsk = TSK_RE.exec(line);
      i++;
      if (act) {
        hasAct = true;
        body.push('', `### ${act[1]}: ${act[2].trim()}`);
        body.push(...convertMeta(act[1], take(({ line: l, fenced }) => !fenced && HEADING_RE.test(l)), report));
      } else if (tsk) {
        const level = tsk[1].length;
        // Task 블록 = 같은 깊이 이하 헤딩·다른 TSK 헤딩 전까지(`#### PRD 요구사항` 같은 하위 헤딩은 블록 안)
        const block = take(({ line: l, fenced }) => TSK_RE.test(l) || (!fenced && HEADING_RE.test(l) && HEADING_RE.exec(l)[1].length <= level));
        taskCount++;
        body.push('', ...convertTask(tsk[2], tsk[3].trim(), block, report));
      } else if (line.trim()) {
        report.push(`${wp[1]}: 옮기지 못한 줄을 버렸습니다: ${line.trim()}`);
      }
    }
    body.push('');
  }

  if (!project) throw new ConvertError('첫 머리에 `# WBS - {프로젝트명}` 제목이 없습니다.');
  const depth = hasAct ? 4 : 3;
  const front = [
    '---',
    `project: ${project.replace(/#/g, '')}`,
    `module: ${module}`,
    ...(startDate ? [`start_date: ${startDate}`] : []),
    'levels:',
    ...LEVELS[depth],
    '---',
    '',
  ];
  const headOut = head.map((l) => (/^>\s*depth:/.test(l) ? `> depth: ${depth}` : l));
  while (headOut.length && !headOut[headOut.length - 1].trim()) headOut.pop();
  const out = [...front, ...headOut, '', ...body].join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n');
  return { text: out, report, taskCount };
}

// ── CLI ──────────────────────────────────────────────────────────────────

const SPEC = {
  prog: 'wbs-to-levels.mjs',
  description: '옛 표기 wbs.md → levels 계약 표기(D\'Flow 웹 "WBS 마크다운" 탭용). 검증을 통과해야 쓴다.',
  options: {
    wbs: { type: 'string', required: true, help: '옛 표기 wbs.md' },
    module: { type: 'string', help: 'frontmatter module (기본: wbs.md 가 든 폴더 이름)' },
    out: { type: 'string', help: '쓸 경로 (없으면 stdout)' },
    'in-place': { type: 'boolean', help: '--wbs 파일을 바꾼 내용으로 덮어쓴다' },
  },
};

export function main(argv = process.argv.slice(2)) {
  const cli = parseCli(argv, SPEC);
  if (!cli) return Number(process.exitCode ?? 2);
  const { wbs, out, 'in-place': inPlace } = cli.values;
  const module = cli.values.module ?? path.basename(path.dirname(path.resolve(wbs)));
  try {
    const { text, report, taskCount } = convertLegacyWbs(fs.readFileSync(wbs, 'utf8'), { module });
    const doc = parse_wbs(text);
    const rep = validate(doc, 'skeleton');
    const newTasks = doc.nodes.filter((n) => n.id.startsWith('TSK-')).length;
    if (newTasks !== taskCount) rep.errors.push(`Task 수가 다릅니다: 옛 표기 ${taskCount}개 → 새 표기 ${newTasks}개`);
    for (const line of report) process.stderr.write(`- ${line}\n`);
    for (const w of rep.warnings) process.stderr.write(`경고: ${w}\n`);
    if (rep.errors.length) {
      for (const e of rep.errors) process.stderr.write(`에러: ${e}\n`);
      process.stderr.write('검증 실패 — 아무것도 쓰지 않았습니다.\n');
      return 1;
    }
    const target = inPlace ? wbs : out;
    if (target) fs.writeFileSync(target, text);
    else process.stdout.write(text);
    process.stderr.write(`변환 완료: Task ${taskCount}개, module ${module}${target ? ` → ${target}` : ''}\n`);
    return 0;
  } catch (e) {
    if (!(e instanceof ConvertError)) throw e;
    process.stderr.write(`에러: ${e.message}\n`);
    return 1;
  }
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
