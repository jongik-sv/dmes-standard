// ui_docs 골든 비교용 픽스처 트리·케이스 표·실행기. ui_docs.test.mjs 와 make-expected-ui.mjs 가 함께 쓴다.
//
// ui_docs 는 `__file__`(import.meta.url) 기준으로 SKILL·REPO·SHARED 경로를 계산하므로, 케이스마다 임시 폴더에 작은 저장소 모양을 만든다.
//   <root>/.claude/skills/mantine-aggrid-ui/{scripts, references/components, references/examples}
//   <root>/.claude/skills/_shared/node/*.mjs                    (node 판만)
//   <root>/src/frontend/shared/src/...                          (export 원본)
//   <root>/src/frontend/m-mqc/node_modules/{.bin/tsc, typescript/bin/tsc}   (가짜 tsc: check-examples 흐름 시험용)
// python 판과 node 판은 **각자 자기 트리**에서 자기 생성물(llms.txt·llms-full.txt)로 비교한다(pre 단계에서 각 판이 자기 `--write` 를 먼저 돈다).
// 출력 정규화(의도된 차이): python 출력의 `python3 …X.py` → `node …X.mjs`, `X_docs.py` → `X_docs.mjs`, `node_modules/.bin/tsc` → `node_modules/typescript/bin/tsc`,
// 트리 경로 → <TREE>, 줄끝 CRLF → LF. audit 가 섞이는 출력은 파일 단위 안정 정렬을 적용한다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPython } from '../../_shared/node/proc.mjs';
import { runCommand, runNode } from './_run.mjs';
import { normSep } from './_norm.mjs';
import { GROUPS, EXCLUDED, EXPORT_FILES } from '../scripts/ui_docs.mjs';
import { normalizeAuditOutput, normPythonText, copyTreeNow } from './_mantine_golden.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(HERE, '..');
export const SKILLS_DIR = path.resolve(SKILL_DIR, '..');
export const REPO_ROOT = path.resolve(SKILLS_DIR, '..', '..');
export const SCRIPTS = path.join(SKILL_DIR, 'scripts');
export const LEGACY = path.join(HERE, 'golden', 'legacy');
export const EXPECTED_FILE = path.join(HERE, 'golden', 'expected', 'ui_docs.json');
const SKILL_REL = ['.claude', 'skills', 'mantine-aggrid-ui'];

const PY_ENV = { PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' };

function put(root, rel, content, mode) {
  const f = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  if (mode) fs.chmodSync(f, mode);
  return f;
}
const crlf = (s) => s.replace(/\n/g, '\r\n');
export const skillPath = (root, ...rel) => path.join(root, ...SKILL_REL, ...rel);

// ---------------------------------------------------------------------------
// 합성 문서·export 원본
// ---------------------------------------------------------------------------
const pascal = (name) => name.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('');

/** 기본 문서 내용(문서 이름 → 본문). 특별한 모양은 SPECIAL 이 덮는다. */
function baseDoc(name) {
  return `# ${pascal(name)}\n\n${pascal(name)} 의 한 줄 설명.\n\n## 언제 쓰나\n\n- ${name} 을 쓸 때\n`;
}

const IMPORT_LINE = [
  'PageLayout', 'SearchArea', 'InnerAlias', 'ContentBody', 'DetailForm', 'useLayoutThing', 'loadLayout', 'LayoutClass',
  'Button', 'FormInput', '한글이름', 'WidgetThing', 'Plain', 'useGridDataManager',
].join(', ');

const SPECIAL = {
  button: `# Button\n\n버튼 문서.\n\n\`\`\`tsx\nimport { ${IMPORT_LINE} } from '@dk-oasis/shared/form';\n// a+b 와 foo.+bar 그리고 한글이름 도 쓴다\n\`\`\`\n\n## 언제 쓰나\n\n본문에는 InnerHidden 이 있다.\n`,
  input: crlf('# Input\r\n\r\n입력 칸 문서(CRLF).\r\n\r\n## 언제 쓰나\r\n\r\n본문\r\n'),
  select: '요약만 있고 제목이 없는 문서.\n\n## 언제 쓰나\n',
  radio: '﻿# Radio\n\nBOM 이 앞에 붙은 문서.\n\n## 언제 쓰나\n',
  'combo-box': '# Combo Box\n\n```\n# 코드 안 제목 같은 줄\n```\n\n실제 요약.\n\n## 언제 쓰나\n',
  'date-picker': '# DatePicker\n\n# 둘째 제목 줄\n\n요약은 둘째 제목 뒤 첫 줄.\n\n## 언제 쓰나\n',
  tabs: '# 탭 모음\n\n한글 제목의 문서.\n\n## 언제 쓰나\n',
  tree: '# Tree\n\n요약 앞부분 요약 뒷부분\n\n쪽\fform feed 줄\n\x0b수직 탭 줄\n\x85next line 줄\n\n## 언제 쓰나\n',
  checkbox: '# Checkbox\n\n   \n\t \n  공백 줄 뒤 요약  \n\n## 언제 쓰나\n',
  'form-group': '# FormGroup\n',
  textarea: '\n\n# Textarea  \n\n\n  앞뒤 공백 요약 　\n\n## 언제 쓰나\n\n\n\n끝에 빈 줄 많음\n\n\n',
  loading: '# Loading\n\n## 언제 쓰나\n## 바로 다음 제목이 요약이 된다\n',
};

function docText(name) {
  return SPECIAL[name] ?? baseDoc(name);
}

const SHARED_SRC = {
  'layout/index.ts': `export { PageLayout, SearchArea, type SearchAreaProps, Inner as InnerAlias } from './page-layout';
export {
  ContentBody,
  DetailForm,
  MaxHandle,
} from './content-body';
export type { OnlyType } from './t';
export type OnlyType2 = string;
export const useLayoutThing = () => 1;
export async function loadLayout() {}
export class LayoutClass {}
export function* gen() {}
export default PageLayout;
`,
  'components/form/index.ts': `export { Button, Input as FormInput } from './x';
export const 한글이름 = 1;
export const $dollar = 2;
export const a1_b = 3;
export { Button as Dup } from './dup';
`,
  'components/grid/index.ts': `export { useGridDataManager, DataGrid, GRID_TEMP_ID_FIELD } from './x';\r\nexport { Plain } from './plain';\r\n`,
  'widget/index.ts': `export { WidgetThing } from './w';
export { WIDGET_CSS } from './css';
`,
  'hooks/use-api-call.ts': `export const useApiCall = () => 1;\nexport { useApiCall as useApiCall2 }\n`,
  // 존재하지 않는 EXPORT_FILES 항목은 건너뛴다(나머지는 만들지 않음)
};

// 한글이름 주변은 공백이라 \b 경계가 선다.
// 본문(llms.txt 가 아닌 문서 모음)에 모든 export 이름이 나타나도록 문서 하나를 더 쓴다.
const COVER_DOC_NAME = 'modal';
const COVER_DOC = `# Modal\n\n모달 문서.\n\n## 언제 쓰나\n\n본문 전체에 export 가 나온다: SearchAreaProps OnlyType loadLayout LayoutClass useApiCall useApiCall2 Dup a1_b Plain\n`;

// ---------------------------------------------------------------------------
// 트리 만들기
// ---------------------------------------------------------------------------
const AGGRID_STUB_PY = `import os
import sys

print("aggrid-stub", " ".join(sys.argv[1:]))
sys.exit(int(os.environ.get("STUB_AGGRID_RC", "0")))
`;
const AGGRID_STUB_MJS = `console.log('aggrid-stub', process.argv.slice(2).join(' '));
process.exitCode = Number(process.env.STUB_AGGRID_RC || 0);
`;
const FAKE_TSC = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const walk = (d, p = '') => fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))
  .flatMap((e) => (e.isDirectory() ? [p + e.name + '/', ...walk(path.join(d, e.name), p + e.name + '/')] : [p + e.name]));
console.log('fake-tsc args:', process.argv.slice(2).join(' '));
console.log('cwd:', process.cwd());
console.log('skillcheck:', fs.existsSync('.skillcheck') ? walk('.skillcheck').join(',') : 'none');
console.log('cfg:', fs.existsSync('tsconfig.skillcheck.json') ? fs.readFileSync('tsconfig.skillcheck.json', 'utf8').trim() : 'none');
process.exit(Number(process.env.FAKE_TSC_RC || 0));
`;

const EXAMPLE_FILES = {
  'grid-edit/page.tsx': `export default function Page() { return null; }\n`,
  'grid-edit/한글 파일.tsx': `export const x = 1;\n`,
  'list-detail/bad.tsx': `import { Collapse } from '@mantine/core';\nexport const a = <Collapse in={true} />;\n`,
  'master-detail/readme.md': '# not scanned by audit dir walk\n',
};

let seq = 0;

/**
 * 트리를 만든다. kind: 'syn'(합성 문서) | 'real'(이 저장소의 실제 문서·export 원본 사본)
 * @returns {string} 트리 루트(realpath)
 */
export function buildTree(base, tool, kind, { examples = 'syn', stubAggrid = true } = {}) {
  seq += 1;
  const root = fs.realpathSync(fs.mkdtempSync(path.join(base, `${tool}${seq}-`)));
  const scripts = skillPath(root, 'scripts');
  fs.mkdirSync(scripts, { recursive: true });
  if (tool === 'py') {
    fs.copyFileSync(path.join(LEGACY, 'ui_docs.legacy.py'), path.join(scripts, 'ui_docs.py'));
    fs.copyFileSync(path.join(LEGACY, 'mantine_docs.legacy.py'), path.join(scripts, 'mantine_docs.py'));
    if (stubAggrid) put(scripts, 'aggrid_docs.py', AGGRID_STUB_PY);
  } else {
    fs.copyFileSync(path.join(SCRIPTS, 'ui_docs.mjs'), path.join(scripts, 'ui_docs.mjs'));
    fs.copyFileSync(path.join(SCRIPTS, 'mantine_docs.mjs'), path.join(scripts, 'mantine_docs.mjs'));
    if (stubAggrid) put(scripts, 'aggrid_docs.mjs', AGGRID_STUB_MJS);
    const sharedDst = path.join(root, '.claude', 'skills', '_shared', 'node');
    fs.mkdirSync(sharedDst, { recursive: true });
    const sharedSrc = path.join(SKILLS_DIR, '_shared', 'node');
    for (const f of fs.readdirSync(sharedSrc)) {
      if (f.endsWith('.mjs')) fs.copyFileSync(path.join(sharedSrc, f), path.join(sharedDst, f));
    }
  }
  const comp = skillPath(root, 'references', 'components');
  fs.mkdirSync(comp, { recursive: true });
  if (kind === 'real') {
    copyTreeNow(path.join(SKILL_DIR, 'references', 'components'), comp);
    const shared = path.join(REPO_ROOT, 'src', 'frontend', 'shared', 'src');
    for (const rel of EXPORT_FILES) {
      const src = path.join(shared, ...rel.split('/'));
      if (fs.existsSync(src)) put(path.join(root, 'src', 'frontend', 'shared', 'src'), rel, fs.readFileSync(src));
    }
  } else {
    for (const [, names] of GROUPS) for (const n of names) put(comp, `${n}.md`, n === COVER_DOC_NAME ? COVER_DOC : docText(n));
    for (const [rel, text] of Object.entries(SHARED_SRC)) put(path.join(root, 'src', 'frontend', 'shared', 'src'), rel, text);
  }
  if (examples === 'syn') {
    for (const [rel, text] of Object.entries(EXAMPLE_FILES)) put(skillPath(root, 'references', 'examples'), rel, text);
    fs.mkdirSync(skillPath(root, 'references', 'examples', 'empty-dir'), { recursive: true });
  } else if (examples === 'real') {
    copyTreeNow(path.join(SKILL_DIR, 'references', 'examples'), skillPath(root, 'references', 'examples'));
  }
  put(root, 'src/frontend/m-mqc/node_modules/.bin/tsc', FAKE_TSC, 0o755);
  put(root, 'src/frontend/m-mqc/node_modules/typescript/bin/tsc', FAKE_TSC, 0o755);
  put(root, 'src/frontend/m-mqc/tsconfig.json', '{}\n');
  return root;
}

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------
function runTool(root, tool, args, env = {}) {
  const py = findPython();
  if (tool === 'py') {
    return runCommand(py, [skillPath(root, 'scripts', 'ui_docs.py'), ...args], { cwd: root, env: { ...PY_ENV, ...env }, normalizeEol: true });
  }
  return runNode(skillPath(root, 'scripts', 'ui_docs.mjs'), args, { cwd: root, env, normalizeEol: true });
}

function norm(text, root, tool) {
  let t = text.replace(/\r\n?/g, '\n');
  if (tool === 'py') t = normPythonText(t).split('node_modules/.bin/tsc').join('node_modules/typescript/bin/tsc');
  for (const r of new Set([root, fs.realpathSync(root)])) t = t.split(r).join('<TREE>');
  return normSep(t); // 윈도우에서는 `\` → `/` (비교 단계 정규화, _norm.mjs)
}

/** 케이스 하나를 한 도구로 실행한다 → {status, stdout, stderr, files} */
export function runCase(base, c, tool) {
  const root = buildTree(base, tool, c.tree ?? 'syn', { examples: c.examples ?? 'syn' });
  c.setup?.(root);
  for (const pre of c.pre ?? []) {
    const r = runTool(root, tool, pre);
    if (r.status !== 0) throw new Error(`${tool} pre ${pre.join(' ')} 실패(${r.status}): ${r.stdout}${r.stderr}`);
  }
  c.after?.(root, tool);
  const r = runTool(root, tool, c.args, c.env);
  let stdout = norm(r.stdout, root, tool);
  if (c.audit) stdout = normalizeAuditOutput(stdout);
  const res = c.statusOnly ? { status: r.status } : { status: r.status, stdout, stderr: norm(r.stderr, root, tool) };
  if (c.snap) {
    res.files = {};
    for (const rel of c.snap) {
      const f = path.join(root, ...rel.split('/'));
      if (!fs.existsSync(f)) { res.files[rel] = null; continue; }
      if (fs.statSync(f).isDirectory()) { res.files[rel] = `<dir:${fs.readdirSync(f).sort().join(',')}>`; continue; }
      const buf = fs.readFileSync(f);
      res.files[rel] = { crlf: buf.includes('\r\n'), text: norm(buf.toString('utf8'), root, tool) };
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// 케이스 표
// ---------------------------------------------------------------------------
const GEN = [['index', '--write'], ['full', '--write']];
const LLMS = '.claude/skills/mantine-aggrid-ui/references/components/llms.txt';
const LLMS_FULL = '.claude/skills/mantine-aggrid-ui/references/components/llms-full.txt';
const comp = (root, f) => skillPath(root, 'references', 'components', f);
const shared = (root, rel) => path.join(root, 'src', 'frontend', 'shared', 'src', ...rel.split('/'));
const toCrlf = (f) => fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/\n/g, '\r\n'));
const EXAMPLES_DIR = (root) => skillPath(root, 'references', 'examples');
const M_MQC = (root) => path.join(root, 'src', 'frontend', 'm-mqc');

export const CASES = [
  // index / full
  { id: 'index-stdout', args: ['index'] },
  { id: 'index-write', args: ['index', '--write'], snap: [LLMS] },
  { id: 'full-stdout', args: ['full'] },
  { id: 'full-write', args: ['full', '--write'], snap: [LLMS_FULL] },
  { id: 'index-after-hangul-doc', args: ['index'], setup: (r) => fs.writeFileSync(comp(r, 'badge.md'), '# 배지 　제목\n\n배지 요약\n') },
  { id: 'full-write-stale-crlf-overwritten', args: ['full', '--write'], pre: GEN, after: (r) => toCrlf(comp(r, 'llms-full.txt')), snap: [LLMS_FULL] },
  // get
  { id: 'get-filename', args: ['get', 'button'] },
  { id: 'get-uppercase-md', args: ['get', 'Button.md'] },
  { id: 'get-hyphen-insensitive', args: ['get', 'combobox'] },
  { id: 'get-hyphen-insensitive2', args: ['get', 'Multi-Select-Combo-Box'] },
  { id: 'get-title-partial', args: ['get', 'combo'] },
  { id: 'get-title-with-space', args: ['get', 'combo box'] },
  { id: 'get-title-korean', args: ['get', '탭'] },
  { id: 'get-crlf-doc', args: ['get', 'input'] },
  { id: 'get-bom-doc', args: ['get', 'radio'] },
  { id: 'get-export-name', args: ['get', 'InnerAlias'] },
  { id: 'get-export-hook', args: ['get', 'useLayoutThing'] },
  { id: 'get-export-korean', args: ['get', '한글이름'] },
  { id: 'get-export-metachars', args: ['get', 'a+b'] },
  { id: 'get-export-metachars2', args: ['get', '.+'] },
  { id: 'get-export-wrong-case', args: ['get', 'innerAlias'] },
  { id: 'get-export-substring-no-boundary', args: ['get', 'Inner'] },
  { id: 'get-export-below-header-only', args: ['get', 'InnerHidden'] },
  { id: 'get-empty-name', args: ['get', ''] },
  { id: 'get-not-found', args: ['get', 'zzz-none'] },
  { id: 'get-regex-special-not-found', args: ['get', '(unclosed'] },
  { id: 'get-form-feed-doc', args: ['get', 'tree'] },
  // coverage
  { id: 'coverage-pass', args: ['coverage'], pre: GEN },
  { id: 'coverage-no-generated', args: ['coverage'] },
  { id: 'coverage-crlf-generated', args: ['coverage'], pre: GEN, after: (r) => { toCrlf(comp(r, 'llms.txt')); toCrlf(comp(r, 'llms-full.txt')); } },
  { id: 'coverage-crlf-only-full', args: ['coverage'], pre: GEN, after: (r) => toCrlf(comp(r, 'llms-full.txt')) },
  { id: 'coverage-stale-doc-edit', args: ['coverage'], pre: GEN, after: (r) => fs.appendFileSync(comp(r, 'button.md'), '\n추가 문장\n') },
  { id: 'coverage-stale-title-edit', args: ['coverage'], pre: GEN, after: (r) => fs.writeFileSync(comp(r, 'badge.md'), '# Badge2\n\n요약\n') },
  { id: 'coverage-only-index-missing', args: ['coverage'], pre: GEN, after: (r) => fs.rmSync(comp(r, 'llms.txt')) },
  { id: 'coverage-missing-export', args: ['coverage'], pre: GEN, after: (r) => fs.appendFileSync(shared(r, 'widget/index.ts'), 'export const BrandNewThing = 1;\nexport { Another } from "./y";\n') },
  { id: 'coverage-missing-export-excluded-ok', args: ['coverage'], pre: GEN, after: (r) => fs.appendFileSync(shared(r, 'widget/index.ts'), 'export { resetMdmMetaStore, MDM_META_TTL_MS } from "./z";\n') },
  { id: 'coverage-hangul-adjacent', args: ['coverage'], setup: (r) => fs.writeFileSync(comp(r, 'button.md'), docText('button').replaceAll('한글이름', '한글이름은')), pre: [] },
  { id: 'coverage-word-boundary-substring', args: ['coverage'], pre: GEN, after: (r) => fs.appendFileSync(shared(r, 'layout/index.ts'), 'export const Plai = 1;\nexport const Lay = 2;\n') },
  { id: 'coverage-comment-inside-export-list', args: ['coverage'], pre: GEN, after: (r) => fs.appendFileSync(shared(r, 'widget/index.ts'), 'export {\n  WidgetThing, // 주석도 이름으로 읽힌다\n  Other as Renamed,\n  type Hidden,\n   type  Spaced,\n  A as B as C,\n} from "./q";\n') },
  { id: 'coverage-missing-doc', args: ['coverage'], pre: GEN, after: (r) => fs.rmSync(comp(r, 'tabs.md')) },
  { id: 'coverage-two-missing-docs-and-export', args: ['coverage'], pre: GEN, after: (r) => { fs.rmSync(comp(r, 'tabs.md')); fs.rmSync(comp(r, 'tree.md')); fs.appendFileSync(shared(r, 'widget/index.ts'), 'export const BrandNewThing = 1;\n'); } },
  { id: 'coverage-doc-with-only-export-in-other-doc', args: ['coverage'], pre: GEN, after: (r) => { fs.appendFileSync(shared(r, 'layout/index.ts'), 'export const OnlyInModalDoc = 1;\n'); fs.appendFileSync(comp(r, 'modal.md'), 'OnlyInModalDoc\n'); } },
  // 사용 오류
  { id: 'usage-no-args', args: [], statusOnly: true },
  { id: 'usage-bad-command', args: ['nope'], statusOnly: true },
  { id: 'usage-get-missing', args: ['get'], statusOnly: true },
  { id: 'usage-index-bad-option', args: ['index', '--nope'], statusOnly: true },
  { id: 'usage-coverage-extra', args: ['coverage', 'extra'], statusOnly: true },
  // check-examples (가짜 tsc)
  { id: 'check-ok', args: ['check-examples'], snap: ['src/frontend/m-mqc/.skillcheck', 'src/frontend/m-mqc/tsconfig.skillcheck.json'], examples: 'syn',
    setup: (r) => fs.rmSync(path.join(EXAMPLES_DIR(r), 'list-detail'), { recursive: true }) },
  { id: 'check-audit-violation', args: ['check-examples'], snap: ['src/frontend/m-mqc/.skillcheck', 'src/frontend/m-mqc/tsconfig.skillcheck.json'] },
  { id: 'check-tsc-fails', args: ['check-examples'], env: { FAKE_TSC_RC: '2' }, snap: ['src/frontend/m-mqc/.skillcheck', 'src/frontend/m-mqc/tsconfig.skillcheck.json'],
    setup: (r) => fs.rmSync(path.join(EXAMPLES_DIR(r), 'list-detail'), { recursive: true }) },
  { id: 'check-tsc-fails-and-audit', args: ['check-examples'], env: { FAKE_TSC_RC: '2', STUB_AGGRID_RC: '1' } },
  { id: 'check-aggrid-fails', args: ['check-examples'], env: { STUB_AGGRID_RC: '4' },
    setup: (r) => fs.rmSync(path.join(EXAMPLES_DIR(r), 'list-detail'), { recursive: true }) },
  { id: 'check-no-tsc', args: ['check-examples'], setup: (r) => { fs.rmSync(path.join(M_MQC(r), 'node_modules'), { recursive: true }); } },
  { id: 'check-stale-work-and-cfg', args: ['check-examples'], snap: ['src/frontend/m-mqc/.skillcheck', 'src/frontend/m-mqc/tsconfig.skillcheck.json'],
    setup: (r) => {
      put(M_MQC(r), '.skillcheck/old/stale.txt', 'stale');
      put(M_MQC(r), 'tsconfig.skillcheck.json', 'stale cfg');
      fs.rmSync(path.join(EXAMPLES_DIR(r), 'list-detail'), { recursive: true });
    } },
  { id: 'check-examples-missing', args: ['check-examples'], statusOnly: true, snap: ['src/frontend/m-mqc/.skillcheck', 'src/frontend/m-mqc/tsconfig.skillcheck.json'],
    setup: (r) => fs.rmSync(EXAMPLES_DIR(r), { recursive: true }) },
  { id: 'check-keeps-other-m-mqc-files', args: ['check-examples'], snap: ['src/frontend/m-mqc/tsconfig.json', 'src/frontend/m-mqc/keep.txt'],
    setup: (r) => { put(M_MQC(r), 'keep.txt', 'keep'); fs.rmSync(path.join(EXAMPLES_DIR(r), 'list-detail'), { recursive: true }); } },
];

/** 실제 문서·export 원본 사본으로 비교하는 케이스(python 이 있을 때만) */
export const REAL_CASES = [
  { id: 'real-index', tree: 'real', args: ['index'], examples: 'none' },
  { id: 'real-full', tree: 'real', args: ['full'], examples: 'none' },
  { id: 'real-index-write', tree: 'real', args: ['index', '--write'], examples: 'none', snap: [LLMS] },
  { id: 'real-full-write', tree: 'real', args: ['full', '--write'], examples: 'none', snap: [LLMS_FULL] },
  { id: 'real-coverage-after-generate', tree: 'real', args: ['coverage'], pre: GEN, examples: 'none' },
  { id: 'real-get-filename', tree: 'real', args: ['get', 'ag-data-grid'], examples: 'none' },
  { id: 'real-get-title', tree: 'real', args: ['get', 'AgDataGrid'], examples: 'none' },
  { id: 'real-get-export-name', tree: 'real', args: ['get', 'useGridDataManager'], examples: 'none' },
  { id: 'real-get-hyphen', tree: 'real', args: ['get', 'combobox'], examples: 'none' },
  { id: 'real-get-date-time', tree: 'real', args: ['get', 'DateTimePicker'], examples: 'none' },
  { id: 'real-get-select', tree: 'real', args: ['get', 'select'], examples: 'none' },
  { id: 'real-get-export-only', tree: 'real', args: ['get', 'GridPanel'], examples: 'none' },
  { id: 'real-get-dashboard', tree: 'real', args: ['get', 'Dashboard'], examples: 'none' },
  { id: 'real-get-not-found', tree: 'real', args: ['get', 'definitely-not-a-component'], examples: 'none' },
  { id: 'real-check-examples', tree: 'real', args: ['check-examples'], examples: 'real', snap: ['src/frontend/m-mqc/.skillcheck'] },
];

/** python 모듈의 데이터(GROUPS·EXCLUDED·EXPORT_FILES)를 JSON 으로 꺼낸다(python 이 있을 때). */
export function pythonData(base) {
  const py = findPython();
  if (!py) return null;
  const d = fs.mkdtempSync(path.join(base, 'pydata-'));
  fs.copyFileSync(path.join(LEGACY, 'ui_docs.legacy.py'), path.join(d, 'ui_docs.py'));
  const code = 'import json,sys; sys.path.insert(0, sys.argv[1]); import ui_docs as m; '
    + 'print(json.dumps({"groups": m.GROUPS, "excluded": list(m.EXCLUDED.items()), "exportFiles": m.EXPORT_FILES}, ensure_ascii=False))';
  const r = runCommand(py, ['-B', '-c', code, d], { env: PY_ENV });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

export function nodeData() {
  return { groups: GROUPS.map(([t, n]) => [t, [...n]]), excluded: [...EXCLUDED.entries()], exportFiles: [...EXPORT_FILES] };
}
