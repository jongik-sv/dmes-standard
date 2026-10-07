// aggrid_docs.mjs node 단독 시험(python 이 없어도 돈다): python 으로 비교할 수 없는 부분 —
// 네트워크 실패 분기, 환경 변수, 윈도우 경로, 내부 함수의 계약 — 을 확인한다. python 대비 동일성은
// aggrid_docs.golden.test.mjs(실비교)와 aggrid_docs.expected.test.mjs(기대값 파일)가 맡는다.
// 모든 시험은 AGGRID_DOCS_CACHE 를 임시 폴더로 지정하고 서버 주소를 로컬로 고정한다(실제 ~/.cache·인터넷 접근 없음).

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runNode } from '../../_shared/node/proc.mjs';
import { toPosix } from '../../_shared/node/paths.mjs';
import {
  makeSandbox, buildTrees, startServer, populateCache, SCRIPT, DEAD, HERE, FIXTURES,
} from './_aggrid_harness.mjs';

const mod = await import(pathToFileURL(SCRIPT).href);
let sb;
let trees;
let server;

before(async () => {
  sb = makeSandbox('aggrid-unit-');
  trees = buildTrees(sb.tmp);
  server = await startServer();
});
after(async () => {
  if (server) await server.stop();
  if (sb) fs.rmSync(sb.tmp, { recursive: true, force: true });
});

let n = 0;
/** 새 캐시 폴더로 CLI 를 돈다. opts.cache 는 populateCache 명세, opts.site/agdev 로 기준 URL 을 바꾼다. */
function cli(args, opts = {}) {
  const cache = path.join(sb.tmp, `u-cache-${n++}`);
  fs.mkdirSync(cache);
  if (opts.cache) populateCache(cache, opts.cache);
  const env = {
    AGGRID_DOCS_CACHE: cache,
    AGGRID_DOCS_SITE: opts.site ?? DEAD,
    AGGRID_DOCS_AGDEV_RAW: opts.agdev ?? DEAD,
    ...(opts.env ?? {}),
  };
  const r = runNode(SCRIPT, args, { cwd: opts.cwd ?? trees.none, env });
  return { ...r, cache };
}

// ── 네트워크 실패 분기(python 은 문구가 달라 단독 확인) ───────────────────────────────────────────────
test('연결 실패 + 캐시 없음: [error] 한 줄과 종료 코드 1', () => {
  const r = cli(['recommendations']);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^\[error\] http:\/\/127\.0\.0\.1:9\/recommendations\.md 조회 실패: .+\n$/);
});

test('연결 실패 + 오래된 캐시: stderr 에 [warn] 한 줄, 캐시 본문을 쓰고 종료 코드 0', () => {
  const r = cli(['recommendations'], {
    cache: { files: { 'agdev/recommendations.md': '# 오래된 권장사항\n' }, ages: { 'agdev/recommendations.md': 30 } },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '# 오래된 권장사항\n\n');
  assert.match(r.stderr, /^\[warn\] http:\/\/127\.0\.0\.1:9\/recommendations\.md 조회 실패\(.+\) — 오래된 캐시 사용\n$/);
});

test('TTL 안의 캐시는 네트워크 없이 쓴다(경고 없음)', () => {
  const r = cli(['recommendations'], { cache: { files: { 'agdev/recommendations.md': '새 캐시\n' }, ages: { 'agdev/recommendations.md': 6 } } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '새 캐시\n\n');
  assert.equal(r.stderr, '');
});

test('TTL(7일)을 넘긴 캐시는 다시 받고 캐시 파일을 갱신한다', () => {
  const cache = { files: { 'agdev/recommendations.md': '낡은 캐시\n' }, ages: { 'agdev/recommendations.md': 8 } };
  const r = cli(['recommendations'], { cache, site: `${server.base}/site`, agdev: `${server.base}/agdev` });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
  assert.match(r.stdout, /^# AG Grid/);
  assert.equal(fs.readFileSync(path.join(r.cache, 'agdev', 'recommendations.md'), 'utf8') + '\n', r.stdout);
});

test('get: 받은 페이지는 raw.html 과 archive/<버전>/<fw>/<slug>.txt 로 캐시하고 두 번째는 네트워크 없이 읽는다', async () => {
  await server.reset();
  const base = { site: `${server.base}/site`, agdev: `${server.base}/agdev` };
  const first = cli(['get', 'column-definitions', '--version', '33.3.2'], base);
  assert.equal(first.status, 0);
  assert.ok(fs.existsSync(path.join(first.cache, 'raw.html')));
  const txt = path.join(first.cache, 'archive', '33.3.2', 'react', 'column-definitions.txt');
  assert.ok(fs.existsSync(txt));
  assert.ok(first.stdout.endsWith(`${fs.readFileSync(txt, 'utf8')}\n`));
  const log = await server.log();
  assert.equal(log.length, 2); // 페이지 1 + enterprise 표시용 최신 .md 1
  // 같은 캐시로 다시: 페이지는 .txt 캐시, 최신 .md 는 TTL 안이라 서버 요청이 늘지 않는다
  const again = runNode(SCRIPT, ['get', 'column-definitions', '--version', '33.3.2'], {
    cwd: trees.none, env: { AGGRID_DOCS_CACHE: first.cache, AGGRID_DOCS_SITE: DEAD, AGGRID_DOCS_AGDEV_RAW: DEAD },
  });
  assert.equal(again.status, 0);
  assert.equal(again.stdout, first.stdout);
  assert.equal((await server.log()).length, 2);
});

test('서버로 가는 모든 요청에 원본 User-Agent 가 실린다(UA 가 다르면 403)', async () => {
  await server.reset();
  cli(['search', 'column'], { site: `${server.base}/site`, agdev: `${server.base}/agdev` });
  const log = await server.log();
  assert.equal(log.length, 1);
  assert.equal(log[0].ua, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/128 Safari/537.36');
});

test('fetch 의 ExperimentalWarning 이 stderr 에 새지 않는다', () => {
  const r = cli(['search', 'column'], { site: `${server.base}/site`, agdev: `${server.base}/agdev` });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
});

// ── 환경 변수·기본 경로 ─────────────────────────────────────────────────────────────────────────────
test('AGGRID_DOCS_CACHE 가 비어 있으면 설정하지 않은 것으로 본다(홈의 .cache/aggrid-docs)', () => {
  const home = path.join(sb.tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  const code = `import(${JSON.stringify(pathToFileURL(SCRIPT).href)}).then((m) => console.log(m.CACHE))`;
  for (const value of ['', undefined]) {
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    delete env.AGGRID_DOCS_CACHE;
    if (value !== undefined) env.AGGRID_DOCS_CACHE = value;
    const r = runNode('-e', [code], { env });
    assert.equal(r.stdout.trim(), path.join(home, '.cache', 'aggrid-docs'), r.stderr);
  }
});

test('AGGRID_DOCS_CACHE 의 경로는 python Path 처럼 정규화해 출력한다', () => {
  const dir = path.join(sb.tmp, 'norm-cache');
  const r = runNode(SCRIPT, ['refresh'], { env: { AGGRID_DOCS_CACHE: `${dir}//sub/../x/./` } });
  assert.equal(r.stdout, `캐시 삭제: ${dir}/sub/../x\n`);
});

test('refresh: 심볼릭 링크·일반 파일인 캐시 경로는 지우지 않는다(shutil.rmtree 의 오류 무시와 같다)', () => {
  const real = path.join(sb.tmp, 'real-dir');
  fs.mkdirSync(real);
  fs.writeFileSync(path.join(real, 'keep.txt'), 'x');
  const link = path.join(sb.tmp, 'link-cache');
  fs.symlinkSync(real, link, 'junction');
  assert.equal(runNode(SCRIPT, ['refresh'], { env: { AGGRID_DOCS_CACHE: link } }).status, 0);
  assert.ok(fs.existsSync(path.join(real, 'keep.txt')));
  const file = path.join(sb.tmp, 'file-cache');
  fs.writeFileSync(file, 'x');
  assert.equal(runNode(SCRIPT, ['refresh'], { env: { AGGRID_DOCS_CACHE: file } }).status, 0);
  assert.ok(fs.existsSync(file));
  const dir = path.join(sb.tmp, 'dir-cache');
  fs.mkdirSync(path.join(dir, 'a'), { recursive: true });
  runNode(SCRIPT, ['refresh'], { env: { AGGRID_DOCS_CACHE: dir } });
  assert.ok(!fs.existsSync(dir));
});

// ── 사용 오류·도움말 ────────────────────────────────────────────────────────────────────────────────
test('사용 오류는 종료 코드 2, stderr 에 사용법과 오류 줄, stdout 은 비어 있다', () => {
  for (const args of [[], ['nope'], ['search'], ['get'], ['get', 'x', '--framework', 'foo'], ['search', 'a', '--limit', 'x']]) {
    const r = cli(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /^사용: aggrid_docs\.mjs .*\naggrid_docs\.mjs: 오류: /s, args.join(' '));
  }
});

test('-h 는 종료 코드 0, 사용법을 stdout 에 쓴다', () => {
  for (const args of [['-h'], ['search', '-h'], ['get', '--help']]) {
    const r = cli(args);
    assert.equal(r.status, 0, args.join(' '));
    assert.match(r.stdout, /^사용: aggrid_docs\.mjs/);
    assert.equal(r.stderr, '');
  }
});

test('음수 --limit·--after 는 python 처럼 값으로 받는다', () => {
  const r = cli(['types', 'ColDef', '--limit', '-1', '--after', '-1'], { cwd: trees.front });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.startsWith('--- '));
});

test('--limit=값 형식과 옵션을 위치 인자 뒤에 두는 형식도 된다', () => {
  const a = cli(['search', 'column', '--limit=1'], { cache: { files: { 'agdev/documentation-index.md': '- 열 `column-a`\n- 열 `column-b`\n' } } });
  assert.equal(a.stdout, `${'column-a'.padEnd(40)} 열\n`);
  const b = cli(['search', '--limit', '1', 'column'], { cache: { files: { 'agdev/documentation-index.md': '- 열 `column-a`\n- 열 `column-b`\n' } } });
  assert.equal(b.stdout, a.stdout);
});

// ── 윈도우 경로·python pathlib 흉내 ──────────────────────────────────────────────────────────────────
test('path_parts: 윈도우 역슬래시·슬래시 혼용을 성분으로 나눈다', () => {
  assert.deepEqual(mod.path_parts('C:\\work\\src\\frontend\\shared\\src\\x.tsx', true), ['C:', 'work', 'src', 'frontend', 'shared', 'src', 'x.tsx']);
  assert.deepEqual(mod.path_parts('a/b\\c//d/./e', true), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(mod.path_parts('a/b\\c', false), ['a', 'b\\c']);
  assert.deepEqual(mod.path_parts('', true), []);
  assert.deepEqual(mod.path_parts('.', false), []);
});

test('path_norm: python Path(arg) 의 문자열(빈 성분·. 제거, .. 유지, 끝 슬래시 제거)', () => {
  const cases = [['./a//b/', 'a/b'], ['.', '.'], ['', '.'], ['/', '/'], ['../x/./y', '../x/y'], ['a/../b', 'a/../b'], ['/a/b/', '/a/b'], ['src/', 'src']];
  for (const [input, want] of cases) assert.equal(mod.path_norm(input, false), want, input);
  assert.equal(mod.path_norm('src\\frontend\\', true), 'src\\frontend');
  assert.equal(mod.path_norm('C:/a/./b/', true), 'C:\\a\\b');
  assert.equal(mod.path_norm('C:\\', true), 'C:\\');
});

test('path_suffix: python Path.suffix', () => {
  for (const [name, want] of [['a.tsx', '.tsx'], ['a.d.ts', '.ts'], ['.ts', ''], ['a.', ''], ['a', ''], ['.a.b', '.b'], ['..ts', '.ts']]) assert.equal(mod.path_suffix(name), want, name);
});

test('audit-exceptions 매칭: 윈도우 역슬래시 경로도 `/` 로 바꿔 같은 파일로 본다', () => {
  const win = 'C:\\w\\proj\\src\\frontend\\m-mcm\\page-components\\csa\\commObjMng\\page.tsx';
  assert.equal(mod.exception_level_for_posix(toPosix(win), 'P-R1', 'searchCommObjMng'), 'exempt');
  assert.equal(mod.exception_level_for_posix(toPosix(win), 'P-R1', 'searchOther'), null);
  assert.equal(mod.exception_level_for_posix(toPosix(win), 'P-R14', null), null);
  assert.equal(mod.exception_level_for_posix('/x/shared/src/widget/WidgetFrame.tsx', 'P-R14'), 'info');
  assert.equal(mod.exception_level_for_posix('/x/Xshared/src/widget/WidgetFrame.tsx', 'P-R14'), null); // `/` 경계
  assert.equal(mod.exception_level_for_posix('shared/src/widget/WidgetFrame.tsx', 'P-R14'), null); // 앞의 `/` 가 필요하다
});

test('exception_level_for_posix: call 생략·level 생략·path 없음·rule 없음 항목', () => {
  const ex = [
    { rule: 'R', path: 'a/b.tsx', call: 'f', level: 'info' },
    { rule: 'R', path: 'a/b.tsx' },
    { rule: 'R', level: 'exempt' },
    { path: 'a/b.tsx', level: 'exempt' },
  ];
  assert.equal(mod.exception_level_for_posix('/x/a/b.tsx', 'R', 'f', ex), 'info');
  assert.equal(mod.exception_level_for_posix('/x/a/b.tsx', 'R', 'g', ex), 'exempt'); // call 없는 항목이 모든 호출에
  assert.equal(mod.exception_level_for_posix('/x/a/b.tsx', 'R', null, ex), 'exempt');
  assert.equal(mod.exception_level_for_posix('/x/a/b.tsx', 'Q', null, ex), null);
  assert.equal(mod.exception_level_for_posix('/x/other.tsx', 'R', null, ex), null);
});

test('collect_audit_files: 제외 폴더·확장자·표시 경로(상위 성분에 제외 이름이 있으면 전부 제외)', () => {
  const front = trees.front;
  const files = mod.collect_audit_files([path.join(front, 'm-fx')]).map((f) => path.relative(front, f).split(path.sep).join('/'));
  assert.ok(files.includes('m-fx/pages/fixed/page.tsx'));
  assert.ok(files.includes('m-fx/pages/sample.jsx'));
  assert.ok(!files.some((f) => /\/(dist|build|\.next|node_modules)\//.test(f)));
  assert.ok(!files.some((f) => f.endsWith('.md') || f.endsWith('.js')));
  assert.deepEqual(files, [...files].sort()); // 이 트리는 ASCII 라 단순 정렬과 같다(경로 성분별 정렬과도 같음)
  assert.deepEqual(mod.collect_audit_files([path.join(front, 'm-fx', 'build')]), []); // 'build' 성분이 경로에 있어 모두 제외
  assert.deepEqual(mod.collect_audit_files(['no/such/dir']), []);
});

// ── 내부 계약 ───────────────────────────────────────────────────────────────────────────────────────
test('html_unescape: HTML5 표 2231개와 숫자 참조 예외 표를 python 에서 뽑은 JSON 으로 쓴다', () => {
  const j = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'scripts', '_html5_entities.json'), 'utf8'));
  assert.equal(Object.keys(j.html5).length, 2231);
  assert.equal(j.invalidCharrefs['0'], '\ufffd');
  assert.equal(j.invalidCharrefs['128'], '\u20ac');
  assert.ok(j.invalidCodepoints.includes(0x10ffff));
  assert.match(j.generatedWith, /^Python 3\./);
  // 대표값(python 3.9 로 확인한 값)
  const u = mod.html_unescape;
  assert.equal(u('&amp &copy2024 &notit; &notin; &#0; &#x80; &#xD800; &#x110000; &#x1; &#65 &lt'), '& ©2024 ¬it; ∉ \ufffd € \ufffd \ufffd  A <');
  assert.equal(u('no entities'), 'no entities');
  assert.equal(u('&unknown; &x;'), '&unknown; &x;');
});

test('pyre: python 의 \\b·\\w·\\s·$·^·. 의미', () => {
  const { pyre } = mod;
  assert.equal(pyre('\\bfoo\\b').search('x foo한글'), null); // 한글은 단어 문자
  assert.ok(pyre('\\bfoo\\b').search('x foo.'));
  assert.deepEqual([...pyre('\\w+').finditer('a_1 한글 é')].map((m) => m[0]), ['a_1', '한글', 'é']);
  assert.ok(pyre('\\s').search('\x1c')); // python \s 는 \x1c~\x1f·\x85 를 포함
  assert.ok(pyre('\\s').search('\x85'));
  assert.equal(pyre('\\s').search('\ufeff'), null); // JS \s 와 달리 BOM 은 공백이 아니다
  assert.ok(pyre('a$').search('a\n')); // $ 는 끝 \n 앞에서도 일치
  assert.equal(pyre('a$').search('a\nb'), null);
  assert.deepEqual([...pyre('^x', 'm').finditer('x\nx\u2028x')].map((m) => m.index), [0, 2]); // re.M 의 ^ 는 \n 뒤만
  assert.equal(pyre('a.b').search('a\nb'), null);
  assert.ok(pyre('a.b').search('a\rb')); // . 은 \n 만 제외
  assert.ok(pyre('a.b', 's').search('a\nb'));
  assert.ok(pyre('(?i)abc').search('xABCx'));
  assert.ok(pyre('[\'\\"]').search('"'));
  assert.ok(pyre('a\\{2\\}').search('a{2}'));
  assert.ok(pyre('x{').search('x{'));
  assert.ok(pyre('a{,2}b').search('aab'));
  assert.equal(pyre('^a').match('ba'), null);
  assert.equal(pyre('a').match('ba'), null);
  assert.ok(pyre('a').match('ba', 1));
  assert.equal(pyre('a').fullmatch('ab'), null);
  assert.ok(pyre('a|ab').fullmatch('ab'));
  assert.equal(pyre('x').sub('$&', 'axb'), 'a$&b'); // 치환 문자열은 리터럴
  assert.deepEqual(pyre('x(a)?').findall('xa x'), ['a', '']); // 그룹이 하나면 그 그룹(없으면 빈 문자열)
  assert.equal(mod.re_escape('a.b*c(d)[e]{f}|g^h$i\\j-k&l~m#n o'), 'a\\.b\\*c\\(d\\)\\[e\\]\\{f\\}\\|g\\^h\\$i\\\\j\\-k\\&l\\~m\\#n\\ o');
});

test('match_close·mask_comments 의 대표 동작', () => {
  assert.equal(mod.match_close('a(b[c]{d})e', 1), 9);
  assert.equal(mod.match_close('(a', 0), -1);
  assert.equal(mod.match_close('(")")', 0), 4);
  assert.equal(mod.match_close('(`${x)}`)', 0), 8);
  assert.equal(mod.mask_comments("a // c\n'//' /* x\ny */ z"), "a     \n'//'     \n     z");
  assert.equal(mod.mask_comments('/* unclosed\nx'), '           \n ');
  assert.equal(mod.mask_comments("it's // c"), "it's     ");
});

test('픽스처 트리 안내: 시험 폴더 이름(tests)이 성능 점검 제외 규칙에 걸리므로 audit 시험은 임시 복사본에서만 돈다', () => {
  const r = runNode(SCRIPT, ['audit', path.join(FIXTURES, 'audit', 'src', 'frontend', 'm-fx', 'pages', 'auth')], { cwd: trees.front, env: { AGGRID_DOCS_CACHE: path.join(sb.tmp, 'c-x') } });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /\[P-K\]/); // 경로에 `tests` 성분이 있어 P-* 점검이 건너뛰어진다
  const copy = runNode(SCRIPT, ['audit', path.join(trees.front, 'm-fx', 'pages', 'auth')], { cwd: trees.front, env: { AGGRID_DOCS_CACHE: path.join(sb.tmp, 'c-y') } });
  assert.match(copy.stdout, /\[P-K\]/);
});
