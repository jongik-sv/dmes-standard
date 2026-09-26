# TSK-09-03 build-log

## 게이트 기록

| 시각 | Phase | 명령 | 범위 | 경과 | 부하 | 결과 |
|---|---|---|---|---|---|---|
| 2026-09-26T06:34:46Z | 기준선 | `cd src/backend && … ./gradlew :mdm:test … && … check_oasis_contract.py --root .` | 모듈 | 1 | 1.65 | 기준선 재사용 (2263/0) |
| 2026-09-26T06:34:46Z | 기준선 | `cd src/frontend && pnpm --filter @dk-oasis/shared build && pnpm test:unit:shared && pnpm --filter @dk-oasis/m-mdm test && pnpm --filter @dk-oasis/m-mdm lint` | 모듈 | 31 | 6.45 | 기준선 측정 (1232/0) |

## 변이 검증 기록

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| `MdmPermissions.MATRIX`·`READ_ACTIONS`/`EDIT_ACTIONS`/`CONFIRM_ACTIONS` 는 권한 매트릭스의 단일 진실 소스다 | B1-M1 — `CONFIRM_ACTIONS` 에서 `MdmActions.CONFIRM` 제거 | `MdmOasisActionVocabularyTest.mcm_시드의_confirmActions_는_MdmPermissions_CONFIRM_ACTIONS_와_같다` | 잡힘 |
| `MdmPermissions.MATRIX`·`READ_ACTIONS`/`EDIT_ACTIONS`/`CONFIRM_ACTIONS` 는 권한 매트릭스의 단일 진실 소스다 | B1-M2 — mcm 시드 matrix 의 dmc STD_ADMIN 을 READ→EDIT 로 변경 | `MdmOasisActionVocabularyTest.mcm_시드의_그룹_역할_매트릭스는_MdmPermissions_MATRIX_와_같다` | 잡힘 |
| `DataInitializer` 의 시드 SQL(값 포함)은 고치지 않는다(B1 은 대조만 한다) — 이 변이는 그 대조가 실제로 빠진 시드를 잡는지 확인 | B1-M3 — `seedMdmLayoutMenus` 배열에서 `layoutMng` 제거(시드 호출 1건 누락) | `MdmOasisActionVocabularyTest.mcm_시드가_BPMN_23개_화면을_모두_커버한다` | 잡힘 |
| mdm 백엔드에는 서버 쪽 권한 필터가 없다 — API RBAC 는 BFF(`evaluateApiPolicy`) 한 곳(B1 이 새로 잇는 BE 키 생성↔FE 키 파싱 이음매) | B1-M4 — `rbac-policy.ts` `makeKey` 의 `.toLowerCase()` 제거 | `rbac-policy.unit.test.ts` `parseRbacKey > MDM 실제 OASIS 경로도 소문자화` | 잡힘 |
| `DRAFT 비소유자 저장·확정 거부는 dmc·dme 가 같은 VersionStateService/VersionWriteGuard/DraftOwnershipService 로 판정한다` | B2-M1 — `VersionPreconditions.requireOwner`(mdm/lib 공용, `DefaultVersionStateService.confirm` 이 부른다)의 소유자 비교를 `if (false)`로 바꿔 항상 통과시킴 | `CodeConfirmServiceSqliteTest` + `RuleConfirmServiceTest` + `DraftOwnershipCrossModuleTest`(신규, `--fail-fast`) | 잡힘(`DraftOwnershipCrossModuleTest.소유자가_아니면_dmc_dme_모두_MDM003_같은_공용_VersionStateService_판정`에서 먼저 빨강, fail-fast 로 나머지 스킵) |
| `DRAFT 비소유자 저장·확정 거부는 dmc·dme 가 같은 VersionStateService/VersionWriteGuard/DraftOwnershipService 로 판정한다` | B2-M2 — `DefaultVersionWriteGuard.beginDraftWrite`(저장 경로)의 `requireOwner(row, userId);` 호출을 지움(팀장 지시 보강 — 저장(beginDraftWrite)도 확인) | `CodeItemEditServiceSqliteTest` + `RuleTableServiceTest` + `DraftOwnershipCrossModuleTest`(신규, `--fail-fast`) | 잡힘(`DraftOwnershipCrossModuleTest.비소유자는_dmc_dme_모두_DRAFT_저장을_할_수_없다_MDM003_같은_공용_VersionWriteGuard_판정`에서 먼저 빨강, fail-fast 로 나머지 스킵) |
| `domainMng·dataItemMng 에는 DRAFT 소유권 개념이 없다(스키마에 OWNER_ID 없음)` | 해당 없음 — 스키마 부재 자체(코드 로직이 아니다). `DraftOwnershipCrossModuleTest.domainMng_dataItemMng_스키마에는_DRAFT_소유권_컬럼이_없다`가 `TB_MDM_DOMAIN`·`TB_MDM_DATA_ITEM`에 OWNER_ID/STATUS 컬럼이 없음을 SQLite `PRAGMA table_info`로 고정(변이 대상 없음) | 〃 | 해당 없음 |

변이 파일: `docs/mdm/tasks/TSK-09-03/mutations/B1-M1.mut`~`B1-M4.mut`(B1), `B2-M1.mut`~`B2-M2.mut`(B2).

## 실행 모델

| 단위 | 에이전트 | 모델 | 시험 | 승급 | 결과 | 경과 | 토큰 | advisor |
|---|---|---|---|---|---|---|---|---|
| B1 | TSK-09-03-build-B1 | sonnet | 아니오 | - | UNIT_DONE | - | - | 0 |
| B2 | TSK-09-03-build-B2 | sonnet | 아니오 | - | UNIT_DONE | - | - | 0 |
