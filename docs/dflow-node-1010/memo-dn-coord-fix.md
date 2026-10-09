# dn-coord-fix 정본 메모

- 브랜치: chore/dn-coord-fix · 기준 dev 5d5e25c3c · 조정 세션 dmes-standard-87
- 상태: 항목 1~4 구현·시험 완료, 항목 5(머지 요청)는 dn-work·dn-team·dn-heavy 머지 뒤
- 방식: `execFor`(.mjs → node, 그 밖 → bash)로 office.mjs·console-poll.mjs·console-resolve.mjs·heavy 호출부(close-lane·coord-status·idle-check·stall-check·measure-window) 전환
- 기본 경로: dflow.mjs · lead-state.mjs. 설정·COORD_LEAD_STATE 가 .sh 를 주면 bash 로 실행
- auto-answer.mjs: `node|bash|sh …/heavy.(sh|mjs)` 모두 분류
- 남은 결정: `_shared/bin/README.md` 36줄의 dflow.sh `_jok` jq 언급은 과거 사실이라 치환하지 않음
- 남은 순서: 세 레인 머지 확인 → dev 최신 합침 → 머지 요청 → 허가 뒤 머지·정리
