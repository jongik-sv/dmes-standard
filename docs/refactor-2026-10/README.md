# 시스템 리팩토링 2026-10 — 레인 공통 규칙

2026-10-04 조사(성능·구조·품질 5개 영역) 결과를 세션 5개에 레인으로 나눠 진행한다.
조정 세션은 **dmes-standard-cb** 다. 질문·승인 요청·머지 요청은 모두 이 세션에 SendMessage 로 보낸다(사용자 화면에 묻지 않는다).

| 세션 | 레인 | 브랜치 |
|---|---|---|
| dmes-standard-a8 | 프레임워크(cactus 경로) | `refactor/framework` |
| dmes-standard-b9 | MDM 백엔드·엔진 | `refactor/mdm-backend` |
| dmes-standard-a6 | mcm-core·mcm | `refactor/mcm` |
| dmes-standard-1b | 빌드·스크립트·E2E | `refactor/build` |
| dmes-standard-c3 | 프론트 shared·화면 | `refactor/frontend` |

각 레인의 할 일·소유 파일·금지 파일은 조정 세션이 보낸 지시 메시지가 정본이다.

## 1. 작업 방식 — Workflow 필수, 단계별 모델 지정

- 레인 작업은 **Workflow 도구**로 돌린다(사용자 지시, 2026-10-04). 먼저 `workflow-authoring` 스킬을 읽는다.
- 모든 `agent()` 호출에 `model` 과 `effort` 를 명시한다.

| 단계 | model | effort |
|---|---|---|
| 조사·위치 찾기·문서 갱신·기계적 치환(유틸 통합, import 수정 등) | sonnet | medium |
| 특성 테스트 작성·리팩토링 구현·수정 | opus | high |
| 리뷰(동작 보존 판정)·정합성 결함 수정 | opus | high |
| 보안(자격증명 제거 등)·트랜잭션 정합성 판정 | opus | xhigh |
| 시험 실행·결과 확인 | sonnet | medium |

- 항목마다 「구현 → 리뷰 → 지적 수정」 순서로 진행한다. 리뷰가 clean 이 아니면 다음 항목으로 넘어가지 않는다.
- 레인 안에서 파일이 겹치지 않는 항목은 병렬로 돌려도 된다. 겹치면 순서대로 돌린다.
- 워크플로 규모는 레인당 에이전트 10개 안팎을 기본으로 한다.

## 2. 작업 공간

- 레인마다 워크트리를 따로 쓴다. `EnterWorktree`(이름: 위 표의 브랜치에서 `refactor/` 뒤 이름) 를 쓰거나, 안 되면 `/usr/bin/git worktree add` 로 만들고 브랜치는 위 표를 따른다. 기준은 `dev` 최신 커밋이다.
- git 은 rtk 훅 때문에 `/usr/bin/git` 으로 부른다. 변수·`$(…)`·heredoc 이 섞인 복합 명령은 거절되므로 단순 명령으로 나눈다.
- gradle 은 `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 를 붙인다.
- 새 워크트리의 프론트는 형제 패키지 dist 가 없으므로, 필요한 패키지 폴더에서 `npx tsup` 을 한 번 돌린다.
- 도커는 쓰지 않는다. DB 시험은 SQLite 로만 한다.
- 메인 저장소(`/Users/jji/project/dmes-standard`)에서 실행 중인 로컬 서버·FE 를 끄거나 재기동하지 않는다. 브라우저 확인이 필요하면 조정 세션에 요청한다. 직접 연 ego-browser 작업 공간은 보고 전에 닫는다.

## 3. 리팩토링 규율

- **동작 보존이 원칙이다.** 바꾸기 전에 특성 테스트(현재 동작을 고정하는 테스트)를 먼저 깔고, 바꾼 뒤 같은 테스트가 통과해야 한다.
- 결함 수정(동작이 바뀌는 것)은 리팩토링 커밋과 섞지 않고 `fix(...)` 커밋으로 따로 둔다.
- **자기 레인의 소유 파일만 고친다.** 금지 파일을 고쳐야 하면 먼저 조정 세션에 묻는다.
- **build.gradle·settings.gradle·gradle.properties·libs.versions.toml 은 1b 레인만 고친다.** 다른 레인에서 의존성이 필요하면 조정 세션에 요청한다.
- **삭제하지 않는다. 쓰지 않는 파일은 archive 로 옮긴다**(사용자 지시). `git mv` 로 옮기고, 빌드·시험 대상에서 빠지게 설정한다(예: `e2e/archive/` 는 playwright `testIgnore`, `scripts/archive/`).
- shared 의 기존 공개 API·props·동작을 바꾸는 일은 사용자 승인 대상이다. 조정 세션에 승인 요청을 보내고 기다린다. 새 export·새 컴포넌트 추가는 승인 없이 한다(Part B §18).
- oasis 소스(`src/backend/oasis`)는 고치지 않는다. 필요하면 cactus 층에서 감싸거나 조립한다.
- 커밋은 저장소 관례(Conventional Commits, `type(scope): 한국어 subject`)를 따르고 작은 단위로 나눈다.
- 영역 규칙이 걸리면 RULE.md 의 무조건 적용 스킬을 따른다(OASIS 서비스 → `oasis-contract-check`, Flyway → `flyway-migration-add`, 프론트 → `mantine-aggrid-ui`).

## 4. 머지 절차

1. **1b 레인(빌드)이 dev 에 먼저 머지된다.** 다른 레인은 1b 머지 완료 통지를 받으면 자기 브랜치에 dev 를 합치고 빌드·시험을 다시 돌린다.
2. 머지 직전, 조정 세션에 다음 형식으로 보낸다.
   `머지 요청: 세션 이름 / 원본 브랜치 / 대상 dev / 커밋 수·변경 요약 / 겹칠 수 있는 파일·모듈 / 머지 전 시험 결과(명령과 통과·실패 수)`
3. 「머지 허가」를 받은 뒤에만 머지한다. 「대기」면 기다린다. 머지는 메인 저장소에서 `/usr/bin/git -C /Users/jji/project/dmes-standard merge --no-ff <브랜치>` 로 한다.
4. 머지 뒤 `머지 완료: 머지 커밋 해시 / 머지 뒤 빌드·시험 결과` 를 보낸다(충돌·실패도 그대로).
5. 이어 워크트리를 정리한다(`git worktree remove`, `git branch -d`. `--force`·`-D` 금지). 끝나면 `정리 완료` 를 보낸다.
6. 레인 일이 많으면 중간 단위로 여러 번 머지해도 된다. 매번 같은 절차를 따른다.

## 5. 보고

- 항목 하나가 끝날 때마다 조정 세션에 한 줄로 진행 상황을 보낸다(항목 번호, 커밋, 시험 결과).
- 측정할 수 있는 성능 항목은 전후 수치를 남긴다. 이 PC(MacBook Air M5)는 측정 편차가 크므로 반복 측정 없이 결론 내지 않는다.
