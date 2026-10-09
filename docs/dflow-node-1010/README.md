# dflow-node-1010 레인 공통 규칙

2026-10-10 dflow-* 스킬 8개 정비. 두 가지:
- `.sh` 스크립트 → node `.mjs` 전환. 윈도우(Git Bash 없는 PowerShell)에서도 같은 동작
- SKILL.md·references 프롬프트 압축. 같은 효과, 더 적은 토큰

조정 세션 = **dmes-standard-87**(회차 `dflow-node-1010`).
레인의 할 일·소유·금지 정본 = 조정 세션의 착수 지시.

| 레인 | 범위 | 브랜치 | 워크트리 |
|---|---|---|---|
| dn-work | dflow-work 스크립트 | `chore/dn-work` | `/Users/jji/project/dmes-standard-wt/dn-work` |
| dn-merge-poll | dflow-merge·dflow-poll 스크립트 | `chore/dn-merge-poll` | `/Users/jji/project/dmes-standard-wt/dn-merge-poll` |
| dn-team | dflow-team 스크립트 | `chore/dn-team` | `/Users/jji/project/dmes-standard-wt/dn-team` |
| dn-dev-small | dflow-dev 작은 스크립트 | `chore/dn-dev-small` | `/Users/jji/project/dmes-standard-wt/dn-dev-small` |
| dn-heavy | heavy·timeout-guard·deps + 리포 호출자 | `chore/dn-heavy` | 06:00 뒤 생성 |
| dn-docs-* | 문서 압축 + 호출 경로 치환 | `chore/dn-docs-*` | 06:00 뒤 생성 |
| dn-coord-fix | 조정자·_shared 의 호출자 | `chore/dn-coord-fix` | 스크립트 레인 머지 뒤 |

## 1. 스크립트 전환 규칙

**동작 보존이 원칙.** 바뀌는 것 = 실행기(bash → node)뿐.
- 이름: `x.sh` → 같은 폴더 `x.mjs`. 첫 줄 `#!/usr/bin/env node`, 실행 권한 유지
- 그대로 유지:
  - CLI 인자·하위 명령·환경 변수 이름
  - stdout·stderr 줄 형식(다른 스크립트가 grep·파싱하는 접두어는 글자 그대로)
  - 종료 코드
  - 읽고 쓰는 파일·잠금 폴더·상태 파일의 경로와 형식
- `bash x.sh`·`$DIR/x.sh` 로 부르던 형제 스크립트 → `node x.mjs`(`process.execPath`)로 호출
- 외부 의존 0, node 18.17 이상. 공용 헬퍼 `.claude/skills/_shared/node/`(args·proc·paths·io) 먼저 재사용
  - 조정자 node 판(`.claude/skills/coordinator/scripts/lib/`)에 프로세스 표·시간 제한·트리 kill 구현 있음. 참고·복사 가능(수정 금지)
- 윈도우:
  - bash·jq·sed·awk·grep·`ps`·`lsof`·`setsid`·`timeout` 호출 금지 → node API
  - 프로세스 표: unix `ps`, 윈도우 PowerShell `Get-CimInstance Win32_Process`
  - `spawn` 에 `windowsHide: true`. 경로 = `node:path`. 임시 폴더 = `os.tmpdir()`
  - HTTP = 내장 `fetch`(curl 금지)
  - git·orca·gradle 같은 정식 CLI 호출은 허용
- 머리말 주석·`--help` = 짧게. 사용법·출력 형식·종료 코드만
- 원본 `.sh` → `git mv` 로 `<스킬>/backup/scripts/`(시험 `.sh` → `<스킬>/backup/tests/`). **삭제 금지**
  - `<스킬>/backup/README.md` 한 단락: 퇴역·실행 금지·node 판이 정본
  - `tests/golden/legacy/` 는 기존 node 시험 입력. 건드리지 않음
- dflow-* 의 `*.md` 문서는 수정 금지(문서 레인 소유)
  - 대신 머지 요청에 「호출 경로 변경표」(옛 호출 → 새 호출) 첨부

## 2. 시험

사용자 지시: 과도한 시험 금지. 전체 확인은 회차 끝에 조정자가 1회.
- 항목마다: `node --check <파일>` + `node <파일> --help` + 읽기 전용·dry-run 명령 1개(있으면)
- 새 시험 파일·대조 하니스·golden 생성 금지
- 실 D'Flow API 에 쓰는 명령(claim·report·watch 등) 실행 금지. dry-run 만
- 도커 금지. gradle·전체 시험 실행 금지(dn-heavy 는 착수 지시를 따름)

## 3. 규율·머지

- 자기 소유 파일만 수정. 금지 파일이 필요하면 조정 세션에 질문
- 커밋 = Conventional Commits, 스크립트 1~3개 단위(`refactor(dflow-team): capacity 를 node 로 옮긴다`)
- 프로젝트·PC 설정 = 각 PC 의 CLAUDE.md 와 `.coord.local.json`
- 머지 순서: dn-work 먼저(다른 레인이 `dflow.mjs` 를 부름). 나머지는 준비된 순서
  - 다른 레인은 dn-work 머지 전에도 `node <dflow-work>/scripts/dflow.mjs <같은 인자>` 로 코드를 쓴다
- 머지 요청 → 「머지 허가」 뒤에만 머지(메인 체크아웃에서 `--no-ff`)
  - 이어 `머지 완료` → 워크트리 정리(`git worktree remove`, `git branch -d`. `--force`·`-D` 금지) → `정리 완료`
- 레인은 push 금지(조정자 몫)
- opencode 워커 레인 = 커밋까지만. 머지·정리는 조정자가 함

## 4. 문서 압축 규칙(dn-docs-*)

- 정본: `.claude/skills/_shared/style/Korean-STE-LLM-Guide.md`
- 문장 길이: 절차문 16어절 권장·20어절 상한, 설명문 20어절 권장·25어절 상한
  - 긴 문장 = 짧은 문장 여러 개로 나눔. 한 줄에 하나, 앞에 `-`
  - 순서가 있는 동작 = 번호 목록
- 바꾸지 않는 것:
  - frontmatter `name`·`description`(트리거 문구)
  - 고정 문구: `team.*` 이벤트 이름, 프로토콜 첫 줄, 스크립트가 grep 하는 출력 접두어
  - 워커에게 그대로 보내는 지시문 원문(`worker-prompt.md`·`resolve-prompt.md` 등)의 의미·자리표시자
  - 규칙·조건·숫자·예외. 줄이되 빠뜨리지 않음
- 호출 경로 치환: 스크립트 레인의 「호출 경로 변경표」대로 `.sh` → `node …mjs`
