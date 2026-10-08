// term.mjs 중 하니스가 못 보는 것: 키 이름 판정(bad-key는 orca를 부르지 않는다), 목록 밖 백엔드 rc 127.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MJS = new URL('../scripts/lib/term.mjs', import.meta.url).pathname;
const run = (args, env = {}) => spawnSync(process.execPath, [MJS, ...args], {
  env: { ...process.env, COORD_REPO: mkdtempSync(join(tmpdir(), 'term-test-')), ...env },
  encoding: 'utf8',
  windowsHide: true,
});

test('term_send_keys: 목록 밖 키는 error bad-key(orca 미호출·rc 0)', () => {
  for (const keys of [['h', 'F1'], ['h'], ['h', 'Up', 'nope']]) {
    const r = run(['term_send_keys', ...keys]);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, 'error bad-key\n');
  }
});

test('term_send_keys: 정상 키는 orca를 부른다(가짜 orca 없으면 error unknown)', () => {
  const r = run(['term_send_keys', 'h', 'Up', 'Enter', '9']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^(accepted|submitted|turn_started|stale|error )/);
});

test('목록 밖 백엔드는 rc 127', () => {
  const d = mkdtempSync(join(tmpdir(), 'term-be-'));
  writeFileSync(join(d, '.coord.json'), '{"terminal_backend":"bogus"}');
  for (const fn of ['term_list', 'term_read_screen', 'term_send', 'term_close', 'term_send_keys', 'term_wait_idle']) {
    const r = run([fn, 'h'], { COORD_REPO: d });
    assert.equal(r.status, 127, fn);
  }
});
