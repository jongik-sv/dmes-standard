# perm-bench 레인 공통 규칙

권한 작업대 시안 v16 개발 회차. 조정 세션 = `dmes-standard-1d`(win30). 회차 모드 = time.

- 시안 = [mock-v16.html](./mock-v16.html)(브라우저로 연다). 정본 분해 = [decompose.md](./decompose.md)(§0 공용 계약, §1 결정 D7~D30, §2 항목, §3 소유·금지, §4 의존)
- 결정 D31~D34(조정자, decompose.md 보다 우선)
  - D31 perm-legacy-be 는 Mac 이 맡는다. Mac = perm-fe + perm-legacy-be(하위 조정). 이 PC(win30) = perm-runtime
  - D32 Oracle 시험 = `-Pdmes.ora.test=clone` 만. 기본 PDB 를 쓰지 않는다
  - D33 원격 레인은 squash 1커밋을 `perm/<레인>` 으로 push 하고 머지 요청한다. 통합 브랜치 머지·push = 조정자만
  - D34 Mac gradle = JAVA_HOME JDK 21

## 레인 표

| 레인 | PC·세션 | 브랜치 | 워크트리 |
|---|---|---|---|
| perm-core | win144-frolicking-puzzle | perm/perm-core | win144 `../dmes-perm-w1` |
| perm-bench-be | win144-memoized-river | perm/perm-bench-be | win144 `../dmes-perm-w2` |
| perm-runtime | win30 로컬 탭 | perm/perm-runtime | `C:/Users/jongik.jang/project/dmes-perm-runtime` |
| perm-fe | Mac(하위 조정) | perm/perm-fe | Mac `../dmes-perm-mac` 또는 하위 워크트리 |
| perm-legacy-be | Mac(하위 조정) | perm/perm-legacy-be | Mac 하위 워크트리 |

- 통합 브랜치 = `claude/perm-bench`(origin). 기준 = origin/dev 2619dea69
- 워크트리 = `git fetch origin` → `git worktree add <경로> -b perm/<레인> origin/claude/perm-bench`(이미 분리 HEAD 로 만든 워크트리는 `git switch -c perm/<레인>`)
- 메인 체크아웃은 건드리지 않는다

## 규율

- 소유·금지 글롭 = decompose.md §3.1. 금지 파일이 필요하면 조정 세션에 요청한다
- 다른 브랜치 미커밋 겹침 파일(`CommObjMngService`·`SecObjRepository`·`SecUserService`·seeder·`column-order.json`·shared grid/tree·`commMenuMng`·`MenuCatalog`) = 덧붙이기만. 재정렬·서식 변경 금지(D27·D28)
- 계약(§0, `security/perm/*.java` 최상위) 변경 = perm-core 만. 다른 레인은 요청
- 시험 범위 = 바뀐 모듈만. 머지 직전 1회 = 바뀐 모듈 전체. 리포 전체·E2E 전체 = 조정자 지시 때만
- RULE.md 라우팅을 따른다(OASIS = oasis-project-support·bpmn-skill·oasis-contract-check, 마이그레이션 = flyway-migration-add, 화면 = mantine-aggrid-ui, 새 공용 UI 부품 = @dk-oasis/shared 등록)
- 프로젝트·PC 설정은 각 PC 의 CLAUDE.md 와 `.coord.local.json` 을 따른다

## 머지

1. 통합 브랜치 최신을 합치고 시험
2. `node .claude/skills/_shared/node/squash-branch.mjs --onto origin/claude/perm-bench --subject "<type(scope): 요약>" --rebase`
3. 원격 레인: `git push -u origin perm/<레인>` (강제 push 금지. 다시 합치면 새 브랜치 이름 `perm/<레인>-2`)
4. `머지 요청:` 을 조정 세션에 보낸다(SHA 포함). 조정자가 ff 머지·push 한 뒤 `머지 완료` 를 알린다

## 보고

- `진행 보고:`·`질문:`·`머지 요청:`·`정리 완료:` 첫 줄 고정. `[<레인>→조정]` 으로 시작
- 사람에게 묻는 선택 창 금지. 물을 것 = 조정자에게 「질문: 배경 / 선택지 / 기본안」, 기본안으로 계속
- 기록 문서: 레인별 `docs/perm-bench/lanes/<레인>.md`(정본 메모: 할 일·진행·결정·남은 일)
