#!/usr/bin/env node
// DMES 공통 UI 컴포넌트 문서(references/components) 조회·생성·점검 도구.
//
// PrimeReact 의 llms.txt / llms-full.txt 방식을 따른다.
//   - components/llms.txt      : 컴포넌트 1개 = 한 줄(링크 + 용도). `index --write` 가 생성한다.
//   - components/llms-full.txt : 모든 컴포넌트 문서 합본. `full --write` 가 생성한다.
//   - components/<name>.md     : 컴포넌트별 사용 문서(사람이 쓴다).
//
//   node ui_docs.mjs index                 # 색인 출력 (--write 로 llms.txt 갱신)
//   node ui_docs.mjs get <이름>            # 컴포넌트 문서 출력 (파일명·제목·export 이름 모두 가능)
//   node ui_docs.mjs full [--write]        # 합본 출력 / llms-full.txt 갱신
//   node ui_docs.mjs coverage              # shared export 중 문서·제외 목록 어디에도 없는 것 + 생성물 최신 여부
//   node ui_docs.mjs check-examples        # references/examples 를 m-mqc 설정으로 tsc + audit
//
// ── python 판(tests/golden/legacy/ui_docs.legacy.py)과 달라진 점 ──────────────────────────
//  - 실행: `python3 ui_docs.py …` → `node ui_docs.mjs …`(node 18.17 이상, 외부 의존성 없음). 안내 문구·생성 문구 속 이름도 바뀐다
//    (「이 파일은 `node …/ui_docs.mjs index --write` 가 생성한다」). 그래서 llms.txt·llms-full.txt 는 python 판이 만든 것과 이 한 줄만 다르다.
//  - 줄끝: 읽을 때 CRLF·CR 을 LF 로 바꾸고(python universal newlines) 쓸 때는 항상 LF 다(윈도우 python 은 CRLF 로 썼다).
//    CRLF 로 체크아웃된 llms*.txt 도 coverage 의 「생성물 낡음」 비교를 통과한다.
//  - 사용 오류(argparse): 종료 코드 2 는 같지만 stderr 문구는 공용 헬퍼(_shared/node/args.mjs)의 한국어 `사용: …`·`오류: …` 이다.
//    -h/--help 는 종료 코드 0 이고 머리말의 사용 예 블록(node 호출 형태)을 보여 준다.
//  - `\b{이름}\b` 검색(find_doc·coverage)은 python 처럼 한글을 단어 문자로 본다(JS 의 ASCII `\b` 를 쓰지 않는다).
//  - check-examples: tsc 는 `node_modules/.bin/tsc`(윈도우에서는 tsc.cmd 라 직접 실행이 안 된다) 대신 `process.execPath` 로
//    `m-mqc/node_modules/typescript/bin/tsc` 를 부른다. 그래서 「tsc 없음: …」 문구의 경로가 `…/node_modules/typescript/bin/tsc` 로 바뀐다
//    (python 판은 `…/node_modules/.bin/tsc`). 하위 audit 은 `process.execPath` + 같은 폴더의 mantine_docs.mjs·aggrid_docs.mjs 를 부른다.
//    .skillcheck 복사는 직접 쓴 재귀 복사이고, 정리는 이 스크립트가 만든 .skillcheck·tsconfig.skillcheck.json 만 지운다(python 판과 같음).
//    자식 프로세스 출력이 섞이는 순서는 터미널 기준으로 자연스럽다(python 은 파이프일 때 자기 출력을 마지막에 모아 낸다).
//  - 읽을 때 문서의 BOM 은 python 처럼 지우지 않는다(BOM 이 있는 문서는 제목을 못 찾는 것도 같다).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCli, finish, OK, VIOLATION } from '../../_shared/node/args.mjs';
import { compareCodePoint, splitlinesPy } from '../../_shared/node/pytext.mjs';
import { hasWordBounded, pyReU, pyStrip, readPy } from './mantine_docs.mjs';

const SCRIPT_FILE = fs.realpathSync(fileURLToPath(import.meta.url));
export const SCRIPTS = path.dirname(SCRIPT_FILE);
export const SKILL = path.dirname(SCRIPTS);
export const COMP = path.join(SKILL, 'references', 'components');
export const EXAMPLES = path.join(SKILL, 'references', 'examples');
export const REPO = path.dirname(path.dirname(path.dirname(SKILL)));
export const FRONT = path.join(REPO, 'src', 'frontend');
export const SHARED = path.join(FRONT, 'shared', 'src');

// 색인 묶음: [제목, 문서 파일명 목록]. 새 문서를 추가하면 여기에 넣는다.
export const GROUPS = [
  ['화면 골격 (`@dk-oasis/shared/layout`)', ['page-layout', 'search-area', 'search-settings-menu', 'content-body', 'detail-form']],
  ['입력 (`@dk-oasis/shared/form`)', [
    'button', 'input', 'select', 'combo-box', 'multi-select-combo-box', 'date-picker', 'date-time-picker',
    'checkbox', 'radio', 'segmented-control', 'textarea', 'form-group', 'loading', 'badge', 'select-or-input',
    'use-detail-draft', 'use-busy',
  ]],
  ['목록 (`@dk-oasis/shared/grid`)', [
    'ag-data-grid', 'grid-panel', 'use-grid-data-manager', 'grid-badge', 'pagination', 'editable-row-list',
    'column-settings-modal', 'grid-excel-foot', 'grid-limit-notice',
  ]],
  ['팝업·메시지 (`modal`, `message-provider`, `use-api-call`)', ['modal', 'message']],
  ['대시보드 (`@dk-oasis/shared/dashboard`)', ['dashboard']],
  ['위젯 (`@dk-oasis/shared/widget`)', ['widget']],
  ['화면 문맥 — 업무 화면 ↔ 도구 창 위젯 (`@dk-oasis/shared/screen-context`)', ['screen-context']],
  ['위젯 도크·떠 있는 창·탭 분리 창·분리 상태 이어받기 (`@dk-oasis/shared/portal-shell`)', ['widget-dock', 'floating-window', 'portal-page-window', 'use-carry-state']],
  ['떠 있는 창 — 비모달 (`@dk-oasis/shared/floating-panel`)', ['floating-panel']],
  ['MDM 화면 메타 (`@dk-oasis/shared/mdm-meta`)', ['mdm-meta']],
  ['탭·트리·룩업·기타', [
    'tabs', 'closable-tabs', 'tree', 'lookup', 'lookup-multi-modal', 'markdown-editor', 'html-editor',
    'notice-body-view', 'detail-popover', 'grid-resize-box', 'json-view', 'cron-input', 'variable-table', 'card', 'transfer-list', 'matrix-table',
    'charts', 'export-to-excel', 'print-element-as-page', 'icons',
  ]],
];

// 화면 문서에 싣지 않는 shared export 와 이유. coverage 가 이 목록을 "의도적 제외"로 본다. (삽입 순서 유지를 위해 Map)
export const EXCLUDED = new Map([
  ['WIDGET_CSS', 'WidgetStyle 내부용 CSS 문자열'],
  ['getDraggingWidget', 'WidgetPicker·WidgetBoard 끌기 공유용 내부 함수'],
  ['setDraggingWidget', 'WidgetPicker·WidgetBoard 끌기 공유용 내부 함수'],
  ['FLOATING_WINDOW_CSS', 'FloatingWindowStyle 내부용 CSS 문자열'],
  ['FloatingWindowStyle', 'FloatingWindow 가 스스로 넣는 스타일'],
  ['WIDGET_DOCK_CSS', 'WidgetDockStyle 내부용 CSS 문자열'],
  ['WidgetDockStyle', 'WidgetDockLayer·DockToolsMenu 가 스스로 넣는 스타일'],
  ['DataGrid', 'AgDataGrid 의 별칭. 새 코드는 AgDataGrid'],
  ['useRowStateManager', '옛 행 상태 훅(_rowState). 새 화면은 useGridDataManager'],
  ['ResizableFormPanel', 'Part B §4-3 이 새 화면 사용 금지. ContentBody resizable'],
  ['MaxHandle', 'ContentBody·GridPanel 내부용'],
  ['SearchHistoryInput', 'SearchField 내부용(APS 최근검색)'],
  ['isSearchHistoryPage', 'SearchField 내부용'],
  ['clearAllSearchHistory', '포털 셸용'],
  ['clearSearchHistory', '포털 셸용'],
  ['readSearchHistory', 'SearchField 내부용'],
  ['emitSearch', 'PageLayout·SearchArea 내부용'],
  ['subscribeSearchReset', 'SearchArea 내부용(초기화 이벤트 구독, 발행은 PageLayout)'],
  ['RANGE_PRESETS', '조회 기본값 설정 창 내부용(기간 묶음 선택지)'],
  ['RELATIVE_DATE_PRESETS', '조회 기본값 설정 창 내부용(상대 날짜 이름표)'],
  ['isValidIsoDate', '조회 기본값 규칙 계산 내부용(search-area 문서의 사용자 기본값 참고)'],
  ['parseSearchDefaultRule', '조회 기본값 저장소 내부용'],
  ['resolveRelativeDate', '조회 기본값 규칙 계산 내부용'],
  ['resolveSearchDefault', '조회 기본값 규칙 계산 내부용'],
  ['getPageSearchDefaults', '조회 기본값 저장소 내부용(SearchArea·설정 창이 쓴다)'],
  ['getSearchDefaultsSource', '조회 기본값 저장소 내부용'],
  ['getSearchDefaultsStatus', '조회 기본값 저장소 내부용'],
  ['preloadSearchDefaults', '포털 셸·SearchArea 내부용(조회 기본값 미리 받기)'],
  ['resetSearchDefaults', '조회 기본값 저장소 내부용(시험·로그아웃 정리)'],
  ['saveSearchDefaults', '조회 기본값 저장소 내부용(설정 창이 저장한다)'],
  ['setSearchDefaultsLocalForDev', '개발 모드 확인용(조회 기본값 샘플 화면)'],
  ['subscribeSearchDefaults', '조회 기본값 저장소 내부용'],
  ['readSearchLastValues', '조회 기본값 설정 창 내부용(마지막 조회값 읽기)'],
  ['useSearchDefaultsArea', 'SearchArea 내부용(조회 기본값 등록소)'],
  ['subscribeSearch', 'PageLayout·SearchArea 내부용'],
  ['useContentMaximize', 'ContentBody 최대화 내부용'],
  ['canDoButton', '팝업 내부 버튼 권한 판정용(page-layout 문서 참고)'],
  ['useUserButtonRbac', '팝업 내부 버튼 권한 판정용(page-layout 문서 참고)'],
  ['INPUT_BASE', '원시 input 스타일. 화면은 form 래퍼'],
  ['INPUT_READONLY', '원시 input 스타일. 화면은 form 래퍼'],
  ['INPUT_DISABLED', '원시 input 스타일. 화면은 form 래퍼'],
  ['GridHelpButton', 'GridPanel help prop 으로 쓴다'],
  ['GRID_TEMP_ID_FIELD', 'GridPanel·useGridDataManager 내부 필드'],
  ['MessageProvider', '호스트 root layout 이 감싼다'],
  ['MdmGridTooltip', 'AgDataGrid 머리글 툴팁 내부 컴포넌트'],
  ['requestDomains', 'useMdmColumn(s) 내부 요청(mdm-meta 문서 참고)'],
  ['peekColumn', 'mdm-meta store 동기 조회 — 훅 내부용'],
  ['peekDomain', 'mdm-meta store 동기 조회 — 훅 내부용'],
  ['isModuleDisabled', 'mdm-meta store 상태 — 훅 내부용'],
  ['resetMdmMetaStore', '시험용'],
  ['MDM_META_TTL_MS', 'mdm-meta store 상수'],
  ['MDM_META_BATCH_MS', 'mdm-meta store 상수'],
  ['MDM_META_CARD_MAX_CODES', 'MdmMetaCard 상수'],
  ['mdmCaption', 'resolveCaption 내부용'],
  ['resolveMdmPhysName', 'useMdmColumn 내부용(toPhysName + meta)'],
  ['useMdmCaptionPriority', 'AgDataGrid·FormGroup 내부용'],
  ['useMdmMetaScope', 'AgDataGrid·FormGroup 내부용'],
  ['formatMdmDataType', 'MdmMetaCard 내부용'],
]);

// coverage 대상 shared index 파일
export const EXPORT_FILES = [
  'layout/index.ts',
  'components/form/index.ts',
  'components/grid/index.ts',
  'components/tabs/index.ts',
  'components/closable-tabs/index.ts',
  'components/tree/index.ts',
  'components/lookup/index.ts',
  'components/markdown-editor/index.ts',
  'components/notice-body-view/index.ts',
  'components/html-editor/index.ts',
  'components/detail-popover/index.ts',
  'components/grid-resize-box/index.ts',
  'components/json-view/index.ts',
  'components/cron-input/index.ts',
  'components/variable-table/index.ts',
  'components/card/index.ts',
  'components/transfer-list/index.ts',
  'components/dashboard/index.ts',
  'widget/index.ts',
  'widget-dock/index.ts',
  'screen-context/index.ts',
  'mdm-meta/index.ts',
  'components/matrix-table/index.ts',
  'components/charts/index.ts',
  'components/modal.tsx',
  'components/message-provider.tsx',
  'hooks/use-api-call.ts',
];

export const doc_files = () => GROUPS.flatMap(([, names]) => names);

export const read_doc = (name) => readPy(path.join(COMP, `${name}.md`));

export function title_and_summary(name) {
  const lines = splitlinesPy(read_doc(name));
  const t = lines.find((l) => l.startsWith('# '));
  const title = t === undefined ? name : pyStrip(t.slice(2));
  let summary = '';
  let seenTitle = false;
  for (const l of lines) {
    if (l.startsWith('# ')) {
      seenTitle = true;
      continue;
    }
    if (seenTitle && pyStrip(l) !== '') {
      summary = pyStrip(l);
      break;
    }
  }
  return [title, summary];
}

export function build_index() {
  const out = [
    '# DMES 공통 UI 컴포넌트 (MES 화면용)',
    '',
    '> 화면(m-*)은 `@dk-oasis/shared/*` 래퍼만 쓴다. Mantine·ag-grid 를 직접 import 하지 않는다.',
    '> 화면 전체 모양은 먼저 [화면 표준 골격](../screen-patterns.md)에서 유형을 고르고 예제를 복사한다.',
    '> 이 파일은 `node .claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs index --write` 가 생성한다. 직접 고치지 않는다.',
    '',
    '## 시작',
    '',
    '- [화면 표준 골격](../screen-patterns.md): 화면 유형(조회·조회+상세·그리드 편집·마스터-디테일·등록 팝업)을 고르고 고정값과 예제를 확인할 때 쓴다.',
    '- [Mantine 대응표](../mantine-catalog.md): Mantine 컴포넌트가 어떤 shared 래퍼로 감싸져 있는지, 래퍼가 없으면 무엇을 할지 확인할 때 쓴다.',
    '',
  ];
  for (const [group, names] of GROUPS) {
    out.push(`## ${group}`, '');
    for (const n of names) {
      const [title, summary] = title_and_summary(n);
      out.push(`- [${title}](${n}.md): ${summary}`);
    }
    out.push('');
  }
  out.push('## 화면 문서에 싣지 않는 shared export', '');
  for (const [k, v] of EXCLUDED) out.push(`- \`${k}\`: ${v}`);
  out.push('');
  return out.join('\n');
}

export function build_full() {
  const parts = [build_index()];
  for (const n of doc_files()) {
    parts.push(`\n\n<!-- ===== ${n}.md ===== -->\n\n${pyStrip(read_doc(n))}\n`);
  }
  return parts.join('');
}

export function find_doc(query) {
  let q = query.toLowerCase();
  if (q.endsWith('.md')) q = q.slice(0, -3);
  const names = doc_files();
  for (const n of names) {
    if (n === q || n.replaceAll('-', '') === q.replaceAll('-', '')) return n;
  }
  for (const n of names) {
    const [title] = title_and_summary(n);
    if (title.toLowerCase().replaceAll(' ', '').includes(q)) return n;
  }
  for (const n of names) { // export 이름이 본문 import 줄에 있는 문서
    if (hasWordBounded(read_doc(n).split('## 언제 쓰나')[0], query)) return n;
  }
  return null;
}

const EXPORT_BRACE = pyReU(String.raw`export\s*\{([^}]*)\}`);
const EXPORT_DECL = pyReU(String.raw`export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)`);

function* finditer(rx, text) {
  const g = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : `${rx.flags}g`);
  let m;
  while ((m = g.exec(text)) !== null) {
    yield m;
    if (m[0] === '') g.lastIndex++;
  }
}

export function shared_value_exports() {
  const found = new Map();
  const setdefault = (k, v) => { if (!found.has(k)) found.set(k, v); };
  for (const rel of EXPORT_FILES) {
    const p = path.join(SHARED, ...rel.split('/'));
    if (!fileExists(p)) continue;
    const text = readPy(p);
    for (const m of finditer(EXPORT_BRACE, text)) {
      for (let item of m[1].split(',')) {
        item = pyStrip(item);
        if (!item || item.startsWith('type ')) continue;
        const name = pyStrip(item.split(' as ').pop());
        setdefault(name, rel);
      }
    }
    for (const m of finditer(EXPORT_DECL, text)) setdefault(m[1], rel);
  }
  return found;
}

function fileExists(p) {
  try { fs.statSync(p); return true; } catch { return false; }
}

let outBuf = [];
const print = (s = '') => { outBuf.push(`${s}\n`); };
/** 자식 프로세스와 출력 순서가 섞이지 않게 지금까지의 출력을 먼저 내보낸다. */
function flush() {
  const text = outBuf.join('');
  outBuf = [];
  if (text) process.stdout.write(text);
}

export function cmd_coverage() {
  const docExists = (n) => fileExists(path.join(COMP, `${n}.md`));
  const corpus = doc_files().filter(docExists).map(read_doc).join('\n');
  const missingDocs = doc_files().filter((n) => !docExists(n));
  let bad = 0;
  for (const n of missingDocs) {
    print(`문서 없음: components/${n}.md`);
    bad++;
  }
  const exports = [...shared_value_exports()].sort((a, b) => compareCodePoint(a[0], b[0]));
  for (const [name, rel] of exports) {
    if (EXCLUDED.has(name)) continue;
    if (!hasWordBounded(corpus, name)) {
      print(`미등재 export: ${name}  (${rel}) → 문서에 쓰거나 ui_docs.mjs EXCLUDED 에 이유와 함께 넣는다`);
      bad++;
    }
  }
  for (const [fname, builder] of [['llms.txt', build_index], ['llms-full.txt', build_full]]) {
    const p = path.join(COMP, fname);
    if (missingDocs.length === 0 && (!fileExists(p) || readPy(p) !== builder())) {
      print(`생성물 낡음: components/${fname} → ui_docs.mjs ${fname === 'llms.txt' ? 'index' : 'full'} --write`);
      bad++;
    }
  }
  print(bad === 0 ? 'coverage 통과' : `coverage 문제 ${bad}건`);
  return bad === 0 ? OK : VIOLATION;
}

/** 폴더를 통째로 복사한다(shutil.copytree 대응: 심볼릭 링크는 가리키는 내용을 복사, 빈 폴더도 만든다). fs.cpSync 는 쓰지 않는다. */
export function copy_tree(src, dst) {
  fs.mkdirSync(dst);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) isDir = fs.statSync(s).isDirectory();
    if (isDir) copy_tree(s, d);
    else fs.copyFileSync(s, d);
  }
}

export function cmd_check_examples() {
  const host = path.join(FRONT, 'm-mqc');
  // 윈도우의 node_modules/.bin/tsc 는 tsc.cmd 라 직접 실행이 안 된다 → typescript 패키지의 bin 을 node 로 실행한다.
  const tsc = path.join(host, 'node_modules', 'typescript', 'bin', 'tsc');
  if (!fileExists(tsc)) {
    print(`tsc 없음: ${tsc} (pnpm install 필요)`);
    return VIOLATION;
  }
  const work = path.join(host, '.skillcheck');
  const cfg = path.join(host, 'tsconfig.skillcheck.json');
  let rc;
  try {
    if (fileExists(work)) fs.rmSync(work, { recursive: true, force: true });
    copy_tree(EXAMPLES, work);
    fs.writeFileSync(
      cfg,
      '{ "extends": "./tsconfig.json", "compilerOptions": { "incremental": false, "plugins": [] },'
      + ' "include": [".skillcheck/**/*"] }\n',
      'utf8',
    );
    flush();
    const r = spawnSync(process.execPath, [tsc, '--noEmit', '-p', cfg], { cwd: host, stdio: 'inherit' });
    rc = r.status ?? 1;
    print(rc === 0 ? 'tsc 통과' : 'tsc 실패');
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(cfg, { force: true });
  }
  for (const s of ['mantine_docs.mjs', 'aggrid_docs.mjs']) {
    flush();
    const r = spawnSync(process.execPath, [path.join(SCRIPTS, s), 'audit', EXAMPLES], { stdio: 'inherit' });
    rc |= r.status ?? 1;
  }
  return rc;
}

// -h/--help 에 보이는 설명. python 판은 머리말(docstring)을 그대로 보여 줬다(RawDescriptionHelpFormatter) — 사용 예는 node 호출 형태로 옮겼다.
const DESCRIPTION = `DMES 공통 UI 컴포넌트 문서(references/components) 조회·생성·점검 도구.

PrimeReact 의 llms.txt / llms-full.txt 방식을 따른다.
  - components/llms.txt      : 컴포넌트 1개 = 한 줄(링크 + 용도). \`index --write\` 가 생성한다.
  - components/llms-full.txt : 모든 컴포넌트 문서 합본. \`full --write\` 가 생성한다.
  - components/<name>.md     : 컴포넌트별 사용 문서(사람이 쓴다).

  node ui_docs.mjs index                 # 색인 출력 (--write 로 llms.txt 갱신)
  node ui_docs.mjs get <이름>            # 컴포넌트 문서 출력 (파일명·제목·export 이름 모두 가능)
  node ui_docs.mjs full [--write]        # 합본 출력 / llms-full.txt 갱신
  node ui_docs.mjs coverage              # shared export 중 문서·제외 목록 어디에도 없는 것 + 생성물 최신 여부
  node ui_docs.mjs check-examples        # references/examples 를 m-mqc 설정으로 tsc + audit`;
const SPEC = {
  prog: 'ui_docs.mjs',
  description: DESCRIPTION,
  commands: {
    index: { options: { write: { type: 'boolean' } } },
    get: { positionals: [{ name: 'name' }] },
    full: { options: { write: { type: 'boolean' } } },
    coverage: {},
    'check-examples': {},
  },
};

export function main(argv) {
  const cli = parseCli(argv, SPEC);
  if (!cli) return process.exitCode ?? OK;
  const a = { ...cli.values, ...cli.positionals };
  let code = VIOLATION;
  if (cli.command === 'index') {
    const text = build_index();
    if (a.write) {
      fs.writeFileSync(path.join(COMP, 'llms.txt'), text, 'utf8');
      print(`갱신: ${path.join(COMP, 'llms.txt')}`);
    } else print(text);
    code = OK;
  } else if (cli.command === 'get') {
    const n = find_doc(a.name);
    if (!n) {
      print(`문서 없음: ${a.name}. \`ui_docs.mjs index\` 로 목록을 본다.`);
      code = VIOLATION;
    } else {
      print(read_doc(n));
      code = OK;
    }
  } else if (cli.command === 'full') {
    const text = build_full();
    if (a.write) {
      fs.writeFileSync(path.join(COMP, 'llms-full.txt'), text, 'utf8');
      print(`갱신: ${path.join(COMP, 'llms-full.txt')} (${splitlinesPy(text).length}줄)`);
    } else print(text);
    code = OK;
  } else if (cli.command === 'coverage') {
    code = cmd_coverage();
  } else if (cli.command === 'check-examples') {
    code = cmd_check_examples();
  }
  flush();
  return code;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === SCRIPT_FILE) {
  finish(main(process.argv.slice(2)));
}
