// screen-cache.mjs 단위 시험: 시각 대체(at이 숫자 아니면 지금 시각),
// 오래된 파일 prune, 심볼릭 링크 불신, 1MB 상한, kind 불일치.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, existsSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scStore, scLoad, scPrune, scTrusted, scNowMs, scSig } from '../scripts/lib/screen-cache.mjs';

const HEX64 = 'ab'.repeat(32);
const setup = () => {
  const work = mkdtempSync(join(tmpdir(), 'sc-test-'));
  const home = join(work, 'home');
  mkdirSync(join(home, '.dflow', 'console', 'screen'), { recursive: true, mode: 0o700 });
  const env = { ...process.env, HOME: home, DFLOW_CONSOLE_DIR: '', SC_TTL: '20', COMPAT_FORCE_OS: 'unix' };
  return { work, home, env };
};
const scr = (home, text) => { const p = join(home, 'scr.txt'); writeFileSync(p, text); return p; };

test('sc_now_ms: 13자리 숫자', () => {
  const v = scNowMs();
  assert.match(v, /^[0-9]{13}$/);
  assert.ok(Math.abs(Number(v) - Date.now()) < 2000);
});

test('sc_store: at이 숫자 아니면 지금 시각으로 저장한다', () => {
  const { home, env } = setup();
  const r = scStore('h1', scr(home, 'out\nDo you want to proceed?\n'), 'abc', '', env);
  assert.equal(r.rc, 0);
  assert.equal(r.globals.SC_STORED_KIND, 'permission');
  const doc = JSON.parse(readFileSync(join(home, '.dflow', 'console', 'screen', 'h1.json'), 'utf8'));
  assert.ok(Math.abs(doc.read_at_ms - Date.now()) < 5000);
});

test('sc_store: 실패하면 낡은 캐시까지 지우고 rc 1', () => {
  const { home, env } = setup();
  const d = join(home, '.dflow', 'console', 'screen');
  writeFileSync(join(d, 'h9.txt'), 'old');
  const r = scStore('.bad', join(home, 'scr.txt'), '1', '', env);
  assert.equal(r.rc, 1);
  assert.equal(r.globals.SC_STORED_KIND, '');
});

test('sc_prune: 오래된 파일만 지운다', () => {
  const { home, env } = setup();
  const d = join(home, '.dflow', 'console', 'screen');
  const old = join(d, 'old.txt'), fresh = join(d, 'fresh.txt');
  writeFileSync(old, 'x'); writeFileSync(fresh, 'y');
  const past = new Date(Date.now() - 20 * 60000);
  utimesSync(old, past, past);
  assert.equal(scPrune('10', env), 0);
  assert.equal(existsSync(old), false);
  assert.equal(existsSync(fresh), true);
});

test('sc_trusted: 심볼릭 링크는 불신한다', () => {
  const { home, env } = setup();
  const d = join(home, '.dflow', 'console', 'screen');
  const real = join(d, 'real.json');
  writeFileSync(real, '{}', { mode: 0o600 });
  const link = join(d, 'link.json');
  symlinkSync(real, link);
  assert.equal(scTrusted(link, env), false);
});

test('sc_load: txt가 1MB를 넘으면 rc 1', () => {
  const { home, env } = setup();
  const d = join(home, '.dflow', 'console', 'screen');
  writeFileSync(join(d, 'h1.txt'), 'x'.repeat(1048577), { mode: 0o600 });
  writeFileSync(join(d, 'h1.json'), '{"kind":null,"read_at_ms":1791500000000,"lines":1}\n', { mode: 0o600 });
  const r = scLoad('h1', env);
  assert.equal(r.rc, 1);
});

test('sc_load: kind가 화면과 다르면 rc 1', () => {
  const { home, env } = setup();
  const d = join(home, '.dflow', 'console', 'screen');
  writeFileSync(join(d, 'h1.txt'), 'plain text\n', { mode: 0o600 });
  writeFileSync(join(d, 'h1.json'), '{"kind":"permission","read_at_ms":1791500000000,"lines":1}\n', { mode: 0o600 });
  const r = scLoad('h1', { ...env, SC_TTL: '99999999' });
  assert.equal(r.rc, 1);
});

test('sc_sig: 줄바꿈만 든 파일은 빈 값으로 rc 1', () => {
  const { home, env } = setup();
  const d = join(home, '.dflow', 'console', 'screen');
  writeFileSync(join(d, 'h1.json'), '\n\n', { mode: 0o600 });
  const r = scSig('h1', { ...env, COMPAT_FORCE_OS: 'windows' });
  assert.equal(r.rc, 1);
});
