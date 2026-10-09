// 표본 모듈의 node 판(새 모듈의 틀). 규칙: 함수 표 한 개 + 끝의 cliMain 한 줄.
import { chmodSync, writeFileSync } from 'node:fs';
import { cliMain, isMain } from '../../../scripts/lib/js-cli.mjs';

export const functions = {
  smp_upper: { stdin: true, run: ({ stdin }) => (stdin.length ? { out: Buffer.from(stdin.toString('latin1').replace(/[a-z]/g, (c) => c.toUpperCase()), 'latin1') } : { rc: 1 }) },
  smp_pair: { run: ({ args }) => ({ out: String((args[0] ?? '').length + (args[1] ?? '').length), globals: { SMP_A: args[1] ?? '', SMP_B: args[0] ?? '' } }) },
  smp_write: { run: ({ args }) => {
    if (!args[0] || args[0].includes('/')) return { rc: 1 };
    writeFileSync(`${args[0]}.txt`, 'hi'); chmodSync(`${args[0]}.txt`, 0o600);
  } },
};
if (isMain(import.meta.url)) cliMain(functions);
