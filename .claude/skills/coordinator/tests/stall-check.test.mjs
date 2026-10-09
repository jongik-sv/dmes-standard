// stall-check.mjs 순수 로직 단위 시험(node --test). 기대값은 /usr/bin/cksum, awk 로 확인한 것이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cksum, cpuDelta, cpuSeconds, psRows } from '../scripts/stall-check.mjs';

test('cksum: POSIX CRC-32 (cksum 명령과 같은 값)', () => {
  assert.equal(cksum(Buffer.from('')), '4294967295');
  assert.equal(cksum(Buffer.from('a\n')), '2418082923');
  assert.equal(cksum(Buffer.from('hello world')), '1135714720');
});

test('cpuSeconds: D-HH:MM:SS · H:MM:SS · MM:SS.ss', () => {
  assert.equal(cpuSeconds('0:05.00'), 5);
  assert.equal(cpuSeconds('1:02:03'), 3723);
  assert.equal(cpuSeconds('1-02:03:04.5'), 86400 + 7384.5);
  assert.equal(cpuSeconds('12:34.56'), 754.56);
});

test('psRows: pid ppid time args', () => {
  const rows = psRows('  100     1   0:05.00 /bin/claude --session\n  200   100   1:02:03 java -jar a.jar\n');
  assert.deepEqual(rows.map((r) => [r.pid, r.ppid, r.cpu, r.args]), [['100', '1', '5.00', '/bin/claude --session'], ['200', '100', '3723.00', 'java -jar a.jar']]);
});

test('cpuDelta: 늘어난 합(새 pid 는 전부 증가, 줄어든 것은 0)', () => {
  assert.equal(cpuDelta('1:1.00,2:5.00', '1:1.50,2:4.00,3:0.40'), '0.9');
  assert.equal(cpuDelta('', '7:3.00'), '3.0');
  assert.equal(cpuDelta('7:3.00', ''), '0.0');
});
