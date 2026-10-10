// tests/fixtures/pool-worker.mjs — pool.mjs 시험용 가짜 워커. 인자 = 지시문 하나. 동작 = 환경 FAKE_POOL_MODE
//   ok: .pool/<id>.report.md 를 쓰고 rc 0 · fail: rc 3 · ratelimit: "429 rate limit" 출력, rc 1 · quota0: "quota exceeded" 출력, rc 0, 보고 없음
//   sleep:<초>: 그만큼 잔 뒤 ok
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// 알림 흉내: pool.mjs 가 term-send-safe 대신 이 파일을 인자 `--lane ...` 로 부르면 표식 파일에 인자를 남기고 오래 잔다.
if (process.argv[2] === '--lane') {
  if (process.env.NOTIFY_MARK) appendFileSync(process.env.NOTIFY_MARK, `${process.argv.slice(2).join(' ')}\n`);
  setTimeout(() => process.exit(0), 8000);
} else {
const prompt = process.argv[2] || '';
const id = (prompt.match(/\.pool 폴더의 (\S+)\.md/) || [])[1] || 'none';
const mode = process.env.FAKE_POOL_MODE || 'ok';
const ok = () => { writeFileSync(join(process.cwd(), '.pool', `${id}.report.md`), `# ${id}\n완료\n`); process.stdout.write(`done ${id}\n`); process.exit(0); };
if (mode === 'ok') ok();
else if (mode === 'fail') { process.stdout.write('boom\n'); process.exit(3); }
else if (mode === 'ratelimit') { process.stdout.write('Error: 429 rate limit\n'); process.exit(1); }
else if (mode === 'quota0') { process.stdout.write('free quota exceeded\n'); process.exit(0); }
else if (mode.startsWith('sleep:')) setTimeout(ok, Number(mode.slice(6)) * 1000);
else process.exit(9);
}
