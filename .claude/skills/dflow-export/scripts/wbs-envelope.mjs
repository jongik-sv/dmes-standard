#!/usr/bin/env node
// wbs-envelope.mjs — export 봉투 JSON 에 필드를 덧붙여 import 요청 본문을 만든다.
//
// SKILL.md 에 인라인 python 으로 들어 있던 두 코드를 한 스크립트로 옮긴 것이다(윈도우에는 python 이 없다).
//   dflow-export 「3. import 본문 조립」:
//     d = json.load(open(IN)); d["project_id"] = "<UUID>"; d["module"] = "<MOD>"
//     json.dump(d, open(OUT, "w"), ensure_ascii=False, indent=2)
//   dflow-wbs-nlevel 「업로드」:
//     d = json.load(open(IN)); d["project_id"] = "<UUID>"
//     json.dump(d, open(OUT, "w"), ensure_ascii=False)          # 들여쓰기 없음, 구분자 ", " ": "
//
// 사용
//   node .claude/skills/dflow-export/scripts/wbs-envelope.mjs --in <봉투.json> --out <import.json> \
//        --set project_id=<UUID> [--set module=<MOD>] [--indent 2]
//   --indent 를 생략하면 python 기본(들여쓰기 없음). --set 은 여러 번 줄 수 있고 값은 항상 문자열이다.
//
// 출력 계약: python `json.load`/`json.dump(ensure_ascii=False)` 와 바이트까지 같다.
//  - 기존 키는 제자리에서 값만 바뀌고 새 키는 뒤에 붙는다(Map 삽입순. 정수형 문자열 키도 재배치되지 않는다).
//  - 정수는 정수로, 소수·지수 표기는 `1.0` 처럼 float 표기로, 2^53 을 넘는 정수는 그대로(BigInt), 비 ASCII 는 그대로 쓴다.
//  - 끝 개행이 없다(python json.dump 는 개행을 붙이지 않는다). 줄끝은 항상 LF, UTF-8, BOM 없음.
//
// 오류(종료 코드 1, 한 줄 stderr — python 판은 traceback 으로 비정상 종료하던 자리다)
//  - 입력 파일이 없거나 읽을 수 없음, 잘못된 UTF-8, BOM, JSON 구문 오류, 최상위가 객체가 아님(python 은 TypeError)
//  - 출력 폴더가 없음(python 처럼 만들지 않는다), 출력 경로가 폴더이거나 쓸 수 없음
//  - 인자 오류는 종료 코드 2(사용 오류).
//
// python 판과 다른 점(영향이 작아 맞추지 않음): 짝 없는 서로게이트(`"\ud800"`)가 있으면 python 은 쓰기 도중
//  UnicodeEncodeError 로 끝나면서 출력 파일을 만들어 두지만, node 는 아무 것도 쓰지 않고 종료 코드 1 로 끝난다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pyJsonDumps } from '../../_shared/node/pyjson.mjs';
import { parseCli, exitUsage, finish } from '../../_shared/node/args.mjs';
import { readPyText, parseFaithful } from './wbs-parse.mjs';
import { PyJSONDecodeError } from './_pyjson_loads.mjs';

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const PROG = 'wbs-envelope';
const USAGE_LINE = `${PROG} --in <봉투.json> --out <import.json> --set KEY=VALUE [--set KEY=VALUE ...] [--indent N]`;

const SPEC = {
  prog: PROG,
  description: 'export 봉투 JSON 에 --set 필드를 덧붙여 import 본문을 쓴다(python json.load/json.dump 와 바이트 동일).',
  options: {
    in: { type: 'string', required: true },
    out: { type: 'string', required: true },
    set: { type: 'string', multiple: true },
    indent: { type: 'int' },
  },
};

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/** 값 없는 키·`=` 없는 인자는 null. 첫 `=` 에서만 나눈다(값에 `=` 가 들어갈 수 있음). */
export function splitSet(arg) {
  const i = arg.indexOf('=');
  if (i <= 0) return null;
  return [arg.slice(0, i), arg.slice(i + 1)];
}

/**
 * 봉투 JSON 텍스트에 키를 덧붙여 python `json.dump(d, ensure_ascii=False[, indent])` 와 같은 문자열을 돌려준다.
 * @param {string} text 봉투 JSON
 * @param {Array<[string,string]>} sets 덧붙일 [키, 문자열 값] (순서대로 적용)
 * @param {number|null} indent null 이면 들여쓰기 없음
 */
export function assemble(text, sets, indent = null) {
  const d = parseFaithful(text);
  if (!(d instanceof Map)) throw new Error('최상위 JSON 이 객체가 아님');
  for (const [k, v] of sets) d.set(k, v);
  const out = pyJsonDumps(d, { indent, ensureAscii: false });
  if (LONE_SURROGATE.test(out)) throw new Error('짝 없는 서로게이트 문자는 UTF-8 로 쓸 수 없음');
  return out;
}

function errText(e, file) {
  if (e instanceof PyJSONDecodeError) return `${file}: JSON 해석 실패: ${e.message}`;
  if (e && typeof e.code === 'string' && /^E[A-Z0-9]+$/.test(e.code)) return `${file}: ${e.code} ${e.syscall ?? ''} ${e.message}`.replace(/\s+/g, ' ');
  return `${file}: ${e && e.message ? e.message : e}`;
}

export function main(args = process.argv.slice(2)) {
  const cli = parseCli(args, SPEC);
  if (!cli) return process.exitCode ?? 0;
  const { in: inFile, out: outFile, set: rawSets, indent } = cli.values;
  const sets = [];
  for (const a of rawSets) {
    const kv = splitSet(a);
    if (!kv) {
      exitUsage(`--set 은 KEY=VALUE 형식이어야 함 (입력 '${a}')`, { usage: USAGE_LINE, prog: PROG });
      return 2;
    }
    sets.push(kv);
  }
  if (indent !== undefined && indent < 0) {
    exitUsage(`--indent: 0 이상이어야 함 (입력 ${indent})`, { usage: USAGE_LINE, prog: PROG });
    return 2;
  }

  let body;
  try {
    body = assemble(readPyText(inFile), sets, indent === undefined ? null : indent);
  } catch (e) {
    process.stderr.write(`ERROR: ${errText(e, inFile)}\n`);
    return finish(1);
  }

  try {
    const dir = path.dirname(path.resolve(outFile));
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      throw new Error('출력 폴더가 없음');
    }
    fs.writeFileSync(outFile, body, 'utf8');
  } catch (e) {
    process.stderr.write(`ERROR: ${errText(e, outFile)}\n`);
    return finish(1);
  }
  return 0;
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(SCRIPT_FILE) === fs.realpathSync(path.resolve(process.argv[1]));
  } catch {
    return false;
  }
}

if (isMain()) {
  const code = main();
  if (code) finish(code);
}
