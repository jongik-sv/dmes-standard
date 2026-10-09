# backup — 종전 sh 판

`scripts/*.sh`·`tests/*.sh` 는 2026-10-10 node 전환(dflow-node-1010)으로 퇴역했다. 참조용 기록이므로 실행하지 않는다 — 실행기가 없는 윈도우(PowerShell)에서는 아예 돌지 않는다. 정본은 `../scripts/dflow.mjs`·`dflow-config.mjs`·`dflow-lease.mjs` 이다(호출: `node <스킬>/scripts/dflow.mjs <같은 인자>`). 옛 시험 3개도 같은 이유로 옮겨 두었다.

예외 — `dflow-config.sh` 는 `../scripts/` 에 되돌려 두었다: 사용자 전역 heartbeat 훅(`~/.dflow/hooks/heartbeat.sh`)이 이 파일을 source 한다. 훅이 node 로 바뀌면 다시 이리로 옮긴다.
