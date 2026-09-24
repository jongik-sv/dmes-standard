# TSK-04-04 머지 충돌 해소 기록

## 시도 1

- 기준(BASE): `origin/dev` `86baa20` · 머지 대상: `origin/agent/88a2e470-column-dictionary` `ef5275d`(merge-base `3d08db7`) · 주문 `88a2e470-4463-49fd-a8d3-a1c7cbc3eeb1`
- 승인 전 머지(`--on-report`): 서버 `status=reported`, 반려 없음. 완료 증적 `6619713` 뒤 변경은 이 Task 의 state.json 뿐이다.
- 충돌 파일 6개. 마이그레이션 관문(`migration-check.sh --staged`)은 `MIGRATION_OK`(이 브랜치는 마이그레이션을 더하지 않는다). decisions.md 는 양쪽 모두 건드리지 않았다.

| 파일 | 규약 | 판단 |
|---|---|---|
| `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/common/MdmErrorCode.java` | R1(+R3 번호) | 양쪽이 MDM014 뒤에 같은 번호 MDM015 를 붙였다(개발 브랜치 TSK-04-03 `DOMAIN_SAVE_REJECTED`, 이 브랜치 `STD_ADMIN_ROLE_REQUIRED` 외 5개). 개발 브랜치 항목은 번호·위치·문구를 그대로 두고 이 브랜치 6개를 뒤에 붙이며 코드만 한 칸씩 옮겼다(MDM015~020 → MDM016~021). 이름·HTTP 상태·운반 코드·기본 문구는 그대로다. 근거: TSK-04-03 design.md 의 "다음 번호" 규칙(개발 브랜치 최댓값 + 1)과 X3 |
| `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/common/CommonContractTest.java` | R1 | 개수 단언은 두 쪽 합(14 + 1 + 6 = 21)으로 맞췄다. TSK-04-03 design.md X3 가 이 충돌을 미리 적어 두었다("두 쪽 코드를 모두 남기고 개수를 합으로 맞춘다"). 두 쪽 시험 메서드(`TSK_04_03_이_더한_도메인_저장_거부_코드`, `TSK_04_04_가_더한_오류_코드_여섯_개`)와 헬퍼 `assertCode` 를 모두 남겼고, 이 브랜치 단언의 코드 문자열만 MDM016~021 로 옮겼다. 계약 enum 에 코드가 늘어난 사실을 반영한 것이며 기대값 완화가 아니다(문구·상태·운반 코드 단언은 그대로다) |
| `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` | R1 | 개발 브랜치 `seedMdmDomainMngMenu()` 호출 뒤에 이 브랜치의 columnMng·termRegPop 시드 블록을 붙였다. 메뉴 순번은 domainMng `5010130`, columnMng `5010140` 으로 겹치지 않는다 |
| `src/frontend/m-mcm/lib/generated/page-registry.ts` | R1 | 두 쪽 항목을 모두 남겼다. 생성 파일이라 `node scripts/generate-page-registry.mjs` 로 다시 만들어 그 결과(알파벳 순서: `dma/columnMng` → `dma/domainMng`)를 채택했다(23 pages) |
| `src/frontend/m-mdm/tsup.config.ts` | R1 | 화면 엔트리 두 줄(domainMng, columnMng)을 모두 남겼다. 개발 브랜치의 `evalex/index` 엔트리와 이 브랜치의 external 배열 줄바꿈은 자동 병합됐다 |
| `docs/guide/design/identifier-dictionary/01-modules-and-screens.md` | R1·R8 | 화면 표에 개발 브랜치 `domainMng` 행 뒤로 이 브랜치의 `columnMng`·`termRegPop` 행을 붙였다 |

코드 번호 이동에 따른 참조 정리(텍스트 충돌 밖, 이 브랜치 소유 파일만):

- `MDM015~MDM020` 을 가리키던 이 브랜치 파일의 문자열을 모두 한 칸씩 옮겼다. 그대로 두면 MDM015 가 개발 브랜치의 `DOMAIN_SAVE_REJECTED` 를 가리키게 된다.
  - R7(이 Task 폴더): `docs/mdm/tasks/TSK-04-04/design.md`. D2 절에 이동 사실을 한 줄 덧붙였다.
  - 이 브랜치가 새로 만든 문서: `docs/mdm/screens/columnMng/columnMng_기능설계서.md`.
  - 이 브랜치가 만들거나 고친 코드의 시험 메서드 이름·주석·BPMN documentation·단언 문자열: `ColumnMngServiceSqliteTest`, `TermRegPopServiceSqliteTest`, `DmaOasisHttpTest`, `MdmStdAdminGuardTest`, `MdmErrorsTest`(이슈 코드 문자열, 입력과 단언이 같은 값), `ColumnMngService`, `MdmColumnRepository`, `MdmColumnSystemRepository`, `MdmTermRepository`, `columnMng.bpmn`, `termRegPop.bpmn`, `termRegPop.tsx`, `e2e/mdm-columnMng.spec.ts`.
  - 시험 수와 단언 대상은 바뀌지 않는다(이름·주석·문자열만 바뀌었다). 개발 브랜치 쪽 파일의 MDM015 참조(TSK-04-03)는 건드리지 않았다.
- 의미 충돌 점검: 이 브랜치의 서비스·시험은 오류 코드를 enum 상수로 쓰고, 화면은 `meta.message`(기본 문구)만 쓴다. 코드 문자열에 기대는 프런트 로직은 없다(`git grep` 결과 주석 1줄뿐이다).

게이트 범위: 백엔드 `testAll --continue`(JUnit XML 의 tests 합), 프런트 `pnpm build:libs && m-mdm test && m-mdm lint`(vitest 총수). 세 커밋(BASE·MERGE_HEAD 단독·merge-base)과 머지 결과에서 같은 명령을 썼다. 보조로 `check_oasis_contract.py --root .` 가 ERROR 0 / WARN 0 이다. e2e(`mdm-columnMng.spec.ts` 등 Playwright)는 서버 기동이 필요해 총수에서 뺐다.

- 도커 금지로 생략: cd src/backend/mdm && ../gradlew :api:mssqlMigrationTest --no-daemon --console=plain

게이트: 개발 브랜치 2361 · MERGE_HEAD 단독 1433 · merge-base 1300 · 계획 삭제 0 · 하한 2494 · 결과 2494 (신규 실패 0, `GATE_PASS need=2494 total=2494`)

| 스위트 | 개발 브랜치 | MERGE_HEAD 단독 | merge-base | 하한 | 결과 |
|---|---|---|---|---|---|
| aps-core | 3 | 3 | 3 | 3 | 3 |
| cactus-core | 203 | 203 | 203 | 203 | 203 |
| caravan-core | 102 | 102 | 102 | 102 | 102 |
| caravan-hub | 78 | 78 | 78 | 78 | 78 |
| maru-mdm-engine | 1192 | 613 | 613 | 1192 | 1192 |
| mdm/api | 185 | 114 | 57 | 242 | 242 |
| mdm/lib | 303 | 274 | 218 | 359 | 359 |
| 프런트 m-mdm(vitest) | 295 | 46 | 26 | 315 | 315 |
| 합계 | 2361 | 1433 | 1300 | 2494 | 2494 |

- 모든 스위트가 하한과 같다. 사라진 시험은 없다.
