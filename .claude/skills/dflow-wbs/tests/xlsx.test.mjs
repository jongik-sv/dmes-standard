// xlsx-read.mjs · xlsx-write.mjs · _zip.mjs 시험 (SKILL.md 의 인라인 python 블록 두 개를 node 로 옮긴 것).
//
//  (a) 쓰기 골든: xlsx-write 가 만든 파일의 각 파트 내용이 python write_xlsx 가 만든 파일의 같은 파트와 글자까지 같은지,
//      python zipfile(testzip)·openpyxl(있으면)로 열리는지. zip 컨테이너 바이트는 비교하지 않는다(파일 시각이 다름).
//  (b) 읽기 골든: xlsx-read 가 python 읽기 블록과 같은 stdout 을 내는지(python 으로 만든 파일, node 로 만든 파일, 시험이 합성한 파일).
//  (c) 왕복(쓰기→읽기)  (d) 경계(특수 문자·유니코드·큰 문서·깨진 zip·사용 오류)  (e) _zip.mjs 단위 시험.
// python 이 있으면(`findPython()`) 같은 입력으로 실제 python 블록을 돌려 비교한다. 없거나 DMES_NO_PYTHON=1 이면 그 시험은 skip 되고,
// 대신 미리 계산한 기대값(golden/expected/xlsx.json, make-expected-xlsx.mjs 로 생성)과 비교하는 시험이 같은 사례를 맡는다.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { findPython, makeTempDir, runNode } from '../../_shared/node/proc.mjs';
import { crc32, readZip, writeZip, ZipError } from '../scripts/_zip.mjs';
import { read_xlsx, read_xlsx_json } from '../scripts/xlsx-read.mjs';
import {
  build_xlsx, build_xlsx_parts, html_escape, parse_rows_json, py_number_str, py_str,
} from '../scripts/xlsx-write.mjs';
import { BAD_ZIP_CASES, READ_CASES, WRITE_CASES, WRITE_ERROR_CASES, buildFixtureZip } from './xlsx-cases.mjs';
import { pyTools } from './xlsx-pyrun.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const READ = path.join(HERE, '..', 'scripts', 'xlsx-read.mjs');
const WRITE = path.join(HERE, '..', 'scripts', 'xlsx-write.mjs');
const EXPECTED = JSON.parse(fs.readFileSync(path.join(HERE, 'golden', 'expected', 'xlsx.json'), 'utf8'));

const py = findPython();
const SKIP_PY = py ? false : 'python 이 없음(또는 DMES_NO_PYTHON=1)';

const tmp = makeTempDir('xlsx-test-');
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const tools = py ? pyTools(py, tmp) : null;
let seq = 0;
const tmpFile = (name) => path.join(tmp, `${++seq}-${name}`);

/** 기대값(문자열 또는 {sha256,length})과 실제 문자열 비교 */
function assertSame(actual, expected, label) {
  if (typeof expected === 'string') {
    assert.equal(actual, expected, label);
  } else {
    assert.equal(actual.length, expected.length, `${label}: 길이`);
    assert.equal(crypto.createHash('sha256').update(actual, 'utf8').digest('hex'), expected.sha256, `${label}: sha256`);
  }
}

function partsOf(buf) {
  const z = readZip(buf);
  return { names: z.names, parts: Object.fromEntries(z.names.map((n) => [n, z.read(n).toString('utf8')])) };
}

/** CLI 로 쓰기: 짝수 번째는 파일 인자, 홀수 번째는 표준입력으로 넘긴다 */
function cliWrite(c, i) {
  const out = tmpFile(`${c.name}.node.xlsx`);
  let r;
  if (i % 2 === 0) {
    const rows = tmpFile(`${c.name}.json`);
    fs.writeFileSync(rows, c.json);
    r = runNode(WRITE, ['--out', out, rows]);
  } else {
    r = runNode(WRITE, ['--out', out], { input: c.json });
  }
  return { out, r };
}

// ------------------------------------------------------------------ (a) 쓰기 골든
describe('xlsx-write 골든', () => {
  WRITE_CASES.forEach((c, i) => {
    it(`${c.name}: 파트 내용·순서가 python write_xlsx 기대값과 같다`, () => {
      const exp = EXPECTED.write[c.name];
      const { out, r } = cliWrite(c, i);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, '');
      const got = partsOf(fs.readFileSync(out));
      assert.deepEqual(got.names, exp.names);
      for (const n of exp.names) assertSame(got.parts[n], exp.parts[n], `${c.name} ${n}`);
      // 프로그램 호출(CLI 를 거치지 않음)도 같은 파트
      const direct = build_xlsx_parts(parse_rows_json(c.json));
      assert.deepEqual(direct.map((p) => p.name), exp.names);
      for (const p of direct) assertSame(p.data, exp.parts[p.name], `${c.name} direct ${p.name}`);
    });

    it(`${c.name}: python 을 실제로 돌려 파트가 글자까지 같고 testzip 이 통과한다`, { skip: SKIP_PY }, () => {
      const rows = tmpFile(`${c.name}.json`);
      fs.writeFileSync(rows, c.json);
      const pyOut = tmpFile(`${c.name}.py.xlsx`);
      const w = tools.write(pyOut, rows);
      assert.equal(w.status, 0, w.stderr);
      const { out, r } = cliWrite(c, i);
      assert.equal(r.status, 0, r.stderr);
      const a = tools.dump(pyOut);
      const b = tools.dump(out);
      assert.equal(b.testzip, null);
      assert.deepEqual(b.names, a.names);
      for (const n of a.names) assert.ok(b.parts[n] === a.parts[n], `${c.name}: ${n} 내용이 다름`);
    });

    it(`${c.name}: node 로 만든 파일을 python 읽기 블록과 node 읽기가 같게 읽는다`, { skip: SKIP_PY }, () => {
      const { out } = cliWrite(c, i);
      const p = tools.read(out);
      const n = runNode(READ, [out]);
      assert.equal(n.status, p.status, n.stderr);
      assert.ok(n.stdout === p.stdout, `${c.name}: stdout 이 다름`);
    });
  });

  it('같은 입력이면 zip 바이트까지 같다(결정적 출력)', () => {
    const rows = parse_rows_json(WRITE_CASES.find((c) => c.name === 'wbs-18-cols').json);
    assert.ok(build_xlsx(rows).equals(build_xlsx(rows)));
  });

  it('openpyxl 이 있으면 node 로 만든 파일이 열린다', { skip: SKIP_PY }, (t) => {
    const c = WRITE_CASES.find((x) => x.name === 'wbs-18-cols');
    const { out } = cliWrite(c, 0);
    const vals = tools.openpyxl(out);
    if (vals === null) return t.skip('openpyxl 미설치');
    assert.equal(vals[0][0], '번호');
    assert.equal(vals[1][11], 21); // 숫자 셀은 숫자로 열린다
    assert.equal(vals[2][17], "R&D <검토> \"따옴표\" 'x'");
  });
});

// ------------------------------------------------------------------ (b) 읽기 골든
describe('xlsx-read 골든', () => {
  for (const c of READ_CASES) {
    const exp = EXPECTED.read[c.name];
    it(`${c.name}: python 읽기 블록 기대값과 같다`, () => {
      const file = tmpFile(`${c.name}.xlsx`);
      fs.writeFileSync(file, buildFixtureZip(c));
      const r = runNode(READ, [file]);
      assert.equal(r.status, exp.status, r.stderr);
      if (c.error) {
        assert.equal(r.stdout, '');
        assert.match(r.stderr, /^xlsx-read: .+\n$/, '짧은 한 줄 stderr');
      } else {
        assert.equal(r.stderr, '');
        assertSame(r.stdout, exp.stdout, c.name);
        assert.ok(r.stdout.endsWith('\n') && !r.stdout.endsWith('\n\n'));
      }
    });

    it(`${c.name}: python 을 실제로 돌려 같은 stdout·종료 코드`, { skip: SKIP_PY }, () => {
      const file = tmpFile(`${c.name}.xlsx`);
      fs.writeFileSync(file, buildFixtureZip(c));
      const p = tools.read(file);
      const n = runNode(READ, [file]);
      assert.equal(n.status, p.status);
      assert.ok(n.stdout === p.stdout, `${c.name}: stdout 이 다름\npython: ${p.stdout.slice(0, 300)}\nnode:   ${n.stdout.slice(0, 300)}`);
    });
  }

  for (const c of BAD_ZIP_CASES) {
    it(`깨진 zip(${c.name}): 종료 코드 1, 짧은 stderr`, () => {
      const file = tmpFile(`${c.name}.xlsx`);
      fs.writeFileSync(file, c.bytes());
      const r = runNode(READ, [file]);
      assert.equal(r.status, EXPECTED.badzip[c.name].status);
      assert.equal(r.stdout, '');
      assert.match(r.stderr, /^xlsx-read: .+\n$/);
    });
    it(`깨진 zip(${c.name}): python 도 종료 코드 1`, { skip: SKIP_PY }, () => {
      const file = tmpFile(`${c.name}.py.xlsx`);
      fs.writeFileSync(file, c.bytes());
      assert.equal(tools.read(file).status, 1);
    });
  }

  it('python 으로 만든 xlsx 를 읽는다(기대값 사례 basic)', { skip: SKIP_PY }, () => {
    const c = WRITE_CASES.find((x) => x.name === 'wbs-18-cols');
    const rows = tmpFile('wbs.json');
    fs.writeFileSync(rows, c.json);
    const f = tmpFile('wbs.py.xlsx');
    assert.equal(tools.write(f, rows).status, 0);
    const p = tools.read(f);
    const n = runNode(READ, [f]);
    assert.equal(n.status, 0);
    assert.ok(n.stdout === p.stdout);
  });

  it('읽기 사례 이름이 기대값 파일과 정확히 같은 집합이다', () => {
    assert.deepEqual(Object.keys(EXPECTED.read).sort(), READ_CASES.map((c) => c.name).sort());
    assert.deepEqual(Object.keys(EXPECTED.write).sort(), WRITE_CASES.map((c) => c.name).sort());
    assert.deepEqual(Object.keys(EXPECTED.badzip).sort(), BAD_ZIP_CASES.map((c) => c.name).sort());
  });
});

// ------------------------------------------------------------------ (c) 왕복
describe('왕복(쓰기 → 읽기)', () => {
  const roundtrip = (rows) => JSON.parse(read_xlsx_json(build_xlsx(rows)));

  it('문자열·정수·실수는 python 표기의 문자열로 돌아온다', () => {
    const rows = parse_rows_json('[["a","b","c"],["x",1,2.5],["y",-3,1e-5],["z",1.0,12345678901234567890123]]');
    assert.deepEqual(roundtrip(rows), [
      { a: 'x', b: '1', c: '2.5' },
      { a: 'y', b: '-3', c: '1e-05' },
      { a: 'z', b: '1.0', c: '12345678901234567890123' },
    ]);
  });

  it('특수 문자·한글·이모지·빈 문자열이 그대로 돌아온다', () => {
    const rows = [
      ['제목 & <b>', 'q"\'', '빈칸'],
      ['Q&A "x" \'y\' <t>', '😀🎉 한글 é', ''],
      ['&amp; 는 글자 그대로', '<![CDATA[x]]>', ' 앞뒤 공백 '],
    ];
    assert.deepEqual(roundtrip(rows), [
      { '제목 & <b>': 'Q&A "x" \'y\' <t>', 'q"\'': '😀🎉 한글 é', 빈칸: '' },
      { '제목 & <b>': '&amp; 는 글자 그대로', 'q"\'': '<![CDATA[x]]>', 빈칸: ' 앞뒤 공백 ' },
    ]);
  });

  it('줄바꿈은 \\n 으로, CR 은 python(expat)처럼 \\n 으로 정규화되어 돌아온다', () => {
    const out = roundtrip([['h'], ['a\nb'], ['c\r\nd'], ['e\rf']]);
    assert.deepEqual(out.map((o) => o.h), ['a\nb', 'c\nd', 'e\nf']);
  });

  it('18열 WBS 표(디스클레이머 행 포함)', () => {
    const rows = JSON.parse(WRITE_CASES.find((c) => c.name === 'wbs-18-cols').json);
    const out = roundtrip(rows);
    assert.equal(out.length, 3);
    assert.equal(Object.keys(out[0]).length, 18);
    assert.equal(out[0]['영업일'], '21');
    assert.equal(out[2]['번호'], rows[3][0]); // 디스클레이머는 마지막 행 A열
    assert.equal(out[2]['레벨'], '');
  });

  it('헤더 행만 있으면 빈 배열', () => {
    assert.deepEqual(roundtrip([['a', 'b']]), []);
  });

  it('데이터 행이 헤더보다 짧으면 모자란 칸은 빈 문자열', () => {
    assert.deepEqual(roundtrip([['a', 'b', 'c'], ['1'], ['1', '2']]), [{ a: '1', b: '', c: '' }, { a: '1', b: '2', c: '' }]);
  });

  it('26열(A~Z) 표', () => {
    const header = Array.from({ length: 26 }, (_, i) => `c${i}`);
    const out = roundtrip([header, header.map((_, i) => i)]);
    assert.equal(Object.keys(out[0]).length, 26);
    assert.equal(out[0].c25, '25');
  });
});

// ------------------------------------------------------------------ (d) 경계
describe('경계와 오류', () => {
  it('수천 행 문서: 5000행 × 18열을 쓰고 읽는다', () => {
    const header = Array.from({ length: 18 }, (_, i) => `h${i}`);
    const rows = [header];
    for (let r = 1; r <= 5000; r++) rows.push(header.map((_, c) => (c % 3 === 0 ? r * 10 + c : `v${r}-${c} & <é>`)));
    const buf = build_xlsx(rows);
    const out = read_xlsx(buf);
    assert.equal(out.length, 5000);
    assert.equal(out[0].get('h0'), '10');
    assert.equal(out[0].get('h1'), 'v1-1 & <é>');
    assert.equal(out[4999].get('h17'), 'v5000-17 & <é>');
    // 공유 문자열은 중복 제거: 헤더 18 + 행마다 고유 12(c%3!=0 인 12열)
    const z = readZip(buf);
    const sst = z.read('xl/sharedStrings.xml').toString('utf8');
    assert.match(sst, new RegExp(`count="${18 + 5000 * 12}" uniqueCount="${18 + 5000 * 12}"`));
  });

  it('python 과 같은 큰 문서: python 이 읽은 5000행과 같다', { skip: SKIP_PY }, () => {
    const header = Array.from({ length: 18 }, (_, i) => `h${i}`);
    const rows = [header];
    for (let r = 1; r <= 5000; r++) rows.push(header.map((_, c) => (c % 3 === 0 ? r * 10 + c : `v${r}-${c} & <é>`)));
    const f = tmpFile('big5000.xlsx');
    fs.writeFileSync(f, build_xlsx(rows));
    const p = tools.read(f);
    const n = runNode(READ, [f]);
    assert.equal(n.status, 0);
    assert.ok(n.stdout === p.stdout);
  });

  for (const c of WRITE_ERROR_CASES) {
    it(`쓰기 오류(${c.name}): 종료 코드 1, 짧은 stderr, 파일을 만들지 않는다`, () => {
      const out = tmpFile(`${c.name}.err.xlsx`);
      const r = runNode(WRITE, ['--out', out], { input: c.json });
      assert.equal(r.status, 1, r.stderr);
      assert.equal(r.stdout, '');
      assert.match(r.stderr, c.stderr);
      assert.ok(r.stderr.trimEnd().split('\n').length <= 2, `stderr 가 길다: ${r.stderr}`);
      assert.equal(fs.existsSync(out), false);
    });
  }

  it('사용 오류: --out 없음 → 종료 코드 2', () => {
    const r = runNode(WRITE, [], { input: '[["a"]]' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--out/);
  });

  it('사용 오류: 읽기 인자 없음 → 종료 코드 2', () => {
    const r = runNode(READ, []);
    assert.equal(r.status, 2);
  });

  it('없는 파일을 읽으면 종료 코드 1', () => {
    const r = runNode(READ, [path.join(tmp, 'nope.xlsx')]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^xlsx-read: /);
  });

  it('입력 JSON 파일이 없으면 종료 코드 1', () => {
    const r = runNode(WRITE, ['--out', tmpFile('x.xlsx'), path.join(tmp, 'nope.json')]);
    assert.equal(r.status, 1);
  });

  it('JSON 입력의 BOM 은 무시한다', () => {
    const f = tmpFile('bom.json');
    fs.writeFileSync(f, '﻿[["a"],["b"]]');
    const out = tmpFile('bom.xlsx');
    const r = runNode(WRITE, ['--out', out, f]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(read_xlsx(fs.readFileSync(out)).map((m) => Object.fromEntries(m)), [{ a: 'b' }]);
  });

  it('출력 폴더가 없으면 만든다', () => {
    const out = path.join(tmp, 'new-dir', 'sub', 'o.xlsx');
    const r = runNode(WRITE, ['--out', out], { input: '[["a"]]' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(out));
  });

  it('출력 경로에 파일이 있으면 덮어쓴다', () => {
    const out = tmpFile('over.xlsx');
    fs.writeFileSync(out, 'old');
    assert.equal(runNode(WRITE, ['--out', out], { input: '[["a"],["1"]]' }).status, 0);
    assert.equal(read_xlsx_json(fs.readFileSync(out)), '[{"a": "1"}]');
  });

  it('읽기 출력은 들여쓰기 없는 한 줄 JSON 이고 한글을 이스케이프하지 않는다', () => {
    const out = read_xlsx_json(build_xlsx([['제목', 'b'], ['한글', '😀'], ['x', 'y']]));
    assert.equal(out, '[{"제목": "한글", "b": "😀"}, {"제목": "x", "b": "y"}]');
  });

  it('빈 시트(행 없음)와 시트 없음은 오류', () => {
    assert.throws(() => read_xlsx(build_xlsx([])), /행이 없습니다/);
    const nosheet = writeZip([{ name: 'xl/workbook.xml', data: '<a/>' }]);
    assert.throws(() => read_xlsx(nosheet), /시트/);
  });
});

// ------------------------------------------------------------------ 단위: 표기 함수
describe('python 표기 함수', () => {
  it('html_escape 는 python html.escape(quote=True) 와 같다', () => {
    const s = `&<>"' &amp; &lt; é 한글 😀 \u0000`;
    assert.equal(html_escape(s), `&amp;&lt;&gt;&quot;&#x27; &amp;amp; &amp;lt; é 한글 😀 \u0000`);
    assert.equal(html_escape(''), '');
    assert.equal(html_escape('plain'), 'plain');
  });

  it('html_escape: python 과 같다', { skip: SKIP_PY }, () => {
    const s = `&<>"' &amp; &lt; é 한글 😀 \\ /`;
    const f = tmpFile('esc.py');
    fs.writeFileSync(f, 'import html,sys,json\nprint(json.dumps(html.escape(json.loads(sys.argv[1])), ensure_ascii=False))\n');
    const out = JSON.parse(spawnPy(py, f, JSON.stringify(s)));
    assert.equal(html_escape(s), out);
  });

  it('py_number_str: int·float 표기', () => {
    const cases = [
      ['0', '0'], ['-0', '0'], ['12', '12'], ['123456789012345678901234567890', '123456789012345678901234567890'],
      ['1.0', '1.0'], ['1e-5', '1e-05'], ['1E5', '100000.0'], ['1e16', '1e+16'], ['1e15', '1000000000000000.0'], ['0.0001', '0.0001'],
      ['0.00001', '1e-05'], ['-0.0', '-0.0'], ['2.5E+3', '2500.0'], ['123456789.123456789', '123456789.12345679'], ['5e-324', '5e-324'],
      ['1e400', 'inf'], ['-1e400', '-inf'], ['NaN', 'nan'], ['Infinity', 'inf'], ['-Infinity', '-inf'], ['1.5e300', '1.5e+300'],
    ];
    for (const [json, want] of cases) assert.equal(py_number_str(parse_rows_json(`[${json}]`)[0]), want, json);
  });

  it('py_str: 숫자가 아닌 값은 python str() 표기', () => {
    assert.equal(py_str(true), 'True');
    assert.equal(py_str(false), 'False');
    assert.equal(py_str(null), 'None');
    assert.equal(py_str(parse_rows_json('[[1,"a",null,true,1.5,{"k":[2.0]}]]')[0]), "[1, 'a', None, True, 1.5, {'k': [2.0]}]");
    assert.equal(py_str(parse_rows_json('[["it\'s"]]')[0]), "[\"it's\"]");
    assert.equal(py_str('문자열'), '문자열');
  });

  it('parse_rows_json: 정수·실수 구분, 객체는 삽입순, 문법 오류', () => {
    const v = parse_rows_json('[[1, 1.0, 1e2, -5, "a\\u00e9\\n", {"b":1,"a":2,"b":3}]]');
    assert.equal(typeof v[0][0], 'bigint');
    assert.equal(py_number_str(v[0][1]), '1.0');
    assert.equal(py_number_str(v[0][2]), '100.0');
    assert.equal(v[0][4], 'aé\n');
    assert.deepEqual([...v[0][5].entries()], [['b', 3n], ['a', 2n]]);
    for (const bad of ['', '[', '[1,]', '[01]', "['a']", '[1 2]', '{"a"}', '[tru]', '[1.]', '[.5]', '[+1]', '["\t"]', '[1] [2]', '[nan]'])
      assert.throws(() => parse_rows_json(bad), /JSON 해석 오류/, bad);
  });
});

// ------------------------------------------------------------------ (e) _zip.mjs
describe('_zip.mjs', () => {
  it('crc32 는 표준 값과 같다', () => {
    assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
    assert.equal(crc32(Buffer.alloc(0)), 0);
    assert.equal(crc32(Buffer.from('a')), 0xe8b7be43);
    for (const s of ['', 'hello', '한글 😀', 'x'.repeat(100000)]) {
      assert.equal(crc32(Buffer.from(s)), zlib.crc32 ? zlib.crc32(Buffer.from(s)) : crc32(Buffer.from(s)));
    }
  });

  it('쓰기 → 읽기 왕복: deflate·stored·빈 파일·비 ASCII 이름', () => {
    const entries = [
      { name: 'a.txt', data: 'hello hello hello hello' },
      { name: 'dir/', data: '' },
      { name: 'dir/한글.txt', data: '한글 😀' },
      { name: 's.bin', data: Buffer.from([0, 1, 2, 255]), store: true },
      { name: 'big.txt', data: 'x'.repeat(300000) },
    ];
    const z = readZip(writeZip(entries));
    assert.deepEqual(z.names, entries.map((e) => e.name));
    assert.equal(z.read('a.txt').toString(), 'hello hello hello hello');
    assert.equal(z.read('dir/').length, 0);
    assert.equal(z.read('dir/한글.txt').toString(), '한글 😀');
    assert.deepEqual([...z.read('s.bin')], [0, 1, 2, 255]);
    assert.equal(z.read('big.txt').length, 300000);
    assert.equal(z.has('nope'), false);
    assert.throws(() => z.read('nope'), ZipError);
  });

  it('같은 입력이면 같은 바이트(파일 시각 고정)', () => {
    const e = [{ name: 'a', data: 'x' }, { name: 'b', data: 'y'.repeat(1000) }];
    assert.ok(writeZip(e).equals(writeZip(e)));
  });

  it('python zipfile 이 만든 파일(deflate·stored·주석 포함)을 읽는다', { skip: SKIP_PY }, () => {
    const f = tmpFile('mk.py');
    const out = tmpFile('py.zip');
    fs.writeFileSync(f, [
      'import zipfile, sys',
      'z = zipfile.ZipFile(sys.argv[1], "w")',
      'z.comment = b"zip comment"',
      'z.writestr("d.txt", "deflated " * 100, zipfile.ZIP_DEFLATED)',
      'z.writestr("s.txt", "stored", zipfile.ZIP_STORED)',
      'z.writestr("한글.txt", "x")',
      'z.close()',
      '',
    ].join('\n'));
    assert.equal(spawnPy(py, f, out), '');
    const z = readZip(fs.readFileSync(out));
    assert.deepEqual(z.names, ['d.txt', 's.txt', '한글.txt']);
    assert.equal(z.read('d.txt').toString(), 'deflated '.repeat(100));
    assert.equal(z.read('s.txt').toString(), 'stored');
  });

  it('node 가 만든 zip 을 python zipfile.testzip 이 통과시킨다', { skip: SKIP_PY }, () => {
    const f = tmpFile('z.zip');
    fs.writeFileSync(f, writeZip([{ name: 'a', data: 'x'.repeat(5000) }, { name: 's', data: 'stored', store: true }, { name: 'dir/한글.txt', data: '한' }]));
    const d = tools.dump(f);
    assert.equal(d.testzip, null);
    assert.deepEqual(d.names, ['a', 's', 'dir/한글.txt']);
  });

  const good = () => writeZip([{ name: 'a.txt', data: 'hello world hello world' }, { name: 'b.txt', data: 'stored', store: true }]);
  const cenStart = (buf) => buf.readUInt32LE(buf.length - 22 + 16);

  it('깨진 입력은 ZipError', () => {
    assert.throws(() => readZip(Buffer.alloc(0)), ZipError);
    assert.throws(() => readZip(Buffer.from('not a zip, just some text here, long enough....')), /끝 레코드/);
    const g = good();
    assert.throws(() => readZip(g.subarray(0, g.length - 5)), ZipError);
    assert.throws(() => readZip(g.subarray(0, 40)), ZipError);
  });

  it('ZIP64 는 명확한 오류', () => {
    const g = good();
    const a = Buffer.from(g);
    a.writeUInt16LE(0xffff, a.length - 22 + 10); // 항목 수
    assert.throws(() => readZip(a), /ZIP64/);
    const b = Buffer.from(g);
    b.writeUInt32LE(0xffffffff, b.length - 22 + 16); // 중앙 디렉터리 위치
    assert.throws(() => readZip(b), /ZIP64/);
    const c = Buffer.from(g);
    c.writeUInt32LE(0xffffffff, cenStart(c) + 20); // 첫 항목 압축 크기
    assert.throws(() => readZip(c), /ZIP64/);
  });

  it('암호화·지원하지 않는 압축 방식은 읽을 때 명확한 오류', () => {
    const g = good();
    const enc = Buffer.from(g);
    enc.writeUInt16LE(enc.readUInt16LE(cenStart(enc) + 8) | 1, cenStart(enc) + 8);
    assert.throws(() => readZip(enc).read('a.txt'), /암호화/);
    const m = Buffer.from(g);
    m.writeUInt16LE(12, cenStart(m) + 10); // bzip2
    assert.throws(() => readZip(m).read('a.txt'), /압축 방식\(12\)/);
  });

  it('CRC·크기 불일치는 오류', () => {
    const g = good();
    const bad = Buffer.from(g);
    bad.writeUInt32LE((bad.readUInt32LE(cenStart(bad) + 16) ^ 1) >>> 0, cenStart(bad) + 16);
    assert.throws(() => readZip(bad).read('a.txt'), /CRC/);
    const sz = Buffer.from(g);
    sz.writeUInt32LE(sz.readUInt32LE(cenStart(sz) + 24) + 1, cenStart(sz) + 24);
    assert.throws(() => readZip(sz).read('a.txt'), /크기/);
  });

  it('같은 이름이 둘이면 마지막 항목을 읽는다(python zipfile 과 같음)', () => {
    const z = readZip(writeZip([{ name: 'a', data: 'first' }, { name: 'a', data: 'second' }]));
    assert.deepEqual(z.names, ['a', 'a']);
    assert.equal(z.read('a').toString(), 'second');
  });
});

// ------------------------------------------------------------------ 보조
/** python 스크립트를 인자 하나와 함께 돌려 stdout 을 돌려준다(오류면 던진다) */
function spawnPy(cmd, script, arg) {
  const r = spawnSync(cmd, [script, arg], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' } });
  if (r.status !== 0) throw new Error(`python 실패: ${r.stderr}`);
  return r.stdout.trimEnd();
}
