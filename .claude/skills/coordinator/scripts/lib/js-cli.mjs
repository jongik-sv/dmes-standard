// bash lib 의 node 판(scripts/lib/<모듈>.mjs)이 함께 쓰는 CLI 틀. 계약 정본은 tests/js-parity/README.md 「CLI 계약」.
//   node <모듈>.mjs <bash 함수 이름> [인자…]     stdin → stdout, 종료 코드 = 그 bash 함수의 종료 코드
//   · stdout 은 bash 함수가 stdout 에 낸 바이트 그대로(끝 줄바꿈 유무 포함). stderr 는 비교하지 않는다.
//   · 함수가 전역 변수로 값을 돌려주면(예: SC_STORED_KIND) 환경 변수 COORD_JS_GLOBALS_FILE 이 가리키는 파일에
//     `NAME=값` 을 NUL(\0)로 이어 쓴다(js-bridge.sh 의 _jsb_callg 가 읽어 같은 이름의 전역 변수에 넣는다).
//   · 모르는 함수 이름은 종료 코드 2, 처리 중 예외는 종료 코드 70(내부 오류 — bash 쪽은 실패로 다룬다). 두 값은 함수의 정상 종료 코드로 쓰지 않는다.
// node 18.17 이상, 외부 패키지 없음.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const RC_USAGE = 2;
export const RC_INTERNAL = 70;

/** import.meta.url 이 지금 실행한 스크립트인가(윈도우 경로도 pathToFileURL 로 맞춘다). */
export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && metaUrl === pathToFileURL(process.argv[1]).href;
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks);
}

function writeAll(stream, buf) {
  return new Promise((resolve) => { if (!buf.length) resolve(); else stream.write(buf, () => resolve()); });
}

/** `NAME=값` 을 NUL 로 이은 바이트열(전역 변수 전달 형식). 이름은 [A-Za-z_][A-Za-z0-9_]* 만 허용. */
export function globalsBytes(globals) {
  const parts = [];
  for (const [k, v] of Object.entries(globals || {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new Error(`전역 변수 이름이 올바르지 않다: ${k}`);
    parts.push(Buffer.from(`${k}=${v ?? ''}`, 'utf8'), Buffer.from([0]));
  }
  return Buffer.concat(parts);
}

/**
 * functions: { [bash 함수 이름]: { stdin?: true, run(ctx) } }
 *   ctx = { args: string[], stdin: Buffer | null(stdin: true 인 함수만 읽는다), env: process.env, cwd: process.cwd() }
 *   run 은 { out?: string | Buffer, rc?: number, globals?: { NAME: '값' }, err?: string } 또는 undefined 를 돌려준다(비동기 가능).
 *   out 이 문자열이면 UTF-8 로 쓴다. 바이트가 중요하면 Buffer 로 준다.
 * 반환값은 종료 코드(호출한 쪽이 process.exitCode 에 넣는다 — process.exit 는 큰 stdout 을 자를 수 있어 쓰지 않는다).
 */
export async function runCli(functions, argv = process.argv.slice(2), env = process.env) {
  const [name, ...args] = argv;
  const fn = name && Object.prototype.hasOwnProperty.call(functions, name) ? functions[name] : null;
  if (!fn) {
    process.stderr.write(`사용: node <모듈>.mjs <함수> [인자…]  (있는 함수: ${Object.keys(functions).join(' ')})\n`);
    return RC_USAGE;
  }
  try {
    const stdin = fn.stdin ? await readStdin() : null;
    const r = (await fn.run({ args, stdin, env, cwd: process.cwd() })) || {};
    if (env.COORD_JS_GLOBALS_FILE) writeFileSync(env.COORD_JS_GLOBALS_FILE, globalsBytes(r.globals));
    if (r.err) process.stderr.write(r.err);
    if (r.out != null && r.out.length) await writeAll(process.stdout, Buffer.isBuffer(r.out) ? r.out : Buffer.from(String(r.out), 'utf8'));
    return r.rc ?? 0;
  } catch (e) {
    process.stderr.write(`js-cli: ${name} 내부 오류: ${e && e.stack ? e.stack : e}\n`);
    return RC_INTERNAL;
  }
}

/** 모듈 끝에 두는 한 줄: `if (isMain(import.meta.url)) cliMain(functions);` */
export function cliMain(functions) {
  runCli(functions).then((rc) => { process.exitCode = rc; });
}
