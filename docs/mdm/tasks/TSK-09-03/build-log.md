# TSK-09-03 build-log

## 게이트 기록

| 시각 | Phase | 명령 | 범위 | 경과 | 부하 | 결과 |
|---|---|---|---|---|---|---|
| 2026-09-26T06:34:46Z | 기준선 | `cd src/backend && … ./gradlew :mdm:test … && … check_oasis_contract.py --root .` | 모듈 | 1 | 1.65 | 기준선 재사용 (2263/0) |
| 2026-09-26T06:34:46Z | 기준선 | `cd src/frontend && pnpm --filter @dk-oasis/shared build && pnpm test:unit:shared && pnpm --filter @dk-oasis/m-mdm test && pnpm --filter @dk-oasis/m-mdm lint` | 모듈 | 31 | 6.45 | 기준선 측정 (1232/0) |
| 2026-09-26T16:51 | Build B3 | `cd src/backend && … ./gradlew :mdm:api:test --tests "com.dongkuk.dmes.mdm.itest.CodeDataRuleLedgerChainTest" --no-daemon --console=plain` | 신규 시험(관련 테스트) | 20s | 1 | 통과 (1/0) |
| 2026-09-26T08:06:55Z | build | `cd src/backend && … ./gradlew :mdm:test … && … check_oasis_contract.py --root .` | 모듈 | 293 | 28.09 | 통과(부하 민감 단독) — api 1114(실패 1: 부하 민감)·lib 1157(실패로 멈춰 따로 1회, 70s)·계약 ERROR 0, 총 2271 ≥ 2263 |
| 2026-09-26T08:06:55Z | build | `cd src/frontend && pnpm --filter @dk-oasis/shared build && pnpm test:unit:shared && pnpm --filter @dk-oasis/m-mdm test && pnpm --filter @dk-oasis/m-mdm lint` | 모듈 | 99 | 21.41 | 통과 (170+1064=1234 ≥ 1232) |

env: 부하 민감, 단독 통과(CodeCateEditPerformanceSqliteTest.AC4_1000건_소속_이동_저장은_중앙값이_800ms_미만이다, 로그 /Users/jji/project/dmes-standard/.git/worktrees/dflow-5e57e895/dflow-solo-CodeCateEditPerformanceSqliteTest.log, 게이트 때 부하 28.09 → 단독 때 부하 24.87, heavy.sh --exclusive, 28s)

## 변이 검증 기록

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| `MdmPermissions.MATRIX`·`READ_ACTIONS`/`EDIT_ACTIONS`/`CONFIRM_ACTIONS` 는 권한 매트릭스의 단일 진실 소스다 | B1-M1 — `CONFIRM_ACTIONS` 에서 `MdmActions.CONFIRM` 제거 | `MdmOasisActionVocabularyTest.mcm_시드의_confirmActions_는_MdmPermissions_CONFIRM_ACTIONS_와_같다` | 잡힘 |
| `MdmPermissions.MATRIX`·`READ_ACTIONS`/`EDIT_ACTIONS`/`CONFIRM_ACTIONS` 는 권한 매트릭스의 단일 진실 소스다 | B1-M2 — mcm 시드 matrix 의 dmc STD_ADMIN 을 READ→EDIT 로 변경 | `MdmOasisActionVocabularyTest.mcm_시드의_그룹_역할_매트릭스는_MdmPermissions_MATRIX_와_같다` | 잡힘 |
| B1 의 23개 화면 커버리지 검사가 시드 호출 누락을 실제로 잡는지(검사 자체의 민감도) 확인 — 위 「단일 진실 소스」 행과 관련 규칙은 같지만 검사 대상은 다르다. design.md §5 는 이 규칙(`DataInitializer` 시드 SQL 무변경)의 1차 확인을 커밋 diff 로 지정했고, 이 변이는 그 diff 확인을 대신하지 않는다 | B1-M3 — `seedMdmLayoutMenus` 배열에서 `layoutMng` 제거(시드 호출 1건 누락) | `MdmOasisActionVocabularyTest.mcm_시드가_BPMN_23개_화면을_모두_커버한다` | 잡힘 |
| mdm 백엔드에는 서버 쪽 권한 필터가 없다 — API RBAC 는 BFF(`evaluateApiPolicy`) 한 곳(B1 이 새로 잇는 BE 키 생성↔FE 키 파싱 이음매) | B1-M4 — `rbac-policy.ts` `makeKey` 의 `.toLowerCase()` 제거 | `rbac-policy.unit.test.ts` `parseRbacKey > MDM 실제 OASIS 경로도 소문자화` | 잡힘 |
| `DRAFT 비소유자 저장·확정 거부는 dmc·dme 가 같은 VersionStateService/VersionWriteGuard/DraftOwnershipService 로 판정한다` | B2-M1 — `VersionPreconditions.requireOwner`(mdm/lib 공용, `DefaultVersionStateService.confirm` 이 부른다)의 소유자 비교를 `if (false)`로 바꿔 항상 통과시킴 | `CodeConfirmServiceSqliteTest` + `RuleConfirmServiceTest` + `DraftOwnershipCrossModuleTest`(신규, `--fail-fast`) | 잡힘(`DraftOwnershipCrossModuleTest.소유자가_아니면_dmc_dme_모두_MDM003_같은_공용_VersionStateService_판정`에서 먼저 빨강, fail-fast 로 나머지 스킵) |
| `DRAFT 비소유자 저장·확정 거부는 dmc·dme 가 같은 VersionStateService/VersionWriteGuard/DraftOwnershipService 로 판정한다` | B2-M2 — `DefaultVersionWriteGuard.beginDraftWrite`(저장 경로)의 `requireOwner(row, userId);` 호출을 지움(팀장 지시 보강 — 저장(beginDraftWrite)도 확인) | `CodeItemEditServiceSqliteTest` + `RuleTableServiceTest` + `DraftOwnershipCrossModuleTest`(신규, `--fail-fast`) | 잡힘(`DraftOwnershipCrossModuleTest.비소유자는_dmc_dme_모두_DRAFT_저장을_할_수_없다_MDM003_같은_공용_VersionWriteGuard_판정`에서 먼저 빨강, fail-fast 로 나머지 스킵) |
| `domainMng·dataItemMng 에는 DRAFT 소유권 개념이 없다(스키마에 OWNER_ID 없음)` | 해당 없음 — 스키마 부재 자체(코드 로직이 아니다). `DraftOwnershipCrossModuleTest.domainMng_dataItemMng_스키마에는_DRAFT_소유권_컬럼이_없다`가 `TB_MDM_DOMAIN`·`TB_MDM_DATA_ITEM`에 OWNER_ID/STATUS 컬럼이 없음을 SQLite `PRAGMA table_info`로 고정(변이 대상 없음) | 〃 | 해당 없음 |
| `MdmEngineConfig`의 `CodeLookup`·`MasterLookup` 빈은 등록하지 않는다(D-077, 프로덕션 불변) | B3-M1 — `MdmEngineConfig`에 운영 `CodeLookup` 빈을 실제로 하나 등록해본다(id 무엇이든 `Optional.empty()`) | `CodeDataRuleLedgerChainTest`(신규, `--fail-fast`) | 잡힘(빈이 생기자 `CodeCategoryValidator`가 UNAVAILABLE/W02 경로를 벗어나 `domainMng.save` 자체가 R10 "유효한 카테고리가 아닙니다"로 거부됨 — W02 단언 이전에 이미 빨강) |

변이 파일: `docs/mdm/tasks/TSK-09-03/mutations/B1-M1.mut`~`B1-M4.mut`(B1), `B2-M1.mut`~`B2-M2.mut`(B2), `B3-M1.mut`(B3).

## 설계 이탈 (B3)

- **MASTER 인자의 구체화**: design.md §3 B3.5 는 `MASTER("<2번 마루코드>", "<카테고리>", <3번에서 등록한 키>)`로 썼으나,
  05-master-data.md:363-364·`engine-contract.md`:68 확인 결과 마루 코드 ID·마루 데이터 ID는 "한 이름 공간"이라 같은
  문자열을 두 표에 동시에 쓸 수 없다(`MaruIdNamespace` 충돌 거부). 따라서 MASTER 의 첫 인자는 문자 그대로 "2번
  마루코드" 자체가 아니라 **3번에서 새로 등록한 마루 데이터 ID**(`CHAIN_DATA`)로 구체화했다 — "2번 마루 코드 값을
  참조"는 3번 항목의 `CODE` 값이 2번에서 확정된 실제 코드 값과 같다는 뜻으로 구현했다(원장에서 `MdmCodeLookup` 로
  직접 읽은 값을 그대로 재사용, "원장 기준 판정 일치"). `MdmCodeLookup(ledger)` 와이어링은 design 지시대로 만들었지만
  룰의 `MASTER` 평가 자체는 마루 데이터(`MasterLookup`) 쪽만 타고, 코드 쪽은 시험 코드가 원장에서 값을 읽어오는
  용도로만 쓴다(코드 쪽 `MASTER` 브랜치까지 이중으로 태우는 것은 이번 회차 범위를 벗어난다고 보고 생략).
- **DERIVE 룰 COLUMNS 저장 순서(실측)**: `RuleColumnsService.checkDeriveExprs`(S001, "산출 룰에는 결과 식을 둘
  NORMAL 행이 없습니다")는 산출(DERIVE) 룰에 결과식 변수를 추가하려면 **그 이전에 NORMAL 행이 이미 있어야** 한다
  (WGT_CALC 픽스처가 행을 먼저 JDBC 로 넣는 이유). HTTP 로만 조립해야 하는 이 itest 는 순서를 TABLE(빈 셀 NORMAL
  행 하나)→COLUMNS(결과식 변수)→TABLE(같은 행에 식 채우기) 세 번으로 나눴다.
- **TABLE 셀의 `ast` 필드**: 셀 JSON에 `"ast":""`(빈 문자열)를 실었더니 S001 "셀의 ast 값 모양이 맞지 않습니다"로
  거부됐다. `ast` 키 자체를 생략하면 통과한다(서버가 `AstExporter.export`로 항상 다시 계산해 덮어쓴다, design 문서
  주석과 일치) — `expr` 만 보낸다.
- **`ruleEdit.validate` 의 `supported` 필드**: `RuleEditService.parseExpr`의 `supported` 는 `FunctionSets.BASE`(표준
  칸용)만 보는 화면 힌트라 `MASTER`(MDM 확장 함수, `FunctionSets.MDM`)는 항상 `false`로 온다 — 저장 시 실제 게이트는
  `problems`(`ExpressionChecker.check` 결과)이고 이번 식은 `problems` 가 비어 있어(화이트리스트·참조 변수 모두
  통과) 정상이다. 처음 작성한 시험은 `supported` 를 잘못 단언해 빨강이 났다 — `problems` 로 바꿔 고쳤다.

## 실행 모델

| 단위 | 에이전트 | 모델 | 시험 | 승급 | 결과 | 경과 | 토큰 | advisor |
|---|---|---|---|---|---|---|---|---|
| B1 | TSK-09-03-build-B1 | sonnet | 아니오 | - | UNIT_DONE | - | - | 0 |
| B2 | TSK-09-03-build-B2 | sonnet | 아니오 | - | UNIT_DONE | - | - | 0 |
| B3 | TSK-09-03-build-B3 | sonnet | 아니오 | - | UNIT_DONE | 20s(신규 시험, 1만 건 판정 포함) | - | 0 |
