// statusline-dump.mjs — 조정자 스크립트(node). 2026-10-09 W4 부터 이 파일이 유일한 구현이다(옛 bash 판은 backup/scripts/statusline-dump.sh 에 퇴역 보관).
//   `{at, session_id, context_window, rate_limits}` 를 <state_dir>/ctx/<session_id>.json 에 임시 파일 → mv 로 쓰고,
//   COORD_STATUSLINE_NEXT 가 있으면 같은 stdin 을 `bash -c` 로 넘겨 출력을 그대로 낸다. 어떤 실패에도 종료 코드 0.
// 매 갱신마다 불리므로 import 를 최소로 한다(설정 풀이에 필요한 common.mjs 함수만).
//   · bash `in="$(cat)"` 은 NUL 을 지우고 끝 줄바꿈을 뗀다 — jq·NEXT 에 들어가는 글도 그 바이트열을 쓴다.
//   · jq -c 출력은 jq-json 으로 바이트까지 같게 만든다(입력 숫자의 글 그대로 보존).
// node 18.17 이상, 외부 패키지 없음.
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import * as J from './lib/jq-json.mjs';
import { Ctx, stateRoot } from './lib/common.mjs';
import { epochFmt } from './lib/compat.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';
import { runSync } from './lib/common-ext.mjs';

const nowSec = () => Math.floor(Date.now() / 1000);

/** bash `in="$(cat)"` — NUL 제거·끝 줄바꿈 제거한 stdin(바이트열) */
export function stdinBuf(buf) {
  const b = Buffer.from(buf);
  const parts = [];
  for (let i = 0; i < b.length; i++) { if (b[i] !== 0) parts.push(b[i]); }
  let end = parts.length;
  while (end > 0 && parts[end - 1] === 0x0a) end--;
  return Buffer.from(parts.slice(0, end));
}

/** jq -r '.session_id // empty' 의 출력(줄바꿈 뗀 값). 파싱 오류가 나도 앞의 정상 문서는 낸다 */
export function sidOf(text) {
  let out = '';
  for (const d of J.parseStreamPartial(text).values) {
    let v;
    try { v = J.alt(J.index(d, 'session_id'), undefined); } catch { continue; }
    if (v !== undefined) out += `${typeof v === 'string' ? v : J.tostring(v)}\n`;
  }
  return out.replace(/\n+$/, '');
}

/** jq -c --arg at '{at:$at, session_id:…, context_window:(… // null), rate_limits:(… // null)}' 출력(문서마다 한 줄) */
export function dumpJson(text, at) {
  let out = '';
  for (const d of J.parseStreamPartial(text).values) {
    const doc = new Map();
    doc.set('at', at);
    let v = null;
    try { v = J.index(d, 'session_id'); } catch { /* null */ }
    doc.set('session_id', v);
    let cw = null;
    let rl = null;
    try { cw = J.alt(J.index(d, 'context_window'), null); } catch { /* null */ }
    try { rl = J.alt(J.index(d, 'rate_limits'), null); } catch { /* null */ }
    doc.set('context_window', cw);
    doc.set('rate_limits', rl);
    out += `${J.stringify(doc, { indent: 0 })}\n`;
  }
  return out;
}

/** main — 종료 코드(늘 0). {env, cwd} 는 맥락 */
export async function main(_argv, { env, cwd } = {}) {
  const c = new Ctx(env, cwd);
  const chunks = [];
  for await (const ch of process.stdin) chunks.push(ch);
  const inBuf = stdinBuf(Buffer.concat(chunks));
  const inStr = inBuf.toString('latin1');   // jq 는 바이트열을 다룬다 — 출력도 latin1 로 주고받는다

  let sd = '';
  try { sd = stateRoot(c); } catch { sd = ''; }   // 상태 뿌리를 못 구해도 조용히 넘어간다
  if (sd === '') sd = `${env.HOME ?? ''}/.coord`;

  const sid = sidOf(inStr);
  if (sid !== '' && /^[A-Za-z0-9._-]+$/.test(sid)) {
    try {
      mkdirSync(`${sd}/ctx`, { recursive: true });
      const { error } = J.parseStreamPartial(inStr);
      if (!error) {
        const s = epochFmt(String(nowSec()), '%Y-%m-%dT%H:%M:%S%z');
        if (s != null) {
          const at = `${s.slice(0, -2)}:${s.slice(-2)}`;
          const tmp = `${sd}/ctx/.${sid}.json.${process.pid}`;
          writeFileSync(tmp, Buffer.from(dumpJson(inStr, at), 'latin1'));
          try { renameSync(tmp, `${sd}/ctx/${sid}.json`); }
          catch { try { rmSync(tmp, { force: true }); } catch { /* 무시 */ } }
        }
      }
    } catch { /* statusline 을 깨지 않는다 — 어떤 실패에도 exit 0 */ }
  }

  if (env.COORD_STATUSLINE_NEXT) {
    const r = runSync('bash', ['-c', env.COORD_STATUSLINE_NEXT], { env, cwd, input: inBuf });
    if (r.out.length) process.stdout.write(r.out);
  }
  return 0;
}
if (isMain(import.meta.url)) scriptMain(main);
