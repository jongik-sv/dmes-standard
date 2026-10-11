# ERD UX 정비 1차 레인 공통 규칙

2026-10-11 ERD 화면 UX 정비 1차(화면 틀·큰 모델 읽기·문구·직관성·감사 컬럼 확정 규칙)를 레인 2개로 나눠 진행한다.
조정 세션 = **dmes-standard-3b**. 질문·승인 요청·머지 요청은 모두 이 세션에 SendMessage 로 보낸다(사용자 화면에 묻지 않는다).

| 레인 | 맡는 Task(계획 파일) | 브랜치 |
|---|---|---|
| ux1-fe1 | T1 뼈대 → T2 화면 틀(t2a·t2b) → T3 위 막대 → T4 문구(01) | `erd-ux1-fe1` |
| ux1-fe2 | T5 서버(감사 컬럼 확정·userHint·at) → T6 큰 모델 읽기 ①(t6a·t6b·t6c) → T7 주제별 나누기·도구 막대(t7a·t7b) → T8 입력 칸(02) | `erd-ux1-fe2` |

- 계획 정본: `docs/superpowers/plans/2026-10-11-erd-ux1/` (README 의 「인터페이스 (정본)」·U1~U54·Global Constraints 가 구속한다)
- 입력: `docs/erd-tool/ux-2026-10-11/README.md`
- 레인의 할 일·소유 파일·금지 파일 정본 = 조정 세션의 착수 지시 메시지. 충돌하면 지시가 우선한다.
- T9(마감)는 조정 세션 몫이다.

## 1. 작업 방식

- 작업 방식·시험·보고·병목 대기 = 착수 지시 메시지를 따른다.
- 계획 파일의 Task 를 단계(Step) 순서대로 따른다. 계획과 실제 코드가 어긋나면 가장 안전한 변형으로 진행하고 진행 보고에 한 줄로 남긴다. 설계·공유 인터페이스가 걸리면 조정 세션에 질문한다.
- 레인·세션당 동시 서브에이전트 최대 10개.

## 2. 작업 공간

- 레인마다 워크트리 분리(`/Users/jji/project/dmes-standard-wt/<브랜치>`). 기준 = `dev` 최신 커밋.
- 이 리포 CLAUDE.md 와 RULE.md 의 작업 규칙을 따른다.
- 도커 금지(Oracle 컨테이너만 예외). Oracle 시험은 `-Pdmes.ora.test=clone` + `heavy.mjs`.
- L_MAIN 등 L_*/TPL_* PDB 에 쓰기·파괴적 시험 금지. 읽기 확인만 허용한다.
- 메인 저장소에서 실행 중인 로컬 서버·FE 의 종료·재기동 금지. 넓은 `pkill` 금지.
- Gradle 전 `unset BACKEND_CLIENT_KEY`.

## 3. 규율

- 계획의 TDD 순서를 지킨다(실패 시험 → 구현 → 통과 → 체크포인트 커밋).
- **자기 레인의 소유 파일만 수정.** 금지 파일을 고쳐야 하면 먼저 조정 세션에 질문한다.
- `panels/ColumnGrid.tsx` 는 ux1-fe1 t1 이 한 번(prop + 효과 하나) 고친 뒤 ux1-fe2 소유다.
- 머지된 Flyway V 파일 수정 금지. 새 V 파일 없음.
- **삭제 금지.** 쓰지 않는 파일 = archive 로 이동(`git mv`).
- shared 의 기존 공개 API·props·동작·모양 변경 금지(사용자 승인 사항, 계획 README A1~A10). 새 shared 부품 등록은 Part B §18 절차 전부를 같은 항목에서 할 때만.
- 커밋 = Conventional Commits, 제목 한국어. 트레일러 한 줄 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- 머지 요청 직전 레인 전체를 한 커밋으로 합치고 dev tip 위로 옮긴다(`.claude/skills/_shared/node/squash-branch.mjs --rebase`).

## 4. 머지 절차

1. 준비된 레인부터 머지. 남는 의존:
   - ux1-fe1 t1 은 끝나는 대로 바로 머지 요청(우선순위 1). ux1-fe2 의 t6c·t7a·t7b·t8 은 이 머지 뒤 rebase 하고 한다.
   - ux1-fe2 t5(서버)는 언제든 따로 머지 요청 가능.
2. 조정 세션에 `머지 요청`. 「머지 허가」 뒤에만 메인 저장소에서 `git merge --ff-only <SHA>`.
3. 머지 뒤 `머지 완료`, 정리(`git worktree remove`, `git branch -d`; `--force`·`-D` 금지) 뒤 `정리 완료`. 중간 머지 뒤에는 워크트리를 남기고 계속한다.
4. 레인은 push 금지.

## 5. 보고

- 형식·정본 메모·재개 확인 = 착수 지시의 「보고 방식」.
- 정본 메모 = `~/.coord/erd-ux1-1011/lanes/<레인>/memo.md`(리포 밖).
