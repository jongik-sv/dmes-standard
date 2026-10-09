#!/usr/bin/env node
// free-port.mjs — 빈 TCP 포트 하나를 OS 에서 받아 stdout 에 번호만 한 줄로 낸다. free-port.sh 의 node 판.
// 규칙 정본: ../references/e2e.md 「서버 프로세스」.
//
// E2E 서버는 빈 포트에 직접 띄운다. 번호를 눈으로 고르면 같은 PC 의 다른 팀원 서버와 부딪힌다. 포트 0 에 bind 하면 OS 가
// 지금 비어 있는 포트를 준다.
//
// 사용법
//   PORT=$(node .claude/skills/dflow-dev/scripts/free-port.mjs) || exit 1
//
// 방법
//   1) 포트 0 에 listen 해 받은 번호. 1024~65535 의 숫자가 아니면 다음 방법으로 넘어간다.
//   2) 폴백 — 20000~59999 에서 무작위로 골라 직접 bind 해 보고 비어 있으면 쓴다. 50회 안에 못 찾으면 실패.
// 받은 포트는 곧바로 닫으므로 서버가 bind 하기 전에 남이 가져갈 수 있다(드묾). 서버가 "Address already in use" 로 뜨지 못하면
// 이 스크립트를 다시 불러 새 포트로 띄운다.
//
// exit 0 = 포트를 냈다. exit 1 = 폴백까지 모두 실패(FREE_PORT_FAIL).
// `--help` 는 사용법을 내고 exit 0.
import net from 'node:net';
import fs from 'node:fs';

const out = (s) => { for (;;) { try { fs.writeSync(1, s); return; } catch (e) { if (e.code !== 'EAGAIN') return; } } };
const err = (s) => { for (;;) { try { fs.writeSync(2, s); return; } catch (e) { if (e.code !== 'EAGAIN') return; } } };

const valid = (p) => Number.isInteger(p) && p >= 1024 && p <= 65535;

// 한 번 bind 해 보고 포트 번호를 돌려준다. 못 잡으면 null.
function tryListen(port, host) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.on('error', () => { try { s.close(); } catch {} resolve(null); });
    s.listen(port, host, () => {
      const addr = s.address();
      const got = typeof addr === 'object' && addr !== null ? addr.port : null;
      s.close(() => resolve(got));
    });
  });
}

async function main(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    out('사용: free-port.mjs\n빈 TCP 포트 하나를 stdout 에 번호만 한 줄로 낸다. exit 0 = 성공, 1 = 실패(FREE_PORT_FAIL).\n');
    return 0;
  }
  // 원래 .sh 는 인자를 보지 않는다 — 그 밖의 인자는 무시하고 포트를 낸다.
  const p = await tryListen(0);
  if (p !== null && valid(p)) { out(`${p}\n`); return 0; }

  // 폴백: 무작위 범위 + 직접 bind 확인(node 에 lsof·nc 없이도 된다)
  for (let i = 0; i < 50; i++) {
    const cand = 20000 + Math.floor(Math.random() * 40000);
    const got = await tryListen(cand);
    if (got !== null && got === cand) { out(`${cand}\n`); return 0; }
  }
  err('FREE_PORT_FAIL 빈 포트를 찾지 못했다(50회)\n');
  return 1;
}

main(process.argv.slice(2)).then(
  (rc) => { process.exitCode = rc; },
  (e) => { err(`FREE_PORT_FAIL ${e?.message ?? e}\n`); process.exitCode = 1; },
);
