# 마감

설계 절: §3.h.

- 진입: `/coordinator finish`, 또는 틱에서 모든 레인 항목 done + 머지·정리·측정 완료 확인
- 사용자가 「끝까지」 지시 → 0~6 을 질문 없이 연속 실행
- 한도로 멈췄으면 첫 보고에 시각 근거와 함께 밝힘

## 0. 화면 프로파일링

- 대상 회차: 화면 레인(`src/frontend` 의 `m-*` 화면 변경)이 dev 에 머지된 회차
  - 화면 레인이 없으면 건너뜀
- 횟수: 회차당 한 번(2026-10-09 사용자 지시). 레인 작업 중에는 측정 안 함
- 시점: 모든 레인 머지·정리 완료 뒤, §1 확인 전
- 맡는 쪽: 조정자가 측정 담당 레인 하나에 지시
  - 보통 `scripts/perf/render/screens.mjs` 를 맡은 레인
  - 그 레인이 닫혔으면 새 레인(sonnet)
- 절차
  1. `node scripts/measure-window.mjs open measure --lane <측정 레인> --until <지금+30분> --hold-heavy`
  2. 다른 레인에 `무거운 작업 금지` 통지
  3. 측정 레인 지시 내용:
     - 대상: 회차에서 바뀐 화면 중 `screens.mjs` 등록 화면
     - 빌드: shared → 형제 패키지 dist → `next build --profile --no-mangling`
     - 서버: `next start -p 5300`
     - 측정: `RENDER_SCREENS=<id,…> PERF_OUT=<저장소 밖> node scripts/perf/render/count-renders.mjs`
     - 판정 기준: `docs/guide/FrontEnd/Screen-Performance-Guide.md` §5 주 기준
       - 상세 폼 입력 한 글자: 화면 루트 렌더 0회, 그리드 셀 재렌더 0회
       - 행 클릭: 포털 셸 재렌더 0회(선택 행 snapshot 요구 시 1회)
     - 끝나면: 서버 종료, 일반 `next build` 로 복귀, 「남은 백그라운드 0」
     - 보고: `측정 끝` + 화면별 동작당 커밋 수·위반 목록
  4. `측정 끝` 수신 → `node scripts/measure-window.mjs close` → 전 레인 `무거운 작업 재개`
- 위반 있음 → 해당 화면 수정 항목 추가 → 머지 뒤 그 화면만 다시 측정(한 번)
- 시간 상한 30분. 넘으면 측정을 멈추고 결과까지만 마감 보고(§5)에 기재
- 등록 안 된 화면 → 측정 생략, 마감 보고에 「미등록 화면」 목록

## 1. 마감 조건

- 모든 레인 항목 done(마감 단계 포함), 머지·정리 완료, 측정 종료
  - `node scripts/coord-state.mjs progress` 가 `PROGRESS ALL 100%` 인지 확인
- 열린 창 없음: `node scripts/measure-window.mjs status` 가 `WINDOW none`
- `merge.in_flight` 비어 있음

## 2. 통합 확인

- 조정자만 수행: dev 로 서버 재기동, 주요 화면 확인
- 방법 = 설정 `integration_check` 문장. 비어 있으면 사용자에게 방법을 물음
- 이 문서에 도구 이름 기재 금지
- 끝나면 열었던 브라우저 작업 공간을 반드시 닫음

## 3. SUMMARY

- 레인 기록 문서(구조·성능) + 레인 요약 초안 → `SUMMARY.md` 하나로 정리
- 초안 수집 = 임시 워커(sonnet/medium), 조정자가 대조
- 위치 기본 = 레인 공통 규칙 문서와 같은 폴더
- 커밋은 사용자 지시가 있을 때만

## 4. 정리 확인

- 워크트리·브랜치 잔존: `git_bin worktree list`, `git_bin branch`
- Orca 터미널 목록, reclaimable 워커
- 안 끝난 세션 → `spawn.md` 5 절차로 닫음(`close-lane.mjs`)
- 레인 정리 완료 보고에 「남은 백그라운드 0」(시험 입력·성능 측정·로컬 DB·고아 `awk` 등) 있는지 확인
  - 없음 → 되묻고, `ps` 로 그 레인 워크트리를 cwd 로 둔 프로세스 확인(`heavy.md` §7)
- 감시 cron 삭제: state `run.cron_id` 로 `CronDelete`, 이어 `node scripts/coord-state.mjs set '.run.cron_id' null`
- 측정·금지 창 모두 닫힘(`node scripts/measure-window.mjs status`), `load.banned` 비어 있음
- `wake_targets` 갱신 필요 여부
- 임시 파일·잠금 정리 = 스크립트가 만든 것만. 삭제가 필요한 것은 사용자 결정 목록으로

## 5. 마감 보고(판단 올리기)

- 결정·후속 정리 = `opus` / `high` 서브에이전트
- 넘길 것: `summary.md`, `events.jsonl` 의 결정 이벤트, `merge.history`, `pending_user`, 백로그
- 아래 칸으로 정리시킴

| 칸 | 내용 |
|---|---|
| 머지 목록 | 레인별 머지 커밋 해시와 트리 |
| 진도 100% 근거 | 레인별 완료 항목과 마지막 시험 결과 |
| 조정자가 내린 결정 | 사용자에게 알릴 것(`decisions[]`: 머지 순서, 전용 칸 허용, GLM 대체 등) |
| 사용자 결정 대기 목록 | 삭제 후보 브랜치·DB 잔여 행·남긴 워크트리 등(`pending_user`). 조정자는 삭제 금지 |
| 후속 후보 | 남은 개선·미확인·반복 사고(정지, 확인 창) |
| 대체 사실 | GLM 일을 Sonnet 으로 띄움, 사용량 띠로 일을 줄임, 기록 근거가 낮음(추정) |

- 보고는 사용자에게 직접
- 요약본은 `summary.md` 에 남김(`node scripts/coord-state.mjs summary`)
- 이 스킬의 개선 후보(사용 중 관찰한 불편)가 있으면 마감 보고에 한 단락

## 6. 닫기

- 마지막에 `node scripts/coord-state.mjs close-run` 호출(`event run-closed - '{}'` 도 같은 함수)
  - run-closed 이벤트 기록
  - `node scripts/office.mjs finish` 로 오피스에서 이 회차 팀원 표시 제거
  - `.run.closed_at` 에 마감 시각 기록(`contract.md` §3.4·§4)
  - 팀장 칸 = 조정 세션 단위(`coord:<세션8>`)
    - 같은 세션에 다른 열린 회차가 있음 → 내리지 않고 slots·busy 만 재합산
    - 이 세션의 마지막 열린 회차를 닫을 때만 내림
  - 이 명령을 빼면 회차가 열린 채 남아 팀장 칸 slots·busy 에 계속 합산됨
  - 조정 세션이 죽으면 PC 폴러의 `node scripts/office.mjs reap` 이 표시를 내림
- `.run.state` 같은 칸을 직접 써서 마감 표시 금지(계약에 없는 칸, 동작 없음)
- 마감 못 한 채 새 회차를 시작함 → `init` 이 낸 `SESSION_RUNS <세션8> open=<n>` 줄(같은 세션의 열린 회차, 자동 마감 없음) 확인
  - 끝난 회차를 `COORD_RUN=<회차> node scripts/coord-state.mjs close-run` 으로 직접 닫음
- `STALE_RUN` 줄(init·틱) = 다른 조정 세션 회차 경고뿐. 진행 중이면 그대로 둠
- 조정자 세션은 사용자가 닫음. state 폴더는 지우지 않음(다음 회차 근거)

## 7. 반영 빌드·push·배포(조정자가 묻지 않고 실행)

머지를 트리 대조로 확인한 뒤 조정자가 판단해 실행:
- (a) 실행 중 로컬 서버 반영용 빌드(리포 문서·설정이 정한 방법, 예: watch 없는 형제 패키지 dist 단발 빌드)
- (b) 통합 브랜치 push, 릴리스 브랜치 반영

규칙:
- 시점 = 머지 묶음 뒤 또는 회차 마감 때 조정자가 결정
- 사용자 결정 목록에 빌드·push 시점을 올리지 않음
- 설정 `merge.auto_build`·`merge.auto_push`(기본 true)가 false → 해당 단계 건너뛰고 마감 보고에 남은 일로 기재
- 아래 어느 형식인지 리포 문서·각 PC 설정으로 확인 후 순서대로 실행
- 통합 브랜치 = 설정 `integration_branch`. 릴리스 브랜치·원격 이름 = 리포 문서(이 문서에 기재 금지)
- push 전 확인: 머지 트리 대조 일치, 머지 뒤 빌드·시험 통과. 실패 → 멈추고 보고
- 통합 브랜치 push 가 fast-forward 가 아니거나 어느 단계든 거절·충돌 → 강제 push 금지, 멈추고 사용자에게 알림
  - 예외: 형식 2 의 릴리스 반영 머지 커밋(이 절차 자체)
- 삭제와 `--force` 금지. 단 조정자가 이 절차로 만든 임시 워크트리를 `--force` 없이 지우는 것은 허용

형식:

1. **fast-forward 가 되는 리포**: 통합 브랜치에 머지 → `push origin <통합>` → `push origin <통합>:<릴리스>`(fast-forward 만)
2. **릴리스 브랜치에 반영 머지 커밋이 따로 쌓여 fast-forward 불가인 리포**
   - 단계 브랜치 push
   - 임시 워크트리 생성, `origin/<릴리스>` 수신, `merge --no-ff origin/<단계>`
   - push
   - 그 임시 워크트리 삭제(만든 것만, `--force` 없이)
3. **마이그레이션이 든 배포**
   - 단계 환경에 적용
   - 읽기 전용 검증 SQL 실행(레인이 작성)
   - 「단계 검증됨」 표식 빈 커밋(문구는 리포 규칙)
   - 운영 환경에 적용
   - 같은 검증
   - 릴리스 브랜치 반영
   - 검증 SQL 이 없으면 레인에게 먼저 작성시킴
   - 환경 접속 정보는 문서·지시문에 기재 금지(각 PC 설정)

push 뒤:
- 그 사실을 `merge.history`·마감 보고에 기재
- 메인 체크아웃의 사용자 미커밋 파일 미접촉 확인: `git status --short`(`merge-gate.md` 2.1)
