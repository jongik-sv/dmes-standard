# compact 뒤 복구(조정자)

설계 절: §4.3(재독 세트와 순서), §3.g, §3.j-7.

조정자 세션이 compact 되면 **Skill 도구로 `/coordinator` 를 다시 부르지 않는다.** 스킬 전체가 다시 실리기 때문이다. 아래 재독 세트만 Bash `cat` 으로 읽는다.

## 1. 재독 세트와 순서

1. `state.json`: `node scripts/coord-state.mjs get`(전체) 또는 `get '.lanes | keys'` 등으로 필요한 부분. 회차 폴더는 `<state_dir>/current` 의 run-id 로 찾는다.
2. `summary.md`: 사람이 읽는 현재 상태. 없거나 낡았으면 `node scripts/coord-state.mjs summary` 로 다시 만든다.
3. 사람 정본 메모: state `run` 또는 summary.md 가 가리키는 조정자 메모 하나.
4. 이 문서 `references/resume.md`.

필요할 때만 더 읽는다: 틱 절차는 SKILL.md 의 「틱 절차」 요약만으로 돌 수 있다. 세부는 해당 reference 한 절만 읽는다.

## 2. 복구 절차

1. 위 재독 세트를 읽는다.
2. `CronList` 로 감시 cron 이 살아 있는지 확인한다. 없으면 `CronCreate`(`tick.cron`, 프롬프트 `[조정자 틱] .claude/skills/coordinator/SKILL.md 의 「틱 절차」 절만 읽고 실행(Skill 재호출 금지)`)로 다시 만들고 `node scripts/coord-state.mjs set '.run.cron_id' '"<새 id>"'` 로 갱신한다.
3. `node scripts/coord-status.mjs` 로 현재 상태를 다시 모아 state 와 다른 점(레인 pid 바뀜, handle stale, 머지 진행)을 맞춘다. `events.jsonl` 마지막 이후에 들어온 메시지는 대화에 남은 것으로 처리한다.
4. 진행 중이던 창(`node scripts/measure-window.mjs status`)·머지(`merge.in_flight`)가 있으면 그 상대 레인에 상태 한 줄 확인을 보낸다.
5. 처리하지 않은 `pending_user`·`compact.pending`·`instrs` 의 ack 없는 지시를 확인한다.
6. 바로 이어 틱 절차를 한 번 돌린다.

## 3. 알아둘 것

- 조정자 compact 는 사용자가 친다(`compact.md` 8). 사용자가 compact 한 뒤 첫 메시지가 오면 위 절차를 먼저 한다.
- 감시 cron 프롬프트 `[조정자 틱] .claude/skills/coordinator/SKILL.md 의 「틱 절차」 절만 읽고 실행(Skill 재호출 금지)` 은 스킬 재호출이 아니라 틱 신호다. 틱에서는 SKILL.md 틱 절차만 따른다.
- 대화에서 사라진 사용자 지시(전용 칸 허용, 이동 창 등)는 `decisions[]` 와 `windows[]` 에 있다. 없으면 레인 상태에서 다시 확인한다.
