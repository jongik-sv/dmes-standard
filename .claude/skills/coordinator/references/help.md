# /coordinator 사용법

`/coordinator help` 일 때만 읽음.

## 개요

- 큰 업무 하나를 여러 Claude Code 세션(레인)과 임시 워커에 나눠 맡김
- 조정 세션 하나(이 세션)의 일
  - 분해·머지 허가·idle 감시와 자동 배정
  - 고부하 조절·사용량 조절·compact·마감
- 조정 세션 = effort medium. 무거운 판단 = opus/high 서브에이전트

## 명령

- `/coordinator start <run-id> [목표]`: 새 회차 시작
  - 설정 확인, 상태 폴더 생성, 업무 분해, 레인 확보, 착수 지시, 감시 cron 생성
  - `<run-id>` = 상태 폴더 이름(예: `refactor-2026-10`)
- `/coordinator tick`: 감시 틱 1회. 변화 없으면 말 없이 끝
  - 감시 cron(`tick.cron`) = 이 명령 대신 SKILL.md 머리의 고정 문구 사용
- `/coordinator status`: 레인별 상태표(busy/idle, 마지막 보고, ctx %)
  - 진도율, PC 부하, 사용량 띠 포함. 레인에 다시 묻지 않음
- `/coordinator merge <레인>`: 그 레인의 머지 요청을 `merge-gate.mjs` 로 검사 → 허가 또는 대기 전송
- `/coordinator measure <레인> <분>`: 측정 창 열기
  - 나머지 레인에 무거운 작업 금지 통지 → 정숙 확인 → 측정 시작 통지
  - `<분>` 뒤 닫음
- `/coordinator close <레인>`: 끝난 레인 세션 정리·종료(`close-lane.mjs`)
  - 백그라운드가 돌거나 마지막 보고가 없으면 거절
- `/coordinator finish`: 마감. 통합 확인, SUMMARY, 정리 확인, 마감 보고, 감시 cron 삭제
- `/coordinator help`: 이 문서

## 설정

- 리포 공용 `<repo>/.coord.json`(커밋) + PC 전용 `<repo>/.coord.local.json`(커밋 안 함). 둘 다 없으면 기본값
- 예시: `templates/config.example.json`. 키 설명: `references/contract.md` §1.2
- PC마다 다른 값 = 설정으로만 지정
  - `git_bin`, `launch.claude`·`launch.glm`·`launch.opencode`, `heavy.script`, `integration_check`
  - `usage.sources` 의 캐시 경로, `tasks_root`, `wake_targets`
- 확인 창 자동 승인 범위 `approvals.auto_allow` 기본 = 가장 좁은 `["read","status"]`. 넓히기 = 설정에서만

## 사용 흐름 예

1. 조정 세션을 effort medium 으로 띄움(`--effort medium` 또는 `/model`)
2. `/coordinator start refactor-2026-10 "시스템 리팩토링 5레인"`
3. 분해 결과 확인. 사용자가 띄운 세션 = 신원 보고로 연결
4. 이후 틱이 자동 진행
   - 사용자에게는 결정 필요 항목만 한 줄(삭제, shared 기존 API 변경, 확인 창 판단 불가)
5. 끝나면 `/coordinator finish`

## 조정자가 하지 않는 일

- 삭제, 강제 push, 레인 소유 파일 수정, 제품 코드·시험 수정, 개발 커밋
- 레인 안 구현 규율, D'Flow 작업 수명주기
- 예외: 반영 빌드·통합 브랜치 push·릴리스 반영 = 조정자가 묻지 않고 실행
- 전체 목록 = SKILL.md 「금지」
