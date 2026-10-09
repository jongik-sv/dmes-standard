// 권한 창의 「automatically deny this request in m:ss」 카운트다운 줄이 창 지문에서 빠졌는지 확인한다(node --test).
//   1) 카운트다운만 다른 두 화면의 지문(console_full_sha)이 같고, 명령이 다르면 다르다(bash 판·node 판 모두).
//   2) 재현: 판단 시점(0:09) 지문을 --expect-sha 로 주고 지금 화면이 0:04 인 상태에서 term-send-safe --raw --lane 이 SENT 한다(예전엔 prompt-changed).
// 가짜 orca·임시 HOME 만 쓴다. 실제 orca·~/.coord·~/.dflow 는 건드리지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SD = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const screen = (cmd, cd) => ['╭──────────────────────╮', ' Bash command', `   ${cmd}`, ' Do you want to proceed?', ' ❯ 1. Yes', '   2. No', `     will automatically deny this request in ${cd}`, ' Esc to cancel · Tab to amend'].join('\n') + '\n';

function setup() {
  const tmp = mkdtempSync(join(tmpdir(), 'cdown-'));
  const dirs = ['bin', 'repo', 'home', 'state/r1', 'cons', 'term'];
  for (const d of dirs) mkdirSync(join(tmp, d), { recursive: true });
  chmodSync(join(tmp, 'cons'), 0o700);
  writeFileSync(join(tmp, 'repo/.coord.local.json'), JSON.stringify({ state_dir: join(tmp, 'state'), terminal_backend: 'orca' }));
  writeFileSync(join(tmp, 'state/current'), 'r1\n');
  writeFileSync(join(tmp, 'state/r1/state.json'), JSON.stringify({ schema: 1, run: { id: 'r1', closed_at: null, coordinator: { session_id: '', pid: 0, handle: '' } }, lanes: { kit: { state: 'active', session: { handle: 'hk' } } }, office: {} }));
  writeFileSync(join(tmp, 'bin/orca'), `#!/bin/sh
echo "$*" >> "$FAKE_DIR/orca.log"
sub="$2"
case "$sub" in
  list) echo '{"ok":true,"result":{"terminals":[{"handle":"hk","title":"","worktreePath":""}]}}' ;;
  read) jq -Rnc '[inputs] | {ok:true,result:{terminal:{tail:.}}}' < "$FAKE_DIR/screen.txt" ;;
  send) echo "send" >> "$FAKE_DIR/send.log"; echo '{"ok":true,"result":{"send":{"accepted":true}}}' ;;
  *) echo '{"ok":true,"result":{}}' ;;
esac
`);
  chmodSync(join(tmp, 'bin/orca'), 0o755);
  const env = { ...process.env, HOME: join(tmp, 'home'), COORD_REPO: join(tmp, 'repo'), COORD_RUN: 'r1', COORD_STATE_ROOT: join(tmp, 'state'), DFLOW_CONSOLE_DIR: join(tmp, 'cons'), FAKE_DIR: join(tmp, 'term'), PATH: `${join(tmp, 'bin')}:${process.env.PATH}` };
  for (const k of ['ORCA_TERMINAL_HANDLE', 'CLAUDE_PID', 'COORD_SESSION_ID', 'CLAUDE_CODE_SESSION_ID', 'DFLOW_CONFIG_DIR', 'COORD_DRY']) delete env[k];
  return { tmp, env };
}
const fullSha = (env, text) => {
  const r = spawnSync('bash', ['-c', '. "$1/lib/common.sh"; . "$1/lib/console-input.sh"; console_full_sha', '_', SD], { env, input: text, encoding: 'utf8' });
  return r.stdout.trim();
};

for (const [label, extra] of [['bash 판', {}], ['node 판(COORD_JS_CONSOLE_INPUT=1)', { COORD_JS_CONSOLE_INPUT: '1' }]]) {
  test(`지문: 카운트다운만 달라도 같고 명령이 다르면 다르다 — ${label}`, () => {
    const { env } = setup();
    const e = { ...env, ...extra };
    const a = fullSha(e, screen('git status', '0:09'));
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(fullSha(e, screen('git status', '0:04')), a);
    assert.equal(fullSha(e, screen('git status', '10:00')), a);
    assert.notEqual(fullSha(e, screen('git push --force', '0:09')), a);
  });
  test(`재현: 카운트다운이 바뀐 화면에서도 term-send-safe --raw --lane --expect-sha 가 SENT — ${label}`, () => {
    const { tmp, env } = setup();
    const e = { ...env, ...extra };
    const jsha = fullSha(e, screen('git status', '0:09'));
    writeFileSync(join(tmp, 'term/screen.txt'), screen('git status', '0:04'));
    const r = spawnSync('bash', [join(SD, 'term-send-safe.sh'), '--lane', 'kit', '--text', '1', '--raw', '--expect-sha', jsha], { env: e, encoding: 'utf8' });
    assert.match(r.stdout, /^SENT hk /, `stdout=${r.stdout} stderr=${r.stderr}`);
    assert.equal(readFileSync(join(tmp, 'term/send.log'), 'utf8').trim(), 'send');
  });
  test(`대조: 명령이 바뀐 화면은 여전히 prompt-changed — ${label}`, () => {
    const { tmp, env } = setup();
    const e = { ...env, ...extra };
    const jsha = fullSha(e, screen('git status', '0:09'));
    writeFileSync(join(tmp, 'term/screen.txt'), screen('git push --force', '0:04'));
    const r = spawnSync('bash', [join(SD, 'term-send-safe.sh'), '--lane', 'kit', '--text', '1', '--raw', '--expect-sha', jsha], { env: e, encoding: 'utf8' });
    assert.match(r.stdout, /^REFUSED hk prompt-changed/, `stdout=${r.stdout}`);
  });
}
