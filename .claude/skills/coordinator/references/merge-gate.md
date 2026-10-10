# 머지 순서와 머지 게이트

## 1. 순서 원칙

- 기본 = 준비된 레인부터. 의존 그래프(`deps`)가 막는 것만 뒤로
- dev 를 바꾸는 머지 = **한 번에 하나만** 허가
  - `merge.in_flight` 가 빌 때만
  - 완료 보고 수신 뒤 다음 허가
  - 요청 겹침 → `merge.queue` 에 넣고 준비된 순서로 처리
- 머지·정리 완료 수신 → `merge.in_flight` 를 `merge.history` 로 옮기고 닫음
- 반영 빌드·통합 브랜치 push = 트리 대조 뒤 조정자 몫 (`closing.md` §7)
- 레인은 push 금지

## 2. 절차

1. `머지 요청` 수신
   - 첫 줄 종류 확인
   - `node scripts/coord-state.mjs report <레인>` 기록
2. `node scripts/merge-gate.mjs <레인>` 실행
   - 브랜치 직접 지정 → `--branch <브랜치>`
   - `--branch` 만(레인 없이) → 소유·금지 대조 건너뜀
3. 출력을 §3 대로 처리
   - 「판단 올리기」 줄이 있음 → `opus` / `high` 서브에이전트가 판정
   - 넘길 것: 출력 전체 + 요청 메시지
4. 허가 시
   - 기록: `node scripts/coord-state.mjs set '.merge.in_flight' '{"lane":…,"branch":…,"expected_tree":"<hash>","granted_at":"<iso>"}'`
   - 전송: `protocol.md` 3.12 `머지 허가`
   - 허가 내용: 예상 트리, 조건, **머지 뒤 다음 일**
5. `머지 완료` 수신 → 머지 뒤 통합 브랜치 tip 의 트리를 `expected_tree` 와 대조(머지 = `git merge --ff-only <SHA>`, merge commit 없음)
   - 같음 → history 에 `merged`·`tree` 기록
   - 다름 → 사용자 확인 전 다음 머지 허가 금지
   - 다름 → 원인(그 사이 dev 변경 여부) 확인
6. `정리 완료` 수신 → `cleaned` 기록 후 닫음
   - 남긴 브랜치(squash 로 `-d` 거부 등) → `pending_user`

### 2.1 허가 견본 보강

**대상 SHA** (머지 요청의 합친 커밋. 브랜치에 다음 항목 커밋이 이미 쌓였을 수 있음):
- 머지 요청에 SHA(7~12자) 기재(필수: 합친 커밋 1개)
- 게이트: `node scripts/merge-gate.mjs <레인> --branch <SHA>`
- 허가문에 「이 SHA 까지만 머지」
- `expected_tree` 도 그 SHA 기준
- 쌓인 다음 커밋 = 다음 머지 몫

**건드리지 말 파일**:
- 허가 전 메인 체크아웃 `git status --short` 확인
- 사용자 미커밋 파일이 있음 → 허가문에 아래 문장 추가
  - 「<경로> 는 사용자 미커밋 파일이다. 건드리지 말고 커밋에 넣지 말 것(머지 뒤 `git add` 는 경로를 지정한다)」

**되돌리는 수단과 함께**:
- 대상: 사용자 동작이 바뀌는 화면 기능(자동 저장·기본 동작 변경 등)
- 되돌리는 수단(기본값 복원 화면·끄는 설정)과 함께 머지
- 둘이 다른 레인 → 허가를 묶음
- 요청에 수단 없음 → `대기: 되돌리는 수단(복원 화면·설정)과 함께 머지해 달라`

## 3. merge-gate.mjs 출력별 조정자 행동

- 첫 줄 `GATE <ok|wait|conflict> …` (칸 = `contract.md` §3.3)
  - `wait` = `NOT_SQUASHED`·`FORBIDDEN`·`WINDOW`·`INFLIGHT` 있음
- 이어 사유 줄

줄별 행동:
- `GATE ok` (충돌·사유 줄 없음)
  - 시험 근거(§4)·기록 문서만 확인 후 허가
  - 허가문에 `tree=` 기재
- `GATE conflict` + `CONFLICT <경로>` (병합 충돌)
  - 허가 금지
  - `대기: dev 최신을 합쳐 충돌을 풀고 시험을 다시 돌려 달라(충돌 경로 목록)`
- `NOT_SQUASHED <n>` (통합 브랜치 위 commit 이 n≥2개, merge commit 포함)
  - 허가 금지. `대기: 한 커밋으로 합친 뒤 다시 머지 요청`
  - 레인이 dev 최신을 합치고 `squash-branch.mjs --rebase` 실행 → 새 SHA 로 재요청(레인 지시 = `templates/brief.md` 「보고 방식」)
  - 요청에 커밋 수 ≠ 1 로 적혀 있어도 같은 처리(게이트 출력과 대조)
- `NOT_REBASED` (브랜치 기점 ≠ 통합 브랜치 tip)
  - 허가 금지. `대기: dev 최신 위로 옮겨(squash-branch.mjs --rebase) 다시 머지 요청`
  - 허가 뒤 `git merge --ff-only` 가 실패(그 사이 dev 가 앞서 감)해도 같은 처리
- `FORBIDDEN <경로>` (레인 금지 파일 수정)
  - `대기: 금지 파일 <경로> 변경 사유를 설명하거나 되돌려 달라`
  - 사유 타당 → 소유 레인과 조정 후에만 허가
- `OUTSIDE <경로>` (소유 밖 파일 수정, 판단 올리기)
  - 서브에이전트가 요청 설명과 대조해 판정
  - 정당 → 허가. 아니면 대기
- `SHARED_API <경로>` (shared 공개 API·props·동작 변경 후보, 판단 올리기)
  - **사용자 승인 기록**을 직접 확인한 뒤에만 허가 (아래)
- `RESTART <note>` (실행 중 서버가 쓰는 산출물에 닿음, `restart_rules`)
  - 허가 조건에 note 를 그대로 붙임
- `WINDOW <kind> until=<iso>` (측정·이동 창 열림)
  - 허가를 창 끝 뒤로 미룸 (머지 뒤 빌드·시험이 창을 깸)
  - `대기: 측정 창이 <until> 에 끝난다` + 그동안 할 일 전송
  - 창 종료 후 틱에서 허가
- `INFLIGHT <레인>` (다른 레인 머지 진행 중)
  - `대기: <레인> 머지 완료 뒤 허가한다` 전송
  - 그동안 할 일 함께 전송 (`monitor.md` 「병목 대기 레인」)
  - `merge.queue` 에 넣음

`SHARED_API` 처리:
- 승인 기록 = 그 세션 jsonl 의 사용자 입력 또는 AskUserQuestion 답
- 기록 없음 → `대기: 사용자 승인 기록이 필요하다` 전송 + `pending_user` 에 올림
- 새 export·새 컴포넌트 추가만 → 승인 없이 허가 가능 (서브에이전트가 가림)

## 4. 스크립트가 못 보는 것(조정자가 직접 확인)

1. **시험 근거**
   - 머지 요청에 명령과 통과·실패 수가 있는지 확인
   - 요청 직전 dev 최신을 합쳐 재실행했는지 확인
   - 숫자 없음 → `대기: 시험 결과(명령과 통과·실패 수)를 붙여 달라`
   - 충분한 근거 = 바뀐 모듈 전체 시험 1회 (`templates/brief.md` 「시험」)
   - 리포 전체 시험 요구 금지
2. **렌더 점검**: 화면 레인 머지 요청에 「렌더 점검」 줄 확인
   - 줄 내용: 규칙별 해당 없음/고침/오탐 + audit 결과
   - 없음 → `대기: 렌더 점검 결과를 붙여 달라`
3. **기록 문서**: `records_check` 가 `true` 일 때만
   - 이번 항목이 레인 기록 문서(구조·성능)에 있는지 확인
4. **레인 상태**: 레인이 Workflow 중이어도 머지 요청은 처리
   - 머지 요청 = 세션이 직접 낸 것
   - 허가 = SendMessage (`workflow.md` §6)

## 5. 재기동 판단표 형식

- 설정 `restart_rules`: `[{"glob":"src/backend/**","note":"세 서버 내린 뒤 jar 빌드·재기동"}]`
- `merge-gate.mjs` 가 변경 파일과 glob 을 대조
  - 일치 → `RESTART <note>` 출력
- 리포마다 `.coord.json` 에 둠
