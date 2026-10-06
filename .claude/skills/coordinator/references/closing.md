# 마감

설계 절: §3.h.

`/coordinator finish` 일 때, 또는 모든 레인 항목이 done 이고 머지·정리·측정이 끝난 것이 틱에서 확인될 때 이 문서를 탄다. 사용자가 「끝까지」 를 지시했으면 1~6 을 질문 없이 잇는다. 한도로 멈췄다면 첫 보고에 시각 근거와 함께 밝힌다.

## 1. 마감 조건

- 모든 레인 항목 done(마감 단계 항목 포함), 머지·정리 완료, 측정 끝. `coord-state.sh progress` 가 `PROGRESS ALL 100%` 인지 본다.
- 열린 창이 없다(`measure-window.sh status` 가 `WINDOW none`).
- `merge.in_flight` 가 비어 있다.

## 2. 통합 확인

dev 로 서버를 재기동하고 주요 화면을 확인한다(조정자만). 방법은 설정 `integration_check` 문장을 따른다. 비어 있으면 사용자에게 방법을 묻는다. 이 문서에 도구 이름을 적지 않는다. 끝나면 열었던 브라우저 작업 공간을 반드시 닫는다.

## 3. SUMMARY

레인 기록 문서(구조·성능)와 레인이 쓴 요약 초안을 모아 `SUMMARY.md` 하나로 정리한다. 초안 모으기는 임시 워커(sonnet/medium)에 맡기고 조정자가 대조한다. 위치는 레인 공통 규칙 문서와 같은 폴더가 기본이다. 커밋은 사용자 지시가 있을 때 한다.

## 4. 정리 확인

- 워크트리·브랜치 목록에 남은 것(`git_bin worktree list`, `git_bin branch`).
- Orca 터미널 목록과 reclaimable 워커.
- 끝나지 않은 세션은 `spawn.md` 5 절차로 닫는다(`close-lane.sh`).
- 감시 cron 삭제: state `run.cron_id` 로 `CronDelete`, `coord-state.sh set '.run.cron_id' null`.
- 측정·금지 창이 모두 닫혔는지(`measure-window.sh status`), `load.banned` 가 비었는지.
- `wake_targets` 갱신이 필요한지.
- 임시 파일·잠금 정리는 스크립트가 만든 것만 한다. 삭제가 필요한 것은 사용자 결정 목록으로 올린다.

## 5. 마감 보고(판단 올리기)

결정·후속 정리는 `opus` / `high` 서브에이전트에 올린다. 서브에이전트에는 `summary.md`, `events.jsonl` 의 결정 이벤트, `merge.history`, `pending_user`, 백로그를 넘기고 아래 칸으로 정리하게 한다.

| 칸 | 내용 |
|---|---|
| 머지 목록 | 레인별 머지 커밋 해시와 트리 |
| 진도 100% 근거 | 레인별 완료 항목과 마지막 시험 결과 |
| 조정자가 내린 결정 | 사용자에게 알릴 것(`decisions[]`: 머지 순서, 전용 칸 허용, GLM 대체 등) |
| 사용자 결정 대기 목록 | 삭제 후보 브랜치·DB 잔여 행·남긴 워크트리 등(`pending_user`). 조정자는 삭제하지 않는다 |
| 후속 후보 | 남은 개선·미확인·반복 사고(정지, 확인 창) |
| 대체 사실 | GLM 일을 Sonnet 으로 띄웠거나, 사용량 띠로 일을 줄였거나, 기록이 낮은 근거(추정)였던 것 |

보고는 사용자에게 직접 하고, 요약본을 `summary.md`(`coord-state.sh summary`)에 남긴다. 이 스킬의 개선 후보(스킬 사용 중 관찰한 불편)는 있으면 마감 보고에 한 단락으로 적는다.

## 6. 닫기

- 마지막으로 `coord-state.sh close-run` 을 부른다(`event run-closed - '{}'` 도 같은 함수를 탄다). run-closed 이벤트를 남기고, `office.sh finish` 로 에이전트 오피스에서 이 회차의 팀원 표시를 내린 뒤, `.run.closed_at` 에 마감 시각을 적는다(`contract.md` §3.4·§4). 팀장 칸은 조정 세션 단위(`coord:<세션8>`)라서 같은 세션에 다른 열린 회차가 남았으면 내리지 않고 slots·busy 만 다시 합산하며, 이 세션의 마지막 열린 회차를 닫을 때만 내린다. 이 명령을 빼면 회차가 열린 채 남아 팀장 칸의 slots·busy 에 계속 합산된다(조정 세션이 죽으면 PC 폴러의 `office.sh reap` 이 표시를 내린다).
- 끝낸 회차의 `.run.state` 같은 칸을 직접 써서 마감을 표시하지 않는다(계약에 없는 칸이라 아무 동작도 하지 않는다).
- 마감하지 못한 채 새 회차를 시작했다면 `init` 이 낸 `SESSION_RUNS <세션8> open=<n>` 줄(같은 세션의 열린 회차, 자동 마감하지 않는다)을 보고 끝난 회차를 `COORD_RUN=<회차> coord-state.sh close-run` 으로 직접 닫는다. `STALE_RUN` 줄(init·틱)은 다른 조정 세션의 회차에 대한 경고뿐이라 진행 중이면 그대로 둔다.
- 조정자 자신의 세션은 사용자가 닫는다. state 폴더는 지우지 않는다(다음 회차 근거).
