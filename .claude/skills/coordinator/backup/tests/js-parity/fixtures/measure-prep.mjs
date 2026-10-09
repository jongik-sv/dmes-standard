// measure-window 대조 래퍼 공통(준비): 작업 폴더의 `.jobs.json`([{id, kind}])대로 잡 폴더(<WORK>/jobs/<id>)를 만들고 시험이 띄운 `sleep 300` 만 가리키게 한다.
//   kind: live(pid·pstart 일치) · runlive(runpid 와 pid 둘 다 일치) · mismatch(pid 는 살아 있으나 pstart 가 다름) · dead(없는 pid) · done(rc 파일) · nopid(빈 폴더)
//   띄운 pid 는 `.spawned.json` 에 적어 두고 dump 가 살아 있는지 보고 남은 것을 정리한다(시험이 띄운 sleep 만 죽인다).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

if (existsSync('.jobs.json')) {
  const jobs = JSON.parse(readFileSync('.jobs.json', 'utf8'));
  const spawned = {};
  const lstart = (pid) => (spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { env: { ...process.env, LC_ALL: 'C' }, encoding: 'utf8' }).stdout || '').trim();
  const sleeper = () => { const ch = spawn('sleep', ['300'], { detached: true, stdio: 'ignore' }); ch.unref(); return ch.pid; };
  for (const { id, kind } of jobs) {
    const d = `jobs/${id}`;
    mkdirSync(d, { recursive: true });
    if (kind === 'done') writeFileSync(`${d}/rc`, '0\n');
    else if (kind === 'live' || kind === 'runlive' || kind === 'mismatch') {
      const p = sleeper();
      spawned[`${id}:pid`] = p;
      writeFileSync(`${d}/pid`, `${p}\n`);
      writeFileSync(`${d}/pstart`, kind === 'mismatch' ? 'Mon Jan  1 00:00:00 2001\n' : `${lstart(p)}\n`);
      if (kind === 'runlive') {
        const r = sleeper();
        spawned[`${id}:runpid`] = r;
        writeFileSync(`${d}/runpid`, `${r}\n`);
        writeFileSync(`${d}/runpstart`, `${lstart(r)}\n`);
      }
    } else if (kind === 'dead') { writeFileSync(`${d}/pid`, '999999\n'); writeFileSync(`${d}/pstart`, 'Mon Jan  1 00:00:00 2001\n'); }
  }
  writeFileSync('.spawned.json', JSON.stringify(spawned));
}
