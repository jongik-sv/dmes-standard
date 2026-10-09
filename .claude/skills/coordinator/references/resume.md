# compact 뒤 복구(조정자)

- 조정자 세션 compact 뒤 **Skill 도구로 `/coordinator` 재호출 금지**(스킬 전체가 다시 실림)
- 아래 재독 세트만 Bash `cat` 으로 읽음

## 1. 재독 세트와 순서

1. `state.json`: `node scripts/coord-state.mjs get`(전체) 또는 `get '.lanes | keys'` 등 필요한 부분
   - 회차 폴더 = `<state_dir>/current` 의 run-id
2. `summary.md`: 현재 상태. 없거나 낡음 → `node scripts/coord-state.mjs summary` 로 재생성
3. 사람 정본 메모: state `run` 또는 summary.md 가 가리키는 조정자 메모 하나
4. 이 문서 `references/resume.md`

그 밖에는 필요할 때만 읽음
- 틱 절차 = SKILL.md 「틱 절차」 절
- 세부 = 해당 reference 한 절만

## 2. 복구 절차

1. 재독 세트 읽기
2. `CronList` 로 감시 cron 생존 확인. 없으면:
   - `CronCreate`(`tick.cron`, 프롬프트 `[조정자 틱] .claude/skills/coordinator/SKILL.md 의 「틱 절차」 절만 읽고 실행(Skill 재호출 금지)`)
   - `node scripts/coord-state.mjs set '.run.cron_id' '"<새 id>"'`
3. `node scripts/coord-status.mjs` 로 현재 상태 재수집
   - state 와 다른 점(레인 pid 변경, handle stale, 머지 진행) 맞춤
   - `events.jsonl` 마지막 이후 들어온 메시지 = 대화에 남은 것으로 처리
4. 진행 중인 창(`node scripts/measure-window.mjs status`)·머지(`merge.in_flight`) 확인
   - 있으면 그 상대 레인에 상태 한 줄 확인 전송
5. 미처리 `pending_user`·`compact.pending`·`instrs` 의 ack 없는 지시 확인
6. 바로 이어 틱 절차 1회

## 3. 알아둘 것

- 조정자 compact = 사용자가 침(`compact.md` §8)
- compact 뒤 첫 메시지가 오면 위 절차를 먼저 수행
- 감시 cron 프롬프트 = 스킬 재호출이 아니라 틱 신호. 틱에서는 SKILL.md 「틱 절차」만 따름
- 대화에서 사라진 사용자 지시(전용 칸 허용, 이동 창 등) = `decisions[]`·`windows[]`
  - 없으면 레인 상태에서 재확인
