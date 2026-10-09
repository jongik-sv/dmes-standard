// scripts/lib/compact-screen.mjs (옛 bash 판은 backup/scripts/lib/compact-screen.sh 에 퇴역 보관, 2026-10-09 W4)
// compact 직후 화면으로 결과를 확인하는 순수 함수 둘. grep -E 계열의 대응 규칙:
//   · 줄은 \n 으로만 나눈다(끝 줄바꿈 뒤 빈 조각은 줄이 아니다). tail -n N = 마지막 N줄.
//   · grep -i 는 ASCII 대소문자만 겹친다고 본다(C 로캘). 제외·추출 패턴은 ERE 를 그대로 옮겼다.
//   · grep -o 는 줄 안에서 겹치지 않는 왼쪽 일치를 차례로 낸다 — 마지막 일치를 쓴다.
// node 18.17 이상, 외부 패키지 없음.
import { isMain, cliMain } from './js-cli.mjs';

const EXC = /left|remaining|until/i;
const PCT = /(ctx|context)[^0-9%]{0,12}[0-9]{1,3}%|[0-9]{1,3}% *(ctx|context|used)/gi;
const PCT_NUM = /[0-9]{1,3}%/;

const tailLines = (buf, n) => {
  const text = buf.toString('latin1');
  const lines = text === '' ? [] : text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.slice(-n);
};

/** compact_screen_ctx_pct — 화면 끝 12줄의 상태줄에서 사용률 정수 %(0~100). 못 찾으면 빈 출력·rc 0 */
export function ctxPct(buf) {
  let last = null;
  const lines = tailLines(buf, 12);
  // grep 은 NUL 바이트가 있으면 입력을 바이너리로 보고 줄을 내지 않는다(-q 는 rc 만 내놓는다 — compacted 쪽은 무관)
  if (lines.some((ln) => ln.includes('\0'))) return { out: '', rc: 0 };
  for (const ln of lines) {
    if (EXC.test(ln)) continue;
    for (const m of ln.matchAll(PCT)) last = m[0];
  }
  if (last === null) return { out: '', rc: 0 };
  const m = PCT_NUM.exec(last);
  const n = m ? m[0].slice(0, -1) : '';
  if (n === '' || /[^0-9]/.test(n) || Number(n) > 100) return { out: '', rc: 0 };
  return { out: `${n}\n`, rc: 0 };
}

/** compact_screen_compacted — 화면 끝 20줄에 「compacted」 문구가 있으면 rc 0 */
export function compacted(buf) {
  return { rc: tailLines(buf, 20).some((ln) => /compacted/i.test(ln)) ? 0 : 1 };
}

export const functions = {
  compact_screen_ctx_pct: { stdin: true, run: ({ stdin }) => ctxPct(stdin ?? Buffer.alloc(0)) },
  compact_screen_compacted: { stdin: true, run: ({ stdin }) => compacted(stdin ?? Buffer.alloc(0)) },
};
if (isMain(import.meta.url)) cliMain(functions);
