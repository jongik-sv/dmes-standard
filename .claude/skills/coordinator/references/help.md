# /coordinator 사용법

설계 절: §5.2(스킬 구성), SKILL.md 「명령 요약」. `/coordinator help` 일 때만 읽는다.

## 개요

큰 업무 하나를 여러 Claude Code 세션(레인)과 임시 워커에 나눠 맡기고, 조정 세션 하나(이 세션)가 분해·머지 허가·idle 감시와 자동 배정·고부하 조절·사용량 조절·compact·마감을 맡는다. 조정 세션은 effort medium 으로 돌고, 무거운 판단은 opus/high 서브에이전트에 올린다.

## 명령

| 명령 | 설명 |
|---|---|
| `/coordinator start <run-id> [목표]` | 새 회차를 시작한다. 설정 확인, 상태 폴더 생성, 업무 분해, 레인 확보, 착수 지시, 감시 cron 생성까지 한다. `<run-id>` 는 상태 폴더 이름(예: `refactor-2026-10`) |
| `/coordinator tick` | 감시 틱을 한 번 돌린다. 감시 cron(`tick.cron`, 기본 `7,27,47 * * * *`)은 이 명령 대신 고정 문구 `[조정자 틱] .claude/skills/coordinator/SKILL.md 의 「틱 절차」 절만 읽고 실행(Skill 재호출 금지)` 을 넣는다. 바뀐 것이 없으면 말 없이 끝난다 |
| `/coordinator status` | 레인별 상태표(busy/idle, 마지막 보고, ctx %)와 진도율, PC 부하, 사용량 띠를 보여 준다. 레인에 다시 묻지 않는다 |
| `/coordinator merge <레인>` | 그 레인의 머지 요청을 게이트(`merge-gate.sh`)로 검사하고 허가 또는 대기를 보낸다 |
| `/coordinator measure <레인> <분>` | 측정 창을 연다: 나머지 레인에 무거운 작업 금지 통지, 정숙 확인, 측정 시작 통지. 창은 `<분>` 뒤 닫는다 |
| `/coordinator close <레인>` | 끝난 레인 세션을 정리하고 닫는다(`close-lane.sh`). 백그라운드가 돌거나 마지막 보고가 없으면 거절된다 |
| `/coordinator finish` | 마감: 통합 확인, SUMMARY, 정리 확인, 마감 보고, 감시 cron 삭제 |
| `/coordinator help` | 이 문서 |

## 설정

- 리포 공용 `<repo>/.coord.json`(커밋) + PC 전용 `<repo>/.coord.local.json`(커밋 안 함). 둘 다 없으면 기본값이다. 예시: `templates/config.example.json`. 키 설명은 `references/contract.md` 1.2.
- PC마다 다른 값은 설정으로만 가리킨다: `git_bin`, `launch.claude`·`launch.glm`·`launch.opencode`, `heavy.script`, `integration_check`, `usage.sources` 의 캐시 경로, `tasks_root`, `wake_targets`.
- 확인 창 자동 승인 범위 `approvals.auto_allow` 기본은 가장 좁은 `["read","status"]` 다. 넓히려면 설정에서만 한다.

## 사용 흐름 예

1. 조정 세션을 effort medium 으로 띄운다(`--effort medium` 또는 `/model`).
2. `/coordinator start refactor-2026-10 "시스템 리팩토링 5레인"`.
3. 분해 결과를 확인해 주고, 사용자가 띄운 세션은 신원 보고로 연결되게 한다.
4. 이후는 틱이 알아서 돈다. 사용자 결정이 필요한 것(삭제, shared 기존 API 변경, 확인 창 판단 불가)만 한 줄로 알린다.
5. 끝나면 `/coordinator finish`.

## 조정자가 하지 않는 일

삭제, 강제 push, 레인 소유 파일 수정, 제품 코드·시험 수정·개발 커밋(반영 빌드와 통합 브랜치 push·릴리스 반영은 조정자가 묻지 않고 한다), 레인 안 구현 규율, D'Flow 작업 수명주기.
