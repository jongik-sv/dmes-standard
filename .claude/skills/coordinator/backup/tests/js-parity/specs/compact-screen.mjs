// scripts/lib/compact-screen.sh ↔ compact-screen.mjs 대조 명세(스위치 COORD_JS_COMPACT_SCREEN).
// 고정 사례는 tests/lessons.sh §2(가짜 입력) 의 eq 한 줄을 그대로 옮겼다. 무작위 사례는 화면 모양 입력에 경계값 줄을 섞는다.
import { gen } from '../gen.mjs';

const ENC = (s) => s;   // 사례의 stdin 은 문자열을 그대로 쓴다(하니스가 Buffer 로 바꾼다)
const pct = (s) => ({ args: [], stdin: ENC(s) });
const LINES = [
  'ctx 12% | opus', 'Context: 7%', '33% context used', '33% used', 'Context left until auto-compact: 88%',
  'ctx 150%', 'esc to interrupt', 'CTX 45%', 'ctx 0%', 'ctx 100%', 'ctx 101%', '12% Context',
  'context      64% x', 'context             64% x',   // [^0-9%]{0,12} 경계(12칸 안/밖)
  'ctx %', 'ctx 7', '50% usedx', 'used 50%', '50%ctx', '100%', 'ctx 1000%', 'ctx 09%',
  'NO% context', '컨텍스트 ctx 55%', 'remaining ctx 55%', 'until 55% ctx', '5% 5% used', 'ctx 5%%',
  'Conversation compacted', 'Compacting conversation…', 'compacted', 'COMPACTED', '✻ Compacted(x',
];

function screen(rng) {
  const base = gen('screen')(rng, 0).stdin.toString('latin1');
  const lines = base.split('\n');
  const n = rng.int(0, 3);
  for (let k = 0; k < n; k++) lines.splice(rng.chance(0.5) ? lines.length : rng.int(0, lines.length), 0, rng.pick(LINES));
  if (rng.chance(0.2)) for (let k = rng.int(1, 20); k > 0; k--) lines.push('');
  if (rng.chance(0.15)) lines.push(`noise${'x'.repeat(rng.int(1, 40))}\r`);
  return lines.join('\n');
}

export default {
  module: 'compact-screen',
  sh: 'scripts/lib/compact-screen.sh',
  mjs: 'scripts/lib/compact-screen.mjs',
  switchEnv: 'COORD_JS_COMPACT_SCREEN',
  env: { LC_ALL: 'C' },
  functions: {
    compact_screen_ctx_pct: {
      js: ['compact_screen_ctx_pct'],
      fixed: [
        { label: 'lessons.sh: ctx 12%', args: [], stdin: 'foo\n ctx 12% | opus\n' },
        { label: 'lessons.sh: Context: 7%', args: [], stdin: 'Context: 7%\n' },
        { label: 'lessons.sh: 33% context', args: [], stdin: '33% context used\n' },
        { label: 'lessons.sh: 남은 뜻(left)은 뺀다', args: [], stdin: 'Context left until auto-compact: 88%\n' },
        { label: 'lessons.sh: 100 초과는 버린다', args: [], stdin: 'ctx 150%\n' },
        { label: 'lessons.sh: 없으면 빈 출력', args: [], stdin: 'esc to interrupt\n' },
        { label: 'lessons.sh: 마지막 일치를 쓴다', args: [], stdin: 'ctx 80%\n...\nctx 9%\n' },
        { label: '빈 입력', args: [], stdin: '' },
        { label: 'NUL 바이트가 있으면 grep 이 바이너리로 보고 못 찾는다', args: [], stdin: 'x\0y\nctx 12%\n' },
        { label: '끝 줄바꿈 없음', args: [], stdin: 'ctx 12%' },
        { label: '12줄 위의 일치는 못 본다', args: [], stdin: `ctx 50%\n${'x\n'.repeat(12)}` },
        { label: '11줄 위의 일치는 본다', args: [], stdin: `ctx 50%\n${'x\n'.repeat(11)}` },
      ],
      gen: (rng) => pct(screen(rng)),
    },
    compact_screen_compacted: {
      js: ['compact_screen_compacted'],
      fixed: [
        { label: 'lessons.sh: compacted 문구 감지', args: [], stdin: '✻ Conversation compacted (ctrl+o for history)\n' },
        { label: 'lessons.sh: Compacting 은 compacted 가 아니다', args: [], stdin: 'Compacting conversation…\n' },
        { label: '빈 입력', args: [], stdin: '' },
        { label: '20줄 위의 문구는 못 본다', args: [], stdin: `compacted\n${'x\n'.repeat(20)}` },
        { label: '19줄 위의 문구는 본다', args: [], stdin: `compacted\n${'x\n'.repeat(19)}` },
      ],
      gen: (rng) => pct(screen(rng)),
    },
  },
};
