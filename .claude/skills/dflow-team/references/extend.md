# /dflow-team 실행 중 연장 (SKILL.md 「인자」)

사람이 팀장 세션에 종료 시각 연장을 말할 때만 읽음.

- 실행 중 연장: 사람이 팀장 세션에 "내일 9시까지 연장" 처럼 말하면 새 종료 시각을 위 표와 같은 규칙(날짜 절대화, 7일 이내, 지난 시각이면 묻기)으로 정규화. `<UNTIL>`·`<UNTIL_LABEL>` 변경 후 아래를 차례로 수행.
  1. `team.extend`(until, until_label) 기록(events.md). `team.start` 새로 쓰지 않음. 재구성은 마지막 `team.start` 이후만 읽음. 새로 쓰면 그 앞의 슬롯·제외 목록·답 대기 소실.
  2. 떠 있는 poll = 옛 `--until` 로 도는 중. 새 `--until` 로 poll restart(restart 조건은 「2-1」). 옛 poll 이 나중에 exit 8 로 끝나도 「2-3」 표의 poll exit 8 행이 지금 `<UNTIL>` 과 대조해 무시.
  3. 좌석표에 새 `<UNTIL_LABEL>` 로 watch 전송(「2-3」 의 `wake.mjs --until-label`). 감시 루프도 새 `--until`·`--until-label` 로 restart(「2-2」, `--new-tick` 없이).
  4. 새 `<UNTIL>` 이 오늘 아니거나 `none` 이고 macOS 인데 절전 방지가 안 떠 있으면 「1. 시작」 6번대로 start.
  5. 마감 중 연장하면 마감 취소.
     - 「7. 마감」(`references/closing.md`) 2번 기다림 중: 기다림 종료 → 평소 기상 절차로 복귀 → poll restart.
     - 3번 이후(집계 보고 낸 뒤): 이미 끝난 실행. `/dflow-team` 새로 시작하라고 안내(재구성이 살아 있는 팀원 흡수).
  "연장했습니다: <절대 시각>" 한 줄 알림.
