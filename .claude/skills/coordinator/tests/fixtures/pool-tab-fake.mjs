// tests/fixtures/pool-tab-fake.mjs — pool.mjs 시험용 가짜 탭 드라이버(pool-tab.mjs 와 같은 명령). 환경 COORD_POOL_TAB 으로 쓴다.
//   탭 상태 = <작업 폴더>/.pool/tab-<handle>.{kind,pid,screen,idle,closed,calls}. 워커 = 이 파일을 `worker` 로 띄운 분리 프로세스.
//   워커 동작 = 환경 FAKE_POOL_MODE
//     ok: 보고를 쓰고 화면 `done <id>`, idle · fail: 화면 `boom`, idle, 보고 없음 · ratelimit: 화면 `Error: 429 rate limit`, idle
//     quota0: 화면 `free quota exceeded`, idle · sleep:<초>: 그동안 화면이 계속 바뀐 뒤 ok
//   TUI 처럼 워커는 일을 마쳐도 끝나지 않는다(탭이 닫힐 때 죽음, 안전 상한 60초).
//   FAKE_TAB_OPEN=fail → TAB_FAIL · FAKE_TAB_SEND=fail → SEND_FAIL
//   알림 흉내: `--lane …` 로 부르면 NOTIFY_MARK 에 인자를 남기고 잔다(term-send-safe 대신).
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const [sub, ...rest] = process.argv.slice(2);
const base = (h) => join(process.cwd(), '.pool', `tab-${h}`);
const flag = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : ''; };
const note = (h, s) => appendFileSync(`${base(h)}.calls`, `${s}\n`);

if (sub === '--lane') {
  if (process.env.NOTIFY_MARK) appendFileSync(process.env.NOTIFY_MARK, `${process.argv.slice(2).join(' ')}\n`);
  setTimeout(() => process.exit(0), 8000);
} else if (sub === 'open') {
  if (process.env.FAKE_TAB_OPEN === 'fail') { process.stdout.write('TAB_FAIL screen blank\n'); process.exit(1); }
  const h = `fake-${flag('name')}`;
  writeFileSync(`${base(h)}.kind`, flag('kind'));
  note(h, 'open');
  process.stdout.write(`TAB ${h}\n`);
} else if (sub === 'send') {
  const h = rest[0];
  note(h, `send ${flag('kind')}`);
  if (process.env.FAKE_TAB_SEND === 'fail') { process.stdout.write('SEND_FAIL stale\n'); process.exit(1); }
  const ch = spawn(process.execPath, [SELF, 'worker', h, flag('text')], { cwd: process.cwd(), env: process.env, detached: true, stdio: 'ignore' });
  writeFileSync(`${base(h)}.pid`, String(ch.pid));
  ch.unref();
  process.stdout.write('SENT\n');
} else if (sub === 'screen') {
  const h = rest[0];
  if (existsSync(`${base(h)}.closed`)) process.exit(3);
  process.stdout.write(existsSync(`${base(h)}.screen`) ? readFileSync(`${base(h)}.screen`, 'utf8') : '');
} else if (sub === 'idle') {
  process.stdout.write(existsSync(`${base(rest[0])}.idle`) ? 'idle\n' : 'busy\n');
} else if (sub === 'close-id') {
  note(`fake-pool-${rest[0]}`, 'close-id');
  process.stdout.write('CLOSED_ID 0\n');
} else if (sub === 'close') {
  const h = rest[0];
  note(h, 'close');
  writeFileSync(`${base(h)}.closed`, '');
  try { process.kill(Number(readFileSync(`${base(h)}.pid`, 'utf8'))); } catch { /* 이미 끝남 */ }
  process.stdout.write('CLOSED\n');
} else if (sub === 'worker') {
  const h = rest[0];
  const id = (rest[1].match(/\.pool 폴더의 (\S+)\.md/) || [])[1] || 'none';
  const mode = process.env.FAKE_POOL_MODE || 'ok';
  const screen = (s) => writeFileSync(`${base(h)}.screen`, `${s}\n`);
  const idle = () => writeFileSync(`${base(h)}.idle`, '');
  const ok = () => { writeFileSync(join(process.cwd(), '.pool', `${id}.report.md`), `# ${id}\n완료\n`); screen(`done ${id}`); idle(); };
  setTimeout(() => process.exit(0), 60000);
  if (mode === 'ok') ok();
  else if (mode === 'fail') { screen('boom'); idle(); }
  else if (mode === 'ratelimit') { screen('Error: 429 rate limit'); idle(); }
  else if (mode === 'quota0') { screen('free quota exceeded'); idle(); }
  else if (mode.startsWith('sleep:')) {
    let n = 0;
    const t = setInterval(() => screen(`working ${n += 1}`), 50);
    setTimeout(() => { clearInterval(t); ok(); }, Number(mode.slice(6)) * 1000);
  }
}
