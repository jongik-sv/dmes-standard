# coord-office 레인 정본 메모

- 브랜치: `feat/coord-office` (dmes-standard) · `feat/office-temp-lane` (wbs-web, 워크트리 `/Users/jji/project/wbs-web-wt/office-temp-lane`) / 조정: dmes-standard-90 / 지시: coord-office-1·2
- 갱신: 2026-10-06
- 요청: 조정자 스킬로 도는 세션을 에이전트 오피스에 「임시 작업」으로 보이게 한다. 팀장은 조정 세션, 팀원은 레인이다. WBS 데이터(Task·lease·진도율)는 바꾸지 않는다(표시 전용).

## 설계 요약
- 표시 경로: 기존 `POST /api/v1/agent/watch`(agent_watchers, PAT)만 쓴다. 서버 API·DB·마이그레이션 변경 없음.
- 팀장 키 `<신원>/<host>/coord:<run-id>`, slots=레인 수, busy=작업 중 레인 수.
- 팀원 키 `<신원>/<host>/임시:<레인>·<지시 요약>`, until=상태(`작업 중`·`대기`·`머지 중`·`끝`). 첫 `·` 가 레인과 요약의 경계이고 요약에는 슬래시가 없다. 계약은 coordinator `references/contract.md` §4.
- 요약이 바뀌면 옛 키를 먼저 stop 한 뒤 새 키로 등록한다(`.office.sent` 에 마지막 키 기록). 하트비트는 tick.sh 끝의 `office.sh beat` 가 같은 키로 재전송한다.
- 실패는 조정자를 막지 않는다(종료 코드 0, stdout 계약 불변, 호출당 5초). dflow 설정(PAT)이 없으면 조용히 건너뛴다. 설정은 `.coord.json` 의 `office`(enabled 기본 켬, project_id, label_max, dflow_script).

## 진도
- 1단계 킷(office.sh + 호출 연결): 완료. 커밋 d6c72ddc · 9f4dfeb0 · 4045fb19. 시험 office-sh 91/0, term-send-safe 8, deps-sh 32, merge-gate 11.
- 2단계 wbs-web 표시 코드(「임시 팀원」 책상·상태 배지·「팀장(조정)」·STANDBY/감시 문자열 제외): 완료. 커밋 dedd2aa6 · 24b57949. vitest 영향 범위 2107건 통과, src tsc 오류 0.
- 리뷰: sonnet/high 1회. 킷 결함 6건(옛 키 stop 실패·finish 중단·후손 kill·rc 2 거절·닫힌 레인 늦은 보고·coord 키 충돌) 반영, wbs-web 결함 없음.
- 배포본 실표시(1단계만): lead-up·beat 성공, 감시자 책상 2개 확인. 팀장/팀원 구분은 2단계 배포가 있어야 된다.

## 남은 일
1. dmes-standard 머지(조정 허가 뒤), wbs-web push·Vercel 배포는 사용자 결정.
2. 2단계 배포 뒤 화면 확인: 「임시 팀원」 배지·「팀장(조정)」·「회차 <id>」 문구·`line-clamp-2` 모양.
3. 알려 둔 위험: 마감 때 stop 이 실패하면 그 행은 TTL 70분까지 남는다. 느린 서버에서 beat 는 최악 레인 수 × 5초.
4. 현재 회차 레인에는 state 의 `brief` 가 없어 `임시:<레인>` 으로만 보인다. 조정자가 `lane-add` 때 `"brief":"한 줄"` 을 넣어야 요약이 나온다.
