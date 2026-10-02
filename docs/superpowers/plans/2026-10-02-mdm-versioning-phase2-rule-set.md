# MDM 버전 관리 2단계 — 룰 세트 버전 관리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 룰 세트에 룰과 같은 버전 관리(DRAFT·소유자·확정·확정취소, major/minor)를 두고, 엔진은 판정 시각에 유효한 RELEASED 세트 버전으로 판정한다.

**Architecture:** `TB_MDM_RULE_SET` 은 ID·이름·설명·상태만 남기고 흐름(`FLOW_JSON`·`RULE_IDS`)과 `ROW_VERSION` 을 새 버전 표 `TB_MDM_RULE_SET_VER` 로 옮긴다(V18). 공통 버전 엔진(`VersionRowStore`·`DefaultVersionStateService`·`DefaultVersionWriteGuard`·`DefaultDraftOwnershipService`)에 대상 `RULE_SET` 을 더해 코드 변경 없이 재사용하고, 대상별로 확정 검사 SPI·DRAFT 삭제 SPI 만 구현한다. 흐름도 편집기는 내 DRAFT 에만 저장하고, 확정은 새 화면 `dme/ruleSetConfirm` 이 4가지 검사(흐름 구조·참조 룰 RELEASED·순서/순환·테스트 케이스) 뒤에 한다. 엔진 SPI 는 `ruleSet(setId, evalTs)` 로 바뀌어 운영 경로는 RELEASED 만 읽고, 디버거·테스트 케이스는 지금처럼 화면이 보낸 흐름(DRAFT 정의)을 직접 넘긴다.

**Tech Stack:** Java 21, Spring Boot, Hibernate/JPA, Flyway(SQLite), OASIS BPMN, JUnit 5 / React 19, Next.js, Mantine 9, ag-grid 33, vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-10-02-mdm-object-versioning-design.md` (§3 K1~K7, §4 공통 엔진, §6 2단계, §8 오류 처리, §11 검증 원칙). 1단계 계획 `docs/superpowers/plans/2026-10-02-mdm-versioning-phase1-rule-major-minor.md` 의 결과 위에 얹는다.

## Global Constraints

- 작업 위치: 워크트리 `/Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning`, 브랜치 `feat/mdm-versioning`. 원 작업 트리(`/Users/jji/project/dmes-standard`)의 파일·git 은 건드리지 않는다.
- git 은 `/usr/bin/git -C /Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning ...` 로 부른다(rtk 훅이 워크트리 격리 검사에 걸린다). `git stash` 금지. 같은 워크트리에서 다른 에이전트가 일하므로 **자기 작업 파일 경로만 하나씩 add** 하고(디렉터리째 add 하지 않는다 — 2026-10-02 계획 작성 시점에 `dme/ruleMng/service/RuleVersionService.java`·`dme/RuleNewVersionKindSqliteTest.java`·`pages/dme/ruleMng/*` 등 다른 작업의 미커밋 파일이 같은 디렉터리에 있었다), `index.lock` 으로 실패하면 잠시 뒤 다시 시도한다. 아래 Step 의 `<worktree>` 는 위 경로다.
- 버전 칼럼: `VER NUMERIC(7,3) NOT NULL`, `BASE_VER NUMERIC(7,3)`, `VER_KIND VARCHAR(20) NOT NULL DEFAULT 'MAJOR'` + CHECK `IN ('MAJOR','MINOR')`. 첫 버전 `1.000`, major 는 `floor(최대)+1`, minor 는 `최대+0.001`(상한 999), 채번은 1단계 `common/version/VersionNumbers` 만 쓴다.
- 버전 표 표준 칼럼(스펙 §4.1, `VersionRowStore.java:45-51`): `STATUS`·`BASE_VER`·`OWNER_ID`·`APPLY_FROM`·`APPLY_TO`·`REQUESTED_BY`·`REQUESTED_AT`·`RELEASED_AT`·`ROW_VERSION`·감사 9칼럼(감사 카운터는 `AUD_VER`). 부모 상태는 `CREATED`→`INUSE`→`DEPRECATED`, 부모 감사 카운터는 `VER`.
- 버전 비교는 `compareTo`, 바인딩·저장은 `VersionNumbers.scaled`, 같음은 `VersionNumbers.same`. `==`·`equals`·`intValueExact` 로 버전을 비교하지 않는다. SQL 의 `ORDER BY VER`·`MAX(VER)` 를 쓰지 않는다(SQLite 는 1.000 을 INTEGER, 1.001 을 REAL 로 둔다).
- 화면·DTO 계약의 세트 버전은 문자열(`"1.000"`, `VersionNumbers.plain`), 표시는 `v1.000`(`fmtVer`).
- 일시: SQLite TEXT `yyyy-MM-dd HH:mm:ss`(KST). 네이티브 쓰기는 `MdmTemporalBinder.toDb`, 판정 시각 → 벽시계는 `LocalDateTime.ofInstant(evalTs, MdmClockConfig.KST)`.
- 서비스에 `@Transactional` 을 붙이지 않는다(OASIS 파라미터 바인딩이 깨진다). 쓰기는 `TransactionTemplate`.
- 권한 action 이름은 `copy`(새 버전)·`delete`·`lock`·`unlock`·`handover`·`confirm`(스펙 §4.3). 새 action 동사를 만들지 않는다 — `delete` 는 `target`(`SET`·`VERSION`·`CONFIRM`)으로 가른다(ADR-0002 D8-13 관용구).
- SQLite 테이블 재생성은 V17 교훈을 따른다: `ALTER TABLE ... RENAME` 을 쓰지 않는다(자식 FK 갱신이 `legacy_alter_table` 설정에 따라 달라진다). 순서는 ① `_BAK` 에 제약 없이 복사 ② 옛 자식 → 옛 부모 DROP ③ 최종 이름으로 새 표 생성(부모 → 자식) ④ `_BAK` 에서 칼럼명을 모두 적어 복사 ⑤ `_BAK` DROP. PRAGMA 를 쓰지 않는다.
- 백엔드 시험은 SQLite 만, 도커 금지. JDK 21: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21`. mdm 시험은 `cd src/backend/mdm && ../gradlew :lib:test :api:test --offline`, 엔진은 `cd src/backend && ./gradlew :maru-mdm-engine:test --offline`.
- 프런트 시험은 `src/frontend/m-mdm` 에서 `rtk proxy pnpm run test`(전체), 타입 검사 `rtk proxy pnpm run lint`. 개별 파일은 `npx vitest run <경로>`.
- Flyway 새 번호는 착수 시 `flyway-migration-add` 스킬로 확인한다. 이 계획은 V18 로 적는다(1단계가 V17 을 썼다).
- `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` 는 원 작업 트리에 다른 작업의 미커밋 변경이 있다. 병합 충돌을 줄이려고 **새 메서드 추가와 호출 한 줄 추가만** 한다. 기존 줄을 고치거나 옮기지 않는다.
- 공통 화면 부품 규칙(CLAUDE.md): 업무 도메인에 묶이지 않는 새 UI 부품은 `@dk-oasis/shared` 로 등록한다. 이 계획의 새 부품(세트 버전 줄, 확정 화면)은 MDM 버전 도메인에 묶이므로 `m-mdm` 안에 둔다.
- 커밋 메시지는 Conventional Commits(`type(scope): 한국어 subject`), 끝에 빈 줄 뒤 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## 1단계 결과에 기대는 가정

이 계획은 브랜치 `feat/mdm-versioning` 의 1단계 결과가 들어와 있다고 본다. 계획을 처음 쓸 때(4008ece3)는 1단계가 작업별 커밋(812e5fb0~6ae3760d)이었고, 지금은 한 커밋 `fd67f90e`(1단계 Task 7 프런트 포함)로 합쳐져 있다. 착수 전에 아래가 그대로인지 확인한다.

| 가정 | 확인할 곳 |
|---|---|
| `VersionNumbers`(`SCALE`·`FIRST`·`maxVer`·`next`·`canMajor`·`canMinor`·`nextMajor`·`nextMinor`·`scaled`·`parse`·`same`·`plain`·`label`)와 `VersionKind {MAJOR, MINOR}` | `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/version/VersionNumbers.java`, `contract/version/VersionKind.java` |
| `VersionTarget.BUSINESS_RULE` scale 3, `VersionRowStore` 가 VER 를 문자열로 읽고 `setScale(versionScale)` 로 바인딩 | `contract/version/VersionTarget.java:10`, `common/version/VersionRowStore.java:221-261` |
| 룰 버전 문자열 계약(`RuleScreenSupport.requireVer(String)`·`optionalVer`·`verText`), `RuleVersionService.newVersion` 의 kind 처리, `RuleMngService.toFlags` 의 `canNewMajor/canNewMinor/nextMajor/nextMinor` | `dme/ruleMng/service/RuleVersionService.java:92-149`, `RuleMngService.java:248-266` |
| 엔진 `RuleDefinition.ver` 가 `BigDecimal` | `maru-mdm-engine/.../spi/DefinitionLookup.java:68-78` |
| V17 이 `_BAK` 경유 재생성 순서를 쓴다 | `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V17__rule_version_decimal.sql:1-35` |
| **1단계 Task 7(프런트) 이 끝나 있다**: `src/frontend/m-mdm/src/shell/version-format.ts`(`fmtVer`·`normVer`·`sameVer`)와 `src/shell/index.ts` export, ruleMng `RuleDetailPanel.tsx` 의 `newVersionMode="majorMinor"` 사용 | 계획 첫 작성 때는 미커밋이었고 `fd67f90e` 에 들어갔다. `/usr/bin/git -C <worktree> ls-files src/frontend/m-mdm/src/shell/version-format.ts` 가 경로를 내지 않으면 Task 10·11 을 시작하지 않는다. 이 계획의 어떤 작업도 1단계 파일을 add 하지 않는다 |
| `VersionActionBar` 의 `newVersionMode: "majorMinor"` 와 `newMajor`·`newMinor`·`onNewMajor`·`onNewMinor` props | `src/frontend/m-mdm/src/shell/VersionActionBar.tsx:37-58` |

## 스펙과 다르게(또는 스펙이 정하지 않아 새로) 판단한 점

| # | 판단 | 근거 |
|---|---|---|
| J1 | 부모 `ROW_VERSION` 을 없앤 뒤 세트명·설명은 **DRAFT 저장과 같은 트랜잭션**에서 부모에 쓴다. 따로 낙관적 잠금을 두지 않는다 | 세트명은 DRAFT 소유자만 저장할 수 있고 미적용 버전은 하나뿐(MDM006·MDM007)이라 동시에 쓰는 사람이 한 명이다. 룰 헤더(`RuleHeaderService.saveHeader`)는 버전과 따로 저장해 감사 카운터 잠금이 필요했지만 세트는 저장 단추가 하나다 |
| J2 | 폐기·되살리기는 부모 상태 조건부 UPDATE 만 한다(`rowVersion` 을 받지 않는다). 폐기는 룰 폐기(`RuleHeaderService.deprecate`)처럼 계산 상태 INUSE·미적용 버전 없음일 때만 | 부모에 행 버전이 없다. 룰 폐기와 같은 규칙 |
| J3 | 이행 데이터: `APPLY_FROM = '2000-01-01 00:00:00'`(일괄, Ruling P2-11), `RELEASED_AT = COALESCE(U_AT, C_AT, '2000-01-01 00:00:00')`(epoch 밀리초 정수는 KST 문자열로 정규화), `OWNER_ID = NULL`, `REQUESTED_BY = U_USR_ID` | RELEASED 는 `APPLY_FROM` 이 필수다(CHECK). `APPLY_FROM = C_AT` 로 두면 엔진이 판정 시각으로 세트 버전을 고를 때 `C_AT` 보다 이른 시각(과거 데이터, 세트 케이스 `EVAL_TS`)에서 `SET_NOT_FOUND` 가 난다 — 스펙 §6 이행 한계(이행 이전 시각에는 이행 시점의 흐름)와 맞춘다. 확정한 사람이 없으므로 소유자는 비운다 |
| J4 | 시험 픽스처 `DmeTestSupport.ruleSet` 의 1.000 RELEASED 는 `APPLY_FROM='2000-01-01 00:00:00'` | 기존 시험이 `2026-01-01` 보다 이른 판정 시각을 쓸 수 있다. 엔진이 판정 시각으로 세트 버전을 고르게 되면 늦은 `APPLY_FROM` 은 `SET_NOT_FOUND` 로 기존 시험을 깬다 |
| J5 | 새 버전 버튼은 마스터코드 `NewVersionModal` 을 공용으로 올리지 않고 `VersionActionBar` 의 major·minor **두 버튼**으로 한다 | 1단계 룰이 같은 방식을 썼다(룰·세트는 "빈 버전/복원" 선택이 없어 모달이 필요 없다) |
| J6 | `delete` 의 `target` 은 필수(`SET`·`VERSION`·`CONFIRM`). 비면 INVALID_VALUE | 룰 `RuleMngService.delete` 와 같다. 기본값을 두면 화면이 실수로 폐기를 보낼 수 있다 |
| J7 | 확정 검사 4(테스트 케이스)의 판정 시각은 케이스 `EVAL_TS`, 없으면 요청한 `apply_from` | 확정 뒤 이 버전이 실제로 쓰일 시각의 룰 버전으로 돌려야 의미가 있다. 룰 확정은 현재 시각을 쓰지만 룰은 다른 룰을 부르지 않는다 |
| J8 | 확정 검사 1(흐름 구조)·3(순서·순환)은 **`apply_from` 시점의 RELEASED 룰 버전**으로 계산한 입출력(`RuleIoReader.readAt`)으로 돌린다. 저장 시 검사(최신 RELEASED)와 결과가 다를 수 있다 | 스펙 §6 검사 2·3 이 "그 룰 버전들로" 라고 정했다 |
| J9 | `ruleSetConfirm` 화면은 `ruleConfirm` 의 `ConfirmModal`·`checks.ts`(`canConfirm`·`splitWarnings`·`toServerDateTime`)를 import 해 쓴다. 검사 항목 제목은 세트용 표(`SET_CHECK_TITLES`)를 따로 둔다 | 두 화면의 확정 흐름(검사 → 적용 시각 → 경고 확인 → 확정)이 같다. 복제하면 고칠 곳이 둘이 된다 |
| J10 | 룰 확정 때 세트 순서 검사의 기준 시각은 확정 요청의 `apply_from`, 룰 저장(표·열 설정) 때는 현재 시각이다 | 저장 때는 아직 `apply_from` 이 없다. 현재 시각 이후 유효한 세트 버전(지금 것 + 예약된 것)을 보는 것이 같은 뜻이다 |
| J11 | 세트 목록(`ruleSetMng`)과 활용처·세트 고르기는 "표시 버전" = 지금 적용 중인 RELEASED, 없으면 VER 가 가장 큰 버전으로 계산한다. 목록에 `ver` 열을 하나 더한다 | 버전이 여럿이 되면 목록이 어느 흐름으로 계산했는지 보여야 한다 |
| J12 | 세트 등록(`ruleSetMng.reg`)은 부모 `CREATED` + `1.000 MAJOR DRAFT`(소유자 = 등록자) 를 만든다 | 룰 등록(`RuleMngService.register`, "VER 1 DRAFT 자동 선점")과 같다 |
| J13 | D-135 스펙은 C-D2·§0·§14 외에 **버전 도입으로 틀린 말이 되는 문장**(§1.1 `CALL_SET_IDS` 위치와 V16 번호, §6 의 "INUSE 부모", §8 조회 서명)만 고친다. D-136 모델 반영은 이 계획 밖이다 | 사용자 지시 범위(C-D2·§14) + 고치지 않으면 다음 SDD 가 틀린 표에 칸을 더한다 |

## Review Focus

시험이 잘 건드리지 않지만 사용자가 가장 먼저 부딪힐 상황이다. 각 줄의 시험은 담당 작업에 넣었다.

1. **자동 저장 중에 그 DRAFT 가 다른 곳에서 확정·넘기기·삭제됨** — 서버는 MDM002(DRAFT 아님)·MDM003(소유자 아님)을 돌려준다. 자동 저장이 2초마다 같은 거부를 되풀이하면 안 되고, 꺼진 뒤 읽기 전용으로 다시 불러와야 한다. → Task 10 Step 1 `auto-save-stale.test.ts`.
2. **편집 중(dirty) 버전 바꾸기·버전 버튼 누르기** — 저장이 다른 버전으로 가거나 변경이 조용히 사라지면 안 된다. 버전 선택은 dirty 확인을 거치고, 새 버전을 만든 직후에는 그 DRAFT 로 바로 옮긴다. → Task 10 Step 1 `version-row.test.ts`.
3. **버전이 하나도 없는 세트**(유일한 DRAFT 를 삭제한 경우) — view 가 깨지지 않고 빈 흐름·읽기 전용으로 열리며 새 버전(major) 만 켜진다. → Task 5 `RuleSetVersionViewSqliteTest.noVersionsOpensEmptyReadOnly`, Task 6 `RuleSetVersionOpsSqliteTest.deleteOnlyDraftLeavesNoVersion`.
4. **한 세트의 RELEASED 가 여럿 걸리는 룰 확정**(지금 버전 + 예약된 미래 버전) — 세트 순서 검사가 기준 시각 이후 유효한 버전을 모두 보고, 이슈 문구에 세트 버전(`세트 S v1.000:`)을 넣으며, 같은 (세트, 버전)의 같은 이슈는 한 번만 낸다. DRAFT 버전은 보지 않는다. → Task 9 `RuleLedgerChecksTest.reportsOncePerSetVersionWithLabel`.
5. **룰의 유일한 RELEASED 를 확정취소(ADR-0002 D8-10)** — 그 룰을 담은 세트 DRAFT 의 확정 검사 2가 REJECTED 이고, 세트 저장은 막히지 않는다(경고만). 다시 확정하면 풀린다. → Task 7 `RuleSetConfirmChecksSqliteTest.ruleCancelConfirmBlocksSetConfirm`.

---

## File Structure

| 파일 | 책임 |
|---|---|
| Modify `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/version/VersionTarget.java` | `RULE_SET("TB_MDM_RULE_SET_VER", 3)` |
| Modify `.../common/version/DefaultVersionTableRegistry.java` | RULE_SET 명세 |
| Create `.../common/version/VersionedRow.java` | 버전 행 읽기 인터페이스(`getVer`·`getStatus`·`getApplyFrom`·`getApplyTo`) — 룰·세트 버전 엔티티 공통 |
| Modify `.../common/rule/RuleVersions.java` | 메서드를 `<T extends VersionedRow>` 제네릭으로, `currentOrLatest`·`releasedValidFrom` 추가 |
| Create `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V18__rule_set_version.sql` | 세트 부모 축소·버전 표 생성·이행 |
| Modify `.../entity/MdmRuleSet.java`; Create `.../entity/MdmRuleSetVer.java`, `MdmRuleSetVerId.java`; Create `.../repository/MdmRuleSetVerRepository.java` | 엔티티 |
| Create `.../common/rule/RuleSetVersionQueries.java` | 세트 버전 읽기 한 곳(버전 목록·묶음 읽기·표시 버전·멤버 룰) |
| Modify `.../dme/ruleSetEdit/service/RuleSetWrites.java` | 부모·버전 행 네이티브 쓰기 |
| Modify `.../dme/ruleSetEdit/service/RuleSetEditService.java` | view(버전 선택)·DRAFT 저장·delete target·restore·copy/lock/unlock/handover 위임 |
| Create `.../dme/ruleSetEdit/service/RuleSetVersionService.java` | 새 버전·DRAFT 삭제·확정취소·선점·해제·넘기기 |
| Create `.../dme/ruleSetEdit/dto/RuleSetVersionRequest.java`, `RuleSetVersionResult.java`; Modify `RuleSetSaveRequest.java`, `RuleSetViewRequest.java`, `RuleSetViewResult.java`, `RuleSetStatusResult.java` | 계약 |
| Modify `.../dme/ruleSetMng/service/RuleSetMngService.java`, `dto/RuleSetListRow.java`, `dto/RuleSetRegResult.java` | 표시 버전으로 목록 계산, 등록 = CREATED + 1.000 DRAFT |
| Create `.../common/rule/RuleSetDraftDeletionHook.java` | RULE_SET DRAFT 삭제 SPI(할 일 없음) |
| Create `.../contract/rule/MdmRuleSetConfirmCheckItem.java` | 확정 검사 4항목 |
| Create `.../common/rule/confirm/RuleSetConfirmReport.java`, `RuleSetConfirmChecks.java`, `RuleSetConfirmCheck.java`, `RuleSetVersionDiffs.java` | 확정 검사(순수 보고서·원장 읽기·SPI·흐름 diff) |
| Modify `.../common/rule/RuleIoReader.java` | `readAt(ids, at, scope)` — 시각 기준 RELEASED 입출력 |
| Create `.../dme/ruleSetConfirm/service/RuleSetConfirmService.java`, `dto/RuleSetConfirmSearchRequest.java`, `RuleSetConfirmViewRequest.java`, `RuleSetConfirmValidateRequest.java`, `RuleSetConfirmRequest.java` | 확정 화면 OASIS 진입 |
| Create `src/backend/mdm/api/src/main/resources/services/dme/ruleSetConfirm.bpmn`; Modify `services/dme/ruleSetEdit.bpmn` | BPMN |
| Modify `.../common/rule/check/RuleSaveContext.java`, `RuleCheckInput.java`, `RuleSaveValidator.java`, `check/ledger/RuleSetOrderCheck.java`, `confirm/RuleConfirmChecks.java`, `confirm/RuleConfirmCheck.java`, `dme/ruleConfirm/service/RuleConfirmService.java` | 룰 확정 때 세트 순서 검사 대상 = `apply_from` 이후 유효한 세트 RELEASED 버전 |
| Modify `.../common/rule/RuleUsageFinder.java`, `common/rule/RuleSetRunner.java`, `common/rule/definition/StoredDefinitionLookup.java`, `SingleRuleDefinitionLookup.java`, `common/engine/MdmEngineConfig.java`, `dma/domainMng/service/DomainTestCaseRunner.java` | 세트 읽기 경로 |
| Modify `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java`, `rule/MdmRuleEngine.java` | `ruleSet(setId, evalTs)` |
| Modify `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` | `ruleSetConfirm` OBJECT·메뉴·RBAC 시드 |
| Modify `src/frontend/m-mdm/pages/dme/ruleSetEdit/{types.ts,api.ts,page.tsx,state/useRuleSetEdit.ts,state/useAutoSave.ts,canvas/FlowToolbar.tsx}`; Create `pages/dme/ruleSetEdit/panels/SetVersionRow.tsx`; Modify `src/dme/oasis-call.ts` | 편집기 버전 선택·버튼·DRAFT 전용 저장 |
| Create `src/frontend/m-mdm/pages/dme/ruleSetConfirm/{page.tsx,api.ts,types.ts,checks.ts}`; Modify `src/frontend/m-mdm/tsup.config.ts`, `src/frontend/m-mcm/lib/generated/page-registry.ts` | 세트 확정 화면 |
| Modify `src/frontend/m-mdm/pages/dme/ruleSetMng/{types.ts,page.tsx}` | 목록 버전 열 |
| Modify `src/frontend/e2e/mdm-ruleSetEdit.spec.ts`, `mdm-ruleSetMng.spec.ts`, `fixtures/mdm-ruleSet-data.sql`, `fixtures/mdm-ruleEdit-data.sql`; Create `src/frontend/e2e/mdm-ruleSetConfirm.spec.ts` | e2e |
| Modify `docs/mdm/engine-contract.md`, `docs/mdm/adr/0002-version-confirm-without-approval.md`, `docs/mdm/adr/0005-rule-set-runs-in-engine.md`, `docs/mdm/PRD.md`, `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`, `docs/mdm/erd/06-business-rule.{mmd,sqlite.sql}`, `docs/mdm/erd/verify/expected-columns.json`, `docs/superpowers/specs/2026-10-01-rule-set-flow-subset-call-design.md`; 원천 `/Users/jji/project/mdm/docs/design/basic/06-business-rule.md`(git 밖) | 문서 |

작업 순서와 커밋 경계: Task 2(마이그레이션)는 Task 3(저장 위치 이행)과 함께 커밋한다 — V18 이 칼럼을 지우는 순간 옛 엔티티·쓰기가 모두 깨지기 때문이다. Task 3 은 **동작을 바꾸지 않고 저장 위치만** 옮긴다(저장은 임시로 "표시 버전" 행에 쓴다). DRAFT 전용 저장은 Task 5 가, 엔진 판정 시각 선택은 Task 4 가 얹는다. 엔진 SPI 변경(Task 4)은 엔진과 mdm 을 한 커밋에 바꾼다(엔진만 커밋하면 mdm 이 컴파일되지 않는다).

---


### Task 1: 공통 버전 엔진에 대상 `RULE_SET` 을 더한다

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/version/VersionTarget.java:3-10`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/version/DefaultVersionTableRegistry.java:22-29`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/rule/MdmRuleSetConfirmCheckItem.java`
- Create: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/RuleSetConfirmCheckStub.java`
- Create: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/RuleSetDraftDeletionStub.java`
- Modify: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/ContractStubCompileTest.java:80-81,142`
- Modify: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/version/VersionContractTest.java:72-80`
- Modify: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/version/DefaultVersionTableRegistryTest.java` (명세 시험 하나 추가)

**Interfaces:**
- Consumes: 1단계 `VersionTarget`(MASTER_CODE·BUSINESS_RULE scale 3)
- Produces:
  - `VersionTarget.RULE_SET` — `versionTable() = "TB_MDM_RULE_SET_VER"`, `versionScale() = 3`
  - `DefaultVersionTableRegistry.spec(RULE_SET) = new VersionTableSpec("TB_MDM_RULE_SET_VER", "MARU_RULE_SET_ID", "VER", "TB_MDM_RULE_SET", "MARU_RULE_SET_ID", "AUD_VER", "VER")`
  - `enum MdmRuleSetConfirmCheckItem { FLOW_STRUCTURE, RULES_RELEASED, ORDER, TEST_CASES }` — `MdmCheckIssue.field` 에 담는 항목 이름

`VersionSpiRegistry` 는 대상마다 SPI 가 없으면 그 대상의 확정·삭제만 `IllegalStateException` 으로 막는다(fail-closed, `VersionSpiRegistry.java:30-44`). 이 작업에서는 운영 SPI 가 아직 없지만 기동은 깨지지 않는다. 운영 SPI 는 Task 6(삭제)·Task 7(확정)이 더한다.

- [ ] **Step 1: 실패하는 시험 작성**

`VersionContractTest.java:72-80` 의 대상 목록 시험을 바꾼다.

```java
    @Test
    void 버전_대상은_04_마스터코드와_06_업무기준과_룰_세트다() {
        assertEquals(List.of("MASTER_CODE", "BUSINESS_RULE", "RULE_SET"),
                Arrays.stream(VersionTarget.values()).map(Enum::name).toList());
        assertEquals("TB_MDM_CODE_VER", VersionTarget.MASTER_CODE.versionTable());
        assertEquals(3, VersionTarget.MASTER_CODE.versionScale());
        assertEquals("TB_MDM_RULE_VER", VersionTarget.BUSINESS_RULE.versionTable());
        assertEquals(3, VersionTarget.BUSINESS_RULE.versionScale());
        assertEquals("TB_MDM_RULE_SET_VER", VersionTarget.RULE_SET.versionTable());
        assertEquals(3, VersionTarget.RULE_SET.versionScale());
    }
```

`DefaultVersionTableRegistryTest` 의 `업무기준_명세()` 아래에 더한다.

```java
    @Test
    void 룰_세트_명세() {
        VersionTableSpec spec = registry.spec(VersionTarget.RULE_SET);
        assertEquals(new VersionTableSpec("TB_MDM_RULE_SET_VER", "MARU_RULE_SET_ID", "VER", "TB_MDM_RULE_SET", "MARU_RULE_SET_ID",
                "AUD_VER", "VER"), spec);
    }
```

`ContractStubCompileTest.java:80-81` 의 목록과 `:142` 의 훅 목록에 새 스텁을 넣는다(두 시험은 `EnumSet.allOf(VersionTarget.class)` 를 요구한다).

```java
    private static final List<VersionConfirmCheckSpi> CONFIRM_CHECKS = List.of(
            new MasterCodeConfirmCheckStub(), new BusinessRuleConfirmCheckStub(), new RuleSetConfirmCheckStub());
```

```java
        List<VersionDraftDeletionSpi> hooks = List.of(new MasterCodeDraftDeletionStub(), new BusinessRuleDraftDeletionStub(),
                new RuleSetDraftDeletionStub());
```

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mdm && export JAVA_HOME=/opt/homebrew/opt/openjdk@21 && ../gradlew :lib:test --tests '*VersionContractTest' --tests '*DefaultVersionTableRegistryTest' --tests '*ContractStubCompileTest' --offline`
Expected: 컴파일 실패(`VersionTarget.RULE_SET`·`RuleSetConfirmCheckStub` 없음)

- [ ] **Step 3: 구현**

`VersionTarget`:

```java
/**
 * 버전 상태 서비스를 함께 쓰는 대상 — PRD FR-F1(04·06). 버전 칼럼 scale 은 04 {@code DECIMAL(7,3)}(04:994),
 * 06 도 D-144 부터 NUMERIC(7,3). 룰 세트(RULE_SET)는 D-144 2단계에 더했다(스펙 §4.2).
 */
public enum VersionTarget {

    MASTER_CODE("TB_MDM_CODE_VER", 3),
    BUSINESS_RULE("TB_MDM_RULE_VER", 3),
    RULE_SET("TB_MDM_RULE_SET_VER", 3);
```

`DefaultVersionTableRegistry.spec` switch 에 더한다.

```java
            case RULE_SET -> new VersionTableSpec(target.versionTable(), "MARU_RULE_SET_ID", "VER",
                    "TB_MDM_RULE_SET", "MARU_RULE_SET_ID", AUDIT_COUNTER, PARENT_AUDIT_COUNTER);
```

`MdmRuleSetConfirmCheckItem`:

```java
package com.dongkuk.dmes.mdm.contract.rule;

/**
 * 룰 세트 확정 검사 항목(D-144 2단계, 스펙 §6). {@code MdmCheckIssue.field} 에 이 항목 이름({@code name()})을 담는다.
 * apply_from 순서는 공통 서비스({@code ApplyFromOrderCheck})가 본다.
 */
public enum MdmRuleSetConfirmCheckItem {
    /** 흐름 구조 — 세트 저장 시 검사(RuleSetAnalyzer) 가운데 순서·순환·RELEASED 없음 밖의 항목. */
    FLOW_STRUCTURE,
    /** 흐름의 룰마다 apply_from 시점에 RELEASED 버전이 있다. */
    RULES_RELEASED,
    /** apply_from 시점 룰 버전들로 본 순서·순환·형제 읽기. */
    ORDER,
    /** 기대값이 있는 테스트 케이스 전부 통과, 실행 실패 없음. */
    TEST_CASES
}
```

`RuleSetConfirmCheckStub`(lib 시험 스텁, 가치는 컴파일):

```java
package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleSetConfirmCheckItem;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** D-144 2단계 — 룰 세트 확정 검사 SPI 스텁. diff 키는 {@code NODE:<노드 ID>}·{@code EDGE:<선 ID>}(RuleSetVersionDiffs 와 같은 관례). */
public class RuleSetConfirmCheckStub implements VersionConfirmCheckSpi {

    @Override
    public VersionTarget target() {
        return VersionTarget.RULE_SET;
    }

    @Override
    public VersionDiff diff(VersionRef draft) {
        VersionRef base = new VersionRef(VersionTarget.RULE_SET, draft.objectId(), draft.ver().subtract(BigDecimal.ONE));
        VersionDiffEntry changed = new VersionDiffEntry("NODE:r1", DiffKind.CHANGED,
                Map.of("kind", "RULE", "ruleId", "R_OLD"), Map.of("kind", "RULE", "ruleId", "R_NEW"));
        return new VersionDiff(base, draft, List.of(changed));
    }

    @Override
    public ConfirmCheckResult check(ConfirmCheckRequest request) {
        MdmCheckIssue error = new MdmCheckIssue(MdmErrorCode.CONFIRM_CHECK_FAILED.code(),
                "R_NEW 에 적용 시각의 RELEASED 버전이 없습니다", MdmRuleSetConfirmCheckItem.RULES_RELEASED.name(), "RULE:R_NEW");
        return new ConfirmCheckResult(List.of(error), List.of());
    }
}
```

`RuleSetDraftDeletionStub`:

```java
package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.util.ArrayList;
import java.util.List;

/** D-144 2단계 — 룰 세트 DRAFT 삭제 훅 스텁. 세트 버전 행에는 자식 표가 없어 실구현도 빈 구현이다. */
public class RuleSetDraftDeletionStub implements VersionDraftDeletionSpi {

    public final List<VersionRef> calls = new ArrayList<>();

    @Override
    public VersionTarget target() {
        return VersionTarget.RULE_SET;
    }

    @Override
    public void beforeDraftDelete(VersionRef draft) {
        calls.add(draft);
    }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd src/backend/mdm && ../gradlew :lib:test --offline`
Expected: PASS. (`DefaultVersionTableRegistryTest.감사_카운터는_버전_테이블_AUD_VER_부모_VER_이고_업무_버전_칼럼은_VER_다` 가 RULE_SET 도 돈다.)

Run: `cd src/backend/mdm && ../gradlew :api:test --tests '*VersionScenario*' --tests '*VersionStateService*' --tests '*BusinessRuleVersionScenario*' --offline`
Expected: PASS (시나리오 설정의 후처리기 `VersionScenarioTestConfig.removeProductionVersionSpisShadowedByFakes` 는 운영 SPI 정의만 지우므로 RULE_SET 이 늘어도 기동한다).

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/version/VersionTarget.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/version/DefaultVersionTableRegistry.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/rule/MdmRuleSetConfirmCheckItem.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/RuleSetConfirmCheckStub.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/RuleSetDraftDeletionStub.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/ContractStubCompileTest.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/version/VersionContractTest.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/version/DefaultVersionTableRegistryTest.java
/usr/bin/git -C <worktree> commit -m "feat(mdm): 공통 버전 엔진에 룰 세트 대상과 확정 검사 항목을 더한다"
```

---

### Task 2: V18 마이그레이션 — 룰 세트 버전 표

**Files:**
- Create: `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V18__rule_set_version.sql`
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmBusinessRuleExpectations.java:18-20,26-27,47-70,78,104-108`
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmSharedContractMigrationTest.java:64,81-83`
- Test (Create): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmRuleSetVersionMigrationTest.java`

**Interfaces:**
- Consumes: V8(`TB_MDM_RULE_SET` 처음 정의, `V8__create_mdm_business_rule.sql:186-205`)·V14(`FLOW_JSON`)·V15(`TB_MDM_RULE_SET_TEST_CASE` 와 FK `FK_TB_MDM_RULE_SET_TEST_CASE_SET`, `V15__create_mdm_rule_set_test_case.sql:6-7` 주의 문구)
- Produces:
  - `TB_MDM_RULE_SET(MARU_RULE_SET_ID, MARU_RULE_SET_NAME, DESCRIPTION, STATUS, 감사 9칼럼(VER))` — STATUS CHECK `CREATED·INUSE·DEPRECATED`, 기본 `CREATED`
  - `TB_MDM_RULE_SET_VER(MARU_RULE_SET_ID, VER, VER_KIND, STATUS, BASE_VER, OWNER_ID, APPLY_FROM, APPLY_TO, RULE_IDS, FLOW_JSON, REQUESTED_BY, REQUESTED_AT, RELEASED_AT, ROW_VERSION, 감사 9칼럼(AUD_VER))` — PK `(MARU_RULE_SET_ID, VER)`, FK `FK_TB_MDM_RULE_SET_VER_SET` → `TB_MDM_RULE_SET`
  - `TB_MDM_RULE_SET_TEST_CASE` 는 V15 정의 그대로(세트 단위), FK 이름도 그대로

**이 작업은 커밋하지 않는다.** V18 이 `TB_MDM_RULE_SET` 의 `RULE_IDS`·`FLOW_JSON`·`ROW_VERSION` 을 지우면 `MdmRuleSet` 엔티티·`RuleSetWrites`·`RuleQueries.allSets` 를 쓰는 모든 경로가 깨진다(`application-local.yml:14` 가 `ddl-auto: none` 이라 기동은 되지만 첫 쿼리가 실패한다). Step 5 에서 스테이징만 하고 Task 3 과 함께 커밋한다(1단계 Task 3→5 선례).

- [ ] **Step 1: 실패하는 시험 작성**

1단계 `MdmRuleVersionDecimalMigrationTest` 와 같은 준비 — V17 까지 적용한 DB 에 옛 모양 데이터를 넣고 V18 을 적용한다.

```java
package com.dongkuk.dmes.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** D-144 2단계 — V18 이 기존 세트를 1.000 MAJOR RELEASED 로 옮기고 케이스·FK 를 살리는지. */
class MdmRuleSetVersionMigrationTest {

    @TempDir
    Path dir;

    private Flyway flyway(String url, String target) {
        return Flyway.configure().dataSource(url, null, null)
                .locations("classpath:db/migration/mdm/sqlite").target(target).load();
    }

    @Test
    void existingSetsBecomeReleasedMajorOneAndCasesSurvive() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("m.db") + "?foreign_keys=true";
        flyway(url, "17").migrate();
        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            s.execute("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS, FLOW_JSON, DESCRIPTION, STATUS, ROW_VERSION,"
                    + " C_USR_ID, C_AT, U_USR_ID, U_AT, VER) VALUES ('S_LINE','한 줄','[\"R1\",\"R2\"]',NULL,'설명','INUSE',4,"
                    + " 'kim','2026-08-26 10:00:00','lee','2026-09-01 11:00:00',3)");
            s.execute("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS, FLOW_JSON, STATUS, ROW_VERSION, VER)"
                    + " VALUES ('S_FLOW','흐름','[\"R1\"]','{\"version\":1,\"nodes\":[],\"edges\":[]}','DEPRECATED',2,0)");
            s.execute("INSERT INTO TB_MDM_RULE_SET_TEST_CASE (MARU_RULE_SET_ID, CASE_ID, CASE_NAME, INPUT_JSON) VALUES ('S_LINE',1,'c1','{}')");
        }
        flyway(url, "18").migrate();
        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            ResultSet p = s.executeQuery("SELECT MARU_RULE_SET_NAME, DESCRIPTION, STATUS, VER FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID='S_LINE'");
            assertThat(p.next()).isTrue();
            assertThat(p.getString(1)).isEqualTo("한 줄");
            assertThat(p.getString(2)).isEqualTo("설명");
            assertThat(p.getString(3)).isEqualTo("INUSE");
            assertThat(p.getLong(4)).isEqualTo(3L);

            ResultSet v = s.executeQuery("SELECT CAST(VER AS VARCHAR(40)), VER_KIND, STATUS, APPLY_FROM, APPLY_TO, RULE_IDS, FLOW_JSON,"
                    + " ROW_VERSION, RELEASED_AT, OWNER_ID, REQUESTED_BY FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID='S_LINE'");
            assertThat(v.next()).isTrue();
            assertThat(new BigDecimal(v.getString(1)).setScale(3)).isEqualByComparingTo("1.000");
            assertThat(v.getString(2)).isEqualTo("MAJOR");
            assertThat(v.getString(3)).isEqualTo("RELEASED");
            assertThat(v.getString(4)).isEqualTo("2026-08-26 10:00:00");
            assertThat(v.getString(5)).isEqualTo("9999-12-31 00:00:00");
            assertThat(v.getString(6)).isEqualTo("[\"R1\",\"R2\"]");
            assertThat(v.getString(7)).isNull();
            assertThat(v.getLong(8)).isEqualTo(4L);
            assertThat(v.getString(9)).isEqualTo("2026-09-01 11:00:00");
            assertThat(v.getString(10)).isNull();
            assertThat(v.getString(11)).isEqualTo("lee");
            assertThat(v.next()).isFalse();

            // C_AT·U_AT 가 NULL 인 행 — APPLY_FROM·RELEASED_AT 은 2000-01-01 00:00:00, 폐기 상태는 부모에 남는다
            ResultSet f = s.executeQuery("SELECT v.APPLY_FROM, v.RELEASED_AT, v.FLOW_JSON, p.STATUS FROM TB_MDM_RULE_SET_VER v"
                    + " JOIN TB_MDM_RULE_SET p ON p.MARU_RULE_SET_ID = v.MARU_RULE_SET_ID WHERE v.MARU_RULE_SET_ID='S_FLOW'");
            assertThat(f.next()).isTrue();
            assertThat(f.getString(1)).isEqualTo("2000-01-01 00:00:00");
            assertThat(f.getString(2)).isEqualTo("2000-01-01 00:00:00");
            assertThat(f.getString(3)).isEqualTo("{\"version\":1,\"nodes\":[],\"edges\":[]}");
            assertThat(f.getString(4)).isEqualTo("DEPRECATED");

            assertThat(count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_SET_TEST_CASE WHERE MARU_RULE_SET_ID='S_LINE'")).isEqualTo(1);
            assertThat(s.executeQuery("PRAGMA foreign_key_check").next()).isFalse();
            assertThat(columns(s, "TB_MDM_RULE_SET")).doesNotContain("RULE_IDS", "FLOW_JSON", "ROW_VERSION");
            assertThat(typeOf(s, "TB_MDM_RULE_SET_VER", "VER")).isEqualTo("NUMERIC(7,3)");

            // 새 상태 CREATED·minor 버전 저장과 FK·APPLY CHECK 거부가 동작한다
            s.execute("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, STATUS) VALUES ('S_NEW','새','CREATED')");
            s.execute("INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, VER_KIND, STATUS, RULE_IDS) VALUES ('S_NEW',1.001,'MINOR','DRAFT','[]')");
            assertThatThrownBy(() -> s.execute(
                    "INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, STATUS, RULE_IDS) VALUES ('NO_SUCH',1,'DRAFT','[]')"))
                    .hasMessageContaining("FOREIGN KEY");
            assertThatThrownBy(() -> s.execute(
                    "INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, STATUS, RULE_IDS) VALUES ('S_NEW',2,'RELEASED','[]')"))
                    .hasMessageContaining("CK_TB_MDM_RULE_SET_VER_APPLY");
        }
    }

    private static int count(Statement s, String sql) throws Exception {
        ResultSet r = s.executeQuery(sql);
        r.next();
        return r.getInt(1);
    }

    private static List<String> columns(Statement s, String table) throws Exception {
        List<String> out = new ArrayList<>();
        ResultSet r = s.executeQuery("PRAGMA table_info(" + table + ")");
        while (r.next()) {
            out.add(r.getString("name"));
        }
        return out;
    }

    private static String typeOf(Statement s, String table, String column) throws Exception {
        ResultSet r = s.executeQuery("PRAGMA table_info(" + table + ")");
        while (r.next()) {
            if (column.equals(r.getString("name"))) {
                return r.getString("type");
            }
        }
        return null;
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mdm && ../gradlew :api:test --tests '*MdmRuleSetVersionMigrationTest' --offline`
Expected: FAIL (V18 이 없어 `TB_MDM_RULE_SET_VER` 없음)

- [ ] **Step 3: 마이그레이션 작성** — 전체 내용이다(칼럼 순서는 업무 칼럼 + 감사 9칼럼 불변식, `MdmBusinessRuleMigrationTest`).

```sql
-- 2026-10-02 — 룰 세트를 버전 단위로 바꾼다(D-144 2단계, ADR-0006). 흐름(FLOW_JSON·RULE_IDS)과 ROW_VERSION 을 버전 표로 옮긴다.
--
-- 왜: 룰 세트도 룰처럼 DRAFT 에 저장하고 확정해야 운영에 반영한다(스펙 §6). 부모 TB_MDM_RULE_SET 은 ID·이름·설명·상태만 남기고
-- 상태에 CREATED 를 더한다(첫 확정 때 공통 엔진이 INUSE 로 올린다, markParentInUse).
-- 이행: 기존 세트마다 1.000 MAJOR RELEASED 한 행. APPLY_FROM = 일괄 2000-01-01 00:00:00(Ruling P2-11), APPLY_TO = 9999-12-31 00:00:00,
--   RELEASED_AT = U_AT(없으면 C_AT, 그것도 없으면 2000-01-01 00:00:00), REQUESTED_BY = U_USR_ID, OWNER_ID 는 비운다(확정한 사람이 없다).
--   폐기 세트는 부모 DEPRECATED 를 유지한다.
-- 한계: 지금까지 세트는 덮어쓰기 저장이라 이전 흐름이 남아 있지 않다. 과거 판정 재현(스펙 목적 3)은 이행 시점 이후부터 보장된다.
--   이행 이전 시각(C_AT 보다 이른 시각 포함)에는 이행 시점의 흐름이 쓰인다.
-- (확정본은 리포의 V18 파일이 정본이다 — 일시 정규화(epoch 밀리초 → KST) 주석·SQL 이 이 사본보다 많다.)
--
-- 순서(V17 교훈): ALTER TABLE ... RENAME 의 자식 FK 갱신은 legacy_alter_table 설정에 따라 달라진다. 이름 바꿈 없이
--   ① 옛 부모·자식(TB_MDM_RULE_SET_TEST_CASE — V15 가 만든 이 세트의 첫 FK)을 제약 없는 _BAK 으로 복사 ② 옛 자식 → 옛 부모 DROP
--   ③ 최종 이름으로 새 표 생성(부모 → 버전 → 케이스) ④ _BAK 에서 칼럼명을 모두 적어 복사 ⑤ _BAK DROP.
-- DROP 시점에 옛 부모를 가리키는 표가 없으므로 FK 위반이 생기지 않는다. PRAGMA 를 쓰지 않는다(Flyway 가 transactional/
-- non-transactional 혼합을 거부, V13 주석).
-- 되돌리려면: 새 마이그레이션에서 같은 순서로 부모에 RULE_IDS·FLOW_JSON·ROW_VERSION 을 되살리고 세트마다 지금 적용 중인 RELEASED
--   (없으면 VER 최대) 행의 값을 넣은 뒤 TB_MDM_RULE_SET_VER 를 지운다. 다른 버전의 흐름은 사라진다.

-- ① 임시 복사(제약 없음)
CREATE TABLE TB_MDM_RULE_SET_BAK AS SELECT * FROM TB_MDM_RULE_SET;
CREATE TABLE TB_MDM_RULE_SET_TEST_CASE_BAK AS SELECT * FROM TB_MDM_RULE_SET_TEST_CASE;

-- ② 옛 자식 → 옛 부모
DROP TABLE TB_MDM_RULE_SET_TEST_CASE;
DROP TABLE TB_MDM_RULE_SET;

-- ③ 새 표(부모 → 버전 → 케이스)
CREATE TABLE TB_MDM_RULE_SET (
    MARU_RULE_SET_ID VARCHAR(50) NOT NULL,
    MARU_RULE_SET_NAME TEXT NOT NULL,
    DESCRIPTION TEXT,
    STATUS VARCHAR(20) NOT NULL DEFAULT 'CREATED',
    C_USR_ID VARCHAR(100),
    C_AT TIMESTAMP,
    C_SVC_ID VARCHAR(100),
    C_PGM_ID VARCHAR(100),
    U_USR_ID VARCHAR(100),
    U_AT TIMESTAMP,
    U_SVC_ID VARCHAR(100),
    U_PGM_ID VARCHAR(100),
    VER BIGINT,
    CONSTRAINT PK_TB_MDM_RULE_SET PRIMARY KEY (MARU_RULE_SET_ID),
    CONSTRAINT CK_TB_MDM_RULE_SET_STATUS CHECK (STATUS IN ('CREATED','INUSE','DEPRECATED'))
);

CREATE TABLE TB_MDM_RULE_SET_VER (
    MARU_RULE_SET_ID VARCHAR(50) NOT NULL,
    VER NUMERIC(7,3) NOT NULL,
    VER_KIND VARCHAR(20) NOT NULL DEFAULT 'MAJOR',
    STATUS VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    BASE_VER NUMERIC(7,3),
    OWNER_ID VARCHAR(50),
    APPLY_FROM TEXT,
    APPLY_TO TEXT,
    RULE_IDS TEXT NOT NULL CONSTRAINT CK_TB_MDM_RULE_SET_VER_RULE_IDS_JSON CHECK (json_valid(RULE_IDS)),
    FLOW_JSON TEXT CONSTRAINT CK_TB_MDM_RULE_SET_VER_FLOW_JSON CHECK (FLOW_JSON IS NULL OR json_valid(FLOW_JSON)),
    REQUESTED_BY VARCHAR(50),
    REQUESTED_AT TEXT,
    RELEASED_AT TEXT,
    ROW_VERSION BIGINT NOT NULL DEFAULT 0,
    C_USR_ID VARCHAR(100),
    C_AT TIMESTAMP,
    C_SVC_ID VARCHAR(100),
    C_PGM_ID VARCHAR(100),
    U_USR_ID VARCHAR(100),
    U_AT TIMESTAMP,
    U_SVC_ID VARCHAR(100),
    U_PGM_ID VARCHAR(100),
    AUD_VER BIGINT,
    CONSTRAINT PK_TB_MDM_RULE_SET_VER PRIMARY KEY (MARU_RULE_SET_ID, VER),
    CONSTRAINT FK_TB_MDM_RULE_SET_VER_SET FOREIGN KEY (MARU_RULE_SET_ID) REFERENCES TB_MDM_RULE_SET (MARU_RULE_SET_ID),
    CONSTRAINT CK_TB_MDM_RULE_SET_VER_STATUS CHECK (STATUS IN ('DRAFT','REQUESTED','APPROVED','RELEASED','CANCELLED')),
    CONSTRAINT CK_TB_MDM_RULE_SET_VER_KIND CHECK (VER_KIND IN ('MAJOR','MINOR')),
    CONSTRAINT CK_TB_MDM_RULE_SET_VER_APPLY CHECK (STATUS = 'DRAFT' OR (APPLY_FROM IS NOT NULL AND APPLY_TO IS NOT NULL))
);

CREATE TABLE TB_MDM_RULE_SET_TEST_CASE (
    MARU_RULE_SET_ID VARCHAR(50) NOT NULL,
    CASE_ID INTEGER NOT NULL,
    CASE_NAME TEXT,
    INPUT_JSON TEXT NOT NULL CONSTRAINT CK_TB_MDM_RULE_SET_TEST_CASE_INPUT_JSON CHECK (json_valid(INPUT_JSON)),
    EVAL_TS VARCHAR(19),
    EXPECTED_JSON TEXT CONSTRAINT CK_TB_MDM_RULE_SET_TEST_CASE_EXPECTED_JSON CHECK (EXPECTED_JSON IS NULL OR json_valid(EXPECTED_JSON)),
    DESCRIPTION TEXT,
    ROW_VERSION BIGINT NOT NULL DEFAULT 0,
    C_USR_ID VARCHAR(100),
    C_AT TIMESTAMP,
    C_SVC_ID VARCHAR(100),
    C_PGM_ID VARCHAR(100),
    U_USR_ID VARCHAR(100),
    U_AT TIMESTAMP,
    U_SVC_ID VARCHAR(100),
    U_PGM_ID VARCHAR(100),
    VER BIGINT,
    CONSTRAINT PK_TB_MDM_RULE_SET_TEST_CASE PRIMARY KEY (MARU_RULE_SET_ID, CASE_ID),
    CONSTRAINT FK_TB_MDM_RULE_SET_TEST_CASE_SET FOREIGN KEY (MARU_RULE_SET_ID) REFERENCES TB_MDM_RULE_SET (MARU_RULE_SET_ID)
);

-- ④ 복사(부모 → 버전 → 케이스)
INSERT INTO TB_MDM_RULE_SET (
    MARU_RULE_SET_ID, MARU_RULE_SET_NAME, DESCRIPTION, STATUS,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER
)
SELECT
    MARU_RULE_SET_ID, MARU_RULE_SET_NAME, DESCRIPTION, STATUS,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER
FROM TB_MDM_RULE_SET_BAK;

INSERT INTO TB_MDM_RULE_SET_VER (
    MARU_RULE_SET_ID, VER, VER_KIND, STATUS, BASE_VER, OWNER_ID, APPLY_FROM, APPLY_TO, RULE_IDS, FLOW_JSON,
    REQUESTED_BY, REQUESTED_AT, RELEASED_AT, ROW_VERSION,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, AUD_VER
)
SELECT
    MARU_RULE_SET_ID, CAST(1 AS NUMERIC), 'MAJOR', 'RELEASED', NULL, NULL,
    '2000-01-01 00:00:00',
    '9999-12-31 00:00:00',
    RULE_IDS, FLOW_JSON,
    U_USR_ID,
    COALESCE(substr(replace(U_AT, 'T', ' '), 1, 19), substr(replace(C_AT, 'T', ' '), 1, 19), '2000-01-01 00:00:00'),
    COALESCE(substr(replace(U_AT, 'T', ' '), 1, 19), substr(replace(C_AT, 'T', ' '), 1, 19), '2000-01-01 00:00:00'),
    ROW_VERSION,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, 0
FROM TB_MDM_RULE_SET_BAK;

INSERT INTO TB_MDM_RULE_SET_TEST_CASE (
    MARU_RULE_SET_ID, CASE_ID, CASE_NAME, INPUT_JSON, EVAL_TS, EXPECTED_JSON, DESCRIPTION, ROW_VERSION,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER
)
SELECT
    MARU_RULE_SET_ID, CASE_ID, CASE_NAME, INPUT_JSON, EVAL_TS, EXPECTED_JSON, DESCRIPTION, ROW_VERSION,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER
FROM TB_MDM_RULE_SET_TEST_CASE_BAK;

-- ⑤ 임시 표 삭제
DROP TABLE TB_MDM_RULE_SET_TEST_CASE_BAK;
DROP TABLE TB_MDM_RULE_SET_BAK;
```

`MdmBusinessRuleExpectations` 를 고친다.
- `TABLES`(:18-20): `"TB_MDM_RULE_SET"` 다음에 `"TB_MDM_RULE_SET_VER"` 를 넣는다.
- `AUD_VER_TABLES`(:26-27): `"TB_MDM_RULE_SET_VER"` 추가.
- `BUSINESS_COLUMNS`(:67-68): 부모를 `List.of("MARU_RULE_SET_ID", "MARU_RULE_SET_NAME", "DESCRIPTION", "STATUS")` 로, 새 키 `TB_MDM_RULE_SET_VER` 를 `List.of("MARU_RULE_SET_ID", "VER", "VER_KIND", "STATUS", "BASE_VER", "OWNER_ID", "APPLY_FROM", "APPLY_TO", "RULE_IDS", "FLOW_JSON", "REQUESTED_BY", "REQUESTED_AT", "RELEASED_AT", "ROW_VERSION")` 로.
- `JSON_COLUMNS`(:78): `TB_MDM_RULE_SET` 줄을 지우고 `JSON_COLUMNS.put("TB_MDM_RULE_SET_VER", List.of("RULE_IDS", "FLOW_JSON"));`. 주석의 "8칼럼" 은 그대로다(칼럼이 옮겨 갔을 뿐 수는 같다).
- `CONSTRAINTS`(:104-105): 부모를 `List.of("PK_TB_MDM_RULE_SET", "CK_TB_MDM_RULE_SET_STATUS")`, 새 키 `TB_MDM_RULE_SET_VER` 를 `List.of("PK_TB_MDM_RULE_SET_VER", "FK_TB_MDM_RULE_SET_VER_SET", "CK_TB_MDM_RULE_SET_VER_STATUS", "CK_TB_MDM_RULE_SET_VER_KIND", "CK_TB_MDM_RULE_SET_VER_APPLY", "CK_TB_MDM_RULE_SET_VER_RULE_IDS_JSON", "CK_TB_MDM_RULE_SET_VER_FLOW_JSON")`.

`MdmSharedContractMigrationTest.java:64,81-83`: 메서드 이름 끝을 `..._V17_V18_를_적용했다` 로, 기대 집합에 `"18"` 을 더하고 주석 `// D-144 2단계 — V18(룰 세트 버전 표) 추가 반영.` 을 단다.

로컬 DB 확인(선택): 사용자 로컬 MDM DB 에 V18 을 적용하기 전 `sqlite3 <로컬 mdm.db> "SELECT typeof(C_AT), typeof(U_AT), COUNT(*) FROM TB_MDM_RULE_SET GROUP BY 1, 2"` 로 `C_AT`·`U_AT` 가 `text`(또는 `null`)만 있는지 본다. `integer`(epoch) 가 있으면 `substr` 이행이 틀린 값을 만드므로 멈추고 보고한다.

- [ ] **Step 4: 마이그레이션 시험만 통과 확인**

Run: `cd src/backend/mdm && ../gradlew :api:test --tests '*MdmRuleSetVersionMigrationTest' --tests '*MdmSharedContractMigrationTest' --tests '*MdmRuleVersionDecimalMigrationTest' --offline`
Expected: PASS. (`MdmBusinessRuleMigrationTest`·`MdmBusinessRuleEntityJpaRoundtripTest` 는 엔티티 매핑까지 보므로 Task 3 Step 4 에서 함께 본다.)

- [ ] **Step 5: 스테이징만(커밋은 Task 3)**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V18__rule_set_version.sql src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmBusinessRuleExpectations.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmSharedContractMigrationTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmRuleSetVersionMigrationTest.java
```

---

### Task 3: 저장 위치 이행 — 세트 버전 엔티티와 읽기 한 곳(동작은 그대로)

**Files (모두 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/` 아래, 시험은 `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/` 아래):**
- Create: `common/version/VersionedRow.java`
- Modify: `entity/MdmRuleVer.java:31` (`implements VersionedRow` 추가)
- Modify: `common/rule/RuleVersions.java:15-61` (제네릭 + `currentOrLatest`·`releasedValidFrom`)
- Modify: `entity/MdmRuleSet.java` (전체 교체)
- Create: `entity/MdmRuleSetVer.java`, `entity/MdmRuleSetVerId.java`, `repository/MdmRuleSetVerRepository.java`
- Create: `common/rule/RuleSetVersionQueries.java`
- Modify: `dme/ruleSetEdit/service/RuleSetWrites.java` (전체 교체)
- Modify: `dme/ruleSetEdit/service/RuleSetEditService.java:89-114,179-195,209-295,599-635`
- Modify: `dme/ruleSetMng/service/RuleSetMngService.java:49-63,82-96,152-178`
- Modify: `common/rule/RuleUsageFinder.java:38-57`
- Modify: `common/rule/check/ledger/RuleSetOrderCheck.java:55-59,93-105,221-230`
- Modify: `common/rule/RuleSetRunner.java:74-89,116-118,250-255,301-310`
- Modify: `common/rule/definition/StoredDefinitionLookup.java:50-70,139-142,221-225`
- Modify 시험·자료: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/ContractStubCompileTest.java:451`, `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/RuleDefinitionLookupStub.java`(생성자 인자 그대로, MdmRuleSet 생성만), `dme/DmeTestSupport.java:84-94,248-263`, `dme/DmeOasisHttpTest.java:308-310`, `dme/ruleEdit/RuleLedgerChecksTest.java:168-171`, `MdmBusinessRuleMigrationTest.java:176-178,202,220-223,231,262-264,319-323,430-432,471-478,536-537`, `MdmBusinessRuleEntityJpaRoundtripTest.java:251-282,345-362`, `MdmLocalSampleLoaderTest.java:52`, `dme/ruleSetEdit/RuleSetEditServiceTest.java`(행 값 읽기·폐기/되살리기 MDM001 단언), `dme/ruleSetEdit/RuleSetEditQueryCountTest.java:130`
- Modify 자료: `src/backend/mdm/sample/mdm-local-sample.sql:662-666,696-698,724-726`, `src/frontend/e2e/fixtures/mdm-ruleSet-data.sql:88-110`, `src/frontend/e2e/fixtures/mdm-ruleEdit-data.sql:60-62`
- Test (Create): `common/rule/RuleSetVersionQueriesSqliteTest.java`

**Interfaces:**
- Consumes: Task 1 `VersionTarget.RULE_SET`, Task 2 표, 1단계 `VersionNumbers`·`VersionKind`
- Produces:
  - `interface VersionedRow { BigDecimal getVer(); String getStatus(); LocalDateTime getApplyFrom(); LocalDateTime getApplyTo(); }`
  - `RuleVersions` 의 모든 공개 메서드가 `<T extends VersionedRow>` 제네릭(호출부는 그대로 컴파일된다), 새 메서드 `static <T extends VersionedRow> Optional<T> currentOrLatest(Collection<T> versions, LocalDateTime now)`, `static <T extends VersionedRow> List<T> releasedValidFrom(Collection<T> versions, LocalDateTime at)`(VER 오름차순)
  - `MdmRuleSet(String maruRuleSetId, String maruRuleSetName)` — 상태 기본 `CREATED`, `getMaruRuleSetId/getMaruRuleSetName/getDescription/getStatus`, `setMaruRuleSetName/setDescription/setStatus`
  - `MdmRuleSetVer(String maruRuleSetId, BigDecimal ver, VersionKind verKind, String ownerId, String ruleIds)` — getter `getMaruRuleSetId/getVer/getVerKind/getStatus/getBaseVer/getOwnerId/getApplyFrom/getApplyTo/getRuleIds/getFlowJson/getRequestedBy/getReleasedAt/getRowVersion`, INSERT 전용 setter `setStatus/setBaseVer/setApplyFrom/setApplyTo/setRequestedBy/setReleasedAt/setFlowJson/setRowVersion`
  - `MdmRuleSetVerRepository extends JpaRepository<MdmRuleSetVer, MdmRuleSetVerId>` (메서드 선언 없음)
  - `RuleSetVersionQueries`: `List<MdmRuleSetVer> versions(String setId)`(VER 내림차순), `Map<String, List<MdmRuleSetVer>> versionsOf(Collection<String> setIds)`(키마다 VER 내림차순, 버전 없는 세트는 빈 목록), `Optional<MdmRuleSetVer> find(String setId, BigDecimal ver)`, `static Optional<MdmRuleSetVer> display(List<MdmRuleSetVer> versions, LocalDateTime now)`, `static List<String> members(MdmRuleSetVer v)`(RULE_IDS, 저장 순서·중복 제거)
  - `RuleSetWrites`: `int updateVersion(String setId, BigDecimal ver, String ruleIdsJson, String flowJson, long rowVersion)`(**이행용 — Task 5 가 `updateDraft` 로 바꾼다**), `int updateHeader(String setId, String name, String description)`, `int deprecate(String setId)`, `int restore(String setId)`, `Optional<String> status(String setId)`
  - `DmeTestSupport`: `ruleSet(jdbc, id, name, ruleIdsJson, status, rowVersion)`(서명 그대로 — 부모 + 1.000 MAJOR RELEASED `APPLY_FROM='2000-01-01 00:00:00'`), `ruleSetVersion(jdbc, id, ver, kind, status, owner, ruleIdsJson, applyFrom, applyTo, rowVersion)`, `ruleSetFlow(jdbc, setId, flowJson)`(1.000), `ruleSetFlow(jdbc, setId, ver, flowJson)`, `setVerValue(jdbc, setId, ver, column)`

**"표시 버전"**(J11): 지금 적용 중인 RELEASED(`APPLY_FROM <= now < APPLY_TO`), 없으면 VER 가 가장 큰 버전. 이 작업에서는 모든 세트가 1.000 하나뿐이므로 지금 동작과 같다. 저장(`save`)은 표시 버전 행에 쓴다 — **Task 5 가 DRAFT 전용으로 바꾸기 전까지의 이행 상태**다. 폐기·되살리기는 J2 대로 이 작업에서 바로 최종 모양(행 버전 없음)으로 바꾼다.

- [ ] **Step 1: 실패하는 시험 작성**

`RuleSetVersionQueriesSqliteTest`:

```java
package com.dongkuk.dmes.mdm.common.rule;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** D-144 2단계 — 세트 버전 읽기: 1.000·1.001·2.000 혼합의 정렬·표시 버전·멤버. */
@Import(DmeTestSupport.Config.class)
class RuleSetVersionQueriesSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleSetVersionQueries queries;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.ruleSet(jdbc, "S_MIX", "혼합", "[\"R1\"]", "INUSE", 0);                     // 1.000 RELEASED 2000-01-01~
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_TO = '2026-05-01 00:00:00' WHERE MARU_RULE_SET_ID = 'S_MIX'");
        DmeTestSupport.ruleSetVersion(jdbc, "S_MIX", "1.001", "MINOR", "RELEASED", "kim", "[\"R1\",\"R2\",\"R1\"]",
                "2026-05-01 00:00:00", "9999-12-31 00:00:00", 3);
        DmeTestSupport.ruleSetVersion(jdbc, "S_MIX", "2.000", "MAJOR", "DRAFT", "kim", "[\"R3\"]", null, null, 0);
        DmeTestSupport.ruleSet(jdbc, "S_ONE", "하나", "[]", "INUSE", 0);
    }

    @Test
    void versionsAreSortedByValueDescendingAndKeepMinorScale() {
        List<MdmRuleSetVer> vs = queries.versions("S_MIX");
        assertThat(vs).extracting(v -> v.getVer().toPlainString()).containsExactly("2.000", "1.001", "1.000");
        assertThat(vs.get(1).getVer().scale()).isEqualTo(3);
        assertThat(queries.find("S_MIX", new BigDecimal("1.001"))).isPresent();
        assertThat(queries.find("S_MIX", new BigDecimal("1"))).get().extracting(v -> v.getVer().toPlainString()).isEqualTo("1.000");
    }

    @Test
    void displayIsCurrentReleasedElseLargest() {
        List<MdmRuleSetVer> vs = queries.versions("S_MIX");
        assertThat(RuleSetVersionQueries.display(vs, LocalDateTime.of(2026, 4, 30, 23, 59, 59))).get()
                .extracting(v -> v.getVer().toPlainString()).isEqualTo("1.000");
        assertThat(RuleSetVersionQueries.display(vs, LocalDateTime.of(2026, 5, 1, 0, 0, 0))).get()
                .extracting(v -> v.getVer().toPlainString()).isEqualTo("1.001");
        jdbc.update("DELETE FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID = 'S_MIX' AND STATUS = 'RELEASED'");
        assertThat(RuleSetVersionQueries.display(queries.versions("S_MIX"), LocalDateTime.of(2026, 6, 1, 0, 0))).get()
                .extracting(v -> v.getVer().toPlainString()).isEqualTo("2.000");
    }

    @Test
    void membersDropDuplicatesInStoredOrderAndVersionsOfGroups() {
        MdmRuleSetVer minor = queries.find("S_MIX", new BigDecimal("1.001")).orElseThrow();
        assertThat(RuleSetVersionQueries.members(minor)).containsExactly("R1", "R2");
        Map<String, List<MdmRuleSetVer>> by = queries.versionsOf(List.of("S_MIX", "S_ONE", "S_NONE"));
        assertThat(by.get("S_MIX")).hasSize(3);
        assertThat(by.get("S_ONE")).hasSize(1);
        assertThat(by.get("S_NONE")).isEmpty();
    }

    @Test
    void releasedValidFromKeepsCurrentAndFutureReleasedOnly() {
        List<MdmRuleSetVer> vs = queries.versions("S_MIX");
        assertThat(RuleVersions.releasedValidFrom(vs, LocalDateTime.of(2026, 4, 1, 0, 0)))
                .extracting(v -> v.getVer().toPlainString()).containsExactly("1.000", "1.001");
        assertThat(RuleVersions.releasedValidFrom(vs, LocalDateTime.of(2026, 5, 1, 0, 0)))
                .extracting(v -> v.getVer().toPlainString()).containsExactly("1.001");
    }
}
```

`MdmBusinessRuleEntityJpaRoundtripTest.java:271-282` 의 세트 왕복 시험을 바꾸고 버전 왕복을 더한다.

```java
    @Test
    void MdmRuleSet_은_지정_PK_로_저장_조회_왕복한다() {
        MdmRuleSet set = new MdmRuleSet("RT_SET", "3CCL 라인스피드");
        set.setDescription("설명");
        setRepository.saveAndFlush(set);
        entityManager.clear();
        MdmRuleSet reloaded = setRepository.findById("RT_SET").orElseThrow();
        assertEquals("3CCL 라인스피드", reloaded.getMaruRuleSetName());
        assertEquals("CREATED", reloaded.getStatus());
    }

    @Test
    void MdmRuleSetVer_는_minor_버전과_흐름을_저장_조회_왕복한다() {
        setRepository.saveAndFlush(new MdmRuleSet("RT_SET_VER", "세트"));
        MdmRuleSetVer v = new MdmRuleSetVer("RT_SET_VER", new BigDecimal("1.001"), VersionKind.MINOR, "kim", "[\"R1\"]");
        v.setFlowJson("{\"version\":1,\"nodes\":[],\"edges\":[]}");
        setVerRepository.saveAndFlush(v);
        entityManager.clear();
        MdmRuleSetVer reloaded = entityManager.find(MdmRuleSetVer.class, new MdmRuleSetVerId("RT_SET_VER", new BigDecimal("1.001")));
        assertEquals(0, new BigDecimal("1.001").compareTo(reloaded.getVer()));
        assertEquals(3, reloaded.getVer().scale());
        assertEquals(VersionKind.MINOR, reloaded.getVerKind());
        assertEquals("DRAFT", reloaded.getStatus());
        assertEquals("kim", reloaded.getOwnerId());
        assertEquals("[\"R1\"]", reloaded.getRuleIds());
        assertEquals(0L, reloaded.getRowVersion());
    }
```

`:251-252` 의 `new MdmRuleSet("RT_SET_CASE", "세트", "[]")` 는 `new MdmRuleSet("RT_SET_CASE", "세트")` 로. `:345-362` 의 "MdmRuleSet 의 ROW_VERSION" 부분은 버전 행으로 옮긴다 — `setVerRepository.save(new MdmRuleSetVer("RT_OWN_SET", new BigDecimal("1.000"), VersionKind.MAJOR, "kim", "[]"))`, 네이티브 `UPDATE TB_MDM_RULE_SET_VER SET ROW_VERSION = 9 WHERE MARU_RULE_SET_ID = 'RT_OWN_SET'`, 낡은 엔티티를 `saveAndFlush` 한 뒤 `SELECT ROW_VERSION FROM TB_MDM_RULE_SET_VER ...` 가 `"9"` 인지. 클래스 필드에 `@Autowired MdmRuleSetVerRepository setVerRepository;` 를 더한다.

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mdm && ../gradlew :api:compileTestJava --offline`
Expected: 컴파일 실패(`MdmRuleSetVer`·`RuleSetVersionQueries`·`DmeTestSupport.ruleSetVersion` 없음)

- [ ] **Step 3: 구현**

`VersionedRow`:

```java
package com.dongkuk.dmes.mdm.common.version;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 버전 행 읽기(D-144) — 룰·룰 세트 버전 엔티티가 함께 쓰는 고르기 규칙({@code RuleVersions})의 입력. ver 는 scale 3. */
public interface VersionedRow {

    BigDecimal getVer();

    String getStatus();

    LocalDateTime getApplyFrom();

    LocalDateTime getApplyTo();
}
```

`MdmRuleVer.java:31`: `public class MdmRuleVer extends CactusAuditEntity implements VersionedRow {` (getter 는 이미 있다).

`RuleVersions` — 각 메서드의 `MdmRuleVer` 를 타입 변수로 바꾼다. 본문 식은 그대로다. 예:

```java
    public static <T extends VersionedRow> boolean isUnapplied(T v, LocalDateTime now) {
        return PENDING_STATUSES.contains(v.getStatus())
                || ("RELEASED".equals(v.getStatus()) && v.getApplyFrom() != null && v.getApplyFrom().isAfter(now));
    }

    public static <T extends VersionedRow> Optional<T> currentReleased(Collection<T> versions, LocalDateTime now) {
        return versions.stream().filter(v -> isCurrentReleased(v, now)).max(Comparator.comparing(VersionedRow::getVer));
    }

    /** 지금 적용 중인 RELEASED, 없으면 VER 가 가장 큰 버전(상태 무관) — 세트 화면의 "표시 버전"(D-144 2단계 J11). */
    public static <T extends VersionedRow> Optional<T> currentOrLatest(Collection<T> versions, LocalDateTime now) {
        Optional<T> current = currentReleased(versions, now);
        return current.isPresent() ? current : versions.stream().max(Comparator.comparing(VersionedRow::getVer));
    }

    /**
     * {@code at} 이후에 유효한 RELEASED — 지금 구간이 {@code at} 을 덮거나 {@code at} 뒤에 시작하는 것({@code APPLY_TO > at}). VER 오름차순.
     * 룰 확정 때 세트 순서 검사가 볼 세트 버전들(스펙 §6)을 고른다.
     */
    public static <T extends VersionedRow> List<T> releasedValidFrom(Collection<T> versions, LocalDateTime at) {
        return versions.stream()
                .filter(v -> "RELEASED".equals(v.getStatus()) && v.getApplyFrom() != null
                        && (v.getApplyTo() == null || v.getApplyTo().isAfter(at)))
                .sorted(Comparator.comparing(VersionedRow::getVer))
                .toList();
    }
```

`unapplied`·`effectiveStatus`·`needsInUsePromotion`·`latestReleased`·`isCurrentReleased` 도 같은 방식이다(`effectiveStatus(String, Collection<T>, LocalDateTime)`). 클래스 javadoc 첫 줄을 "룰·룰 세트 버전 목록에서 고르기" 로 고친다.

`MdmRuleSet`(전체):

```java
package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 룰 세트 부모 — {@code TB_MDM_RULE_SET}(D-144 2단계, V18). 흐름·행 버전은 {@link MdmRuleSetVer} 에 있다.
 * 상태는 CREATED → INUSE(첫 확정, 공통 엔진 markParentInUse) → DEPRECATED. 감사 카운터는 {@code VER}(부모 관례, D-034).
 */
@Entity
@Table(name = "TB_MDM_RULE_SET")
public class MdmRuleSet extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_RULE_SET_ID", length = 50)
    private String maruRuleSetId;

    @Column(name = "MARU_RULE_SET_NAME", nullable = false)
    private String maruRuleSetName;

    @Column(name = "DESCRIPTION")
    private String description;

    @Column(name = "STATUS", length = 20, nullable = false)
    private String status;

    protected MdmRuleSet() {
        // JPA 기본 생성자
    }

    public MdmRuleSet(String maruRuleSetId, String maruRuleSetName) {
        this.maruRuleSetId = maruRuleSetId;
        this.maruRuleSetName = maruRuleSetName;
        this.status = "CREATED";
    }

    public String getMaruRuleSetId() { return maruRuleSetId; }
    public String getMaruRuleSetName() { return maruRuleSetName; }
    public String getDescription() { return description; }
    public String getStatus() { return status; }

    public void setMaruRuleSetName(String v) { this.maruRuleSetName = v; }
    public void setDescription(String v) { this.description = v; }
    public void setStatus(String v) { this.status = v; }
}
```

`MdmRuleSetVerId`(1단계 `MdmRuleVerId` 와 같은 모양):

```java
package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Objects;

/** {@link MdmRuleSetVer} 복합 PK(MARU_RULE_SET_ID, VER). 같음은 VER 값 비교(scale 무관). */
public class MdmRuleSetVerId implements Serializable {

    private String maruRuleSetId;
    private BigDecimal ver;

    public MdmRuleSetVerId() {
    }

    public MdmRuleSetVerId(String maruRuleSetId, BigDecimal ver) {
        this.maruRuleSetId = maruRuleSetId;
        this.ver = VersionNumbers.scaled(ver);
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof MdmRuleSetVerId other && Objects.equals(maruRuleSetId, other.maruRuleSetId)
                && VersionNumbers.same(ver, other.ver);
    }

    @Override
    public int hashCode() {
        return Objects.hash(maruRuleSetId, ver == null ? null : ver.stripTrailingZeros());
    }
}
```

`MdmRuleSetVer`:

```java
package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.common.version.VersionedRow;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import jakarta.persistence.AttributeOverride;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 룰 세트 버전 — {@code TB_MDM_RULE_SET_VER}(D-144 2단계, V18). 흐름({@code FLOW_JSON}, NULL 이면 RULE_IDS 한 줄 흐름)과 펼친 룰 목록
 * ({@code RULE_IDS}) 을 버전마다 둔다. 감사 카운터는 업무 VER 와 겹치지 않게 {@code AUD_VER}(D-034).
 *
 * <p>상태·소유자·적용 구간·확정 칸·{@code ROW_VERSION} 은 공통 버전 엔진이 네이티브 SQL 로만 바꾼다({@code updatable = false}). 흐름 저장은
 * {@code RuleSetWrites} 의 네이티브 UPDATE 다. 엔티티 저장은 새 버전 INSERT 에만 쓴다.
 */
@Entity
@Table(name = "TB_MDM_RULE_SET_VER")
@IdClass(MdmRuleSetVerId.class)
@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))
public class MdmRuleSetVer extends CactusAuditEntity implements VersionedRow {

    @Id
    @Column(name = "MARU_RULE_SET_ID", length = 50)
    private String maruRuleSetId;

    @Id
    @Column(name = "VER", nullable = false, precision = 7, scale = 3)
    private BigDecimal ver;

    @Enumerated(EnumType.STRING)
    @Column(name = "VER_KIND", nullable = false, length = 20, updatable = false)
    private VersionKind verKind;

    @Column(name = "STATUS", length = 20, nullable = false, updatable = false)
    private String status;

    @Column(name = "BASE_VER", precision = 7, scale = 3, updatable = false)
    private BigDecimal baseVer;

    @Column(name = "OWNER_ID", length = 50, updatable = false)
    private String ownerId;

    @Column(name = "APPLY_FROM", updatable = false)
    private LocalDateTime applyFrom;

    @Column(name = "APPLY_TO", updatable = false)
    private LocalDateTime applyTo;

    @Column(name = "RULE_IDS", nullable = false, updatable = false)
    private String ruleIds;

    @Column(name = "FLOW_JSON", updatable = false)
    private String flowJson;

    @Column(name = "REQUESTED_BY", length = 50, updatable = false)
    private String requestedBy;

    @Column(name = "RELEASED_AT", updatable = false)
    private LocalDateTime releasedAt;

    @Column(name = "ROW_VERSION", nullable = false, updatable = false)
    private long rowVersion;

    protected MdmRuleSetVer() {
        // JPA 기본 생성자
    }

    /** 새 DRAFT. 상태 DRAFT·row_version 0. */
    public MdmRuleSetVer(String maruRuleSetId, BigDecimal ver, VersionKind verKind, String ownerId, String ruleIds) {
        this.maruRuleSetId = maruRuleSetId;
        this.ver = VersionNumbers.scaled(ver);
        this.verKind = verKind;
        this.ownerId = ownerId;
        this.ruleIds = ruleIds;
        this.status = "DRAFT";
        this.rowVersion = 0;
    }

    public String getMaruRuleSetId() { return maruRuleSetId; }
    @Override public BigDecimal getVer() { return VersionNumbers.scaled(ver); }
    public VersionKind getVerKind() { return verKind; }
    @Override public String getStatus() { return status; }
    public BigDecimal getBaseVer() { return VersionNumbers.scaled(baseVer); }
    public String getOwnerId() { return ownerId; }
    @Override public LocalDateTime getApplyFrom() { return applyFrom; }
    @Override public LocalDateTime getApplyTo() { return applyTo; }
    public String getRuleIds() { return ruleIds; }
    public String getFlowJson() { return flowJson; }
    public String getRequestedBy() { return requestedBy; }
    public LocalDateTime getReleasedAt() { return releasedAt; }
    public long getRowVersion() { return rowVersion; }

    /** 아래 setter 는 INSERT 때만 반영된다(updatable=false). 저장된 행은 공통 엔진·RuleSetWrites 가 네이티브로 바꾼다. */
    public void setStatus(String v) { this.status = v; }
    public void setBaseVer(BigDecimal v) { this.baseVer = VersionNumbers.scaled(v); }
    public void setApplyFrom(LocalDateTime v) { this.applyFrom = v; }
    public void setApplyTo(LocalDateTime v) { this.applyTo = v; }
    public void setFlowJson(String v) { this.flowJson = v; }
    public void setRequestedBy(String v) { this.requestedBy = v; }
    public void setReleasedAt(LocalDateTime v) { this.releasedAt = v; }
    public void setRowVersion(long v) { this.rowVersion = v; }
}
```

`MdmRuleSetVerRepository`:

```java
package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVerId;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code TB_MDM_RULE_SET_VER} JPA Repository — 메서드를 선언하지 않는다(불변 규칙 21). 읽기는 RuleSetVersionQueries. */
public interface MdmRuleSetVerRepository extends JpaRepository<MdmRuleSetVer, MdmRuleSetVerId> {
}
```

`RuleSetVersionQueries`:

```java
package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Repository;

/**
 * 룰 세트 버전 읽기의 유일한 자리(D-144 2단계). 정렬·최대·같음은 Java 에서 한다 — SQLite 는 1.000 을 INTEGER, 1.001 을 REAL 로 둔다(규칙표 #17).
 * 원장을 고치는 쿼리는 두지 않는다(쓰기는 RuleSetWrites·공통 버전 엔진).
 */
@Repository
public class RuleSetVersionQueries {

    private static final Comparator<MdmRuleSetVer> VER_DESC = Comparator.comparing(MdmRuleSetVer::getVer).reversed();

    private final EntityManager entityManager;

    public RuleSetVersionQueries(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    /** 한 세트의 버전 전부, VER 내림차순. */
    public List<MdmRuleSetVer> versions(String setId) {
        List<MdmRuleSetVer> out = new ArrayList<>(entityManager.createQuery(
                        "SELECT v FROM MdmRuleSetVer v WHERE v.maruRuleSetId = :id", MdmRuleSetVer.class)
                .setParameter("id", setId).getResultList());
        out.sort(VER_DESC);
        return out;
    }

    /** 여러 세트의 버전을 한 문장으로. 키는 요청 순서, 값은 VER 내림차순, 버전 없는 세트는 빈 목록. */
    public Map<String, List<MdmRuleSetVer>> versionsOf(Collection<String> setIds) {
        Map<String, List<MdmRuleSetVer>> out = new LinkedHashMap<>();
        setIds.forEach(id -> out.put(id, new ArrayList<>()));
        if (setIds.isEmpty()) {
            return out;
        }
        for (MdmRuleSetVer v : entityManager.createQuery("SELECT v FROM MdmRuleSetVer v WHERE v.maruRuleSetId IN :ids", MdmRuleSetVer.class)
                .setParameter("ids", setIds).getResultList()) {
            out.get(v.getMaruRuleSetId()).add(v);
        }
        out.values().forEach(list -> list.sort(VER_DESC));
        return out;
    }

    public Optional<MdmRuleSetVer> find(String setId, BigDecimal ver) {
        return versions(setId).stream().filter(v -> VersionNumbers.same(v.getVer(), ver)).findFirst();
    }

    /** 표시 버전(J11) — 지금 적용 중인 RELEASED, 없으면 VER 최대. 버전이 없으면 빈 값. */
    public static Optional<MdmRuleSetVer> display(List<MdmRuleSetVer> versions, LocalDateTime now) {
        return RuleVersions.currentOrLatest(versions, now);
    }

    /** RULE_IDS → 룰 ID(저장 순서, 같은 ID 는 한 번). */
    public static List<String> members(MdmRuleSetVer v) {
        if (v.getRuleIds() == null || v.getRuleIds().isBlank()) {
            return List.of();
        }
        return List.copyOf(new LinkedHashSet<>(DomainJson.readList(v.getRuleIds()).stream().map(String::valueOf).toList()));
    }
}
```

`RuleSetWrites`(전체 교체 — 클래스 javadoc 은 "세트 부모·버전 행의 조건부 네이티브 UPDATE(D-144 2단계)" 로):

```java
@Repository
public class RuleSetWrites {

    private static final String AUDIT_SET = "U_USR_ID = :uUsrId, U_AT = :uAt, U_SVC_ID = :uSvcId, U_PGM_ID = :uPgmId";

    private final EntityManager entityManager;
    private final MdmNativeAuditSupport auditSupport;
    private final MdmTemporalBinder temporal;

    public RuleSetWrites(EntityManager entityManager, MdmNativeAuditSupport auditSupport, MdmTemporalBinder temporal) {
        this.entityManager = entityManager;
        this.auditSupport = auditSupport;
        this.temporal = temporal;
    }

    /**
     * 이행용(Task 3) — 버전 행의 흐름·룰 목록을 row_version 조건으로 바꾸고 1 올린다. Task 5 가 DRAFT 전용 {@code updateDraft} 로 바꾸고 지운다.
     */
    public int updateVersion(String setId, BigDecimal ver, String ruleIdsJson, String flowJson, long rowVersion) {
        NativeQuery<?> q = audited("UPDATE TB_MDM_RULE_SET_VER SET RULE_IDS = :ids, FLOW_JSON = :flow, ROW_VERSION = ROW_VERSION + 1, "
                + AUDIT_SET + ", AUD_VER = COALESCE(AUD_VER, 0) + 1 WHERE MARU_RULE_SET_ID = :id AND VER = :ver AND ROW_VERSION = :rv")
                .setParameter("id", setId).setParameter("ver", VersionNumbers.scaled(ver)).setParameter("rv", rowVersion)
                .setParameter("ids", ruleIdsJson);
        q.setParameter("flow", flowJson, String.class);
        return q.executeUpdate();
    }

    /** 세트명·설명 — 폐기하지 않은 부모만. 동시성은 DRAFT 쓰기 가드가 막는다(J1). */
    public int updateHeader(String setId, String name, String description) {
        NativeQuery<?> q = audited("UPDATE TB_MDM_RULE_SET SET MARU_RULE_SET_NAME = :name, DESCRIPTION = :desc, " + AUDIT_SET
                + ", VER = COALESCE(VER, 0) + 1 WHERE MARU_RULE_SET_ID = :id AND STATUS <> 'DEPRECATED'")
                .setParameter("id", setId).setParameter("name", name);
        q.setParameter("desc", description, String.class);
        return q.executeUpdate();
    }

    /** 폐기 — INUSE → DEPRECATED(J2). 호출자가 계산 상태 승격(CREATED→INUSE)을 먼저 한다. */
    public int deprecate(String setId) {
        return audited("UPDATE TB_MDM_RULE_SET SET STATUS = 'DEPRECATED', " + AUDIT_SET + ", VER = COALESCE(VER, 0) + 1 "
                + "WHERE MARU_RULE_SET_ID = :id AND STATUS = 'INUSE'").setParameter("id", setId).executeUpdate();
    }

    /** 되살리기 — DEPRECATED → INUSE. 검사는 호출자가 먼저 돌린다(I15). */
    public int restore(String setId) {
        return audited("UPDATE TB_MDM_RULE_SET SET STATUS = 'INUSE', " + AUDIT_SET + ", VER = COALESCE(VER, 0) + 1 "
                + "WHERE MARU_RULE_SET_ID = :id AND STATUS = 'DEPRECATED'").setParameter("id", setId).executeUpdate();
    }

    /** 부모 상태(저장값). 스칼라 JPQL 이라 영속성 컨텍스트의 낡은 값을 쓰지 않는다. 없으면 빈 값. */
    public Optional<String> status(String setId) {
        List<String> rows = entityManager.createQuery("SELECT s.status FROM MdmRuleSet s WHERE s.maruRuleSetId = :id", String.class)
                .setParameter("id", setId).getResultList();
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    private NativeQuery<?> audited(String sql) {
        entityManager.flush();
        AuditStamp stamp = auditSupport.currentStamp();
        NativeQuery<?> q = entityManager.createNativeQuery(sql).unwrap(NativeQuery.class);
        q.setParameter("uAt", temporal.toDb(stamp.at()));
        q.setParameter("uUsrId", stamp.userId(), String.class);
        q.setParameter("uSvcId", stamp.serviceId(), String.class);
        q.setParameter("uPgmId", stamp.programId(), String.class);
        return q;
    }
}
```

`RuleSetEditService` — 생성자에 `RuleSetVersionQueries setVersions`, `VersionWriteGuard writeGuard`, `VersionRowStore versionStore`, `MdmNativeAuditSupport audit`, `Clock clock` 를 더하고(필드 같은 이름) 아래를 바꾼다.

- `view`(:179-195): `set` 아래에 `MdmRuleSetVer shown = RuleSetVersionQueries.display(setVersions.versions(setId), now()).orElseThrow(() -> notFound(setId));` 를 두고 `set.getRuleIds()`·`set.getFlowJson()`·`set.getRowVersion()` 을 `shown` 의 것으로 바꾼다. `now()` 는 `LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS)`.
- `save`(:209-249): 쓰기 블록을

```java
        tx.executeWithoutResult(status -> {
            MdmRuleSetVer shown = RuleSetVersionQueries.display(setVersions.versions(setId), now()).orElseThrow(() -> notFound(setId));
            if (writes.updateVersion(setId, shown.getVer(), DomainJson.write(ids), flowJson, rv) == 0) {
                throw writeMissed(setId, rv);
            }
            if (writes.updateHeader(setId, name, description) == 0) {
                throw writeMissed(setId, rv);
            }
        });
```

  로 바꾼다(`writeMissed` 는 아래). 부모가 DEPRECATED 면 `updateHeader` 가 0 이다.
- `delete`(:255-265): 폐기는 J2 — `rowVersion` 을 받지 않는다.

```java
    public RuleSetStatusResult delete(RuleSetStatusRequest request) {
        String setId = requireSetId(request == null ? null : request.getSetId());
        stewardCheck.requireSteward();
        tx.executeWithoutResult(status -> {
            String stored = writes.status(setId).orElseThrow(() -> notFound(setId));
            List<MdmRuleSetVer> versions = setVersions.versions(setId);
            if (!INUSE.equals(RuleVersions.effectiveStatus(stored, versions, now()))) {
                throw transition("사용 중(INUSE)인 룰 세트만 폐기할 수 있습니다: " + setId);
            }
            writeGuard.checkCanCreateVersion(VersionTarget.RULE_SET, setId); // 미적용 버전이 있으면 MDM006
            if (RuleVersions.needsInUsePromotion(stored, versions, now())) {
                versionStore.markParentInUse(VersionTarget.RULE_SET, setId, audit.currentStamp());
            }
            if (writes.deprecate(setId) == 0) {
                throw transition("사용 중(INUSE)인 룰 세트만 폐기할 수 있습니다: " + setId);
            }
        });
        return new RuleSetStatusResult(setId, DEPRECATED, null, List.of());
    }
```

- `restore`(:271-295): `SetState` 대신 `writes.status(setId)` 로 상태를 보고(DEPRECATED 아니면 지금 문구 그대로 MDM009), 검사 대상 흐름은 `RuleSetVersionQueries.display(setVersions.versions(setId), now())` 의 `RULE_IDS`·`FLOW_JSON` 이다. `rowVersion` 비교와 `writeMissed(setId, rv, DEPRECATED)` 는 지우고 `writes.restore(setId) == 0` 이면 같은 MDM009 를 던진다. 결과는 `new RuleSetStatusResult(setId, INUSE, null, warns)`.
- `rejectListSaveOverFlow`(:599-610): `writes.state(setId).map(SetState::flowJson)` 를 `RuleSetVersionQueries.display(setVersions.versions(setId), now()).map(MdmRuleSetVer::getFlowJson)` 로.
- `writeMissed`(:624-635) 를 다음으로 바꾼다.

```java
    /** 조건부 UPDATE 가 0행 — 없음·폐기(MDM009)·row_version(MDM001) 으로 가른다(I12). */
    private BusinessException writeMissed(String setId, long rv) {
        String stored = writes.status(setId).orElse(null);
        if (stored == null) {
            return notFound(setId);
        }
        if (DEPRECATED.equals(stored)) {
            return transition("폐기한 룰 세트는 고칠 수 없고 되살리기만 합니다: " + setId);
        }
        return MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
    }
```

`RuleSetStatusResult` 의 `rowVersion` 을 `Long`(null 허용)으로 바꾼다(`dme/ruleSetEdit/dto/RuleSetStatusResult.java:11` 과 생성자·getter·setter). `RuleSetStatusRequest.rowVersion` 은 남기되 javadoc 에 "D-144 2단계부터 읽지 않는다(옛 화면 호환)" 를 단다.

`RuleSetMngService` — 생성자에 `RuleSetVersionQueries setVersions`, `MdmRuleSetVerRepository verRepository`, `Clock clock` 를 더한다.
- `search`(:82-96): 루프 앞에서 `Map<String, List<MdmRuleSetVer>> byId = setVersions.versionsOf(queries.allSets().stream().map(MdmRuleSet::getMaruRuleSetId).toList());` 를 한 번 읽고, `ruleIdsOf(s.getRuleIds())` 를 `RuleSetVersionQueries.display(byId.get(s.getMaruRuleSetId()), now).map(RuleSetVersionQueries::members).orElse(List.of())` 로 바꾼다(`now` = `LocalDateTime.now(clock)`).
- `register`(:166-176) 이행 모양 — 지금처럼 바로 사용 중인 세트를 만든다(최종 모양은 Task 5).

```java
        tx.executeWithoutResult(status -> {
            MdmRuleSet set = new MdmRuleSet(id, name);
            set.setDescription(blankToNull(request.getDescription()));
            set.setStatus("INUSE");
            setRepository.saveAndFlush(set);
            LocalDateTime now = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
            MdmRuleSetVer v = new MdmRuleSetVer(id, VersionNumbers.FIRST, VersionKind.MAJOR, null, "[]");
            v.setStatus("RELEASED");
            v.setApplyFrom(now);
            v.setApplyTo(VersionConventions.OPEN_END);
            v.setReleasedAt(now);
            verRepository.saveAndFlush(v);
        });
```

`RuleUsageFinder.find`(:38-57) — 생성자에 `RuleSetVersionQueries setVersions`, `Clock clock` 를 더하고, 세트마다 `members` 를 표시 버전의 `RuleSetVersionQueries.members(...)` 로 계산한다(세트 목록 한 번, `versionsOf` 한 번).

`RuleSetOrderCheck`(이행 — 최종 대상 변경은 Task 9): 생성자에 `RuleSetVersionQueries setVersions`, `Clock clock` 를 더하고, `run` 의 세트 루프에서 `members`·`tree(...)` 의 입력을 표시 버전으로 바꾼다. `tree(MdmRuleSet set, ...)` 를 `tree(MdmRuleSetVer v, List<String> members)` 로 바꾸고 `v.getFlowJson()` 을 쓴다. `"INUSE".equals(set.getStatus())` 조건은 그대로 둔다.

`StoredDefinitionLookup`(이행 — 판정 시각 선택은 Task 4): 생성자 네 번째 인자 `MdmRuleSetRepository sets` 를 `RuleSetVersionQueries setVersions` 로 바꾸고 `MdmRuleSetRepository sets` 를 다섯 번째로 둔다(부모 상태용). `ruleSet(setId)` 는

```java
    @Override
    public Optional<RuleSetDefinition> ruleSet(String setId) {
        Optional<MdmRuleSet> parent = sets.findById(setId);
        if (parent.isEmpty()) {
            return Optional.empty();
        }
        List<MdmRuleSetVer> versions = setVersions.versions(setId);
        return versions.isEmpty() ? Optional.empty() : Optional.of(toDefinition(parent.get(), versions.get(0)));
    }

    private static RuleSetDefinition toDefinition(MdmRuleSet s, MdmRuleSetVer v) {
        List<String> ids = readStored(() -> DomainJson.readList(v.getRuleIds()).stream().map(String::valueOf).toList());
        return new RuleSetDefinition(s.getMaruRuleSetId(), ids, SetStatus.valueOf(s.getStatus()),
                v.getFlowJson() == null ? null : readStored(() -> RuleSetFlowJson.parse(v.getFlowJson())));
    }
```

(이행 단계에는 세트마다 버전이 하나라 `versions.get(0)` 이 지금 행과 같다.)

`RuleSetRunner`: 생성자에 `RuleSetVersionQueries setVersions` 를 더하고 `new StoredDefinitionLookup(queries, stored, rules, setVersions, sets)` 로 두 곳(:117, :311)을 바꾼다. `warnings`(:250-251) 의 `sets.findById(setId).map(RuleSetRunner::ruleIdsOf)` 는 `setVersions.versions(setId).stream().findFirst().map(RuleSetRunner::ruleIdsOf)` 로, `ruleIdsOf(MdmRuleSet s)`(:301-306) 는 `ruleIdsOf(MdmRuleSetVer s)` 로 바꾼다(본문의 `getFlowJson`·`getRuleIds` 는 같은 이름).

시험 보조·자료:
- `DmeTestSupport.clear`(:84-94): `DELETE FROM TB_MDM_RULE_SET` 앞에 `jdbc.update("DELETE FROM TB_MDM_RULE_SET_VER");`.
- `DmeTestSupport.ruleSet`·`ruleSetFlow`(:248-263) 를 다음으로 바꾸고 새 도우미를 더한다.

```java
    /**
     * 룰 세트 부모 + 1.000 MAJOR RELEASED(D-144 2단계). 서명은 그대로다. APPLY_FROM 은 2000-01-01 00:00:00 — 판정 시각으로 세트 버전을
     * 고르게 된 뒤에도 이른 판정 시각을 쓰는 기존 시험이 세트를 찾게 한다(계획 J4). rowVersion 은 버전 행의 ROW_VERSION 이다.
     */
    public static void ruleSet(JdbcTemplate jdbc, String id, String name, String ruleIdsJson, String status, long rowVersion) {
        jdbc.update("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, STATUS, "
                + "C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER) "
                + "VALUES (?, ?, ?, 'fixture', '2026-01-01 00:00:00', 'fixture', 'fixture', "
                + "'fixture', '2026-01-01 00:00:00', 'fixture', 'fixture', 0)", id, name, status);
        ruleSetVersion(jdbc, id, "1.000", "MAJOR", "RELEASED", null, ruleIdsJson, "2000-01-01 00:00:00", "9999-12-31 00:00:00", rowVersion);
    }

    /** 세트 버전 한 행. DRAFT 면 applyFrom·applyTo 를 null 로 준다. RELEASED 면 RELEASED_AT = applyFrom. */
    public static void ruleSetVersion(JdbcTemplate jdbc, String id, String ver, String kind, String status, String owner, String ruleIdsJson,
                                      String applyFrom, String applyTo, long rowVersion) {
        jdbc.update("INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, RULE_IDS, "
                + "RELEASED_AT, ROW_VERSION, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, AUD_VER) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'fixture', '2026-01-01 00:00:00', 'fixture', 'fixture', "
                + "'fixture', '2026-01-01 00:00:00', 'fixture', 'fixture', 0)",
                id, new BigDecimal(ver).setScale(3), kind, status, owner, applyFrom, applyTo, ruleIdsJson,
                "RELEASED".equals(status) ? applyFrom : null, rowVersion);
    }

    /** 1.000 버전의 FLOW_JSON 을 바꾼다(흐름도 세트 픽스처, spec §3.3). RULE_IDS 는 호출자가 펼친 목록으로 맞춰 둔다. */
    public static void ruleSetFlow(JdbcTemplate jdbc, String setId, String flowJson) {
        ruleSetFlow(jdbc, setId, "1.000", flowJson);
    }

    public static void ruleSetFlow(JdbcTemplate jdbc, String setId, String ver, String flowJson) {
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET FLOW_JSON = ? WHERE MARU_RULE_SET_ID = ? AND VER = ?",
                flowJson, setId, new BigDecimal(ver).setScale(3));
    }

    /** 세트 버전 행의 칼럼 하나(글자). 칼럼 이름은 아래 목록만 받는다. */
    public static String setVerValue(JdbcTemplate jdbc, String setId, String ver, String column) {
        if (!Set.of("RULE_IDS", "FLOW_JSON", "ROW_VERSION", "STATUS", "OWNER_ID", "APPLY_FROM", "APPLY_TO", "VER_KIND", "BASE_VER")
                .contains(column)) {
            throw new IllegalArgumentException(column);
        }
        return jdbc.queryForObject("SELECT CAST(" + column + " AS TEXT) FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID = ? AND VER = ?",
                String.class, setId, new BigDecimal(ver).setScale(3));
    }
```

- 시험 안의 `SELECT RULE_IDS|FLOW_JSON|ROW_VERSION FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = ?` 는 모두 `DmeTestSupport.setVerValue(jdbc, id, "1.000", "<칼럼>")` 로 바꾼다. 찾기: `grep -rn "FROM TB_MDM_RULE_SET WHERE" src/backend/mdm/api/src/test`. `DmeOasisHttpTest.setRuleIds`(:308-310)도 같다. `ROW_VERSION` 을 숫자로 비교하던 곳은 `Long.parseLong(...)` 로 감싼다.
- `RuleSetEditServiceTest` 의 폐기·되살리기 시험(:359-366 `이미_폐기한_세트는_MDM009_row_version_이_다르면_MDM001_없으면_INVALID_VALUE_다`, :387-397)에서 `MDM001` 단언 줄을 지우고 이름의 `row_version_이_다르면_MDM001_` 을 뺀다(J2 — 폐기·되살리기는 행 버전을 보지 않는다). 폐기 결과의 `getRowVersion()` 단언은 `assertNull` 로.
- `RuleLedgerChecksTest.ruleSet`(:168-171) 은 `DmeTestSupport.ruleSet(jdbc, setId, setId, DomainJson.write(List.of(ruleIds)), status, 0)` 한 줄로.
- `MdmBusinessRuleMigrationTest`:
  - :176-178 `CK_TB_MDM_RULE_SET_STATUS` 거부 사례는 `'CREATED'` 가 이제 허용되므로 `"INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, STATUS) VALUES (?, '세트', 'BAD')"` 로 바꾸고, 바로 아래에 세트 버전 CHECK 세 개를 더한다: `rejected(c, "CK_TB_MDM_RULE_SET_VER_STATUS", "INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, STATUS, RULE_IDS) VALUES (?, 1, 'BAD', '[]')", setId)`, `..._KIND` 는 `VER_KIND 'BAD'`, `..._APPLY` 는 `STATUS 'RELEASED'` + APPLY 없음(앞에 부모 `setId` 를 넣어 둔다).
  - :202 부모 INSERT 는 `(MARU_RULE_SET_ID, MARU_RULE_SET_NAME) VALUES (?, '세트')`. :220-223 의 `RULE_IDS`·`FLOW_JSON` INSERT 는 `"INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, RULE_IDS) VALUES (?, ?, ?)"`·`"INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, RULE_IDS, FLOW_JSON) VALUES (?, ?, '[]', ?)"` 로, :231 의 소유자 선택을 `"TB_MDM_RULE_SET_TEST_CASE".equals(e.getKey()) || "TB_MDM_RULE_SET_VER".equals(e.getKey()) ? setId : r` 로, `jsonParams` :263-264 를 `case "RULE_IDS", "FLOW_JSON" -> new Object[] {ruleId, n, json};` 로 바꾼다.
  - :319, :430, :471 의 부모 INSERT 에서 `RULE_IDS` 를 뺀다. :432 는 `assertEquals("CREATED", one(c, "SELECT STATUS FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = ?", set))` 와 버전 행 기본값 `exec(c, "INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, RULE_IDS) VALUES (?, 1, '[]')", set); assertEquals("DRAFT|0|MAJOR", one(c, "SELECT STATUS || '|' || ROW_VERSION || '|' || VER_KIND FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID = ?", set));` 로. :471-478 은 RULE_IDS 를 버전 행에 넣고(`INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, RULE_IDS) VALUES (?, 1, ?)`) `json_each` 조회도 `TB_MDM_RULE_SET_VER` 에서 한다.
  - :536-537 `LS_A3` 는 부모(`MARU_RULE_SET_ID, MARU_RULE_SET_NAME, STATUS`) + 버전 행(`VER 1, VER_KIND 'MAJOR', STATUS 'RELEASED', APPLY_FROM '2026-09-10 00:00:00', APPLY_TO '9999-12-31 00:00:00', RULE_IDS`) 두 INSERT 로.
- `MdmLocalSampleLoaderTest.java:52` 의 표 목록에 `"TB_MDM_RULE_SET_VER"` 를 더한다.
- `RuleSetEditQueryCountTest.java:130`: view 가 세트 버전 목록을 한 번 더 읽는다. 측정한 수(시험 실패 문구의 `view SQL 문 N`)가 9 를 넘지 않으면 한도를 `viewCount <= 9` 로 올리고 주석 `// D-144 2단계 — 세트 버전 목록 1문 추가` 를 단다. 9 를 넘으면 늘어난 문장을 로그로 확인하고 버전 목록 읽기를 `versions` 한 번으로 줄인다.

샘플·e2e SQL(옛 `INSERT INTO TB_MDM_RULE_SET (… RULE_IDS …)` 블록 세 곳 + e2e 두 곳). 행 값을 손으로 옮기지 않고 임시 표를 거친다 — 블록마다 다음 순서로 바꾼다.

```sql
CREATE TEMP TABLE TMP_RULE_SET (MARU_RULE_SET_ID TEXT, MARU_RULE_SET_NAME TEXT, RULE_IDS TEXT, FLOW_JSON TEXT, DESCRIPTION TEXT,
    STATUS TEXT, ROW_VERSION INTEGER, C_USR_ID TEXT, C_AT TEXT, C_PGM_ID TEXT, U_USR_ID TEXT, U_AT TEXT, U_PGM_ID TEXT, VER INTEGER);
-- 옛 INSERT 의 표 이름만 TMP_RULE_SET 으로 바꾼다(칼럼 목록·VALUES 행은 그대로, OR IGNORE 는 뺀다)
INSERT INTO TMP_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS, DESCRIPTION, STATUS, ROW_VERSION, C_USR_ID, C_AT, C_PGM_ID, U_USR_ID, U_AT, U_PGM_ID, VER) VALUES
    ('LS_A3', '3CCL 라인스피드', '["BASE_SPD_LKP","SPD_EXC","SPD_JOIN"]', 'workrule 3-1', 'INUSE', 2, 'kim', '2026-08-26 10:00:00', 'mdm-local-sample', 'kim', '2026-08-26 10:00:00', 'mdm-local-sample', 0),
    ...;
INSERT OR IGNORE INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, DESCRIPTION, STATUS, C_USR_ID, C_AT, C_PGM_ID, U_USR_ID, U_AT, U_PGM_ID, VER)
    SELECT MARU_RULE_SET_ID, MARU_RULE_SET_NAME, DESCRIPTION, COALESCE(STATUS, 'INUSE'), C_USR_ID, C_AT, C_PGM_ID, U_USR_ID, U_AT, U_PGM_ID, VER FROM TMP_RULE_SET;
INSERT OR IGNORE INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, VER_KIND, STATUS, APPLY_FROM, APPLY_TO, RULE_IDS, FLOW_JSON, REQUESTED_BY,
    RELEASED_AT, ROW_VERSION, C_USR_ID, C_AT, C_PGM_ID, U_USR_ID, U_AT, U_PGM_ID, AUD_VER)
    SELECT MARU_RULE_SET_ID, 1, 'MAJOR', 'RELEASED', '2000-01-01 00:00:00', '9999-12-31 00:00:00', RULE_IDS, FLOW_JSON, U_USR_ID,
           COALESCE(U_AT, C_AT, '2000-01-01 00:00:00'), COALESCE(ROW_VERSION, 0), C_USR_ID, C_AT, C_PGM_ID, U_USR_ID, U_AT, U_PGM_ID, 0
    FROM TMP_RULE_SET;
DROP TABLE TMP_RULE_SET;
```

  `mdm-local-sample.sql` 는 :662·:696·:724 세 블록, `src/frontend/e2e/fixtures/mdm-ruleSet-data.sql:88` 블록, `src/frontend/e2e/fixtures/mdm-ruleEdit-data.sql:60` 블록이다. e2e 픽스처 머리 주석의 "세트 9 — …" 줄에 "(D-144 2단계: 부모 + 1.000 RELEASED)" 를 덧붙인다. e2e 픽스처 앞쪽의 `DELETE FROM TB_MDM_RULE_SET` 가 있으면 그 앞에 `DELETE FROM TB_MDM_RULE_SET_VER;` 를 넣는다.
- `ContractStubCompileTest.java:451`: `new MdmRuleSet("LS_A3", "3CCL 라인스피드")` 와 `set.setStatus("INUSE")` 두 줄로(스텁 `RuleDefinitionLookupStub` 은 `getMaruRuleSetId`·`getStatus` 만 쓴다).

- [ ] **Step 4: 통과 확인(Task 2 의 시험 포함, 전체)**

Run: `cd src/backend/mdm && export JAVA_HOME=/opt/homebrew/opt/openjdk@21 && ../gradlew :lib:test :api:test --offline`
Expected: PASS. 실패하면 남은 `getRuleIds()`·`getFlowJson()`·`getRowVersion()` 호출(`grep -rn "MdmRuleSet\b" src/backend/mdm/lib/src/main`)과 `TB_MDM_RULE_SET` 직접 SQL(`grep -rn "TB_MDM_RULE_SET\b" src/backend/mdm/api/src/test src/backend/mdm/lib/src`)을 본다.

e2e 픽스처 SQL 은 이 작업에서 돌리지 않는다(e2e 는 Task 13). 같은 모양의 샘플 SQL 을 `MdmLocalSampleLoaderTest` 가 위 명령에서 실제로 적재해 문법을 확인한다.

- [ ] **Step 5: Commit**(Task 2 스테이징 포함)

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/version/VersionedRow.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmRuleVer.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleVersions.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmRuleSet.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmRuleSetVer.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmRuleSetVerId.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/repository/MdmRuleSetVerRepository.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetVersionQueries.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetWrites.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetEditService.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetStatusResult.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetStatusRequest.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetMng/service/RuleSetMngService.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleUsageFinder.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/check/ledger/RuleSetOrderCheck.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/definition/StoredDefinitionLookup.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/ContractStubCompileTest.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/RuleDefinitionLookupStub.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/DmeTestSupport.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/DmeOasisHttpTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleEdit/RuleLedgerChecksTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/RuleSetLifecycleOasisFlowTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmBusinessRuleMigrationTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmBusinessRuleEntityJpaRoundtripTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmLocalSampleLoaderTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetEditServiceTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetEditQueryCountTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/RuleSetVersionQueriesSqliteTest.java \
  src/backend/mdm/sample/mdm-local-sample.sql \
  src/frontend/e2e/fixtures/mdm-ruleSet-data.sql \
  src/frontend/e2e/fixtures/mdm-ruleEdit-data.sql
/usr/bin/git -C <worktree> commit -m "feat(mdm): 룰 세트 흐름을 버전 표로 옮기는 V18 마이그레이션과 세트 버전 엔티티·읽기를 더한다"
```

(Step 3 의 grep 으로 위 목록 밖의 시험 파일을 더 고쳤으면 그 경로를 하나씩 더한다. 같은 워크트리의 다른 에이전트 파일이 섞이지 않게 디렉터리째 add 하지 않는다 — Global Constraints.)

---

### Task 4: 엔진 `ruleSet(setId, evalTs)` — 판정 시각의 RELEASED 세트 버전

**Files:**
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java:28-29`
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java:76,183,207-210`
- Modify: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/fixture/InMemoryDefinitionLookup.java:70-74`
- Modify: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/InMemoryLookups.java:94-97`
- Modify: `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetEvaluationTest.java` (시험 두 개 추가)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/definition/StoredDefinitionLookup.java:34-70,139-142,221-225`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/definition/SingleRuleDefinitionLookup.java:31-34`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/engine/MdmEngineConfig.java:46-49`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/domainMng/service/DomainTestCaseRunner.java:231-234`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java:120-155,249-251`
- Modify: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/RuleDefinitionLookupStub.java:83-89`
- Modify: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/ContractStubCompileTest.java:474`
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/StoredDefinitionLookupTest.java:103,127-135` (+시험 추가)
- Modify: `docs/mdm/engine-contract.md:50,60`

**Interfaces:**
- Consumes: Task 3 `RuleSetVersionQueries.versions`, `RuleVersions.currentReleased`·`effectiveStatus`
- Produces:
  - `DefinitionLookup.ruleSet(String setId, Instant evalTs): Optional<RuleSetDefinition>` — 운영 구현은 `evalTs`(KST 벽시계)에 `APPLY_FROM <= t < APPLY_TO` 인 RELEASED 세트 버전. 없으면 빈 값
  - 엔진 `SET_NOT_FOUND` 문구 `"세트가 없다: " + setId + " @ " + ts`(룰 `RULE_NOT_FOUND` 와 같은 모양, 스펙 §8)
  - `RuleSetRunner.Session.traceDefinition(String label, FlowDefinition def, Map<String, Object> record, Instant evalTs): RunTrace` — 정의를 직접 넘기는 기록 실행(Task 7 확정 검사가 쓴다). `trace(flowJson, …)` 는 이것을 부른다
  - `RuleSetDefinition.status` 는 부모의 계산 상태(저장 CREATED + 적용된 RELEASED 있음 → INUSE)

**이 작업은 엔진과 mdm 을 한 커밋에 바꾼다.** `DefinitionLookup` 의 추상 메서드 서명이 바뀌므로 엔진만 커밋하면 mdm(`StoredDefinitionLookup` 등 구현 다섯 곳)이 컴파일되지 않는다. 구현 일곱 곳: 엔진 시험 `InMemoryDefinitionLookup`·`InMemoryLookups`, mdm `StoredDefinitionLookup`·`SingleRuleDefinitionLookup`·`MdmEngineConfig.EMPTY_DEFINITIONS`·`DomainTestCaseRunner`(익명 구현), lib 시험 `RuleDefinitionLookupStub`.

시험 실행 경로(디버거 `simulate`·케이스 일괄 실행 `runCases`)는 지금처럼 화면이 보낸 흐름을 `traceSet(RuleSetDefinition, …)` 에 직접 넘긴다(편집 중 정의 주입) — `ruleSet` 조회를 타지 않으므로 DRAFT 를 시험할 수 있다. 운영 경로(`evaluateSet`·`setView`·OASIS `ruleSetRunner.execute`)만 RELEASED 를 읽는다.

- [ ] **Step 1: 실패하는 시험 작성**

엔진 `InMemoryDefinitionLookup` 에 받은 시각 기록을 더한다(:70-74 교체).

```java
    private final List<Instant> ruleSetEvalTs = new ArrayList<>();

    /** {@code ruleSet()} 에 넘어온 평가 시각(순서대로). */
    public List<Instant> ruleSetEvalTs() {
        return ruleSetEvalTs;
    }

    @Override
    public Optional<RuleSetDefinition> ruleSet(String setId, Instant evalTs) {
        ruleSetCalls++;
        ruleSetEvalTs.add(evalTs);
        return Optional.ofNullable(sets.get(setId));
    }
```

`RuleSetEvaluationTest` 에 더한다.

```java
    @Test
    void 세트_조회에_초_단위로_자른_판정_시각을_넘긴다() {
        engine.evaluateSet("LS_A3", ls("1250"), SampleRules.EVAL_TS.plusMillis(700));
        assertEquals(List.of(SampleRules.EVAL_TS), lookup.ruleSetEvalTs());
    }

    @Test
    void 없는_세트_문구에_세트_ID_와_판정_시각이_있다() {
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> engine.evaluateSet("NONE", rec(), SampleRules.EVAL_TS));
        assertEquals("세트가 없다: NONE @ " + SampleRules.EVAL_TS, e.violations().get(0).message());
    }
```

(`SampleRules.EVAL_TS` 가 이미 초 단위인지 `SampleRules` 에서 확인한다. 아니면 첫 시험의 기대값을 `SampleRules.EVAL_TS.truncatedTo(ChronoUnit.SECONDS)` 로 둔다.)

mdm `StoredDefinitionLookupTest` 에 더한다(세트 픽스처는 Task 3 의 `DmeTestSupport.ruleSetVersion`).

```java
    @Test
    void 세트는_판정_시각에_적용되는_RELEASED_버전을_고르고_DRAFT_는_고르지_않는다() {
        DmeTestSupport.ruleSet(jdbc, "S_V", "버전 세트", "[\"R_TS\"]", "INUSE", 0);           // 1.000 [2000-01-01, …)
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_TO = '2026-05-01 00:00:00' WHERE MARU_RULE_SET_ID = 'S_V'");
        DmeTestSupport.ruleSetVersion(jdbc, "S_V", "1.001", "MINOR", "RELEASED", "kim", "[\"R_TS\",\"R_OTHER\"]",
                "2026-05-01 00:00:00", "9999-12-31 00:00:00", 0);
        DmeTestSupport.ruleSetVersion(jdbc, "S_V", "2.000", "MAJOR", "DRAFT", "kim", "[\"R_DRAFT\"]", null, null, 0);

        Instant before = LocalDateTime.of(2026, 4, 30, 23, 59, 59).atZone(MdmClockConfig.KST).toInstant();
        Instant at = LocalDateTime.of(2026, 5, 1, 0, 0, 0).atZone(MdmClockConfig.KST).toInstant();
        Instant tooEarly = LocalDateTime.of(1999, 12, 31, 23, 59, 59).atZone(MdmClockConfig.KST).toInstant();

        assertEquals(List.of("R_TS"), lookup.ruleSet("S_V", before).orElseThrow().ruleIds());
        assertEquals(List.of("R_TS", "R_OTHER"), lookup.ruleSet("S_V", at).orElseThrow().ruleIds());
        assertTrue(lookup.ruleSet("S_V", tooEarly).isEmpty());
    }

    @Test
    void 저장_CREATED_라도_적용된_RELEASED_가_있으면_세트_상태는_INUSE_다() {
        DmeTestSupport.ruleSet(jdbc, "S_C", "새 세트", "[\"R_TS\"]", "CREATED", 0);
        assertEquals(SetStatus.INUSE, lookup.ruleSet("S_C", DmeTestSupport.NOW_INSTANT).orElseThrow().status());
    }
```

기존 `lookup.ruleSet("S_BROKEN")` 등(:103, :127-135)은 두 번째 인자 `DmeTestSupport.NOW_INSTANT` 를 더한다. 이 시험 클래스가 `lookup` 을 만드는 곳의 생성자 인자를 Task 3 의 다섯 인자 모양으로 맞춘다.

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend && export JAVA_HOME=/opt/homebrew/opt/openjdk@21 && ./gradlew :maru-mdm-engine:compileTestJava --offline`
Expected: 컴파일 실패(`ruleSet(String, Instant)` 은 `@Override` 대상이 없다)

- [ ] **Step 3: 구현**

`DefinitionLookup.java:28-29`:

```java
    /**
     * {@code evalTs} 에 적용되는 RELEASED 세트 버전(D-144 2단계 — 룰과 같은 판정 시각 해석, K1). 없으면 빈 값.
     * 편집 중 정의의 시험 실행은 이 조회를 쓰지 않고 {@code RuleEngine.traceSet} 에 정의를 직접 넘긴다.
     */
    Optional<RuleSetDefinition> ruleSet(String setId, Instant evalTs);
```

`MdmRuleEngine`: `set(String setId)`(:207-210) 를

```java
    private RuleSetDefinition set(String setId, Instant ts) {
        return definitions.ruleSet(setId, ts).orElseThrow(() -> new EngineEvaluationException(List.of(new Violation(
                Stage.SET_CHECK, Code.SET_NOT_FOUND, null, null, null, "세트가 없다: " + setId + " @ " + ts))));
    }
```

로 바꾸고 호출 두 곳 `prepare(set(setId), record, ts)`(:76) 와 `RuleSetDefinition set = set(setId);`(:183) 에 `ts` 를 넘긴다(두 곳 모두 바로 위에서 `ts = truncate(evalTs)` 를 만든다).

`InMemoryLookups.java:94-97`, `SingleRuleDefinitionLookup.java:31-34`, `MdmEngineConfig.java:46-49`, `DomainTestCaseRunner.java:231-234` 는 서명만 `ruleSet(String setId, java.time.Instant evalTs)` 로 바꾸고 본문(`Optional.empty()`)은 그대로다. `RuleDefinitionLookupStub.java:83-89` 도 서명만 바꾼다. `ContractStubCompileTest.java:474` 는 `lookup.ruleSet("LS_A3", Instant.parse("2026-09-01T00:00:00Z"))`.

`StoredDefinitionLookup`:

```java
    private final Map<String, Optional<RuleSetDefinition>> setCache = new HashMap<>();

    /** 판정 시각에 적용되는 RELEASED 세트 버전({@link RuleVersions#currentReleased}). 한 인스턴스 안에서 (세트, 시각)마다 캐시한다. */
    @Override
    public Optional<RuleSetDefinition> ruleSet(String setId, Instant evalTs) {
        String key = setId + "@" + evalTs;
        Optional<RuleSetDefinition> known = setCache.get(key);
        if (known == null) {
            known = loadSet(setId, evalTs);
            setCache.put(key, known);
        }
        return known;
    }

    private Optional<RuleSetDefinition> loadSet(String setId, Instant evalTs) {
        Optional<MdmRuleSet> parent = sets.findById(setId);
        if (parent.isEmpty()) {
            return Optional.empty();
        }
        LocalDateTime at = LocalDateTime.ofInstant(evalTs, MdmClockConfig.KST);
        List<MdmRuleSetVer> versions = setVersions.versions(setId);
        String status = RuleVersions.effectiveStatus(parent.get().getStatus(), versions, at);
        return RuleVersions.currentReleased(versions, at).map(v -> toDefinition(setId, status, v));
    }

    private static RuleSetDefinition toDefinition(String setId, String status, MdmRuleSetVer v) {
        List<String> ids = readStored(() -> DomainJson.readList(v.getRuleIds()).stream().map(String::valueOf).toList());
        return new RuleSetDefinition(setId, ids, SetStatus.valueOf(status),
                v.getFlowJson() == null ? null : readStored(() -> RuleSetFlowJson.parse(v.getFlowJson())));
    }
```

Task 3 의 이행용 `ruleSet(String)`·`toDefinition(MdmRuleSet, MdmRuleSetVer)` 은 지운다. 클래스 javadoc 의 "세트는 현재 행" 을 "세트는 판정 시각에 적용되는 RELEASED 버전(D-144 2단계)" 으로 고친다.

`RuleSetRunner.Session` — 정의 주입 실행을 한 곳으로 모은다.

```java
        /** {@link RuleSetRunner#trace(String, Map, Instant, List)} 와 같다. */
        public RunTrace trace(String flowJson, Map<String, Object> record, Instant evalTs, List<RunTrace.TraceEdit> edits) {
            if (record == null) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, "레코드는 필수입니다.");
            }
            Instant ts = ts(evalTs);
            List<RunTrace.TraceEdit> echo = edits.isEmpty() ? null : List.copyOf(edits);
            Object known = parsed(flowJson);
            if (known instanceof IllegalArgumentException e) {
                return new RunTrace(UNSAVED, ts, Collections.unmodifiableMap(new LinkedHashMap<>(record)), List.of(), Map.of(),
                        List.of(new Violation(Stage.SET_CHECK, Code.FLOW_INVALID, null, null, null, "흐름을 읽을 수 없다: " + e.getMessage())), echo, null);
            }
            Parsed flow = (Parsed) known;
            return run(UNSAVED, flow.def(), flow.parse(), flow.ruleIds(), record, ts, edits);
        }

        /**
         * 정의를 직접 넘기는 기록 실행(D-144 2단계) — 룰 세트 확정 검사가 DRAFT 버전 흐름으로 테스트 케이스를 돌릴 때 쓴다. 룰은 판정 시각의 RELEASED.
         * {@code label} 은 기록의 세트 표시 이름이다.
         */
        public RunTrace traceDefinition(String label, FlowDefinition def, Map<String, Object> record, Instant evalTs) {
            FlowParse parse = FlowParser.parse(def);
            return run(label, def, parse, RuleSetFlowJson.ruleIds(def, parse), record, ts(evalTs), List.of());
        }

        private RunTrace run(String label, FlowDefinition def, FlowParse parse, List<String> ruleIds, Map<String, Object> record, Instant ts,
                             List<RunTrace.TraceEdit> edits) {
            if (parse.tree() != null) {
                // 엔진은 구조가 올바른 흐름에서만 트리의 룰 정의를 차례로 묻는다 — 그 룰들을 미리 한 번에 읽어 둔다.
                lookup.prefetch(parse.tree().ruleIds(), ts);
            }
            return engine.traceSet(new RuleSetDefinition(label, ruleIds, SetStatus.INUSE, def), record, ts, edits);
        }
```

`warnings(String setId, RuleSetResult r)`(:249-251) 는 판정에 쓴 버전의 룰 목록을 본다.

```java
        LocalDateTime at = LocalDateTime.ofInstant(r.evalTs(), MdmClockConfig.KST);
        List<String> ids = RuleVersions.currentReleased(setVersions.versions(setId), at).map(RuleSetRunner::ruleIdsOf).orElse(List.of());
```

`docs/mdm/engine-contract.md:50` 의 표 칸 `Optional<RuleSetDefinition> ruleSet(setId)` 를 `Optional<RuleSetDefinition> ruleSet(setId, Instant evalTs)` 로 고치고, :60 단락 뒤에 한 단락을 더한다.

```markdown
- **룰 세트 버전(2026-10-02, D-144 2단계).** `ruleSet(setId, evalTs)` 는 판정 시각에 적용되는 RELEASED 세트 버전(`APPLY_FROM <= evalTs < APPLY_TO`, KST)을 돌려준다. 룰과 같은 판정 시각 해석이다(ADR-0006 K1). 세트 버전은 룰 버전을 박지 않는다 — 세트 안의 룰도 같은 `evalTs` 의 RELEASED 버전이다(K2). 적용되는 세트 버전이 없으면 `SET_NOT_FOUND`("세트가 없다: {setId} @ {evalTs}")다. 편집 중인 정의(DRAFT)의 시험 실행은 이 조회를 쓰지 않고 `traceSet(RuleSetDefinition, …)` 에 정의를 직접 넘긴다. `RuleSetDefinition.status` 는 부모의 계산 상태다(저장 CREATED 라도 적용된 RELEASED 가 있으면 INUSE).
```

- [ ] **Step 4: 통과 확인**

Run: `cd src/backend && ./gradlew :maru-mdm-engine:test --offline && (cd mdm && ../gradlew :lib:test :api:test --offline)`
Expected: PASS. (`RuleSetRunnerTest`·`RuleSetRunnerOasisTest`·`RuleSetEditQueryCountTest.runCases_는_판정_시각이_다른_케이스를_…` 는 세트 픽스처의 `APPLY_FROM` 이 2000-01-01 이라(J4) 그대로 통과해야 한다. `RuleSetLifecycleOasisFlowTest` 는 Task 3 의 이행 등록이 `APPLY_FROM = now` 인 RELEASED 를 만들므로 통과한다.)

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java \
  src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/rule/MdmRuleEngine.java \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/fixture/InMemoryDefinitionLookup.java \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/testsupport/InMemoryLookups.java \
  src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleSetEvaluationTest.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/definition/StoredDefinitionLookup.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/definition/SingleRuleDefinitionLookup.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/engine/MdmEngineConfig.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/domainMng/service/DomainTestCaseRunner.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/RuleDefinitionLookupStub.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/ContractStubCompileTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/StoredDefinitionLookupTest.java \
  docs/mdm/engine-contract.md
/usr/bin/git -C <worktree> commit -m "feat(maru-mdm-engine,mdm): 룰 세트 조회를 판정 시각의 RELEASED 버전으로 바꾸고 시험 실행은 정의를 직접 넘긴다"
```

---

### Task 5: DRAFT 전용 저장과 버전 선택 view·등록

**Files (모두 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/` 아래, 시험은 `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/` 아래):**
- Modify: `dme/ruleSetEdit/dto/RuleSetViewRequest.java` (`String ver` 추가)
- Modify: `dme/ruleSetEdit/dto/RuleSetSaveRequest.java` (`String ver` 추가)
- Modify: `dme/ruleSetEdit/dto/RuleSetViewResult.java` (`versions`·`flags`·`me`, Header 버전 칸)
- Modify: `dme/ruleSetEdit/service/RuleSetWrites.java` (`updateVersion` → `updateDraft`)
- Modify: `dme/ruleSetEdit/service/RuleSetEditService.java` (`view`·`save`·`rejectListSaveOverFlow`)
- Modify: `dme/ruleSetMng/service/RuleSetMngService.java` (`register` 최종 모양, `search` 계산 상태·표시 버전 열)
- Modify: `dme/ruleSetMng/dto/RuleSetListRow.java` (`String ver`), `dme/ruleSetMng/dto/RuleSetRegResult.java` (`String ver`)
- Modify 시험: `dme/DmeTestSupport.java` (`ruleSetDraft` 추가), `dme/ruleSetEdit/RuleSetEditServiceTest.java`, `dme/ruleSetEdit/RuleSetCaseRunTest.java`, `dme/ruleSetEdit/RuleSetSimulateTest.java:600-620`, `dme/ruleSetMng/RuleSetMngServiceTest.java`, `dme/DmeOasisHttpTest.java`(세트 저장 사례), `dme/RuleSetLifecycleOasisFlowTest.java:170-195`
- Test (Create): `dme/ruleSetEdit/RuleSetVersionViewSqliteTest.java`, `dme/ruleSetEdit/RuleSetDraftSaveSqliteTest.java`

**Interfaces:**
- Consumes: Task 3 `RuleSetVersionQueries`·`RuleSetWrites.updateHeader`, 공통 `VersionWriteGuard.beginDraftWrite(VersionRef, long, String)`, `RuleScreenSupport.requireVer(String)`·`optionalVer(String)`(1단계), `MdmCurrentUser.userId()`
- Produces:
  - `view` 요청 `{setId, ver?}` — `ver` 가 없으면 기본 선택: 내 DRAFT → 지금 적용 중인 RELEASED → VER 최대. 있는데 그 버전이 없으면 INVALID_VALUE "버전이 없습니다: {setId} v{ver}"
  - `view` 응답(`RuleSetViewResult`): `set`(Header) 에 `ver`·`verKind`·`verLabel`·`verStatus`·`ownerId`·`baseVer`·`applyFrom`·`applyTo` 추가, `set.status` 는 부모 계산 상태(CREATED·INUSE·DEPRECATED), `set.rowVersion` 은 선택 버전 행의 ROW_VERSION(버전이 없으면 0), 버전이 없으면 `ver` 등은 null·`ruleIds=[]`·`flow=null`. `editable` = 담당자 ∧ 선택 버전이 내 DRAFT ∧ 폐기 아님. 새 칸 `versions: VersionRow[]`(VER 내림차순), `flags: Flags`, `me: String`
  - `VersionRow{ver, verKind, verLabel, status, applyFrom, applyTo, ownerId, rowVersion, cancelConfirmable}`, `Flags{canNewMajor, canNewMinor, nextMajor, nextMinor, unappliedCount, currentVer, canDeprecate}` — 룰 `RuleMngViewResult` 와 같은 이름
  - `save` 요청에 `ver`(필수). 선택 버전이 내 DRAFT 일 때만 쓴다: 공통 가드가 소유자(MDM003)·row_version(MDM001)·DRAFT(MDM002)·다른 미적용(MDM007)을 본다. 응답 `rowVersion` = 버전 행의 새 값
  - `RuleSetWrites.updateDraft(String setId, BigDecimal ver, String ruleIdsJson, String flowJson): int`
  - `register` → 부모 CREATED + `1.000 MAJOR DRAFT`(소유자 = 등록자, RULE_IDS `[]`), 응답 `RuleSetRegResult{setId, rowVersion: 0, ver: "1.000"}`
  - 목록 행 `RuleSetListRow.ver`(표시 버전, `"1.000"`), `status` 는 계산 상태
  - `DmeTestSupport.ruleSetDraft(JdbcTemplate jdbc, String setId, String ver, String owner, String ruleIdsJson, long rowVersion)`

- [ ] **Step 1: 실패하는 시험 작성**

`RuleSetVersionViewSqliteTest`:

```java
package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.audit.AuditHolder;
import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.mdm.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** D-144 2단계 — 세트 view 의 버전 선택·편집 가능·버튼 플래그. 시계는 DmeTestSupport.NOW(2026-06-15 09:00). */
@Import(DmeTestSupport.Config.class)
class RuleSetVersionViewSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleSetEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        currentUser.set("kim", STEWARD);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetEditMenu", "ruleSetEdit"));
        DmeTestSupport.rule(jdbc, "R1", "R1", "DECISION", "INUSE");
        DmeTestSupport.ruleSet(jdbc, "S_V", "버전 세트", "[\"R1\"]", "INUSE", 2);                 // 1.000 RELEASED
        DmeTestSupport.ruleSetDraft(jdbc, "S_V", "1.001", "kim", "[\"R1\"]", 0);
    }

    private RuleSetViewResult view(String setId, String ver) {
        RuleSetViewRequest r = new RuleSetViewRequest();
        r.setSetId(setId);
        r.setVer(ver);
        return service.view(r);
    }

    @Test
    void defaultSelectsMyDraftAndItIsEditable() {
        RuleSetViewResult v = view("S_V", null);
        assertThat(v.getSet().getVer()).isEqualTo("1.001");
        assertThat(v.getSet().getVerStatus()).isEqualTo("DRAFT");
        assertThat(v.isEditable()).isTrue();
        assertThat(v.getSet().getRowVersion()).isZero();
        assertThat(v.getVersions()).extracting(RuleSetViewResult.VersionRow::getVer).containsExactly("1.001", "1.000");
        assertThat(v.getFlags().isCanNewMajor()).isFalse();   // 미적용 버전(DRAFT)이 있다
        assertThat(v.getFlags().getUnappliedCount()).isEqualTo(1);
        assertThat(v.getMe()).isEqualTo("kim");
    }

    @Test
    void releasedIsReadOnlyAndOthersDraftIsReadOnly() {
        RuleSetViewResult released = view("S_V", "1.000");
        assertThat(released.getSet().getVerStatus()).isEqualTo("RELEASED");
        assertThat(released.isEditable()).isFalse();
        assertThat(released.getSet().getRowVersion()).isEqualTo(2L);

        currentUser.set("lee", STEWARD);
        RuleSetViewResult other = view("S_V", null);
        assertThat(other.getSet().getVer()).isEqualTo("1.000");   // 내 DRAFT 가 없으면 지금 적용 중인 RELEASED
        assertThat(view("S_V", "1.001").isEditable()).isFalse();  // 남의 DRAFT
    }

    @Test
    void unknownVersionIsRejected() {
        assertThatThrownBy(() -> view("S_V", "9.000")).hasMessageContaining("버전이 없습니다");
    }

    @Test
    void noVersionsOpensEmptyReadOnly() {   // Review Focus 3
        jdbc.update("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, STATUS) VALUES ('S_EMPTY', '빈 세트', 'CREATED')");
        RuleSetViewResult v = view("S_EMPTY", null);
        assertThat(v.getSet().getVer()).isNull();
        assertThat(v.getSet().getRuleIds()).isEmpty();
        assertThat(v.getSet().getFlow()).isNull();
        assertThat(v.isEditable()).isFalse();
        assertThat(v.getVersions()).isEmpty();
        assertThat(v.getFlags().isCanNewMajor()).isTrue();
        assertThat(v.getFlags().isCanNewMinor()).isFalse();
        assertThat(v.getFlags().getNextMajor()).isEqualTo("1.000");
    }

    @Test
    void createdParentWithAppliedReleasedShowsInuse() {
        jdbc.update("UPDATE TB_MDM_RULE_SET SET STATUS = 'CREATED' WHERE MARU_RULE_SET_ID = 'S_V'");
        assertThat(view("S_V", "1.000").getSet().getStatus()).isEqualTo("INUSE");
    }
}
```

`RuleSetDraftSaveSqliteTest`:

```java
package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.audit.AuditHolder;
import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** D-144 2단계 — 저장은 내 DRAFT 에만. RELEASED 는 그대로 남는다(편집 중 운영 보호, 스펙 목적 1). */
@Import(DmeTestSupport.Config.class)
class RuleSetDraftSaveSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleSetEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetEditMenu", "ruleSetEdit"));
        // 입력 이름이 컬럼 사전에 없으면 세트 검사가 UNKNOWN_INPUT 으로 저장을 거부한다(MDM024)
        DmeTestSupport.column(jdbc, "IN_A", DmeTestSupport.domain(jdbc, "IN_A_D", "QTY", "NUMBER", 0));
        DmeTestSupport.rule(jdbc, "R1", "R1", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R1", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R1", 1, 1, "COND", "1", "IN_A", 1);
        DmeTestSupport.var(jdbc, "R1", 1, 2, "RESULT", "Value", "OUT_A", 1, "STRING");
        DmeTestSupport.ruleSet(jdbc, "S_D", "초안 세트", "[]", "INUSE", 5);                         // 1.000 RELEASED, 빈 목록
        DmeTestSupport.ruleSetDraft(jdbc, "S_D", "2.000", "kim", "[]", 0);
    }

    private RuleSetSaveRequest req(String ver, long rv) {
        RuleSetSaveRequest r = new RuleSetSaveRequest();
        r.setSetId("S_D");
        r.setVer(ver);
        r.setRowVersion(rv);
        r.setSetName("새 이름");
        r.setRules(List.of(Map.of("ruleId", "R1")));
        return r;
    }

    private static String code(Runnable call) {
        try {
            call.run();
        } catch (BusinessException e) {
            return e.getCode();
        }
        return null;
    }

    @Test
    void savesIntoMyDraftOnlyAndKeepsReleasedUntouched() {
        RuleSetSaveResult r = service.save(req("2.000", 0));
        assertThat(r.getRowVersion()).isEqualTo(1L);
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_D", "2.000", "RULE_IDS")).isEqualTo("[\"R1\"]");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_D", "1.000", "RULE_IDS")).isEqualTo("[]");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_D", "1.000", "ROW_VERSION")).isEqualTo("5");
        assertThat(jdbc.queryForObject("SELECT MARU_RULE_SET_NAME FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'S_D'", String.class))
                .isEqualTo("새 이름");
    }

    @Test
    void releasedOthersDraftStaleRowVersionAndMissingVerAreRejected() {
        assertThat(code(() -> service.save(req("1.000", 5)))).isEqualTo("MDM003");   // RELEASED 는 소유자가 없어 소유자 검사가 먼저 거부
        assertThat(code(() -> service.save(req("2.000", 7)))).isEqualTo("MDM001");
        assertThat(code(() -> service.save(req(null, 0)))).isEqualTo("MDM021");
        currentUser.set("lee", STEWARD);
        assertThat(code(() -> service.save(req("2.000", 0)))).isEqualTo("MDM003");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_D", "2.000", "RULE_IDS")).isEqualTo("[]");
    }
}
```

(`BusinessException.getCode()` 가 MDM 코드를 주지 않으면 기존 `RuleSetEditServiceTest.refuseCode` 를 그대로 옮겨 쓴다. RELEASED 저장의 첫 거부는 공통 가드 순서(소유자 → row_version → DRAFT, `DefaultVersionWriteGuard.java:56-61`)를 따른다 — 마이그레이션 데이터처럼 `OWNER_ID` 가 비어 있으면 MDM003, 소유자가 나인 RELEASED 면 MDM002 다.)

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetVersionViewSqliteTest' --tests '*RuleSetDraftSaveSqliteTest' --offline`
Expected: 컴파일 실패(`setVer`·`getVersions`·`ruleSetDraft` 없음)

- [ ] **Step 3: 구현**

`RuleSetViewResult` — Header 에 필드·getter·setter 를 더한다(생성자 서명은 그대로, 새 칸은 setter 로 채운다).

```java
        private String ver;
        private String verKind;
        private String verLabel;
        private String verStatus;
        private String ownerId;
        private String baseVer;
        private String applyFrom;
        private String applyTo;
```

바깥 클래스에 `private List<VersionRow> versions = List.of(); private Flags flags = new Flags(); private String me;` 와 getter·setter, 그리고 중첩 클래스 둘:

```java
    /** 버전 목록 한 행(VER 내림차순). 룰 RuleMngViewResult.VersionRow 와 같은 칸 이름. */
    public static class VersionRow {
        private String ver;
        private String verKind;
        private String verLabel;
        private String status;
        private String applyFrom;
        private String applyTo;
        private String ownerId;
        private long rowVersion;
        private boolean cancelConfirmable;
        // 기본 생성자 + 모든 칸 getter·setter(isCancelConfirmable)
    }

    /** 버전 버튼 플래그 — 룰 RuleMngViewResult.Flags 와 같은 규칙(D-144). */
    public static class Flags {
        private boolean canNewMajor;
        private boolean canNewMinor;
        private String nextMajor;
        private String nextMinor;
        private int unappliedCount;
        private String currentVer;
        private boolean canDeprecate;
        // 기본 생성자 + 모든 칸 getter·setter(isCanNewMajor·isCanNewMinor·isCanDeprecate)
    }
```

`RuleSetEditService.view` 전체:

```java
    public RuleSetViewResult view(RuleSetViewRequest request) {
        String setId = requireSetId(request == null ? null : request.getSetId());
        MdmRuleSet set = setRepository.findById(setId).orElseThrow(() -> notFound(setId));
        LocalDateTime now = now();
        String me = currentUser.userId();
        List<MdmRuleSetVer> versions = setVersions.versions(setId);
        BigDecimal wanted = RuleScreenSupport.optionalVer(request.getVer());
        Optional<MdmRuleSetVer> selected = select(setId, versions, wanted, me, now);
        String status = RuleVersions.effectiveStatus(set.getStatus(), versions, now);

        List<String> ruleIds = selected.map(RuleSetVersionQueries::members).orElse(List.of());
        String flowJson = selected.map(MdmRuleSetVer::getFlowJson).orElse(null);
        RuleVarTypeResolver.Scope scope = ioReader.scope();
        Map<String, RuleIo> io = ioReader.read(ruleIds, scope);
        FlowDefinition flow = storedFlow(setId, flowJson);
        Map<String, CondIo> condIo = flow == null ? Map.of() : ioReader.condIo(flow, scope);
        List<RuleSetCheck> checks = flowChecks(ruleIds, io, flow, condIo);
        boolean steward = stewardCheck.isSteward();
        boolean myDraft = selected.filter(v -> "DRAFT".equals(v.getStatus()) && me != null && me.equals(v.getOwnerId())).isPresent();

        RuleSetViewResult.Header header = new RuleSetViewResult.Header(set.getMaruRuleSetId(), set.getMaruRuleSetName(),
                set.getDescription(), status, selected.map(MdmRuleSetVer::getRowVersion).orElse(0L), ruleIds,
                flow == null ? null : RuleSetFlowJson.toMap(flowJson), flow != null && RuleSetFlowJson.branched(flow));
        selected.ifPresent(v -> {
            header.setVer(VersionNumbers.plain(v.getVer()));
            header.setVerKind(v.getVerKind() == null ? null : v.getVerKind().name());
            header.setVerLabel(VersionNumbers.label(v.getVer()));
            header.setVerStatus(v.getStatus());
            header.setOwnerId(v.getOwnerId());
            header.setBaseVer(v.getBaseVer() == null ? null : VersionNumbers.plain(v.getBaseVer()));
            header.setApplyFrom(text(v.getApplyFrom()));
            header.setApplyTo(text(v.getApplyTo()));
        });
        RuleSetViewResult result = new RuleSetViewResult(header, List.copyOf(io.values()), checks,
                steward && myDraft && !DEPRECATED.equals(status), steward && DEPRECATED.equals(status), condIo, cases(setId));
        result.setVersions(versionRows(versions, now, me));
        result.setFlags(flags(status, versions, now));
        result.setMe(me);
        return result;
    }

    /** 요청 버전 → 그 버전(없으면 INVALID_VALUE), 없으면 내 DRAFT → 지금 적용 중인 RELEASED → VER 최대. */
    private static Optional<MdmRuleSetVer> select(String setId, List<MdmRuleSetVer> versions, BigDecimal wanted, String me, LocalDateTime now) {
        if (wanted != null) {
            return Optional.of(versions.stream().filter(v -> VersionNumbers.same(v.getVer(), wanted)).findFirst()
                    .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "버전이 없습니다: " + setId + " " + VersionNumbers.label(wanted))));
        }
        Optional<MdmRuleSetVer> mine = versions.stream()
                .filter(v -> "DRAFT".equals(v.getStatus()) && me != null && me.equals(v.getOwnerId())).findFirst();
        return mine.isPresent() ? mine : RuleSetVersionQueries.display(versions, now);
    }

    private static List<RuleSetViewResult.VersionRow> versionRows(List<MdmRuleSetVer> versions, LocalDateTime now, String me) {
        int unapplied = (int) versions.stream().filter(v -> RuleVersions.isUnapplied(v, now)).count();
        List<RuleSetViewResult.VersionRow> rows = new ArrayList<>(versions.size());
        for (MdmRuleSetVer v : versions) {
            RuleSetViewResult.VersionRow row = new RuleSetViewResult.VersionRow();
            row.setVer(VersionNumbers.plain(v.getVer()));
            row.setVerKind(v.getVerKind() == null ? null : v.getVerKind().name());
            row.setVerLabel(VersionNumbers.label(v.getVer()));
            row.setStatus(v.getStatus());
            row.setApplyFrom(text(v.getApplyFrom()));
            row.setApplyTo(text(v.getApplyTo()));
            row.setOwnerId(v.getOwnerId());
            row.setRowVersion(v.getRowVersion());
            // 확정 취소 가능(ADR-0002 D8) — 룰 RuleMngService.cancelConfirmable 과 같은 판정. 서버가 실행 때 다시 본다.
            row.setCancelConfirmable("RELEASED".equals(v.getStatus()) && unapplied == 1 && v.getApplyFrom() != null
                    && v.getApplyFrom().isAfter(now) && me != null && me.equals(v.getOwnerId()));
            rows.add(row);
        }
        return rows;
    }

    /** 룰 RuleMngService.toFlags 와 같은 규칙 — 미적용 버전이 있거나 폐기면 새 버전 불가, 최대값은 상태로 거르지 않는다(D-144 I1). */
    private static RuleSetViewResult.Flags flags(String status, List<MdmRuleSetVer> versions, LocalDateTime now) {
        RuleSetViewResult.Flags f = new RuleSetViewResult.Flags();
        f.setUnappliedCount((int) versions.stream().filter(v -> RuleVersions.isUnapplied(v, now)).count());
        if (!DEPRECATED.equals(status) && f.getUnappliedCount() == 0) {
            BigDecimal max = VersionNumbers.maxVer(versions.stream().map(MdmRuleSetVer::getVer).toList());
            f.setCanNewMajor(VersionNumbers.canMajor(max));
            f.setCanNewMinor(VersionNumbers.canMinor(max));
            f.setNextMajor(f.isCanNewMajor() ? VersionNumbers.plain(VersionNumbers.nextMajor(max)) : null);
            f.setNextMinor(f.isCanNewMinor() ? VersionNumbers.plain(VersionNumbers.nextMinor(max)) : null);
        }
        f.setCanDeprecate(INUSE.equals(status) && f.getUnappliedCount() == 0);
        RuleVersions.currentReleased(versions, now).ifPresent(v -> f.setCurrentVer(VersionNumbers.plain(v.getVer())));
        return f;
    }

    private static String text(LocalDateTime value) {
        return value == null ? null : value.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }
```

생성자에 `MdmCurrentUser currentUser` 를 더한다. `RuleScreenSupport.optionalVer` 가 형식 오류를 INVALID_INPUT 으로 던지는지 1단계 구현을 확인한다(그대로 쓴다).

`RuleSetEditService.save` — 쓰기 블록과 요청 검사를 바꾼다.

```java
        String setId = requireSetId(request.getSetId());
        BigDecimal ver = RuleScreenSupport.requireVer(request.getVer());
        long rv = requireRowVersion(request.getRowVersion());
        // … (이름·흐름/목록·검사 부분은 지금 그대로. 목록 저장의 rejectListSaveOverFlow 는 setId, ver 를 넘긴다)
        rejectIfAny(checks);
        String description = blankToNull(request.getDescription());
        String me = currentUser.userId();
        long next = tx.execute(status -> {
            long bumped = writeGuard.beginDraftWrite(new VersionRef(VersionTarget.RULE_SET, setId, ver), rv, me); // MDM003·001·002·007
            if (writes.updateDraft(setId, ver, DomainJson.write(ids), flowJson) == 0) {
                throw MdmErrors.of(MdmErrorCode.NOT_DRAFT);
            }
            if (writes.updateHeader(setId, name, description) == 0) {
                throw writeMissed(setId);
            }
            return bumped;
        });
        return new RuleSetSaveResult(setId, next, warnings(checks));
```

`writeMissed(String setId, long rv)` 는 `writeMissed(String setId)` 로 줄이고 row_version 갈래(MDM001)를 지운다(행 버전은 공통 가드가 본다). `rejectListSaveOverFlow(String setId, BigDecimal ver)` 는 `setVersions.find(setId, ver).map(MdmRuleSetVer::getFlowJson)` 을 본다.

`RuleSetWrites` — `updateVersion` 을 지우고 더한다.

```java
    /** DRAFT 의 흐름·룰 목록. row_version 은 호출 직전 공통 가드(beginDraftWrite)가 올렸다. DRAFT 가 아니면 0행. */
    public int updateDraft(String setId, BigDecimal ver, String ruleIdsJson, String flowJson) {
        NativeQuery<?> q = audited("UPDATE TB_MDM_RULE_SET_VER SET RULE_IDS = :ids, FLOW_JSON = :flow, " + AUDIT_SET
                + ", AUD_VER = COALESCE(AUD_VER, 0) + 1 WHERE MARU_RULE_SET_ID = :id AND VER = :ver AND STATUS = 'DRAFT'")
                .setParameter("id", setId).setParameter("ver", VersionNumbers.scaled(ver)).setParameter("ids", ruleIdsJson);
        q.setParameter("flow", flowJson, String.class);
        return q.executeUpdate();
    }
```

`RuleSetMngService.register` 최종 모양(생성자에 `MdmCurrentUser currentUser` 추가):

```java
        String me = currentUser.userId();
        tx.executeWithoutResult(status -> {
            MdmRuleSet set = new MdmRuleSet(id, name);            // CREATED
            set.setDescription(blankToNull(request.getDescription()));
            setRepository.saveAndFlush(set);
            verRepository.saveAndFlush(new MdmRuleSetVer(id, VersionNumbers.FIRST, VersionKind.MAJOR, me, "[]")); // 1.000 DRAFT, 등록자 소유(J12)
        });
        return new RuleSetRegResult(id, 0L, VersionNumbers.plain(VersionNumbers.FIRST));
```

`RuleSetRegResult` 에 `String ver` 칸과 세 인자 생성자를 더한다. `RuleSetMngService.search` — 상태 조건과 행 상태를 계산 상태(`RuleVersions.effectiveStatus(s.getStatus(), byId.get(id), now)`)로 보고, `RuleSetListRow.setVer(...)` 에 표시 버전(`VersionNumbers.plain`, 없으면 null)을 넣는다. `toRow` 에 계산 상태와 표시 버전을 인자로 넘긴다. 클래스 javadoc 의 "빈 세트 등록(TB_MDM_RULE_SET 한 행, INUSE…)" 을 "부모 CREATED + 1.000 MAJOR DRAFT(등록자 소유, D-144 2단계)" 로 고친다.

`DmeTestSupport` 에 더한다.

```java
    /** 세트 DRAFT 한 행(MAJOR, 적용 구간 없음). */
    public static void ruleSetDraft(JdbcTemplate jdbc, String setId, String ver, String owner, String ruleIdsJson, long rowVersion) {
        ruleSetVersion(jdbc, setId, ver, "MAJOR", "DRAFT", owner, ruleIdsJson, null, null, rowVersion);
    }
```

기존 시험 갱신(저장은 이제 내 DRAFT 에만 쓴다):
- `RuleSetEditServiceTest.seed`(:96-102): INUSE 세트 `S_CHAIN`(rv 3)·`S_OTHER`(rv 0)·`S_CYC`(rv 1) 마다 `DmeTestSupport.ruleSetDraft(jdbc, id, "2.000", "kim", <같은 RULE_IDS>, <같은 rv>)` 를 더한다. 저장 요청을 만드는 도우미(`saveReq` 등)에서 `r.setVer("2.000")` 을 넣는다. 저장 결과를 확인하던 `setVerValue(jdbc, id, "1.000", …)`(Task 3 에서 바꾼 줄)는 `"2.000"` 으로 바꾼다. `view_는_…` 시험(:213-235)은 기본 선택이 내 DRAFT 2.000 이 되므로 `v.getSet().getRowVersion()` 기대값은 그대로(같은 rv 로 넣었다)이고, 폐기 세트 `S_OLD` 의 `restorable` 단언도 그대로다. `row_version_이_다르면_MDM001_폐기한_세트는_MDM009_없는_세트는_INVALID_VALUE_다`(:320-327)의 "폐기한 세트" 사례는 DRAFT 가 없어 MDM003 이 먼저 난다 — 폐기 세트 `S_OLD` 에 `ruleSetDraft(jdbc, "S_OLD", "3.000", "kim", "[\"R_GRD\"]", 2)` 를 직접 넣고(폐기 뒤에는 화면이 새 버전을 막지만 데이터로는 있을 수 있다) 기대값 MDM009 를 유지한다.
- `RuleSetSimulateTest.java:600-620`·`RuleSetCaseRunTest` 의 `save` 호출: 대상 세트에 `ruleSetDraft(…, "2.000", "kim", …)` 를 넣고 요청에 `setVer("2.000")`.
- `RuleSetMngServiceTest`: 등록 시험은 부모 `CREATED` 와 버전 행 `1.000|DRAFT|<등록자>` 를 단언한다(`DmeTestSupport.setVerValue(jdbc, id, "1.000", "STATUS")`·`"OWNER_ID"`). 목록 시험의 상태 기대값은 계산 상태다(픽스처는 RELEASED 가 있어 INUSE 그대로).
- `DmeOasisHttpTest` 의 세트 저장 사례(`HTTP_SET`, :320-345): 픽스처에 `ruleSetDraft(jdbc, "HTTP_SET", "2.000", <HTTP 사용자 ID>, "[]", 0)` 를 넣고 요청 params 에 `"ver": "2.000"` 을 더하고, `setRuleIds("HTTP_SET")` 가 `"2.000"` 행을 읽게 한다.
- `RuleSetLifecycleOasisFlowTest`(:170-195): `ruleSetMng.reg` 뒤 `ruleSetEdit.save` params 에 `"ver": "1.000"` 을 더한다. `setView` 단언 뒤(:190) 운영 판정은 아직 확정 전이라 하지 않는다 — 세트 확정·실행 단계는 Task 8 이 이 시험에 더한다.

- [ ] **Step 4: 통과 확인**

Run: `cd src/backend/mdm && ../gradlew :api:test --tests '*dme*' --tests '*RuleSet*' --offline`
Expected: PASS

Run: `cd src/backend/mdm && ../gradlew :lib:test :api:test --offline`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetViewRequest.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetSaveRequest.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetViewResult.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetWrites.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetEditService.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetMng/service/RuleSetMngService.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetMng/dto/RuleSetListRow.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetMng/dto/RuleSetRegResult.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/DmeTestSupport.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetEditServiceTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetCaseRunTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetSimulateTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetMng/RuleSetMngServiceTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/DmeOasisHttpTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/RuleSetLifecycleOasisFlowTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetVersionViewSqliteTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetDraftSaveSqliteTest.java
/usr/bin/git -C <worktree> commit -m "feat(mdm): 룰 세트 저장을 내 DRAFT 에만 쓰고 view 가 버전을 골라 목록·버튼 플래그를 내려준다"
```

---

### Task 6: 세트 버전 조작 — 새 버전 major/minor·삭제·확정취소·선점·해제·넘기기

**Files:**
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetVersionRequest.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetVersionResult.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetVersionService.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetDraftDeletionHook.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetEditService.java` (`delete` 가 `RuleSetVersionRequest` 와 target 을 받음, `copy`·`lock`·`unlock`·`handover` 위임)
- Modify: `src/backend/mdm/api/src/main/resources/services/dme/ruleSetEdit.bpmn` (deleteTask dto, 분기 넷 추가, documentation)
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/DmeBpmnActionTest.java:72-84`
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmOasisActionVocabularyTest.java:73-79`
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetEditServiceTest.java` (폐기 요청 모양)
- Test (Create): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetVersionOpsSqliteTest.java`

**Interfaces:**
- Consumes: 공통 `VersionWriteGuard.checkCanCreateVersion`, `VersionStateService.deleteDraft/cancelConfirm`, `DraftOwnershipService.acquire/release/handover`, `VersionRowStore.markParentInUse`, `VersionNumbers.next/canMajor/canMinor/maxVer`, Task 3 `MdmRuleSetVerRepository`·`RuleSetVersionQueries`
- Produces:
  - `RuleSetVersionRequest{setId, ver, verKind, rowVersion, target, newOwnerId}`, 상수 `TARGET_SET = "SET"`, `TARGET_VERSION = "VERSION"`, `TARGET_CONFIRM = "CONFIRM"`
  - `RuleSetVersionResult{setId, ver, verKind, rowVersion}`(생성자 `(String setId, String ver, String verKind, Long rowVersion)`)
  - `RuleSetEditService.copy(RuleSetVersionRequest): RuleSetVersionResult` — `verKind` 비면 MAJOR. 직전 RELEASED(VER 최대)의 `RULE_IDS`·`FLOW_JSON` 을 복사, `BASE_VER` = 그 VER, 소유자 = 나. 버전이 없으면 빈 1.000
  - `RuleSetEditService.delete(RuleSetVersionRequest)`: `target` `SET`(폐기, `RuleSetStatusResult`)·`VERSION`(DRAFT 삭제)·`CONFIRM`(확정 취소). 그 밖·빈 값은 INVALID_VALUE(J6). 반환 타입은 `Object`(OASIS 는 맵으로 싣는다 — 룰 `RuleMngService.delete` 는 한 타입이라 다르다. 두 결과 모두 `setId` 를 갖는다)
  - `lock`·`unlock`·`handover(RuleSetVersionRequest): RuleSetVersionResult`(새 row_version)
  - BPMN `ruleSetEdit` 분기: `search`·`view`·`save`·`delete`·`restore`·`validate`·`execute`·`copy`·`lock`·`unlock`·`handover`

- [ ] **Step 1: 실패하는 시험 작성**

`RuleSetVersionOpsSqliteTest`:

```java
package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.audit.AuditHolder;
import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.mdm.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetVersionResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** D-144 2단계 — 세트 버전 조작이 룰과 같은 공통 흐름을 탄다. 시계 NOW = 2026-06-15 09:00. */
@Import(DmeTestSupport.Config.class)
class RuleSetVersionOpsSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleSetEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        currentUser.set("kim", STEWARD);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetEditMenu", "ruleSetEdit"));
        DmeTestSupport.ruleSet(jdbc, "S_O", "조작 세트", "[\"R1\",\"R2\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "S_O", "{\"version\":1,\"nodes\":[],\"edges\":[]}");
    }

    private static RuleSetVersionRequest req(String ver, String kind, Long rv, String target) {
        RuleSetVersionRequest r = new RuleSetVersionRequest();
        r.setSetId("S_O");
        r.setVer(ver);
        r.setVerKind(kind);
        r.setRowVersion(rv);
        r.setTarget(target);
        return r;
    }

    @Test
    void minorCopiesLatestReleasedFlowAndRecordsKindAndOwner() {
        RuleSetVersionResult r = service.copy(req(null, "MINOR", null, null));
        assertThat(r.getVer()).isEqualTo("1.001");
        assertThat(r.getVerKind()).isEqualTo("MINOR");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "1.001", "STATUS")).isEqualTo("DRAFT");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "1.001", "OWNER_ID")).isEqualTo("kim");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "1.001", "RULE_IDS")).isEqualTo("[\"R1\",\"R2\"]");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "1.001", "FLOW_JSON")).isEqualTo("{\"version\":1,\"nodes\":[],\"edges\":[]}");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "1.001", "BASE_VER")).startsWith("1");
    }

    @Test
    void majorFloorsAndSecondNewVersionIsRejectedWhileUnapplied() {
        assertThat(service.copy(req(null, "MAJOR", null, null)).getVer()).isEqualTo("2.000");
        assertThatThrownBy(() -> service.copy(req(null, "MINOR", null, null))).hasMessageContaining("미적용");   // MDM006
    }

    @Test
    void deleteDraftLockUnlockAndCancelConfirm() {
        service.copy(req(null, "MAJOR", null, null));                                    // 2.000 DRAFT kim, rv 0
        assertThat(service.unlock(req("2.000", null, 0L, null)).getRowVersion()).isEqualTo(1L);
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "2.000", "OWNER_ID")).isNull();
        assertThat(service.lock(req("2.000", null, 1L, null)).getRowVersion()).isEqualTo(2L);
        service.delete(req("2.000", null, 2L, RuleSetVersionRequest.TARGET_VERSION));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID = 'S_O'", Integer.class)).isEqualTo(1);

        // 확정 취소 — 아직 적용되지 않은 내 RELEASED(apply_from 미래)만
        DmeTestSupport.ruleSetVersion(jdbc, "S_O", "3.000", "MAJOR", "RELEASED", "kim", "[]", "2026-07-01 00:00:00", "9999-12-31 00:00:00", 0);
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_SET_ID = 'S_O' AND VER = 1");
        service.delete(req("3.000", null, 0L, RuleSetVersionRequest.TARGET_CONFIRM));
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "3.000", "STATUS")).isEqualTo("DRAFT");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_O", "1.000", "APPLY_TO")).isEqualTo("9999-12-31 00:00:00");
    }

    @Test
    void deleteOnlyDraftLeavesNoVersion() {   // Review Focus 3
        jdbc.update("DELETE FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID = 'S_O'");
        DmeTestSupport.ruleSetDraft(jdbc, "S_O", "1.000", "kim", "[]", 0);
        service.delete(req("1.000", null, 0L, RuleSetVersionRequest.TARGET_VERSION));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID = 'S_O'", Integer.class)).isZero();
        assertThat(service.copy(req(null, "MAJOR", null, null)).getVer()).isEqualTo("1.000");
        assertThatThrownBy(() -> service.copy(req(null, "MINOR", null, null))).isNotNull();
    }

    @Test
    void deleteNeedsKnownTarget() {
        assertThatThrownBy(() -> service.delete(req("1.000", null, 0L, null))).hasMessageContaining("SET·VERSION·CONFIRM");
        assertThatThrownBy(() -> service.delete(req("1.000", null, 0L, "RULE"))).hasMessageContaining("SET·VERSION·CONFIRM");
    }

    @Test
    void deprecateWithTargetSet() {
        service.delete(req(null, null, null, RuleSetVersionRequest.TARGET_SET));
        assertThat(jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'S_O'", String.class)).isEqualTo("DEPRECATED");
        assertThatThrownBy(() -> service.copy(req(null, "MAJOR", null, null))).hasMessageContaining("폐기한 룰 세트");
    }
}
```

`DmeBpmnActionTest.java:72-84` 을 바꾼다.

```java
    /**
     * TSK-08-06 I17 + D-144 2단계 — 룰 세트 편집. delete 는 target SET(폐기)·VERSION(DRAFT 삭제)·CONFIRM(확정 취소), restore 는 되살리기.
     * copy(새 버전)·lock·unlock·handover 는 룰(ruleMng)과 같은 동사다.
     */
    @Test
    void ruleSetEdit_는_search_view_save_delete_restore_validate_execute_copy_lock_unlock_handover() throws Exception {
        Map<String, String> methods = new HashMap<>();
        methods.put("search", "search");
        methods.put("view", "view");
        methods.put("save", "save");
        methods.put("delete", "delete");
        methods.put("restore", "restore");
        methods.put("validate", "condIo");
        methods.put("execute", "simulate");
        methods.put("copy", "copy");
        methods.put("lock", "lock");
        methods.put("unlock", "unlock");
        methods.put("handover", "handover");
        Map<String, Boolean> readOnly = new HashMap<>();
        methods.keySet().forEach(a -> readOnly.put(a, a.equals("search") || a.equals("view")));
        assertActions("services/dme/ruleSetEdit.bpmn", "ruleSetEdit", "ruleSetEditService", methods, readOnly);
    }
```

`MdmOasisActionVocabularyTest.java:77`: `assertEquals(Set.of("search", "view", "save", "delete", "restore", "validate", "execute", "copy", "lock", "unlock", "handover"), actionsFromGateway(path));`

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetVersionOpsSqliteTest' --tests '*DmeBpmnActionTest' --tests '*MdmOasisActionVocabularyTest' --offline`
Expected: 컴파일 실패(`RuleSetVersionRequest` 없음)

- [ ] **Step 3: 구현**

`RuleSetVersionRequest`(룰 `RuleVersionRequest` 와 같은 모양):

```java
package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

/** 세트 버전 조작 요청(D-144 2단계) — copy·delete(target)·lock·unlock·handover. 버전은 소수 셋째 자리 문자열("1.001"). */
public class RuleSetVersionRequest {

    public static final String TARGET_SET = "SET";
    public static final String TARGET_VERSION = "VERSION";
    public static final String TARGET_CONFIRM = "CONFIRM";

    private String setId;
    private String ver;
    private String verKind;
    private Long rowVersion;
    private String target;
    private String newOwnerId;

    public String getSetId() { return setId; }
    public String getVer() { return ver; }
    public String getVerKind() { return verKind; }
    public Long getRowVersion() { return rowVersion; }
    public String getTarget() { return target; }
    public String getNewOwnerId() { return newOwnerId; }
    public void setSetId(String v) { this.setId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setVerKind(String v) { this.verKind = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setTarget(String v) { this.target = v; }
    public void setNewOwnerId(String v) { this.newOwnerId = v; }
}
```

`RuleSetVersionResult`: 필드 `setId`·`ver`·`verKind`·`rowVersion(Long)`, 기본 생성자, `(String setId, String ver, String verKind, Long rowVersion)` 생성자, getter·setter.

`RuleSetDraftDeletionHook`:

```java
package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import org.springframework.stereotype.Component;

/**
 * {@code RULE_SET} DRAFT 삭제 훅(D-144 2단계). 세트 버전 행에는 자식 표가 없다(테스트 케이스는 세트 단위). main 에 정확히 하나여야
 * 공통 {@code VersionStateService.deleteDraft} 가 세트 DRAFT 를 지울 수 있다(fail-closed, VersionSpiRegistry).
 */
@Component
public class RuleSetDraftDeletionHook implements VersionDraftDeletionSpi {

    @Override
    public VersionTarget target() {
        return VersionTarget.RULE_SET;
    }

    @Override
    public void beforeDraftDelete(VersionRef draft) {
        // 지울 자식 행이 없다.
    }
}
```

`RuleSetVersionService`(룰 `RuleVersionService.java:92-225` 를 세트로 옮긴 것):

```java
package com.dongkuk.dmes.mdm.dme.ruleSetEdit.service;

// import: BusinessException, ErrorCode, RuleScreenSupport, RuleSetVersionQueries, RuleStewardCheck, RuleVersions, MdmCurrentUser, MdmErrors,
//         VersionNumbers, VersionRowStore, MdmErrorCode, MdmNativeAuditSupport, DraftOwnershipService, VersionKind, VersionRef, VersionStateService,
//         VersionTarget, VersionWriteGuard, RuleSetVersionRequest, RuleSetVersionResult, MdmRuleSet, MdmRuleSetVer, MdmRuleSetRepository,
//         MdmRuleSetVerRepository, BigDecimal, Clock, LocalDateTime, ChronoUnit, List, Optional, Service, PlatformTransactionManager, TransactionTemplate

/**
 * 룰 세트 버전 조작(D-144 2단계) — 새 버전(copy)·DRAFT 삭제·확정 취소·선점·해제·넘기기. 소유권·삭제·확정 취소는 공통 서비스로만 한다
 * (룰 RuleVersionService 와 같은 규칙). 이 서비스는 OWNER_ID·ROW_VERSION·버전 STATUS 를 직접 쓰지 않는다.
 * {@code @Transactional} 을 붙이지 않는다 — 쓰기는 TransactionTemplate.
 */
@Service
public class RuleSetVersionService {

    private final MdmRuleSetRepository setRepository;
    private final MdmRuleSetVerRepository verRepository;
    private final RuleSetVersionQueries setVersions;
    private final RuleStewardCheck stewardCheck;
    private final VersionWriteGuard writeGuard;
    private final VersionStateService stateService;
    private final DraftOwnershipService ownership;
    private final VersionRowStore versionStore;
    private final MdmNativeAuditSupport audit;
    private final MdmCurrentUser currentUser;
    private final Clock clock;
    private final TransactionTemplate tx;

    // 생성자: 위 필드 + PlatformTransactionManager → new TransactionTemplate(transactionManager)

    /** 새 버전(action copy). 번호는 VER 최대에서 verKind 로(MAJOR floor+1, MINOR +0.001, 없으면 1.000). 비면 MAJOR. */
    public RuleSetVersionResult newVersion(RuleSetVersionRequest request) {
        VersionKind kind = parseKind(request.getVerKind());
        MdmRuleSet set = load(request.getSetId());
        String id = set.getMaruRuleSetId();
        if ("DEPRECATED".equals(set.getStatus())) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "폐기한 룰 세트는 새 버전을 만들 수 없습니다", List.of());
        }
        stewardCheck.requireSteward();
        writeGuard.checkCanCreateVersion(VersionTarget.RULE_SET, id);                       // MDM006
        List<MdmRuleSetVer> versions = setVersions.versions(id);
        Optional<MdmRuleSetVer> source = RuleVersions.latestReleased(versions);
        if (source.isEmpty() && !versions.isEmpty()) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "복사할 RELEASED 버전이 없어 새 버전을 만들 수 없습니다: " + id);
        }
        BigDecimal max = VersionNumbers.maxVer(versions.stream().map(MdmRuleSetVer::getVer).toList());
        if (kind == VersionKind.MINOR && max == null) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "버전이 없으면 major 만 만들 수 있습니다", List.of());
        }
        if (kind == VersionKind.MINOR && !VersionNumbers.canMinor(max)) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "minor 를 더 올릴 수 없습니다. major 를 올리십시오", List.of());
        }
        if (kind == VersionKind.MAJOR && !VersionNumbers.canMajor(max)) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "major 를 더 올릴 수 없습니다", List.of());
        }
        BigDecimal next = VersionNumbers.next(max, kind);
        String me = currentUser.userId();
        boolean promote = RuleVersions.needsInUsePromotion(set.getStatus(), versions, now());
        tx.executeWithoutResult(status -> {
            MdmRuleSetVer created = new MdmRuleSetVer(id, next, kind, me, source.map(MdmRuleSetVer::getRuleIds).orElse("[]"));
            source.ifPresent(s -> {
                created.setBaseVer(s.getVer());
                created.setFlowJson(s.getFlowJson());
            });
            verRepository.saveAndFlush(created);
            if (promote) {
                versionStore.markParentInUse(VersionTarget.RULE_SET, id, audit.currentStamp());
            }
        });
        return new RuleSetVersionResult(id, VersionNumbers.plain(next), kind.name(), 0L);
    }

    /** DRAFT 삭제(delete target VERSION). 소유자·DRAFT·row_version·삭제 훅은 공통 서비스가 본다. */
    public RuleSetVersionResult deleteDraft(RuleSetVersionRequest request) {
        VersionRef ref = ref(request);
        stateService.deleteDraft(ref, RuleScreenSupport.requireRowVersion(request.getRowVersion()), currentUser.userId());
        return new RuleSetVersionResult(ref.objectId(), VersionNumbers.plain(ref.ver()), null, null);
    }

    /** 확정 취소(delete target CONFIRM, ADR-0002 D8). */
    public RuleSetVersionResult cancelConfirm(RuleSetVersionRequest request) {
        VersionRef ref = ref(request);
        stateService.cancelConfirm(ref, RuleScreenSupport.requireRowVersion(request.getRowVersion()), currentUser.userId());
        return new RuleSetVersionResult(ref.objectId(), VersionNumbers.plain(ref.ver()), null, null);
    }

    public RuleSetVersionResult lock(RuleSetVersionRequest request) {
        VersionRef ref = ref(request);
        long rv = ownership.acquire(ref, RuleScreenSupport.requireRowVersion(request.getRowVersion()), currentUser.userId());
        return new RuleSetVersionResult(ref.objectId(), VersionNumbers.plain(ref.ver()), null, rv);
    }

    public RuleSetVersionResult unlock(RuleSetVersionRequest request) {
        VersionRef ref = ref(request);
        long rv = ownership.release(ref, RuleScreenSupport.requireRowVersion(request.getRowVersion()), currentUser.userId());
        return new RuleSetVersionResult(ref.objectId(), VersionNumbers.plain(ref.ver()), null, rv);
    }

    public RuleSetVersionResult handover(RuleSetVersionRequest request) {
        VersionRef ref = ref(request);
        long rv = ownership.handover(ref, RuleScreenSupport.requireRowVersion(request.getRowVersion()), currentUser.userId(),
                request.getNewOwnerId());
        return new RuleSetVersionResult(ref.objectId(), VersionNumbers.plain(ref.ver()), null, rv);
    }

    private VersionRef ref(RuleSetVersionRequest request) {
        MdmRuleSet set = load(request.getSetId());
        return new VersionRef(VersionTarget.RULE_SET, set.getMaruRuleSetId(), RuleScreenSupport.requireVer(request.getVer()));
    }

    private MdmRuleSet load(String setId) {
        if (setId == null || setId.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "룰 세트 ID 는 필수입니다.");
        }
        return setRepository.findById(setId.trim())
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "룰 세트를 찾을 수 없습니다: " + setId));
    }

    private static VersionKind parseKind(String raw) {
        if (raw == null || raw.isBlank()) {
            return VersionKind.MAJOR;
        }
        try {
            return VersionKind.valueOf(raw.trim());
        } catch (IllegalArgumentException e) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "버전 종류는 MAJOR 또는 MINOR 입니다", List.of());
        }
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }
}
```

(`RuleScreenSupport.requireRowVersion(Long)` 이 static 인지 1단계 코드에서 확인한다 — `RuleVersionService.java:5` 가 static import 하므로 static 이다.)

`RuleSetEditService` — 생성자에 `RuleSetVersionService versionService` 를 더하고:

```java
    // action: copy / lock / unlock / handover — D-144 2단계, 룰(ruleMng)과 같은 동사

    public RuleSetVersionResult copy(RuleSetVersionRequest request) {
        return versionService.newVersion(request);
    }

    public RuleSetVersionResult lock(RuleSetVersionRequest request) {
        return versionService.lock(request);
    }

    public RuleSetVersionResult unlock(RuleSetVersionRequest request) {
        return versionService.unlock(request);
    }

    public RuleSetVersionResult handover(RuleSetVersionRequest request) {
        return versionService.handover(request);
    }

    /** delete — target SET(폐기)·VERSION(DRAFT 삭제)·CONFIRM(확정 취소, ADR-0002 D8). 빈 target 은 거부한다(J6). */
    public Object delete(RuleSetVersionRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "삭제할 값이 없습니다.");
        }
        String target = blankToNull(request.getTarget());
        if (RuleSetVersionRequest.TARGET_SET.equals(target)) {
            return deprecate(requireSetId(request.getSetId()));
        }
        if (RuleSetVersionRequest.TARGET_VERSION.equals(target)) {
            return versionService.deleteDraft(request);
        }
        if (RuleSetVersionRequest.TARGET_CONFIRM.equals(target)) {
            return versionService.cancelConfirm(request);
        }
        throw new BusinessException(ErrorCode.INVALID_VALUE, "삭제 대상은 SET·VERSION·CONFIRM 중 하나여야 합니다: " + target);
    }
```

Task 3 의 `delete(RuleSetStatusRequest)` 본문은 `private RuleSetStatusResult deprecate(String setId)` 로 옮긴다(담당자 검사 포함).

`ruleSetEdit.bpmn` — `bpmn-skill`(bpmn-tool CLI)로 고친다. 바꿀 것:
1. `deleteTask` 의 `dto` 를 `com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetVersionRequest` 로, 이름을 "폐기·DRAFT 삭제·확정 취소" 로.
2. serviceTask 넷을 더한다 — 모두 `camunda:class="ruleSetEditService"`, `output=result`, `dto=com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetVersionRequest`.

| id | name | method | 분기 sequenceFlow(id·name) | endEvent id·name |
|---|---|---|---|---|
| `copyTask` | 새 버전 | `copy` | `flow_copy` / `copy` | `endCopy` / 새 버전 완료 |
| `lockTask` | DRAFT 선점 | `lock` | `flow_lock` / `lock` | `endLock` / 선점 완료 |
| `unlockTask` | DRAFT 해제 | `unlock` | `flow_unlock` / `unlock` | `endUnlock` / 해제 완료 |
| `handoverTask` | DRAFT 넘기기 | `handover` | `flow_handover` / `handover` | `endHandover` / 넘기기 완료 |

   각 task → end 선 id 는 `flow_copy_end` 처럼 `_end` 를 붙인다. 분기선은 `sourceRef="actionGateway"` 이고 조건식을 두지 않는다(flow name 만, `RuleConfirmBpmnActionTest.B3` 관례). 도형(DI)은 bpmn-tool 의 배치를 쓴다.
3. process `documentation` 에 네 줄을 더하고 delete 줄을 바꾼다.

```
action=delete  -> deleteTask  (ruleSetEditService.delete)  EDIT — target SET(폐기 INUSE -> DEPRECATED)·VERSION(DRAFT 삭제)·CONFIRM(확정 취소, ADR-0002 D8)
action=copy     -> copyTask     (ruleSetEditService.copy)     EDIT — 새 버전(verKind MAJOR·MINOR, 직전 RELEASED 복사, D-144)
action=lock     -> lockTask     (ruleSetEditService.lock)     EDIT — DRAFT 선점
action=unlock   -> unlockTask   (ruleSetEditService.unlock)   EDIT — DRAFT 해제(소유자만)
action=handover -> handoverTask (ruleSetEditService.handover) EDIT — DRAFT 넘기기
```

   마지막 줄 "세트에는 버전·DRAFT·선점이 없고 ROW_VERSION(MDM001)으로만 동시 편집을 막는다." 는 "세트도 룰처럼 DRAFT·소유자·확정을 갖는다(D-144 2단계). 저장은 내 DRAFT 에만 쓴다." 로 바꾼다.

`RuleSetEditServiceTest` 의 폐기 호출(`service.delete(statusReq(...))`)은 `RuleSetVersionRequest`(`setSetId`, `setTarget("SET")`) 로 바꾼다. 결과는 `(RuleSetStatusResult)` 로 캐스팅해 단언한다.

- [ ] **Step 4: 통과 확인**

Run: `cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSet*' --tests '*DmeBpmnActionTest' --tests '*MdmOasisActionVocabularyTest' --tests '*DmeOasisHttpTest' --offline`
Expected: PASS

Run: `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root /Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning` (스크립트 경로가 다르면 `oasis-contract-check` 스킬의 안내를 따른다)
Expected: ERROR 0

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetVersionRequest.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetVersionResult.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetVersionService.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetEditService.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetDraftDeletionHook.java \
  src/backend/mdm/api/src/main/resources/services/dme/ruleSetEdit.bpmn \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/DmeBpmnActionTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmOasisActionVocabularyTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetEditServiceTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetVersionOpsSqliteTest.java
/usr/bin/git -C <worktree> commit -m "feat(mdm): 룰 세트에 새 버전 major/minor·DRAFT 삭제·확정취소·선점·해제·넘기기를 더한다"
```

---

### Task 7: 룰 세트 확정 검사 SPI — 흐름 구조·참조 룰 RELEASED·순서·테스트 케이스

**Files (모두 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/` 아래):**
- Modify: `common/rule/RuleIoReader.java:65-136` (`readAt` 추가, 버전 고르기를 인자로)
- Modify: `common/rule/RuleSetVersionQueries.java` (static `flow` 추가)
- Create: `common/rule/confirm/RuleSetConfirmReport.java` (순수 보고서)
- Create: `common/rule/confirm/RuleSetVersionDiffs.java` (흐름 diff, 순수)
- Create: `common/rule/confirm/RuleSetConfirmChecks.java` (원장 읽기 컴포넌트)
- Create: `common/rule/confirm/RuleSetConfirmCheck.java` (RULE_SET `VersionConfirmCheckSpi`)
- Test (Create): `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/confirm/RuleSetVersionDiffsTest.java`
- Test (Create): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetConfirm/RuleSetConfirmChecksSqliteTest.java`

**Interfaces:**
- Consumes: Task 1 `MdmRuleSetConfirmCheckItem`, Task 3 `RuleSetVersionQueries`·`RuleVersions.currentReleased`, Task 4 `RuleSetRunner.Session.traceDefinition`, `RuleSetAnalyzer.checks(List<String>, Map)`·`checks(FlowDefinition, Map, Map)`, `RuleSetCaseJudge.judge`, `RuleCaseJudge.object`, `RuleConfirmReport.Issue`·`ItemStatus`·`CaseSummary`·`CASE_FAILED`·`CASE_RUN_FAILED`
- Produces:
  - `RuleIoReader.readAt(Collection<String> ruleIds, LocalDateTime at, RuleVarTypeResolver.Scope scope): Map<String, RuleIo>` — 룰마다 `at` 에 적용되는 RELEASED 버전으로 계산. 없으면 `releasedVer=null`
  - `RuleSetConfirmReport.Report(VersionRef draft, List<Item> items, RuleConfirmReport.CaseSummary cases)`, `Item(MdmRuleSetConfirmCheckItem item, RuleConfirmReport.ItemStatus status, List<RuleConfirmReport.Issue> issues)` — 항목은 enum 순서대로 넷
  - `RuleSetConfirmReport.report(VersionRef draft, List<RuleSetCheck> checks, List<String> notReleased, LocalDateTime applyFrom, List<Map<String, Object>> caseResults, String caseRunFailure): Report`, `storedFlowCorrupt(VersionRef draft, String message): Report`, `flatten(Report): ConfirmCheckResult`
  - 코드: `SET_RULE_NOT_RELEASED`(항목 RULES_RELEASED, itemKey `RULE:<룰 ID>`), `STORED_FLOW_CORRUPT`(FLOW_STRUCTURE), 흐름 검사 코드는 `RuleSetCheck.code` 그대로(ORDER·CYCLE·IF_SIBLING·PAR_SIBLING·DUP_RESULT 는 ORDER 항목, 나머지는 FLOW_STRUCTURE, `NO_RELEASED` 는 버리고 항목 2가 ERROR 로 다시 본다). 심각도 REJECT → ERROR, WARN → WARNING. itemKey `NODE:<id>`·`EDGE:<id>`·`RULE:<id>` 중 있는 첫 값
  - `RuleSetVersionDiffs.diff(FlowDefinition base, FlowDefinition target): List<VersionDiffEntry>` — 키 `NODE:<id>`(값 kind·ruleId·label·splitId·attachTo·catches)·`EDGE:<id>`(값 from·to·order·cond·otherwise·label), 키 글자 순
  - `RuleSetConfirmChecks.report(VersionRef draft, LocalDateTime applyFrom): RuleSetConfirmReport.Report`, `diff(VersionRef draft): VersionDiff`, `previousReleased(String setId, BigDecimal ver): Optional<MdmRuleSetVer>`
  - `RuleSetVersionQueries.flow(MdmRuleSetVer v): FlowDefinition`(static, FLOW_JSON 없으면 `FlowParser.linear(members(v))`, 읽지 못하면 `IllegalArgumentException`) — 확정 검사·diff·세트 순서 검사(Task 9)가 함께 쓴다
  - `RuleSetConfirmCheck implements VersionConfirmCheckSpi` — `target() = RULE_SET`, `check(req) = flatten(report(req.draft(), req.requestedApplyFrom()))`

- [ ] **Step 1: 실패하는 시험 작성**

`RuleSetVersionDiffsTest`(lib, 순수):

```java
package com.dongkuk.dmes.mdm.common.rule.confirm;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import org.junit.jupiter.api.Test;

class RuleSetVersionDiffsTest {

    @Test
    void nodeAndEdgeChangesAreKeyedById() {
        Map<String, DiffKind> kinds = RuleSetVersionDiffs.diff(FlowParser.linear(List.of("R_A")), FlowParser.linear(List.of("R_B", "R_C")))
                .stream().collect(Collectors.toMap(VersionDiffEntry::key, VersionDiffEntry::kind));
        assertThat(kinds).containsEntry("NODE:start", DiffKind.SAME)
                .containsEntry("NODE:r1", DiffKind.CHANGED)
                .containsEntry("NODE:r2", DiffKind.ADDED)
                .containsEntry("EDGE:e2", DiffKind.CHANGED)
                .containsEntry("EDGE:e3", DiffKind.ADDED);
    }

    @Test
    void firstVersionIsAllAddedAndRemovedNodesAreReported() {
        assertThat(RuleSetVersionDiffs.diff(null, FlowParser.linear(List.of("R_A")))).extracting(VersionDiffEntry::kind).containsOnly(DiffKind.ADDED);
        List<VersionDiffEntry> removed = RuleSetVersionDiffs.diff(FlowParser.linear(List.of("R_A", "R_B")), FlowParser.linear(List.of("R_A")));
        VersionDiffEntry r2 = removed.stream().filter(e -> e.key().equals("NODE:r2")).findFirst().orElseThrow();
        assertThat(r2.kind()).isEqualTo(DiffKind.REMOVED);
        assertThat(r2.oldValues()).containsEntry("ruleId", "R_B");
        assertThat(r2.newValues()).isNull();
    }
}
```

`RuleSetConfirmChecksSqliteTest`(api):

```java
package com.dongkuk.dmes.mdm.dme.ruleSetConfirm;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.audit.AuditHolder;
import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.mdm.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.ItemStatus;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleSetConfirmChecks;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleSetConfirmReport;
import com.dongkuk.dmes.mdm.common.version.VersionSpiRegistry;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleSetConfirmCheckItem;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.service.RuleVersionService;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** D-144 2단계 — 세트 확정 검사 4항목. 시계 NOW = 2026-06-15 09:00. 입력 이름 CF_IN 은 컬럼 사전에 있다(UNKNOWN_INPUT 이 나지 않게). */
@Import(DmeTestSupport.Config.class)
class RuleSetConfirmChecksSqliteTest extends AbstractMdmSharedDbTest {

    static final LocalDateTime JUL1 = LocalDateTime.of(2026, 7, 1, 0, 0, 0);
    static final LocalDateTime AUG1 = LocalDateTime.of(2026, 8, 1, 0, 0, 0);

    @Autowired
    RuleSetConfirmChecks checks;
    @Autowired
    VersionSpiRegistry spis;
    @Autowired
    RuleVersionService ruleVersions;
    @Autowired
    RuleSetEditService setEdit;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetConfirmMenu", "ruleSetConfirm"));
        DmeTestSupport.column(jdbc, "CF_IN", DmeTestSupport.domain(jdbc, "CF_IN_D", "QTY", "NUMBER", 0));
        rule("R_A", "1.000", "2026-01-01 00:00:00", null, "CF_IN", "OUT_A");
    }

    /** RELEASED 룰 버전 — 조건 하나(reads)·결과 하나(produces), 행 없음. */
    private void rule(String id, String ver, String from, String to, String reads, String produces) {
        if (jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_RULE WHERE MARU_RULE_ID = ?", Integer.class, id) == 0) {
            DmeTestSupport.rule(jdbc, id, id, "DECISION", "INUSE");
        }
        BigDecimal v = new BigDecimal(ver);
        DmeTestSupport.released(jdbc, id, v, "MAJOR", "FIRST", from, to);
        DmeTestSupport.var(jdbc, id, v, 1, "COND", "1", reads, 1, null);
        DmeTestSupport.var(jdbc, id, v, 2, "RESULT", "Value", produces, 1, "STRING");
    }

    private void draftSet(String setId, String ruleIdsJson) {
        jdbc.update("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, STATUS) VALUES (?, ?, 'CREATED')", setId, setId);
        DmeTestSupport.ruleSetDraft(jdbc, setId, "1.000", "kim", ruleIdsJson, 0);
    }

    private RuleSetConfirmReport.Report report(String setId, LocalDateTime applyFrom) {
        return checks.report(new VersionRef(VersionTarget.RULE_SET, setId, new BigDecimal("1.000")), applyFrom);
    }

    private static RuleSetConfirmReport.Item item(RuleSetConfirmReport.Report r, MdmRuleSetConfirmCheckItem which) {
        return r.items().stream().filter(i -> i.item() == which).findFirst().orElseThrow();
    }

    @Test
    void allFourPassWhenRulesAreReleasedAtApplyFrom() {
        draftSet("S_OK", "[\"R_A\"]");
        RuleSetConfirmReport.Report r = report("S_OK", JUL1);
        assertThat(r.items()).extracting(RuleSetConfirmReport.Item::item).containsExactly(MdmRuleSetConfirmCheckItem.values());
        assertThat(r.items()).extracting(RuleSetConfirmReport.Item::status).containsOnly(ItemStatus.PASSED);
    }

    @Test
    void ruleReleasedOnlyAfterApplyFromIsRejected() {
        rule("R_B", "1.000", "2026-08-01 00:00:00", null, "CF_IN", "OUT_B");
        draftSet("S_LATE", "[\"R_A\",\"R_B\"]");
        RuleSetConfirmReport.Item early = item(report("S_LATE", JUL1), MdmRuleSetConfirmCheckItem.RULES_RELEASED);
        assertThat(early.status()).isEqualTo(ItemStatus.REJECTED);
        assertThat(early.issues()).extracting(i -> i.issue().itemKey()).containsExactly("RULE:R_B");
        assertThat(early.issues().get(0).issue().code()).isEqualTo(RuleSetConfirmReport.SET_RULE_NOT_RELEASED);
        assertThat(item(report("S_LATE", AUG1), MdmRuleSetConfirmCheckItem.RULES_RELEASED).status()).isEqualTo(ItemStatus.PASSED);
    }

    @Test
    void orderUsesRuleVersionsAtApplyFrom() {
        rule("R_X", "1.000", "2026-01-01 00:00:00", "2026-08-01 00:00:00", "CF_IN", "OUT_X");
        rule("R_X", "2.000", "2026-08-01 00:00:00", null, "OUT_Y", "OUT_X");     // 2.000 은 뒤 룰 R_Y 의 결과를 읽는다
        rule("R_Y", "1.000", "2026-01-01 00:00:00", null, "CF_IN", "OUT_Y");
        draftSet("S_ORD", "[\"R_X\",\"R_Y\"]");
        assertThat(item(report("S_ORD", JUL1), MdmRuleSetConfirmCheckItem.ORDER).status()).isEqualTo(ItemStatus.PASSED);
        RuleSetConfirmReport.Item late = item(report("S_ORD", AUG1), MdmRuleSetConfirmCheckItem.ORDER);
        assertThat(late.status()).isEqualTo(ItemStatus.REJECTED);
        assertThat(late.issues()).extracting(i -> i.issue().code()).contains("ORDER");
    }

    @Test
    void failingTestCaseIsAnError() {
        draftSet("S_CASE", "[\"R_A\"]");
        jdbc.update("INSERT INTO TB_MDM_RULE_SET_TEST_CASE (MARU_RULE_SET_ID, CASE_ID, CASE_NAME, INPUT_JSON, EXPECTED_JSON) "
                + "VALUES ('S_CASE', 1, 'c1', '{\"CF_IN\":1}', '{\"OUT_A\":\"Z\"}')");
        RuleSetConfirmReport.Report r = report("S_CASE", JUL1);
        RuleSetConfirmReport.Item cases = item(r, MdmRuleSetConfirmCheckItem.TEST_CASES);
        assertThat(cases.status()).isEqualTo(ItemStatus.REJECTED);
        assertThat(cases.issues()).extracting(i -> i.issue().code()).containsExactly("CASE_FAILED");
        assertThat(r.cases().withExpected()).isEqualTo(1);
        assertThat(r.cases().failed()).isEqualTo(1);
    }

    @Test
    void ruleCancelConfirmBlocksSetConfirm() {   // Review Focus 5, ADR-0002 D8-10
        rule("R_C", "1.000", "2026-07-01 00:00:00", null, "CF_IN", "OUT_C");   // 아직 적용 전인 유일 RELEASED
        jdbc.update("UPDATE TB_MDM_RULE_VER SET OWNER_ID = 'kim' WHERE MARU_RULE_ID = 'R_C'");
        draftSet("S_D8", "[\"R_C\"]");
        LocalDateTime jul2 = JUL1.plusDays(1);
        assertThat(item(report("S_D8", jul2), MdmRuleSetConfirmCheckItem.RULES_RELEASED).status()).isEqualTo(ItemStatus.PASSED);

        RuleVersionRequest cancel = new RuleVersionRequest();
        cancel.setMaruRuleId("R_C");
        cancel.setVer("1.000");
        cancel.setRowVersion(0L);
        ruleVersions.cancelConfirm(cancel);

        assertThat(item(report("S_D8", jul2), MdmRuleSetConfirmCheckItem.RULES_RELEASED).status()).isEqualTo(ItemStatus.REJECTED);
        // 세트 저장은 막지 않는다 — RELEASED 없음은 저장 때 경고다
        RuleSetSaveRequest save = new RuleSetSaveRequest();
        save.setSetId("S_D8");
        save.setVer("1.000");
        save.setRowVersion(0L);
        save.setSetName("S_D8");
        save.setRules(List.of(Map.of("ruleId", "R_C")));
        assertThat(setEdit.save(save).getChecks()).extracting(c -> c.code()).contains("NO_RELEASED");
    }

    @Test
    void spiIsRegisteredForRuleSetAndFlattensErrors() {
        rule("R_B", "1.000", "2026-08-01 00:00:00", null, "CF_IN", "OUT_B");
        draftSet("S_SPI", "[\"R_B\"]");
        VersionRef ref = new VersionRef(VersionTarget.RULE_SET, "S_SPI", new BigDecimal("1.000"));
        var result = spis.confirmCheck(VersionTarget.RULE_SET).check(new ConfirmCheckRequest(ref, JUL1, null, "kim", DmeTestSupport.NOW));
        assertThat(result.errors()).extracting(i -> i.code()).containsExactly(RuleSetConfirmReport.SET_RULE_NOT_RELEASED);
        assertThat(result.errors().get(0).field()).isEqualTo("RULES_RELEASED");
    }
}
```

(`RuleSetSaveResult.getChecks()` 의 원소는 `RuleSetCheck`(레코드)라 `c.code()` 다.)

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetVersionDiffsTest' --offline && ../gradlew :api:test --tests '*RuleSetConfirmChecksSqliteTest' --offline`
Expected: 컴파일 실패(`RuleSetVersionDiffs`·`RuleSetConfirmChecks` 없음)

- [ ] **Step 3: 구현**

`RuleIoReader` — 버전 고르기를 인자로 빼고 `readAt` 을 더한다. 지금 `read(Collection, Scope)`(:81-136) 본문의 `Map<String, BigDecimal> vers = queries.latestReleasedVers(rules.keySet());` 한 줄만 `Map<String, BigDecimal> vers = pick.apply(rules.keySet());` 로 바꿔 private 메서드로 옮긴다.

```java
    public Map<String, RuleIo> read(Collection<String> ruleIds, RuleVarTypeResolver.Scope scope) {
        return read(ruleIds, scope, queries::latestReleasedVers);
    }

    /**
     * {@code at} 에 적용되는 RELEASED 버전(APPLY_FROM <= at < APPLY_TO)으로 계산한 입출력(D-144 2단계 — 세트 확정 검사 2·3). 그 시점 RELEASED 가
     * 없는 룰은 {@code releasedVer=null}·빈 목록이다. 버전 고르기 밖은 {@link #read(Collection, RuleVarTypeResolver.Scope)} 와 같다.
     */
    public Map<String, RuleIo> readAt(Collection<String> ruleIds, LocalDateTime at, RuleVarTypeResolver.Scope scope) {
        return read(ruleIds, scope, ids -> {
            Map<String, List<MdmRuleVer>> byRule = new HashMap<>();
            for (MdmRuleVer v : queries.versionsOf(ids)) {
                byRule.computeIfAbsent(v.getMaruRuleId(), k -> new ArrayList<>()).add(v);
            }
            Map<String, BigDecimal> out = new LinkedHashMap<>();
            byRule.forEach((id, vs) -> RuleVersions.currentReleased(vs, at).ifPresent(v -> out.put(id, v.getVer())));
            return out;
        });
    }

    private Map<String, RuleIo> read(Collection<String> ruleIds, RuleVarTypeResolver.Scope scope,
                                     Function<Set<String>, Map<String, BigDecimal>> pick) {
        // (지금 read(Collection, Scope) 본문 그대로, vers 줄만 pick.apply)
    }
```

`RuleSetVersionQueries` 에 더한다(같은 패키지의 `RuleSetFlowJson`·엔진 `FlowParser` 를 쓴다).

```java
    /** 버전의 흐름 — FLOW_JSON 이 없으면 RULE_IDS 순서의 한 줄 흐름. 읽지 못하면 IllegalArgumentException(코덱). */
    public static FlowDefinition flow(MdmRuleSetVer v) {
        return v.getFlowJson() == null ? FlowParser.linear(members(v)) : RuleSetFlowJson.parse(v.getFlowJson());
    }
```

`RuleSetConfirmReport`:

```java
package com.dongkuk.dmes.mdm.common.rule.confirm;

import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.CaseSummary;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.Issue;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.ItemStatus;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleSetConfirmCheckItem;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 룰 세트 확정 검사 4항목 보고서(D-144 2단계, 스펙 §6) — 순수(Spring·DB 없음). 항목은 {@link MdmRuleSetConfirmCheckItem} 순서 그대로 넷.
 * 이슈의 {@code field} 는 항목 이름, {@code code} 는 세부 코드(룰 {@link RuleConfirmReport} 와 같은 관례, I4).
 */
public final class RuleSetConfirmReport {

    public static final String SET_RULE_NOT_RELEASED = "SET_RULE_NOT_RELEASED";
    public static final String STORED_FLOW_CORRUPT = "STORED_FLOW_CORRUPT";

    /** ORDER 항목으로 가는 흐름 검사 코드 — 나머지는 FLOW_STRUCTURE. NO_RELEASED 는 항목 2가 ERROR 로 다시 본다. */
    static final Set<String> ORDER_CODES = Set.of(RuleSetCheck.ORDER, RuleSetCheck.CYCLE, RuleSetCheck.IF_SIBLING,
            RuleSetCheck.PAR_SIBLING, RuleSetCheck.DUP_RESULT);

    private static final String ERROR = RuleCheckReport.ERROR;
    private static final String WARNING = RuleCheckReport.WARNING;
    private static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    public record Item(MdmRuleSetConfirmCheckItem item, ItemStatus status, List<Issue> issues) {
    }

    public record Report(VersionRef draft, List<Item> items, CaseSummary cases) {
    }

    private RuleSetConfirmReport() {
    }

    public static Report report(VersionRef draft, List<RuleSetCheck> checks, List<String> notReleased, LocalDateTime applyFrom,
                                List<Map<String, Object>> caseResults, String caseRunFailure) {
        Map<MdmRuleSetConfirmCheckItem, List<Issue>> issues = empty();
        for (RuleSetCheck c : checks) {
            if (RuleSetCheck.NO_RELEASED.equals(c.code())) {
                continue;
            }
            MdmRuleSetConfirmCheckItem item = ORDER_CODES.contains(c.code()) ? MdmRuleSetConfirmCheckItem.ORDER
                    : MdmRuleSetConfirmCheckItem.FLOW_STRUCTURE;
            issues.get(item).add(new Issue(c.rejected() ? ERROR : WARNING, new MdmCheckIssue(c.code(), c.message(), item.name(), itemKey(c))));
        }
        for (String id : notReleased) {
            issues.get(MdmRuleSetConfirmCheckItem.RULES_RELEASED).add(error(SET_RULE_NOT_RELEASED,
                    id + " 에 적용 시각 " + TEXT.format(applyFrom) + " 의 RELEASED 버전이 없습니다", MdmRuleSetConfirmCheckItem.RULES_RELEASED,
                    "RULE:" + id));
        }
        int withExpected = 0;
        int passed = 0;
        int failed = 0;
        MdmRuleSetConfirmCheckItem tests = MdmRuleSetConfirmCheckItem.TEST_CASES;
        for (Map<String, Object> c : caseResults) {
            Object pass = c.get("pass");
            if (pass == null) {
                continue;
            }
            withExpected++;
            if (Boolean.TRUE.equals(pass)) {
                passed++;
                continue;
            }
            failed++;
            boolean runError = "ERROR".equals(c.get("outcome"));
            Object mismatches = c.get("mismatches");
            int count = mismatches instanceof List<?> l ? l.size() : 0;
            issues.get(tests).add(error(RuleConfirmReport.CASE_FAILED, "케이스 " + c.get("caseId") + " " + c.get("caseName") + ": "
                    + (runError ? "실행이 오류로 끝났다" : "기대값과 다른 결과 " + count + "개"), tests, "CASE:" + c.get("caseId")));
        }
        if (caseRunFailure != null) {
            issues.get(tests).add(error(RuleConfirmReport.CASE_RUN_FAILED, "테스트 케이스를 끝내지 못했다: " + caseRunFailure, tests, null));
        }
        return new Report(draft, items(issues), new CaseSummary(caseResults.size(), withExpected, passed, failed));
    }

    /** 저장된 FLOW_JSON 을 읽지 못함 — 나머지 항목은 계산하지 않고 흐름 구조 ERROR 하나. */
    public static Report storedFlowCorrupt(VersionRef draft, String message) {
        Map<MdmRuleSetConfirmCheckItem, List<Issue>> issues = empty();
        issues.get(MdmRuleSetConfirmCheckItem.FLOW_STRUCTURE).add(error(STORED_FLOW_CORRUPT, "저장된 흐름을 읽을 수 없습니다 — " + message,
                MdmRuleSetConfirmCheckItem.FLOW_STRUCTURE, null));
        return new Report(draft, items(issues), new CaseSummary(0, 0, 0, 0));
    }

    /** SPI {@code check()} — ERROR 는 errors, WARNING 은 warnings(항목 순서, 항목 안에서는 원래 순서). */
    public static ConfirmCheckResult flatten(Report report) {
        List<MdmCheckIssue> errors = new ArrayList<>();
        List<MdmCheckIssue> warnings = new ArrayList<>();
        for (Item item : report.items()) {
            for (Issue issue : item.issues()) {
                (ERROR.equals(issue.severity()) ? errors : warnings).add(issue.issue());
            }
        }
        return new ConfirmCheckResult(List.copyOf(errors), List.copyOf(warnings));
    }

    private static Map<MdmRuleSetConfirmCheckItem, List<Issue>> empty() {
        Map<MdmRuleSetConfirmCheckItem, List<Issue>> issues = new EnumMap<>(MdmRuleSetConfirmCheckItem.class);
        for (MdmRuleSetConfirmCheckItem item : MdmRuleSetConfirmCheckItem.values()) {
            issues.put(item, new ArrayList<>());
        }
        return issues;
    }

    private static List<Item> items(Map<MdmRuleSetConfirmCheckItem, List<Issue>> issues) {
        List<Item> out = new ArrayList<>();
        for (MdmRuleSetConfirmCheckItem item : MdmRuleSetConfirmCheckItem.values()) {
            List<Issue> list = List.copyOf(issues.get(item));
            ItemStatus status = list.stream().anyMatch(i -> ERROR.equals(i.severity())) ? ItemStatus.REJECTED
                    : list.isEmpty() ? ItemStatus.PASSED : ItemStatus.WARNED;
            out.add(new Item(item, status, list));
        }
        return List.copyOf(out);
    }

    private static Issue error(String code, String message, MdmRuleSetConfirmCheckItem item, String itemKey) {
        return new Issue(ERROR, new MdmCheckIssue(code, message, item.name(), itemKey));
    }

    private static String itemKey(RuleSetCheck c) {
        if (c.nodeId() != null) {
            return "NODE:" + c.nodeId();
        }
        if (c.edgeId() != null) {
            return "EDGE:" + c.edgeId();
        }
        return c.ruleId() == null ? null : "RULE:" + c.ruleId();
    }
}
```

(`RuleConfirmReport.Issue`·`ItemStatus`·`CaseSummary` 가 public 중첩 타입인지 확인한다 — `RuleConfirmReport.java:35-48` 에서 public 이다. `RuleCheckReport.ERROR`·`WARNING` 의 값은 `"ERROR"`·`"WARNING"`.)

`RuleSetVersionDiffs`:

```java
package com.dongkuk.dmes.mdm.common.rule.confirm;

import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.TreeSet;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;

/** 세트 버전 diff(D-144 2단계) — 노드·선 ID 를 키로 견준다. 화면 전용 view(배치·색)는 보지 않는다. 순수. */
public final class RuleSetVersionDiffs {

    private RuleSetVersionDiffs() {
    }

    /** base 가 null 이면(최초 버전) 모두 ADDED. 키 글자 순. */
    public static List<VersionDiffEntry> diff(FlowDefinition base, FlowDefinition target) {
        Map<String, Map<String, Object>> before = entries(base);
        Map<String, Map<String, Object>> after = entries(target);
        TreeSet<String> keys = new TreeSet<>(before.keySet());
        keys.addAll(after.keySet());
        List<VersionDiffEntry> out = new ArrayList<>(keys.size());
        for (String key : keys) {
            Map<String, Object> o = before.get(key);
            Map<String, Object> n = after.get(key);
            DiffKind kind = o == null ? DiffKind.ADDED : n == null ? DiffKind.REMOVED : Objects.equals(o, n) ? DiffKind.SAME : DiffKind.CHANGED;
            out.add(new VersionDiffEntry(key, kind, o, n));
        }
        return out;
    }

    private static Map<String, Map<String, Object>> entries(FlowDefinition f) {
        Map<String, Map<String, Object>> out = new TreeMap<>();
        if (f == null) {
            return out;
        }
        for (FlowNode n : f.nodes()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("kind", n.kind().name());
            m.put("ruleId", n.ruleId());
            m.put("label", n.label());
            m.put("splitId", n.splitId());
            m.put("attachTo", n.attachTo());
            m.put("catches", n.catches());
            out.putIfAbsent("NODE:" + n.id(), m);
        }
        for (FlowEdge e : f.edges()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("from", e.from());
            m.put("to", e.to());
            m.put("order", e.order());
            m.put("cond", e.cond());
            m.put("otherwise", e.otherwise());
            m.put("label", e.label());
            out.putIfAbsent("EDGE:" + e.id(), m);
        }
        return out;
    }
}
```

`RuleSetConfirmChecks`:

```java
package com.dongkuk.dmes.mdm.common.rule.confirm;

// import: RuleCaseJudge, RuleIo, RuleIoReader, RuleSetAnalyzer, RuleSetCaseJudge, RuleSetCheck, RuleSetFlowJson, RuleSetRunner,
//         RuleSetTestCaseQueries, RuleSetVersionQueries, RuleVarTypeResolver, MdmClockConfig, VersionNumbers, VersionDiff, VersionRef,
//         VersionStatus, VersionTarget, MdmRuleSetTestCase, MdmRuleSetVer, FlowParser, FlowDefinition, RunTrace, BigDecimal, Instant,
//         LocalDateTime, ArrayList, LinkedHashMap, List, Map, Optional, Component

/**
 * 룰 세트 확정 검사 컴포넌트(D-144 2단계) — 원장을 읽어 순수 보고서({@link RuleSetConfirmReport}·{@link RuleSetVersionDiffs})에 넘긴다.
 * 확정 트랜잭션 안에서 불리므로 쓰지 않는다. 화면 서비스는 SPI 가 아니라 이 컴포넌트를 주입받는다(룰 RuleConfirmChecks 와 같은 이유, I16).
 */
@Component
public class RuleSetConfirmChecks {

    private final RuleSetVersionQueries setVersions;
    private final RuleIoReader ioReader;
    private final RuleSetTestCaseQueries caseQueries;
    private final RuleSetRunner runner;

    public RuleSetConfirmChecks(RuleSetVersionQueries setVersions, RuleIoReader ioReader, RuleSetTestCaseQueries caseQueries,
                                RuleSetRunner runner) {
        this.setVersions = setVersions;
        this.ioReader = ioReader;
        this.caseQueries = caseQueries;
        this.runner = runner;
    }

    /** 4항목 보고서. 1·3 은 applyFrom 시점 RELEASED 룰 버전의 입출력으로, 4 는 케이스 EVAL_TS(없으면 applyFrom)로 판정한다(J7·J8). */
    public RuleSetConfirmReport.Report report(VersionRef draft, LocalDateTime applyFrom) {
        String setId = draft.objectId();
        MdmRuleSetVer v = setVersions.find(setId, draft.ver()).orElseThrow(() -> new IllegalStateException(
                "룰 세트 " + setId + " 에 버전 " + VersionNumbers.label(draft.ver()) + " 이(가) 없습니다"));
        FlowDefinition stored;
        try {
            stored = v.getFlowJson() == null ? null : RuleSetFlowJson.parse(v.getFlowJson());
        } catch (IllegalArgumentException e) {
            return RuleSetConfirmReport.storedFlowCorrupt(draft, e.getMessage());
        }
        List<String> ids = stored == null ? RuleSetVersionQueries.members(v) : RuleSetFlowJson.ruleIds(stored);
        RuleVarTypeResolver.Scope scope = ioReader.scope();
        Map<String, RuleIo> io = ioReader.readAt(ids, applyFrom, scope);
        List<RuleSetCheck> checks = stored == null ? RuleSetAnalyzer.checks(ids, io) : RuleSetAnalyzer.checks(stored, io, ioReader.condIo(stored, scope));
        List<String> notReleased = ids.stream().filter(id -> io.get(id) != null && io.get(id).exists() && io.get(id).releasedVer() == null).toList();
        List<Map<String, Object>> cases = List.of();
        String caseFailure = null;
        try {
            cases = cases(setId, stored == null ? FlowParser.linear(ids) : stored, applyFrom);
        } catch (RuntimeException e) {
            caseFailure = String.valueOf(e.getMessage());
        }
        return RuleSetConfirmReport.report(draft, checks, notReleased, applyFrom, cases, caseFailure);
    }

    /** 흐름 diff — base 는 {@link #previousReleased}(없으면 null, 최초 버전). */
    public VersionDiff diff(VersionRef draft) {
        String setId = draft.objectId();
        MdmRuleSetVer target = setVersions.find(setId, draft.ver()).orElseThrow();
        Optional<MdmRuleSetVer> previous = previousReleased(setId, target.getVer());
        VersionRef baseRef = previous.map(p -> new VersionRef(VersionTarget.RULE_SET, setId, VersionNumbers.scaled(p.getVer()))).orElse(null);
        return new VersionDiff(baseRef, draft, RuleSetVersionDiffs.diff(previous.map(RuleSetVersionQueries::flow).orElse(null), RuleSetVersionQueries.flow(target)));
    }

    /** 직전 RELEASED = STATUS RELEASED 이고 ver < V 인 것 중 가장 큰 ver. 공통 서비스(DefaultVersionStateService.previousReleased)와 같은 판정. */
    public Optional<MdmRuleSetVer> previousReleased(String setId, BigDecimal ver) {
        return setVersions.versions(setId).stream()
                .filter(v -> VersionStatus.RELEASED.name().equals(v.getStatus()) && v.getVer().compareTo(ver) < 0)
                .findFirst();   // versions 는 VER 내림차순
    }

    private List<Map<String, Object>> cases(String setId, FlowDefinition flow, LocalDateTime applyFrom) {
        List<MdmRuleSetTestCase> list = caseQueries.cases(setId);
        if (list.isEmpty()) {
            return List.of();
        }
        RuleSetRunner.Session session = runner.session();
        Instant fallback = applyFrom.atZone(MdmClockConfig.KST).toInstant();
        List<Map<String, Object>> out = new ArrayList<>(list.size());
        for (MdmRuleSetTestCase c : list) {
            Map<String, Object> record = RuleCaseJudge.object(c.getInputJson());
            if (record == null) {
                Map<String, Object> bad = new LinkedHashMap<>();
                bad.put("caseId", c.getCaseId());
                bad.put("caseName", c.getCaseName());
                bad.put("outcome", "ERROR");
                bad.put("pass", false);
                bad.put("mismatches", List.of());
                out.add(bad);
                continue;
            }
            Instant ts = c.getEvalTs() == null ? fallback : RuleSetRunner.parseKst(c.getEvalTs());
            RunTrace trace = session.traceDefinition(setId, flow, record, ts);
            out.add(RuleSetCaseJudge.judge(c.getCaseId(), c.getCaseName(), c.getExpectedJson(), trace));
        }
        return out;
    }
}
```

`RuleSetConfirmCheck`:

```java
package com.dongkuk.dmes.mdm.common.rule.confirm;

import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import org.springframework.stereotype.Component;

/** RULE_SET 확정 검사 SPI 운영 구현(D-144 2단계). 판정은 {@link RuleSetConfirmChecks} 에 위임한다. apply_from 순서는 공통 서비스가 본다. */
@Component
public class RuleSetConfirmCheck implements VersionConfirmCheckSpi {

    private final RuleSetConfirmChecks checks;

    public RuleSetConfirmCheck(RuleSetConfirmChecks checks) {
        this.checks = checks;
    }

    @Override
    public VersionTarget target() {
        return VersionTarget.RULE_SET;
    }

    @Override
    public VersionDiff diff(VersionRef draft) {
        return checks.diff(draft);
    }

    @Override
    public ConfirmCheckResult check(ConfirmCheckRequest request) {
        return RuleSetConfirmReport.flatten(checks.report(request.draft(), request.requestedApplyFrom()));
    }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd src/backend/mdm && ../gradlew :lib:test :api:test --offline`
Expected: PASS. (`RuleConfirmOasisHttpTest.HT3_BUSINESS_RULE_확정_검사_SPI_빈은_RuleConfirmCheck_하나다` 처럼 SPI 빈 수를 세는 시험이 RULE_SET 추가로 깨지면 대상별로 세도록 고친다.)

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleIoReader.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetVersionQueries.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/confirm/RuleSetConfirmReport.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/confirm/RuleSetVersionDiffs.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/confirm/RuleSetConfirmChecks.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/confirm/RuleSetConfirmCheck.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/rule/confirm/RuleSetVersionDiffsTest.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetConfirm/RuleSetConfirmChecksSqliteTest.java
/usr/bin/git -C <worktree> commit -m "feat(mdm): 룰 세트 확정 검사 4항목과 흐름 diff 를 RULE_SET 확정 SPI 로 둔다"
```

---

### Task 8: 룰 세트 확정 서비스·BPMN·권한 시드

**Files:**
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetConfirm/service/RuleSetConfirmService.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetConfirm/dto/RuleSetConfirmSearchRequest.java`, `RuleSetConfirmViewRequest.java`, `RuleSetConfirmValidateRequest.java`, `RuleSetConfirmRequest.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleConfirm/service/RuleConfirmService.java:406` (`parseApplyFrom` 을 `public static` 으로)
- Create: `src/backend/mdm/api/src/main/resources/services/dme/ruleSetConfirm.bpmn`
- Modify: `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java:1026` 다음 줄(호출 한 줄), `:1210` 근처 `seedMdmRuleSetMenus()` 메서드 뒤(새 메서드)
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmOasisActionVocabularyTest.java:80-115` (시험 하나 추가, 스캔 집합)
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/RuleSetLifecycleOasisFlowTest.java:190-200` (세트 확정·실행 단계 추가)
- Test (Create): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetConfirm/RuleSetConfirmBpmnActionTest.java`
- Test (Create): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetConfirm/RuleSetConfirmServiceSqliteTest.java`

**Interfaces:**
- Consumes: Task 7 `RuleSetConfirmChecks.report/diff/previousReleased`·`RuleSetConfirmReport`, 공통 `VersionStateService.confirm(ConfirmCommand)`·`ApplyFromOrderCheck.check`, `RuleStewardCheck.requireSteward`, `MdmCurrentUser.userId`
- Produces: OASIS `ruleSetConfirm` 분기(룰 `ruleConfirm` 과 같은 응답 모양, 키 이름만 세트):
  - `search{keyword}` → `{rows: [{setId, setName, ver, verKind, ownerId, setStatus}]}` — 모든 세트의 DRAFT(세트 ID·VER 순). keyword 는 세트 ID(대문자 포함)·세트명(포함)
  - `view{setId, ver?}` → `{set: {setId, setName, status}, version: {ver, verKind, verLabel, status, ownerId, rowVersion, baseVer, applyFrom, applyTo, requestedBy, releasedAt, ruleIds}, previous: {ver, verLabel, applyFrom, applyTo} | null, firstVersion, diff: [{key, kind, oldValues, newValues}], diffCounts: {ADDED, REMOVED, CHANGED, SAME}, serverNow}` — ver 가 비면 그 세트의 DRAFT(여럿이면 가장 작은 번호)
  - `validate{setId, ver, applyFrom}` → `{items: [{item, status, issues: [{severity, code, message, field, itemKey}]}], applyFromCheck: {status: EXEMPT|PASSED|REJECTED, previousApplyFrom, message}, caseSummary: {total, withExpected, passed, failed}, rejectedCount, warnedCount, applyFrom, futureApplyFrom, serverNow}` — 쓰기 없음
  - `confirm{setId, ver, rowVersion, applyFrom, warningsAcknowledged}` → view 모양 + `confirmed: {ver, rowVersion}`, `closedPreviousVer`, `warnings`
  - 메뉴 `ruleSetConfirm`("룰 세트 확정", dme, MENU_SEQ 006, FULL_SEQ 5050600), RBAC 는 `seedMdmObjectRbac("ruleSetConfirm", "dme")`(표준 관리자 READ·담당자 CONFIRM)

- [ ] **Step 1: 실패하는 시험 작성**

`RuleSetConfirmBpmnActionTest` — `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleConfirm/RuleConfirmBpmnActionTest.java` 를 같은 내용으로 새 파일에 옮기고 아래만 바꾼다(B1~B5 다섯 시험 모두 유지).
- 패키지 `com.dongkuk.dmes.mdm.dme.ruleSetConfirm`, 클래스 이름 `RuleSetConfirmBpmnActionTest`, 클래스 javadoc 첫 줄 "D-144 2단계 — `services/dme/ruleSetConfirm.bpmn` 의 OASIS 계약(룰 ruleConfirm 과 같은 4분기)".
- `PATH = "services/dme/ruleSetConfirm.bpmn"`, `DTO_PACKAGE = "com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto."`.
- B3 의 `"ruleConfirmService"` → `"ruleSetConfirmService"`, B4·B5 의 `RuleConfirmService.class` → `RuleSetConfirmService.class`, B5 의 `"ruleConfirm"` → `"ruleSetConfirm"`.

`MdmOasisActionVocabularyTest` 에 더한다.

```java
    /** D-144 2단계 — 룰 세트 확정. confirm 은 CONFIRM 세트에만 있다(ruleConfirm 과 같다). */
    @Test
    void dme_ruleSetConfirm_bpmn_의_모든_액션이_어휘_안에_있다() throws Exception {
        Path path = bpmnPath("dme", "ruleSetConfirm.bpmn");
        assertActionsWithinVocabulary(path);
        assertEquals(Set.of("search", "view", "validate", "confirm"), actionsFromGateway(path));
    }
```

그리고 `mcm_시드의_allActions_…` 의 스캔 집합 단언(:114)에 `"dme/ruleSetConfirm.bpmn"` 을 더한다.

`RuleSetConfirmServiceSqliteTest`:

```java
package com.dongkuk.dmes.mdm.dme.ruleSetConfirm;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.audit.AuditHolder;
import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.mdm.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto.RuleSetConfirmRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto.RuleSetConfirmSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto.RuleSetConfirmValidateRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto.RuleSetConfirmViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.service.RuleSetConfirmService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** D-144 2단계 — 세트 확정 화면 서비스: 검색·조회·검사·확정(직전 RELEASED 닫기·부모 승격). 시계 NOW = 2026-06-15 09:00. */
@Import(DmeTestSupport.Config.class)
class RuleSetConfirmServiceSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleSetConfirmService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetConfirmMenu", "ruleSetConfirm"));
        DmeTestSupport.column(jdbc, "CF_IN", DmeTestSupport.domain(jdbc, "CF_IN_D", "QTY", "NUMBER", 0));
        DmeTestSupport.rule(jdbc, "R_A", "R_A", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_A", new BigDecimal("1.000"), "MAJOR", "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_A", new BigDecimal("1.000"), 1, "COND", "1", "CF_IN", 1, null);
        DmeTestSupport.var(jdbc, "R_A", new BigDecimal("1.000"), 2, "RESULT", "Value", "OUT_A", 1, "STRING");
        DmeTestSupport.ruleSet(jdbc, "S_C", "확정 세트", "[]", "INUSE", 0);                     // 1.000 RELEASED 2000-01-01~
        DmeTestSupport.ruleSetDraft(jdbc, "S_C", "2.000", "kim", "[\"R_A\"]", 4);
    }

    @SuppressWarnings("unchecked")
    @Test
    void searchViewValidateConfirmClosesPreviousAndUsesNewVersion() {
        RuleSetConfirmSearchRequest s = new RuleSetConfirmSearchRequest();
        List<Map<String, Object>> rows = (List<Map<String, Object>>) service.search(s).get("rows");
        assertThat(rows).extracting(r -> r.get("setId") + "@" + r.get("ver")).containsExactly("S_C@2.000");

        RuleSetConfirmViewRequest v = new RuleSetConfirmViewRequest();
        v.setSetId("S_C");
        Map<String, Object> view = service.view(v);
        assertThat(((Map<String, Object>) view.get("version")).get("ver")).isEqualTo("2.000");
        assertThat(((Map<String, Object>) view.get("previous")).get("ver")).isEqualTo("1.000");

        RuleSetConfirmValidateRequest val = new RuleSetConfirmValidateRequest();
        val.setSetId("S_C");
        val.setVer("2.000");
        val.setApplyFrom("2026-06-15 09:00:00");
        Map<String, Object> checked = service.validate(val);
        assertThat(checked.get("rejectedCount")).isEqualTo(0);
        assertThat(((Map<String, Object>) checked.get("applyFromCheck")).get("status")).isEqualTo("PASSED");

        RuleSetConfirmRequest c = new RuleSetConfirmRequest();
        c.setSetId("S_C");
        c.setVer("2.000");
        c.setRowVersion(4L);
        c.setApplyFrom("2026-06-15 09:00:00");
        Map<String, Object> done = service.confirm(c);
        assertThat(((Map<String, Object>) done.get("confirmed")).get("ver")).isEqualTo("2.000");
        assertThat(done.get("closedPreviousVer")).isEqualTo("1.000");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_C", "2.000", "STATUS")).isEqualTo("RELEASED");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_C", "1.000", "APPLY_TO")).isEqualTo("2026-06-15 09:00:00");
    }

    @Test
    void createdParentIsPromotedOnAppliedConfirm() {
        jdbc.update("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, STATUS) VALUES ('S_NEW', '새 세트', 'CREATED')");
        DmeTestSupport.ruleSetDraft(jdbc, "S_NEW", "1.000", "kim", "[\"R_A\"]", 0);
        RuleSetConfirmRequest c = new RuleSetConfirmRequest();
        c.setSetId("S_NEW");
        c.setVer("1.000");
        c.setRowVersion(0L);
        c.setApplyFrom("2026-06-15 09:00:00");
        service.confirm(c);
        assertThat(jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'S_NEW'", String.class)).isEqualTo("INUSE");
    }

    @Test
    void confirmIsRejectedWhenARuleHasNoReleasedAtApplyFromAndDraftStays() {
        DmeTestSupport.rule(jdbc, "R_LATE", "R_LATE", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_LATE", new BigDecimal("1.000"), "MAJOR", "FIRST", "2026-09-01 00:00:00", null);
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET RULE_IDS = '[\"R_A\",\"R_LATE\"]' WHERE MARU_RULE_SET_ID = 'S_C' AND VER = 2");
        RuleSetConfirmRequest c = new RuleSetConfirmRequest();
        c.setSetId("S_C");
        c.setVer("2.000");
        c.setRowVersion(4L);
        c.setApplyFrom("2026-07-01 00:00:00");
        assertThatThrownBy(() -> service.confirm(c)).hasMessageContaining("확정 검사");          // MDM010
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_C", "2.000", "STATUS")).isEqualTo("DRAFT");
    }

    @Test
    void applyFromNotAfterPreviousIsRejected() {
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_FROM = '2026-06-01 00:00:00' WHERE MARU_RULE_SET_ID = 'S_C' AND VER = 1");
        RuleSetConfirmValidateRequest val = new RuleSetConfirmValidateRequest();
        val.setSetId("S_C");
        val.setVer("2.000");
        val.setApplyFrom("2026-06-01 00:00:00");
        @SuppressWarnings("unchecked")
        Map<String, Object> order = (Map<String, Object>) service.validate(val).get("applyFromCheck");
        assertThat(order.get("status")).isEqualTo("REJECTED");
    }
}
```

`RuleSetLifecycleOasisFlowTest` — `setView` 단언 뒤에 세트 확정과 운영 판정을 더한다(HTTP 로 `ruleSetConfirm.confirm` → `ruleSetRunner` 경로). 이 시험 파일의 `post(service, action, body)`·`envelope(service, params)` 도우미를 그대로 쓴다.

```java
        // ── 6. ruleSetConfirm.confirm — 세트 DRAFT 1.000 을 지금 시각으로 확정하면 운영 판정이 그 흐름을 쓴다(D-144 2단계) ──
        ObjectNode confirmParams = json.createObjectNode().put("setId", "LS_A3").put("ver", "1.000")
                .put("rowVersion", setSave.at("/data/result/rowVersion").asLong()).put("applyFrom", APPLY_FROM)
                .put("warningsAcknowledged", true);
        JsonNode setConfirm = post("ruleSetConfirm", "confirm", envelope("ruleSetConfirm", confirmParams));
        assertTrue(setConfirm.at("/meta/success").asBoolean(), setConfirm.toString());
        assertEquals("1.000", setConfirm.at("/data/result/confirmed/ver").asText());
```

(`APPLY_FROM` 은 이 시험이 룰 셋을 확정할 때 쓴 상수다(`RuleSetLifecycleOasisFlowTest.confirm`). 세 룰이 그 시각부터 RELEASED 라 세트 확정 검사 2가 통과한다. 운영 실행(`ruleSetRunner.execute`)은 이 시험에 더하지 않는다 — 판정 시각 선택은 Task 4 의 `StoredDefinitionLookupTest` 가 고정한다.)

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mdm && ../gradlew :api:test --tests '*RuleSetConfirm*' --tests '*MdmOasisActionVocabularyTest' --offline`
Expected: 컴파일 실패(`RuleSetConfirmService` 없음)

- [ ] **Step 3: 구현**

DTO 넷(필드 + 기본 생성자 + getter·setter):
- `RuleSetConfirmSearchRequest{String keyword}`
- `RuleSetConfirmViewRequest{String setId, String ver}`
- `RuleSetConfirmValidateRequest{String setId, String ver, String applyFrom}`
- `RuleSetConfirmRequest{String setId, String ver, Long rowVersion, String applyFrom, Boolean warningsAcknowledged}`

`RuleConfirmService.java:406` 의 `static LocalDateTime parseApplyFrom(String value)` 를 `public static` 으로 바꾼다(문구·오류 칸 `applyFrom` 을 세트 확정이 그대로 쓴다).

`RuleSetConfirmService` — `RuleConfirmService` 의 구조(`search`·`view`·`validate`·`confirm`, `Target` 레코드, `buildView`, `issueMap`, `text`, `now`)를 세트로 옮긴다. 다른 점만 코드로 적는다.

```java
@Service("ruleSetConfirmService")
public class RuleSetConfirmService {

    private static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final MdmRuleSetRepository sets;
    private final RuleQueries queries;              // allSets()
    private final RuleSetVersionQueries setVersions;
    private final RuleSetConfirmChecks checks;
    private final ApplyFromOrderCheck applyFromOrderCheck;
    private final VersionStateService versionState;
    private final RuleStewardCheck stewardCheck;
    private final MdmCurrentUser currentUser;
    private final EntityManager entityManager;
    private final Clock clock;

    // 생성자: 위 필드 그대로

    /** 확정 대기 목록 — 모든 세트의 DRAFT(세트 ID·VER 순). */
    public Map<String, Object> search(RuleSetConfirmSearchRequest request) {
        String keyword = request == null || request.getKeyword() == null || request.getKeyword().isBlank() ? null : request.getKeyword().trim();
        String upper = keyword == null ? null : keyword.toUpperCase(Locale.ROOT);
        List<MdmRuleSet> all = queries.allSets();
        Map<String, List<MdmRuleSetVer>> byId = setVersions.versionsOf(all.stream().map(MdmRuleSet::getMaruRuleSetId).toList());
        LocalDateTime now = now();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (MdmRuleSet s : all) {
            if (keyword != null && !s.getMaruRuleSetId().toUpperCase(Locale.ROOT).contains(upper)
                    && (s.getMaruRuleSetName() == null || !s.getMaruRuleSetName().contains(keyword))) {
                continue;
            }
            List<MdmRuleSetVer> versions = byId.get(s.getMaruRuleSetId());
            versions.stream().filter(v -> "DRAFT".equals(v.getStatus())).sorted(Comparator.comparing(MdmRuleSetVer::getVer)).forEach(v -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("setId", s.getMaruRuleSetId());
                row.put("setName", s.getMaruRuleSetName());
                row.put("ver", VersionNumbers.plain(v.getVer()));
                row.put("verKind", v.getVerKind() == null ? null : v.getVerKind().name());
                row.put("ownerId", v.getOwnerId());
                row.put("setStatus", RuleVersions.effectiveStatus(s.getStatus(), versions, now));
                rows.add(row);
            });
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows);
        return result;
    }

    public Map<String, Object> validate(RuleSetConfirmValidateRequest request) {
        Target t = target(request == null ? null : request.getSetId(), request == null ? null : RuleScreenSupport.optionalVer(request.getVer()));
        if (!"DRAFT".equals(t.version().getStatus())) {
            throw MdmErrors.of(MdmErrorCode.NOT_DRAFT);
        }
        LocalDateTime applyFrom = RuleConfirmService.parseApplyFrom(request.getApplyFrom());
        LocalDateTime now = now();
        RuleSetConfirmReport.Report report = checks.report(t.ref(), applyFrom);
        // 이하 RuleConfirmService.validate(:152-218) 와 같다 — items·applyFromCheck(최초 버전 EXEMPT)·caseSummary·rejectedCount·warnedCount·
        // applyFrom·futureApplyFrom·serverNow. contractWarnings 는 세트에 없으므로 두지 않는다. item 이름은 MdmRuleSetConfirmCheckItem.name().
    }

    public Map<String, Object> confirm(RuleSetConfirmRequest request) {
        stewardCheck.requireSteward();
        String setId = request == null || request.getSetId() == null ? null : request.getSetId().trim();
        load(setId);
        BigDecimal ver = RuleScreenSupport.requireVer(request.getVer());
        if (request.getRowVersion() == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "row_version 은 필수입니다.");
        }
        VersionRef ref = new VersionRef(VersionTarget.RULE_SET, setId, VersionNumbers.scaled(ver));
        LocalDateTime applyFrom = RuleConfirmService.parseApplyFrom(request.getApplyFrom());
        ConfirmResult confirmed = versionState.confirm(new ConfirmCommand(ref, request.getRowVersion(), applyFrom, currentUser.userId(),
                Boolean.TRUE.equals(request.getWarningsAcknowledged())));
        entityManager.clear();   // 공통 서비스가 네이티브로 바꿨다 — 다시 읽는다(룰 I22a)
        Map<String, Object> result = buildView(target(setId, ver));
        Map<String, Object> done = new LinkedHashMap<>();
        done.put("ver", VersionNumbers.plain(confirmed.confirmed().ver()));
        done.put("rowVersion", confirmed.rowVersion());
        result.put("confirmed", done);
        result.put("closedPreviousVer", confirmed.closedPrevious() == null ? null : VersionNumbers.plain(confirmed.closedPrevious().ver()));
        result.put("warnings", confirmed.warnings().stream().map(w -> issueMap("WARNING", w)).toList());
        return result;
    }

    /** 세트·버전 목록·대상 버전·직전 RELEASED. ver 가 비면 DRAFT(여럿이면 가장 작은 번호). */
    private record Target(MdmRuleSet set, List<MdmRuleSetVer> versions, MdmRuleSetVer version, Optional<MdmRuleSetVer> previous) {
        VersionRef ref() {
            return new VersionRef(VersionTarget.RULE_SET, set.getMaruRuleSetId(), VersionNumbers.scaled(version.getVer()));
        }
    }

    private Target target(String setId, BigDecimal ver) {
        MdmRuleSet set = load(setId == null ? null : setId.trim());
        List<MdmRuleSetVer> versions = setVersions.versions(set.getMaruRuleSetId());
        MdmRuleSetVer version = ver == null
                ? versions.stream().filter(v -> "DRAFT".equals(v.getStatus())).min(Comparator.comparing(MdmRuleSetVer::getVer))
                        .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "확정할 DRAFT 가 없습니다: " + set.getMaruRuleSetId()))
                : versions.stream().filter(v -> VersionNumbers.same(v.getVer(), ver)).findFirst()
                        .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE,
                                "버전이 없습니다: " + set.getMaruRuleSetId() + " " + VersionNumbers.label(ver)));
        return new Target(set, versions, version, checks.previousReleased(set.getMaruRuleSetId(), version.getVer()));
    }

    /** view 모양 — set·version(ruleIds 포함)·previous·firstVersion·diff·diffCounts·serverNow. */
    private Map<String, Object> buildView(Target t) {
        // RuleConfirmService.buildView(:276-336) 와 같은 칸. 다른 점: rule → set{setId, setName, status(계산 상태)}, version 에 hitPolicy 대신
        // ruleIds(RuleSetVersionQueries.members), diff 행은 {key, kind, oldValues, newValues}(VersionDiffEntry 그대로), vars 는 없다.
    }

    private MdmRuleSet load(String setId) {
        if (setId == null || setId.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "룰 세트 ID 는 필수입니다.");
        }
        return sets.findById(setId).orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "룰 세트를 찾을 수 없습니다: " + setId));
    }
}
```

`view(RuleSetConfirmViewRequest request)` 는 `buildView(target(request.getSetId(), RuleScreenSupport.optionalVer(request.getVer())))` 다.

`ruleSetConfirm.bpmn` — `ruleConfirm.bpmn` 을 복사해 만든다: process `id="ruleSetConfirm"`·`name="룰 세트 버전 확정"`, 모든 serviceTask `camunda:class="ruleSetConfirmService"`, dto 를 `com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto.RuleSetConfirmSearchRequest`·`RuleSetConfirmViewRequest`·`RuleSetConfirmValidateRequest`·`RuleSetConfirmRequest` 로, method 는 그대로(search·view·validate·confirm), 각 task 의 documentation 은 "D-144 2단계 — …" 로 세트에 맞게, process documentation 은

```
ruleSetConfirm — 룰 세트 버전 확정 (To-Be only 신규 화면, D-144 2단계).
정본: docs/superpowers/specs/2026-10-02-mdm-object-versioning-design.md §6

action=search   -> searchTask   (ruleSetConfirmService.search)    READ
action=view     -> viewTask     (ruleSetConfirmService.view)      READ
action=validate -> validateTask (ruleSetConfirmService.validate)  EDIT — 확정 검사 4항목(흐름 구조·참조 룰 RELEASED·순서·테스트 케이스) + 적용 순서, 쓰기 없음
action=confirm  -> confirmTask  (ruleSetConfirmService.confirm)   CONFIRM — DRAFT→RELEASED(공통 VersionStateService)
```

로 쓴다. 요소 id·DI 도형·선은 원본과 같게 둔다(파일 안에서만 쓰이는 id 다).

`DataInitializer` — `seedMdmRuleSetMenus();`(:1026) 다음 줄에 `seedMdmRuleSetConfirmMenu();` 를 더하고, `seedMdmRuleSetMenus()` 메서드 바로 뒤에 새 메서드를 더한다(기존 줄은 고치지 않는다).

```java
    /**
     * D-144 2단계 — 룰 세트 버전 확정(dme/ruleSetConfirm). 기존 메뉴 배열은 고치지 않고 같은 dme 폴더 아래 새 leaf 로 등록한다.
     * action(search·view·validate·confirm)은 기존 권한 세트·allActions 안에 있다(ruleConfirm 과 같다). 룰 세트 편집(ruleSetEdit)의 새 action
     * copy·lock·unlock·handover 도 이미 PERM_MDM_EDIT·allActions 안에 있어 시드를 바꾸지 않는다. FULL_SEQ 는 부팅 끝 recomputeMenuFullSeq() 가 다시 매긴다.
     */
    private void seedMdmRuleSetConfirmMenu() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";
        insertMcmSecObjIfAbsent("ruleSetConfirm", "룰 세트 확정", "mdm");
        insertMcmSecMenuIfAbsent("ruleSetConfirm", "006", "5050600", "룰 세트 확정", "dme", "ruleSetConfirm");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID",      "PERMISSION_ID"},
                new String[]{"SYSADMIN", "ruleSetConfirm", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'ruleSetConfirm', 'PERM_ALL'" + AUDIT_VALS + ")");
        seedMdmObjectRbac("ruleSetConfirm", "dme");
        log.info("[DataInitializer] D-144 2단계 MDM 룰 세트 확정 시드 — OBJECT 1 + 메뉴 leaf 1(dme) + RBAC(SYSADMIN 1 + MDM 역할 2)");
    }
```

- [ ] **Step 4: 통과 확인**

Run: `cd src/backend/mdm && ../gradlew :lib:test :api:test --offline`
Expected: PASS

Run: `cd src/backend && ./gradlew :mcm:api:compileJava --offline` (모듈 경로가 다르면 `settings.gradle` 의 mcm api 프로젝트 이름으로)
Expected: BUILD SUCCESSFUL

Run: `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root /Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning`
Expected: ERROR 0

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetConfirm src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleConfirm/service/RuleConfirmService.java src/backend/mdm/api/src/main/resources/services/dme/ruleSetConfirm.bpmn src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetConfirm src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmOasisActionVocabularyTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/RuleSetLifecycleOasisFlowTest.java src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java
/usr/bin/git -C <worktree> commit -m "feat(mdm): 룰 세트 확정 화면 서비스·BPMN 과 메뉴·권한 시드를 더한다"
```

---

### Task 9: 룰 확정 때 세트 순서 검사 대상 — `apply_from` 이후 유효한 세트 RELEASED 버전들

**Files (모두 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/` 아래):**
- Modify: `common/rule/check/RuleSaveContext.java:14-16` (`LocalDateTime referenceTime` 추가)
- Modify: `common/rule/check/RuleCheckInput.java:13-14` (`LocalDateTime referenceTime` 추가)
- Modify: `common/rule/check/RuleSaveValidator.java:71-72`
- Modify: `common/rule/check/ledger/RuleSetOrderCheck.java:39-50,88-164,220-230`
- Modify: `common/rule/confirm/RuleConfirmChecks.java:79-108`
- Modify: `common/rule/confirm/RuleConfirmCheck.java:35-37`
- Modify: `dme/ruleConfirm/service/RuleConfirmService.java:162`
- Modify 시험: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleEdit/RuleLedgerChecksTest.java` (시험 둘 추가)
- Modify 문서: `docs/mdm/adr/0002-version-confirm-without-approval.md:85`

**Interfaces:**
- Consumes: Task 3 `RuleVersions.releasedValidFrom`·`RuleSetVersionQueries.versionsOf/members`, Task 7 `RuleSetVersionQueries.flow`
- Produces:
  - `record RuleSaveContext(..., RuleSaveTarget target, LocalDateTime referenceTime)` + 9인자 보조 생성자(`referenceTime = null`) — 기존 호출부는 그대로 컴파일된다
  - `record RuleCheckInput(..., RuleSaveTarget target, LocalDateTime referenceTime)` + 8인자 보조 생성자
  - `RuleConfirmChecks.report(VersionRef draft, LocalDateTime applyFrom): Report`(기존 `report(VersionRef)` 는 `report(draft, null)`)
  - `RuleSetOrderCheck` 대상 = 부모가 DEPRECATED 가 아닌 세트의 `releasedValidFrom(versions, at)` 버전들. `at` = `ctx.referenceTime()`(룰 확정의 apply_from), 없으면 지금 시각(J10). 이슈 문구 머리 `"세트 {setId} {v1.000}: "`. 같은 (세트, 버전)의 같은 이슈는 한 번

- [ ] **Step 1: 실패하는 시험 작성**

`RuleLedgerChecksTest` 에 더한다(이 시험의 `otherRule`·`ruleSet` 도우미와 표본 룰 `QLTY_GRD_JDG`(COIL_WID 를 읽는다)를 쓴다). 필드에 `@Autowired RuleConfirmChecks confirmChecks;` 를 더한다.

```java
    /** Review Focus 4 — 지금 버전(v1.000, 순서 오류)과 예약된 버전(v2.000, 바로잡음)이 함께 걸린다. DRAFT·폐기 세트는 보지 않는다. */
    private void versionedSets() {
        otherRule("R_WID", "X_IN", "COIL_WID");
        ruleSet("S_VER", "INUSE", "QLTY_GRD_JDG", "R_WID");          // 1.000 [2000-01-01, 2026-07-01) — 뒤 룰의 결과를 읽는다
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_SET_ID = 'S_VER'");
        DmeTestSupport.ruleSetVersion(jdbc, "S_VER", "2.000", "MAJOR", "RELEASED", "kim", "[\"R_WID\",\"QLTY_GRD_JDG\"]",
                "2026-07-01 00:00:00", "9999-12-31 00:00:00", 0);
        DmeTestSupport.ruleSetDraft(jdbc, "S_VER", "3.000", "kim", "[\"QLTY_GRD_JDG\",\"R_WID\"]", 0);
    }

    @Test
    void reportsOncePerSetVersionWithLabel() {
        versionedSets();
        List<Map<String, Object>> early = orderCheckAt("QLTY_GRD_JDG", LocalDateTime.of(2026, 6, 20, 0, 0));
        assertEquals(List.of("SET_ORDER"), checkCodes(early));
        assertTrue(String.valueOf(early.get(0).get("message")).startsWith("세트 S_VER v1.000: "), early.toString());
        assertEquals(List.of(), checkCodes(orderCheckAt("QLTY_GRD_JDG", LocalDateTime.of(2026, 7, 1, 0, 0))));
    }

    @Test
    void 룰_확정_검사는_요청한_apply_from_으로_세트_버전을_고른다() {
        versionedSets();
        VersionRef ref = new VersionRef(VersionTarget.BUSINESS_RULE, "QLTY_GRD_JDG", DmeTestSupport.v(1));
        List<String> early = RuleConfirmReport.flatten(confirmChecks.report(ref, LocalDateTime.of(2026, 6, 20, 0, 0))).errors()
                .stream().map(MdmCheckIssue::code).toList();
        List<String> late = RuleConfirmReport.flatten(confirmChecks.report(ref, LocalDateTime.of(2026, 7, 1, 0, 0))).errors()
                .stream().map(MdmCheckIssue::code).toList();
        assertTrue(early.contains("SET_ORDER"), early.toString());
        assertFalse(late.contains("SET_ORDER"), late.toString());
    }

    /** 확정 검사 빈을 me 의 VER 1 정의로, 기준 시각 at 으로 직접 부른다. */
    private List<Map<String, Object>> orderCheckAt(String me, LocalDateTime at) {
        return orderCheck.check(new RuleSaveContext(me, DmeTestSupport.v(1), "DECISION", "FIRST", queries.vars(me, DmeTestSupport.v(1)),
                List.of(), List.of(), List.of(), RuleSaveTarget.STORED, at));
    }
```

(`QLTY_GRD_JDG` 표본의 VER 1 이 이 시험 클래스 seed 에서 RELEASED 로 들어가는지 확인한다 — `세트에서_뒤_룰의_결과를_읽으면_…`(:282) 이 같은 표본으로 SET_ORDER 를 낸다.)

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mdm && ../gradlew :api:test --tests '*RuleLedgerChecksTest' --offline`
Expected: 컴파일 실패(`RuleSaveContext` 10인자 생성자·`report(VersionRef, LocalDateTime)` 없음)

- [ ] **Step 3: 구현**

`RuleSaveContext`:

```java
/**
 * … (기존 설명) {@code referenceTime} 은 세트 순서 검사의 기준 시각 — 룰 확정이면 요청한 apply_from, 저장이면 null(지금 시각, D-144 2단계 J10).
 */
public record RuleSaveContext(String ruleId, BigDecimal ver, String ruleKind, String hitPolicy, List<MdmRuleVar> rawVars, List<ResolvedVar> vars,
                              List<StoredRow> rows, List<RuleIssue> analysis, RuleSaveTarget target, LocalDateTime referenceTime) {

    public RuleSaveContext(String ruleId, BigDecimal ver, String ruleKind, String hitPolicy, List<MdmRuleVar> rawVars, List<ResolvedVar> vars,
                           List<StoredRow> rows, List<RuleIssue> analysis, RuleSaveTarget target) {
        this(ruleId, ver, ruleKind, hitPolicy, rawVars, vars, rows, analysis, target, null);
    }
}
```

`RuleCheckInput` 도 같은 방식으로 마지막 칸 `LocalDateTime referenceTime` 과 8인자 보조 생성자를 더한다. `RuleSaveValidator.java:71-72` 는 `new RuleSaveContext(..., stored(rows), analysis, target, in.referenceTime())`.

`RuleConfirmChecks`:

```java
    /** 4항목 보고서 — 세트 순서 검사는 지금 시각 기준(저장 때와 같다). */
    public Report report(VersionRef draft) {
        return report(draft, null);
    }

    /** 4항목 보고서 — applyFrom 이 있으면 세트 순서 검사가 그 시각 이후 유효한 세트 RELEASED 버전을 본다(D-144 2단계). */
    public Report report(VersionRef draft, LocalDateTime applyFrom) {
        // (지금 report 본문 그대로, validator.validate 의 RuleCheckInput 에 마지막 인자 applyFrom 을 넣는다)
    }
```

`RuleConfirmCheck.check`: `return RuleConfirmReport.flatten(checks.report(request.draft(), request.requestedApplyFrom()));`. `RuleConfirmService.validate`(:162): `Report report = checks.report(t.ref(), applyFrom);`(그 위에서 이미 `applyFrom` 을 읽는다).

`RuleSetOrderCheck` — 생성자는 Task 3 의 `(RuleQueries queries, RuleSetVersionQueries setVersions, Clock clock)` 그대로. `run` 의 세트 루프를 바꾼다.

```java
    private Run run(RuleSaveContext ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        List<SiblingRead> siblings = new ArrayList<>();
        Names self = RuleDefinitionReads.of(ctx.rawVars(), LedgerCells.rowCells(ctx.rows()));
        String me = ctx.ruleId();
        LocalDateTime at = ctx.referenceTime() != null ? ctx.referenceTime() : LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        List<MdmRuleSet> parents = queries.allSets().stream().filter(s -> !"DEPRECATED".equals(s.getStatus())).toList();
        Map<String, List<MdmRuleSetVer>> byId = setVersions.versionsOf(parents.stream().map(MdmRuleSet::getMaruRuleSetId).toList());
        Set<Map<String, Object>> seen = new LinkedHashSet<>();
        for (MdmRuleSet set : parents) {
            for (MdmRuleSetVer v : RuleVersions.releasedValidFrom(byId.get(set.getMaruRuleSetId()), at)) {
                List<String> members = RuleSetVersionQueries.members(v);
                if (!members.contains(me)) {
                    continue;
                }
                FlowTree tree = tree(v);
                if (tree == null) {
                    continue;
                }
                String s = set.getMaruRuleSetId() + " " + VersionNumbers.label(v.getVer());
                // (이하 지금 본문 그대로 — 문구의 "세트 " + s 가 "세트 S_VER v1.000" 이 된다. out.add(...) 는 seen.add 가 참일 때만 한다.
                //  siblingPairs 에는 세트 ID 만 넘긴다(SiblingRead.setId 의 뜻을 바꾸지 않는다).)
            }
        }
        return new Run(out, siblings);
    }

    /** 버전의 흐름 트리. FLOW_JSON 이 없으면 RULE_IDS 한 줄 흐름. 형식·구조 오류면 null(건너뛴다). */
    private static FlowTree tree(MdmRuleSetVer v) {
        FlowDefinition flow;
        try {
            flow = RuleSetVersionQueries.flow(v);
        } catch (IllegalArgumentException e) {
            return null;
        }
        FlowParse p = FlowParser.parse(flow);
        return p.issues().isEmpty() ? p.tree() : null;
    }
```

클래스 javadoc 첫 문장을 "룰 세트 순서(06:327, TSK-08-04 §6.4, D-144 2단계). 이 룰을 담은 세트의 RELEASED 버전 가운데 기준 시각(룰 확정의 apply_from, 저장이면 지금) 이후 유효한 것마다 흐름을 만들고 …" 로 고치고, "세트 DRAFT 는 세트 확정 때 검사한다(세트 확정 검사 3)" 를 덧붙인다. 이전의 `"INUSE".equals(set.getStatus())` 조건은 "폐기 아님" 으로 바뀐다(첫 확정 뒤 저장 CREATED 로 남은 세트도 운영에 쓰이므로).

`docs/mdm/adr/0002-version-confirm-without-approval.md:85` 의 D8-10 문장을 고친다.

```markdown
- **되돌린 뒤 판정자 사이의 차이**(D8-10): 되돌린 06 룰이 그 룰의 유일한 확정 버전이었다면, 그 룰을 멤버로 가진 룰 세트의 확정과 그 룰의 결과를 쓰는 다른 룰의 확정이 막힌다(2026-10-02 D-144 2단계 — 룰 세트도 버전 단위가 되어 "세트 저장" 이 "세트 확정" 으로 바뀌었다. 세트 확정 검사 2 "참조 룰마다 apply_from 시점 RELEASED" 가 막는다. 세트 DRAFT 저장은 경고만 한다). 시간이 지나서 풀리지 않고 다시 확정해야 풀린다 — 화면 문구로 알린다.
```

- [ ] **Step 4: 통과 확인**

Run: `cd src/backend/mdm && ../gradlew :lib:test :api:test --offline`
Expected: PASS. 기존 `RuleLedgerChecksTest` 의 세트 순서 시험들은 세트 픽스처가 2000-01-01 부터 열린 RELEASED 라 지금 시각 기준으로 그대로 걸린다. 문구를 `contains("S_AFTER")` 로 보는 단언은 그대로 통과한다.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/check/RuleSaveContext.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/check/RuleCheckInput.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/check/RuleSaveValidator.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/check/ledger/RuleSetOrderCheck.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/confirm/RuleConfirmChecks.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/confirm/RuleConfirmCheck.java \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleConfirm/service/RuleConfirmService.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleEdit/RuleLedgerChecksTest.java \
  docs/mdm/adr/0002-version-confirm-without-approval.md
/usr/bin/git -C <worktree> commit -m "feat(mdm): 룰 확정의 세트 순서 검사를 apply_from 이후 유효한 세트 RELEASED 버전들로 바꾼다"
```

---

### Task 10: 프런트 흐름도 편집기 — 버전 선택·VersionActionBar·내 DRAFT 에만 자동 저장

**선행:** 1단계 Task 7(프런트)이 커밋되어 `@/shell` 이 `fmtVer`·`normVer`·`sameVer` 를 내보내야 한다(「1단계 결과에 기대는 가정」). 커밋 전이면 시작하지 않는다.

**Files (모두 `src/frontend/m-mdm/` 아래):**
- Modify: `pages/dme/ruleSetEdit/types.ts:10,41-75,150-160` (상태 CREATED, Header·View 버전 칸, 새 타입)
- Modify: `pages/dme/ruleSetEdit/api.ts:46-82` (ver 를 싣고, 버전 조작 함수 추가)
- Modify: `src/dme/oasis-call.ts:26-35` (`isDraftGone`)
- Modify: `pages/dme/ruleSetEdit/state/useRuleSetEdit.ts:50-60,66-120,280-345,445-520` (선택 버전·버전 쓰기·자동 저장 stale)
- Modify: `pages/dme/ruleSetEdit/state/useAutoSave.ts:83-117` (stale 처리)
- Create: `pages/dme/ruleSetEdit/panels/SetVersionRow.tsx`
- Modify: `pages/dme/ruleSetEdit/page.tsx:101-110,697-720` (canEdit, 버전 줄)
- Modify: `pages/dme/ruleSetEdit/canvas/FlowToolbar.tsx:140-150` (폐기 가능 = `flags.canDeprecate`)
- Test (Create): `tests/dme/ruleSetEdit/version-row.test.ts`, `tests/dme/ruleSetEdit/auto-save-stale.test.ts`
- Modify 시험: `tests/dme/ruleSetEdit/*.test.ts` 가운데 `save`·`delete`·`restore` 요청 본문을 `toEqual` 로 단언하는 곳(`grep -rln "calls(\"save\")\|calls(\"delete\")\|calls(\"restore\")" tests/dme/ruleSetEdit`)

**Interfaces:**
- Consumes: Task 5·6 서버 계약(view `{setId, ver?}` → `set.ver/verKind/verLabel/verStatus/ownerId`, `versions[]`, `flags`, `me`, `editable`; save `ver` 필수; copy `{setId, verKind}` → `{setId, ver, verKind, rowVersion}`; delete `{setId, target, ver?, rowVersion?}`; lock·unlock·handover `{setId, ver, rowVersion, newOwnerId?}`), `@/shell` 의 `VersionActionBar`·`VersionStatusBadge`·`DraftLockBadge`·`fmtVer`·`sameVer`·`openMdmPage`·`HANDOVER_AVAILABLE`
- Produces:
  - `type RuleSetStatus = "CREATED" | "INUSE" | "DEPRECATED"`
  - `interface RuleSetVersionRow { ver: string; verKind: "MAJOR" | "MINOR" | null; verLabel: string; status: string; applyFrom: string | null; applyTo: string | null; ownerId: string | null; rowVersion: number; cancelConfirmable: boolean }`
  - `interface RuleSetVersionFlags { canNewMajor: boolean; canNewMinor: boolean; nextMajor: string | null; nextMinor: string | null; unappliedCount: number; currentVer: string | null; canDeprecate: boolean }`
  - `RuleSetHeader` 선택 칸 `ver?`·`verKind?`·`verLabel?`·`verStatus?`·`ownerId?`·`baseVer?`·`applyFrom?`·`applyTo?`(모두 `string | null`), `RuleSetView` 선택 칸 `versions?: RuleSetVersionRow[]`·`flags?: RuleSetVersionFlags`·`me?: string | null` — 기존 시험 리터럴(34개 파일)이 그대로 컴파일되도록 선택 칸으로 둔다
  - api: `viewSet(setId, ver?)`, `saveSet(setId, ver, setName, description, rowVersion, flowJson)`, `deprecateSet(setId)`, `restoreSet(setId)`, `newSetVersion(setId, verKind)`, `deleteSetDraft(setId, ver, rowVersion)`, `cancelSetConfirm(setId, ver, rowVersion)`, `lockSetVersion(setId, ver, rowVersion)`, `unlockSetVersion(setId, ver, rowVersion)`, `handoverSetVersion(setId, ver, rowVersion, newOwnerId)`
  - `isDraftGone(e: unknown): boolean` — MDM002(DRAFT 아님)·MDM003(소유자 아님)
  - `RuleSetEditState` 에 `open(setId, ver?)`, `selectVer(ver: string)`, `versionWrite(fn: () => Promise<{ ver?: string | null }>, opts: { next: "result" | "same" | "default"; done: string })`, `QuietSaveResult` 에 `{ status: "stale"; key: string }`
  - testid: `set-ver-row`, `set-ver-select`, `set-ver-new-major`, `set-ver-new-minor`, `set-ver-delete`, `set-ver-confirm`, `set-ver-cancel-confirm`(`-wrap`), `set-ver-lock`, `set-ver-unlock`, `set-ver-handover`(`-wrap`), `set-ver-handover-to`, `set-ver-readonly`

화면 규칙(스펙 §6 동작):
- 버전 선택 기본값은 서버가 정한다(내 DRAFT → 지금 적용 중인 RELEASED → VER 최대). 다른 버전을 고르면 `view{setId, ver}` 로 다시 불러온다. 저장하지 않은 변경이 있으면 지금의 `confirmLeave` 확인을 거친다(Review Focus 2).
- 편집 모드는 `view.editable`(서버: 담당자 ∧ 선택 버전이 내 DRAFT ∧ 폐기 아님) ∧ 상태가 DEPRECATED 아님 ∧ RBAC `save` 일 때만. 아니면 읽기 전용이고 배치·색 이동도 저장하지 않는다(지금도 `editing` 이 거짓이면 `onMove` 등이 편집을 만들지 않는다). 읽기 전용이면 버전 줄에 "읽기 전용 — 내 DRAFT 가 아니다" 배지(`set-ver-readonly`)를 보인다.
- 자동 저장(`useAutoSave`)은 편집 모드(= 내 DRAFT)에서만 돈다. 저장이 MDM002·MDM003 으로 거부되면(다른 곳에서 확정·넘기기·삭제됨) 자동 저장을 이 화면에서 끄고 읽기 전용으로 다시 불러온다(Review Focus 1).
- 버전 버튼은 저장하지 않은 변경·자동 저장 중·불러오는 중에는 모두 끈다(title "저장하지 않은 변경이 있다"). 새 버전을 만들면 그 DRAFT 를 고른 채로 다시 불러온다. DRAFT 삭제 뒤에는 기본 선택으로 다시 불러온다.
- [확정] 은 선택 버전이 내 DRAFT 일 때 켜지고 `openMdmPage("dme/ruleSetConfirm", { setId, ver })` 로 확정 화면을 연다.
- 디버거·테스트 케이스는 지금처럼 화면의 흐름(선택 버전 정의)을 보낸다. 룰은 판정 시각의 RELEASED(서버 `simulate`·`runCases` 그대로).

- [ ] **Step 1: 실패하는 시험 작성**

두 시험 파일 머리는 `auto-save-page.test.ts:1-30` 과 같다(`@vitest-environment happy-dom`, `@/dme/rule-handoff`·`@/shell` 의 `openMdmPage` 목). 공용 픽스처:

```ts
const rule = (ruleId: string, cond: string, result: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});

const versions = (): RuleSetVersionRow[] => [
  { ver: "2.000", verKind: "MAJOR", verLabel: "v2.000", status: "DRAFT", applyFrom: null, applyTo: null, ownerId: "tester", rowVersion: 0, cancelConfirmable: false },
  { ver: "1.000", verKind: "MAJOR", verLabel: "v1.000", status: "RELEASED", applyFrom: "2026-01-01 00:00:00", applyTo: "9999-12-31 00:00:00", ownerId: null, rowVersion: 3, cancelConfirmable: false },
];

/** 내 DRAFT 2.000 을 연 view — 편집할 수 있다. */
function draftView(): RuleSetView {
  return {
    set: { setId: "E2S_CHAIN", setName: "사슬", description: null, status: "INUSE", rowVersion: 0, ruleIds: ["E2S_GRD"], flow: null, branched: false,
      ver: "2.000", verKind: "MAJOR", verLabel: "v2.000", verStatus: "DRAFT", ownerId: "tester" },
    rules: [rule("E2S_GRD", "SET_THK", "S_GRD")],
    checks: [], condIo: {}, editable: true, restorable: false, cases: [],
    versions: versions(),
    flags: { canNewMajor: false, canNewMinor: false, nextMajor: null, nextMinor: null, unappliedCount: 1, currentVer: "1.000", canDeprecate: false },
    me: "tester",
  };
}

/** 지금 적용 중인 RELEASED 1.000 만 있는 view — 읽기 전용, 새 버전 가능. */
function releasedView(): RuleSetView {
  const v = draftView();
  return { ...v, editable: false,
    set: { ...v.set, rowVersion: 3, ver: "1.000", verLabel: "v1.000", verStatus: "RELEASED", ownerId: null },
    versions: [versions()[1]],
    flags: { canNewMajor: true, canNewMinor: true, nextMajor: "2.000", nextMinor: "1.001", unappliedCount: 0, currentVer: "1.000", canDeprecate: true } };
}
```

`version-row.test.ts`:

```ts
describe("세트 버전 줄", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
    mocks.openMdmPage.mockClear();
  });
  afterEach(() => uninstallServer());

  it("1. 버전 목록·선택 버전·상태가 보이고 다른 버전을 고르면 그 버전으로 다시 부른다", async () => {
    await openSet("E2S_CHAIN", draftView());
    expect(visibleText(byTestId("set-ver-row"))).toContain("v2.000");
    await chooseVer("1.000");
    expect(calls("view").at(-1)!.body.params).toMatchObject({ setId: "E2S_CHAIN", ver: "1.000" });
  });

  it("2. 저장하지 않은 변경이 있으면 버전 바꾸기 전에 확인하고, 거절하면 부르지 않는다", async () => {
    await openSet("E2S_CHAIN", draftView());
    await click("flow-mode-edit");
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(고침)");
    window.confirm = vi.fn(() => false);
    const before = calls("view").length;
    await chooseVer("1.000");
    expect(window.confirm).toHaveBeenCalled();
    expect(calls("view")).toHaveLength(before);
  });

  it("3. 저장하지 않은 변경이 있으면 버전 버튼을 모두 끈다", async () => {
    await openSet("E2S_CHAIN", draftView());
    await click("flow-mode-edit");
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(고침)");
    for (const id of ["set-ver-new-major", "set-ver-new-minor", "set-ver-delete", "set-ver-confirm", "set-ver-unlock"]) {
      expect(byTestId<HTMLButtonElement>(id).disabled, id).toBe(true);
    }
  });

  it("4. 새 버전(minor) 은 copy 를 보내고 만든 DRAFT 를 고른 채로 다시 부른다", async () => {
    srv.replies.copy = ok({ setId: "E2S_CHAIN", ver: "1.001", verKind: "MINOR", rowVersion: 0 });
    await openSet("E2S_CHAIN", releasedView());
    await click("set-ver-new-minor");
    expect(calls("copy")[0].body.params).toEqual({ setId: "E2S_CHAIN", verKind: "MINOR" });
    expect(calls("view").at(-1)!.body.params).toMatchObject({ setId: "E2S_CHAIN", ver: "1.001" });
  });

  it("5. RELEASED 는 읽기 전용이라 편집 모드가 없고 [확정] 이 꺼진다. 내 DRAFT 의 [확정] 은 확정 화면을 연다", async () => {
    await openSet("E2S_CHAIN", releasedView());
    expect(q("set-ver-readonly")).not.toBeNull();
    expect(byTestId<HTMLButtonElement>("set-ver-confirm").disabled).toBe(true);
    unmountPage();
    await openSet("E2S_CHAIN", draftView());
    await click("set-ver-confirm");
    expect(mocks.openMdmPage).toHaveBeenCalledWith("dme/ruleSetConfirm", { setId: "E2S_CHAIN", ver: "2.000" });
  });

  it("6. 저장은 선택 버전을 싣는다", async () => {
    srv.replies.save = ok({ setId: "E2S_CHAIN", rowVersion: 1, checks: [] });
    await openSet("E2S_CHAIN", draftView());
    await click("flow-mode-edit");
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(고침)");
    await click("set-save");
    expect(calls("save")[0].body.params).toMatchObject({ setId: "E2S_CHAIN", ver: "2.000", rowVersion: 0 });
  });

  it("8. 새로 등록한 세트(CREATED + 내 DRAFT 1.000)도 편집 모드에 들어가 선택 버전으로 저장한다", async () => {
    srv.replies.save = ok({ setId: "E2S_CHAIN", rowVersion: 1, checks: [] });
    const v = draftView();
    await openSet("E2S_CHAIN", { ...v, set: { ...v.set, status: "CREATED", ver: "1.000", verLabel: "v1.000" },
      versions: [{ ...versions()[0], ver: "1.000", verLabel: "v1.000" }] });
    await click("flow-mode-edit");
    expect(q("set-ver-readonly")).toBeNull();
    await typeInto(byTestId<HTMLInputElement>("set-name"), "새 세트");
    await click("set-save");
    expect(calls("save")[0].body.params).toMatchObject({ setId: "E2S_CHAIN", ver: "1.000" });
  });

  it("7. DRAFT 삭제는 delete target VERSION 을 보내고 기본 선택으로 다시 부른다", async () => {
    srv.replies.delete = ok({ setId: "E2S_CHAIN", ver: "2.000" });
    await openSet("E2S_CHAIN", draftView());
    await click("set-ver-delete");               // VersionActionBar 의 확인창은 showMessage — 시험 도우미가 확인을 누른다(아래 주)
    expect(calls("delete")[0].body.params).toEqual({ setId: "E2S_CHAIN", target: "VERSION", ver: "2.000", rowVersion: 0 });
    expect(calls("view").at(-1)!.body.params).toEqual({ setId: "E2S_CHAIN" });
  });
});
```

`chooseVer(ver)` 는 `byTestId("set-ver-select")` 를 바꾸는 도우미다 — ruleEdit 화면 시험이 `rule-ver-select` 를 고르는 방식(`tests/dme/ruleEdit/` 에서 `rule-ver-select` 검색)을 그대로 옮긴다. 7번의 확인창은 ruleMng 시험(`tests/dme/ruleMng/rule-mng-page.test.ts`)이 `rule-version-delete` 를 누른 뒤 확인을 누르는 방식을 그대로 쓴다.

`auto-save-stale.test.ts`(Review Focus 1):

```ts
describe("자동 저장 중 DRAFT 가 다른 곳에서 바뀜", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    uninstallServer();
  });

  it.each([
    ["MDM003", "DRAFT 소유자만 할 수 있습니다"],
    ["MDM002", "DRAFT 상태에서만 할 수 있습니다"],
  ])("%s 이면 자동 저장을 끄고 읽기 전용으로 다시 불러오며 같은 내용을 다시 보내지 않는다", async (code, message) => {
    srv.replies.save = { meta: { success: false, code, message } };
    await openSet("E2S_CHAIN", draftView());
    await click("flow-mode-edit");
    await click("set-autosave");
    srv.views.E2S_CHAIN = { ...draftView(), editable: false };   // 서버에서는 이미 내 DRAFT 가 아니다
    vi.useFakeTimers();
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(자동)");
    await advance(2000);
    await advance(50);
    expect(calls("save")).toHaveLength(1);
    expect(calls("view")).toHaveLength(2);
    expect(q("set-autosave")).toBeNull();          // 편집할 수 없어 보기 모드로 내려갔다
    expect(q("set-ver-readonly")).not.toBeNull();
    await advance(6000);
    expect(calls("save")).toHaveLength(1);
    expect(localStorage.getItem(storeKeys.autoSave)).toBe("true"); // 보는 사람 설정은 그대로(충돌 처리와 같다)
  });
});
```

(`advance` 는 `auto-save-page.test.ts:52-56` 의 도우미를 옮긴다.)

- [ ] **Step 2: 실패 확인**

Run: `cd src/frontend/m-mdm && npx vitest run tests/dme/ruleSetEdit/version-row.test.ts tests/dme/ruleSetEdit/auto-save-stale.test.ts`
Expected: FAIL(`set-ver-row` 없음, 타입 `RuleSetVersionRow` 없음)

- [ ] **Step 3: 구현**

`types.ts`:

```ts
export type RuleSetStatus = "CREATED" | "INUSE" | "DEPRECATED";

/** 세트 버전 한 행(서버 RuleSetViewResult.VersionRow, VER 내림차순, D-144 2단계). 버전은 소수 셋째 자리 문자열. */
export interface RuleSetVersionRow {
  ver: string;
  verKind: "MAJOR" | "MINOR" | null;
  verLabel: string;
  status: string;
  applyFrom: string | null;
  applyTo: string | null;
  ownerId: string | null;
  rowVersion: number;
  /** 아직 적용 전인 내 확정 버전이고 미적용 버전이 이것뿐(ADR-0002 D8). */
  cancelConfirmable: boolean;
}

/** 버전 버튼 플래그(서버 RuleSetViewResult.Flags — 룰 ruleMng 과 같은 규칙). */
export interface RuleSetVersionFlags {
  canNewMajor: boolean;
  canNewMinor: boolean;
  nextMajor: string | null;
  nextMinor: string | null;
  unappliedCount: number;
  currentVer: string | null;
  canDeprecate: boolean;
}

/** copy·delete(VERSION·CONFIRM)·lock·unlock·handover 응답. */
export interface RuleSetVersionResult {
  setId: string;
  ver: string | null;
  verKind: "MAJOR" | "MINOR" | null;
  rowVersion: number | null;
}
```

`RuleSetHeader` 에 선택 칸을 더한다(설명 주석: "D-144 2단계 — 선택 버전. 버전이 없는 세트면 null").

```ts
  ver?: string | null;
  verKind?: "MAJOR" | "MINOR" | null;
  verLabel?: string | null;
  verStatus?: string | null;
  ownerId?: string | null;
  baseVer?: string | null;
  applyFrom?: string | null;
  applyTo?: string | null;
```

`RuleSetView` 에 `versions?: RuleSetVersionRow[]; flags?: RuleSetVersionFlags; me?: string | null;` 를 더하고 `editable` 주석을 "담당자이고 선택 버전이 내 DRAFT 이며 폐기 아님(D-144 2단계)" 으로 고친다. `RuleSetStatusResult.rowVersion` 은 `number | null`.

`api.ts` — 머리 주석에 "D-144 2단계: view·save 는 버전(ver)을 싣고, copy·delete(target)·lock·unlock·handover 로 버전을 다룬다" 를 더하고:

```ts
export function viewSet(setId: string, ver?: string | null): Promise<RuleSetView> {
  return callOasis<RuleSetView>(SERVICE, "view", { setId, ver: ver ?? undefined });
}

/** 세트명·설명·흐름 저장 — 선택 버전(내 DRAFT)에만 쓴다. 흐름은 `flowJsonOf` 정규 JSON 문자열이다. */
export function saveSet(setId: string, ver: string, setName: string, description: string, rowVersion: number, flowJson: string): Promise<RuleSetSaveResult> {
  return callOasis<RuleSetSaveResult>(SERVICE, "save", {
    setId,
    ver,
    setName: setName.trim(),
    description: blankToUndefined(description),
    rowVersion,
    flowJson,
  });
}

/** 폐기(INUSE → DEPRECATED) — delete target SET. 행 버전을 보내지 않는다(부모에 행 버전이 없다). */
export function deprecateSet(setId: string): Promise<RuleSetStatusResult> {
  return callOasis<RuleSetStatusResult>(SERVICE, "delete", { setId, target: "SET" });
}

/** 되살리기(DEPRECATED → INUSE, 표시 버전의 검사를 통과할 때만). */
export function restoreSet(setId: string): Promise<RuleSetStatusResult> {
  return callOasis<RuleSetStatusResult>(SERVICE, "restore", { setId });
}

export function newSetVersion(setId: string, verKind: "MAJOR" | "MINOR"): Promise<RuleSetVersionResult> {
  return callOasis<RuleSetVersionResult>(SERVICE, "copy", { setId, verKind });
}

export function deleteSetDraft(setId: string, ver: string, rowVersion: number): Promise<RuleSetVersionResult> {
  return callOasis<RuleSetVersionResult>(SERVICE, "delete", { setId, target: "VERSION", ver, rowVersion });
}

/** 확정 취소(ADR-0002 D8) — 아직 적용 전인 내 확정 버전을 DRAFT 로 되돌린다. */
export function cancelSetConfirm(setId: string, ver: string, rowVersion: number): Promise<RuleSetVersionResult> {
  return callOasis<RuleSetVersionResult>(SERVICE, "delete", { setId, target: "CONFIRM", ver, rowVersion });
}

export function lockSetVersion(setId: string, ver: string, rowVersion: number): Promise<RuleSetVersionResult> {
  return callOasis<RuleSetVersionResult>(SERVICE, "lock", { setId, ver, rowVersion });
}

export function unlockSetVersion(setId: string, ver: string, rowVersion: number): Promise<RuleSetVersionResult> {
  return callOasis<RuleSetVersionResult>(SERVICE, "unlock", { setId, ver, rowVersion });
}

export function handoverSetVersion(setId: string, ver: string, rowVersion: number, newOwnerId: string): Promise<RuleSetVersionResult> {
  return callOasis<RuleSetVersionResult>(SERVICE, "handover", { setId, ver, rowVersion, newOwnerId });
}
```

`src/dme/oasis-call.ts` — `isRowVersionConflict` 아래에 더한다.

```ts
/** DRAFT 가 아니거나(MDM002) 내 DRAFT 가 아니다(MDM003) — 다른 곳에서 확정·넘기기·삭제됐다(D-144 2단계). 코드가 없는 경로는 문구로 본다. */
export function isDraftGone(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e instanceof OasisCallError && (e.code === "MDM002" || e.code === "MDM003")) return true;
  return e.message.startsWith("DRAFT 상태에서만") || e.message.startsWith("DRAFT 소유자만");
}
```

`useRuleSetEdit.ts`:
- `QuietSaveResult` 에 `| { status: "stale"; key: string }` 를 더한다.
- `verRef = useRef<string | null>(null)` 을 두고, `load(setId, opts: { keepHistory: boolean; ver?: string | null })` 가 `viewSet(setId, opts.ver)` 를 부른 뒤 `verRef.current = next.set.ver ?? null` 로 둔다. 편집 가능 판정(:304)은 `next.editable && next.set.status !== "DEPRECATED"`.
- `open(setId: string, ver?: string | null)` 는 `load(setId, { keepHistory: false, ver })`. `reload` 는 `load(id, { keepHistory: false, ver: verRef.current })`.
- 새 `selectVer`:

```ts
  const selectVer = useCallback(
    async (ver: string) => {
      const id = setIdRef.current;
      if (!id || sameVer(ver, verRef.current) || !confirmLeave()) return;
      setMessage(null);
      await load(id, { keepHistory: false, ver });
    },
    [confirmLeave, load],
  );
```

- 새 `versionWrite` — 버전 조작 뒤 다시 부를 버전을 정한다(새 버전이면 결과 버전, 잠금·해제·넘기기·확정취소면 지금 버전, DRAFT 삭제면 서버 기본 선택).

```ts
  const versionWrite = useCallback(
    async (fn: () => Promise<{ ver?: string | null }>, opts: { next: "result" | "same" | "default"; done: string }) => {
      const id = setIdRef.current;
      if (!id || autoSavingRef.current || dirtyRef.current) return;
      setLoading(true);
      let result: { ver?: string | null };
      try {
        result = await fn();
      } catch (e) {
        fail(e);
        setLoading(false);
        return;
      }
      setLoading(false);
      const ver = opts.next === "result" ? result.ver ?? null : opts.next === "same" ? verRef.current : null;
      await load(id, { keepHistory: false, ver });
      setMessage({ kind: "info", text: opts.done });
    },
    [fail, load],
  );
```

- `save`(:445-453): `saveSet(v.set.setId, v.set.ver ?? "", setName, description, v.set.rowVersion, flowJsonOf(f))`. `v.set.ver` 가 없으면(버전 없는 세트) 편집 모드가 켜지지 않아 저장 단추가 눌리지 않는다.
- `saveQuiet`(:455-498): `saveSet(v.set.setId, v.set.ver ?? "", name, desc, v.set.rowVersion, json)`. catch 에서 `isDraftGone(e)` 이면

```ts
        if (isDraftGone(e)) {
          // 다른 곳에서 확정·넘기기·삭제됐다 — 같은 내용을 되풀이하지 않고 읽기 전용으로 다시 부른다(Review Focus 1).
          const id = setIdRef.current;
          if (id) void load(id, { keepHistory: false, ver: verRef.current });
          setMessage({ kind: "error", text: "이 버전은 더 이상 내 DRAFT 가 아니다. 읽기 전용으로 다시 불러왔다" });
          return { status: "stale", key };
        }
```

  를 `fail(e)` 앞에 둔다.
- `deprecate`·`restore`(:500-516)는 `deprecateSet(v.set.setId)`·`restoreSet(v.set.setId)` 로, 완료 문구에서 `row_version` 을 뺀다("폐기. 행은 남기고 되살릴 수 있다", "되살림").
- 반환 객체에 `selectVer`·`versionWrite` 를 더하고 `RuleSetEditState` 인터페이스에도 적는다.

`useAutoSave.ts:96-101` — `stale` 도 충돌처럼 이 화면에서 끈다.

```ts
        } else if (r.status === "conflict" || r.status === "stale") {
          setFailedKey(r.key);
          setEnabledState(false);
        }
```

`panels/SetVersionRow.tsx`:

```tsx
"use client";

/**
 * 룰 세트 버전 줄(D-144 2단계) — 버전 고르기·상태·소유자 배지와 공통 `VersionActionBar`(룰·마스터코드와 같은 이름·순서·모양).
 * 활성 조건은 서버 판정(flags·cancelConfirmable·editable)과 RBAC 로 여기서 계산한다. 저장하지 않은 변경·자동 저장 중·불러오는 중에는 모두 끈다.
 */
import { useState } from "react";

import { Input, Select } from "@dk-oasis/shared/form";
import { DraftLockBadge, HANDOVER_AVAILABLE, VersionActionBar, VersionStatusBadge, badgeStyle, fmtVer, openMdmPage } from "@/shell";

import {
  cancelSetConfirm, deleteSetDraft, handoverSetVersion, lockSetVersion, newSetVersion, unlockSetVersion,
} from "../api";
import type { RuleSetEditState } from "../state/useRuleSetEdit";

/** D8-10 와 같은 결 — 세트 확정 취소의 효과 안내. */
const CANCEL_CONFIRM_TEXT =
  "적용 시각이 오기 전에는 취소할 수 있고, 이미 적용된 뒤에는 되돌릴 수 없습니다. 취소하면 이 버전은 DRAFT 로 돌아가고 직전 확정 버전이 계속 쓰입니다. 취소해도 확정 기록은 남습니다.";
const MINOR_LIMIT_HINT = "major 를 올리십시오";
const DIRTY_HINT = "저장하지 않은 변경이 있다";

export interface SetVersionRowProps {
  state: RuleSetEditState;
  canDo: (action: string) => boolean;
}

export function SetVersionRow({ state, canDo }: SetVersionRowProps) {
  const [handoverTo, setHandoverTo] = useState("");
  const view = state.view;
  if (!view) return null;
  const setId = view.set.setId;
  const ver = view.set.ver ?? null;
  const versions = view.versions ?? [];
  const flags = view.flags;
  const me = view.me ?? null;
  const selected = versions.find((v) => v.ver === ver) ?? null;
  const busy = state.dirty || state.autoSaving || state.loading;
  const isDraft = selected?.status === "DRAFT";
  const mine = isDraft && !!me && selected?.ownerId === me;
  const hint = busy ? DIRTY_HINT : "";
  const rv = selected?.rowVersion ?? 0;
  const minorLimited = !!flags && !flags.canNewMinor && flags.unappliedCount === 0 && versions.length > 0;

  return (
    <div data-testid="set-ver-row" className="rsf-toolbar-row" style={{ gap: "var(--spacing-sm)" }}>
      <span>버전</span>
      <Select
        data-testid="set-ver-select"
        value={ver ?? ""}
        options={versions.map((v) => ({ value: v.ver, label: `${fmtVer(v.ver)} (${v.status})` }))}
        onChange={(v) => void state.selectVer(String(v))}
        disabled={versions.length === 0 || state.loading}
        style={{ width: 150 }}
      />
      {selected && <VersionStatusBadge status={selected.status} applyFrom={selected.applyFrom} />}
      {selected && <DraftLockBadge status={selected.status} ownerId={selected.ownerId} currentUserId={me ?? undefined} />}
      {!view.editable && (
        <span data-testid="set-ver-readonly" style={badgeStyle("muted")}>
          {versions.length === 0 ? "버전 없음 — 새 버전(major)을 만든다" : "읽기 전용 — 내 DRAFT 가 아니다"}
        </span>
      )}
      <VersionActionBar
        ids={{
          newMajor: "set-ver-new-major", newMinor: "set-ver-new-minor", delete: "set-ver-delete", confirm: "set-ver-confirm",
          cancelConfirm: "set-ver-cancel-confirm", cancelConfirmWrap: "set-ver-cancel-confirm-wrap", lock: "set-ver-lock",
          unlock: "set-ver-unlock", handover: "set-ver-handover", handoverWrap: "set-ver-handover-wrap",
        }}
        newVersionMode="majorMinor"
        newMajor={{ enabled: !busy && !!flags?.canNewMajor && canDo("copy"), title: hint || (flags?.nextMajor ? `${fmtVer(flags.nextMajor)} 을 만든다` : "") }}
        newMinor={{
          enabled: !busy && !!flags?.canNewMinor && canDo("copy"),
          title: hint || (minorLimited ? MINOR_LIMIT_HINT : flags?.nextMinor ? `${fmtVer(flags.nextMinor)} 을 만든다` : ""),
        }}
        delete={{ enabled: !busy && mine && canDo("delete"), title: hint }}
        confirm={{ enabled: !busy && mine, title: hint || (mine ? "" : "내 DRAFT 버전만 확정할 수 있습니다") }}
        cancelConfirm={{
          enabled: !busy && !!selected?.cancelConfirmable && canDo("delete"),
          title: hint || (selected?.cancelConfirmable ? "" : "아직 적용 시각이 오지 않은 내 확정 버전만 취소할 수 있습니다"),
        }}
        lock={{ enabled: !busy && isDraft && !selected?.ownerId && canDo("lock"), title: hint }}
        unlock={{ enabled: !busy && mine && canDo("unlock"), title: hint }}
        handover={{ enabled: !busy && mine && canDo("handover") && handoverTo.trim() !== "", title: hint }}
        onNewMajor={() => void state.versionWrite(() => newSetVersion(setId, "MAJOR"), { next: "result", done: "새 버전(major)을 만들었다" })}
        onNewMinor={() => void state.versionWrite(() => newSetVersion(setId, "MINOR"), { next: "result", done: "새 버전(minor)을 만들었다" })}
        onDelete={() => ver && void state.versionWrite(() => deleteSetDraft(setId, ver, rv), { next: "default", done: `${fmtVer(ver)} 을 지웠다` })}
        onConfirm={() => ver && openMdmPage("dme/ruleSetConfirm", { setId, ver })}
        onCancelConfirm={() => ver && void state.versionWrite(() => cancelSetConfirm(setId, ver, rv), { next: "same", done: "확정을 취소했다" })}
        onLock={() => ver && void state.versionWrite(() => lockSetVersion(setId, ver, rv), { next: "same", done: "선점했다" })}
        onUnlock={() => ver && void state.versionWrite(() => unlockSetVersion(setId, ver, rv), { next: "same", done: "해제했다" })}
        onHandover={() => ver && void state.versionWrite(() => handoverSetVersion(setId, ver, rv, handoverTo.trim()), { next: "same", done: "넘겼다" })}
        deleteMessage={`${fmtVer(ver)} DRAFT 를 지운다. 되돌릴 수 없다`}
        cancelConfirmMessage={CANCEL_CONFIRM_TEXT}
        beforeHandover={HANDOVER_AVAILABLE ? (
          <Input data-testid="set-ver-handover-to" value={handoverTo} placeholder="넘겨받는 사람 ID" onChange={(e) => setHandoverTo(e.currentTarget.value)} style={{ width: 140 }} />
        ) : null}
      />
    </div>
  );
}
```

(`Select`·`Input`·`VersionStatusBadge`·`DraftLockBadge`·`badgeStyle` 의 prop 이름은 ruleEdit `page.tsx:89-97` 과 ruleMng `RuleDetailPanel.tsx` 의 사용과 같다. 다르면 그쪽 사용을 따른다 — `mantine-aggrid-ui` 스킬로 shared 래퍼 규칙을 확인한다.)

`page.tsx`:
- :103 `const canEdit = !!view && view.editable && view.set.status !== "DEPRECATED" && canDo("save");`
- `FlowToolbar`(:699) 바로 앞에 `<SetVersionRow state={state} canDo={canDo} />` 를 둔다(같은 `<>` 안). import 를 더한다. 파일 머리 주석의 "모드(3단계 P1)" 단락 끝에 "편집 모드는 선택 버전이 내 DRAFT 일 때만(D-144 2단계). 버전 줄(`SetVersionRow`)이 흐름 툴바 위에 있다." 를 더한다.

`INUSE` 문자열 비교 정리: 새 세트는 저장 상태가 `CREATED` 라 `=== "INUSE"` 비교가 남아 있으면 조용히 읽기 전용이 된다(tsc 가 잡지 못한다). `grep -rn '"INUSE"' src/frontend/m-mdm/pages/dme/ruleSetEdit` 로 찾아, 편집·저장 가능 판정에 쓰인 곳은 `!== "DEPRECATED"` 로 바꾼다(폐기 단추처럼 정말 사용 중일 때만 뜻이 있는 곳은 그대로 둔다). 고친 곳마다 줄 끝 주석 `// D-144 2단계 — CREATED 세트도 편집` 을 단다.

`canvas/FlowToolbar.tsx`: 폐기 단추 활성 조건에 `(view.flags?.canDeprecate ?? true)` 를 더한다(미적용 버전이 있으면 서버가 MDM006 으로 거부한다). 되살리기는 그대로.

기존 시험: `deprecate`·`restore` 요청 본문을 정확히 비교하는 단언(`{ setId, rowVersion }`)은 `{ setId, target: "SET" }`·`{ setId }` 로, `save` 를 `toEqual` 로 비교하는 단언은 `ver` 칸을 더하거나 `toMatchObject` 로 바꾼다(기존 view 리터럴에는 `set.ver` 가 없으므로 저장 단추가 보내는 `ver` 는 `""` 다 — 그 시험들은 `toMatchObject` 로 두고 `ver` 를 단언하지 않는다).

- [ ] **Step 4: 통과 확인**

Run: `cd src/frontend/m-mdm && rtk proxy pnpm run lint && rtk proxy pnpm run test`
Expected: tsc 오류 0, `[m-mdm test 합계] ... failed 0`

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts \
  src/frontend/m-mdm/pages/dme/ruleSetEdit/api.ts \
  src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts \
  src/frontend/m-mdm/pages/dme/ruleSetEdit/state/useAutoSave.ts \
  src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/SetVersionRow.tsx \
  src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx \
  src/frontend/m-mdm/pages/dme/ruleSetEdit/canvas/FlowToolbar.tsx \
  src/frontend/m-mdm/src/dme/oasis-call.ts \
  src/frontend/m-mdm/tests/dme/ruleSetEdit/version-row.test.ts \
  src/frontend/m-mdm/tests/dme/ruleSetEdit/auto-save-stale.test.ts
# Step 3 에서 고친 기존 시험 파일은 경로를 하나씩 더한다(디렉터리째 add 하지 않는다)
/usr/bin/git -C <worktree> commit -m "feat(m-mdm): 룰 세트 편집기에 버전 선택과 버전 버튼을 두고 내 DRAFT 에만 저장한다"
```

---

### Task 11: 프런트 룰 세트 확정 화면과 세트 목록 버전 열

**Files (모두 `src/frontend/` 아래):**
- Create: `m-mdm/pages/dme/ruleSetConfirm/types.ts`, `api.ts`, `checks.ts`, `page.tsx`
- Modify: `m-mdm/pages/dme/ruleConfirm/ConfirmModal.tsx:18-40` (`titleOf` prop)
- Modify: `m-mdm/tsup.config.ts:57` 다음 줄
- Modify: `m-mcm/lib/generated/page-registry.ts` (생성기로 다시 만든다)
- Modify: `m-mdm/pages/dme/ruleSetMng/types.ts`, `m-mdm/pages/dme/ruleSetMng/page.tsx` (목록 `ver` 열, 등록 뒤 편집 화면 열기 그대로)
- Test (Create): `m-mdm/tests/dme/ruleSetConfirm/rule-set-confirm-page.test.ts`, `m-mdm/tests/dme/ruleSetConfirm/checks.test.ts`
- Modify 시험: `m-mdm/tests/dme/ruleSetMng/rule-set-mng-page.test.ts` (버전 열)
- Modify e2e: `e2e/mdm-ruleSetEdit.spec.ts`, `e2e/mdm-ruleSetMng.spec.ts`, `e2e/fixtures/mdm-ruleSet-data.sql`; Create `e2e/mdm-ruleSetConfirm.spec.ts`

**Interfaces:**
- Consumes: Task 8 OASIS `ruleSetConfirm` 응답 모양, ruleConfirm 의 `ConfirmModal`·`canConfirm`·`toServerDateTime`·`splitWarnings`·`checkStatusLabel`·`APPLY_FROM_ITEM`
- Produces:
  - `ruleSetConfirm/types.ts`: `PendingSetDraft{setId, setName, ver, verKind, ownerId, setStatus}`, `SetSearchResult{rows}`, `SetConfirmView{set: {setId, setName, status}, version: {ver, verKind, verLabel, status, ownerId, rowVersion, baseVer, applyFrom, applyTo, requestedBy, releasedAt, ruleIds: string[]}, previous: {ver, verLabel, applyFrom, applyTo} | null, firstVersion, diff: SetDiffRow[], diffCounts, serverNow}`, `SetDiffRow{key, kind, oldValues: Record<string, unknown> | null, newValues: Record<string, unknown> | null}`, `SetValidateResult`(ruleConfirm `ValidateResult` 에서 `contractWarnings` 를 뺀 모양), `SetConfirmResult extends Partial<SetConfirmView>{confirmed, closedPreviousVer, warnings}`
  - `ruleSetConfirm/api.ts`: `searchSetDrafts(keyword)`, `viewSetDraft(setId, ver?)`, `validateSetDraft(setId, ver, applyFrom)`, `confirmSetDraft(setId, ver, rowVersion, applyFrom, warningsAcknowledged)` — `callOasis` 는 ruleConfirm `api.ts` 의 `unwrap` 을 import 해 같은 봉투 처리를 한다
  - `ruleSetConfirm/checks.ts`: `SET_CHECK_TITLES`, `setCheckTitle(item)` — `FLOW_STRUCTURE` "흐름 구조", `RULES_RELEASED` "참조 룰 RELEASED", `ORDER` "순서·순환", `TEST_CASES` "테스트 케이스", `APPLY_FROM` "적용 순서"
  - `ConfirmModalProps.titleOf?: (item: string) => string`(없으면 지금의 `checkTitle`)
  - 화면 testid 접두 `rsc-`(룰 화면의 `rc-` 와 같은 자리): `rsc-list`, `rsc-keyword`, `rsc-search`, `rsc-row-{setId}-{ver}`, `rsc-list-empty`, `rsc-form`, `rsc-target`, `rsc-previous`, `rsc-apply-from`, `rsc-validate`, `rsc-confirm`, `rsc-checks`, `rsc-check-status-{item}`, `rsc-error`, `rsc-released`, `rsc-closed-previous`, `rsc-diff`, `rsc-diff-counts`, `rsc-diff-empty`
  - 세트 목록 `RuleSetListRow.ver: string | null`, 열 testid `rsm-ver-{setId}`

- [ ] **Step 1: 실패하는 시험 작성**

`tests/dme/ruleSetConfirm/checks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { setCheckTitle } from "../../../pages/dme/ruleSetConfirm/checks";

describe("세트 확정 검사 제목", () => {
  it("네 항목과 적용 순서의 제목", () => {
    expect(setCheckTitle("FLOW_STRUCTURE")).toBe("흐름 구조");
    expect(setCheckTitle("RULES_RELEASED")).toBe("참조 룰 RELEASED");
    expect(setCheckTitle("ORDER")).toBe("순서·순환");
    expect(setCheckTitle("TEST_CASES")).toBe("테스트 케이스");
    expect(setCheckTitle("APPLY_FROM")).toBe("적용 순서");
    expect(setCheckTitle("X")).toBe("X");
  });
});
```

`tests/dme/ruleSetConfirm/rule-set-confirm-page.test.ts` — 준비 코드는 `tests/dme/ruleConfirm/rule-confirm-page.test.ts:1-170` 과 같은 방식이다(전체를 적는다).

```ts
/** @vitest-environment happy-dom */

// D-144 2단계 — ruleSetConfirm 렌더: handoff 진입, 세트 검사 표와 [확정] 활성, 확정 대화상자, 서버 거부 문구.
// 서버는 globalThis.fetch mock 이다(서비스 RuleSetConfirmService 와 같은 봉투). 준비 방식은 ruleConfirm 화면 시험과 같다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { openMdmPage, takeMdmPageParams } from "@/shell";

import RuleSetConfirmPage from "../../../pages/dme/ruleSetConfirm/page";
import { pickDateTime } from "../../helpers/datetime-picker";
import { RBAC_STORE_KEY, flush, installDomStorage, jsonResponse, visibleText } from "../helpers/render";

const ITEMS = ["FLOW_STRUCTURE", "RULES_RELEASED", "ORDER", "TEST_CASES"] as const;

type Issue = { severity: string; code: string; message: string; field: string | null; itemKey: string | null };
type Item = { item: string; status: string; issues: Issue[] };

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
const calls: { action: string; params: Record<string, unknown> }[] = [];

function ok(result: unknown) {
  return { meta: { success: true }, data: { result } };
}

function viewResult(version: Record<string, unknown> = {}) {
  return {
    set: { setId: "S_C", setName: "확정 세트", status: "INUSE" },
    version: { ver: "2.000", verKind: "MAJOR", verLabel: "v2.000", status: "DRAFT", ownerId: "tester", rowVersion: 4, baseVer: "1.000",
      applyFrom: null, applyTo: null, requestedBy: null, releasedAt: null, ruleIds: ["R_A"], ...version },
    previous: { ver: "1.000", verLabel: "v1.000", applyFrom: "2026-01-01 00:00:00", applyTo: "9999-12-31 00:00:00" },
    firstVersion: false,
    diff: [
      { key: "NODE:r1", kind: "CHANGED", oldValues: { kind: "RULE", ruleId: "R_OLD" }, newValues: { kind: "RULE", ruleId: "R_A" } },
      { key: "NODE:start", kind: "SAME", oldValues: { kind: "START" }, newValues: { kind: "START" } },
    ],
    diffCounts: { ADDED: 0, REMOVED: 0, CHANGED: 1, SAME: 1 },
    serverNow: "2026-06-15 09:00:00",
  };
}

function items(patch: Partial<Record<(typeof ITEMS)[number], Partial<Item>>> = {}): Item[] {
  return ITEMS.map((item) => ({ item, status: "PASSED", issues: [], ...patch[item] }));
}

function validateResult(its: Item[]) {
  return {
    items: its,
    applyFromCheck: { status: "PASSED", previousApplyFrom: "2026-01-01 00:00:00", message: null },
    caseSummary: { total: 0, withExpected: 0, passed: 0, failed: 0 },
    rejectedCount: its.filter((i) => i.status === "REJECTED").length,
    warnedCount: its.filter((i) => i.status === "WARNED").length,
    applyFrom: "2026-07-01 00:00:00",
    futureApplyFrom: false,
    serverNow: "2026-06-15 09:00:00",
  };
}

const NOT_RELEASED: Issue = {
  severity: "ERROR", code: "SET_RULE_NOT_RELEASED", message: "R_A 에 적용 시각 2026-07-01 00:00:00 의 RELEASED 버전이 없습니다",
  field: "RULES_RELEASED", itemKey: "RULE:R_A",
};

let nextValidate: () => unknown;
let confirmResponse: unknown;

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null,
      createElement(RuleSetConfirmPage, { tabId: "t1", snapshot: null, onSnapshotChange: () => {} })));
  });
  await flush();
  await flush();
}

function byTestId(id: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${id}"]`);
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await flush();
}

const actions = (name: string) => calls.filter((c) => c.action === name);

async function openAndValidate(applyFrom = "2026-07-01 00:00:00") {
  openMdmPage("dme/ruleSetConfirm", { setId: "S_C", ver: "2.000" });
  await render();
  await pickDateTime(() => byTestId("rsc-apply-from") as HTMLElement, applyFrom);
  await click(byTestId("rsc-validate"));
}

describe("RuleSetConfirmPage", () => {
  beforeEach(() => {
    installDomStorage();
    calls.length = 0;
    nextValidate = () => validateResult(items());
    confirmResponse = ok({ ...viewResult({ status: "RELEASED", applyFrom: "2026-07-01 00:00:00" }),
      confirmed: { ver: "2.000", rowVersion: 5 }, closedPreviousVer: "1.000", warnings: [] });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const m = url.match(/\/oasis\/ruleSetConfirm\/(\w+)/);
      if (m) {
        calls.push({ action: m[1], params: body.params ?? {} });
        if (m[1] === "search") {
          return jsonResponse(ok({ rows: [{ setId: "S_C", setName: "확정 세트", ver: "2.000", verKind: "MAJOR", ownerId: "tester", setStatus: "INUSE" }] }));
        }
        if (m[1] === "view") return jsonResponse(ok(viewResult()));
        if (m[1] === "validate") return jsonResponse(ok(nextValidate()));
        if (m[1] === "confirm") return jsonResponse(confirmResponse);
      }
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    takeMdmPageParams("dme/ruleSetConfirm");
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    document.body.innerHTML = "";
  });

  it("1. handoff {setId, ver: \"2\"} 로 열면 ver 를 \"2.000\" 으로 맞춰 부르고 대상·직전 버전·diff 건수를 보인다", async () => {
    openMdmPage("dme/ruleSetConfirm", { setId: "S_C", ver: "2" });
    await render();
    expect(actions("view").map((c) => c.params)).toEqual([{ setId: "S_C", ver: "2.000" }]);
    expect(byTestId("rsc-target")?.textContent).toBe("S_C 버전 v2.000 · 확정 세트");
    expect(visibleText(byTestId("rsc-previous")!)).toContain("v1.000");
    expect(byTestId("rsc-diff-counts")?.textContent).toBe("추가 0 · 삭제 0 · 수정 1 · 같음 1");
  });

  it("2. 검사 표는 세트 항목 제목을 보이고 REJECTED 가 있으면 [확정] 이 꺼진다", async () => {
    nextValidate = () => validateResult(items({ RULES_RELEASED: { status: "REJECTED", issues: [NOT_RELEASED] } }));
    await openAndValidate();
    expect(visibleText(byTestId("rsc-checks")!)).toContain("참조 룰 RELEASED");
    expect(visibleText(byTestId("rsc-checks")!)).toContain("흐름 구조");
    expect(byTestId("rsc-check-status-RULES_RELEASED")?.getAttribute("data-rejected")).toBe("true");
    expect((byTestId("rsc-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it("3. 통과하면 [확정] → 대화상자 확인으로 confirm 을 보내고 닫은 직전 버전을 알린다", async () => {
    await openAndValidate();
    await click(byTestId("rsc-confirm"));
    await click(byTestId("rc-modal-ok"));
    expect(actions("confirm")[0].params).toEqual({
      setId: "S_C", ver: "2.000", rowVersion: 4, applyFrom: "2026-07-01 00:00:00", warningsAcknowledged: false,
    });
    expect(byTestId("rsc-closed-previous")?.textContent).toBe("직전 버전 v1.000 의 적용을 닫았습니다");
  });

  it("4. 서버 거부 문구는 오류 영역에 그대로 보인다", async () => {
    confirmResponse = { meta: { success: false, message: "확정 검사를 통과하지 못했습니다" } };
    await openAndValidate();
    await click(byTestId("rsc-confirm"));
    await click(byTestId("rc-modal-ok"));
    expect(byTestId("rsc-error")?.textContent).toContain("확정 검사를 통과하지 못했습니다");
  });
});
```

(대화상자 단추 `rc-modal-ok` 는 ruleConfirm 의 `ConfirmModal` 을 그대로 쓰므로 이름이 같다. `pickDateTime` 은 `tests/helpers/datetime-picker` 도우미다.)

`tests/dme/ruleSetMng/rule-set-mng-page.test.ts` 에 목록 응답 행에 `ver: "1.001"` 을 넣고 `rsm-ver-<setId>` 칸의 글이 `v1.001` 인 사례를 더한다.

- [ ] **Step 2: 실패 확인**

Run: `cd src/frontend/m-mdm && npx vitest run tests/dme/ruleSetConfirm tests/dme/ruleSetMng`
Expected: FAIL(모듈 없음)

- [ ] **Step 3: 구현**

`checks.ts`:

```ts
/** 룰 세트 확정 검사 항목 제목(D-144 2단계, 서버 MdmRuleSetConfirmCheckItem). 확정 흐름 판정은 ruleConfirm/checks 를 그대로 쓴다. */
import { APPLY_FROM_ITEM } from "../ruleConfirm/checks";

export const SET_CHECK_TITLES: Record<string, string> = {
  FLOW_STRUCTURE: "흐름 구조",
  RULES_RELEASED: "참조 룰 RELEASED",
  ORDER: "순서·순환",
  TEST_CASES: "테스트 케이스",
  [APPLY_FROM_ITEM]: "적용 순서",
};

export function setCheckTitle(item: string): string {
  return SET_CHECK_TITLES[item] ?? item;
}
```

`api.ts`:

```ts
/**
 * ruleSetConfirm 화면의 OASIS 호출(D-144 2단계). 봉투 해제는 ruleConfirm 과 같다(`unwrap` 재사용).
 * 호출: `POST /api/mdm/oasis/ruleSetConfirm/{action}` — search·view(READ), validate(EDIT), confirm(CONFIRM). 버전은 "1.001" 문자열.
 */
import { apiRequest } from "@dk-oasis/shared/http";

import { unwrap } from "../ruleConfirm/api";
import type { SetConfirmResult, SetConfirmView, SetSearchResult, SetValidateResult } from "./types";

const SERVICE = "ruleSetConfirm";

async function callOasis<T>(action: string, params: Record<string, unknown>): Promise<T> {
  const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined));
  const res = await apiRequest<unknown>(`/api/mdm/oasis/${SERVICE}/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: SERVICE }, params: cleaned }),
  });
  return unwrap<T>(res);
}

export function searchSetDrafts(keyword = ""): Promise<SetSearchResult> {
  return callOasis<SetSearchResult>("search", { keyword });
}

/** ver 를 비우면 서버가 그 세트의 DRAFT 를 고른다. */
export function viewSetDraft(setId: string, ver?: string | null): Promise<SetConfirmView> {
  return callOasis<SetConfirmView>("view", { setId, ver });
}

export function validateSetDraft(setId: string, ver: string, applyFrom: string): Promise<SetValidateResult> {
  return callOasis<SetValidateResult>("validate", { setId, ver, applyFrom });
}

export function confirmSetDraft(setId: string, ver: string, rowVersion: number, applyFrom: string, warningsAcknowledged: boolean): Promise<SetConfirmResult> {
  return callOasis<SetConfirmResult>("confirm", { setId, ver, rowVersion, applyFrom, warningsAcknowledged });
}
```

`types.ts` — Interfaces 의 모양 그대로 쓴다(`CheckItem`·`ApplyFromCheck`·`CaseSummary`·`CheckIssue`·`DiffCounts`·`DiffKind` 는 `../ruleConfirm/types` 에서 import).

`ConfirmModal.tsx` — props 에 `titleOf?: (item: string) => string;` 를 더하고 `lineText` 를 `function lineText(w: WarningLine, titleOf: (item: string) => string)` 로 바꿔 `titleOf(w.item)` 를 쓴다. 호출부는 `lineText(w, p.titleOf ?? checkTitle)`. 룰 화면은 바꾸지 않는다.

`page.tsx` — `pages/dme/ruleConfirm/page.tsx` 를 복사해 아래를 바꾼다.

| 원본 | 세트 화면 |
|---|---|
| 머리 주석 "ruleConfirm — 룰 버전 확정…" | "ruleSetConfirm — 룰 세트 버전 확정(D-144 2단계). 구조는 ruleConfirm 과 같다: 왼쪽 DRAFT 목록, 오른쪽 확정 폼·검사 결과 표(4항목 + 적용 순서)·흐름 diff. 입력 계약 변경 카드는 없다. OBJECT_ID = screenId = 'ruleSetConfirm'." |
| `SCREEN_ID = "ruleConfirm"`, `COMPONENT_PATH = "dme/ruleConfirm"` | `"ruleSetConfirm"`, `"dme/ruleSetConfirm"` |
| `./api` 의 `confirmDraft`·`searchDrafts`·`validateDraft`·`viewDraft` | `./api` 의 `confirmSetDraft`·`searchSetDrafts`·`validateSetDraft`·`viewSetDraft` |
| `./checks`·`./ConfirmModal` import | `../ruleConfirm/checks`(`APPLY_FROM_ITEM`·`canConfirm`·`checkStatusLabel`·`splitWarnings`·`toServerDateTime`)·`../ruleConfirm/ConfirmModal` + `./checks` 의 `setCheckTitle`. `contractState` 는 쓰지 않는다 |
| testid 접두 `rc-` | `rsc-` |
| 목록 열 `maruRuleId`·`maruRuleName`·`ruleKind`·`ver`·`ownerId` | `setId`(표지 `rsc-row-${setId}-${ver}`)·`setName`·`ver`(`fmtVer`)·`verKind`·`ownerId` |
| handoff 값 `{maruRuleId, ver}` | `{setId, ver}`(`normVer` 로 정규화) |
| 대상 줄 `` `${view.rule.maruRuleId} 버전 ${fmtVer(version.ver)} · ${view.rule.ruleKind}` `` | `` `${view.set.setId} 버전 ${fmtVer(view.version.ver)} · ${view.set.setName}` `` 와 그 아래 `view.version.ruleIds.join(" → ")` |
| 검사 표의 제목 `checkTitle(item)` | `setCheckTitle(item)`, `<ConfirmModal titleOf={setCheckTitle} …>` |
| 입력 계약 변경 카드(`rc-contract`, `contractWarnings`) | 지운다 |
| row_id diff 표(열 rowId·kind·oldSeq·newSeq·changedVarIds, `vars` 라벨) | 흐름 diff 표 — 열 `key`(노드·선 ID), `kind`(`DIFF_KIND_LABELS`), `before`(`oldValues` 를 `kind`·`ruleId`·`label`·`from→to`·`cond` 순으로 이어 쓴 글), `after`(같은 방식). 기본은 SAME 행을 숨기고 `rsc-diff-show-same` 로 켠다 |
| 확정 성공 뒤 문구 | 같은 문구에서 "룰" 을 "룰 세트" 로 |

diff 한 칸 글을 만드는 함수(`page.tsx` 안):

```ts
function describeDiffSide(v: Record<string, unknown> | null): string {
  if (!v) return "—";
  const parts: string[] = [];
  if (v.kind) parts.push(String(v.kind));
  if (v.ruleId) parts.push(String(v.ruleId));
  if (v.label) parts.push(`「${String(v.label)}」`);
  if (v.from || v.to) parts.push(`${String(v.from ?? "")} → ${String(v.to ?? "")}`);
  if (v.cond) parts.push(`if ${String(v.cond)}`);
  if (v.otherwise === true) parts.push("그 외");
  return parts.join(" · ") || "—";
}
```

`tsup.config.ts:57` 다음 줄: `"pages/dme/ruleSetConfirm/page": "pages/dme/ruleSetConfirm/page.tsx",`.

`page-registry.ts` 는 손으로 고치지 않는다: `cd src/frontend/m-mcm && node scripts/generate-page-registry.mjs` 로 다시 만든다(`"dme/ruleSetConfirm"` 줄이 생긴다).

`ruleSetMng/types.ts` 의 목록 행에 `ver: string | null` 을, `page.tsx` 목록 열에 `{ key: "ver", header: "버전", width: 70, render: (v, row) => <span data-testid={`rsm-ver-${String(row.setId)}`}>{fmtVer(v as string | null)}</span> }` 를 상태 열 앞에 더한다. 상태 라벨 표에 `CREATED: "생성"` 을 더한다(라벨 표가 있으면).

e2e(Playwright, 이 작업에서는 고치기만 하고 Task 13 에서 돌린다):
- `fixtures/mdm-ruleSet-data.sql`: 편집 시나리오가 쓰는 세트(`E2S_CHAIN`·`E2S_FLOW`·`E2S_CATCHSET`·`E2S_IFEND`)에 e2e 담당자 사용자(`mdm-rbac-users.sql` 의 담당자 ID) 소유 DRAFT `2.000` 을 더한다 — `INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, VER_KIND, STATUS, OWNER_ID, RULE_IDS, FLOW_JSON, ROW_VERSION) SELECT MARU_RULE_SET_ID, 2, 'MAJOR', 'DRAFT', '<담당자 ID>', RULE_IDS, FLOW_JSON, 0 FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID IN (…) AND VER = 1;`.
- `mdm-ruleSetEdit.spec.ts`: 저장 요청 단언에 `ver: "2.000"` 을 더하고, 시작 부분에 "기본 선택이 내 DRAFT v2.000 이고 `set-ver-row` 에 보인다" 단계를 둔다. 폐기 단계는 DRAFT 가 있으면 막히므로(MDM006) 폐기 시나리오가 쓰는 세트(`E2S_OLDSET` 외)에는 DRAFT 를 넣지 않는다.
- `mdm-ruleSetMng.spec.ts`: 등록 뒤 편집 화면이 `v1.000 (DRAFT)` 로 열리는지 단언을 더한다.
- `mdm-ruleSetConfirm.spec.ts`(새 파일, `mdm-ruleConfirm.spec.ts` 구조): 담당자로 로그인 → `dme/ruleSetConfirm` 열기 → 목록에서 `E2S_CHAIN 2.000` 고르기 → 적용 시작에 지금보다 1분 뒤 → [검사] → 네 항목 PASSED → [확정] → 대화상자 확인 → `rsc-released` 와 `rsc-closed-previous`("직전 버전 v1.000 의 적용을 닫았습니다").

- [ ] **Step 4: 통과 확인**

Run: `cd src/frontend/m-mdm && rtk proxy pnpm run lint && rtk proxy pnpm run test`
Expected: tsc 오류 0, failed 0

Run: `cd src/frontend/m-mcm && npx tsc --noEmit -p .`
Expected: 오류 0(새 레지스트리 줄이 `@dk-oasis/m-mdm/pages/dme/ruleSetConfirm/page` 를 찾는다 — 찾지 못하면 `cd src/frontend/m-mdm && rtk proxy pnpm run build` 로 dist 를 만든 뒤 다시)

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/frontend/m-mdm/pages/dme/ruleSetConfirm src/frontend/m-mdm/pages/dme/ruleConfirm/ConfirmModal.tsx src/frontend/m-mdm/pages/dme/ruleSetMng/types.ts src/frontend/m-mdm/pages/dme/ruleSetMng/page.tsx src/frontend/m-mdm/tsup.config.ts src/frontend/m-mdm/tests/dme/ruleSetConfirm src/frontend/m-mdm/tests/dme/ruleSetMng/rule-set-mng-page.test.ts src/frontend/m-mcm/lib/generated/page-registry.ts src/frontend/e2e/mdm-ruleSetEdit.spec.ts src/frontend/e2e/mdm-ruleSetMng.spec.ts src/frontend/e2e/mdm-ruleSetConfirm.spec.ts src/frontend/e2e/fixtures/mdm-ruleSet-data.sql
/usr/bin/git -C <worktree> commit -m "feat(m-mdm): 룰 세트 확정 화면과 세트 목록 버전 열을 더한다"
```

---

### Task 12: 문서 — PRD·ADR-0005·화면 설계서·ERD·원천 06

**Files:**
- Modify: `docs/mdm/PRD.md:158`
- Modify: `docs/mdm/adr/0005-rule-set-runs-in-engine.md:72`
- Modify: `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md:106,476,530` (+ §5.1 버튼 목록에 버전 줄)
- Modify: `docs/mdm/erd/06-business-rule.mmd`, `docs/mdm/erd/06-business-rule.sqlite.sql`, `docs/mdm/erd/verify/expected-columns.json`
- Modify(다른 저장소, git 아님): `/Users/jji/project/mdm/docs/design/basic/06-business-rule.md:754,905,922,926,1078`

**Interfaces:**
- Consumes: Task 1~11 의 결정(V18 표 모양, 계약, 화면 testid)
- Produces: 문서만. 시험 없음.

- [ ] **Step 1: PRD·ADR-0005**

`docs/mdm/PRD.md:158` AC-4 를 바꾼다.

```markdown
- AC-4 04·06 버전과 룰 세트 버전은 담당자 확정 없이 RELEASED 가 되지 않고, 확정 시 검사를 하나라도 통과하지 못하면 확정되지 않는다. 02·03·05 는 저장 커밋이 곧 반영이다(룰 세트는 2026-10-02 D-144 2단계부터 버전 단위 — ADR-0006).
```

`docs/mdm/adr/0005-rule-set-runs-in-engine.md:72` 줄을 바꾼다.

```markdown
- 룰 세트 흐름은 저장 즉시 반영된다. 흐름을 바꾸려고 앱을 다시 배포하지 않는다. **(갱신 2026-10-02, ADR-0006 2단계: 저장은 DRAFT 에만 쓰고, 확정한 버전이 apply_from 부터 반영된다. 엔진은 판정 시각의 RELEASED 세트 버전을 `DefinitionLookup.ruleSet(setId, evalTs)` 로 받는다 — 앱 재배포가 필요 없다는 결론은 그대로다.)**
```

- [ ] **Step 2: ruleSetEdit 기능설계서**

- :106(A-TOOL)의 상태 배지 title "버전·승인 없음 — 저장하면 바로 반영된다" 를 "선택 버전의 상태 — 저장은 내 DRAFT 에만, 확정해야 반영된다(D-144)" 로, `row_version N` 은 "선택 버전 행의 row_version" 으로 고친다.
- §2 화면 영역 표에 새 줄을 A-TOOL 위에 더한다.

```markdown
| `A-VER` | 버전 줄(`set-ver-row`, D-144 2단계) | 버전 고르기(`set-ver-select`, `v1.000 (DRAFT)` 형식 — 기본은 내 DRAFT, 없으면 지금 적용 중인 RELEASED, 없으면 가장 큰 버전) · 상태 배지(`VersionStatusBadge`) · 소유자 배지(`DraftLockBadge`) · 읽기 전용 배지(`set-ver-readonly`) · 공통 버전 버튼(`VersionActionBar`): 새 버전(major)(`set-ver-new-major`)·새 버전(minor)(`set-ver-new-minor`)·삭제(`set-ver-delete`)·확정(`set-ver-confirm` → `dme/ruleSetConfirm`)·확정취소(`set-ver-cancel-confirm`)·선점(`set-ver-lock`)·해제(`set-ver-unlock`)·넘기기(`set-ver-handover`). 저장하지 않은 변경·자동 저장 중에는 모두 꺼진다 |
```

- §5.1 버튼 목록에 위 여덟 단추를 action(`copy`·`delete` target VERSION·`delete` target CONFIRM·`lock`·`unlock`·`handover`, 확정은 화면 이동)과 함께 한 줄씩 더한다. 폐기 줄의 요청을 `delete{setId, target:"SET"}` 로, 되살리기를 `restore{setId}` 로 고친다.
- :476 문단을 바꾼다.

```markdown
세트도 룰처럼 버전·DRAFT·소유자를 갖는다(2026-10-02 D-144 2단계, ADR-0006). 저장은 **선택 버전이 내 DRAFT 일 때만** 쓰고(공통 가드 `beginDraftWrite` 가 소유자 MDM003·row_version MDM001·DRAFT MDM002·다른 미적용 MDM007 을 본다), 그 밖에는 읽기 전용이다(배치·색 이동도 저장하지 않는다). 확정은 `dme/ruleSetConfirm` 이 4가지 검사(흐름 구조·참조 룰의 apply_from 시점 RELEASED·순서/순환·테스트 케이스) 뒤에 한다. 운영 판정은 판정 시각의 RELEASED 세트 버전을 쓰고, 디버거·테스트 케이스는 화면에 열린 버전의 흐름을 직접 보낸다. 자동 저장이 MDM002·MDM003 으로 거부되면 자동 저장을 끄고 읽기 전용으로 다시 불러온다. 세트명·설명은 부모 행에 있고 DRAFT 저장과 같은 트랜잭션에서 쓴다. 테스트 케이스는 세트 단위이고 케이스마다 `ROW_VERSION` 을 따로 가진다.
```

- :530(N-9)을 "저장은 DRAFT 버전 행(`TB_MDM_RULE_SET_VER`)과 부모의 세트명·설명만 바꾼다. 배포(07)는 여전히 이번 범위 밖이다(D-144 2단계)" 로 고친다.

- [ ] **Step 3: ERD 문서(이 저장소)**

`docs/mdm/erd/06-business-rule.sqlite.sql` 의 `TB_MDM_RULE_SET` 정의를 V18 의 부모 정의로 바꾸고, 바로 뒤에 V18 의 `TB_MDM_RULE_SET_VER` 정의를 그대로 옮긴다(Task 2 Step 3 의 두 CREATE TABLE 문). `06-business-rule.mmd` 에 엔티티 `TB_MDM_RULE_SET_VER`(키 `MARU_RULE_SET_ID, VER`, 칼럼 VER_KIND·STATUS·OWNER_ID·APPLY_FROM·APPLY_TO·RULE_IDS·FLOW_JSON·ROW_VERSION)와 관계 `TB_MDM_RULE_SET ||--o{ TB_MDM_RULE_SET_VER : "버전(D-144)"` 를 더하고, 부모 엔티티에서 RULE_IDS·FLOW_JSON·ROW_VERSION 칸을 지운다. `verify/expected-columns.json` 의 `TB_MDM_RULE_SET` 칼럼 목록을 `MdmBusinessRuleExpectations`(Task 2)와 같게 고치고 `TB_MDM_RULE_SET_VER` 항목을 더한다(감사 칼럼 포함 순서는 같은 파일의 `TB_MDM_RULE_VER` 항목을 본뜬다).

- [ ] **Step 4: 원천 설계 문서 06(다른 디렉터리, git 아님)**

`/Users/jji/project/mdm/docs/design/basic/06-business-rule.md` 는 git 저장소가 아니다. 고치기 전에 `cp` 로 같은 폴더의 `bak/06-business-rule.md.2026-10-02-phase2` 에 사본을 둔다(`bak/` 폴더가 이미 있다). 고칠 곳:
- :905 결정 상자 끝에 한 줄을 더한다: `> **갱신 2026-10-02(D-144, ADR-0006 2단계).** 룰 세트도 버전 단위다. 저장은 DRAFT 에만 쓰고, 확정한 버전이 apply_from 부터 반영된다. 세트와 룰은 독립이다 — 세트 버전은 룰 버전을 박지 않고, 실행 시각에 유효한 룰 RELEASED 를 쓴다(K1·K2).`
- :922 트리 줄을 `TB_MDM_RULE_SET              룰 세트 부모(ID·이름·설명·상태 CREATED/INUSE/DEPRECATED)` 와 `  └ TB_MDM_RULE_SET_VER      세트 버전(1.000 major / 1.001 minor). 흐름 FLOW_JSON·룰 목록 RULE_IDS. apply_from-apply_to (D-144)` 두 줄로 바꾼다.
- :926 문단 첫 문장 "**룰 세트는 목록일 뿐이다.** … 저장하면 05의 마스터데이터처럼 바로 배포한다. 01 원칙 3의 예외다(05의 마스터데이터와 같다)." 를 "**룰 세트는 흐름 정의를 버전으로 갖는다(D-144).** 버전 행에 흐름(FLOW_JSON)과 펼친 룰 목록(RULE_IDS)을 두고, 룰처럼 DRAFT 를 저장해 확정해야 운영에 반영된다. 01 원칙 3의 예외가 아니다." 로 바꾸고, 같은 문단의 "이것을 받아들이는 대신 세트 버전·승인·머지를 두지 않는다" 를 "세트 버전은 룰 버전을 고정하지 않는다(K2)" 로 고친다.
- :754(룰 세트 등록)의 "TB_MDM_RULE_SET 한 행을 INUSE, 룰 없음으로 만들고" 를 "부모를 CREATED 로, 1.000 MAJOR DRAFT(등록자 소유, 룰 없음)를 만들고" 로.
- :1078 `TB_MDM_RULE_SET` 칼럼 표에서 rule_ids·row_version 줄을 지우고 표 아래에 `TB_MDM_RULE_SET_VER` 표(Task 2 의 칼럼과 뜻)를 더한다. :751·:785·:866·:894·:1321 의 `TB_MDM_RULE_SET.rule_ids` 는 `TB_MDM_RULE_SET_VER.rule_ids` 로 고친다.

- [ ] **Step 5: Commit(이 저장소 파일만)**

```bash
/usr/bin/git -C <worktree> add docs/mdm/PRD.md docs/mdm/adr/0005-rule-set-runs-in-engine.md docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md docs/mdm/erd/06-business-rule.mmd docs/mdm/erd/06-business-rule.sqlite.sql docs/mdm/erd/verify/expected-columns.json
/usr/bin/git -C <worktree> commit -m "docs(mdm): 룰 세트 버전 관리(D-144 2단계)를 PRD·ADR-0005·화면 설계서·ERD 에 반영한다"
```

(원천 06 은 git 밖이라 커밋하지 않는다. 마감 보고에 고친 줄과 사본 위치를 적는다.)

---

### Task 13: 통합 확인

- [ ] **Step 1: 전체 시험**

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning/src/backend && export JAVA_HOME=/opt/homebrew/opt/openjdk@21 && ./gradlew :maru-mdm-engine:test --offline && (cd mdm && ../gradlew :lib:test :api:test --offline)
cd /Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning/src/frontend/m-mdm && rtk proxy pnpm run lint && rtk proxy pnpm run test
python3 /Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning/.claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root /Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning
```

Expected: 모두 통과, OASIS ERROR 0.

- [ ] **Step 2: 남은 옛 계약 찾기**

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning
grep -rn "ruleSet(String setId)\|RuleSetWrites.SetState\|updateVersion(\|set.getRowVersion()\|\"버전·승인 없음" src/backend src/frontend/m-mdm --include="*.java" --include="*.ts" --include="*.tsx"
```

Expected: 출력 없음(이행용 `updateVersion` 은 Task 5 에서 지워졌어야 한다).

- [ ] **Step 3: 화면·e2e 확인** — 워크트리에서 MDM 을 띄울 수 있으면(로컬 기동 사전조건: JDK 21, `TSUP_DTS=0 local-run.sh --mdm -q`, 포털 5100) ego-browser 로 다음을 한 번 돌린다: 룰 세트 편집에서 세트 열기 → 기본 선택 확인 → 새 버전(minor) → 편집 모드에서 노드 하나 옮기고 자동 저장 → [확정] → 확정 화면에서 검사·확정 → 편집 화면을 다시 열어 새 버전이 지금 적용 중인지 확인. 그다음 e2e `mdm-ruleSetEdit.spec.ts`·`mdm-ruleSetMng.spec.ts`·`mdm-ruleSetConfirm.spec.ts` 를 돌린다. 워크트리 기동이 원 작업 트리 서버·포트와 충돌하면 이 단계는 건너뛰고 보고에 적는다. 확인 뒤 연 브라우저 작업 공간을 닫는다.

- [ ] **Step 4: 보고** — 바꾼 범위, 시험 결과, 화면·e2e 확인 여부, 원천 06(git 밖) 수정 위치, 남은 일(3단계 레이아웃·헤더, D-135 의 D-136 모델 반영과 SDD, 마스터코드 `reg`→`copy` 권한 이행)을 정리한다.

---

### Task 14: D-135 하위 세트 스펙 갱신 (마지막 작업) — C-D2·§14 와 버전 도입으로 틀린 문장

**Files:**
- Modify: `docs/superpowers/specs/2026-10-01-rule-set-flow-subset-call-design.md:20,25,40-49,151-152,186,257,275`

**Interfaces:**
- Consumes: Task 4(엔진 `ruleSet(setId, evalTs)`), Task 2(세트 버전 표), Task 13 통합 확인 통과, 스펙 §2 표 마지막 줄·§6 후속("2단계 병합 뒤 D-135 스펙 C-D2 를 고친다")
- Produces: 문서만. 범위는 사용자 지시(C-D2·§14) + 버전 도입으로 틀린 말이 된 문장(J13). **D-136 모델(합류 없애기) 반영은 이 작업 밖이다** — 그 반영과 SDD 착수는 별도 작업이다.

이미 반영된 부분: 다른 세션이 이 계획의 첫 판(4008ece3)을 따라 `9f5f065f` 에서 이 작업의 대부분(C-D2·§0·§1.1·§8·§14)을 고쳤다. 착수 때 Step 2 의 grep 과 아래 목록으로 남은 곳만 고친다. 계획 갱신 시점(cca5093c 뒤)에 남아 있던 곳은 §3 표(:72)의 "조회기 `ruleSet(setId)` 로 하위 세트를 읽는다" 하나다 — "조회기 `ruleSet(setId, evalTs)` 로 판정 시각의 RELEASED 하위 세트 버전을 읽는다" 로 고친다.

- [ ] **Step 1: 고친다**

- :20(§0 두 번째 bullet) "하위 세트는 호출 시점에 저장된 현재 행을 쓰고, 사용 중(INUSE)인 세트만 부른다." → "하위 세트는 **판정 시각에 유효한 RELEASED 버전**을 쓰고(2026-10-02 D-144 2단계, 세트 버전 관리), 폐기(DEPRECATED)하지 않은 세트만 부른다."
- :25 제외 목록에서 "하위 세트 버전 고정," 을 지운다.
- §1.1(:40-49): 제목을 "`CALL_SET_IDS` 칸(세트 버전 행)" 으로 바꾸고, 첫 문장의 `TB_MDM_RULE_SET` 을 `TB_MDM_RULE_SET_VER`(D-144 2단계 V18 이 만든 세트 버전 표 — 흐름이 버전마다 다르므로 부르는 세트 목록도 버전마다다)로 바꾼다. 마이그레이션 줄의 "`V16__add_rule_set_call_set_ids.sql`(2026-10-01 기준 mdm sqlite 마지막 번호 V15)" 를 "번호는 착수 시 `flyway-migration-add` 로 다시 정한다(V16·V17·V18 은 이미 쓰였다)" 로, "칼럼 순서 불변식 … `FLOW_JSON` 바로 뒤" 와 "`MdmRuleSet` 엔티티, `RuleSetWrites.update`(UPDATE 문에 칸 추가), `RuleSetWrites.SetState`" 를 "`MdmRuleSetVer` 엔티티, `RuleSetWrites.updateDraft`" 로 고친다. 재생성 순서는 V17·V18 의 `_BAK` 경유 순서를 따른다고 한 줄 더한다.
- §6.1·§6.3 의 "INUSE 부모" 는 "폐기하지 않은 부모의 RELEASED 버전(저장 기준 시각 이후 유효한 것)" 으로, §6.2 의 "INUSE 부모가 S 를 부르면 폐기를 거부한다" 는 그대로 두되 "부모" 를 "부모의 유효한 RELEASED 버전" 으로 고친다.
- §8(:186) "`StoredDefinitionLookup.ruleSet` 에 인스턴스 안 캐시를 둔다" 를 "`StoredDefinitionLookup.ruleSet(setId, evalTs)` 는 D-144 2단계에서 (세트, 판정 시각) 캐시를 이미 갖는다. 하위 세트도 같은 `evalTs` 로 고른다" 로. `calledFlows` 설명의 "저장된 `FLOW_JSON`" 은 "판정 시각의 RELEASED 버전 `FLOW_JSON`" 으로.
- :257 C-D2 행을 바꾼다.

```markdown
| C-D2 | 하위 세트는 판정 시각에 유효한 RELEASED 버전, 폐기 아닌 세트만(2026-10-02 갱신) | 세트도 버전 단위가 되었다(D-144, ADR-0006 K1). 부모와 하위 세트가 같은 판정 시각으로 버전을 고르므로 과거 판정을 재현할 수 있다. 하위 세트 버전을 부모에 박지 않는다(K1 — 참조는 ID 만) |
```

- §14(:275 근처) 목록에서 "- 하위 세트 버전 고정" 줄을 지운다.
- 문서 머리(작성일 줄 아래)에 한 줄 더한다: `- 갱신 2026-10-02: C-D2·§0·§1.1·§6·§8·§14 를 룰 세트 버전 관리(D-144 2단계, docs/superpowers/plans/2026-10-02-mdm-versioning-phase2-rule-set.md)에 맞췄다. D-136 모델 반영은 따로 한다.`

- [ ] **Step 2: 확인**

Run: `grep -n "현재 행\|버전 고정\|V16__add_rule_set_call_set_ids\|RuleSetWrites.SetState\|ruleSet(setId)" docs/superpowers/specs/2026-10-01-rule-set-flow-subset-call-design.md`
Expected: 출력 없음

- [ ] **Step 3: Commit**

```bash
/usr/bin/git -C <worktree> add docs/superpowers/specs/2026-10-01-rule-set-flow-subset-call-design.md
/usr/bin/git -C <worktree> commit -m "docs(mdm): 하위 세트 스펙의 C-D2·§14 를 판정 시각 RELEASED 세트 버전으로 고친다"
```

---

## 자기 검토

**스펙 대응(§3·§4·§6 과 사용자 지시 목록):**

| 요구 | 작업 |
|---|---|
| V18: FLOW_JSON·RULE_IDS·ROW_VERSION 을 버전 표로, STATUS 에 CREATED, 1.000 MAJOR RELEASED(APPLY_FROM=2000-01-01 일괄, APPLY_TO=9999-12-31), V15 FK, 이행 한계 | Task 2(SQL 머리 주석에 한계), Task 3(이행) |
| V17 교훈(`_BAK` 경유, RENAME 없음) | Global Constraints, Task 2 Step 3 |
| `VersionTarget.RULE_SET`, 테이블 등록부 | Task 1 |
| 확정 검사 SPI·DRAFT 삭제 SPI | Task 7(`RuleSetConfirmCheck`), Task 6(`RuleSetDraftDeletionHook`) |
| 새 버전 major/minor·삭제·선점·해제·넘기기·확정·확정취소 | Task 6(서버), Task 8(확정), Task 10(버튼) |
| 흐름도 자동 저장은 내 DRAFT 에만, 아니면 읽기 전용, 버전 선택·VersionActionBar | Task 5(서버 `editable`·저장 가드), Task 10(화면) |
| 확정 화면 `dme/ruleSetConfirm` 과 검사 4가지(케이스 실패 ERROR) | Task 7·8·11 |
| `RuleSetOrderCheck` 대상 변경, ADR-0002 D8-10 확장 | Task 9, Task 7 `ruleCancelConfirmBlocksSetConfirm` |
| `DefinitionLookup.ruleSet(setId, evalTs)`, StoredDefinitionLookup 판정 시각 RELEASED, 시험 실행은 DRAFT 주입, engine-contract.md | Task 4 |
| 권한 시드(copy/delete/lock/unlock/handover/confirm) | Task 6(ruleSetEdit BPMN·어휘 시험 — 시드 변경 불필요 확인), Task 8(`ruleSetConfirm` OBJECT·메뉴·RBAC) |
| D-135 C-D2·§14 | Task 14(마지막 작업, 통합 확인 뒤) |
| 스펙 §8 오류 처리(MDM006·minor 999·소유자 아님·apply_from 순서·참조 룰 RELEASED 없음·판정 시각 세트 없음·동시 저장) | Task 6(MDM006·minor), Task 5(MDM003·MDM001), Task 8(apply_from 순서·MDM010), Task 4(SET_NOT_FOUND 문구), Task 7(RULES_RELEASED) |
| 스펙 §11 검증(apply_from 경계 직전·직후, K2) | Task 4 `세트는_판정_시각에_…`(2026-04-30 23:59:59 / 05-01 00:00:00), Task 7 `orderUsesRuleVersionsAtApplyFrom`(룰 새 버전이 세트 안에서 apply_from 부터) |
| 스펙 §9 문서(engine-contract.md, PRD AC-4, ADR-0005, 원천 06) | Task 4·9·12 |

**자리표시자 검사:** "TBD·TODO·나중에" 없음. 코드 단계는 코드 블록을 둔다. 원본 파일을 복사해 치환하는 두 곳(Task 8 `RuleSetConfirmBpmnActionTest`·`ruleSetConfirm.bpmn`, Task 11 화면)은 바꿀 것을 표로 모두 적었다. Task 8 `validate`·`buildView` 는 룰 쪽 원본의 줄 범위를 가리키고 달라지는 칸을 적었다. Task 11 화면 시험은 전문을 적었다.

**이름 일관성:** `RuleSetVersionQueries.versions/versionsOf/find/display/members/flow`, `RuleVersions.currentOrLatest/releasedValidFrom`, `RuleSetWrites.updateDraft/updateHeader/deprecate/restore/status`, `RuleSetVersionRequest.TARGET_SET/VERSION/CONFIRM`, `RuleSetConfirmChecks.report(VersionRef, LocalDateTime)`, `RuleSetConfirmReport.SET_RULE_NOT_RELEASED`, `RuleSetRunner.Session.traceDefinition(label, def, record, ts)`, `DmeTestSupport.ruleSet/ruleSetVersion/ruleSetDraft/ruleSetFlow/setVerValue`, 화면 `newSetVersion/deleteSetDraft/cancelSetConfirm/lockSetVersion/unlockSetVersion/handoverSetVersion`, `state.selectVer/versionWrite` 를 작업 사이에서 같은 서명으로 썼다.

**Review Focus 대응:** 1 → Task 10 `auto-save-stale.test.ts`, 2 → Task 10 `version-row.test.ts` 2·3·4(새 세트 CREATED 경로는 8), 3 → Task 5 `noVersionsOpensEmptyReadOnly`·Task 6 `deleteOnlyDraftLeavesNoVersion`, 4 → Task 9 `RuleLedgerChecksTest.reportsOncePerSetVersionWithLabel`, 5 → Task 7 `ruleCancelConfirmBlocksSetConfirm`.
