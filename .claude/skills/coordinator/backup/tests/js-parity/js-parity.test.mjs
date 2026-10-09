// node --test tests/js-parity 로 도는 짧은 대조(명세마다 함수당 SAMPLE 건). 길게 돌릴 때는 run.mjs --cases N 을 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { COORD_ROOT, loadSpec, runParity } from './lib.mjs';

const SAMPLE = Number(process.env.JS_PARITY_SAMPLE || 60);
const HAS_BASH = spawnSync('bash', ['-c', 'true'], { stdio: 'ignore' }).status === 0;
const mods = readdirSync(join(COORD_ROOT, 'tests', 'js-parity', 'specs')).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4));

for (const m of mods) {
  test(`js-parity ${m}: bash 판과 mjs 판이 같다(함수당 ${SAMPLE}건)`, { skip: HAS_BASH ? false : 'bash 없음', timeout: 600000 }, async () => {
    const rep = await runParity(await loadSpec(m), { cases: SAMPLE });
    assert.equal(rep.diffs.length, 0, rep.diffs.join('\n'));
    assert.ok(rep.total > 0);
  });
}

for (const m of mods) {
  test(`js-parity ${m}: 스위치 끔(bash 본문)과 켬(node 판)이 같다(함수당 ${Math.ceil(SAMPLE / 2)}건)`, { skip: HAS_BASH ? false : 'bash 없음', timeout: 600000 }, async () => {
    const rep = await runParity(await loadSpec(m), { cases: Math.ceil(SAMPLE / 2), viaSwitch: true });
    assert.equal(rep.diffs.length, 0, rep.diffs.join('\n'));
  });
}

test('js-parity 하니스 자체: 일부러 다른 mjs 를 주면 차이를 잡는다', { skip: HAS_BASH ? false : 'bash 없음' }, async () => {
  const spec = await loadSpec('console-redact');
  // 같은 함수에 틀린 CLI 모드를 연결(text 함수에 screen 모드)하면 차이가 나야 한다
  const broken = { ...spec, functions: { console_redact_text: { ...spec.functions.console_redact_text, js: ['sha'] } } };
  const rep = await runParity(broken, { cases: 20 });
  assert.ok(rep.diffs.length > 0, '틀린 연결을 잡지 못했다');
});
