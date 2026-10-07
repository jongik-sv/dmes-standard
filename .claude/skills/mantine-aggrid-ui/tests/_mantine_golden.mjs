// mantine_docs 골든 비교용 세계(임시 폴더에 만드는 픽스처)·케이스 표·실행기.
// mantine_docs.test.mjs 와 make-expected-mantine.mjs 가 함께 쓴다. 임시 폴더는 호출자가 만들어 주고 호출자가 지운다.
//
//  - python 판은 tests/golden/legacy/mantine_docs.legacy.py 를 임시 폴더에 원래 이름(mantine_docs.py)으로 복사해 돌린다.
//  - 캐시는 「기록된 입력」(tests/fixtures/mantine-cache)을 실행마다 새 임시 캐시로 복사하고 mtime 을 지금으로 맞춘다
//    (TTL 7일이 안 지나게 → 네트워크 접근 0). 캐시에 없는 페이지를 부르는 케이스는 두지 않는다.
//  - 출력 정규화(의도된 차이): python 출력의 `python3 …X.py` → `node …X.mjs`, `X_docs.py` → `X_docs.mjs`; 실행마다 다른 임시 경로는 <CACHE>·<BASE> 로 바꾼다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPython } from '../../_shared/node/proc.mjs';
import { runCommand, runNode } from './_run.mjs';
import { normSep } from './_norm.mjs';
import { compareCodePoint } from '../../_shared/node/pytext.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(HERE, '..');
export const NODE_SCRIPT = path.join(SKILL_DIR, 'scripts', 'mantine_docs.mjs');
export const LEGACY_PY = path.join(HERE, 'golden', 'legacy', 'mantine_docs.legacy.py');
export const FIXTURE_CACHE = path.join(HERE, 'fixtures', 'mantine-cache');
export const REPO_ROOT = path.resolve(SKILL_DIR, '..', '..', '..');
export const EXPECTED_FILE = path.join(HERE, 'golden', 'expected', 'mantine_docs.json');

// ---------------------------------------------------------------------------
// 파일 도우미
// ---------------------------------------------------------------------------
function put(root, rel, content) {
  const f = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  return f;
}
const crlf = (s) => s.replace(/\n/g, '\r\n');

/** 폴더를 통째로 복사(fs.cpSync 대신 직접 작성). 복사한 파일의 mtime 은 지금이 된다. */
export function copyTreeNow(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyTreeNow(s, d);
    else {
      fs.copyFileSync(s, d);
      const now = new Date();
      fs.utimesSync(d, now, now);
    }
  }
}

// ---------------------------------------------------------------------------
// 합성 캐시: 한글·유니코드 공백·CRLF·이상한 제목 줄이 든 인덱스와 페이지
// ---------------------------------------------------------------------------
const SYN_INDEX = [
  '# Mantine (synthetic)',
  '',
  '## 한글 구역',
  '- [가나다 버튼](https://mantine.dev/llms/core-gana.md): 한글 설명  문장',
  '- [Plain](https://mantine.dev/llms/core-plain.md)',
  '- [NoDesc](https://mantine.dev/llms/hooks-no-desc.md):',
  '- [Weird Colon](https://mantine.dev/llms/x-weird.md): nbsp desc  ',
  '- [NotLlms](https://mantine.dev/docs/other.md): skipped (no /llms/)',
  '   - [Indented](https://mantine.dev/llms/core-indented.md): leading spaces stripped',
  '- [Bad line',
  '- [CRLF Line](https://mantine.dev/llms/core-crlf.md): crlf desc',
  '## Other   Section  ',
  '- [Dup Slug](https://mantine.dev/llms/core-plain.md): second wins nothing',
  '- [İstanbul Title](https://mantine.dev/llms/core-istanbul.md): dotted capital I',
  '- [Tab\tTitle](https://mantine.dev/llms/dates-tab.md): tab in title',
  '- [FF\fSplit](https://mantine.dev/llms/core-ff.md): form feed splits the line',
  '- [Sep Line](https://mantine.dev/llms/core-ls.md): line separator',
  '',
].join('\n');

const SYN_PAGE = [
  '# 가나다',
  'intro 문단',
  '## Props ',
  'props text',
  '### Sub Props',
  'deep',
  '#### Deeper',
  'deepest',
  '## Other',
  'other text',
  '####### seven hashes',
  '#\ttab heading Props',
  '# nbsp heading props',
  '#\u001funit separator heading props',
  '###',
  '## İSTANBUL props',
  'tail',
  '```',
  '# comment in fence props',
  '```',
  '',
].join('\n');

const SYN_FULL = [
  'Foo 한글 bar',
  'foo한글bar',
  '한글foo 한글',
  'FOOBAR foobar Foobar',
  'digits 123 and ٣٤٥ arabic',
  'trailing spaces   ',
  '   ',
  '',
  'tab\tseparated',
  'vertical\u000btab here',
  'form\ffeed here',
  'next\u0085line here',
  'ls ps end Props',
  'crlf line\r',
  'brace x{ and a{,3}b and {5} lit',
  'dollar $ caret ^ and (paren) [bracket] a-b',
  'ÀÉÎ accent ǅ titlecase ß sharp ſ long',
  '<Collapse in={x} />',
  'tail line without newline',
].join('\n');

function buildSynCache(dir) {
  put(dir, 'llms.txt', SYN_INDEX);
  put(dir, 'pages/core-gana.md', SYN_PAGE);
  put(dir, 'pages/core-plain.md', 'plain page\r\n## Props\r\ncrlf body\r\n');
  put(dir, 'pages/core-crlf.md', crlf('# crlf\n## A\nbody\n'));
  put(dir, 'llms-full.txt', SYN_FULL);
}

// ---------------------------------------------------------------------------
// 합성 audit 트리
// ---------------------------------------------------------------------------
const A_TSX = `import { Button } from '@mantine/core';
import { Group } from "@mantine/core";
import { x } from '@emotion/react';
import y from "@emotion/styled";
const a = createStyles(() => ({}));
export function A() {
  const h = useHeadroom(100);
  let h2 =   useHeadroom();
  const { pinned } = useHeadroom();
  return (
    <div sx={{ a: 1 }}>
      <Collapse in={opened} transitionDuration={200}>
      </Collapse>
      <Collapse
        onClick={() => go()}
        in={x}
      />
      <Collapse onClick={() => (<div/>)} in={x}>
      <Text color="red">t</Text>
      <Anchor size="sm" color='blue'>
      <Group spacing="xs" position="apart" noWrap>
      <Group noWrap={true}>
      <Stack spacing="md" />
      <SimpleGrid cols={2} spacing="md" />
      <Grid gutter="md" overflow="hidden">
      <Spoiler initialState={true}/>
      <Button leftIcon={<I />} rightIcon={<J />} />
      <Foo leftIcon={x} />
      <TextInput icon={<I/>} />
      <MediaQuery largerThan="sm" styles={{}}>
      <Popover positionDependencies={[a]} />
      <Tooltip positionDependencies={[a]}>
      TypographyStylesProvider
      zodResolver(schema) yupResolver superstructResolver joiResolver
      UseScrollSpyReturnType StateHistory UseStateHistoryValue
      <Collapse가 in={x}/>
      <TextInput한 icon={a}/>
      <Text한글 color="x"/>
      <Group_x position="a"/>
    </div>
  );
}
`;

const CSS_SCREEN = `.a { color: #fff; background: #12345g; }
.b { border: 1px solid rgba(0,0,0,.5); color: rgb(1,2,3); }
.c { color: #abcdefabc; fill: var(--x, #fff); }
.d { color: #fff-x; color: #fff한글; color: #FFFFFFFF; color: #12; }
.e { color: var(--color-text); margin: 0 /* #abc */; }
`;

const C_TS_CR = 'const a = createStyles(1);\rline2\r<Collapse in={x}/>\rline4 positionDependencies\r';

export function buildWorld(base) {
  const w = { base };
  // 합성 캐시 원본(실행마다 복사)
  w.synCache = path.join(base, 'syn-cache-src');
  buildSynCache(w.synCache);
  w.emptyCache = path.join(base, 'empty-cache-src');
  fs.mkdirSync(w.emptyCache, { recursive: true });

  // version 트리
  const vd = path.join(base, 'ver-direct');
  const pkg = (name, version) => JSON.stringify({ name, version });
  put(vd, 'node_modules/@mantine/core/package.json', pkg('@mantine/core', '9.0.1'));
  put(vd, 'node_modules/@mantine/hooks/package.json', pkg('@mantine/hooks', '9.0.1'));
  put(vd, 'node_modules/@mantine/dates/readme.txt', 'no package.json');
  put(vd, 'node_modules/@mantine/readme.txt', 'file, not a dir');
  put(vd, 'sub/deeper/keep.txt', 'cwd here');
  w.verDirect = vd;
  w.verDirectDeep = path.join(vd, 'sub', 'deeper');

  const vp = path.join(base, 'ver-pnpm');
  put(vp, 'node_modules/.pnpm/@mantine+core@9.0.0_react@19/node_modules/@mantine/core/package.json', pkg('@mantine/core', '9.0.0'));
  put(vp, 'node_modules/.pnpm/@mantine+core@9.0.2_react@19/node_modules/@mantine/core/package.json', pkg('@mantine/core', '9.0.2'));
  put(vp, 'node_modules/.pnpm/@mantine+hooks@9.0.0_x@1/node_modules/@mantine/hooks/package.json', pkg('@mantine/hooks', '9.0.0'));
  put(vp, 'node_modules/.pnpm/@mantine+nope/node_modules/@mantine/nope/package.json', pkg('@mantine/nope', '1.0.0'));
  put(vp, 'node_modules/.pnpm/other@1.0.0/node_modules/@mantine/other/package.json', pkg('@mantine/other', '1.0.0'));
  put(vp, 'node_modules/.pnpm/@mantine+dates@9.0.0_x/node_modules/@mantine/dates/package.json', pkg('@mantine/dates', '9.0.0'));
  put(vp, 'sub/keep.txt', 'x');
  w.verPnpm = vp;
  w.verPnpmSub = path.join(vp, 'sub');

  const vn = path.join(base, 'ver-nested');
  fs.mkdirSync(path.join(vn, 'node_modules'), { recursive: true });
  put(vn, 'src/frontend/node_modules/@mantine/core/package.json', pkg('@mantine/core', '9.1.0'));
  put(vn, 'src/frontend/node_modules/@mantine/core2/package.json', pkg('@mantine/core', '9.1.1'));
  w.verNested = vn;

  const vz = path.join(base, 'ver-none');
  fs.mkdirSync(vz, { recursive: true });
  w.verNone = vz;

  // audit 트리
  const au = path.join(base, 'audit');
  put(au, 'src/m-foo/a.tsx', A_TSX);
  put(au, 'src/m-foo/a-crlf.tsx', crlf(A_TSX));
  put(au, 'src/m-foo/layout.tsx', `import { MantineProvider } from '@mantine/core';\r\n<Collapse in={1}/>\r\n`);
  put(au, 'src/m-foo/page/layout.tsx', `import { A } from '@mantine/core';\n`);
  put(au, 'src/m-foo/style.css', CSS_SCREEN);
  put(au, 'src/m-foo/style-crlf.css', crlf(CSS_SCREEN));
  put(au, 'src/m-foo/node_modules/skip.tsx', `import a from '@mantine/core'; createStyles\n`);
  put(au, 'src/m-foo/dist/skip.ts', `createStyles\n`);
  put(au, 'src/m-foo/.next/skip.ts', `createStyles\n`);
  put(au, 'src/m-foo/build/skip.ts', `createStyles\n`);
  put(au, 'src/m-foo/b/build.ts', `createStyles\n`);
  put(au, 'src/other/b.css', CSS_SCREEN);
  put(au, 'src/other/c.ts', C_TS_CR);
  put(au, 'src/other/bom.tsx', `﻿<Collapse in={x}/>\n<MediaQuery\n`);
  put(au, 'src/other/bad.ts', Buffer.concat([
    Buffer.from('const a = createStyles(1);\n// '),
    Buffer.from([0xff, 0xfe, 0xc3, 0x28, 0xe2, 0x82, 0xe0, 0x80, 0xed, 0xa0, 0x80, 0xf0, 0x9f, 0xf4, 0x90]),
    Buffer.from('\n<Collapse in={x}/>\n한글 \u{1F600} ok\n'),
  ]));
  put(au, 'src/other/types.d.ts', 'positionDependencies\n');
  put(au, 'src/other/j.jsx', '<Group position="a"/>\n');
  put(au, 'src/other/ignored.js', 'createStyles\n');
  put(au, 'src/other/UPPER.TSX', 'createStyles\n');
  put(au, 'src/other/a.tsx.bak', 'createStyles\n');
  put(au, 'src/other/.hidden.ts', 'createStyles\n');
  put(au, 'src/other/.ts', 'createStyles\n');
  put(au, 'src/other/한글/파일.tsx', '<Collapse in={x}/>\n');
  put(au, 'src/other/note.md', '<Collapse in={x}/>\nfrom "@mantine/core"\n');
  put(au, 'src/m-dir/other.ts', `import a from '@mantine/core'\n`);
  put(au, 'src/empty/.keep', '');
  put(au, 'src/clean/ok.tsx', `export const a = 1;\n`);
  w.audit = au;
  w.auditSrc = path.join(au, 'src');

  // 경로 성분에 build 가 든 트리: 절대 경로로 주면 파이썬이 전부 걸러 낸다
  const ab = path.join(base, 'audit-build', 'build');
  put(ab, 'proj/m-x/a.tsx', `import a from '@mantine/core'\n<Collapse in={x}/>\n`);
  put(ab, 'proj/m-x/s.css', `.a{color:#fff}\n`);
  w.auditBuildParent = ab;
  w.auditBuildProj = path.join(ab, 'proj');

  // 경로 성분 m- 이 든 상위(in_screen 이 경로 전체를 본다)
  const am = path.join(base, 'm-outer', 'plain');
  put(am, 'x.tsx', `import a from '@mantine/core'\n`);
  put(am, 'x.css', `.a{color:#fff}\n`);
  w.auditMOuter = am;
  return w;
}

// ---------------------------------------------------------------------------
// 케이스 표
//  cache: 'fixture' | 'syn' | 'empty'(기본 fixture). cwd: world 키(기본 base). args 의 {키} 는 world 경로로 치환된다.
//  statusOnly: 종료 코드만 비교(argparse·Traceback 문구가 다른 경우). audit: 파일 단위 정렬 정규화.
// ---------------------------------------------------------------------------
export const CASES = [
  // version
  { id: 'version-direct', args: ['version'], cwd: 'verDirect' },
  { id: 'version-direct-deep', args: ['version'], cwd: 'verDirectDeep' },
  { id: 'version-pnpm', args: ['version'], cwd: 'verPnpm' },
  { id: 'version-pnpm-sub', args: ['version'], cwd: 'verPnpmSub' },
  { id: 'version-nested-frontend', args: ['version'], cwd: 'verNested' },
  { id: 'version-none', args: ['version'], cwd: 'verNone' },
  // search
  { id: 'search-button', args: ['search', 'button'] },
  { id: 'search-limit', args: ['search', 'collapse', '--limit', '3'] },
  { id: 'search-limit-zero', args: ['search', 'button', '--limit', '0'] },
  { id: 'search-limit-negative', args: ['search', 'button', '--limit=-3'] },
  { id: 'search-limit-negative-space', args: ['search', 'button', '--limit', '-3'] },
  { id: 'search-section', args: ['search', 'button', '--section', 'Core'] },
  { id: 'search-section-lower', args: ['search', 'a', '--section', 'faq', '--limit', '5'] },
  { id: 'search-multi-terms', args: ['search', 'use', 'disclosure'] },
  { id: 'search-uppercase', args: ['search', 'DATEPICKER'] },
  { id: 'search-none', args: ['search', 'zzznotfound'] },
  { id: 'search-all', args: ['search', ''] },
  { id: 'search-syn-korean', args: ['search', '한글'], cache: 'syn' },
  { id: 'search-syn-all', args: ['search', ''], cache: 'syn' },
  { id: 'search-syn-istanbul', args: ['search', 'i̇stanbul'], cache: 'syn' },
  { id: 'search-syn-istanbul2', args: ['search', 'İSTANBUL'], cache: 'syn' },
  { id: 'search-syn-section-spaces', args: ['search', 'dup', '--section', 'other   section'], cache: 'syn' },
  { id: 'search-section-empty', args: ['search', 'button', '--section', ''] },
  { id: 'search-syn-section-ko', args: ['search', '', '--section', '한글 구역'], cache: 'syn' },
  // get
  { id: 'get-button', args: ['get', 'button'] },
  { id: 'get-title', args: ['get', 'Button'] },
  { id: 'get-slug', args: ['get', 'core-button'] },
  { id: 'get-md-suffix', args: ['get', 'collapse.md'] },
  { id: 'get-hooks-prefix', args: ['get', 'use-disclosure'] },
  { id: 'get-title-camel', args: ['get', 'useDisclosure'] },
  { id: 'get-x-prefix', args: ['get', 'carousel'] },
  { id: 'get-dates-prefix', args: ['get', 'date-picker'] },
  { id: 'get-section-props', args: ['get', 'button', '--section', 'Props'] },
  { id: 'get-section-styles', args: ['get', 'button', '--section', 'styles api'] },
  { id: 'get-section-none', args: ['get', 'collapse', '--section', 'zzz-no-such'] },
  { id: 'get-not-found', args: ['get', 'nonexistent-page'], expectErr: true },
  { id: 'get-syn-section', args: ['get', 'core-gana', '--section', 'props'], cache: 'syn' },
  { id: 'get-syn-section-sub', args: ['get', '가나다 버튼', '--section', 'sub props'], cache: 'syn' },
  { id: 'get-syn-section-istanbul', args: ['get', 'gana', '--section', 'İstanbul'], cache: 'syn' },
  { id: 'get-syn-section-seven', args: ['get', 'gana', '--section', 'seven'], cache: 'syn' },
  { id: 'get-syn-section-none', args: ['get', 'gana', '--section', 'nothing here'], cache: 'syn' },
  { id: 'get-syn-section-fence', args: ['get', 'gana', '--section', 'comment'], cache: 'syn' },
  { id: 'get-syn-section-empty', args: ['get', 'gana', '--section', ''], cache: 'syn' },
  { id: 'get-syn-crlf-plain', args: ['get', 'plain'], cache: 'syn' },
  { id: 'get-syn-crlf-section', args: ['get', 'plain', '--section', 'props'], cache: 'syn' },
  { id: 'get-syn-crlf-page', args: ['get', 'crlf'], cache: 'syn' },
  // grep
  { id: 'grep-basic', args: ['grep', 'Collapse', '-C', '0', '--limit', '2'] },
  { id: 'grep-context', args: ['grep', 'expanded', '-C', '1', '--limit', '3'] },
  { id: 'grep-attached-c', args: ['grep', 'expanded', '-C2', '--limit', '2'] },
  { id: 'grep-context-negative', args: ['grep', 'expanded', '-C', '-1', '--limit', '2'] },
  { id: 'grep-limit-negative', args: ['grep', 'expanded', '-C', '0', '--limit', '-2'] },
  { id: 'grep-both-negative', args: ['grep', 'expanded', '-C', '-1', '--limit', '-2'] },
  { id: 'grep-heading', args: ['grep', '^## ', '--limit', '5', '-C', '0'] },
  { id: 'grep-dollar', args: ['grep', 'collapse$', '--limit', '3'] },
  { id: 'grep-alternation', args: ['grep', 'use(disclosure|collapse)', '-C', '1', '--limit', '2'] },
  { id: 'grep-word-boundary', args: ['grep', String.raw`\bsx=\{`, '--limit', '2'] },
  { id: 'grep-named-group', args: ['grep', '(?P<q>[\'"])Collapse(?P=q)', '--limit', '2'] },
  { id: 'grep-inline-flag', args: ['grep', '(?i)INITIALSTATE', '--limit', '2'] },
  { id: 'grep-digits', args: ['grep', String.raw`\d+px`, '--limit', '2', '-C', '0'] },
  { id: 'grep-class-word', args: ['grep', String.raw`[\w-]+Provider`, '--limit', '2', '-C', '0'] },
  { id: 'grep-syn-trailing-ws', args: ['grep', String.raw`\s+$`, '--limit', '4', '-C', '0'], cache: 'syn' },
  { id: 'grep-escape-quote', args: ['grep', String.raw`from [\"']@mantine`, '--limit', '2', '-C', '0'] },
  { id: 'grep-escape-dash', args: ['grep', String.raw`a\-b`, '--limit', '2', '-C', '0'] },
  { id: 'grep-literal-brace', args: ['grep', 'x{', '--limit', '2', '-C', '0'], cache: 'syn' },
  { id: 'grep-brace-quant-lo', args: ['grep', 'a{,3}b', '--limit', '2', '-C', '0'], cache: 'syn' },
  { id: 'grep-none', args: ['grep', 'zzzz-no-such-text'] },
  { id: 'grep-limit-not-reached', args: ['grep', 'useDisclosure', '--limit', '500', '-C', '0'] },
  { id: 'grep-limit-one', args: ['grep', 'the', '--limit', '1', '-C', '1'] },
  { id: 'grep-limit-zero', args: ['grep', 'the', '--limit', '0', '-C', '1'] },
  { id: 'grep-syn-boundary', args: ['grep', String.raw`\bfoo\b`, '-C', '0'], cache: 'syn' },
  { id: 'grep-syn-word-ko', args: ['grep', String.raw`\w+한글`, '-C', '0'], cache: 'syn' },
  { id: 'grep-syn-digits-arabic', args: ['grep', String.raw`\d+ arabic`, '-C', '0'], cache: 'syn' },
  { id: 'grep-syn-ignorecase', args: ['grep', 'foobar', '-C', '0'], cache: 'syn' },
  { id: 'grep-syn-case-unicode', args: ['grep', 'àéî', '-C', '0'], cache: 'syn' },
  { id: 'grep-syn-sharp', args: ['grep', 'ſ|ß', '-C', '0'], cache: 'syn' },
  { id: 'grep-syn-blank', args: ['grep', '^\\s*$', '-C', '0'], cache: 'syn' },
  { id: 'grep-syn-lines', args: ['grep', 'here|end|crlf', '-C', '1'], cache: 'syn' },
  { id: 'grep-syn-dot', args: ['grep', 'tab.separated', '-C', '0'], cache: 'syn' },
  { id: 'grep-syn-dot-split', args: ['grep', 'vertical.tab', '-C', '0'], cache: 'syn' },
  { id: 'grep-syn-lookahead', args: ['grep', '(?<=tab)\\s(?=here)', '-C', '0'], cache: 'syn' },
  { id: 'grep-syn-tab', args: ['grep', 'tab\\tsep', '-C', '0'], cache: 'syn' },
  { id: 'grep-bad-regex', args: ['grep', '('], statusOnly: true },
  // official
  { id: 'official-combobox-default', args: ['official', 'combobox'] },
  { id: 'official-combobox-api', args: ['official', 'combobox', 'api'] },
  { id: 'official-combobox-patterns', args: ['official', 'combobox', 'patterns'] },
  { id: 'official-form', args: ['official', 'form'] },
  { id: 'official-custom', args: ['official', 'custom-components', 'skill'] },
  // 사용 오류(종료 코드 2 만 비교)
  { id: 'usage-no-args', args: [], statusOnly: true },
  { id: 'usage-bad-command', args: ['nope'], statusOnly: true },
  { id: 'usage-get-missing', args: ['get'], statusOnly: true },
  { id: 'usage-search-missing', args: ['search'], statusOnly: true },
  { id: 'usage-grep-missing', args: ['grep'], statusOnly: true },
  { id: 'usage-official-bad-name', args: ['official', 'nope'], statusOnly: true },
  { id: 'usage-official-bad-part', args: ['official', 'form', 'nope'], statusOnly: true },
  { id: 'usage-limit-not-int', args: ['search', 'a', '--limit', 'abc'], statusOnly: true },
  { id: 'usage-unknown-option', args: ['get', 'button', '--nope'], statusOnly: true },
  { id: 'usage-audit-missing', args: ['audit'], statusOnly: true },
  // audit (합성)
  { id: 'audit-src', args: ['audit', '{auditSrc}'], audit: true },
  { id: 'audit-tree-root', args: ['audit', '{audit}'], audit: true },
  { id: 'audit-two-dirs', args: ['audit', '{auditSrc}/m-foo', '{auditSrc}/other'], audit: true },
  { id: 'audit-file-args', args: ['audit', '{auditSrc}/m-foo/a.tsx', '{auditSrc}/other/note.md', '{auditSrc}/m-foo/style.css'], audit: true },
  { id: 'audit-same-file-twice', args: ['audit', '{auditSrc}/other/c.ts', '{auditSrc}/other/c.ts'], audit: true },
  { id: 'audit-missing-path', args: ['audit', '{base}/no-such-dir', '{auditSrc}/clean'], audit: true },
  { id: 'audit-only-missing', args: ['audit', '{base}/no-such-dir'], audit: true },
  { id: 'audit-clean', args: ['audit', '{auditSrc}/clean'], audit: true },
  { id: 'audit-empty-dir', args: ['audit', '{auditSrc}/empty'], audit: true },
  { id: 'audit-relative-dot', args: ['audit', '.'], cwd: 'audit', audit: true },
  { id: 'audit-relative-prefix', args: ['audit', './src//m-foo/'], cwd: 'audit', audit: true },
  { id: 'audit-relative-up', args: ['audit', '../audit/src/clean'], cwd: 'auditSrc', audit: true },
  { id: 'audit-build-in-given-path', args: ['audit', '{auditBuildProj}'], audit: true },
  { id: 'audit-build-relative', args: ['audit', 'proj'], cwd: 'auditBuildParent', audit: true },
  { id: 'audit-build-relative-dot', args: ['audit', '.'], cwd: 'auditBuildParent', audit: true },
  { id: 'audit-m-outer', args: ['audit', '{auditMOuter}'], audit: true },
  { id: 'audit-m-dir-only', args: ['audit', '{auditSrc}/m-dir'], audit: true },
  // refresh
  { id: 'refresh', args: ['refresh'], refresh: true },
  { id: 'refresh-twice', args: ['refresh'], refresh: true, preRefresh: true },
];

// 실제 저장소 소스를 읽어 비교하는 케이스(python 이 있을 때만, 기대값 파일에는 넣지 않는다)
export function realCases() {
  const fe = path.join(REPO_ROOT, 'src', 'frontend');
  return [
    { id: 'real-audit-frontend', args: ['audit', fe], audit: true },
    ...fs.readdirSync(fe).filter((n) => n.startsWith('m-') && fs.statSync(path.join(fe, n)).isDirectory())
      .map((n) => ({ id: `real-audit-${n}`, args: ['audit', path.join(fe, n)], audit: true })),
    { id: 'real-audit-shared', args: ['audit', path.join(fe, 'shared')], audit: true },
    { id: 'real-audit-examples', args: ['audit', path.join(SKILL_DIR, 'references', 'examples')], audit: true },
  ];
}

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------
const PY_ENV = { PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };

/** python 출력에만 적용하는 의도된 차이 정규화 */
export function normPythonText(s) {
  return s.replace(/python3 (\S*?)(\w+)\.py/g, 'node $1$2.mjs').replace(/(\w+_docs)\.py\b/g, '$1.mjs');
}

function sub(text, world, cacheDir) {
  let t = text.replace(/\r\n?/g, '\n');
  const pairs = [];
  if (cacheDir) pairs.push([cacheDir, '<CACHE>']);
  pairs.push([world.base, '<BASE>']);
  for (const [from, to] of pairs) {
    let real = from;
    try { real = fs.realpathSync(from); } catch { real = path.join(fs.realpathSync(path.dirname(from)), path.basename(from)); }
    for (const r of new Set([from, real])) t = t.split(r).join(to);
  }
  return t;
}

/** audit 출력 정규화: 파일 열거 순서가 달라도 비교되게 「경로:줄:」 줄을 파일 경로 기준으로 안정 정렬한다(파일 안 순서는 유지). */
export function normalizeAuditOutput(out) {
  const lines = out.split('\n');
  // 끝: [..., '', '<요약>', ''] 모양
  let end = lines.length;
  while (end > 0 && lines[end - 1] === '') end--;
  const tail = lines.slice(Math.max(0, end - 2));
  const body = lines.slice(0, Math.max(0, end - 2));
  const keyOf = (l) => { const m = /^(.*?):\d+: /.exec(l); return m ? m[1] : l; };
  const sorted = body.map((l, i) => [keyOf(l), i, l]).sort((a, b) => compareCodePoint(a[0], b[0]) || a[1] - b[1]).map((x) => x[2]);
  return [...sorted, ...tail, ''].join('\n');
}

function prepareRun(world, c, tag) {
  const runDir = fs.mkdtempSync(path.join(world.base, `run-${tag}-`));
  const cache = path.join(runDir, 'cache');
  const kind = c.cache ?? 'fixture';
  if (kind === 'fixture') copyTreeNow(FIXTURE_CACHE, cache);
  else if (kind === 'syn') copyTreeNow(world.synCache, cache);
  else fs.mkdirSync(cache, { recursive: true });
  const args = c.args.map((a) => a.replace(/\{(\w+)\}/g, (_, k) => (k === 'base' ? world.base : world[k] ?? `{${k}}`)));
  const cwd = c.cwd ? world[c.cwd] : runDir;
  return { cache, args, cwd, runDir };
}

function finish(world, c, r, cache, isPython) {
  let stdout = r.stdout;
  let stderr = r.stderr;
  if (isPython) { stdout = normPythonText(stdout); stderr = normPythonText(stderr); }
  stdout = normSep(sub(stdout, world, cache)); // 윈도우에서는 `\` → `/` (비교 단계 정규화, _norm.mjs)
  stderr = normSep(sub(stderr, world, cache));
  if (c.audit) stdout = normalizeAuditOutput(stdout);
  const res = { status: r.status, stdout, stderr };
  if (c.refresh) res.cacheExists = fs.existsSync(cache);
  if (c.statusOnly) return { status: res.status };
  if (c.expectErr) return { status: res.status, stdout: res.stdout, stderr: res.stderr };
  return res;
}

/** 닫혀 있는 로컬 포트 — 캐시에 없는 페이지를 부르는 실수가 실제 인터넷으로 나가지 않게 하는 기준 URL(node 판의 시험 전용 통로) */
export const DEAD = 'http://127.0.0.1:9';

function envFor(c, cache) {
  const env = { MANTINE_LLMS_CACHE: cache, MANTINE_LLMS_BASE: DEAD, MANTINE_OFFICIAL_RAW: DEAD };
  if (c.env) Object.assign(env, c.env);
  return env;
}

/** node 판 실행 → {status, stdout, stderr[, cacheExists]} (정규화됨) */
export function runNodeCase(world, c, script = NODE_SCRIPT) {
  const { cache, args, cwd } = prepareRun(world, c, 'n');
  if (c.preRefresh) runNode(script, ['refresh'], { cwd, env: envFor(c, cache) });
  const r = runNode(script, args, { cwd, env: envFor(c, cache), normalizeEol: true });
  return finish(world, c, r, cache, false);
}

/** python 판 실행(임시 폴더에 원래 이름으로 복사). python 이 없으면 null */
export function runPythonCase(world, c) {
  const py = findPython();
  if (!py) return null;
  if (!world.pyScript) {
    const d = fs.mkdtempSync(path.join(world.base, 'legacy-'));
    world.pyScript = path.join(d, 'mantine_docs.py');
    fs.copyFileSync(LEGACY_PY, world.pyScript);
  }
  const { cache, args, cwd } = prepareRun(world, c, 'p');
  if (c.preRefresh) runCommand(py, [world.pyScript, 'refresh'], { cwd, env: { ...PY_ENV, ...envFor(c, cache) } });
  const r = runCommand(py, [world.pyScript, ...args], { cwd, env: { ...PY_ENV, ...envFor(c, cache) }, normalizeEol: true });
  return finish(world, c, r, cache, true);
}
