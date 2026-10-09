#!/usr/bin/env node
// junit-count.mjs — /dflow-dev 게이트 기준선: JUnit XML 결과를 합산한다. junit-count.sh 의 node 판으로, 옛 .sh 와 같은 인자를 그대로 받는다. 외부 의존성 0, node 18.17 이상.
//
//   node junit-count.mjs [--failed-file <경로>] [--since <epoch 초 | 파일>] [<폴더>…]
//
// 찾는 파일·합산·출력·종료 코드의 정본은 backup/scripts/junit-count.sh 머리 주석이다.
// 각 <폴더> 아래의 build/test-results/*/TEST-*.xml(Gradle) · target/surefire-reports · failsafe-reports(Maven) 을 합산한다.
// node_modules·.git·.gradle·.claude/worktrees 아래는 내려가지 않는다. <폴더> 생략 시 현재 폴더.
// 목록 정렬은 바이트 순(LC_ALL=C sort -u 와 같다). `--help` 는 사용법을 내고 exit 0.
// 합산 규칙·XML 파서·전체 실패는 아래 주석 그대로(python 판과 같다)다.
// stdout: `JUNIT_SUMMARY tests=<N> failures=<F> errors=<E> skipped=<S> files=<K>` 정확히 한 줄.
// stderr: JUNIT_SKIP <파일>(깨진 XML 이거나 루트가 testsuite·testsuites 가 아님), JUNIT_STALE <파일>, JUNIT_SINCE_INVALID <값>(exit 2),
//         JUNIT_ABORT <파일> <사유>(자원 한계·지원 못 하는 인코딩 — 아래 「전체 실패」, exit 1, stdout 없음).
//
// 합산 규칙(python 판과 같다): 루트가 <testsuite> 면 그것 하나, <testsuites> 면 그 직계 <testsuite> 자식들의 tests·failures·errors·
// skipped 속성을 더한다(없거나 숫자가 아니면 0, `int(float(v))` 규칙: 공백·부호·지수·밑줄·소수 허용, 소수는 0 쪽으로 버림, nan 은 0,
// inf 는 python 이 OverflowError 로 죽는 자리라 같은 문구를 stderr 에 내고 exit 1). failure 또는 error 직계 자식이 있는 직계 testcase 의
// `classname.name`(속성 누락은 빈 문자열) 을 코드포인트 순으로 정렬·중복 제거한다. 네임스페이스가 붙은 요소·속성은 이름이 달라 세지 않는다.
//
// XML 파서: 이 파일 안에 직접 구현했다(python 의 pyexpat=expat 2.2.8 과 같은 판정을 목표로 한다). 요소·속성(따옴표 값, 엔티티·문자
// 참조, 공백 정규화)·텍스트·CDATA·주석·처리 명령·XML 선언·DOCTYPE(내부 서브셋의 일반 엔티티와 ATTLIST 기본값)·네임스페이스·인코딩
// (UTF-8·UTF-16·ISO-8859-1·US-ASCII·그 밖의 한 바이트 인코딩)·태그 짝 검사를 처리하고, expat 이 오류로 보는 입력(태그 불일치, 닫히지
// 않은 속성, 중복 속성, 루트 여러 개·없음, 빈 파일, 정의되지 않은 엔티티, 제어 문자, 잘못된 이름 …)은 파싱 오류로 보아 JUNIT_SKIP 이다.
// 이름 문자표는 expat 2.2.8 이 실제로 받아들이는 BMP 문자를 열거해 만들었다(XML 1.0 4판 계열, BMP 밖 문자는 이름에 못 쓴다).
// 시간은 입력 길이에 선형이다(정규식 역추적 없음). 파일은 한 번에 읽어 문자열로 바꾼다.
//
// 전체 실패(JUNIT_ABORT): 어떤 파일을 읽지 못한 까닭이 "그 파일의 내용"이 아니라 "이 도구의 한계"이면 그 파일만 건너뛰지 않는다. 건너뛰면
// 합계가 조용히 줄어 총수 미감소 판정을 잘못 통과시키기 때문이다. 이때 stdout 에는 아무것도 내지 않고(합계 줄도 없다), stderr 에
// `JUNIT_ABORT <파일> <사유>` 한 줄을 쓰고 exit 1 로 끝나며 --failed-file 도 쓰지 않는다. 해당하는 경우는 둘이다.
//  (a) 자원 한계: V8 문자열 한도(약 512MiB 글자, ERR_STRING_TOO_LONG·`Invalid string length`), 파일 크기 한도(2GiB 이상, ERR_FS_FILE_TOO_LARGE),
//      버퍼·메모리 할당 실패(ERR_BUFFER_TOO_LARGE·ENOMEM 등). 에러 코드·RangeError 문구로 가르며, 잘못된 UTF-8 같은 디코딩 실패는 여전히 JUNIT_SKIP 이다.
//  (b) 이 도구가 못 푸는 인코딩 선언: 이름은 올바르지만 node 의 TextDecoder 가 모르는 것(예: MS949·cp949·cp437·cp850), UTF-32·UCS-2 계열.
//      선언이 올바른 이름이 아니면(예: `encoding="a b"`) 깨진 XML 이므로 JUNIT_SKIP 이다.
//  시험용 내부 옵션: 환경 변수 JUNIT_MAX_BYTES=<양의 정수> 가 있으면 그 바이트 수보다 큰 XML 을 자원 한계로 본다(수백 MB 파일을 실제로 만들지 않고
//  전체 실패 경로를 시험하려는 용도 — tests/junit-count.sh. 일반 사용에서는 설정하지 않는다).
//
// python 판과 달라진 점(의도·알려진 한계). 환경: python 3.9.6, pyexpat expat 2.2.8, node 의 TextDecoder(full-icu) 로 2026-10-07 에 직접 돌려 확인했다.
//  ① 선언 인코딩(8 비트 문서). python 은 선언 이름을 python 코덱으로 찾아 한 바이트씩 변환표를 만들고, 여기서는 node 의 TextDecoder(WHATWG 표)를 쓴다.
//     - 알 수 없는 이름(bogus·ucs-2·windows-949 등)·다중 바이트 코덱(euc-kr·cp949·gbk·big5·shift_jis·utf-32): python 은 LookupError·
//       ValueError("multi-byte encodings are not supported") 로 죽는다. 여기서는 TextDecoder 가 WHATWG 라벨로 아는 다중 바이트 인코딩(euc-kr 과 그
//       별칭 korean·ks_c_5601-1987·windows-949, gbk, big5, shift_jis …)은 읽어서 센다. WHATWG 라벨이 아닌 MS949·cp949 와 utf-32·ucs-2·utf16 은 전체 실패다.
//     - python 이 읽는 단일 바이트 코덱 중 node 가 모르는 것(cp437·cp850·cp852 …): python 은 센다. 여기서는 전체 실패다(예전에는 SKIP 이었다 —
//       합계가 조용히 줄어드는 것보다 멈추는 편이 안전해 바꿨다).
//     - 둘 다 아는 단일 바이트 코덱의 글자표 차이: iso-8859-9·iso-8859-11·tis-620 은 0x80~0x9F 를 node 가 windows-1254·874 글자(€ 등)로 읽고
//       python 은 U+0080~U+009F 제어 문자로 읽는다. koi8-u 의 0xAE·0xBE 가 다르다. windows-874·1250·1251·1253~1255·1257·1258 의 정의 안 된
//       바이트(0x81 등)를 node 는 U+0081 같은 제어 문자로 읽고 python 은 파싱 오류(JUNIT_SKIP)로 본다. iso-8859-3 처럼 둘 다 정의하지 않은 바이트는 둘 다
//       SKIP 이다. 글자 차이는 --failed-file 의 이름에만 보이고 합계에는 영향이 없다.
//  ② 내부 서브셋의 매개변수 엔티티(%name;)는 참조만 받아들이고(expat 처럼 그 뒤 선언은 기록하지 않는다) 대체 텍스트를 끼워 읽지는 않는다.
//  ③ --since 가 `②`·`¹` 처럼 isdigit 이지만 float 로 못 바꾸는 문자뿐이면 python 은 죽지만 여기서는 파일 이름으로 본다(JUNIT_SINCE_INVALID).
//  ④ UTF-8 로 깨진 바이트가 요소·속성 이름 한가운데에 있으면 expat 은 일부를 그냥 받아들이지만 여기서는 깨진 XML 로 본다.
//  ⑤ 속성이 inf 라 python 이 죽는 자리: python 은 traceback, 여기서는 `OverflowError: …` 한 줄(둘 다 exit 1, stdout 없음).
//  ⑥ --failed-file 은 줄끝 LF 로 쓴다(윈도우 python 은 CRLF 로 썼다).
//  ⑦ XML 선언이 standalone="yes" 이고 외부 DTD(SYSTEM)나 내부 서브셋의 %참조가 있을 때 정의되지 않은 일반 엔티티(&e;)를 쓰면
//     python(expat)은 undefined entity 로 파싱 오류(JUNIT_SKIP)이고, 여기서는 standalone 을 따지지 않아 그냥 받아들여 센다(속성 안의 &e; 는 빈 문자열).
//     standalone 이 없거나 "no" 이면 둘 다 같다(받아들인다). 즉 DTD 의 외부 참조·매개변수 엔티티는 standalone="yes" 일 때만 node 가 더 너그럽다.
//  ⑧ 자원 한계(위 「전체 실패」(a)): python 은 파일을 조각으로 먹여 파싱하지만 여기는 한 번에 문자열로 바꾸므로 약 512MiB 글자(UTF-16 은 256MiB 부터,
//     TextDecoder 가 멀쩡한 입력도 거부한다) 이상이면 멈춘다.
// 검증: tests/junit-count.sh 의 골든 비교(python 판 그대로)와, 변형 입력 약 80만 건을 python xml.etree 와 대조한 결과다. 그 대조에서 나온 차이는 ④ 뿐이었지만
// 대조 범위(요소·속성 구조) 밖인 인코딩 선언·standalone·자원 한계에는 위 ①·⑦·⑧ 처럼 따로 확인한 차이가 있다.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- 출력
// fd 에 전부 쓸 때까지 루프한다(64KB 넘는 파이프도 잘리지 않는다).
const writeFd = (fd, data) => {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  let off = 0;
  while (off < buf.length) {
    let n;
    try { n = fs.writeSync(fd, buf, off); } catch (e) { if (e.code === 'EAGAIN') continue; return; }
    if (n <= 0) return;
    off += n;
  }
};
const out = (s) => writeFd(1, s);
const err = (s) => writeFd(2, s);

class PyExit extends Error {
  constructor(code) { super(`exit ${code}`); this.code = code; }
}
// python 판이 처리하지 않은 예외로 죽던 자리(traceback + exit 1)
class PyCrash extends Error {}
// 합계를 믿을 수 없게 되는 자원 한계·못 푸는 인코딩(머리 주석 「전체 실패」). 파일 하나만 건너뛰지 않고 전체를 exit 1 로 끝낸다.
class AbortError extends Error {}

const RESOURCE_CODES = new Set(['ERR_STRING_TOO_LONG', 'ERR_FS_FILE_TOO_LARGE', 'ERR_BUFFER_TOO_LARGE', 'ERR_MEMORY_ALLOCATION_FAILED', 'ENOMEM']);
const RESOURCE_MESSAGE = /Invalid string length|Cannot create a string longer|Array buffer allocation failed|Invalid typed array length|Cannot allocate memory/i;
const oneLine = (m) => String(m).replace(/\s+/g, ' ').trim();
// 자원 한계 때문에 난 예외면 AbortError 로, 아니면 null(디코딩 실패·스택 초과 같은 RangeError 는 해당 없음).
export function resourceOf(e) {
  if (e instanceof AbortError) return e;
  if (e === null || typeof e !== 'object') return null;
  const byCode = typeof e.code === 'string' && RESOURCE_CODES.has(e.code);
  if (byCode || (e instanceof RangeError && RESOURCE_MESSAGE.test(e.message))) {
    return new AbortError(`resource limit (${byCode ? e.code : e.name}): ${oneLine(e.message)}`);
  }
  return null;
}
// 시험용 내부 옵션(머리 주석): JUNIT_MAX_BYTES 보다 큰 파일은 자원 한계로 본다.
function checkMaxBytes(size) {
  const raw = process.env.JUNIT_MAX_BYTES;
  if (raw === undefined || !/^[1-9][0-9]*$/.test(raw)) return;
  if (size > Number(raw)) throw new AbortError(`resource limit (JUNIT_MAX_BYTES): file is ${size} bytes, limit ${raw}`);
}

// ---------------------------------------------------------------- python float()/int(float()) 흉내
// python float() 가 앞뒤에서 벗기는 공백(ASCII \t\n\v\f\r·space, U+0085, U+00A0, U+1680, U+2000~200A, U+2028, U+2029, U+202F, U+205F, U+3000)
const isPySpace = (c) => (c >= 9 && c <= 13) || c === 0x20 || c === 0x85 || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a)
  || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000;
function pyTrim(v) {
  let a = 0;
  let b = v.length;
  while (a < b && isPySpace(v.charCodeAt(a))) a++;
  while (b > a && isPySpace(v.charCodeAt(b - 1))) b--;
  return v.slice(a, b);
}
const PY_FLOAT = /^[+-]?(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?$/;
const PY_FLOAT_SPECIAL = /^([+-]?)(inf|infinity|nan)$/i;
const NON_ASCII = /[^\x00-\x7f]/;
const ND = /^\p{Nd}$/u;

function ndDigit(ch) {
  let cp = ch.codePointAt(0);
  let k = 0;
  while (cp - k - 1 >= 0 && ND.test(String.fromCodePoint(cp - k - 1))) k++;
  return k % 10;
}

// python float(str) 를 흉내낸다. 못 바꾸면 null(ValueError).
export function py_float(v) {
  let s = pyTrim(v);
  if (NON_ASCII.test(s)) {
    let t = '';
    for (const ch of s) {
      if (ch.charCodeAt(0) < 128) t += ch;
      else if (ND.test(ch)) t += String(ndDigit(ch));
      else return null;
    }
    s = t;
  }
  const sp = PY_FLOAT_SPECIAL.exec(s);
  if (sp) {
    if (sp[2].toLowerCase() === 'nan') return NaN;
    return sp[1] === '-' ? -Infinity : Infinity;
  }
  if (!PY_FLOAT.test(s)) return null;
  return Number(s.replace(/_/g, ''));
}

// as_int(elem, attr): 속성이 없거나 float 로 못 바꾸면(ValueError) 0. 속성 값(없으면 undefined)을 받는다. 합계는 BigInt 로
// 센다(python 정수는 한도가 없다).
export function as_int(v) {
  if (v === undefined) return 0n;
  const f = py_float(v);
  if (f === null) return 0n;
  if (Number.isNaN(f)) return 0n; // int(nan) 은 ValueError → 0
  if (!Number.isFinite(f)) throw new PyCrash('OverflowError: cannot convert float infinity to integer');
  return BigInt(Math.trunc(f));
}

// ---------------------------------------------------------------- XML 이름 문자표
// expat 2.2.8 이 받아들이는 BMP 이름 시작 문자·이름 문자(':' 는 제외, 따로 다룬다). 16진수 범위 목록.
const NAME_START_RANGES =
  '41-5a 5f 61-7a c0-d6 d8-f6 f8-131 134-13e 141-148 14a-17e 180-1c3 1cd-1f0 1f4-1f5 1fa-217 250-2a8 2bb-2c1 386 ' +
  '388-38a 38c 38e-3a1 3a3-3ce 3d0-3d6 3da 3dc 3de 3e0 3e2-3f3 401-40c 40e-44f 451-45c 45e-481 490-4c4 4c7-4c8 ' +
  '4cb-4cc 4d0-4eb 4ee-4f5 4f8-4f9 531-556 559 561-586 5d0-5ea 5f0-5f2 621-63a 641-64a 671-6b7 6ba-6be 6c0-6ce ' +
  '6d0-6d3 6d5 6e5-6e6 905-939 93d 958-961 985-98c 98f-990 993-9a8 9aa-9b0 9b2 9b6-9b9 9dc-9dd 9df-9e1 9f0-9f1 ' +
  'a05-a0a a0f-a10 a13-a28 a2a-a30 a32-a33 a35-a36 a38-a39 a59-a5c a5e a72-a74 a85-a8b a8d a8f-a91 a93-aa8 aaa- ' +
  'ab0 ab2-ab3 ab5-ab9 abd ae0 b05-b0c b0f-b10 b13-b28 b2a-b30 b32-b33 b36-b39 b3d b5c-b5d b5f-b61 b85-b8a ' +
  'b8e-b90 b92-b95 b99-b9a b9c b9e-b9f ba3-ba4 ba8-baa bae-bb5 bb7-bb9 c05-c0c c0e-c10 c12-c28 c2a-c33 c35-c39 ' +
  'c60-c61 c85-c8c c8e-c90 c92-ca8 caa-cb3 cb5-cb9 cde ce0-ce1 d05-d0c d0e-d10 d12-d28 d2a-d39 d60-d61 e01-e2e ' +
  'e30 e32-e33 e40-e45 e81-e82 e84 e87-e88 e8a e8d e94-e97 e99-e9f ea1-ea3 ea5 ea7 eaa-eab ead-eae eb0 eb2-eb3 ' +
  'ebd ec0-ec4 f40-f47 f49-f69 10a0-10c5 10d0-10f6 1100 1102-1103 1105-1107 1109 110b-110c 110e-1112 113c 113e ' +
  '1140 114c 114e 1150 1154-1155 1159 115f-1161 1163 1165 1167 1169 116d-116e 1172-1173 1175 119e 11a8 11ab ' +
  '11ae-11af 11b7-11b8 11ba 11bc-11c2 11eb 11f0 11f9 1e00-1e9b 1ea0-1ef9 1f00-1f15 1f18-1f1d 1f20-1f45 1f48-1f4d ' +
  '1f50-1f57 1f59 1f5b 1f5d 1f5f-1f7d 1f80-1fb4 1fb6-1fbc 1fbe 1fc2-1fc4 1fc6-1fcc 1fd0-1fd3 1fd6-1fdb 1fe0-1fec ' +
  '1ff2-1ff4 1ff6-1ffc 2126 212a-212b 212e 2180-2182 3007 3021-3029 3041-3094 30a1-30fa 3105-312c 4e00-9fa5 ' +
  'ac00-d7a3';
const NAME_CHAR_RANGES =
  '2d-2e 30-39 41-5a 5f 61-7a b7 c0-d6 d8-f6 f8-131 134-13e 141-148 14a-17e 180-1c3 1cd-1f0 1f4-1f5 1fa-217 ' +
  '250-2a8 2bb-2c1 2d0-2d1 300-345 360-361 386-38a 38c 38e-3a1 3a3-3ce 3d0-3d6 3da 3dc 3de 3e0 3e2-3f3 401-40c ' +
  '40e-44f 451-45c 45e-481 483-486 490-4c4 4c7-4c8 4cb-4cc 4d0-4eb 4ee-4f5 4f8-4f9 531-556 559 561-586 591-5a1 ' +
  '5a3-5b9 5bb-5bd 5bf 5c1-5c2 5c4 5d0-5ea 5f0-5f2 621-63a 640-652 660-669 670-6b7 6ba-6be 6c0-6ce 6d0-6d3 ' +
  '6d5-6e8 6ea-6ed 6f0-6f9 901-903 905-939 93c-94d 951-954 958-963 966-96f 981-983 985-98c 98f-990 993-9a8 ' +
  '9aa-9b0 9b2 9b6-9b9 9bc 9be-9c4 9c7-9c8 9cb-9cd 9d7 9dc-9dd 9df-9e3 9e6-9f1 a02 a05-a0a a0f-a10 a13-a28 ' +
  'a2a-a30 a32-a33 a35-a36 a38-a39 a3c a3e-a42 a47-a48 a4b-a4d a59-a5c a5e a66-a74 a81-a83 a85-a8b a8d a8f-a91 ' +
  'a93-aa8 aaa-ab0 ab2-ab3 ab5-ab9 abc-ac5 ac7-ac9 acb-acd ae0 ae6-aef b01-b03 b05-b0c b0f-b10 b13-b28 b2a-b30 ' +
  'b32-b33 b36-b39 b3c-b43 b47-b48 b4b-b4d b56-b57 b5c-b5d b5f-b61 b66-b6f b82-b83 b85-b8a b8e-b90 b92-b95 ' +
  'b99-b9a b9c b9e-b9f ba3-ba4 ba8-baa bae-bb5 bb7-bb9 bbe-bc2 bc6-bc8 bca-bcd bd7 be7-bef c01-c03 c05-c0c ' +
  'c0e-c10 c12-c28 c2a-c33 c35-c39 c3e-c44 c46-c48 c4a-c4d c55-c56 c60-c61 c66-c6f c82-c83 c85-c8c c8e-c90 ' +
  'c92-ca8 caa-cb3 cb5-cb9 cbe-cc4 cc6-cc8 cca-ccd cd5-cd6 cde ce0-ce1 ce6-cef d02-d03 d05-d0c d0e-d10 d12-d28 ' +
  'd2a-d39 d3e-d43 d46-d48 d4a-d4d d57 d60-d61 d66-d6f e01-e2e e30-e3a e40-e4e e50-e59 e81-e82 e84 e87-e88 e8a ' +
  'e8d e94-e97 e99-e9f ea1-ea3 ea5 ea7 eaa-eab ead-eae eb0-eb9 ebb-ebd ec0-ec4 ec6 ec8-ecd ed0-ed9 f18-f19 ' +
  'f20-f29 f35 f37 f39 f3e-f47 f49-f69 f71-f84 f86-f8b f90-f95 f97 f99-fad fb1-fb7 fb9 10a0-10c5 10d0-10f6 1100 ' +
  '1102-1103 1105-1107 1109 110b-110c 110e-1112 113c 113e 1140 114c 114e 1150 1154-1155 1159 115f-1161 1163 1165 ' +
  '1167 1169 116d-116e 1172-1173 1175 119e 11a8 11ab 11ae-11af 11b7-11b8 11ba 11bc-11c2 11eb 11f0 11f9 1e00-1e9b ' +
  '1ea0-1ef9 1f00-1f15 1f18-1f1d 1f20-1f45 1f48-1f4d 1f50-1f57 1f59 1f5b 1f5d 1f5f-1f7d 1f80-1fb4 1fb6-1fbc 1fbe ' +
  '1fc2-1fc4 1fc6-1fcc 1fd0-1fd3 1fd6-1fdb 1fe0-1fec 1ff2-1ff4 1ff6-1ffc 20d0-20dc 20e1 2126 212a-212b 212e ' +
  '2180-2182 3005 3007 3021-302f 3031-3035 3041-3094 3099-309a 309d-309e 30a1-30fa 30fc-30fe 3105-312c 4e00-9fa5 ' +
  'ac00-d7a3';

function buildTable(spec) {
  const t = new Uint8Array(0x10000);
  for (const item of spec.split(' ')) {
    const [a, b] = item.split('-');
    const lo = parseInt(a, 16);
    const hi = b === undefined ? lo : parseInt(b, 16);
    for (let c = lo; c <= hi; c++) t[c] = 1;
  }
  return t;
}
let START_T = null;
let CHAR_T = null;
function tables() {
  if (!START_T) { START_T = buildTable(NAME_START_RANGES); CHAR_T = buildTable(NAME_CHAR_RANGES); }
}

// ---------------------------------------------------------------- XML 파서
class XmlError extends Error {}
const bad = (msg) => { throw new XmlError(msg); };

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const PREDEF = new Map([['lt', '<'], ['gt', '>'], ['amp', '&'], ['quot', '"'], ['apos', "'"]]);
const BAD_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;
const ENC_NAME = /^[A-Za-z][A-Za-z0-9._-]*$/;
const MAX_EXPANSION = 1 << 26; // 엔티티 펼침 총 글자 수 상한(폭탄 방지)

const isWs = (c) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;

function validCharRef(cp) {
  return cp === 0x9 || cp === 0xa || cp === 0xd || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);
}

// s[i] 에서 시작하는 이름의 끝 위치. 이름이 아니면 -1. (':' 는 이름 문자로 받는다 — 접두어 규칙은 호출 쪽)
function scanName(s, i) {
  const n = s.length;
  if (i >= n) return -1;
  if (!START_T[s.charCodeAt(i)]) return -1;
  let j = i + 1;
  while (j < n) {
    const c = s.charCodeAt(j);
    if (CHAR_T[c] || c === 0x3a) j++; else break;
  }
  return j;
}

// 요소·속성 이름을 (접두어, 지역명) 으로 나눈다. expat 네임스페이스 모드 규칙: ':' 는 한 번만, 양쪽 모두 비어 있지 않아야 한다.
function splitQName(q) {
  const k = q.indexOf(':');
  if (k === -1) return [null, q];
  if (k === 0 || k === q.length - 1 || q.indexOf(':', k + 1) !== -1) bad('invalid qname');
  if (!START_T[q.charCodeAt(k + 1)]) bad('invalid local name');
  return [q.slice(0, k), q.slice(k + 1)];
}

const UTF8_ALIASES = new Set(['utf_8', 'utf', 'utf8', 'u8', 'utf8_ucs2', 'utf8_ucs4', 'cp65001']);
const ASCII_ALIASES = new Set(['ascii', 'us_ascii', '646', 'ansi_x3.4_1968', 'ansi_x3_4_1968', 'ansi_x3.4_1986', 'cp367', 'csascii', 'ibm367', 'iso646_us', 'iso_646.irv_1991', 'iso_ir_6', 'us']);
const LATIN1_ALIASES = new Set(['latin_1', 'latin1', 'iso_8859_1', 'iso8859_1', '8859', 'cp819', 'latin', 'l1', 'iso_ir_100', 'ibm819', 'iso_8859_1_1987', '819']);

// node 의 TextDecoder 는 입력이 아주 크면 멀쩡한 데이터도 "잘못된 데이터"(ERR_ENCODING_INVALID_ENCODED_DATA)로 거부한다 — 실측: UTF-16 은 256MiB 부터,
// euc-kr 같은 다중 바이트 인코딩은 글자 수가 문자열 한도를 넘을 때. 이 크기부터는 그 거부가 진짜 잘못된 바이트인지 한도인지 가를 수 없다.
const AMBIGUOUS_DECODE_BYTES = 1 << 28;

// 디코더가 던진 예외를 가른다: 자원 한계면 AbortError(전체 실패), 그 밖(잘못된 바이트)이면 XmlError(JUNIT_SKIP).
export function decodeFail(e, msg, len) {
  const r = resourceOf(e);
  if (r) throw r;
  if (e && e.code === 'ERR_ENCODING_INVALID_ENCODED_DATA' && len >= AMBIGUOUS_DECODE_BYTES) {
    throw new AbortError(`resource limit (decoder): ${len} bytes rejected as invalid, cannot tell bad data from the size limit`);
  }
  bad(msg);
}

// 입력 바이트 → 문자열. 바이트가 선언과 안 맞으면 XmlError, 자원 한계·못 푸는 인코딩이면 AbortError.
function decodeBytes(buf) {
  const len = buf.length;
  let enc = null; // 'utf-8' | 'utf-16le' | 'utf-16be' | 'single:<label>'
  let skip = 0;
  if (len >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) { enc = 'utf-8'; skip = 3; }
  else if (len >= 2 && buf[0] === 0xff && buf[1] === 0xfe) { enc = 'utf-16le'; skip = 2; }
  else if (len >= 2 && buf[0] === 0xfe && buf[1] === 0xff) { enc = 'utf-16be'; skip = 2; }
  else if (len >= 2 && buf[0] !== 0x00 && buf[1] === 0x00) enc = 'utf-16le'; // BOM 없는 UTF-16: expat 이 두 번째 바이트가 0 이면 LE
  else if (len >= 2 && buf[0] === 0x00 && buf[1] !== 0x00) enc = 'utf-16be';
  if (enc === 'utf-16le' || enc === 'utf-16be') {
    if ((len - skip) % 2 !== 0) bad('odd utf-16');
    let b = Buffer.from(buf.subarray(skip));
    if (enc === 'utf-16be') b = b.swap16();
    let text;
    try { text = new TextDecoder('utf-16le', { fatal: true, ignoreBOM: true }).decode(b); } catch (e) { decodeFail(e, 'bad utf-16', len); }
    return { text, utf16: true };
  }
  // 8 비트: 선언의 encoding 을 엿본다
  const head = buf.subarray(skip, Math.min(len, skip + 2048)).toString('latin1');
  let label = null;
  if (/^<\?xml[ \t\r\n]/.test(head)) {
    const e = head.indexOf('?>');
    const decl = e === -1 ? head : head.slice(0, e);
    const m = /[ \t\r\n]encoding[ \t\r\n]*=[ \t\r\n]*(?:"([^"]*)"|'([^']*)')/.exec(decl);
    if (m) label = (m[1] !== undefined ? m[1] : m[2]);
  }
  const lower = label === null ? 'utf-8' : label.toLowerCase();
  const body = skip ? buf.subarray(skip) : buf;
  const asciiOnly = () => { for (let k = 0; k < body.length; k++) if (body[k] > 127) bad('non-ascii byte'); return { text: body.toString('latin1'), utf16: false }; };
  // expat 이 이름으로 직접 아는 인코딩(대소문자 무시)
  if (lower === 'utf-8') {
    try { return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body), utf16: false }; } catch (e) { decodeFail(e, 'bad utf-8', len); }
  }
  if (lower === 'us-ascii') return asciiOnly();
  if (lower === 'iso-8859-1') return { text: body.toString('latin1'), utf16: false };
  if (lower === 'utf-16' || lower === 'utf-16le' || lower === 'utf-16be') bad('encoding mismatch');
  // 나머지는 pyexpat 이 python 코덱 이름으로 찾아 한 바이트씩 변환표를 만든다(alias 는 정규화한 이름으로 맞춘다)
  const norm = lower.replace(/[^a-z0-9.]+/g, '_').replace(/^_+|_+$/g, '');
  const norm2 = norm.replace(/\./g, '_'); // python 은 '.' 을 '_' 로 바꿔 한 번 더 찾는다
  const inSet = (set) => set.has(norm) || set.has(norm2);
  if (inSet(UTF8_ALIASES)) return asciiOnly(); // 한 바이트씩 디코드하면 0x80 이상은 모두 못 쓰는 바이트
  if (inSet(ASCII_ALIASES)) return asciiOnly();
  if (inSet(LATIN1_ALIASES)) return { text: body.toString('latin1'), utf16: false };
  if (norm === 'cp1252' || norm === 'windows_1252') {
    for (let k = 0; k < body.length; k++) { const c = body[k]; if (c === 0x81 || c === 0x8d || c === 0x8f || c === 0x90 || c === 0x9d) bad('undefined cp1252'); }
    return { text: new TextDecoder('windows-1252').decode(body), utf16: false };
  }
  // 여기부터는 선언이 올바른 이름인데 이 도구가 못 푸는 인코딩이면 건너뛰지 않고 전체 실패로 본다(머리 주석 (b)).
  if (!ENC_NAME.test(lower)) bad('bad encoding name');
  if (/^(utf_?16|utf_?32|ucs_?[24]|u16|u32)/.test(norm)) throw new AbortError(`unsupported encoding "${label}"`);
  let decoder;
  try { decoder = new TextDecoder(lower, { fatal: true }); } catch { throw new AbortError(`unsupported encoding "${label}"`); }
  try { return { text: decoder.decode(body), utf16: false }; } catch (e) { decodeFail(e, 'bad bytes for declared encoding', len); }
  return null;
}

// 속성 값 처리: 엔티티·문자 참조를 펼치고 직접 적힌 공백(\t \n \r)을 공백으로 바꾼다(문자 참조로 적은 것은 그대로).
function expandAttr(ctx, s, active) {
  let o = '';
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 0x26) { // &
      const semi = s.indexOf(';', i + 1);
      if (semi === -1) bad('unterminated reference');
      const body = s.slice(i + 1, semi);
      o += refValueAttr(ctx, body, active);
      i = semi + 1;
    } else if (c === 0x3c) bad('< in attribute');
    else if (c === 0x09 || c === 0x0a || c === 0x0d) { o += ' '; i++; }
    else {
      // 다음 특수 문자까지 한 번에
      let j = i + 1;
      while (j < n) { const d = s.charCodeAt(j); if (d === 0x26 || d === 0x3c || d === 0x09 || d === 0x0a || d === 0x0d) break; j++; }
      o += s.slice(i, j);
      i = j;
    }
  }
  return o;
}

function charRefValue(body) {
  // body: '#123' 또는 '#x1F'
  let cp;
  if (body.charCodeAt(1) === 0x78) { // x
    const h = body.slice(2);
    if (!/^[0-9a-fA-F]+$/.test(h)) bad('bad charref');
    if (h.length > 8) bad('bad charref');
    cp = parseInt(h, 16);
  } else {
    const d = body.slice(1);
    if (!/^[0-9]+$/.test(d)) bad('bad charref');
    if (d.length > 8) bad('bad charref');
    cp = parseInt(d, 10);
  }
  if (!validCharRef(cp)) bad('invalid char ref');
  return String.fromCodePoint(cp);
}

function checkEntityName(name) {
  const e = scanName(name, 0);
  if (e !== name.length || name.indexOf(':') !== -1) bad('bad entity name');
}

function refValueAttr(ctx, body, active) {
  if (body.charCodeAt(0) === 0x23) return charRefValue(body);
  checkEntityName(body);
  const p = PREDEF.get(body);
  if (p !== undefined) return p;
  const ent = ctx.entities.get(body);
  if (ent === undefined && ctx.lenient) return '';
  if (ent === undefined || ent.external) bad('undefined entity');
  if (active.has(body)) bad('recursive entity');
  ctx.expanded += ent.value.length;
  if (ctx.expanded > MAX_EXPANSION) bad('entity expansion too large');
  active.add(body);
  const r = expandAttr(ctx, ent.value, active);
  active.delete(body);
  return r;
}

// 토큰화 유형(CDATA 가 아닌 것)의 정규화: 앞뒤 공백 제거, 연속 공백은 하나로.
function collapseSpaces(v) {
  let a = 0;
  let b = v.length;
  while (a < b && v.charCodeAt(a) === 0x20) a++;
  while (b > a && v.charCodeAt(b - 1) === 0x20) b--;
  v = v.slice(a, b);
  return v.indexOf('  ') === -1 ? v : v.replace(/ {2,}/g, ' ');
}

// 문서 전체를 읽는다. h 는 {start(depth, uri, local, attrs), end(depth)}.
function parseDocument(text, utf16, h) {
  let s = text;
  let n = s.length;
  // lenient: 외부 DTD 가 있거나 내부 서브셋에 %참조가 있어 정의되지 않은 엔티티를 속성에서 빈 문자열로 봐 주는 상태. stopDecl: %참조 뒤 선언은 기록하지 않는다.
  const ctx = { entities: new Map(), attlist: new Map(), attTypes: new Map(), expanded: 0, lenient: false, stopDecl: false };
  const rawNames = [];
  const nsSaves = [];
  const nsMap = new Map(); // 접두어('' 는 기본) → uri
  let rootSeen = false;

  // ---- 공통 조각
  const skipWs = (i) => { while (i < n && isWs(s.charCodeAt(i))) i++; return i; };

  function parseComment(i) { // s.startsWith('<!--', i)
    const a = i + 4;
    const k = s.indexOf('--', a);
    if (k === -1) bad('unclosed comment');
    if (s.charCodeAt(k + 2) !== 0x3e) bad('-- in comment');
    return k + 3;
  }

  function parsePI(i, atStart) { // s.startsWith('<?', i)
    const e = scanName(s, i + 2);
    if (e === -1) bad('bad PI target');
    const target = s.slice(i + 2, e);
    if (target.toLowerCase() === 'xml') {
      if (!(atStart && target === 'xml')) bad('xml decl not at start');
      return parseXmlDecl(i, e);
    }
    if (target.indexOf(':') !== -1) bad('colon in PI target');
    let j = e;
    if (s.startsWith('?>', j)) return j + 2;
    if (!isWs(s.charCodeAt(j))) bad('bad PI');
    const k = s.indexOf('?>', j);
    if (k === -1) bad('unclosed PI');
    return k + 2;
  }

  function parseXmlDecl(i, e) {
    // <?xml S version Eq "…" [S encoding Eq "…"] [S standalone Eq yes|no] S? ?>
    let j = e;
    const need = () => { const k = skipWs(j); if (k === j) bad('xml decl ws'); j = k; };
    const eq = () => { j = skipWs(j); if (s.charCodeAt(j) !== 0x3d) bad('xml decl ='); j = skipWs(j + 1); };
    const quoted = () => {
      const q = s.charCodeAt(j);
      if (q !== 0x22 && q !== 0x27) bad('xml decl quote');
      const k = s.indexOf(s[j], j + 1);
      if (k === -1) bad('xml decl unclosed');
      const v = s.slice(j + 1, k);
      j = k + 1;
      return v;
    };
    need();
    if (!s.startsWith('version', j)) bad('xml decl version');
    j += 7; eq();
    if (!/^[-._A-Za-z0-9]*$/.test(quoted())) bad('xml decl version value');
    let k = skipWs(j);
    let sawWs = k > j;
    j = k;
    if (sawWs && s.startsWith('encoding', j)) {
      j += 8; eq();
      const enc = quoted();
      if (!ENC_NAME.test(enc)) bad('xml decl encoding name');
      if (utf16 ? !/^utf-?16/i.test(enc) : /^utf-?16/i.test(enc)) bad('encoding mismatch');
      k = skipWs(j); sawWs = k > j; j = k;
    }
    if (sawWs && s.startsWith('standalone', j)) {
      j += 10; eq();
      const v = quoted();
      if (v !== 'yes' && v !== 'no') bad('xml decl standalone');
      j = skipWs(j);
    }
    if (!s.startsWith('?>', j)) bad('xml decl end');
    return j + 2;
  }

  // 따옴표 리터럴(내용 검사 없음)
  function literal(i) {
    const q = s.charCodeAt(i);
    if (q !== 0x22 && q !== 0x27) bad('literal');
    const k = s.indexOf(s[i], i + 1);
    if (k === -1) bad('unclosed literal');
    return k;
  }

  function parseDoctype(i) { // s.startsWith('<!DOCTYPE', i)
    let j = i + 9;
    let k = skipWs(j);
    if (k === j) bad('doctype ws');
    j = k;
    const e = scanName(s, j);
    if (e === -1) bad('doctype name');
    splitQName(s.slice(j, e));
    j = skipWs(e);
    if (s.startsWith('SYSTEM', j)) {
      j += 6;
      k = skipWs(j); if (k === j) bad('ws'); j = literal(k) + 1;
      j = skipWs(j);
      ctx.lenient = true;
    } else if (s.startsWith('PUBLIC', j)) {
      j += 6;
      k = skipWs(j); if (k === j) bad('ws'); j = literal(k) + 1;
      k = skipWs(j); if (k === j) bad('ws'); j = literal(k) + 1;
      j = skipWs(j);
      ctx.lenient = true;
    }
    if (s.charCodeAt(j) === 0x5b) { // [
      j = parseInternalSubset(j + 1);
      j = skipWs(j);
    }
    if (s.charCodeAt(j) !== 0x3e) bad('doctype end');
    return j + 1;
  }

  // 엔티티 선언 값: 문자 참조는 그 자리에서 펼치고, 일반 엔티티 참조는 남긴다. % 는 오류.
  function entityValue(raw) {
    let o = '';
    let i = 0;
    while (i < raw.length) {
      const c = raw.charCodeAt(i);
      if (c === 0x25) bad('PE reference in entity value');
      if (c === 0x26) {
        const semi = raw.indexOf(';', i + 1);
        if (semi === -1) bad('bad ref');
        const body = raw.slice(i + 1, semi);
        if (body.charCodeAt(0) === 0x23) o += charRefValue(body);
        else { checkEntityName(body); o += `&${body};`; }
        i = semi + 1;
      } else { o += raw[i]; i++; }
    }
    return o;
  }

  function parseInternalSubset(i) {
    for (;;) {
      i = skipWs(i);
      if (i >= n) bad('unclosed doctype');
      const c = s.charCodeAt(i);
      if (c === 0x5d) return i + 1; // ]
      if (s.startsWith('<!--', i)) { i = parseComment(i); continue; }
      if (s.startsWith('<?', i)) { i = parsePI(i, false); continue; }
      if (s.startsWith('<!ENTITY', i)) { i = parseEntityDecl(i + 8); continue; }
      if (s.startsWith('<!ATTLIST', i)) { i = parseAttlistDecl(i + 9); continue; }
      if (s.startsWith('<!ELEMENT', i)) { i = parseElementDecl(i + 9); continue; }
      if (s.startsWith('<!NOTATION', i)) { i = skipDecl(i + 10); continue; }
      if (c === 0x25) { // %name; — 대체 텍스트를 끼워 읽지는 않고, 이후 선언은 기록하지 않는다(expat 도 읽지 못한 것으로 본다)
        const pe = scanName(s, i + 1);
        if (pe === -1 || s.charCodeAt(pe) !== 0x3b) bad('bad PE reference');
        ctx.lenient = true;
        ctx.stopDecl = true;
        i = pe + 1;
        continue;
      }
      bad('bad internal subset');
    }
  }

  function skipDecl(i) { // '>' 까지(따옴표 안은 건너뜀)
    while (i < n) {
      const c = s.charCodeAt(i);
      if (c === 0x22 || c === 0x27) { i = literal(i) + 1; continue; }
      if (c === 0x3e) return i + 1;
      i++;
    }
    bad('unclosed decl');
    return i;
  }

  function parseElementDecl(i) {
    let k = skipWs(i);
    if (k === i) bad('ws');
    const e = scanName(s, k);
    if (e === -1) bad('element decl name');
    splitQName(s.slice(k, e));
    k = skipWs(e);
    if (k === e) bad('ws');
    if (s.startsWith('EMPTY', k)) k += 5;
    else if (s.startsWith('ANY', k)) k += 3;
    else if (s.charCodeAt(k) === 0x28) k = contentGroup(k);
    else bad('element decl content');
    k = skipWs(k);
    if (s.charCodeAt(k) !== 0x3e) bad('element decl end');
    return k + 1;
  }

  function cpName(k) {
    const e = scanName(s, k);
    if (e === -1) bad('content model name');
    splitQName(s.slice(k, e));
    return e;
  }

  // '(' 에서 시작하는 내용 모델 그룹. 끝(수량자 포함) 다음 위치를 돌려준다.
  function contentGroup(k) {
    k = skipWs(k + 1);
    if (s.startsWith('#PCDATA', k)) {
      k = skipWs(k + 7);
      let names = false;
      while (s.charCodeAt(k) === 0x7c) { names = true; k = cpName(skipWs(k + 1)); k = skipWs(k); }
      if (s.charCodeAt(k) !== 0x29) bad('mixed content');
      k++;
      if (s.charCodeAt(k) === 0x2a) k++;
      else if (names) bad('mixed content needs *');
      return k;
    }
    return childGroup(k);
  }

  // '(' 다음부터의 children 그룹(cp 목록)
  function childGroup(k) {
    let sep = 0;
    for (;;) {
      k = contentCp(k);
      k = skipWs(k);
      const c = s.charCodeAt(k);
      if (c === 0x29) { k++; break; }
      if (c !== 0x2c && c !== 0x7c) bad('content model separator');
      if (sep === 0) sep = c; else if (sep !== c) bad('mixed separators');
      k = skipWs(k + 1);
    }
    const q = s.charCodeAt(k);
    if (q === 0x3f || q === 0x2a || q === 0x2b) k++;
    return k;
  }

  function contentCp(k) {
    if (s.charCodeAt(k) === 0x28) return childGroup(skipWs(k + 1));
    k = cpName(k);
    const q = s.charCodeAt(k);
    if (q === 0x3f || q === 0x2a || q === 0x2b) k++;
    return k;
  }

  function parseEntityDecl(i) {
    let k = skipWs(i);
    if (k === i) bad('ws');
    i = k;
    let isParam = false;
    if (s.charCodeAt(i) === 0x25) { isParam = true; i = skipWs(i + 1); }
    const e = scanName(s, i);
    if (e === -1) bad('entity name');
    const name = s.slice(i, e);
    if (name.indexOf(':') !== -1) bad('colon in entity name');
    i = skipWs(e);
    if (i === e) bad('ws');
    const c = s.charCodeAt(i);
    let ent;
    if (c === 0x22 || c === 0x27) {
      const k2 = literal(i);
      const raw = s.slice(i + 1, k2);
      ent = isParam || ctx.stopDecl ? null : { value: entityValue(raw) }; // %참조 뒤 선언의 값은 expat 이 따지지 않는다
      i = k2 + 1;
    } else {
      ent = { external: true };
      if (s.startsWith('SYSTEM', i)) {
        i += 6;
        k = skipWs(i); if (k === i) bad('ws'); i = literal(k) + 1;
      } else if (s.startsWith('PUBLIC', i)) {
        i += 6;
        k = skipWs(i); if (k === i) bad('ws'); i = literal(k) + 1;
        k = skipWs(i); if (k === i) bad('ws'); i = literal(k) + 1;
      } else bad('entity def');
      k = skipWs(i);
      if (k > i && s.startsWith('NDATA', k)) {
        i = k + 5;
        k = skipWs(i); if (k === i) bad('ws');
        const e2 = scanName(s, k);
        if (e2 === -1) bad('ndata name');
        i = e2;
      }
    }
    i = skipWs(i);
    if (s.charCodeAt(i) !== 0x3e) bad('entity decl end');
    if (!isParam && ent && !ctx.stopDecl && !PREDEF.has(name) && !ctx.entities.has(name)) ctx.entities.set(name, ent);
    return i + 1;
  }

  function parseAttlistDecl(i) {
    let k = skipWs(i);
    if (k === i) bad('ws');
    i = k;
    const e = scanName(s, i);
    if (e === -1) bad('attlist name');
    const el = s.slice(i, e);
    splitQName(el);
    i = e;
    for (;;) {
      k = skipWs(i);
      if (s.charCodeAt(k) === 0x3e) { return k + 1; }
      if (k === i) bad('ws');
      i = k;
      const ae = scanName(s, i);
      if (ae === -1) bad('attr name');
      const an = s.slice(i, ae);
      splitQName(an);
      i = ae;
      k = skipWs(i); if (k === i) bad('ws'); i = k;
      // 유형
      let type;
      if (s.charCodeAt(i) === 0x28) { // 열거형
        const close = s.indexOf(')', i);
        if (close === -1) bad('enum');
        type = 'ENUM';
        i = close + 1;
      } else {
        let t = i;
        while (t < n && !isWs(s.charCodeAt(t)) && s.charCodeAt(t) !== 0x3e) t++;
        type = s.slice(i, t);
        if (!['CDATA', 'ID', 'IDREF', 'IDREFS', 'ENTITY', 'ENTITIES', 'NMTOKEN', 'NMTOKENS', 'NOTATION'].includes(type)) bad('attr type');
        i = t;
        if (type === 'NOTATION') {
          k = skipWs(i); if (k === i) bad('ws');
          if (s.charCodeAt(k) !== 0x28) bad('notation');
          const close = s.indexOf(')', k);
          if (close === -1) bad('notation');
          i = close + 1;
        }
      }
      k = skipWs(i); if (k === i) bad('ws'); i = k;
      // 기본값
      let def = null; // 기본값 문자열 또는 null(없음)
      if (s.startsWith('#REQUIRED', i)) i += 9;
      else if (s.startsWith('#IMPLIED', i)) i += 8;
      else {
        if (s.startsWith('#FIXED', i)) {
          i += 6; k = skipWs(i); if (k === i) bad('ws'); i = k;
        }
        const k2 = literal(i);
        def = s.slice(i + 1, k2);
        i = k2 + 1;
      }
      const key = `${el}\u0000${an}`;
      if (!ctx.stopDecl && !ctx.attTypes.has(key)) {
        ctx.attTypes.set(key, type);
        if (def !== null) {
          let dv = expandAttr(ctx, def, new Set());
          if (type !== 'CDATA') dv = collapseSpaces(dv);
          let lst = ctx.attlist.get(el);
          if (!lst) { lst = []; ctx.attlist.set(el, lst); }
          lst.push([an, dv]);
        }
      }
    }
  }

  // ---- 시작 태그
  function startTag(i) {
    // s[i] === '<'
    const e = scanName(s, i + 1);
    if (e === -1) bad('bad element name');
    const qname = s.slice(i + 1, e);
    let j = e;
    let selfClose = false;
    let seenAttrs = null;
    const names = [];
    const vals = [];
    for (;;) {
      const k = skipWs(j);
      const c = s.charCodeAt(k);
      if (c === 0x3e) { j = k + 1; break; }
      if (c === 0x2f) {
        if (s.charCodeAt(k + 1) !== 0x3e) bad('bad empty tag');
        j = k + 2; selfClose = true; break;
      }
      if (k === j || k >= n) bad('attribute needs whitespace');
      const ae = scanName(s, k);
      if (ae === -1) bad('bad attribute name');
      const an = s.slice(k, ae);
      let m = skipWs(ae);
      if (s.charCodeAt(m) !== 0x3d) bad('attribute needs =');
      m = skipWs(m + 1);
      const q = s.charCodeAt(m);
      if (q !== 0x22 && q !== 0x27) bad('attribute needs quote');
      const close = s.indexOf(q === 0x22 ? '"' : "'", m + 1);
      if (close === -1) bad('unclosed attribute');
      const raw = s.slice(m + 1, close);
      const v = /[&<\t\n]/.test(raw) ? expandAttr(ctx, raw, new Set()) : raw;
      if (names.length < 16) {
        for (let x = 0; x < names.length; x++) if (names[x] === an) bad('duplicate attribute');
      } else {
        if (seenAttrs === null) seenAttrs = new Set(names);
        if (seenAttrs.has(an)) bad('duplicate attribute');
        seenAttrs.add(an);
      }
      names.push(an);
      vals.push(v);
      j = close + 1;
    }
    // 토큰화 유형 정규화·ATTLIST 기본값(DOCTYPE 이 있을 때만)
    if (ctx.attTypes.size) {
      for (let x = 0; x < names.length; x++) {
        const t = ctx.attTypes.get(`${qname}\u0000${names[x]}`);
        if (t !== undefined && t !== 'CDATA') vals[x] = collapseSpaces(vals[x]);
      }
      const defs = ctx.attlist.get(qname);
      if (defs) {
        for (const [an, dv] of defs) {
          if (names.indexOf(an) !== -1) continue;
          names.push(an);
          vals.push(dv);
        }
      }
    }
    // 네임스페이스 선언
    const saves = [];
    for (let x = 0; x < names.length; x++) {
      const an = names[x];
      if (an !== 'xmlns' && !an.startsWith('xmlns:')) continue;
      const isDefault = an === 'xmlns';
      const prefix = isDefault ? '' : an.slice(6);
      const uri = vals[x];
      if (!isDefault) {
        if (prefix.indexOf(':') !== -1 || !START_T[prefix.charCodeAt(0)]) bad('bad xmlns prefix');
        if (prefix === 'xmlns') bad('xmlns prefix declared');
        if (prefix === 'xml') { if (uri !== XML_NS) bad('xml prefix rebound'); continue; }
        if (uri === '') bad('prefix undeclared');
      }
      if (uri === XML_NS || uri === XMLNS_NS) bad('reserved namespace');
      saves.push([prefix, nsMap.has(prefix) ? nsMap.get(prefix) : undefined]);
      nsMap.set(prefix, uri);
    }
    const lookup = (prefix) => {
      if (prefix === 'xml') return XML_NS;
      const u = nsMap.get(prefix);
      if (u === undefined) bad('unbound prefix');
      return u;
    };
    const [ep, el] = splitQName(qname);
    const uri = ep !== null ? lookup(ep) : (nsMap.has('') ? nsMap.get('') : '');
    const attrs = new Map();
    for (let x = 0; x < names.length; x++) {
      const an = names[x];
      if (an === 'xmlns' || an.startsWith('xmlns:')) continue;
      const [ap, al] = splitQName(an);
      if (ap === null) { attrs.set(al, vals[x]); continue; }
      const key = `{${lookup(ap)}}${al}`;
      if (attrs.has(key)) bad('duplicate attribute (ns)');
      attrs.set(key, vals[x]);
    }
    rawNames.push(qname);
    nsSaves.push(saves);
    h.start(rawNames.length, uri, el, attrs);
    if (selfClose) closeElement();
    return j;
  }

  function closeElement() {
    const depth = rawNames.length;
    const saves = nsSaves.pop();
    rawNames.pop();
    for (let x = saves.length - 1; x >= 0; x--) {
      const [p, old] = saves[x];
      if (old === undefined) nsMap.delete(p); else nsMap.set(p, old);
    }
    h.end(depth);
  }

  // 텍스트 구간 s[a,b) 검사(참조·`]]>`). 마크업이 든 엔티티는 그 대체 텍스트를 내용으로 다시 읽는다.
  function checkText(a, b, active) {
    // 구간만 잘라서 찾는다(s 전체에서 indexOf 하면 뒤에 없을 때마다 끝까지 훑어 제곱 시간이 된다)
    const seg = s.slice(a, b);
    if (seg.indexOf(']]>') !== -1) bad(']]> in text');
    let p = seg.indexOf('&');
    while (p !== -1) {
      const semi = seg.indexOf(';', p + 1);
      if (semi === -1) bad('bad reference');
      const body = seg.slice(p + 1, semi);
      if (body.charCodeAt(0) === 0x23) charRefValue(body);
      else {
        checkEntityName(body);
        if (!PREDEF.has(body)) {
          const ent = ctx.entities.get(body);
          if (ent === undefined || ent.external) bad('undefined entity');
          if (active.has(body)) bad('recursive entity');
          const v = ent.value;
          ctx.expanded += v.length;
          if (ctx.expanded > MAX_EXPANSION) bad('entity expansion too large');
          if (v.indexOf('<') !== -1 || v.indexOf('&') !== -1) {
            active.add(body);
            scan(v, true, active, 0);
            active.delete(body);
          }
        }
      }
      p = seg.indexOf('&', semi + 1);
    }
  }

  // 내용 읽기. entity=true 면 엔티티 대체 텍스트(문서 한가운데에 끼워 읽는다)다. s·n 은 읽는 동안만 바꿔 끼운다.
  function scan(str, entity, active, startAt) {
    const saveS = s;
    const saveN = n;
    s = str;
    n = str.length;
    try {
      const baseDepth = rawNames.length;
      let i = startAt;
      while (i < n) {
        const lt = s.indexOf('<', i);
        const end = lt === -1 ? n : lt;
        if (end > i) {
          if (!entity && rawNames.length === 0) {
            for (let x = i; x < end; x++) if (!isWs(s.charCodeAt(x))) bad('text outside root');
          } else checkText(i, end, active);
        }
        if (lt === -1) { i = n; break; }
        const c = s.charCodeAt(lt + 1);
        if (c === 0x2f) { // </
          if (rawNames.length === baseDepth) bad('end tag without start');
          const e = scanName(s, lt + 2);
          if (e === -1 || s.slice(lt + 2, e) !== rawNames[rawNames.length - 1]) bad('mismatched tag');
          const k = skipWs(e);
          if (s.charCodeAt(k) !== 0x3e) bad('bad end tag');
          closeElement();
          i = k + 1;
        } else if (c === 0x21) { // <!
          if (s.startsWith('<!--', lt)) i = parseComment(lt);
          else if (s.startsWith('<![CDATA[', lt)) {
            if (!entity && rawNames.length === 0) bad('CDATA outside root');
            const k = s.indexOf(']]>', lt + 9);
            if (k === -1) bad('unclosed CDATA');
            i = k + 3;
          } else bad('bad markup declaration');
        } else if (c === 0x3f) { // <?
          i = parsePI(lt, false);
        } else {
          if (!entity && rawNames.length === 0) {
            if (rootSeen) bad('junk after document element');
            rootSeen = true;
          }
          i = startTag(lt);
        }
      }
      if (rawNames.length !== baseDepth) bad(entity ? 'unbalanced entity' : 'unclosed element');
    } finally {
      s = saveS;
      n = saveN;
    }
  }

  // ---- 문서 수준(prolog)
  let i = 0;
  if (s.startsWith('<?xml', 0) && isWs(s.charCodeAt(5))) i = parsePI(0, true);
  let doctypeSeen = false;
  for (;;) {
    i = skipWs(i);
    if (i >= n) bad('no element found');
    if (s.charCodeAt(i) !== 0x3c) bad('text before root');
    if (s.startsWith('<!--', i)) { i = parseComment(i); continue; }
    if (s.startsWith('<?', i)) { i = parsePI(i, false); continue; }
    if (s.startsWith('<!DOCTYPE', i)) {
      if (doctypeSeen) bad('second doctype');
      doctypeSeen = true;
      i = parseDoctype(i);
      continue;
    }
    break;
  }
  scan(s, false, new Set(), i);
  if (!rootSeen) bad('no element');
}

// ---------------------------------------------------------------- JUnit 합산(python 판 main 의 본문)

// 한 파일을 읽어 합산 재료를 돌려준다. 파싱 오류·루트 부적합이면 null(JUNIT_SKIP). 합계는 호출 쪽이 더한다.
export function parse_junit_xml(buf) {
  let kind = 0; // 0 미정/부적합, 1 루트가 testsuite, 2 루트가 testsuites
  let inSuite = false;
  let inTc = false;
  let tc = null;
  const suites = []; // [tests, failures, errors, skipped] 원문(속성 없으면 undefined)
  const failed = [];
  const handler = {
    start(depth, uri, local, attrs) {
      if (depth === 1) {
        if (uri === '' && local === 'testsuite') kind = 1;
        else if (uri === '' && local === 'testsuites') kind = 2;
        else kind = 0;
      }
      if (kind === 0) return;
      const suiteDepth = kind === 1 ? 1 : 2;
      if (depth === suiteDepth) {
        if (uri === '' && local === 'testsuite') {
          inSuite = true;
          suites.push([attrs.get('tests'), attrs.get('failures'), attrs.get('errors'), attrs.get('skipped')]);
        }
      } else if (depth === suiteDepth + 1) {
        inTc = inSuite && uri === '' && local === 'testcase';
        if (inTc) {
          const cn = attrs.get('classname');
          const nm = attrs.get('name');
          tc = { cn: cn === undefined ? '' : cn, nm: nm === undefined ? '' : nm, fail: false };
        }
      } else if (depth === suiteDepth + 2) {
        if (inTc && uri === '' && (local === 'failure' || local === 'error')) tc.fail = true;
      }
    },
    end(depth) {
      if (kind === 0) return;
      const suiteDepth = kind === 1 ? 1 : 2;
      if (depth === suiteDepth + 1) {
        if (inTc && tc.fail) failed.push(`${tc.cn}.${tc.nm}`);
        inTc = false;
      } else if (depth === suiteDepth) inSuite = false;
    },
  };
  try {
    const { text, utf16 } = decodeBytes(buf);
    if (BAD_CHARS.test(text)) bad('invalid character');
    tables();
    parseDocument(text.indexOf('\r') === -1 ? text : text.replace(/\r\n?/g, '\n'), utf16, handler);
  } catch (e) {
    const a = resourceOf(e);
    if (a) throw a;
    if (e instanceof XmlError || e instanceof RangeError) return null;
    throw e;
  }
  if (kind === 0) return null;
  return { suites, failed };
}

// 시험용: 문서가 well-formed 인지만 본다(루트 이름은 보지 않는다).
export function xml_wellformed(buf) {
  try {
    const { text, utf16 } = decodeBytes(buf);
    if (BAD_CHARS.test(text)) return false;
    tables();
    parseDocument(text.indexOf('\r') === -1 ? text : text.replace(/\r\n?/g, '\n'), utf16, { start() {}, end() {} });
    return true;
  } catch (e) {
    const a = resourceOf(e);
    if (a) throw a;
    if (e instanceof XmlError || e instanceof RangeError) return false;
    throw e;
  }
}

const SINCE_DIGITS = /^[0-9\p{Nd}]+$/u;

// python os.path.getmtime: sec + nsec * 1e-9 (float)
function getmtime(p) {
  const st = fs.statSync(p, { bigint: true });
  const ns = st.mtimeNs;
  return Number(ns / 1000000000n) + Number(ns % 1000000000n) * 1e-9;
}

export function resolve_since(value) {
  if (!value) return null;
  if (SINCE_DIGITS.test(value)) return py_float(value);
  try {
    return getmtime(value);
  } catch {
    err(`JUNIT_SINCE_INVALID ${value}\n`);
    throw new PyExit(2);
  }
}

// python 문자열 비교(코드포인트 순). UTF-16 단위 그대로 비교하면 서로게이트 쌍(U+10000 이상)이 U+E000~U+FFFF 보다 앞서는 오류가 있다.
const fixUnit = (c) => (c >= 0xe000 ? c - 0x800 : c >= 0xd800 ? c + 0x2000 : c);
const cmpCodePoint = (a, b) => {
  const m = Math.min(a.length, b.length);
  for (let k = 0; k < m; k++) {
    const x = a.charCodeAt(k);
    const y = b.charCodeAt(k);
    if (x !== y) return x >= 0xd800 && y >= 0xd800 ? fixUnit(x) - fixUnit(y) : x - y;
  }
  return a.length - b.length;
};

export function main(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    out('usage: junit-count.sh [--failed-file <경로>] [--since <epoch 초 | 파일>] [<폴더>...]\n');
    out('stdout: JUNIT_SUMMARY tests=<N> failures=<F> errors=<E> skipped=<S> files=<K> 한 줄. exit 0 정상, 1 셀 게 없음·전체 실패, 2 사용법 오류.\n');
    return 0;
  }
  let failedFile = '';
  let sinceArg = '';
  const roots = [];
  let dd = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!dd && a === '--failed-file') {
      if (i + 1 >= argv.length) { usageErr(); return 2; }
      failedFile = argv[++i];
    } else if (!dd && a === '--since') {
      if (i + 1 >= argv.length) { usageErr(); return 2; }
      sinceArg = argv[++i];
    } else if (!dd && a === '--') {
      dd = true;
    } else if (!dd && a.startsWith('-')) {
      usageErr();
      return 2;
    } else {
      roots.push(a);
    }
  }
  if (roots.length === 0) roots.push('.');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'junit-count.'));
  try {
    tables();
    const errors = [];
    let list = [];
    for (const r of roots) {
      if (r === '') continue;
      list.push(...discover(r, errors));
    }
    for (const e of errors) err(`${e}\n`);
    list = [...new Set(list)].sort(byBytes);
    if (list.length === 0) {
      out(`JUNIT_SUMMARY_NONE ${roots.join(' ').replace(/\s+$/, '')}\n`);
      return 1;
    }
    // 윈도우 Git Bash: cygpath 가 있으면 읽기 경로를 `C:/…` 꼴로 바꿔 읽고 출력은 원래 경로 그대로 낸다.
    const converted = cygConvert(list, tmp);
    const entries = list.map((d, i) => [d, converted !== null && converted[i].trim() !== '' ? converted[i] : d]); // [출력용 경로, 여는 경로]
    return sumEntries(entries, sinceArg, failedFile);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 무시 */ }
  }
}

function usageErr() {
  err('usage: junit-count.sh [--failed-file <경로>] [--since <epoch 초 | 파일>] [<폴더>...]\n');
}

// LC_ALL=C sort -u 와 같은 바이트 순.
function byBytes(a, b) {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

const SKIP_NAMES = new Set(['node_modules', '.git', '.gradle']);
const WORKTREES_RE = /^.*\/\.claude\/worktrees$/;
// 옛 .sh 의 find 패턴 세 가지(셸 case 패턴 — `*` 는 `/` 도 넘는다).
const XML_RES = [
  /^.*\/build\/test-results\/.*\/TEST-.*\.xml$/,
  /^.*\/target\/surefire-reports\/TEST-.*\.xml$/,
  /^.*\/target\/failsafe-reports\/TEST-.*\.xml$/,
];

function findErr(p, e) {
  const why = e && e.code === 'ENOENT' ? 'No such file or directory'
    : e && e.code === 'EACCES' ? 'Permission denied' : (e && e.message ? e.message : String(e));
  return `find: ${p}: ${why}`;
}

function baseName(p) {
  const i = p.lastIndexOf('/');
  return i === -1 ? p : p.slice(i + 1);
}

// <root> 아래 XML 을 찾아 표시 경로(<root> + / + 상대경로, find 와 같은 모양)로 낸다.
// 실패한 읽기는 find 의 stderr 줄로 모아 낸다.
function discover(rootArg, errors) {
  const found = [];
  let stripped = rootArg;
  if (stripped.length > 1) stripped = stripped.replace(/\/+$/, '');
  if (stripped === '') stripped = '/';
  const disp = (rel) => (stripped === '/' ? `/${rel}` : `${stripped}/${rel}`);
  let st;
  try {
    st = fs.lstatSync(stripped);
  } catch (e) {
    errors.push(findErr(rootArg, e));
    return found;
  }
  // 루트 자체도 prune 판정을 받는다(find 와 같다).
  if (SKIP_NAMES.has(baseName(stripped)) || WORKTREES_RE.test(stripped)) return found;
  if (!st.isDirectory()) {
    if (st.isFile() && XML_RES.some((re) => re.test(rootArg))) found.push(rootArg);
    return found;
  }
  const visit = (dirFs, rel) => {
    let ents;
    try {
      ents = fs.readdirSync(dirFs, { withFileTypes: true });
    } catch (e) {
      errors.push(findErr(disp(rel), e));
      return;
    }
    for (const e of ents) {
      const r = rel === '' ? e.name : `${rel}/${e.name}`;
      const d = disp(r);
      if (SKIP_NAMES.has(e.name) || WORKTREES_RE.test(d)) continue;
      if (e.isDirectory()) visit(path.join(dirFs, e.name), r);
      else if (e.isFile() && XML_RES.some((re) => re.test(d))) found.push(d);
    }
  };
  visit(stripped, '');
  return found;
}

// 표시 경로 목록을 cygpath -m 으로 일괄 변환한다. cygpath 가 없거나 실패·줄 수 불일치면 null(원래 경로로 읽는다).
function cygConvert(list, tmp) {
  const f = path.join(tmp, 'list');
  try {
    fs.writeFileSync(f, `${list.join('\n')}\n`);
    const r = spawnSync('cygpath', ['-m', '-f', f], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    if (r.error || r.status !== 0) return null;
    const lines = String(r.stdout ?? '').split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    if (lines.length !== list.length) return null;
    return lines;
  } catch {
    return null;
  }
}

function sumEntries(entries, sinceArg, failedFile) {
  try {
    tables();
    const since = resolve_since(sinceArg);

    let totalTests = 0n;
    let totalFailures = 0n;
    let totalErrors = 0n;
    let totalSkipped = 0n;
    let parsedFiles = 0;
    const failedNames = new Set();

    for (const [p, rp] of entries) {
      if (since !== null) {
        let mtime = null;
        try { mtime = getmtime(rp); } catch { mtime = null; }
        if (mtime !== null && mtime < since) {
          err(`JUNIT_STALE ${p}\n`);
          continue;
        }
      }
      let r;
      try {
        let buf;
        // 읽기 실패 중 용량 때문인 것(2GiB 초과 등)은 건너뛰지 않고 전체 실패, 그 밖(없음·권한 …)은 JUNIT_SKIP
        try {
          if (process.env.JUNIT_MAX_BYTES !== undefined) checkMaxBytes(fs.statSync(rp).size);
          buf = fs.readFileSync(rp);
        } catch (e) {
          const a = resourceOf(e);
          if (a) throw a;
          err(`JUNIT_SKIP ${p}\n`);
          continue;
        }
        r = parse_junit_xml(buf);
      } catch (e) {
        if (e instanceof AbortError) { err(`JUNIT_ABORT ${p} ${e.message}\n`); return 1; }
        throw e;
      }
      if (r === null) { err(`JUNIT_SKIP ${p}\n`); continue; }
      for (const [t, f, e, s] of r.suites) {
        totalTests += as_int(t);
        totalFailures += as_int(f);
        totalErrors += as_int(e);
        totalSkipped += as_int(s);
      }
      for (const nme of r.failed) failedNames.add(nme);
      parsedFiles += 1;
    }

    out(`JUNIT_SUMMARY tests=${totalTests} failures=${totalFailures} errors=${totalErrors} skipped=${totalSkipped} files=${parsedFiles}\n`);

    if (failedFile) {
      const names = [...failedNames].sort(cmpCodePoint);
      try {
        fs.writeFileSync(failedFile, names.map((x) => `${x}\n`).join(''));
      } catch (e) {
        err(`OSError: ${e.message}\n`);
        return 1;
      }
    }
    return 0;
  } catch (e) {
    if (e instanceof PyExit) return e.code;
    if (e instanceof PyCrash) { err(`${e.message}\n`); return 1; }
    throw e;
  }
}

function isMain() {
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1]));
  } catch {
    return false;
  }
}

if (isMain()) process.exitCode = main(process.argv.slice(2));
