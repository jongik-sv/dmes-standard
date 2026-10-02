# MDM 버전 관리 3단계 — 레이아웃·헤더 버전 관리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전문·헤더 레이아웃에 룰과 같은 DRAFT·소유자·확정·확정취소 버전 흐름을 두고, 총 길이·내보내기·샘플 전문을 "시각 T 의 전문 버전 + 시각 T 의 헤더 버전" 합성으로 만든다.

**Architecture:** V19 가 `TB_MDM_LAYOUT_VER` 를 §4.1 표준 칼럼의 버전 테이블로 다시 만들고 항목·헤더 구성·상수 행의 키에 `VER` 를 넣는다. 공통 버전 엔진(`VersionRowStore`·`DefaultVersionStateService`·`DefaultDraftOwnershipService`·`DefaultVersionWriteGuard`)에 `VersionTarget.LAYOUT` 을 등록하고, 저장은 내 DRAFT 의 행에만 쓴다. 자동 +1(`LayoutVersioner`, I15)과 헤더 연쇄 재계산(`LayoutWriter.recalculateUsers`, I18)은 없앤다. 참조(전문→헤더, EAI→헤더)는 ID 만 두고 `LayoutComposer` 가 시각 T 에 유효한 RELEASED 버전을 골라 계약 스냅샷(`MdmLayoutSnapshot`)을 합성한다. 직렬화기·파서는 순수 함수로 두고 T 는 합성기(새 계약 `MdmLayoutSnapshotResolver`)에 넘긴다. 변경 분류(`LayoutChangeClassifier`)는 확정 때 부르고 결과·본문 스냅샷을 버전 행에 남긴다. 확정 화면 `dmb/layoutConfirm` 은 전문·헤더 공용이다.

**Tech Stack:** Java 21, Spring Boot, Hibernate/JPA, Flyway(SQLite), OASIS BPMN, JUnit 5 / React 19, Next.js, Mantine 9, ag-grid 33, vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-10-02-mdm-object-versioning-design.md` (§3 K1~K7, §4, §7, §8, §11). 형식 본보기: `docs/superpowers/plans/2026-10-02-mdm-versioning-phase1-rule-major-minor.md`.

## Global Constraints

- 작업 위치: 워크트리 `/Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning`, 브랜치 `feat/mdm-versioning`. 원 작업 트리(`/Users/jji/project/dmes-standard`)의 파일·git 은 건드리지 않는다.
- git 은 `/usr/bin/git -C /Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning ...` 로 부른다(경로를 셸 변수로 만들지 않는다). `git stash` 금지. 같은 워크트리에 다른 에이전트가 있으므로 커밋은 자기 파일 경로만 add 하고, `index.lock` 으로 실패하면 잠시 뒤 다시 한다. 아래 `<worktree>` 는 위 절대 경로다.
- **선행 조건(2단계):** 2단계(룰 세트)가 먼저 병합되어 있다 — `VersionTarget.RULE_SET("TB_MDM_RULE_SET_VER", 3)`, `DefaultVersionTableRegistry` 의 `RULE_SET` 분기, `V18__rule_set_version.sql`, `MdmSharedContractMigrationTest` 버전 집합의 `"18"` 이 있다. 이 계획은 그 위에 `LAYOUT` 과 `V19` 를 더한다. 2단계가 `VersionRowStore`·`VersionTableSpec` 시그니처를 바꿨으면 그 모양을 따른다.
- 버전 칼럼 `VER NUMERIC(7,3)`, 종류 `VER_KIND VARCHAR(20) NOT NULL` CHECK `IN ('MAJOR','MINOR')`. 첫 버전 `1.000` MAJOR. 번호는 `VersionNumbers.next(max, kind)`(1단계).
- 버전 비교는 `compareTo`/`VersionNumbers.same`, 해시는 `stripTrailingZeros`, 저장·바인딩은 `setScale(3)`, 읽기는 문자열 경유. SQL 의 `ORDER BY VER`·`MAX(VER)` 로 버전을 고르지 않는다(SQLite 는 1.000 을 INTEGER, 1.001 을 REAL 로 저장한다).
- 화면·DTO 계약의 레이아웃 업무 버전은 문자열 `"1.000"`(`VersionNumbers.plain`), 표시 `v1.000`(`fmtVer`). 레이아웃 계열 DTO 의 감사 카운터는 `auditVer` 로 부른다. 기존 DTO 필드 `ver`(감사 카운터 `Long`)는 업무 버전 `String ver` 로 뜻이 바뀐다. DRAFT 동시 저장 충돌은 `ROW_VERSION`(`rowVersion`)으로 막는다(`VersionWriteGuard.beginDraftWrite`).
- 버전 엔진의 레이아웃 객체 ID 는 `String.valueOf(LAYOUT_ID)` 이다(`VersionRef.objectId`).
- 시각 T(`asOf`)·적용 시각은 KST 문자열 `yyyy-MM-dd HH:mm:ss`. 비면 서버 `Clock`(MdmClockConfig, KST)의 지금. 적용 구간은 `[APPLY_FROM, APPLY_TO)` — `APPLY_FROM == T` 이면 적용됨.
- 저장 오프셋 기준(D-144 3단계): 헤더 항목 `OFFSET` 은 헤더 안 상대값(그대로), **전문 본문 항목 `OFFSET` 은 본문 시작 기준 상대값**(바뀜). 계약 스냅샷(`MdmLayoutSnapshot.items[*].offset`)은 지금처럼 메시지 절대값이다(F23) — 합성기가 T 시점 헤더 길이 합을 더한다.
- 전문 상수 재정의(`TB_MDM_LAYOUT_CONST`)의 대상은 **헤더 항목 물리명**(`HEADER_COLUMN_PHYS`)이다. 화면·요청은 지금처럼 `HEADER_SEQ` 를 주고 받으며, 서버가 T 시점 헤더 버전으로 SEQ↔물리명을 바꾼다.
- 레이아웃 테이블에는 CASCADE 를 쓰지 않는다(V4 불변 규칙 11). DRAFT 삭제 정리는 SPI 가 CONST → HEADER → ITEM 순으로 지운다.
- 마이그레이션은 V17 교훈대로 `ALTER TABLE ... RENAME` 을 쓰지 않는다 — `_BAK` 임시 표에 복사 → 옛 자식 → 옛 부모 순 DROP → 최종 이름으로 새 표 생성 → 복사 → `_BAK` DROP. PRAGMA 를 쓰지 않는다.
- 권한: `MdmPermissions.MATRIX` 와 `DataInitializer.seedMdmObjectRbac` 의 DMB 행을 `MDM_STD_ADMIN → PERM_MDM_EDIT`(그대로), `MDM_STEWARD → PERM_MDM_CONFIRM`(READ 에서 바꿈)으로 둔다. 새 버전(`copy`)·등록(`save` 신규)은 담당자 역할을 요구하지 않는다(소유자 = 만든 사람). 선점(`lock`)·확정(`confirm`)은 공통 엔진대로 담당자만 한다. 표준 관리자가 만든 DRAFT 는 담당자에게 넘겨(`handover`) 확정한다.
- EAI(`TB_MDM_EAI`)는 버전 대상이 아니다. 헤더 DRAFT 저장이 공유 EAI 행으로 운영·남의 편집을 바꾸지 않게 다음을 지킨다: ① 이미 있는 EAI 의 인코딩·패딩 변경은 그 EAI 를 쓰는 전문 버전이 하나라도 있으면 L11 로 거부한다, ② 헤더가 원하는 EAI 연결은 헤더 **버전 행의 `EAI_CODE`** 에만 저장하고 `TB_MDM_EAI.HEADER_LAYOUT_ID` 는 헤더 **확정** 때(같은 트랜잭션) 바꾼다, ③ 새 EAI 행 등록은 바로 쓰되 `HEADER_LAYOUT_ID` 는 비워 둔다(확정 때 연결), ④ 전문 저장의 EAI 표준 헤더 끼움(I14)은 그 헤더에 저장 시각 T 의 RELEASED 가 있을 때만 하고, 확정 검사(`buildStored`)는 끼우지 않고 저장된 구성 그대로 검사한다.
- 백엔드 시험은 SQLite 만, 도커 금지. `export JAVA_HOME=/opt/homebrew/opt/openjdk@21`. mdm 시험은 `cd <worktree>/src/backend/mdm && ../gradlew ... --offline`.
- 프런트 시험은 `cd <worktree>/src/frontend/m-mdm && rtk proxy pnpm run test`(전체), 타입 검사 `rtk proxy pnpm run lint`.
- Task 2 커밋부터 Task 5 커밋 전까지는 V19 와 옛 엔티티가 어긋나 mdm `:api:test` 전체가 깨진다(1단계 Task 2~5 와 같은 사정). 그 사이 Task 는 지정한 시험만 돌린다. Task 5 끝에서 `:lib:test :api:test` 전체가 녹색이어야 한다.
- Flyway 번호는 착수 때 `flyway-migration-add` 스킬로 확인한다. 이 계획은 V19 로 적는다. **번호 변경(2026-10-02, dev 통합 Task 16a):** 메타 캐시 V20(`create_mdm_meta_rev`)이 dev 에 먼저 들어가 `V19__layout_version.sql` 을 `V21__layout_version.sql` 로 옮겼다(outOfOrder=false). 아래 본문의 V19 는 V21 로 읽는다(`MdmLayoutVersionV19MigrationTest` 는 클래스 이름만 그대로이고 목표 버전은 20 → 21).
- 커밋 메시지는 Conventional Commits(`type(scope): 한국어 subject`), 끝에 빈 줄 뒤 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **헤더 확정 apply_from 경계의 직렬화** — 헤더 v2 를 `2026-07-01 00:00:00` 에 확정했을 때 T=`2026-06-30 23:59:59` 는 헤더 v1, T=`2026-07-01 00:00:00` 은 헤더 v2 로 합성해야 한다(구간 `[from, to)`). 전문 버전은 그대로인데 총 길이·바이트가 T 에 따라 달라지는 것이 목적 3 의 핵심이다. Task 9 에 경계 직전·직후 시험을 둔다.
2. **판정 시각에 RELEASED 헤더가 없을 때** — 쌓인 헤더의 첫 확정 apply_from 보다 이른 T, 또는 아직 확정되지 않은 새 헤더만 쌓은 전문을 합성하면 지금 조립기처럼 헤더 길이 0 으로 조용히 만들면 안 된다. 대상 헤더 ID·시각이 든 오류여야 한다(스펙 §8). Task 4 에 시험을 둔다.
3. **이미 데이터가 든 로컬 DB 에 V19 적용** — 엔티티가 쓴 `C_AT`(epoch millis INTEGER)와 샘플이 쓴 `C_AT`(TEXT)가 섞이고, EAI↔레이아웃 순환 FK 가 있고, 이력 2건 이상인 전문이 있다. 행이 사라지거나 FK 위반으로 실패하면 안 된다. Task 2 에 데이터 보존·`PRAGMA foreign_key_check` 시험을 둔다.
4. **헤더 항목 순서 변경·CONST→AUTO 변경 뒤 전문 재정의** — 재정의는 물리명으로 짝지어져 순서 변경에는 그대로 따라가야 하고, 대상 항목이 없어지거나 CONST 가 아니게 되면 헤더 확정 화면이 전문별로 "재정의가 적용되지 않음" 경고를 보여야 한다(조용히 기본값으로 나가지 않는다). Task 8 에 시험을 둔다.
5. **minor 레이아웃 버전(1.001)의 화면 왕복** — 버전 이력 행 선택·확정 화면 인계(`openMdmPage`)·내보내기에서 `"1.001"` 이 숫자로 바뀌어 `1` 이나 `1.000` 으로 잘리면 안 된다. Task 12·14 에 시험을 둔다.
6. **헤더 DRAFT 가 EAI 를 주장할 때** — 담당자 A 가 새 헤더 DRAFT 에 EAI `G1` 을 걸어 저장해도, 다른 사람의 `G1` 전문 저장은 그대로 받아들여지고 헤더 구성이 바뀌지 않아야 한다(I14 가 확정 안 된 헤더를 끼워 L09 로 막으면 목적 1 이 깨진다). Task 5 에 시험, Task 7 에 확정 때 연결 이동 시험을 둔다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| Modify `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/version/VersionTarget.java` | `LAYOUT("TB_MDM_LAYOUT_VER", 3)` |
| Modify `.../common/version/DefaultVersionTableRegistry.java` | `LAYOUT` 명세 |
| Modify `.../common/version/VersionRowStore.java:221-225` | 객체 ID 를 문자열로 읽는다(INTEGER ID) |
| Create `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V19__layout_version.sql` | 레이아웃 5표 재생성·이행 |
| Modify `.../entity/MdmLayout.java`, `MdmLayoutVer.java`, `MdmLayoutVerId.java`, `MdmLayoutItem.java`, `MdmLayoutItemId.java`, `MdmLayoutHeader.java`, `MdmLayoutHeaderId.java`, `MdmLayoutConst.java`, `MdmLayoutConstId.java` | 버전 키·표준 칼럼·`AUD_VER` |
| Create `.../dmb/layout/LayoutKey.java`, `LayoutVersions.java`, `LayoutTimes.java` | 버전 키, 버전 고르기 규칙, T 해석 |
| Modify `.../dmb/layout/LayoutVersionStore.java`, `LayoutQueries.java`, `LayoutWriter.java`, `LayoutRows.java`, `LayoutDraft.java`, `LayoutDraftBuilder.java`, `LayoutSnapshotAssembler.java`, `LayoutSnapshotJson.java`, `LayoutRejections.java`, `LayoutIssueCode.java` | 버전 키 읽기·쓰기, T 기준 검사 |
| Create `.../dmb/layout/LayoutComposer.java`, `LayoutBodySnapshot.java`, `LayoutLengthRules.java` | 시각 T 합성, 본문 스냅샷, MSG_LENGTH 용량 |
| Create `.../contract/layout/MdmLayoutSnapshotResolver.java` | 계약: `(layoutId, T)` → 스냅샷 |
| Modify `.../contract/layout/MdmLayoutSnapshot.java`, `MdmLayoutHeaderRef.java`, `src/backend/mdm/lib/src/main/resources/com/dongkuk/dmes/mdm/contract/layout/layout-snapshot.schema.json` | `layoutVersion` 소수 버전, 헤더 버전 칸 |
| Delete `.../dmb/layout/LayoutVersioner.java` | I15·I18 폐지 |
| Create `.../dmb/layout/LayoutVersionService.java`, `LayoutDraftDeletion.java` | 새 버전·삭제·확정취소·선점·해제·넘기기, DRAFT 삭제 SPI |
| Create `.../dmb/layout/confirm/LayoutConfirmChecks.java`, `LayoutConfirmCheck.java`, `LayoutConfirmReport.java`, `LayoutHeaderImpact.java` | 확정 검사·영향도 |
| Create `.../dmb/layoutConfirm/service/LayoutConfirmService.java`, `.../dmb/layoutConfirm/dto/*.java`, `src/backend/mdm/api/src/main/resources/services/dmb/layoutConfirm.bpmn` | 확정 화면 서비스 |
| Modify `.../dmb/layoutMng/service/LayoutMngService.java`, `.../dmb/headerMng/service/HeaderMngService.java`, `.../dmb/layoutMng/dto/*.java`, `.../dmb/headerMng/dto/*.java`, `services/dmb/layoutMng.bpmn`, `services/dmb/headerMng.bpmn` | DRAFT 저장, 버전 액션, T |
| Create `.../dmb/layoutMng/dto/LayoutVersionRequest.java`, `LayoutVersionResult.java` | 버전 액션 DTO(두 화면 공용) |
| Modify `.../dmb/layout/LayoutImpactFinder.java`, `LayoutItemReferenceSpi.java` | RELEASED(현재·미래)·DRAFT 구분 |
| Modify `.../contract/security/MdmPermissions.java`, `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` | DMB 담당자 CONFIRM, layoutConfirm 메뉴 |
| Modify `src/backend/mdm/sample/mdm-local-sample.sql`, `src/frontend/e2e/fixtures/mdm-layout-m201.sql` | V19 모양 |
| Modify `src/frontend/m-mdm/pages/dmb/layoutMng/**`, `pages/dmb/headerMng/**`, `src/layout/snapshot-export.ts` | 버전 선택·T·VersionActionBar |
| Create `src/frontend/m-mdm/pages/dmb/layoutConfirm/{page.tsx,api.ts,types.ts,checks.ts}` | 확정 화면 |
| Modify `src/frontend/m-mdm/tsup.config.ts`, `src/frontend/m-mcm/lib/generated/page-registry.ts`(생성기) | 새 화면 등록 |
| Modify `docs/mdm/adr/0006-object-versioning-major-minor.md`, `docs/mdm/decisions.md`, `docs/guide/FrontEnd/Local-Rules.md` | 결정 기록 |

---

### Task 1: 공통 엔진에 LAYOUT 대상 등록과 INTEGER 객체 ID 확인

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/version/VersionTarget.java:9-10`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/version/DefaultVersionTableRegistry.java:23-28`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/version/VersionRowStore.java:217-225`
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/version/VersionFixtureTables.java` (`LAYOUT_SPEC`, INTEGER ID 표)
- Test (Create): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/version/VersionRowStoreIntegerIdSqliteTest.java`
- Test: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/version/VersionContractTest.java` (대상 목록·scale 단언이 있으면 `LAYOUT` 3 을 더한다)

**Interfaces:**
- Consumes: 2단계의 `VersionTarget.RULE_SET`, 레지스트리 `RULE_SET` 분기
- Produces:
  - `VersionTarget.LAYOUT` — `versionTable() == "TB_MDM_LAYOUT_VER"`, `versionScale() == 3`
  - `DefaultVersionTableRegistry.spec(LAYOUT) == new VersionTableSpec("TB_MDM_LAYOUT_VER", "LAYOUT_ID", "VER", "TB_MDM_LAYOUT", "LAYOUT_ID", "AUD_VER", "VER")`
  - `VersionRowStore` 가 INTEGER 객체 ID 표에서도 `VersionRow.ref().objectId()` 를 `"7"` 같은 문자열로 돌려준다
  - 시험용 `VersionFixtureTables.LAYOUT_SPEC`(표 `TB_MDM_TC_LAYOUT_VER`/`TB_MDM_TC_LAYOUT`, ID 칼럼 `LAYOUT_ID INTEGER`)

- [ ] **Step 1: 실패하는 시험 작성** — 스펙 §4.2 "레이아웃 ID 는 INTEGER 이므로 SQLite 타입 친화도로 비교되는지 시험으로 확인" 을 고정한다. 문자열 `"7"` 바인딩이 INTEGER 칼럼과 같다고 비교되는지(친화도), 읽기 쪽 `(String) row[0]` 캐스팅이 깨지지 않는지 모든 `VersionRowStore` 연산으로 본다.

`VersionFixtureTables` 에 더한다:

```java
    /** 3단계 — 객체 ID 가 INTEGER 인 대상(레이아웃)의 친화도 확인용. */
    public static final VersionTableSpec LAYOUT_SPEC = new VersionTableSpec(
            "TB_MDM_TC_LAYOUT_VER", "LAYOUT_ID", "VER", "TB_MDM_TC_LAYOUT", "LAYOUT_ID", "AUD_VER", "VER");

    /** INTEGER 객체 ID 픽스처 두 표(SQLite). {@link #sqliteDdl()} 과 따로 둔다 — 기존 키트 상속 시험의 스키마를 바꾸지 않는다. */
    public static List<String> integerIdSqliteDdl() {
        return List.of(
                parent("TB_MDM_TC_LAYOUT", "LAYOUT_ID", "INTEGER", "TEXT"),
                version("TB_MDM_TC_LAYOUT_VER", "LAYOUT_ID", "INTEGER", "NUMERIC(7,3)", "TEXT"));
    }

    public static void clearIntegerId(JdbcTemplate jdbc) {
        jdbc.update("DELETE FROM TB_MDM_TC_LAYOUT_VER");
        jdbc.update("DELETE FROM TB_MDM_TC_LAYOUT");
    }
```

시험:

```java
package com.dongkuk.dmes.mdm.common.version;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** D-144 3단계 — 객체 ID 가 INTEGER 인 버전 표에서 공통 저장소의 모든 연산이 문자열 ID 로 동작한다(스펙 §4.2). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class VersionRowStoreIntegerIdSqliteTest extends AbstractMdmSharedDbTest {

    private static final AuditStamp STAMP = new AuditStamp("kim", "TEST", "TEST", Instant.parse("2026-06-15T00:00:00Z"));
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 15, 9, 0, 0);

    @Autowired EntityManager em;
    @Autowired MdmTemporalBinder temporal;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager txm;

    private VersionRowStore store;
    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        VersionFixtureTables.integerIdSqliteDdl().forEach(jdbc::execute);
        VersionFixtureTables.clearIntegerId(jdbc);
        store = new VersionRowStore(em, target -> VersionFixtureTables.LAYOUT_SPEC, temporal);
        tx = new TransactionTemplate(txm);
        jdbc.update("INSERT INTO TB_MDM_TC_LAYOUT (LAYOUT_ID, STATUS, VER) VALUES (7, 'CREATED', 0)");
        jdbc.update("INSERT INTO TB_MDM_TC_LAYOUT_VER (LAYOUT_ID, VER, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, ROW_VERSION) "
                + "VALUES (7, 1.000, 'RELEASED', NULL, '2026-01-01 00:00:00', '9999-12-31 00:00:00', 0)");
        jdbc.update("INSERT INTO TB_MDM_TC_LAYOUT_VER (LAYOUT_ID, VER, STATUS, OWNER_ID, ROW_VERSION) "
                + "VALUES (7, 1.001, 'DRAFT', 'kim', 0)");
    }

    private static VersionRef ref(String ver) {
        return new VersionRef(VersionTarget.LAYOUT, "7", new BigDecimal(ver));
    }

    @Test
    void findAndFindAllReturnStringObjectId() {
        List<VersionRow> rows = tx.execute(s -> store.findAll(VersionTarget.LAYOUT, "7"));
        assertThat(rows).hasSize(2);
        assertThat(rows).allSatisfy(r -> assertThat(r.ref().objectId()).isEqualTo("7"));
        VersionRow draft = tx.execute(s -> store.find(ref("1.001")).orElseThrow());
        assertThat(draft.ref().ver()).isEqualByComparingTo("1.001");
        assertThat(draft.status()).isEqualTo("DRAFT");
    }

    @Test
    void casWritesMatchIntegerKeyFromStringBinding() {
        assertThat(tx.execute(s -> store.casBumpRowVersion(ref("1.001"), 0, STAMP))).isEqualTo(1);
        assertThat(tx.execute(s -> store.casSetOwner(ref("1.001"), 1, "lee", false, STAMP))).isEqualTo(1);
        assertThat(tx.execute(s -> store.casConfirm(ref("1.001"), 2, LocalDateTime.of(2026, 7, 1, 0, 0), "lee", NOW, STAMP)))
                .isEqualTo(1);
        assertThat(tx.execute(s -> store.closeApplyTo(ref("1.000"), LocalDateTime.of(2026, 7, 1, 0, 0), STAMP))).isEqualTo(1);
        assertThat(tx.execute(s -> store.casCancelConfirm(ref("1.001"), 3, STAMP))).isEqualTo(1);
        assertThat(tx.execute(s -> store.reopenApplyTo(ref("1.000"), STAMP))).isEqualTo(1);
        assertThat(tx.execute(s -> store.casDeleteDraft(ref("1.001"), 4))).isEqualTo(1);
        assertThat(tx.execute(s -> store.markParentInUse(VersionTarget.LAYOUT, "7", STAMP))).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT STATUS FROM TB_MDM_TC_LAYOUT WHERE LAYOUT_ID = 7", String.class)).isEqualTo("INUSE");
        assertThat(jdbc.queryForObject("SELECT APPLY_TO FROM TB_MDM_TC_LAYOUT_VER WHERE LAYOUT_ID = 7 AND VER = 1.000", String.class))
                .isEqualTo("9999-12-31 00:00:00");
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd <worktree>/src/backend/mdm && export JAVA_HOME=/opt/homebrew/opt/openjdk@21 && ../gradlew :api:test --tests '*VersionRowStoreIntegerIdSqliteTest' --offline`
Expected: 컴파일 실패(`VersionTarget.LAYOUT` 없음).

- [ ] **Step 3: 구현**

`VersionTarget`(2단계가 넣은 `RULE_SET` 뒤에):

```java
    MASTER_CODE("TB_MDM_CODE_VER", 3),
    BUSINESS_RULE("TB_MDM_RULE_VER", 3),
    RULE_SET("TB_MDM_RULE_SET_VER", 3),
    LAYOUT("TB_MDM_LAYOUT_VER", 3);
```

javadoc 에 "LAYOUT 은 전문·헤더가 같은 표를 쓴다(스펙 §4.2 — 헤더 대상을 따로 두지 않는다)" 한 줄을 더한다.

`DefaultVersionTableRegistry` switch:

```java
            case LAYOUT -> new VersionTableSpec(target.versionTable(), "LAYOUT_ID", "VER",
                    "TB_MDM_LAYOUT", "LAYOUT_ID", AUDIT_COUNTER, PARENT_AUDIT_COUNTER);
```

`VersionRowStore.selectColumns` — 객체 ID 도 문자열로 읽는다(INTEGER 칼럼은 `Long` 으로 와 `(String) row[0]` 이 `ClassCastException`):

```java
    private static String selectColumns(VersionTableSpec spec) {
        return "SELECT CAST(" + spec.objectIdColumn() + " AS VARCHAR(40)), CAST(" + spec.versionColumn() + " AS VARCHAR(40)), "
                + STATUS + ", " + OWNER_ID + ", "
                + APPLY_FROM + ", " + APPLY_TO + ", " + ROW_VERSION_COLUMN;
    }
```

javadoc 에 "객체 ID 도 문자열로 읽는다 — 레이아웃 ID 는 INTEGER 다. 바인딩은 문자열 그대로 둔다: SQLite 는 INTEGER 친화도 칼럼과 비교할 때 바인딩된 문자열에 수치 친화도를 적용한다(D-144 3단계 실측, `VersionRowStoreIntegerIdSqliteTest`)" 를 적는다. `toRow` 의 `(String) row[0]` 은 그대로 둔다.

시험이 쓰기 연산 하나라도 0 행을 내면(친화도가 먹지 않으면) 그때만 스펙 §4.2 의 대안대로 `VersionTableSpec` 에 `boolean objectIdNumeric` 을 더하고 `bindKey`·`findAll`·`markParentInUse` 에서 `Long.valueOf(objectId)` 로 바인딩한다. 그 경우 이 Task 의 Interfaces 에 그 칼럼을 적고 `DefaultVersionTableRegistry` 의 다른 분기는 `false` 로 둔다.

- [ ] **Step 4: 통과 확인**

Run: `cd <worktree>/src/backend/mdm && ../gradlew :lib:test --tests '*VersionContractTest' --tests '*VersionRowStoreNameGuardTest' --offline && ../gradlew :api:test --tests '*VersionRowStoreIntegerIdSqliteTest' --tests '*VersionStateServiceSqliteTest' --tests '*BusinessRuleVersionScenarioSqliteTest' --tests '*MasterCodeVersionStateSqliteTest' --offline`
Expected: PASS. (`VersionSpiRegistry` 는 LAYOUT SPI 가 없어도 기동한다 — 조회 때만 fail-closed.)

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/version/VersionTarget.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/version/DefaultVersionTableRegistry.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/version/VersionRowStore.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/version/VersionFixtureTables.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/version/VersionRowStoreIntegerIdSqliteTest.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/version/VersionContractTest.java
/usr/bin/git -C <worktree> commit -m "feat(mdm): 버전 엔진에 레이아웃 대상을 등록하고 INTEGER 객체 ID 를 문자열로 읽는다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: V19 마이그레이션 — 레이아웃 버전 표 재생성과 이력 이행

**Files:**
- Create: `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V19__layout_version.sql`
- Test (Create): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmLayoutVersionV19MigrationTest.java`
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmInterfaceLayoutExpectations.java` (5표 칼럼·제약·인덱스를 V19 모양으로)
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmInterfaceLayoutMigrationTest.java` (V4 적용 성공 단언은 두고 칼럼 집합은 새 기대값)
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmLayoutVersionMigrationTest.java` (V12 모양 단언을 V19 `TB_MDM_LAYOUT_VER` 모양으로 바꾼다 — `INSERT` 문·`layout(Statement)` 도우미 포함)
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmSharedContractMigrationTest.java:83` (버전 집합에 `"19"`)
- Modify: `src/backend/mdm/sample/mdm-local-sample.sql:318-395` (03 레이아웃 블록을 V19 모양으로)
- Modify: `src/frontend/e2e/fixtures/mdm-layout-m201.sql` (같은 모양)

**Interfaces:**
- Consumes: V18(2단계)까지의 스키마
- Produces (모든 이후 Task 가 기대는 스키마):
  - `TB_MDM_LAYOUT(LAYOUT_ID INTEGER PK AUTOINCREMENT, LAYOUT_KIND, LAYOUT_NAME, SND_SYSTEM, RCV_SYSTEM, STATUS VARCHAR(20) NOT NULL DEFAULT 'CREATED', 감사, VER)` — `EAI_CODE`·`TOTAL_LENGTH`·`` `VERSION` `` 없음
  - `TB_MDM_EAI` — V4 와 같은 칼럼(다시 만든다)
  - `TB_MDM_LAYOUT_VER(LAYOUT_ID, VER NUMERIC(7,3), VER_KIND, STATUS, BASE_VER, OWNER_ID, APPLY_FROM, APPLY_TO, REQUESTED_BY, REQUESTED_AT, RELEASED_AT, ROW_VERSION, EAI_CODE, OWN_LENGTH, SWITCH_MODE, CHANGE_KINDS, CHANGE_SUMMARY, SNAPSHOT_JSON, LEGACY_SNAPSHOT_YN, 감사, AUD_VER)`
  - `TB_MDM_LAYOUT_ITEM` PK `(LAYOUT_ID, VER, SEQ)`, `TB_MDM_LAYOUT_HEADER` PK `(LAYOUT_ID, VER, SEQ)` + UX `(LAYOUT_ID, VER, HEADER_LAYOUT_ID)`, `TB_MDM_LAYOUT_CONST` PK `(LAYOUT_ID, VER, HEADER_LAYOUT_ID, HEADER_COLUMN_PHYS)` — 셋 다 감사 카운터 `AUD_VER`
  - `OWN_LENGTH` = 그 버전 자신의 항목 길이 합(헤더: 헤더 길이, 전문: 본문 길이). 전문 총 길이는 T 시점 헤더 `OWN_LENGTH` 합 + 본문 `OWN_LENGTH`.
  - `LEGACY_SNAPSHOT_YN='Y'` = 항목 행 없이 이행 전 합성 스냅샷(헤더를 값으로 담은 `MdmLayoutSnapshot` JSON)만 있는 버전

- [ ] **Step 1: 실패하는 시험 작성** — V18 까지 적용한 DB 에 옛 모양 데이터를 넣고 V19 를 적용한다. `C_AT` 두 형식(엔티티 epoch millis 정수, 샘플 TEXT, NULL), EAI↔헤더 순환 FK, 이력 2건 전문, 이력 없는 전문, 헤더를 모두 넣는다. `TB_MDM_COLUMN` 의 필수 칼럼은 `V16__column_domain_optional.sql` 의 최신 정의를 보고 채운다(아래는 V16 기준 `COLUMN_NAME`·`PHYS_NAME`·`REQUIRED`·`CHG_SEQ`·`VER`).

```java
package com.dongkuk.dmes.mdm;

import static org.assertj.core.api.Assertions.assertThat;

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

/** D-144 3단계 — V19: 레이아웃 5표 재생성, 이력 → RELEASED 구간, 항목 행은 최신 버전에만, 헤더는 1.000 RELEASED. */
class MdmLayoutVersionV19MigrationTest {

    @TempDir
    Path dir;

    private Flyway flyway(String url, String target) {
        return Flyway.configure().dataSource(url, null, null)
                .locations("classpath:db/migration/mdm/sqlite").target(target).load();
    }

    /** 2026-09-01 00:00:00 KST, 2026-09-05 12:00:00 KST 의 epoch millis(엔티티 Instant 저장 형식, D-038). */
    private static final long H100_C_AT = 1788188400000L;
    private static final long M201_V2_C_AT = 1788577200000L;

    private static final String SNAP_V1 = "{\"eaiCode\":\"G1\",\"encoding\":\"EUC-KR\",\"headers\":[{\"headerLayoutId\":100,"
            + "\"headerLayoutName\":\"H\",\"items\":[],\"offset\":0,\"seq\":1,\"totalLength\":10}],\"items\":[],\"layoutId\":201,"
            + "\"layoutName\":\"M\",\"layoutVersion\":1,\"padRule\":null,\"rcvSystem\":null,\"sndSystem\":null,\"totalLength\":25}";

    @Test
    void layoutHistoryBecomesReleasedIntervalsAndRowsMoveToLatestVersion() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("m.db") + "?foreign_keys=true";
        flyway(url, "18").migrate();
        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            s.execute("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, REQUIRED, CHG_SEQ, VER) VALUES ('송신공장', 'SND_FAC_TP', 0, 0, 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, TOTAL_LENGTH, `VERSION`, C_AT, VER) "
                    + "VALUES (100, 'HEADER', 'H', 10, 0, " + H100_C_AT + ", 3)");
            s.execute("INSERT INTO TB_MDM_EAI (EAI_CODE, EAI_NAME, ENCODING, HEADER_LAYOUT_ID, VER) VALUES ('G1', 'G1', 'EUC-KR', 100, 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, EAI_CODE, TOTAL_LENGTH, `VERSION`, C_AT, VER) "
                    + "VALUES (201, 'MESSAGE', 'M', 'G1', 30, 2, '2026-09-02 10:00:00', 5)");
            s.execute("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, TOTAL_LENGTH, `VERSION`, VER) "
                    + "VALUES (305, 'MESSAGE', 'N', 5, 0, 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, SEQ, FILL_KIND, COLUMN_PHYS, DEFAULT_VALUE, `OFFSET`, `LENGTH`, VER) "
                    + "VALUES (100, 1, 'CONST', 'SND_FAC_TP', 'B0', 0, 4, 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, SEQ, FILL_KIND, FILLER_LENGTH, `OFFSET`, `LENGTH`, VER) "
                    + "VALUES (100, 2, 'FILLER', 6, 4, 6, 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, SEQ, FILL_KIND, FILLER_LENGTH, `OFFSET`, `LENGTH`, VER) "
                    + "VALUES (201, 1, 'FILLER', 20, 10, 20, 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, SEQ, FILL_KIND, FILLER_LENGTH, `OFFSET`, `LENGTH`, VER) "
                    + "VALUES (305, 1, 'FILLER', 5, 0, 5, 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, SEQ, HEADER_LAYOUT_ID, VER) VALUES (201, 1, 100, 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT_CONST (LAYOUT_ID, HEADER_LAYOUT_ID, HEADER_SEQ, CONST_VALUE, VER) VALUES (201, 100, 1, 'B9', 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, LAYOUT_VERSION, TOTAL_LENGTH, CHANGE_KINDS, CHANGE_SUMMARY, SNAPSHOT_JSON, "
                    + "C_USR_ID, C_AT, VER) VALUES (201, 1, 25, 'INITIAL', '최초 등록', '" + SNAP_V1 + "', 'kim', '2026-09-02 10:00:00', 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, LAYOUT_VERSION, TOTAL_LENGTH, SWITCH_MODE, CHANGE_KINDS, SNAPSHOT_JSON, "
                    + "C_USR_ID, C_AT, VER) VALUES (201, 2, 30, 'SIMULTANEOUS', 'ITEM_LENGTH', '" + SNAP_V1.replace("25}", "30}")
                    + "', 'lee', " + M201_V2_C_AT + ", 0)");
        }
        flyway(url, "19").migrate();
        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            // 부모 — 업무 VERSION·EAI_CODE·TOTAL_LENGTH 칼럼이 없고 STATUS 는 INUSE
            assertThat(columns(s, "TB_MDM_LAYOUT")).doesNotContain("VERSION", "EAI_CODE", "TOTAL_LENGTH").contains("STATUS");
            assertThat(strings(s, "SELECT STATUS FROM TB_MDM_LAYOUT ORDER BY LAYOUT_ID")).containsExactly("INUSE", "INUSE", "INUSE");
            // 전문 201 — 이력 두 행이 이어진 RELEASED 구간이 된다
            assertThat(strings(s, "SELECT CAST(VER AS VARCHAR(40)) || '|' || STATUS || '|' || APPLY_FROM || '|' || APPLY_TO || '|' "
                    + "|| LEGACY_SNAPSHOT_YN || '|' || OWN_LENGTH || '|' || COALESCE(EAI_CODE, '-') || '|' || COALESCE(CAST(BASE_VER AS VARCHAR(40)), '-') "
                    + "FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = 201 ORDER BY APPLY_FROM"))
                    .containsExactly("1|RELEASED|2026-09-02 10:00:00|2026-09-05 12:00:00|Y|15|G1|-",
                            "2|RELEASED|2026-09-05 12:00:00|9999-12-31 00:00:00|N|20|G1|1");
            assertThat(strings(s, "SELECT COALESCE(SNAPSHOT_JSON, '-') FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = 201 ORDER BY APPLY_FROM").get(1))
                    .isEqualTo("-");
            // 헤더 100 — 현재 행이 1.000 RELEASED, 시작은 C_AT(epoch → KST)
            // 헤더 버전 행의 EAI_CODE = 그 헤더를 표준 헤더로 가리키던 EAI(확정 때 연결을 옮기는 근거)
            assertThat(strings(s, "SELECT CAST(VER AS VARCHAR(40)) || '|' || APPLY_FROM || '|' || OWN_LENGTH || '|' || VER_KIND || '|' "
                    + "|| COALESCE(EAI_CODE, '-') FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = 100"))
                    .containsExactly("1|2026-09-01 00:00:00|10|MAJOR|G1");
            // 이력 없는 전문 305 — C_AT 이 없으면 이행 하한
            assertThat(strings(s, "SELECT APPLY_FROM || '|' || OWN_LENGTH FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = 305"))
                    .containsExactly("2000-01-01 00:00:00|5");
            // 항목·헤더 구성·상수 — 최신 버전에만, 본문 오프셋은 본문 기준 상대값
            assertThat(strings(s, "SELECT LAYOUT_ID || '@' || CAST(VER AS VARCHAR(40)) || '#' || SEQ || '=' || `OFFSET` "
                    + "FROM TB_MDM_LAYOUT_ITEM ORDER BY LAYOUT_ID, SEQ"))
                    .containsExactly("100@1#1=0", "100@1#2=4", "201@2#1=0", "305@1#1=0");
            assertThat(strings(s, "SELECT LAYOUT_ID || '@' || CAST(VER AS VARCHAR(40)) || '>' || HEADER_LAYOUT_ID FROM TB_MDM_LAYOUT_HEADER"))
                    .containsExactly("201@2>100");
            assertThat(strings(s, "SELECT CAST(VER AS VARCHAR(40)) || '|' || HEADER_COLUMN_PHYS || '|' || CONST_VALUE FROM TB_MDM_LAYOUT_CONST"))
                    .containsExactly("2|SND_FAC_TP|B9");
            // EAI 와 순환 FK 가 살아 있다
            assertThat(strings(s, "SELECT EAI_CODE || '>' || HEADER_LAYOUT_ID FROM TB_MDM_EAI")).containsExactly("G1>100");
            // 감사 카운터 개명(D-034) — 업무 VER 와 겹치지 않는다
            for (String t : List.of("TB_MDM_LAYOUT_VER", "TB_MDM_LAYOUT_ITEM", "TB_MDM_LAYOUT_HEADER", "TB_MDM_LAYOUT_CONST")) {
                assertThat(columns(s, t)).contains("VER", "AUD_VER");
                assertThat(typeOf(s, t, "VER")).isEqualTo("NUMERIC(7,3)");
            }
            assertThat(strings(s, "SELECT CAST(AUD_VER AS VARCHAR(10)) FROM TB_MDM_LAYOUT_ITEM WHERE LAYOUT_ID = 201")).containsExactly("0");
            assertThat(s.executeQuery("PRAGMA foreign_key_check").next()).isFalse();
            // minor 버전 행·자식 FK 가 동작하고, AUTOINCREMENT 가 이행한 ID 뒤에서 이어진다
            s.execute("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, OWNER_ID, OWN_LENGTH) VALUES (201, 2.001, 'MINOR', 'DRAFT', 'kim', 20)");
            s.execute("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, VER, SEQ, FILL_KIND, FILLER_LENGTH, `OFFSET`, `LENGTH`) VALUES (201, 2.001, 1, 'FILLER', 20, 0, 20)");
            s.execute("INSERT INTO TB_MDM_LAYOUT (LAYOUT_KIND, LAYOUT_NAME) VALUES ('MESSAGE', 'new')");
            assertThat(strings(s, "SELECT CAST(MAX(LAYOUT_ID) AS VARCHAR(10)) FROM TB_MDM_LAYOUT")).containsExactly("351");
            assertThat(strings(s, "SELECT STATUS FROM TB_MDM_LAYOUT WHERE LAYOUT_ID = 351")).containsExactly("CREATED");
            // 임시 표가 남지 않는다
            assertThat(strings(s, "SELECT name FROM sqlite_master WHERE name LIKE '%\\_BAK' ESCAPE '\\' OR name LIKE 'TB_MDM_LAYOUT_V19%'")).isEmpty();
        }
    }

    private static List<String> strings(Statement s, String sql) throws Exception {
        List<String> out = new ArrayList<>();
        try (ResultSet r = s.executeQuery(sql)) {
            while (r.next()) {
                out.add(r.getString(1));
            }
        }
        return out;
    }

    private static List<String> columns(Statement s, String table) throws Exception {
        return strings(s, "SELECT name FROM pragma_table_info('" + table + "')");
    }

    private static String typeOf(Statement s, String table, String column) throws Exception {
        List<String> t = strings(s, "SELECT type FROM pragma_table_info('" + table + "') WHERE name = '" + column + "'");
        return t.isEmpty() ? null : t.get(0);
    }
}
```

(`CAST(VER AS VARCHAR(40))` 는 SQLite 에서 정수 저장값이면 `"1"`, 실수면 `"1.001"` 이다. 위 기대값은 그 형식이다.)

- [ ] **Step 2: 실패 확인**

Run: `cd <worktree>/src/backend/mdm && ../gradlew :api:test --tests '*MdmLayoutVersionV19MigrationTest' --offline`
Expected: FAIL — V19 가 없어 `target("19")` 가 적용되지 않고 `STATUS` 칼럼이 없다.

- [ ] **Step 3: 마이그레이션 작성** — 파일 머리 주석에 다음을 적는다: 목적(D-144 3단계, 스펙 §7), V17 과 같은 이유로 RENAME 대신 `_BAK` 경유 재생성, EAI↔레이아웃 순환 FK 를 푸는 순서(`UPDATE TB_MDM_LAYOUT SET EAI_CODE = NULL` 뒤 EAI → 레이아웃 DROP), DROP 하면 `sqlite_sequence` 의 레이아웃 행이 사라지고 이행 INSERT 의 최대 ID 로 다시 잡힌다(지운 끝 번호가 재사용될 수 있다), `C_AT` 형식 정규화 규칙(정수 = epoch millis → KST, 문자열 = 앞 19자, 없으면 `'2000-01-01 00:00:00'` 이행 하한), 같은 초에 저장된 이력 두 행은 길이 0 구간이 되어 판정에 쓰이지 않는다, 이행 한계(스펙 §7: 이전 전문 버전은 헤더를 값으로 담은 스냅샷만, 헤더 버전 해석은 이행 이후부터), 되돌리는 방법(새 마이그레이션에서 같은 패턴으로 V4·V12 모양으로 다시 만들고 최신 버전 행만 남긴다). 감사 카운터 개명(`VER` → `AUD_VER`, D-034)과 그 이유(업무 `VER` 가 키가 된다)도 적는다.

```sql
-- ① 임시 복사(제약 없음)
CREATE TABLE TB_MDM_LAYOUT_BAK AS SELECT * FROM TB_MDM_LAYOUT;
CREATE TABLE TB_MDM_EAI_BAK AS SELECT * FROM TB_MDM_EAI;
CREATE TABLE TB_MDM_LAYOUT_VER_BAK AS SELECT * FROM TB_MDM_LAYOUT_VER;
CREATE TABLE TB_MDM_LAYOUT_ITEM_BAK AS SELECT * FROM TB_MDM_LAYOUT_ITEM;
CREATE TABLE TB_MDM_LAYOUT_HEADER_BAK AS SELECT * FROM TB_MDM_LAYOUT_HEADER;
CREATE TABLE TB_MDM_LAYOUT_CONST_BAK AS SELECT * FROM TB_MDM_LAYOUT_CONST;

-- ② 이행 기준표 — 레이아웃마다 최신 버전 번호(이력 최대, 없으면 1)·생성 시각(KST)·자기 항목 길이·쌓인 헤더 길이
CREATE TABLE TB_MDM_LAYOUT_V19_KEY AS
SELECT l.LAYOUT_ID AS LAYOUT_ID,
       COALESCE((SELECT MAX(v.LAYOUT_VERSION) FROM TB_MDM_LAYOUT_VER_BAK v WHERE v.LAYOUT_ID = l.LAYOUT_ID), 1) AS LATEST,
       CASE typeof(l.C_AT)
           WHEN 'integer' THEN strftime('%Y-%m-%d %H:%M:%S', l.C_AT / 1000, 'unixepoch', '+9 hours')
           WHEN 'real' THEN strftime('%Y-%m-%d %H:%M:%S', CAST(l.C_AT AS INTEGER) / 1000, 'unixepoch', '+9 hours')
           WHEN 'text' THEN substr(l.C_AT, 1, 19)
           ELSE '2000-01-01 00:00:00' END AS CREATED_KST,
       COALESCE((SELECT SUM(i.`LENGTH`) FROM TB_MDM_LAYOUT_ITEM_BAK i WHERE i.LAYOUT_ID = l.LAYOUT_ID), 0) AS OWN_LENGTH,
       COALESCE((SELECT SUM(h.TOTAL_LENGTH) FROM TB_MDM_LAYOUT_HEADER_BAK s JOIN TB_MDM_LAYOUT_BAK h ON h.LAYOUT_ID = s.HEADER_LAYOUT_ID
                 WHERE s.LAYOUT_ID = l.LAYOUT_ID), 0) AS HEADER_LENGTH
FROM TB_MDM_LAYOUT_BAK l;

CREATE TABLE TB_MDM_LAYOUT_V19_HIST AS
SELECT v.LAYOUT_ID AS LAYOUT_ID, v.LAYOUT_VERSION AS LAYOUT_VERSION,
       CASE typeof(v.C_AT)
           WHEN 'integer' THEN strftime('%Y-%m-%d %H:%M:%S', v.C_AT / 1000, 'unixepoch', '+9 hours')
           WHEN 'real' THEN strftime('%Y-%m-%d %H:%M:%S', CAST(v.C_AT AS INTEGER) / 1000, 'unixepoch', '+9 hours')
           WHEN 'text' THEN substr(v.C_AT, 1, 19)
           ELSE '2000-01-01 00:00:00' END AS FROM_KST
FROM TB_MDM_LAYOUT_VER_BAK v;

-- ③ 옛 자식 → 옛 부모 순으로 지운다. 레이아웃 ↔ EAI 순환 FK 는 레이아웃 쪽 칸을 비워 끊는다(값은 _BAK 에 있다)
DROP TABLE TB_MDM_LAYOUT_CONST;
DROP TABLE TB_MDM_LAYOUT_HEADER;
DROP TABLE TB_MDM_LAYOUT_ITEM;
DROP TABLE TB_MDM_LAYOUT_VER;
UPDATE TB_MDM_LAYOUT SET EAI_CODE = NULL;
DROP TABLE TB_MDM_EAI;
DROP TABLE TB_MDM_LAYOUT;

-- ④ 새 표(부모 → 자식). EAI_CODE 는 버전 행으로 옮겨 부모와 EAI 의 순환이 없어진다
CREATE TABLE TB_MDM_LAYOUT (
    LAYOUT_ID INTEGER CONSTRAINT PK_TB_MDM_LAYOUT PRIMARY KEY AUTOINCREMENT,
    LAYOUT_KIND VARCHAR(20) NOT NULL,
    LAYOUT_NAME TEXT NOT NULL,
    SND_SYSTEM VARCHAR(20),
    RCV_SYSTEM VARCHAR(20),
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
    CONSTRAINT FK_TB_MDM_LAYOUT_SYSTEM_SND FOREIGN KEY (SND_SYSTEM) REFERENCES TB_MDM_SYSTEM (SYSTEM_CODE),
    CONSTRAINT FK_TB_MDM_LAYOUT_SYSTEM_RCV FOREIGN KEY (RCV_SYSTEM) REFERENCES TB_MDM_SYSTEM (SYSTEM_CODE),
    CONSTRAINT CK_TB_MDM_LAYOUT_KIND CHECK (LAYOUT_KIND IN ('HEADER','MESSAGE')),
    CONSTRAINT CK_TB_MDM_LAYOUT_STATUS CHECK (STATUS IN ('CREATED','INUSE','DEPRECATED'))
);

CREATE TABLE TB_MDM_EAI (
    EAI_CODE VARCHAR(20) NOT NULL,
    EAI_NAME TEXT NOT NULL,
    ENCODING VARCHAR(20) NOT NULL,
    PAD_RULE TEXT,
    HEADER_LAYOUT_ID INTEGER,
    C_USR_ID VARCHAR(100),
    C_AT TIMESTAMP,
    C_SVC_ID VARCHAR(100),
    C_PGM_ID VARCHAR(100),
    U_USR_ID VARCHAR(100),
    U_AT TIMESTAMP,
    U_SVC_ID VARCHAR(100),
    U_PGM_ID VARCHAR(100),
    VER BIGINT,
    CONSTRAINT PK_TB_MDM_EAI PRIMARY KEY (EAI_CODE),
    CONSTRAINT FK_TB_MDM_EAI_LAYOUT FOREIGN KEY (HEADER_LAYOUT_ID) REFERENCES TB_MDM_LAYOUT (LAYOUT_ID)
);

CREATE TABLE TB_MDM_LAYOUT_VER (
    LAYOUT_ID INTEGER NOT NULL,
    VER NUMERIC(7,3) NOT NULL,
    VER_KIND VARCHAR(20) NOT NULL DEFAULT 'MAJOR',
    STATUS VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    BASE_VER NUMERIC(7,3),
    OWNER_ID VARCHAR(50),
    APPLY_FROM TEXT,
    APPLY_TO TEXT,
    REQUESTED_BY VARCHAR(50),
    REQUESTED_AT TEXT,
    RELEASED_AT TEXT,
    ROW_VERSION BIGINT NOT NULL DEFAULT 0,
    EAI_CODE VARCHAR(20),
    OWN_LENGTH INTEGER NOT NULL DEFAULT 0,
    SWITCH_MODE VARCHAR(20),
    CHANGE_KINDS VARCHAR(200),
    CHANGE_SUMMARY TEXT,
    SNAPSHOT_JSON TEXT CONSTRAINT CK_TB_MDM_LAYOUT_VER_SNAPSHOT_JSON CHECK (SNAPSHOT_JSON IS NULL OR json_valid(SNAPSHOT_JSON)),
    LEGACY_SNAPSHOT_YN VARCHAR(1) NOT NULL DEFAULT 'N',
    C_USR_ID VARCHAR(100),
    C_AT TIMESTAMP,
    C_SVC_ID VARCHAR(100),
    C_PGM_ID VARCHAR(100),
    U_USR_ID VARCHAR(100),
    U_AT TIMESTAMP,
    U_SVC_ID VARCHAR(100),
    U_PGM_ID VARCHAR(100),
    AUD_VER BIGINT,
    CONSTRAINT PK_TB_MDM_LAYOUT_VER PRIMARY KEY (LAYOUT_ID, VER),
    CONSTRAINT FK_TB_MDM_LAYOUT_VER_LAYOUT FOREIGN KEY (LAYOUT_ID) REFERENCES TB_MDM_LAYOUT (LAYOUT_ID),
    CONSTRAINT FK_TB_MDM_LAYOUT_VER_EAI FOREIGN KEY (EAI_CODE) REFERENCES TB_MDM_EAI (EAI_CODE),
    CONSTRAINT CK_TB_MDM_LAYOUT_VER_STATUS CHECK (STATUS IN ('DRAFT','REQUESTED','APPROVED','RELEASED','CANCELLED')),
    CONSTRAINT CK_TB_MDM_LAYOUT_VER_KIND CHECK (VER_KIND IN ('MAJOR','MINOR')),
    CONSTRAINT CK_TB_MDM_LAYOUT_VER_APPLY CHECK (STATUS = 'DRAFT' OR (APPLY_FROM IS NOT NULL AND APPLY_TO IS NOT NULL)),
    CONSTRAINT CK_TB_MDM_LAYOUT_VER_SWITCH CHECK (SWITCH_MODE IS NULL OR SWITCH_MODE IN ('SEQUENTIAL','SIMULTANEOUS')),
    CONSTRAINT CK_TB_MDM_LAYOUT_VER_LEGACY CHECK (LEGACY_SNAPSHOT_YN IN ('Y','N') AND (LEGACY_SNAPSHOT_YN = 'N' OR SNAPSHOT_JSON IS NOT NULL))
);

CREATE TABLE TB_MDM_LAYOUT_ITEM (
    LAYOUT_ID INTEGER NOT NULL,
    VER NUMERIC(7,3) NOT NULL,
    SEQ INTEGER NOT NULL,
    FILL_KIND VARCHAR(20) NOT NULL,
    COLUMN_PHYS VARCHAR(50),
    TRANS_UNIT VARCHAR(20),
    UNIT_ITEM VARCHAR(50),
    NUM_FORMAT VARCHAR(50),
    DEFAULT_VALUE VARCHAR(50),
    FILLER_LENGTH INTEGER,
    `OFFSET` INTEGER NOT NULL DEFAULT 0,
    `LENGTH` INTEGER NOT NULL DEFAULT 0,
    C_USR_ID VARCHAR(100),
    C_AT TIMESTAMP,
    C_SVC_ID VARCHAR(100),
    C_PGM_ID VARCHAR(100),
    U_USR_ID VARCHAR(100),
    U_AT TIMESTAMP,
    U_SVC_ID VARCHAR(100),
    U_PGM_ID VARCHAR(100),
    AUD_VER BIGINT,
    CONSTRAINT PK_TB_MDM_LAYOUT_ITEM PRIMARY KEY (LAYOUT_ID, VER, SEQ),
    CONSTRAINT FK_TB_MDM_LAYOUT_ITEM_VER FOREIGN KEY (LAYOUT_ID, VER) REFERENCES TB_MDM_LAYOUT_VER (LAYOUT_ID, VER),
    CONSTRAINT FK_TB_MDM_LAYOUT_ITEM_COLUMN FOREIGN KEY (COLUMN_PHYS) REFERENCES TB_MDM_COLUMN (PHYS_NAME),
    CONSTRAINT FK_TB_MDM_LAYOUT_ITEM_UNIT FOREIGN KEY (TRANS_UNIT) REFERENCES TB_MDM_UNIT (UNIT_CODE),
    CONSTRAINT CK_TB_MDM_LAYOUT_ITEM_FILL_KIND CHECK (FILL_KIND IN ('DATA','CONST','AUTO','FILLER')),
    CONSTRAINT CK_TB_MDM_LAYOUT_ITEM_UNIT CHECK (TRANS_UNIT IS NULL OR UNIT_ITEM IS NULL)
);

CREATE TABLE TB_MDM_LAYOUT_HEADER (
    LAYOUT_ID INTEGER NOT NULL,
    VER NUMERIC(7,3) NOT NULL,
    SEQ INTEGER NOT NULL,
    HEADER_LAYOUT_ID INTEGER NOT NULL,
    C_USR_ID VARCHAR(100),
    C_AT TIMESTAMP,
    C_SVC_ID VARCHAR(100),
    C_PGM_ID VARCHAR(100),
    U_USR_ID VARCHAR(100),
    U_AT TIMESTAMP,
    U_SVC_ID VARCHAR(100),
    U_PGM_ID VARCHAR(100),
    AUD_VER BIGINT,
    CONSTRAINT PK_TB_MDM_LAYOUT_HEADER PRIMARY KEY (LAYOUT_ID, VER, SEQ),
    CONSTRAINT FK_TB_MDM_LAYOUT_HEADER_VER FOREIGN KEY (LAYOUT_ID, VER) REFERENCES TB_MDM_LAYOUT_VER (LAYOUT_ID, VER),
    CONSTRAINT FK_TB_MDM_LAYOUT_HEADER_HEADER FOREIGN KEY (HEADER_LAYOUT_ID) REFERENCES TB_MDM_LAYOUT (LAYOUT_ID)
);
-- 상수 표의 FK 대상 — CONST 를 넣기 전에 있어야 한다(SQLite 는 부모 키에 유일 인덱스를 요구한다)
CREATE UNIQUE INDEX UX_TB_MDM_LAYOUT_HEADER_HDR ON TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, HEADER_LAYOUT_ID);

-- 재정의 대상은 헤더 항목 물리명이다 — 헤더 버전이 바뀌어 SEQ 가 움직여도 짝이 유지된다(D-144 3단계). 헤더 항목 FK 는 둘 수 없다
-- (어느 헤더 버전인지는 판정 시각에 정해진다, K1)
CREATE TABLE TB_MDM_LAYOUT_CONST (
    LAYOUT_ID INTEGER NOT NULL,
    VER NUMERIC(7,3) NOT NULL,
    HEADER_LAYOUT_ID INTEGER NOT NULL,
    HEADER_COLUMN_PHYS VARCHAR(50) NOT NULL,
    CONST_VALUE VARCHAR(50) NOT NULL,
    C_USR_ID VARCHAR(100),
    C_AT TIMESTAMP,
    C_SVC_ID VARCHAR(100),
    C_PGM_ID VARCHAR(100),
    U_USR_ID VARCHAR(100),
    U_AT TIMESTAMP,
    U_SVC_ID VARCHAR(100),
    U_PGM_ID VARCHAR(100),
    AUD_VER BIGINT,
    CONSTRAINT PK_TB_MDM_LAYOUT_CONST PRIMARY KEY (LAYOUT_ID, VER, HEADER_LAYOUT_ID, HEADER_COLUMN_PHYS),
    CONSTRAINT FK_TB_MDM_LAYOUT_CONST_HEADER FOREIGN KEY (LAYOUT_ID, VER, HEADER_LAYOUT_ID)
        REFERENCES TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, HEADER_LAYOUT_ID)
);

-- ⑤ 복사(부모 → 자식). 이행한 레이아웃은 모두 이미 적용된 RELEASED 를 가지므로 INUSE 다
INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, SND_SYSTEM, RCV_SYSTEM, STATUS,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER)
SELECT LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, SND_SYSTEM, RCV_SYSTEM, 'INUSE',
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER
FROM TB_MDM_LAYOUT_BAK;

INSERT INTO TB_MDM_EAI (EAI_CODE, EAI_NAME, ENCODING, PAD_RULE, HEADER_LAYOUT_ID,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER)
SELECT EAI_CODE, EAI_NAME, ENCODING, PAD_RULE, HEADER_LAYOUT_ID,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER
FROM TB_MDM_EAI_BAK;

-- ⑤-1 저장 이력이 있는 전문 — 이력 행마다 RELEASED. 다음 이력의 시작에서 닫고, 최신만 항목 행을 가진다(LEGACY 'N')
INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, BASE_VER, OWNER_ID, APPLY_FROM, APPLY_TO,
    REQUESTED_BY, REQUESTED_AT, RELEASED_AT, ROW_VERSION, EAI_CODE, OWN_LENGTH,
    SWITCH_MODE, CHANGE_KINDS, CHANGE_SUMMARY, SNAPSHOT_JSON, LEGACY_SNAPSHOT_YN,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, AUD_VER)
SELECT v.LAYOUT_ID, CAST(v.LAYOUT_VERSION AS NUMERIC), 'MAJOR', 'RELEASED',
    (SELECT CAST(MAX(p.LAYOUT_VERSION) AS NUMERIC) FROM TB_MDM_LAYOUT_VER_BAK p
      WHERE p.LAYOUT_ID = v.LAYOUT_ID AND p.LAYOUT_VERSION < v.LAYOUT_VERSION),
    NULL, h.FROM_KST,
    COALESCE((SELECT n.FROM_KST FROM TB_MDM_LAYOUT_V19_HIST n
               WHERE n.LAYOUT_ID = v.LAYOUT_ID AND n.LAYOUT_VERSION > v.LAYOUT_VERSION
               ORDER BY n.LAYOUT_VERSION LIMIT 1), '9999-12-31 00:00:00'),
    v.C_USR_ID, h.FROM_KST, h.FROM_KST, 0,
    CASE WHEN v.LAYOUT_VERSION = k.LATEST THEN l.EAI_CODE ELSE json_extract(v.SNAPSHOT_JSON, '$.eaiCode') END,
    CASE WHEN v.LAYOUT_VERSION = k.LATEST THEN k.OWN_LENGTH
         ELSE v.TOTAL_LENGTH - COALESCE((SELECT SUM(json_extract(j.value, '$.totalLength'))
                                           FROM json_each(v.SNAPSHOT_JSON, '$.headers') j), 0) END,
    v.SWITCH_MODE, v.CHANGE_KINDS, v.CHANGE_SUMMARY,
    CASE WHEN v.LAYOUT_VERSION = k.LATEST THEN NULL ELSE v.SNAPSHOT_JSON END,
    CASE WHEN v.LAYOUT_VERSION = k.LATEST THEN 'N' ELSE 'Y' END,
    v.C_USR_ID, v.C_AT, v.C_SVC_ID, v.C_PGM_ID, v.U_USR_ID, v.U_AT, v.U_SVC_ID, v.U_PGM_ID, v.VER
FROM TB_MDM_LAYOUT_VER_BAK v
JOIN TB_MDM_LAYOUT_V19_HIST h ON h.LAYOUT_ID = v.LAYOUT_ID AND h.LAYOUT_VERSION = v.LAYOUT_VERSION
JOIN TB_MDM_LAYOUT_V19_KEY k ON k.LAYOUT_ID = v.LAYOUT_ID
JOIN TB_MDM_LAYOUT_BAK l ON l.LAYOUT_ID = v.LAYOUT_ID;

-- ⑤-2 이력이 없는 레이아웃(헤더 전부 + 저장 이력 없는 전문) — 현재 행이 1.000 RELEASED
INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, BASE_VER, OWNER_ID, APPLY_FROM, APPLY_TO,
    REQUESTED_BY, REQUESTED_AT, RELEASED_AT, ROW_VERSION, EAI_CODE, OWN_LENGTH,
    SWITCH_MODE, CHANGE_KINDS, CHANGE_SUMMARY, SNAPSHOT_JSON, LEGACY_SNAPSHOT_YN,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, AUD_VER)
SELECT l.LAYOUT_ID, 1, 'MAJOR', 'RELEASED', NULL, NULL, k.CREATED_KST, '9999-12-31 00:00:00',
    l.C_USR_ID, k.CREATED_KST, k.CREATED_KST, 0,
    CASE WHEN l.LAYOUT_KIND = 'MESSAGE' THEN l.EAI_CODE
         ELSE (SELECT e.EAI_CODE FROM TB_MDM_EAI_BAK e WHERE e.HEADER_LAYOUT_ID = l.LAYOUT_ID ORDER BY e.EAI_CODE LIMIT 1) END,
    k.OWN_LENGTH,
    NULL, 'INITIAL', '이행(V19) — 저장 이력 없음', NULL, 'N',
    l.C_USR_ID, l.C_AT, l.C_SVC_ID, l.C_PGM_ID, l.U_USR_ID, l.U_AT, l.U_SVC_ID, l.U_PGM_ID, 0
FROM TB_MDM_LAYOUT_BAK l
JOIN TB_MDM_LAYOUT_V19_KEY k ON k.LAYOUT_ID = l.LAYOUT_ID
WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_LAYOUT_VER_BAK v WHERE v.LAYOUT_ID = l.LAYOUT_ID);

-- ⑤-3 항목 — 최신 버전에만. 전문 본문 오프셋은 쌓인 헤더 길이를 빼 본문 기준 상대값으로 바꾼다
INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, VER, SEQ, FILL_KIND, COLUMN_PHYS, TRANS_UNIT, UNIT_ITEM, NUM_FORMAT,
    DEFAULT_VALUE, FILLER_LENGTH, `OFFSET`, `LENGTH`,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, AUD_VER)
SELECT i.LAYOUT_ID, CAST(k.LATEST AS NUMERIC), i.SEQ, i.FILL_KIND, i.COLUMN_PHYS, i.TRANS_UNIT, i.UNIT_ITEM, i.NUM_FORMAT,
    i.DEFAULT_VALUE, i.FILLER_LENGTH,
    CASE WHEN l.LAYOUT_KIND = 'MESSAGE' THEN i.`OFFSET` - k.HEADER_LENGTH ELSE i.`OFFSET` END, i.`LENGTH`,
    i.C_USR_ID, i.C_AT, i.C_SVC_ID, i.C_PGM_ID, i.U_USR_ID, i.U_AT, i.U_SVC_ID, i.U_PGM_ID, i.VER
FROM TB_MDM_LAYOUT_ITEM_BAK i
JOIN TB_MDM_LAYOUT_V19_KEY k ON k.LAYOUT_ID = i.LAYOUT_ID
JOIN TB_MDM_LAYOUT_BAK l ON l.LAYOUT_ID = i.LAYOUT_ID;

INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, SEQ, HEADER_LAYOUT_ID,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, AUD_VER)
SELECT s.LAYOUT_ID, CAST(k.LATEST AS NUMERIC), s.SEQ, s.HEADER_LAYOUT_ID,
    s.C_USR_ID, s.C_AT, s.C_SVC_ID, s.C_PGM_ID, s.U_USR_ID, s.U_AT, s.U_SVC_ID, s.U_PGM_ID, s.VER
FROM TB_MDM_LAYOUT_HEADER_BAK s
JOIN TB_MDM_LAYOUT_V19_KEY k ON k.LAYOUT_ID = s.LAYOUT_ID;

-- 재정의 — 옛 (헤더, SEQ) 를 그 헤더 항목의 물리명으로 바꾼다. 물리명 없는 대상(L03 로 생길 수 없다)은 옮기지 않는다
INSERT INTO TB_MDM_LAYOUT_CONST (LAYOUT_ID, VER, HEADER_LAYOUT_ID, HEADER_COLUMN_PHYS, CONST_VALUE,
    C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, AUD_VER)
SELECT c.LAYOUT_ID, CAST(k.LATEST AS NUMERIC), c.HEADER_LAYOUT_ID, hi.COLUMN_PHYS, c.CONST_VALUE,
    c.C_USR_ID, c.C_AT, c.C_SVC_ID, c.C_PGM_ID, c.U_USR_ID, c.U_AT, c.U_SVC_ID, c.U_PGM_ID, c.VER
FROM TB_MDM_LAYOUT_CONST_BAK c
JOIN TB_MDM_LAYOUT_V19_KEY k ON k.LAYOUT_ID = c.LAYOUT_ID
JOIN TB_MDM_LAYOUT_ITEM_BAK hi ON hi.LAYOUT_ID = c.HEADER_LAYOUT_ID AND hi.SEQ = c.HEADER_SEQ
WHERE hi.COLUMN_PHYS IS NOT NULL;

-- ⑥ 임시 표 삭제
DROP TABLE TB_MDM_LAYOUT_V19_HIST;
DROP TABLE TB_MDM_LAYOUT_V19_KEY;
DROP TABLE TB_MDM_LAYOUT_CONST_BAK;
DROP TABLE TB_MDM_LAYOUT_HEADER_BAK;
DROP TABLE TB_MDM_LAYOUT_ITEM_BAK;
DROP TABLE TB_MDM_LAYOUT_VER_BAK;
DROP TABLE TB_MDM_EAI_BAK;
DROP TABLE TB_MDM_LAYOUT_BAK;
```

샘플 SQL(`mdm-local-sample.sql:318-395`)과 e2e 픽스처(`mdm-layout-m201.sql`)를 V19 모양으로 고친다:
- `TB_MDM_LAYOUT` INSERT 에서 `EAI_CODE`·`TOTAL_LENGTH`·`` `VERSION` `` 를 빼고 `STATUS` 에 `'INUSE'` 를 넣는다. 순환 FK 주석("EAI 보다 먼저")은 "버전 행보다 먼저"로 고친다.
- 헤더 100·110·200, 전문 305 는 `TB_MDM_LAYOUT_VER` 에 `(LAYOUT_ID, 1, 'MAJOR', 'RELEASED', APPLY_FROM = 그 행의 C_AT, APPLY_TO '9999-12-31 00:00:00', EAI_CODE(전문은 그 전문의 EAI, 헤더는 그 헤더를 가리키는 EAI — 100 = GLUE, 200 = SAP_PI, 110 = NULL), OWN_LENGTH, LEGACY_SNAPSHOT_YN 'N')` 한 행씩.
- 전문 201 은 옛 이력 v1 을 `1, LEGACY 'Y', SNAPSHOT_JSON 그대로, APPLY_FROM 2026-09-10 14:05:00, APPLY_TO 2026-09-18 10:20:00`, v2 를 `2, LEGACY 'N', SNAPSHOT_JSON NULL, APPLY_FROM 2026-09-18 10:20:00, APPLY_TO 9999-12-31 00:00:00, BASE_VER 1, OWN_LENGTH 57` 로 넣는다. 305 의 옛 이력 v1 은 `LEGACY 'N'`(최신)으로 둔다.
- `TB_MDM_LAYOUT_ITEM`·`HEADER`·`CONST` INSERT 에 `VER` 칼럼(헤더 1, 전문 201 은 2, 305 는 1)을 더하고 감사 카운터 칼럼 이름을 `AUD_VER` 로 바꾼다. 본문 항목 `OFFSET` 은 본문 기준 상대값으로 바꾼다(201: 0·20·28·32 — 헤더 합 130 을 뺀다, 305: 0·20·28·41·44 — 헤더 합 80 을 뺀다). 201 v2 의 `OWN_LENGTH` 57 = 20+8+4+25, 305 는 66.
- 상수 재정의는 `HEADER_SEQ` 대신 `HEADER_COLUMN_PHYS` 를 쓴다(201: `SND_FAC_TP`·`EAI_IF_ID`, 305: `IF_ID`).
- EAI INSERT 는 헤더 뒤·버전 행 앞에 둔다(버전 행이 EAI 를 FK 로 가리킨다).
- e2e 픽스처 `mdm-layout-m201.sql` 은 이 계획을 쓸 때 내용을 열어 보지 않았다 — 착수 때 읽고 위 규칙(부모 칼럼, 버전 행, `VER` 키, 본문 상대 오프셋, 물리명 재정의, `AUD_VER`)을 그대로 적용한다.

`MdmInterfaceLayoutExpectations` 의 표별 칼럼 목록을 위 DDL 그대로(칼럼 순서 포함) 바꾸고, 제약 이름 목록에서 `FK_TB_MDM_LAYOUT_EAI`·`FK_TB_MDM_LAYOUT_ITEM_LAYOUT`·`FK_TB_MDM_LAYOUT_HEADER_LAYOUT`·`FK_TB_MDM_LAYOUT_CONST_LAYOUT`·`FK_TB_MDM_LAYOUT_CONST_ITEM` 을 빼고 `FK_TB_MDM_LAYOUT_ITEM_VER`·`FK_TB_MDM_LAYOUT_HEADER_VER`·`CK_TB_MDM_LAYOUT_STATUS` 를 더한다. `MdmLayoutVersionMigrationTest` 는 V12 표 모양 단언을 V19 `TB_MDM_LAYOUT_VER` 칼럼·CHECK(`CK_TB_MDM_LAYOUT_VER_APPLY`·`_LEGACY`·`_KIND`) 단언으로 바꾸고, 엔티티 리포지토리를 쓰는 단언은 Task 3 의 엔티티로 컴파일되게 Task 3 에서 고친다(이 Task 에서는 그 메서드에 `@Disabled("Task 3 에서 V19 엔티티로 바꾼다")` 를 붙인다). `MdmSharedContractMigrationTest` 의 버전 집합 끝에 `"19"` 를 더하고 주석에 "D-144 3단계 — V19(레이아웃 버전)" 를 적는다.

- [ ] **Step 4: 통과 확인**

Run: `cd <worktree>/src/backend/mdm && ../gradlew :api:test --tests '*MdmLayoutVersionV19MigrationTest' --tests '*MdmInterfaceLayoutMigrationTest' --tests '*MdmSharedContractMigrationTest' --tests '*MdmColumnDomainOptionalMigrationTest' --offline`
Expected: PASS. (이 시점에는 엔티티가 옛 모양이라 Spring 기동 시험 일부가 깨진다 — Global Constraints 참고. `MdmInterfaceLayoutMigrationTest` 가 엔티티 검증으로 기동에 실패하면 이 Task 에서는 `MdmLayoutVersionV19MigrationTest` 만 통과를 확인하고 나머지는 Task 5 Step 4 에서 확인한다.)

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V19__layout_version.sql src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmLayoutVersionV19MigrationTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmInterfaceLayoutExpectations.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmInterfaceLayoutMigrationTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmLayoutVersionMigrationTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmSharedContractMigrationTest.java src/backend/mdm/sample/mdm-local-sample.sql src/frontend/e2e/fixtures/mdm-layout-m201.sql
/usr/bin/git -C <worktree> commit -m "feat(mdm): 레이아웃 버전 표를 표준 칼럼으로 다시 만들고 이력을 RELEASED 구간으로 옮기는 V19 를 추가한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 3: 레이아웃 엔티티·Id 를 버전 키로

**Files (모두 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/`):**
- Modify: `MdmLayout.java` (`eaiCode`·`totalLength`·`layoutVersion` 제거, `status` 추가)
- Modify: `MdmLayoutVer.java`, `MdmLayoutVerId.java` (표준 칼럼, `BigDecimal ver`)
- Modify: `MdmLayoutItem.java`, `MdmLayoutItemId.java`, `MdmLayoutHeader.java`, `MdmLayoutHeaderId.java` (`@Id BigDecimal ver`, `AUD_VER`)
- Modify: `MdmLayoutConst.java`, `MdmLayoutConstId.java` (`headerSeq` → `headerColumnPhys`, `@Id BigDecimal ver`)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmLayoutEntityJpaRoundtripTest.java`, `MdmMasterDataEntityJpaRoundtripTest.java`(레이아웃 행을 만드는 부분), `MdmLayoutVersionMigrationTest.java`(Task 2 에서 `@Disabled` 한 메서드)

**Interfaces:**
- Consumes: `VersionNumbers.scaled/same`(1단계), `VersionKind`
- Produces:
  - `MdmLayout(String layoutKind, String layoutName)` — 새 행 `status = "CREATED"`, `getStatus()`. `STATUS` 칼럼은 `updatable = false`(공통 엔진 `markParentInUse` 만 네이티브로 바꾼다 — 낡은 엔티티 저장이 INUSE 를 CREATED 로 되돌리지 않게). `setSndSystem/setRcvSystem/setLayoutName` 은 그대로.
  - `MdmLayoutVer(Long layoutId, BigDecimal ver, VersionKind verKind, String ownerId)` — `status = "DRAFT"`, `legacySnapshotYn = "N"`, `rowVersion = 0`. 읽기: `getLayoutId()`, `getVer()`(scale 3), `getVerKind()`, `getStatus()`, `getBaseVer()`, `getOwnerId()`, `getApplyFrom()`, `getApplyTo()`, `getRequestedBy()`, `getRequestedAt()`, `getReleasedAt()`, `getRowVersion()`, `getEaiCode()`, `getOwnLength()`, `getSwitchMode()`, `getChangeKinds()`, `getChangeSummary()`, `getSnapshotJson()`, `isLegacySnapshot()`, `isDraft()`, `isReleased()`. 쓰기(엔티티 경로): `setBaseVer`, `setEaiCode`, `setOwnLength`. 시험 준비 전용: `setStatus`, `setApplyFrom`, `setApplyTo`(INSERT 때만 반영 — `updatable = false`).
  - `MdmLayoutItem(Long layoutId, BigDecimal ver, Integer seq, String fillKind)`, `getVer()`
  - `MdmLayoutHeader(Long layoutId, BigDecimal ver, Integer seq, Long headerLayoutId)`, `getVer()`
  - `MdmLayoutConst(Long layoutId, BigDecimal ver, Long headerLayoutId, String headerColumnPhys, String constValue)`, `getHeaderColumnPhys()`
  - Id: `MdmLayoutVerId(Long, BigDecimal)`, `MdmLayoutItemId(Long, BigDecimal, Integer)`, `MdmLayoutHeaderId(Long, BigDecimal, Integer)`, `MdmLayoutConstId(Long, BigDecimal, Long, String)` — `equals` 의 ver 는 `VersionNumbers.same`, `hashCode` 는 `ver.stripTrailingZeros()`

- [ ] **Step 1: 실패하는 시험 작성** — `MdmLayoutEntityJpaRoundtripTest` 를 V19 엔티티로 바꾸고 minor 왕복을 넣는다.

```java
    @Test
    void minorLayoutVersionRoundTripsWithRowsKeyedByVersion() {
        MdmLayout layout = layoutRepository.saveAndFlush(new MdmLayout("MESSAGE", "엔티티 왕복"));
        assertThat(layout.getStatus()).isEqualTo("CREATED");
        Long id = layout.getLayoutId();
        MdmLayoutVer v = new MdmLayoutVer(id, new BigDecimal("1.001"), VersionKind.MINOR, "kim");
        v.setBaseVer(new BigDecimal("1.000"));
        v.setOwnLength(20);
        verRepository.saveAndFlush(v);
        MdmLayoutItem item = new MdmLayoutItem(id, new BigDecimal("1.001"), 1, "FILLER");
        item.setFillerLength(20);
        item.setLength(20);
        itemRepository.saveAndFlush(item);
        em.clear();

        MdmLayoutVer read = verRepository.findById(new MdmLayoutVerId(id, new BigDecimal("1.001"))).orElseThrow();
        assertThat(read.getVer()).isEqualByComparingTo("1.001");
        assertThat(read.getVer().scale()).isEqualTo(3);
        assertThat(read.getVerKind()).isEqualTo(VersionKind.MINOR);
        assertThat(read.isDraft()).isTrue();
        assertThat(read.getOwnLength()).isEqualTo(20);
        assertThat(read.getVersion()).isEqualTo(0L); // 감사 카운터는 AUD_VER
        assertThat(itemRepository.findById(new MdmLayoutItemId(id, new BigDecimal("1.001"), 1))).isPresent();
        assertThat(itemRepository.findById(new MdmLayoutItemId(id, new BigDecimal("1.000"), 1))).isEmpty();
    }
```

(기존 메서드의 `setEaiCode`·`setTotalLength`·`setLayoutVersion` 호출, `new MdmLayoutItem(id, seq, kind)`, `new MdmLayoutConst(id, hid, seq, value)` 는 새 생성자로 바꾼다. 리포지토리·`em` 필드 이름은 그 시험 클래스의 기존 이름을 쓰고, 없으면 `@Autowired` 로 더한다.)

- [ ] **Step 2: 실패 확인**

Run: `cd <worktree>/src/backend/mdm && ../gradlew :api:compileTestJava --offline`
Expected: 컴파일 실패(생성자·`VersionKind`·`getVer`).

- [ ] **Step 3: 구현** — 룰 버전 엔티티(`MdmRuleVer`)와 같은 모양을 따른다. `MdmLayoutVer`(import 는 `MdmRuleVer` 와 같다):

```java
@Entity
@Table(name = "TB_MDM_LAYOUT_VER")
@IdClass(MdmLayoutVerId.class)
@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))
public class MdmLayoutVer extends CactusAuditEntity {

    @Id
    @Column(name = "LAYOUT_ID")
    private Long layoutId;

    @Id
    @Column(name = "VER", nullable = false, precision = 7, scale = 3)
    private BigDecimal ver;

    @Enumerated(EnumType.STRING)
    @Column(name = "VER_KIND", nullable = false, length = 20, updatable = false)
    private VersionKind verKind;

    @Column(name = "STATUS", length = 20, nullable = false, updatable = false)
    private String status;

    @Column(name = "BASE_VER", precision = 7, scale = 3)
    private BigDecimal baseVer;

    @Column(name = "OWNER_ID", length = 50, updatable = false)
    private String ownerId;

    @Column(name = "APPLY_FROM", updatable = false)
    private LocalDateTime applyFrom;

    @Column(name = "APPLY_TO", updatable = false)
    private LocalDateTime applyTo;

    @Column(name = "REQUESTED_BY", length = 50, updatable = false)
    private String requestedBy;

    @Column(name = "REQUESTED_AT", updatable = false)
    private LocalDateTime requestedAt;

    @Column(name = "RELEASED_AT", updatable = false)
    private LocalDateTime releasedAt;

    /** 낙관적 잠금(규칙표 #13). 공통 엔진이 조건부 네이티브 UPDATE 로만 올린다. */
    @Column(name = "ROW_VERSION", nullable = false, updatable = false)
    private long rowVersion;

    /**
     * 전문 버전: 그 전문의 EAI(인코딩·패딩은 EAI 소유, D5). 헤더 버전: 이 헤더를 표준 헤더로 쓸 EAI — 헤더 확정 때
     * {@code TB_MDM_EAI.HEADER_LAYOUT_ID} 로 옮긴다(DRAFT 저장은 공유 EAI 행을 바꾸지 않는다). (P3-15·P3-17 로 대체: EAI 표준 헤더는 시각 T 해석이고 확정은 HEADER_LAYOUT_ID 를 옮기지 않는다)
     */
    @Column(name = "EAI_CODE", length = 20)
    private String eaiCode;

    /** 이 버전 자신의 항목 길이 합 — 헤더는 헤더 길이, 전문은 본문 길이. 전문 총 길이는 시각 T 의 헤더 길이를 더해 합성한다. */
    @Column(name = "OWN_LENGTH", nullable = false)
    private int ownLength;

    /** 확정 때 기록(LayoutConfirmService → LayoutVersionStore.recordConfirm). */
    @Column(name = "SWITCH_MODE", length = 20, updatable = false)
    private String switchMode;

    @Column(name = "CHANGE_KINDS", length = 200, updatable = false)
    private String changeKinds;

    @Column(name = "CHANGE_SUMMARY", updatable = false)
    private String changeSummary;

    /** 확정 때 남기는 본문 스냅샷(LayoutBodySnapshot) 또는 이행 전 합성 스냅샷(LEGACY). */
    @Column(name = "SNAPSHOT_JSON", updatable = false)
    private String snapshotJson;

    @Column(name = "LEGACY_SNAPSHOT_YN", length = 1, nullable = false, updatable = false)
    private String legacySnapshotYn;

    protected MdmLayoutVer() {
        // JPA 기본 생성자
    }

    public MdmLayoutVer(Long layoutId, BigDecimal ver, VersionKind verKind, String ownerId) {
        this.layoutId = layoutId;
        this.ver = VersionNumbers.scaled(ver);
        this.verKind = verKind;
        this.ownerId = ownerId;
        this.status = "DRAFT";
        this.legacySnapshotYn = "N";
        this.rowVersion = 0L;
    }

    public Long getLayoutId() { return layoutId; }
    public BigDecimal getVer() { return VersionNumbers.scaled(ver); }
    public VersionKind getVerKind() { return verKind; }
    public String getStatus() { return status; }
    public BigDecimal getBaseVer() { return VersionNumbers.scaled(baseVer); }
    public String getOwnerId() { return ownerId; }
    public LocalDateTime getApplyFrom() { return applyFrom; }
    public LocalDateTime getApplyTo() { return applyTo; }
    public String getRequestedBy() { return requestedBy; }
    public LocalDateTime getRequestedAt() { return requestedAt; }
    public LocalDateTime getReleasedAt() { return releasedAt; }
    public long getRowVersion() { return rowVersion; }
    public String getEaiCode() { return eaiCode; }
    public int getOwnLength() { return ownLength; }
    public String getSwitchMode() { return switchMode; }
    public String getChangeKinds() { return changeKinds; }
    public String getChangeSummary() { return changeSummary; }
    public String getSnapshotJson() { return snapshotJson; }
    public boolean isLegacySnapshot() { return "Y".equals(legacySnapshotYn); }
    public boolean isDraft() { return "DRAFT".equals(status); }
    public boolean isReleased() { return "RELEASED".equals(status); }

    public void setBaseVer(BigDecimal v) { this.baseVer = VersionNumbers.scaled(v); }
    public void setEaiCode(String v) { this.eaiCode = v; }
    public void setOwnLength(int v) { this.ownLength = v; }

    /** 시험 준비 전용 — INSERT 때만 반영된다(updatable = false). 운영 경로는 공통 엔진이 바꾼다. */
    public void setStatus(String v) { this.status = v; }
    public void setApplyFrom(LocalDateTime v) { this.applyFrom = v; }
    public void setApplyTo(LocalDateTime v) { this.applyTo = v; }
}
```

`MdmLayout` 에서 `eaiCode`·`totalLength`·`layoutVersion` 필드·접근자를 지우고 javadoc 의 `VERSION` 설명을 "업무 버전은 `TB_MDM_LAYOUT_VER`(D-144 3단계). 형식 속성(EAI·길이)도 버전 행에 있다" 로 바꾼다. 상태 칼럼:

```java
    /** CREATED → INUSE(첫 확정, 공통 엔진) → DEPRECATED. 엔티티 저장으로 바꾸지 않는다. */
    @Column(name = "STATUS", length = 20, nullable = false, updatable = false)
    private String status = "CREATED";

    public String getStatus() { return status; }
```

`MdmLayoutItem`·`MdmLayoutHeader`·`MdmLayoutConst` 에 `@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))` 를 달고 `@Id @Column(name = "VER", nullable = false, precision = 7, scale = 3) private BigDecimal ver;` 를 `layoutId` 뒤에 둔다(생성자에서 `VersionNumbers.scaled`, 게터도 scaled). `MdmLayoutConst` 는 `headerSeq` 를 `@Id @Column(name = "HEADER_COLUMN_PHYS", length = 50) private String headerColumnPhys;` 로 바꾼다. Id 클래스(예 `MdmLayoutItemId`, 다른 셋도 같은 형태):

```java
public class MdmLayoutItemId implements Serializable {

    private Long layoutId;
    private BigDecimal ver;
    private Integer seq;

    public MdmLayoutItemId() {
        // JPA 기본 생성자
    }

    public MdmLayoutItemId(Long layoutId, BigDecimal ver, Integer seq) {
        this.layoutId = layoutId;
        this.ver = VersionNumbers.scaled(ver);
        this.seq = seq;
    }

    public Long getLayoutId() { return layoutId; }
    public BigDecimal getVer() { return ver; }
    public Integer getSeq() { return seq; }

    @Override
    public boolean equals(Object o) {
        return o instanceof MdmLayoutItemId other && Objects.equals(layoutId, other.layoutId)
                && VersionNumbers.same(ver, other.ver) && Objects.equals(seq, other.seq);
    }

    @Override
    public int hashCode() {
        return Objects.hash(layoutId, ver == null ? null : ver.stripTrailingZeros(), seq);
    }
}
```

`MdmLayoutVersionMigrationTest` 의 `@Disabled` 메서드는 `MdmLayoutVer(id, new BigDecimal("1.000"), VersionKind.MAJOR, "kim")` 를 저장·조회하는 단언으로 바꾸고 `@Disabled` 를 지운다.

- [ ] **Step 4: 엔티티 단독 확인** — 서비스 컴파일 오류는 Task 4·5 몫이다.

Run: `cd <worktree>/src/backend/mdm && ../gradlew :lib:compileJava --offline 2>&1 | grep -c 'entity/MdmLayout'`
Expected: `0`

- [ ] **Step 5: 스테이징만(커밋은 Task 5 에서 함께 — 중간 커밋이 컴파일되지 않는다)**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmLayout.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmLayoutVer.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmLayoutVerId.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmLayoutItem.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmLayoutItemId.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmLayoutHeader.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmLayoutHeaderId.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmLayoutConst.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmLayoutConstId.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmLayoutEntityJpaRoundtripTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmMasterDataEntityJpaRoundtripTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmLayoutVersionMigrationTest.java
```

---

### Task 4: 시각 T 합성 — 버전 고르기·버전 키 조회·합성기·계약

**Files (경로 접두 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/`):**
- Create: `dmb/layout/LayoutKey.java`, `dmb/layout/LayoutVersions.java`, `dmb/layout/LayoutTimes.java`, `dmb/layout/LayoutComposer.java`, `dmb/layout/LayoutBodySnapshot.java`, `dmb/layout/LayoutLengthRules.java`
- Create: `contract/layout/MdmLayoutSnapshotResolver.java`
- Modify: `dmb/layout/LayoutVersionStore.java`(전체), `dmb/layout/LayoutQueries.java:61-164`(버전 키 조회), `dmb/layout/LayoutSnapshotAssembler.java`(부품 입력·절대 오프셋 합성), `dmb/layout/LayoutSnapshotJson.java:54-57`(`withVersion` 삭제, `writeAny(Object)` 추가), `dmb/layout/LayoutRejections.java`(`noReleased`, `noVersion`), `dmb/layout/LayoutIssueCode.java`(`L16`), `dmb/layout/codec/LayoutAutoValues.java`(`MSG_LENGTH` 가 `public` 이 아니면 연다)
- Modify: `contract/layout/MdmLayoutSnapshot.java`(`long layoutVersion` → `BigDecimal layoutVersion`), `contract/layout/MdmLayoutHeaderRef.java`(끝에 `BigDecimal headerVersion`), `src/backend/mdm/lib/src/main/resources/com/dongkuk/dmes/mdm/contract/layout/layout-snapshot.schema.json`
- Test (Create): `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dmb/layout/LayoutVersionsTest.java`, `LayoutLengthRulesTest.java`
- Test (Create): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/layoutMng/LayoutComposerSqliteTest.java`
- Test (Modify): `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dmb/layout/LayoutSnapshotJsonTest.java`, `LayoutChangeClassifierTest.java`, `codec/M201Snapshots.java`, `codec/LayoutSerializerRoundTripTest.java`, `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/layout/LayoutSnapshotSchemaStructureTest.java`, `src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/contract/layout/m201-snapshot-sample.json`, `src/frontend/m-mdm/tests/fixtures/m201-snapshot.json`

**Interfaces:**
- Consumes: Task 3 엔티티, `VersionNumbers`
- Produces:
  - `record LayoutKey(long layoutId, BigDecimal ver)` — `equals` 는 `VersionNumbers.same`, `hashCode` 는 `stripTrailingZeros`. `static LayoutKey of(MdmLayoutVer v)`
  - `LayoutVersions`(정적): `List<MdmLayoutVer> sortedDesc(Collection<MdmLayoutVer>)`, `Optional<MdmLayoutVer> releasedAt(Collection<MdmLayoutVer>, LocalDateTime t)`, `Optional<MdmLayoutVer> draft(Collection<MdmLayoutVer>)`, `Optional<MdmLayoutVer> previousReleased(Collection<MdmLayoutVer>, BigDecimal ver)`, `Optional<MdmLayoutVer> latestReleased(Collection<MdmLayoutVer>)`, `boolean hasUnapplied(Collection<MdmLayoutVer>, LocalDateTime now)`, `BigDecimal maxVer(Collection<MdmLayoutVer>)`, `MdmLayoutVer editTarget(Collection<MdmLayoutVer>, String me, LocalDateTime now)`, `String state(MdmLayoutVer, LocalDateTime now)` → `"DRAFT"|"CURRENT"|"FUTURE"|"PAST"`
  - `LayoutTimes`(정적): `LocalDateTime asOf(String raw, Clock clock)`, `String text(LocalDateTime)`
  - `LayoutVersionStore`: `List<MdmLayoutVer> versions(Long layoutId)`(최신부터, Java 정렬), `Map<Long, List<MdmLayoutVer>> versionsOf(Collection<Long> ids)`, `Optional<MdmLayoutVer> find(Long layoutId, BigDecimal ver)`, `MdmLayoutVer save(MdmLayoutVer)`, `int recordConfirm(Long layoutId, BigDecimal ver, String switchMode, String changeKinds, String changeSummary, String snapshotJson, AuditStamp stamp)`, `List<MdmLayoutVer> messagesUsingEai(String eaiCode)`
  - `LayoutQueries`: `List<MdmLayoutItem> itemsOf(Long layoutId, BigDecimal ver)`, `List<MdmLayoutHeader> headersOf(Long messageId, BigDecimal ver)`, `List<MdmLayoutConst> constsOf(Long messageId, BigDecimal ver)`, `Map<LayoutKey, List<MdmLayoutItem>> itemsOf(Collection<LayoutKey>)`, `Map<LayoutKey, List<MdmLayoutHeader>> headersOf(Collection<LayoutKey>)`, `List<MdmLayoutHeader> stacksUsing(Long headerLayoutId)`(모든 버전), `List<Object[]> itemsUsingColumns(Collection<String>)` → `{MdmLayoutItem, MdmLayout, MdmLayoutVer}`. 버전 없는 옛 `itemsOf(Long)`·`headersOf(Long)`·`constsOf(Long)`·`constsOfHeader`·`allStacks`·`itemCounts`·`latestVersions`·`messagesStacking`·`itemsOf(Collection<Long>)`·`headersOf(Collection<Long>)`·`constsOf(Collection<Long>)` 는 지운다.
  - `MdmLayoutSnapshotResolver`(계약): `MdmLayoutSnapshot at(long layoutId, LocalDateTime asOf)`
  - `LayoutComposer implements MdmLayoutSnapshotResolver`: `at(...)`, `MdmLayoutSnapshot compose(long messageId, BigDecimal ver, LocalDateTime asOf)`, `Composition composeDetailed(long messageId, BigDecimal ver, LocalDateTime asOf, Map<Long, BigDecimal> headerPins)`, `MdmLayoutSnapshot headerAlone(long headerId, BigDecimal ver)`, `Optional<MdmLayoutVer> headerAt(long headerId, LocalDateTime asOf)`; `record Composition(MdmLayoutSnapshot snapshot, List<OrphanOverride> orphans)`, `record OrphanOverride(long headerLayoutId, String headerColumnPhys, String value)`
  - `LayoutSnapshotAssembler`: `record MessagePart(long layoutId, String layoutName, BigDecimal ver, String eaiCode, String sndSystem, String rcvSystem, int ownLength, List<MdmLayoutItem> body)`, `record HeaderPart(long headerLayoutId, String headerLayoutName, BigDecimal ver, int length, List<MdmLayoutItem> items)`, `MdmLayoutSnapshot assemble(MessagePart, List<HeaderPart>, Map<String, String> overridesByHeaderPhys)`(키 `headerId + ":" + columnPhys`), `MdmLayoutSnapshot fromDraft(LayoutDraft draft, BigDecimal ver, List<HeaderPart> headers)`
  - `record LayoutBodySnapshot(...)`(아래 코드), `LayoutLengthRules.msgLengthIssues(MdmLayoutSnapshot)` → `List<LayoutIssue>`(L16), `LayoutRejections.noReleased(long, String, LocalDateTime)`, `LayoutRejections.noVersion(long, BigDecimal)`, `LayoutSnapshotJson.writeAny(Object)`
  - `MdmLayoutSnapshot.layoutVersion()` 은 `BigDecimal`(LEGACY JSON 의 정수도 읽힌다), `MdmLayoutHeaderRef.headerVersion()` 은 `BigDecimal`(LEGACY 는 null)

- [ ] **Step 1: 실패하는 시험 작성**

`LayoutVersionsTest`(lib, 순수):

```java
package com.dongkuk.dmes.mdm.dmb.layout;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class LayoutVersionsTest {

    private static final LocalDateTime JUL1 = LocalDateTime.of(2026, 7, 1, 0, 0, 0);

    private static MdmLayoutVer released(String ver, LocalDateTime from, LocalDateTime to) {
        MdmLayoutVer v = new MdmLayoutVer(1L, new BigDecimal(ver), VersionKind.MAJOR, null);
        v.setStatus("RELEASED");
        v.setApplyFrom(from);
        v.setApplyTo(to);
        return v;
    }

    private static MdmLayoutVer draft(String ver, String owner) {
        return new MdmLayoutVer(1L, new BigDecimal(ver), VersionKind.MINOR, owner);
    }

    private final List<MdmLayoutVer> all = List.of(
            released("1.000", LocalDateTime.of(2026, 1, 1, 0, 0), JUL1),
            released("1.001", JUL1, LocalDateTime.of(9999, 12, 31, 0, 0)),
            draft("1.002", "kim"));

    @Test
    void releasedAtUsesHalfOpenInterval() {
        assertThat(LayoutVersions.releasedAt(all, JUL1.minusSeconds(1)).orElseThrow().getVer()).isEqualByComparingTo("1.000");
        assertThat(LayoutVersions.releasedAt(all, JUL1).orElseThrow().getVer()).isEqualByComparingTo("1.001");
        assertThat(LayoutVersions.releasedAt(all, LocalDateTime.of(2025, 12, 31, 0, 0))).isEmpty();
    }

    @Test
    void minorOrderingAndPrevious() {
        assertThat(LayoutVersions.sortedDesc(all)).extracting(v -> v.getVer().toPlainString())
                .containsExactly("1.002", "1.001", "1.000");
        assertThat(LayoutVersions.previousReleased(all, new BigDecimal("1.002")).orElseThrow().getVer()).isEqualByComparingTo("1.001");
        assertThat(LayoutVersions.maxVer(all)).isEqualByComparingTo("1.002");
    }

    @Test
    void editTargetPrefersMyDraftThenCurrentRelease() {
        assertThat(LayoutVersions.editTarget(all, "kim", JUL1).getVer()).isEqualByComparingTo("1.002");
        List<MdmLayoutVer> noDraft = all.subList(0, 2);
        assertThat(LayoutVersions.editTarget(noDraft, "kim", JUL1.minusDays(1)).getVer()).isEqualByComparingTo("1.000");
        assertThat(LayoutVersions.state(all.get(1), JUL1.minusDays(1))).isEqualTo("FUTURE");
        assertThat(LayoutVersions.state(all.get(0), JUL1)).isEqualTo("PAST");
        assertThat(LayoutVersions.state(all.get(2), JUL1)).isEqualTo("DRAFT");
        assertThat(LayoutVersions.hasUnapplied(noDraft, JUL1.minusDays(1))).isTrue();
        assertThat(LayoutVersions.hasUnapplied(noDraft, JUL1)).isFalse();
    }
}
```

`LayoutLengthRulesTest`(lib, 순수) — MSG_LENGTH 칸이 합성 총 길이를 담지 못하면 L16:

```java
package com.dongkuk.dmes.mdm.dmb.layout;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemType;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class LayoutLengthRulesTest {

    private static MdmLayoutSnapshot withTotal(int total, int msgLengthWidth) {
        MdmLayoutItemSnapshot len = new MdmLayoutItemSnapshot(1, MdmFillKind.AUTO, MdmLayoutItemType.NUM, "SNT_LTH", null, null, null,
                "MSG_LENGTH", null, null, 0, msgLengthWidth, null, 0);
        MdmLayoutHeaderRef h = new MdmLayoutHeaderRef(1, 100L, "H", 0, msgLengthWidth, List.of(len), new BigDecimal("1.000"));
        return new MdmLayoutSnapshot(201L, "M", null, null, null, null, null, new BigDecimal("1.000"), total, List.of(h), List.of());
    }

    @Test
    void msgLengthFieldMustHoldTotalLength() {
        assertThat(LayoutLengthRules.msgLengthIssues(withTotal(999, 3))).isEmpty();
        assertThat(LayoutLengthRules.msgLengthIssues(withTotal(1000, 3)))
                .singleElement().satisfies(i -> assertThat(i.code()).isEqualTo(LayoutIssueCode.L16));
    }
}
```

`LayoutComposerSqliteTest`(api) — V19 표에 JDBC 로 직접 넣고 합성한다(저장 서비스는 Task 5 몫). 헤더 9100 은 `2026-07-01` 에 길이 10 → 14 로 바뀌고 CONST 항목이 SEQ 1 → 2 로 옮긴다.

```java
package com.dongkuk.dmes.mdm.dmb.layoutMng;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutTestSupport;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutComposer;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/** D-144 3단계 K1 — 전문 버전 T + 헤더 버전 T 합성, [from, to) 경계, RELEASED 없는 헤더는 오류(스펙 §8). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutComposerSqliteTest extends LayoutTestSupport {

    @Autowired
    LayoutComposer composer;

    private static final LocalDateTime JUL1 = LocalDateTime.of(2026, 7, 1, 0, 0, 0);

    @BeforeEach
    void seed() {
        dictionary();
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_CONST WHERE LAYOUT_ID IN (9001, 9002)");
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID IN (9001, 9002)");
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_ITEM WHERE LAYOUT_ID IN (9001, 9002, 9100, 9101)");
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID IN (9001, 9002, 9100, 9101)");
        jdbc.update("DELETE FROM TB_MDM_LAYOUT WHERE LAYOUT_ID IN (9001, 9002, 9100, 9101)");
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, STATUS, VER) VALUES "
                + "(9100, 'HEADER', 'H', 'INUSE', 0), (9101, 'HEADER', 'H2', 'CREATED', 0), "
                + "(9001, 'MESSAGE', 'M', 'INUSE', 0), (9002, 'MESSAGE', 'M2', 'CREATED', 0)");
        ver(9100, "1.000", "RELEASED", "2026-01-01 00:00:00", "2026-07-01 00:00:00", 10);
        ver(9100, "2.000", "RELEASED", "2026-07-01 00:00:00", "9999-12-31 00:00:00", 14);
        ver(9101, "1.000", "DRAFT", null, null, 6);
        ver(9001, "1.000", "RELEASED", "2026-01-01 00:00:00", "9999-12-31 00:00:00", 20);
        ver(9002, "1.000", "DRAFT", null, null, 20);
        item(9100, "1.000", 1, "CONST", "SND_FAC_TP", "B0", null, 0, 4);
        item(9100, "1.000", 2, "FILLER", null, null, 6, 4, 6);
        item(9100, "2.000", 1, "FILLER", null, null, 10, 0, 10);
        item(9100, "2.000", 2, "CONST", "SND_FAC_TP", "B0", null, 10, 4);
        item(9101, "1.000", 1, "FILLER", null, null, 6, 0, 6);
        item(9001, "1.000", 1, "FILLER", null, null, 20, 0, 20);
        item(9002, "1.000", 1, "FILLER", null, null, 20, 0, 20);
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, SEQ, HEADER_LAYOUT_ID) VALUES (9001, 1.000, 1, 9100)");
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, SEQ, HEADER_LAYOUT_ID) VALUES (9002, 1.000, 1, 9101)");
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_CONST (LAYOUT_ID, VER, HEADER_LAYOUT_ID, HEADER_COLUMN_PHYS, CONST_VALUE) "
                + "VALUES (9001, 1.000, 9100, 'SND_FAC_TP', 'B9')");
    }

    private void ver(long id, String ver, String status, String from, String to, int own) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, OWN_LENGTH) "
                + "VALUES (?, ?, 'MAJOR', ?, ?, ?, ?, ?)", id, new BigDecimal(ver), status, "DRAFT".equals(status) ? "kim" : null,
                from, to, own);
    }

    private void item(long id, String ver, int seq, String kind, String phys, String dflt, Integer filler, int offset, int length) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, VER, SEQ, FILL_KIND, COLUMN_PHYS, DEFAULT_VALUE, FILLER_LENGTH, `OFFSET`, `LENGTH`) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, new BigDecimal(ver), seq, kind, phys, dflt, filler, offset, length);
    }

    @Test
    void headerVersionFollowsTimeWhileMessageVersionStays() {
        MdmLayoutSnapshot before = composer.at(9001L, JUL1.minusSeconds(1));
        assertThat(before.layoutVersion()).isEqualByComparingTo("1.000");
        assertThat(before.totalLength()).isEqualTo(30);
        assertThat(before.headers().get(0).headerVersion()).isEqualByComparingTo("1.000");
        assertThat(before.items().get(0).offset()).isEqualTo(10);
        assertThat(before.headers().get(0).items().get(0).overrideValue()).isEqualTo("B9");

        MdmLayoutSnapshot after = composer.at(9001L, JUL1);
        assertThat(after.layoutVersion()).isEqualByComparingTo("1.000");
        assertThat(after.totalLength()).isEqualTo(34);
        assertThat(after.headers().get(0).headerVersion()).isEqualByComparingTo("2.000");
        assertThat(after.items().get(0).offset()).isEqualTo(14);
        // 재정의는 물리명으로 짝지어져 헤더 v2 에서 SEQ 2 로 옮긴 CONST 항목에 붙는다
        assertThat(after.headers().get(0).items().get(1).overrideValue()).isEqualTo("B9");
    }

    @Test
    void noReleasedMessageOrHeaderIsAnErrorNotZeroLength() {
        BusinessException noMessage = assertThrows(BusinessException.class,
                () -> composer.at(9001L, LocalDateTime.of(2025, 12, 31, 0, 0)));
        assertThat(noMessage.getMessage()).contains("9001").contains("2025-12-31 00:00:00");
        BusinessException noHeader = assertThrows(BusinessException.class,
                () -> composer.compose(9002L, new BigDecimal("1.000"), JUL1));
        assertThat(noHeader.getMessage()).contains("9101").contains("2026-07-01 00:00:00");
    }

    @Test
    void pinnedHeaderVersionOverridesTimeResolution() {
        var c = composer.composeDetailed(9001L, new BigDecimal("1.000"), JUL1.minusDays(1), Map.of(9100L, new BigDecimal("2.000")));
        assertThat(c.snapshot().totalLength()).isEqualTo(34);
        assertThat(c.orphans()).isEmpty();
    }

    @Test
    void legacySnapshotVersionIsReturnedAsStored() {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, APPLY_FROM, APPLY_TO, OWN_LENGTH, SNAPSHOT_JSON, "
                + "LEGACY_SNAPSHOT_YN) VALUES (9001, 0.500, 'MAJOR', 'RELEASED', '2025-01-01 00:00:00', '2026-01-01 00:00:00', 0, ?, 'Y')",
                "{\"eaiCode\":null,\"encoding\":null,\"headers\":[],\"items\":[],\"layoutId\":9001,\"layoutName\":\"M\","
                        + "\"layoutVersion\":1,\"padRule\":null,\"rcvSystem\":null,\"sndSystem\":null,\"totalLength\":77}");
        assertThat(composer.at(9001L, LocalDateTime.of(2025, 6, 1, 0, 0)).totalLength()).isEqualTo(77);
    }
}
```

`LayoutSnapshotJsonTest` 에 옛 정수 `layoutVersion`·`headerVersion` 없는 JSON 이 읽히는 사례를 더한다(LEGACY 경로):

```java
    @Test
    void legacyJsonWithIntegerVersionAndNoHeaderVersionStillReads() {
        String legacy = "{\"eaiCode\":\"G1\",\"encoding\":\"EUC-KR\",\"headers\":[{\"headerLayoutId\":100,\"headerLayoutName\":\"H\","
                + "\"items\":[],\"offset\":0,\"seq\":1,\"totalLength\":10}],\"items\":[],\"layoutId\":201,\"layoutName\":\"M\","
                + "\"layoutVersion\":2,\"padRule\":null,\"rcvSystem\":null,\"sndSystem\":null,\"totalLength\":30}";
        MdmLayoutSnapshot s = LayoutSnapshotJson.read(legacy);
        assertThat(s.layoutVersion()).isEqualByComparingTo("2");
        assertThat(s.headers().get(0).headerVersion()).isNull();
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd <worktree>/src/backend/mdm && ../gradlew :lib:compileTestJava --offline`
Expected: 컴파일 실패(`LayoutVersions`·`LayoutComposer` 등 없음).

- [ ] **Step 3: 구현**

`MdmLayoutSnapshotResolver`(계약 — 추상 메서드만, `MdmContractArchitectureTest` 규칙):

```java
package com.dongkuk.dmes.mdm.contract.layout;

import java.time.LocalDateTime;

/**
 * 시각 T 의 전문 스냅샷 — 그 시각에 유효한 전문 RELEASED 버전과, 그 버전이 쌓은 헤더마다 그 시각에 유효한 RELEASED 버전을
 * 합성한다(D-144 K1). {@link MdmLayoutSerializer}·{@link MdmLayoutParser} 는 이 결과를 받는 순수 함수로 남는다 — T 는 여기에 넘긴다.
 * 판정 시각에 RELEASED 전문·헤더가 없으면 예외다(헤더 길이 0 으로 합성하지 않는다).
 */
public interface MdmLayoutSnapshotResolver {

    MdmLayoutSnapshot at(long layoutId, LocalDateTime asOf);
}
```

`MdmLayoutSnapshot` 의 `long layoutVersion` 을 `BigDecimal layoutVersion` 으로, `MdmLayoutHeaderRef` 끝에 `BigDecimal headerVersion` 을 더한다. javadoc: "layoutVersion 은 scale 3 소수 버전(D-144). 이행 전(LEGACY) 스냅샷은 정수로 남아 있다", "headerVersion 은 합성 시각에 고른 헤더 버전. LEGACY 스냅샷은 null". 두 계약 패키지 javadoc(`package-info.java`, `MdmLayoutSerializer`, `MdmLayoutParser`)에 "시각 T 는 `MdmLayoutSnapshotResolver` 가 받는다" 한 줄을 더한다. 스키마(`layout-snapshot.schema.json`): `"layoutVersion": { "type": "number" }`, 헤더 정의에 `"headerVersion": { "type": ["number", "null"] }` 를 넣고 헤더 `required` 에 `"headerVersion"` 을 더한다. 두 m201 샘플 JSON 에 헤더마다 `"headerVersion":1.000` 을 넣고 `layoutVersion` 을 `2.000` 으로 바꾼다(정규화 JSON 이 쓰는 모양 그대로 — `LayoutSnapshotJson.write` 결과를 붙여 넣는다). `M201Snapshots`·`LayoutSerializerRoundTripTest`·`LayoutChangeClassifierTest` 의 생성자 호출에 새 인자(`new BigDecimal("1.000")`)를 넣는다.

`LayoutVersions`:

```java
package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/** 레이아웃 버전 고르기 규칙(D-144 3단계). 버전 비교·정렬은 Java 에서만 한다(SQLite NUMERIC 친화도). 구간은 [APPLY_FROM, APPLY_TO). */
public final class LayoutVersions {

    private static final Comparator<MdmLayoutVer> BY_VER = Comparator.comparing(MdmLayoutVer::getVer);

    private LayoutVersions() {
    }

    public static List<MdmLayoutVer> sortedDesc(Collection<MdmLayoutVer> versions) {
        return versions.stream().sorted(BY_VER.reversed()).toList();
    }

    public static Optional<MdmLayoutVer> releasedAt(Collection<MdmLayoutVer> versions, LocalDateTime t) {
        return versions.stream()
                .filter(v -> v.isReleased() && v.getApplyFrom() != null && v.getApplyTo() != null
                        && !v.getApplyFrom().isAfter(t) && t.isBefore(v.getApplyTo()))
                .max(BY_VER);
    }

    public static Optional<MdmLayoutVer> draft(Collection<MdmLayoutVer> versions) {
        return versions.stream().filter(MdmLayoutVer::isDraft).max(BY_VER);
    }

    public static Optional<MdmLayoutVer> previousReleased(Collection<MdmLayoutVer> versions, BigDecimal ver) {
        return versions.stream().filter(v -> v.isReleased() && v.getVer().compareTo(ver) < 0).max(BY_VER);
    }

    public static Optional<MdmLayoutVer> latestReleased(Collection<MdmLayoutVer> versions) {
        return versions.stream().filter(MdmLayoutVer::isReleased).max(BY_VER);
    }

    /** 미적용 = DRAFT 이거나 apply_from 이 now 보다 뒤인 RELEASED(04:284). */
    public static boolean hasUnapplied(Collection<MdmLayoutVer> versions, LocalDateTime now) {
        return versions.stream().anyMatch(v -> v.isDraft()
                || v.isReleased() && v.getApplyFrom() != null && v.getApplyFrom().isAfter(now));
    }

    public static BigDecimal maxVer(Collection<MdmLayoutVer> versions) {
        return VersionNumbers.maxVer(versions.stream().map(MdmLayoutVer::getVer).toList());
    }

    /** 화면이 열 버전 — 내 DRAFT → 남의 DRAFT → 지금 적용 중 RELEASED → 가장 큰 버전. */
    public static MdmLayoutVer editTarget(Collection<MdmLayoutVer> versions, String me, LocalDateTime now) {
        Optional<MdmLayoutVer> draft = draft(versions);
        if (draft.isPresent() && Objects.equals(draft.get().getOwnerId(), me)) {
            return draft.get();
        }
        return draft.or(() -> releasedAt(versions, now)).orElseGet(() -> versions.stream().max(BY_VER).orElseThrow());
    }

    /** DRAFT · CURRENT(지금 적용 중) · FUTURE(확정됐으나 미적용) · PAST(닫힌 구간). */
    public static String state(MdmLayoutVer v, LocalDateTime now) {
        if (v.isDraft()) {
            return "DRAFT";
        }
        if (v.getApplyFrom() != null && v.getApplyFrom().isAfter(now)) {
            return "FUTURE";
        }
        return v.getApplyTo() != null && !now.isBefore(v.getApplyTo()) ? "PAST" : "CURRENT";
    }
}
```

`LayoutKey`:

```java
package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import java.math.BigDecimal;
import java.util.Objects;

/** (레이아웃, 버전) 키 — 맵 키로 쓰므로 버전은 compareTo 로 같다. */
public record LayoutKey(long layoutId, BigDecimal ver) {

    public LayoutKey {
        ver = VersionNumbers.scaled(ver);
    }

    public static LayoutKey of(MdmLayoutVer v) {
        return new LayoutKey(v.getLayoutId(), v.getVer());
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof LayoutKey k && layoutId == k.layoutId && VersionNumbers.same(ver, k.ver);
    }

    @Override
    public int hashCode() {
        return Objects.hash(layoutId, ver == null ? null : ver.stripTrailingZeros());
    }
}
```

`LayoutTimes`:

```java
package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.List;

/** 판정 시각 T(asOf)·적용 시각 문자열(KST, 'yyyy-MM-dd HH:mm:ss'). 비면 서버 시계의 지금. */
public final class LayoutTimes {

    public static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private LayoutTimes() {
    }

    public static LocalDateTime asOf(String raw, Clock clock) {
        if (raw == null || raw.isBlank()) {
            return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        }
        try {
            return LocalDateTime.parse(raw.trim(), TEXT);
        } catch (DateTimeParseException e) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "시각 형식은 yyyy-MM-dd HH:mm:ss 입니다: " + raw, List.of());
        }
    }

    public static String text(LocalDateTime t) {
        return t == null ? null : TEXT.format(t);
    }
}
```

`LayoutRejections` 에 더한다(전문 = L11, 헤더 = L09 — `LayoutCheckTable` 이 그 코드로 묶는다):

```java
    public static BusinessException noReleased(long layoutId, String kind, LocalDateTime t) {
        boolean header = "HEADER".equals(kind);
        return reject(header ? HEADER_PREFIX : MESSAGE_PREFIX, LayoutIssue.of(header ? LayoutIssueCode.L09 : LayoutIssueCode.L11, null,
                "HEADER_LAYOUT_ID", (header ? "헤더 " : "전문 ") + layoutId + " 에 시각 " + LayoutTimes.text(t) + " 에 확정된 버전이 없습니다"));
    }

    public static BusinessException noVersion(long layoutId, BigDecimal ver) {
        return reject(MESSAGE_PREFIX, LayoutIssue.of(LayoutIssueCode.L11, null, "VER",
                "레이아웃 " + layoutId + " 에 버전 " + VersionNumbers.label(ver) + " 이 없습니다"));
    }
```

`LayoutIssueCode` 끝에:

```java
    /** 합성 총 길이가 MSG_LENGTH(AUTO) 칸 자리수를 넘는다(D-144 3단계 — 헤더 길이 변경 영향). */
    L16
```

`LayoutLengthRules`:

```java
package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.dmb.layout.codec.LayoutAutoValues;
import java.util.ArrayList;
import java.util.List;

/**
 * 총 길이 규칙(D-144 3단계 — 스펙 §7 "헤더 변경 뒤 전문 총 길이 규칙"). 03 에 총 길이 상한은 없다 — 실제로 깨지는 것은 AUTO
 * MSG_LENGTH 칸이 합성 총 길이를 담지 못하는 경우다(직렬화가 넘침으로 실패한다). 부호 형식이면 한 자리를 부호가 쓴다.
 */
public final class LayoutLengthRules {

    private LayoutLengthRules() {
    }

    public static List<LayoutIssue> msgLengthIssues(MdmLayoutSnapshot s) {
        List<LayoutIssue> out = new ArrayList<>();
        int digits = String.valueOf(s.totalLength()).length();
        for (MdmLayoutHeaderRef h : s.headers()) {
            h.items().forEach(i -> check(i, digits, s.totalLength(), "헤더 " + h.headerLayoutName(), out));
        }
        s.items().forEach(i -> check(i, digits, s.totalLength(), "본문", out));
        return out;
    }

    private static void check(MdmLayoutItemSnapshot i, int digits, int total, String where, List<LayoutIssue> out) {
        if (i.fillKind() != MdmFillKind.AUTO || !LayoutAutoValues.MSG_LENGTH.equals(i.defaultValue())) {
            return;
        }
        int width = i.length() - (i.numFormat() != null && i.numFormat().sign() ? 1 : 0);
        if (digits > width) {
            out.add(LayoutIssue.of(LayoutIssueCode.L16, i.seq(), "LENGTH",
                    where + " 전문 길이 칸(" + i.columnPhys() + ", " + width + "자리)이 총 길이 " + total + " 를 담지 못합니다"));
        }
    }
}
```

`LayoutVersionStore`(전체 교체 — import 는 `LayoutQueries`·`VersionNumbers`·`MdmTemporalBinder`·`AuditStamp`·`NativeQuery` 등):

```java
@Component
public class LayoutVersionStore {

    private final EntityManager em;
    private final MdmLayoutVerRepository repository;
    private final MdmTemporalBinder temporal;

    public LayoutVersionStore(EntityManager em, MdmLayoutVerRepository repository, MdmTemporalBinder temporal) {
        this.em = em;
        this.repository = repository;
        this.temporal = temporal;
    }

    /** 최신부터 — 정렬은 Java(규칙표 #17). */
    public List<MdmLayoutVer> versions(Long layoutId) {
        return LayoutVersions.sortedDesc(em.createQuery("SELECT v FROM MdmLayoutVer v WHERE v.layoutId = :id", MdmLayoutVer.class)
                .setParameter("id", layoutId).getResultList());
    }

    public Map<Long, List<MdmLayoutVer>> versionsOf(Collection<Long> layoutIds) {
        Map<Long, List<MdmLayoutVer>> out = new LinkedHashMap<>();
        for (List<Long> chunk : LayoutQueries.chunks(layoutIds)) {
            for (MdmLayoutVer v : em.createQuery("SELECT v FROM MdmLayoutVer v WHERE v.layoutId IN :ids", MdmLayoutVer.class)
                    .setParameter("ids", chunk).getResultList()) {
                out.computeIfAbsent(v.getLayoutId(), k -> new ArrayList<>()).add(v);
            }
        }
        out.replaceAll((k, list) -> LayoutVersions.sortedDesc(list));
        return out;
    }

    public Optional<MdmLayoutVer> find(Long layoutId, BigDecimal ver) {
        return repository.findById(new MdmLayoutVerId(layoutId, VersionNumbers.scaled(ver)));
    }

    public MdmLayoutVer save(MdmLayoutVer v) {
        return repository.saveAndFlush(v);
    }

    /** 이 EAI 를 쓰는 전문 버전(상태 무관) — EAI 인코딩·패딩 변경 거부에 쓴다. */
    public List<MdmLayoutVer> messagesUsingEai(String eaiCode) {
        return em.createQuery("SELECT v FROM MdmLayoutVer v WHERE v.eaiCode = :code", MdmLayoutVer.class)
                .setParameter("code", eaiCode).getResultList();
    }

    /** 확정 기록 — 공통 엔진이 RELEASED 로 바꾼 같은 트랜잭션에서 분류·전환·스냅샷만 네이티브로 쓴다(엔티티 칼럼은 updatable=false). */
    public int recordConfirm(Long layoutId, BigDecimal ver, String switchMode, String changeKinds, String changeSummary,
                             String snapshotJson, AuditStamp stamp) {
        em.flush();
        NativeQuery<?> q = em.createNativeQuery("UPDATE TB_MDM_LAYOUT_VER SET SWITCH_MODE = :mode, CHANGE_KINDS = :kinds, "
                        + "CHANGE_SUMMARY = :summary, SNAPSHOT_JSON = :json, U_USR_ID = :uUsrId, U_AT = :uAt, U_SVC_ID = :uSvcId, "
                        + "U_PGM_ID = :uPgmId, AUD_VER = COALESCE(AUD_VER, 0) + 1 "
                        + "WHERE LAYOUT_ID = :id AND VER = :ver AND STATUS = 'RELEASED'")
                .unwrap(NativeQuery.class);
        q.setParameter("mode", switchMode, String.class);
        q.setParameter("kinds", changeKinds, String.class);
        q.setParameter("summary", changeSummary, String.class);
        q.setParameter("json", snapshotJson, String.class);
        q.setParameter("uUsrId", stamp.userId(), String.class);
        q.setParameter("uAt", temporal.toDb(stamp.at()));
        q.setParameter("uSvcId", stamp.serviceId(), String.class);
        q.setParameter("uPgmId", stamp.programId(), String.class);
        q.setParameter("id", layoutId);
        q.setParameter("ver", VersionNumbers.scaled(ver));
        return q.executeUpdate();
    }
}
```

(`VersionRowStore.bindAudit` 가 `temporal.toDb(stamp.at())` 를 그대로 쓰므로 같은 호출이다.)

`LayoutQueries` — 단건 조회 세 개를 버전 키로 바꾼다(바인딩은 `VersionNumbers.scaled`):

```java
    public List<MdmLayoutItem> itemsOf(Long layoutId, BigDecimal ver) {
        return em.createQuery("SELECT i FROM MdmLayoutItem i WHERE i.layoutId = :id AND i.ver = :ver ORDER BY i.seq",
                        MdmLayoutItem.class)
                .setParameter("id", layoutId).setParameter("ver", VersionNumbers.scaled(ver)).getResultList();
    }

    public List<MdmLayoutHeader> headersOf(Long messageId, BigDecimal ver) {
        return em.createQuery("SELECT h FROM MdmLayoutHeader h WHERE h.layoutId = :id AND h.ver = :ver ORDER BY h.seq",
                        MdmLayoutHeader.class)
                .setParameter("id", messageId).setParameter("ver", VersionNumbers.scaled(ver)).getResultList();
    }

    public List<MdmLayoutConst> constsOf(Long messageId, BigDecimal ver) {
        return em.createQuery("SELECT c FROM MdmLayoutConst c WHERE c.layoutId = :id AND c.ver = :ver "
                        + "ORDER BY c.headerLayoutId, c.headerColumnPhys", MdmLayoutConst.class)
                .setParameter("id", messageId).setParameter("ver", VersionNumbers.scaled(ver)).getResultList();
    }
```

묶음 조회는 레이아웃 ID IN 으로 모든 버전 행을 읽고 Java 에서 키로 거른다(버전 IN 바인딩을 피한다):

```java
    public Map<LayoutKey, List<MdmLayoutItem>> itemsOf(Collection<LayoutKey> keys) {
        Set<LayoutKey> wanted = new HashSet<>(keys);
        Map<LayoutKey, List<MdmLayoutItem>> out = new LinkedHashMap<>();
        for (List<Long> chunk : chunks(keys.stream().map(LayoutKey::layoutId).distinct().toList())) {
            for (MdmLayoutItem i : em.createQuery("SELECT i FROM MdmLayoutItem i WHERE i.layoutId IN :ids ORDER BY i.layoutId, i.seq",
                    MdmLayoutItem.class).setParameter("ids", chunk).getResultList()) {
                LayoutKey k = new LayoutKey(i.getLayoutId(), i.getVer());
                if (wanted.contains(k)) {
                    out.computeIfAbsent(k, x -> new ArrayList<>()).add(i);
                }
            }
        }
        return out;
    }
```

`headersOf(Collection<LayoutKey>)` 도 같은 모양(`MdmLayoutHeader`, `ORDER BY h.layoutId, h.seq`). `stacksUsing(Long)` 은 버전 조건 없이 그대로 둔다(모든 버전 행 — 호출자가 버전 상태로 거른다). `itemsUsingColumns` 는 버전 행을 함께 읽는다:

```java
    public List<Object[]> itemsUsingColumns(Collection<String> physNames) {
        if (physNames.isEmpty()) {
            return List.of();
        }
        return em.createQuery("SELECT i, l, v FROM MdmLayoutItem i, MdmLayout l, MdmLayoutVer v WHERE l.layoutId = i.layoutId "
                        + "AND v.layoutId = i.layoutId AND v.ver = i.ver AND i.columnPhys IN :phys ORDER BY l.layoutName, i.layoutId, i.seq",
                Object[].class).setParameter("phys", physNames).getResultList();
    }
```

`LayoutSnapshotAssembler` — `read`·`readAll`·`stored`·`direct`·`Reads` 를 지우고 부품을 받는 `assemble` 로 둔다. `Row.of(MdmLayoutItem i, int offset)` 로 오프셋을 밖에서 받게 바꾼다. 핵심:

```java
    public record MessagePart(long layoutId, String layoutName, BigDecimal ver, String eaiCode, String sndSystem, String rcvSystem,
                              int ownLength, List<MdmLayoutItem> body) {
    }

    public record HeaderPart(long headerLayoutId, String headerLayoutName, BigDecimal ver, int length, List<MdmLayoutItem> items) {
    }

    public MdmLayoutSnapshot assemble(MessagePart m, List<HeaderPart> headers, Map<String, String> overridesByHeaderPhys) {
        List<Row> body = new ArrayList<>();
        int headerTotal = headers.stream().mapToInt(HeaderPart::length).sum();
        for (MdmLayoutItem it : m.body()) {
            body.add(Row.of(it, headerTotal + it.getOffset())); // 저장값은 본문 기준 상대 → 계약은 절대(F23)
        }
        return build(m.layoutId(), m.layoutName(), m.ver(), m.eaiCode(), m.sndSystem(), m.rcvSystem(), headerTotal + m.ownLength(),
                headers, overridesByHeaderPhys, body);
    }

    private MdmLayoutSnapshot build(long layoutId, String name, BigDecimal ver, String eaiCode, String snd, String rcv, int total,
                                    List<HeaderPart> headers, Map<String, String> overrides, List<Row> body) {
        List<String> phys = new ArrayList<>();
        headers.forEach(h -> h.items().stream().map(MdmLayoutItem::getColumnPhys).filter(Objects::nonNull).forEach(phys::add));
        body.stream().map(Row::columnPhys).filter(Objects::nonNull).forEach(phys::add);
        Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(phys);
        List<MdmLayoutHeaderRef> refs = new ArrayList<>();
        int at = 0;
        for (int i = 0; i < headers.size(); i++) {
            HeaderPart h = headers.get(i);
            List<MdmLayoutItemSnapshot> items = new ArrayList<>();
            for (MdmLayoutItem it : h.items()) {
                String override = MdmFillKind.CONST.name().equals(it.getFillKind()) && it.getColumnPhys() != null
                        ? overrides.get(h.headerLayoutId() + ":" + it.getColumnPhys()) : null;
                items.add(item(Row.of(it, it.getOffset()), override, dict));
            }
            refs.add(new MdmLayoutHeaderRef(i + 1, h.headerLayoutId(), h.headerLayoutName(), at, h.length(), List.copyOf(items), h.ver()));
            at += h.length();
        }
        List<MdmLayoutItemSnapshot> items = new ArrayList<>();
        for (Row r : body) {
            items.add(item(r, null, dict));
        }
        MdmEai eai = eaiCode == null ? null : eaiRepository.findById(eaiCode).orElse(null);
        return new MdmLayoutSnapshot(layoutId, name, eaiCode, snd, rcv, eai == null ? null : eai.getEncoding(),
                eai == null ? null : eai.getPadRule(), VersionNumbers.scaled(ver), total, List.copyOf(refs), List.copyOf(items));
    }
```

`fromDraft(LayoutDraft draft, BigDecimal ver, List<HeaderPart> headers)` 는 초안 항목(본문 상대 오프셋 `draft.bodyOffsets()`, Task 5)을 `Row` 로 만들어 `build` 를 탄다 — 오프셋 = 헤더 합 + 상대, 총 길이 = 헤더 합 + `draft.ownLength()`, 재정의 키 = `ConstRow.headerLayoutId() + ":" + ConstRow.headerColumnPhys()`, 새 전문이면 `layoutId` 0·`ver` 는 `VersionNumbers.FIRST`.

`LayoutComposer`:

```java
package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshotResolver;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * 시각 T 합성(D-144 K1) — 전문 버전 하나 + 그 버전이 쌓은 헤더마다 T 에 유효한 RELEASED 버전. 상수 재정의는 헤더 항목 물리명으로
 * 짝짓는다. LEGACY 버전(이행 전 이력)은 저장된 합성 스냅샷을 그대로 돌려준다(스펙 §7 이행 한계).
 */
@Component
public class LayoutComposer implements MdmLayoutSnapshotResolver {

    private static final String HEADER = "HEADER";
    private static final String MESSAGE = "MESSAGE";

    private final LayoutVersionStore store;
    private final LayoutQueries queries;
    private final LayoutSnapshotAssembler assembler;
    private final MdmLayoutRepository layoutRepository;

    public LayoutComposer(LayoutVersionStore store, LayoutQueries queries, LayoutSnapshotAssembler assembler,
                          MdmLayoutRepository layoutRepository) {
        this.store = store;
        this.queries = queries;
        this.assembler = assembler;
        this.layoutRepository = layoutRepository;
    }

    /** 재정의 대상이 그 시각의 헤더 버전에 CONST 항목으로 없을 때 — 직렬화는 헤더 기본값을 쓴다. 헤더 확정 화면이 경고로 보인다. */
    public record OrphanOverride(long headerLayoutId, String headerColumnPhys, String value) {
    }

    public record Composition(MdmLayoutSnapshot snapshot, List<OrphanOverride> orphans) {
    }

    @Override
    public MdmLayoutSnapshot at(long layoutId, LocalDateTime asOf) {
        MdmLayoutVer v = LayoutVersions.releasedAt(store.versions(layoutId), asOf)
                .orElseThrow(() -> LayoutRejections.noReleased(layoutId, MESSAGE, asOf));
        return compose(layoutId, v.getVer(), asOf);
    }

    public MdmLayoutSnapshot compose(long messageId, BigDecimal ver, LocalDateTime asOf) {
        return composeDetailed(messageId, ver, asOf, Map.of()).snapshot();
    }

    /** headerPins 에 있는 헤더는 시각과 무관하게 그 버전을 쓴다(헤더 확정 영향도 — 확정 전 DRAFT 로 합성). */
    public Composition composeDetailed(long messageId, BigDecimal ver, LocalDateTime asOf, Map<Long, BigDecimal> headerPins) {
        MdmLayout layout = layoutRepository.findById(messageId).filter(l -> MESSAGE.equals(l.getLayoutKind()))
                .orElseThrow(() -> LayoutRejections.notFound(messageId, MESSAGE));
        MdmLayoutVer v = store.find(messageId, ver).orElseThrow(() -> LayoutRejections.noVersion(messageId, ver));
        if (v.isLegacySnapshot()) {
            return new Composition(LayoutSnapshotJson.read(v.getSnapshotJson()), List.of());
        }
        List<LayoutSnapshotAssembler.HeaderPart> parts = new ArrayList<>();
        Map<Long, Set<String>> constPhysByHeader = new HashMap<>();
        for (MdmLayoutHeader h : queries.headersOf(messageId, v.getVer())) {
            long hid = h.getHeaderLayoutId();
            MdmLayoutVer hv = headerPins.containsKey(hid)
                    ? store.find(hid, headerPins.get(hid)).orElseThrow(() -> LayoutRejections.noVersion(hid, headerPins.get(hid)))
                    : headerAt(hid, asOf).orElseThrow(() -> LayoutRejections.noReleased(hid, HEADER, asOf));
            MdmLayout hl = layoutRepository.findById(hid).orElseThrow(() -> LayoutRejections.notFound(hid, HEADER));
            List<MdmLayoutItem> items = queries.itemsOf(hid, hv.getVer());
            constPhysByHeader.put(hid, items.stream().filter(i -> MdmFillKind.CONST.name().equals(i.getFillKind()))
                    .map(MdmLayoutItem::getColumnPhys).filter(Objects::nonNull).collect(Collectors.toSet()));
            parts.add(new LayoutSnapshotAssembler.HeaderPart(hid, hl.getLayoutName(), hv.getVer(), hv.getOwnLength(), items));
        }
        Map<String, String> overrides = new HashMap<>();
        List<OrphanOverride> orphans = new ArrayList<>();
        for (MdmLayoutConst c : queries.constsOf(messageId, v.getVer())) {
            if (constPhysByHeader.getOrDefault(c.getHeaderLayoutId(), Set.of()).contains(c.getHeaderColumnPhys())) {
                overrides.put(c.getHeaderLayoutId() + ":" + c.getHeaderColumnPhys(), c.getConstValue());
            } else {
                orphans.add(new OrphanOverride(c.getHeaderLayoutId(), c.getHeaderColumnPhys(), c.getConstValue()));
            }
        }
        MdmLayoutSnapshot s = assembler.assemble(new LayoutSnapshotAssembler.MessagePart(messageId, layout.getLayoutName(), v.getVer(),
                v.getEaiCode(), layout.getSndSystem(), layout.getRcvSystem(), v.getOwnLength(), queries.itemsOf(messageId, v.getVer())),
                parts, overrides);
        return new Composition(s, List.copyOf(orphans));
    }

    /** 헤더 한 버전을 헤더 없는 전문처럼 — 헤더 확정의 변경 분류 입력(항목은 본문 자리, 헤더 안 상대 오프셋 = 절대). */
    public MdmLayoutSnapshot headerAlone(long headerId, BigDecimal ver) {
        MdmLayout hl = layoutRepository.findById(headerId).filter(l -> HEADER.equals(l.getLayoutKind()))
                .orElseThrow(() -> LayoutRejections.notFound(headerId, HEADER));
        MdmLayoutVer hv = store.find(headerId, ver).orElseThrow(() -> LayoutRejections.noVersion(headerId, ver));
        return assembler.assemble(new LayoutSnapshotAssembler.MessagePart(headerId, hl.getLayoutName(), hv.getVer(), null, null, null,
                hv.getOwnLength(), queries.itemsOf(headerId, hv.getVer())), List.of(), Map.of());
    }

    public Optional<MdmLayoutVer> headerAt(long headerId, LocalDateTime asOf) {
        return LayoutVersions.releasedAt(store.versions(headerId), asOf);
    }
}
```

`LayoutBodySnapshot`(확정 때 `SNAPSHOT_JSON` — 스펙 §7 "본문만"):

```java
package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import java.util.List;

/**
 * 확정 때 버전 행에 남기는 본문 스냅샷. 헤더는 ID 만 담는다 — 헤더 내용은 판정 시각에 고른다(K1). 항목 offset 은 저장값 그대로(헤더
 * 버전은 헤더 안 상대, 전문 버전은 본문 기준 상대). LEGACY 스냅샷(MdmLayoutSnapshot)과 모양이 다르다 — 읽는 쪽은
 * {@link MdmLayoutVer#isLegacySnapshot()} 으로 가른다.
 */
public record LayoutBodySnapshot(long layoutId, String ver, String layoutKind, String layoutName, String eaiCode, String sndSystem,
                                 String rcvSystem, int ownLength, List<Long> headerIds, List<Const> consts,
                                 List<MdmLayoutItemSnapshot> items) {

    public record Const(long headerLayoutId, String headerColumnPhys, String value) {
    }

    public static LayoutBodySnapshot of(MdmLayout layout, MdmLayoutVer v, List<MdmLayoutHeader> stack, List<MdmLayoutConst> consts,
                                        List<MdmLayoutItemSnapshot> items) {
        return new LayoutBodySnapshot(layout.getLayoutId(), VersionNumbers.plain(v.getVer()), layout.getLayoutKind(),
                layout.getLayoutName(), v.getEaiCode(), layout.getSndSystem(), layout.getRcvSystem(), v.getOwnLength(),
                stack.stream().map(MdmLayoutHeader::getHeaderLayoutId).toList(),
                consts.stream().map(c -> new Const(c.getHeaderLayoutId(), c.getHeaderColumnPhys(), c.getConstValue())).toList(),
                List.copyOf(items));
    }
}
```

`LayoutSnapshotJson` — `withVersion` 을 지우고(자동 +1 비교용이었다) `public static String writeAny(Object value)` 를 더한다(같은 정규화 mapper, 실패하면 `IllegalStateException`).

- [ ] **Step 4: 부분 확인** — 서비스(`LayoutMngService`·`HeaderMngService`·`LayoutDraftBuilder`·`LayoutWriter`·`LayoutVersioner`·`LayoutImpactFinder`·`LayoutItemReferenceSpi`)의 컴파일 오류는 Task 5·10 몫이다.

Run: `cd <worktree>/src/backend/mdm && ../gradlew :lib:compileJava --offline 2>&1 | grep -E '(LayoutComposer|LayoutVersions|LayoutKey|LayoutTimes|LayoutBodySnapshot|LayoutLengthRules|LayoutVersionStore|LayoutQueries|LayoutSnapshotAssembler|contract/layout/)' | grep -c error`
Expected: `0`

- [ ] **Step 5: 스테이징만(커밋은 Task 5)**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/layout src/backend/mdm/lib/src/main/resources/com/dongkuk/dmes/mdm/contract/layout/layout-snapshot.schema.json src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dmb/layout src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/layout src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/contract/layout/m201-snapshot-sample.json src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/layoutMng/LayoutComposerSqliteTest.java src/frontend/m-mdm/tests/fixtures/m201-snapshot.json
```

---

### Task 5: 저장은 내 DRAFT 에만 — 자동 +1(I15)·헤더 연쇄 재계산(I18) 폐지, 조회·내보내기·샘플은 시각 T

**Files (경로 접두 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/`):**
- Modify DTO: `layoutMng/dto/LayoutMngSaveRequest.java`(`Long ver` → `String ver`, `Long rowVersion`·`String asOf` 추가), `layoutMng/dto/LayoutMngExecuteRequest.java`(`String ver`, `String asOf`, `toSaveRequest()` 가 둘을 옮긴다), `layoutMng/dto/LayoutMngExportRequest.java`(`Long layoutVersion` → `String ver`, `String asOf` 추가), `layoutMng/dto/LayoutMngViewRequest.java`(`String ver`, `String asOf`), `headerMng/dto/HeaderMngSaveRequest.java`(`String ver`, `Long rowVersion`), `headerMng/dto/HeaderMngViewRequest.java`(`String ver`)
- Modify: `layout/LayoutDraft.java`, `layout/LayoutDraftBuilder.java:63-165`, `layout/LayoutRows.java:62-79`, `layout/LayoutWriter.java`(전체), `layout/LayoutVersions.java`(인자 도우미 둘 추가)
- Delete: `layout/LayoutVersioner.java`
- Modify: `layoutMng/service/LayoutMngService.java`(전체 액션), `headerMng/service/HeaderMngService.java`(전체 액션)
- Modify: `src/backend/mdm/api/src/main/resources/services/dmb/layoutMng.bpmn`·`headerMng.bpmn`(문서 문구만: "저장은 내 DRAFT 에만, 버전은 새 버전 액션으로")
- Test (Create): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/LayoutServiceTestSupport.java`, `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/layoutMng/LayoutDraftSaveSqliteTest.java`
- Test (Modify): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/LayoutTestSupport.java`(저장 도우미를 새 지원 클래스로 옮김), `dmb/layoutMng/LayoutVersionSqliteTest.java`(I15 시험 → 부정 시험), `dmb/headerMng/HeaderMngServiceSqliteTest.java:167-228,307-`(I18·D7 재짝짓기 시험 → 부정 시험·물리명 짝), `dmb/headerMng/HeaderMngQueryCountTest.java:117-121`, `dmb/layoutMng/LayoutMngQueryCountTest.java:88-89`, `dmb/layoutMng/LayoutMngServiceSqliteTest.java`, `dmb/layoutMng/LayoutRegistrationSqliteTest.java`, `dmb/layoutMng/LayoutSampleSqliteTest.java`, `dmb/LayoutOasisFlowTest.java`

**Interfaces:**
- Consumes: Task 1 `VersionTarget.LAYOUT`, 공통 `VersionWriteGuard.beginDraftWrite`, Task 3 엔티티, Task 4 `LayoutComposer`·`LayoutVersions`·`LayoutTimes`·`LayoutVersionStore`·`LayoutQueries`·`LayoutSnapshotAssembler`
- Produces:
  - `LayoutVersions.requireVer(String raw)` → `BigDecimal`(비면·형식 오류면 INVALID_INPUT), `LayoutVersions.requireRowVersion(Long raw)` → `long`(null 이면 INVALID_INPUT)
  - `record LayoutDraft(Long layoutId, String layoutName, String eaiCode, String sndSystem, String rcvSystem, List<Long> headerIds, List<ConstRow> consts, List<LayoutItemDraft> items, List<Integer> itemLengths, List<Integer> bodyOffsets, int ownLength, List<LayoutSnapshotAssembler.HeaderPart> headers)`; `record ConstRow(long headerLayoutId, int headerSeq, String headerColumnPhys, String value)`. 총 길이 = `headers` 길이 합 + `ownLength`.
  - `LayoutDraftBuilder.build(LayoutMngSaveRequest, List<Map> headers, List<Map> consts, List<Map> items, LocalDateTime asOf, boolean insertEaiHeader)` → `Built(LayoutDraft draft, List<LayoutIssue> issues, List<LayoutIssue> warnings, MdmLayout target, MdmEai eai, Map<String, LayoutColumnInfo> dictionary)`. 쌓은 헤더에 `asOf` 시점 RELEASED 가 없으면 L09. `insertEaiHeader` 가 참이고 EAI 표준 헤더가 구성에 없을 때만, 그리고 그 헤더에 `asOf` 시점 RELEASED 가 있을 때만 맨 앞에 끼운다(I14). 화면 경로(save·validate·execute)는 `true`, 확정 검사(`buildStored`, Task 7)는 `false`.
  - `HeaderMngService.save` 는 요청 EAI 를 헤더 버전 행 `EAI_CODE` 에 저장한다. `TB_MDM_EAI.HEADER_LAYOUT_ID` 는 바꾸지 않는다(Task 7 확정이 옮긴다). 새 EAI 행은 `HEADER_LAYOUT_ID = null` 로 만든다.
  - `LayoutWriter`: `MdmLayout saveLayout(MdmLayout)`, `void replaceVersionRows(Long layoutId, BigDecimal ver, List<Long> headerIds, List<MdmLayoutConst> consts, List<MdmLayoutItem> items)`, `void replaceItems(Long layoutId, BigDecimal ver, List<MdmLayoutItem> items)`, `void copyVersionRows(Long layoutId, BigDecimal from, BigDecimal to)`, `void deleteVersionRows(Long layoutId, BigDecimal ver)`. `recalculateUsers`·`deleteConsts`·`insertConsts` 삭제.
  - `LayoutRows.entities(Long layoutId, BigDecimal ver, List<LayoutItemDraft>, List<Integer> lengths, List<Integer> offsets)`
  - OASIS `layoutMng/save` 응답: `{layoutId, ver: "1.000", rowVersion, ownLength, headerLength, totalLength, asOf}`. 요청: 등록이면 `layoutId` 없음, 수정이면 `layoutId`·`ver`·`rowVersion` 필수.
  - OASIS `layoutMng/view` 요청 `{layoutId, ver?, asOf?}` → `{layout:{LAYOUT_ID, LAYOUT_NAME, EAI_CODE, SND_SYSTEM, RCV_SYSTEM, STATUS, TOTAL_LENGTH, HEADER_LENGTH, OWN_LENGTH, AUD_VER}, selected:{VER, VER_KIND, STATUS, STATE, OWNER_ID, ROW_VERSION, APPLY_FROM, APPLY_TO, BASE_VER, LEGACY}, editable, asOf, headers[*]:{..., HEADER_VER, HEADER_STATE}, items, units, versions[*]:{VER, VER_KIND, STATUS, STATE, BASE_VER, OWNER_ID, APPLY_FROM, APPLY_TO, ROW_VERSION, OWN_LENGTH, SWITCH_MODE, CHANGE_KINDS, CHANGE_SUMMARY, LEGACY, REQUESTED_BY, RELEASED_AT}}`(버전 행 키 `VER` 는 문자열)
  - OASIS `layoutMng/search` 목록 행: `{LAYOUT_ID, LAYOUT_NAME, EAI_CODE, SND_SYSTEM, RCV_SYSTEM, STATUS, CURRENT_VER, DRAFT_VER, DRAFT_OWNER, HEADER_SUMMARY, ITEM_COUNT, TOTAL_LENGTH, AUD_VER}` — 현재 적용 버전 기준, 길이는 지금 시각 합성
  - OASIS `layoutMng/export` 요청 `{layoutId, ver?, asOf?}` → `{layoutId, ver, asOf, fileBase, snapshot, names}`; `execute` 요청에 `asOf`
  - OASIS `headerMng/save` 응답 `{layoutId, ver, rowVersion, totalLength}` — `recalculated`·`versioned`·`droppedOverrides` 없음. `headerMng/view` 응답 `header.{..., STATUS, AUD_VER}`, `selected`, `editable`, `versions`, `usedBy[*]:{LAYOUT_ID, LAYOUT_NAME, SND_SYSTEM, RCV_SYSTEM, VER, STATE, HEADER_SEQ, TOTAL_LENGTH}`(TOTAL_LENGTH 는 지금 시각 합성, DRAFT 는 지금 시각 헤더로)
  - 시험 지원 `LayoutServiceTestSupport`: `KIM`, `user`, `clock`, `release(long layoutId, String ver, String applyFrom)`, `saveHeader`/`saveLayout`/`saveL100`/`saveL110`/`m201()` 은 여기로 옮기고 헤더는 `2026-01-01 00:00:00` 에, 전문은 `2026-02-01 00:00:00` 에 release 한다

- [ ] **Step 1: 실패하는 시험 작성**

`LayoutServiceTestSupport`(새 지원 클래스 — 서비스를 바로 부르는 레이아웃 시험이 상속한다. 각 하위 시험 클래스에 `@Import(DmeTestSupport.Config.class)` 를 단다. `LayoutOasisFlowTest` 는 HTTP 헤더로 사용자를 주므로 상속하지 않는다):

```java
package com.dongkuk.dmes.mdm.dmb;

import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * D-144 3단계 — 서비스를 트랜잭션 없이 부르는 레이아웃 시험 공용. 현재 사용자 kim(담당자·표준 관리자), 시계 2026-06-15 09:00(KST).
 * 확정 서비스(Task 7) 없이 버전을 RELEASED 로 만드는 {@link #release} 를 준다 — 시험 준비 전용(운영 경로는 공통 엔진).
 */
public abstract class LayoutServiceTestSupport extends LayoutTestSupport {

    public static final String KIM = "kim";
    public static final String HEADER_FROM = "2026-01-01 00:00:00";
    public static final String MESSAGE_FROM = "2026-02-01 00:00:00";

    @Autowired
    protected DmeTestSupport.MutableCurrentUser user;
    @Autowired
    protected MutableClock clock;

    @BeforeEach
    void asSteward() {
        user.set(KIM, Set.of(MdmRoles.STEWARD, MdmRoles.STD_ADMIN));
        clock.setLocal(DmeTestSupport.NOW);
    }

    /** DRAFT → RELEASED(구간 [applyFrom, 9999)), 직전 열린 RELEASED 를 applyFrom 에서 닫고 부모를 INUSE 로. */
    protected void release(long layoutId, String ver, String applyFrom) {
        jdbc.update("UPDATE TB_MDM_LAYOUT_VER SET APPLY_TO = ? WHERE LAYOUT_ID = ? AND STATUS = 'RELEASED' "
                + "AND APPLY_TO = '9999-12-31 00:00:00'", applyFrom, layoutId);
        jdbc.update("UPDATE TB_MDM_LAYOUT_VER SET STATUS = 'RELEASED', APPLY_FROM = ?, APPLY_TO = '9999-12-31 00:00:00', "
                + "REQUESTED_BY = ?, REQUESTED_AT = ?, RELEASED_AT = ? WHERE LAYOUT_ID = ? AND VER = ?",
                applyFrom, KIM, applyFrom, applyFrom, layoutId, new BigDecimal(ver));
        jdbc.update("UPDATE TB_MDM_LAYOUT SET STATUS = 'INUSE' WHERE LAYOUT_ID = ?", layoutId);
        // 헤더 확정과 같게 EAI 표준 헤더 연결을 옮긴다(Task 7 LayoutConfirmService.linkEai 와 같은 SQL) (P3-15·P3-17 로 대체: EAI 표준 헤더는 시각 T 해석이고 확정은 HEADER_LAYOUT_ID 를 옮기지 않는다)
        String eai = jdbc.queryForObject("SELECT EAI_CODE FROM TB_MDM_LAYOUT_VER v JOIN TB_MDM_LAYOUT l ON l.LAYOUT_ID = v.LAYOUT_ID "
                + "WHERE v.LAYOUT_ID = ? AND v.VER = ? AND l.LAYOUT_KIND = 'HEADER' UNION ALL SELECT NULL LIMIT 1", String.class,
                layoutId, new BigDecimal(ver));
        jdbc.update("UPDATE TB_MDM_EAI SET HEADER_LAYOUT_ID = NULL WHERE HEADER_LAYOUT_ID = ? AND (? IS NULL OR EAI_CODE <> ?)",
                layoutId, eai, eai);
        if (eai != null) {
            jdbc.update("UPDATE TB_MDM_EAI SET HEADER_LAYOUT_ID = ? WHERE EAI_CODE = ?", layoutId, eai);
        }
    }

    protected long rowVersion(long layoutId, String ver) {
        return jdbc.queryForObject("SELECT ROW_VERSION FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = ?", Long.class,
                layoutId, new BigDecimal(ver));
    }

    protected List<Map<String, Object>> versionRows(long layoutId) {
        return jdbc.queryForList("SELECT CAST(VER AS VARCHAR(40)) AS VER, STATUS, OWNER_ID, ROW_VERSION, OWN_LENGTH "
                + "FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ?", layoutId);
    }
}
```

`LayoutTestSupport` 의 `saveHeader`·`saveLayout`·`saveL100`·`saveL110`·`m201(...)`·`M201`·`versionRows` 를 `LayoutServiceTestSupport` 로 옮기고 다음처럼 바꾼다: `saveL100`·`saveL110` 은 저장 뒤 `release(id, "1.000", HEADER_FROM)`, `m201` 은 전문 저장 뒤 `release(msg, "1.000", MESSAGE_FROM)`. 행 도우미(`item`·`filler`·`l100Items`·`m201Items`·`headerRow`·`constRow`·`dictionary`)는 `LayoutTestSupport` 에 남긴다(HTTP 시험도 쓴다). `itemRows(long id)` 는 `itemRows(long id, String ver)` 로 바꿔 `AND VER = ?` 를 건다.

`LayoutDraftSaveSqliteTest`:

```java
package com.dongkuk.dmes.mdm.dmb.layoutMng;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/** D-144 3단계 — 저장은 내 DRAFT 의 행에만, 자동 +1(I15) 없음, 헤더 저장은 전문을 다시 계산하지 않는다(I18 폐지). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutDraftSaveSqliteTest extends LayoutServiceTestSupport {

    @BeforeEach
    void setUp() {
        dictionary();
    }

    @Test
    void registrationCreatesParentAndFirstMajorDraftOwnedByMe() {
        M201 m = m201();
        // m201() 은 release 하기 전 상태를 확인할 수 없으므로 새 전문을 하나 더 등록한다
        Map<String, Object> out = layoutService.save(layoutReq(uniq("새 전문 "), m.eai(), r -> {}), List.of(headerRow(m.l110())),
                List.of(), m201Items());
        long id = ((Number) out.get("layoutId")).longValue();
        assertEquals("1.000", out.get("ver"));
        assertEquals(0L, ((Number) out.get("rowVersion")).longValue());
        assertEquals("CREATED", layoutRow(id).get("STATUS"));
        assertThat(versionRows(id)).singleElement().satisfies(r -> {
            assertThat(r.get("STATUS")).isEqualTo("DRAFT");
            assertThat(r.get("OWNER_ID")).isEqualTo(KIM);
            assertThat(((Number) r.get("OWN_LENGTH")).intValue()).isEqualTo(57);
        });
        // 본문 오프셋은 본문 기준 상대값으로 저장한다(헤더 합 130 을 더하지 않는다)
        assertThat(column(itemRows(id, "1"), "OFFSET")).containsExactly(0, 20, 28, 32);
        assertEquals(187, ((Number) out.get("totalLength")).intValue());
    }

    @Test
    void savingDraftAgainBumpsRowVersionAndDoesNotCreateAVersion() {
        M201 m = m201();
        Map<String, Object> first = layoutService.save(layoutReq(uniq("저장 반복 "), m.eai(), r -> {}), List.of(headerRow(m.l110())),
                List.of(), m201Items());
        long id = ((Number) first.get("layoutId")).longValue();
        Map<String, Object> second = layoutService.save(layoutReq("저장 반복 이름 바꿈", m.eai(), r -> {
            r.setLayoutId(id);
            r.setVer("1.000");
            r.setRowVersion(0L);
        }), List.of(headerRow(m.l110())), List.of(), m201Items());
        assertEquals(1L, ((Number) second.get("rowVersion")).longValue());
        assertThat(versionRows(id)).hasSize(1);
    }

    @Test
    void releasedVersionOtherOwnerAndStaleRowVersionAreRejected() {
        M201 m = m201();
        BusinessException released = rejected(() -> layoutService.save(layoutReq("확정본 저장", m.eai(), r -> {
            r.setLayoutId(m.message());
            r.setVer("1.000");
            r.setRowVersion(rowVersion(m.message(), "1.000"));
        }), List.of(headerRow(m.l110())), List.of(), m201Items()));
        assertThat(released.getMessage()).contains("MDM002");

        Map<String, Object> draft = layoutService.save(layoutReq(uniq("남의 DRAFT "), m.eai(), r -> {}), List.of(headerRow(m.l110())),
                List.of(), m201Items());
        long id = ((Number) draft.get("layoutId")).longValue();
        user.set("lee", Set.of(MdmRoles.STEWARD));
        BusinessException notOwner = rejected(() -> layoutService.save(layoutReq("남의 DRAFT", m.eai(), r -> {
            r.setLayoutId(id);
            r.setVer("1.000");
            r.setRowVersion(0L);
        }), List.of(headerRow(m.l110())), List.of(), m201Items()));
        assertThat(notOwner.getMessage()).contains("MDM003");
        user.set(KIM, Set.of(MdmRoles.STEWARD));
        BusinessException stale = rejected(() -> layoutService.save(layoutReq("남의 DRAFT", m.eai(), r -> {
            r.setLayoutId(id);
            r.setVer("1.000");
            r.setRowVersion(7L);
        }), List.of(headerRow(m.l110())), List.of(), m201Items()));
        assertThat(stale.getMessage()).contains("MDM001");
    }

    @Test
    void headerDraftSaveDoesNotTouchMessages() {
        M201 m = m201();
        List<Map<String, Object>> before = itemRows(m.message(), "1");
        // 헤더 새 DRAFT 를 만들 수단(Task 6 새 버전) 전이므로 DRAFT 를 JDBC 로 복사해 만든다
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, BASE_VER, OWNER_ID, OWN_LENGTH) "
                + "VALUES (?, 2, 'MAJOR', 'DRAFT', 1, ?, 30)", m.l110(), KIM);
        List<Map<String, Object>> longer = l110Items();
        longer.set(5, filler(8));
        Map<String, Object> out = headerService.save(headerReq("L2 구간 헤더 길이 바꿈", r -> {
            r.setLayoutId(m.l110());
            r.setVer("2.000");
            r.setRowVersion(0L);
        }), numbered(longer));
        assertThat(out).doesNotContainKeys("recalculated", "versioned", "droppedOverrides");
        assertThat(itemRows(m.message(), "1")).isEqualTo(before);
        assertThat(versionRows(m.message())).hasSize(1);
    }

    @Test
    void eaiEncodingChangeIsRefusedWhileMessagesUseIt() {
        M201 m = m201();
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, BASE_VER, OWNER_ID, OWN_LENGTH) "
                + "VALUES (?, 2, 'MAJOR', 'DRAFT', 1, ?, 100)", m.l100(), KIM);
        BusinessException e = rejected(() -> headerService.save(headerReq("GLUE 공통 헤더", r -> {
            r.setLayoutId(m.l100());
            r.setVer("2.000");
            r.setRowVersion(0L);
            r.setEaiCode(m.eai());
            r.setEncoding("UTF-8");
        }), l100Items()));
        assertThat(e.getMessage()).contains("L11").contains(m.eai());
    }

    @Test
    void headerDraftClaimingAnEaiDoesNotChangeOthersMessageSaves() {
        M201 m = m201();
        // 새 헤더 DRAFT 가 같은 EAI 를 주장한다 — 연결은 버전 행에만, 공유 EAI 행은 그대로(Review Focus 6)
        long claimer = saveHeader(headerReq(uniq("주장 헤더 "), r -> r.setEaiCode(m.eai())), l110Items());
        assertThat(jdbc.queryForObject("SELECT EAI_CODE FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 1", String.class, claimer))
                .isEqualTo(m.eai());
        assertThat(jdbc.queryForObject("SELECT HEADER_LAYOUT_ID FROM TB_MDM_EAI WHERE EAI_CODE = ?", Long.class, m.eai()))
                .isEqualTo(m.l100());
        // 같은 EAI 의 전문 저장은 받아들여지고 구성은 지금 표준 헤더(L100)다
        Map<String, Object> out = layoutService.save(layoutReq(uniq("영향 없는 전문 "), m.eai(), r -> {}), List.of(headerRow(m.l110())),
                List.of(), m201Items());
        long id = ((Number) out.get("layoutId")).longValue();
        assertThat(jdbc.queryForList("SELECT HEADER_LAYOUT_ID FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID = ? ORDER BY SEQ", Long.class, id))
                .containsExactly(m.l100(), m.l110());
        // 헤더를 미래 시각에 확정해 연결이 옮겨져도, 지금 시각 저장은 아직 확정 전인 그 헤더를 끼우지 않는다
        release(claimer, "1.000", "2026-12-01 00:00:00");
        Map<String, Object> again = layoutService.save(layoutReq(uniq("예약 뒤 전문 "), m.eai(), r -> {}),
                List.of(headerRow(m.l100()), headerRow(m.l110())), List.of(), m201Items());
        long id2 = ((Number) again.get("layoutId")).longValue();
        assertThat(jdbc.queryForList("SELECT HEADER_LAYOUT_ID FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID = ? ORDER BY SEQ", Long.class, id2))
                .containsExactly(m.l100(), m.l110());
    }
}
```

`HeaderMngServiceSqliteTest` 의 `EAI_를_함께_저장하면_그_EAI_의_표준_헤더가_된다` 는 "저장하면 버전 행 `EAI_CODE` 에만 담기고, `release`(확정) 뒤에 그 EAI 의 표준 헤더가 된다" 로 바꾼다. `LayoutOasisFlowTest` 의 release SQL 도 위 `release` 와 같은 EAI 연결 문장을 함께 실행한다.

(`layoutReq`·`headerReq` 의 람다로 `setLayoutId`·`setVer`·`setRowVersion` 을 부른다 — DTO 에 새 setter 가 생긴다. `itemRows(id, "1")` 의 VER 바인딩은 `new BigDecimal(ver)`.)

`LayoutVersionSqliteTest` 의 I15 시험(`처음_저장하면_버전_1_…`·`같은_내용으로_…`·`여분을_쪼개_…`·`항목_길이를_…`·`헤더를_바꾸면_…`·`헤더_상수_기본값만_…`·`저장_응답의_ver_로_…`)은 지운다 — 변경 분류는 Task 7 확정 시험(`LayoutConfirmSqliteTest`)으로 옮긴다(같은 사례: 여분 쪼개기 = SEQUENTIAL, 항목 길이 = SIMULTANEOUS, 헤더 상수 기본값만 = SEQUENTIAL). 이 클래스에는 "저장 응답의 rowVersion 으로 다시 저장하면 MDM001 이 나지 않는다" 한 사례만 새 계약으로 남긴다. `HeaderMngServiceSqliteTest` 의 `헤더_길이가_바뀌면_…_다시_계산한다`·`…재정의를_물리명으로_다시_짝짓는다`·`…재정의를_지운다` 는 지우고(물리명 짝은 `LayoutComposerSqliteTest`, 고아 재정의는 Task 8), `요청_ver_가_DB_VER_와_다르면_MDM001` 은 `rowVersion` 이 다르면 MDM001 로 바꾼다. `HeaderMngQueryCountTest:117-121` 의 "사용 전문 수에 비례" 단언을 `assertEquals(counts.get("len2"), counts.get("len6"))`(헤더 저장 쿼리 수가 사용 전문 수와 무관 — I18 폐지의 부정 시험)로 바꾼다.

- [ ] **Step 2: 실패 확인**

Run: `cd <worktree>/src/backend/mdm && ../gradlew :api:compileTestJava --offline`
Expected: 컴파일 실패(`setRowVersion`·`LayoutServiceTestSupport` 등).

- [ ] **Step 3: 구현**

`LayoutVersions` 에 인자 도우미:

```java
    public static BigDecimal requireVer(String raw) {
        if (raw == null || raw.isBlank()) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "버전이 필요합니다", List.of());
        }
        try {
            return VersionNumbers.parse(raw);
        } catch (IllegalArgumentException e) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "버전 형식이 올바르지 않습니다: " + raw, List.of());
        }
    }

    public static long requireRowVersion(Long raw) {
        if (raw == null) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "rowVersion 이 필요합니다", List.of());
        }
        return raw;
    }
```

`LayoutDraft`·`ConstRow` 를 Interfaces 의 모양으로 바꾼다(`placed` 대신 `bodyOffsets`·`ownLength`·`headers`).

`LayoutDraftBuilder.build(..., LocalDateTime asOf)` — 바뀌는 곳만:
- ① 대상: `forSave` 인자와 감사 VER 대조를 지운다(동시 수정은 `beginDraftWrite` 가 본다). `message(id)` 로 부모만 읽는다.
- ②' EAI 표준 헤더 끼움(I14): `insertEaiHeader && eai != null && eai.getHeaderLayoutId() != null && !headerIds.contains(...) && composer.headerAt(eai.getHeaderLayoutId(), asOf).isPresent()` 일 때만 맨 앞에 넣는다. 확정 안 된(또는 미래 적용) 표준 헤더는 끼우지 않는다 — 남의 헤더 DRAFT·예약 확정이 전문 저장을 L09 로 막지 않게(Review Focus 6).
- ② 헤더 구성: `layoutRepository.findById(id)` 로 종류를 보고, `composer.headerAt(id, asOf)` 가 비면 `L09 "헤더 " + id + " 에 시각 " + LayoutTimes.text(asOf) + " 에 확정된 버전이 없다"` 를 더한다. 있으면 `new LayoutSnapshotAssembler.HeaderPart(id, h.getLayoutName(), hv.getVer(), hv.getOwnLength(), queries.itemsOf(id, hv.getVer()))` 를 모은다.
- ③ 재정의: `itemsBySeq` 를 그 헤더 부품의 `items()` 에서 만든다. `ConstRow(headerId, seq, target.getColumnPhys(), value)`.
- ⑤ 계산: `List<Integer> lengths = LayoutRows.lengths(drafts, dict); LayoutOffsetCalculator.Placed body = LayoutOffsetCalculator.placeHeader(lengths);` → `bodyOffsets = body.offsets()`(본문 기준 상대), `ownLength = body.total()`.

`LayoutRows.entities` 는 `ver` 를 받아 `new MdmLayoutItem(layoutId, ver, d.seq(), d.fillKind())` 로 만든다.

`LayoutWriter`(전체):

```java
@Component
public class LayoutWriter {

    private final LayoutQueries queries;
    private final MdmLayoutRepository layoutRepository;
    private final MdmLayoutItemRepository itemRepository;
    private final MdmLayoutHeaderRepository headerRepository;
    private final MdmLayoutConstRepository constRepository;

    public LayoutWriter(LayoutQueries queries, MdmLayoutRepository layoutRepository, MdmLayoutItemRepository itemRepository,
                        MdmLayoutHeaderRepository headerRepository, MdmLayoutConstRepository constRepository) {
        this.queries = queries;
        this.layoutRepository = layoutRepository;
        this.itemRepository = itemRepository;
        this.headerRepository = headerRepository;
        this.constRepository = constRepository;
    }

    public MdmLayout saveLayout(MdmLayout layout) {
        return layoutRepository.saveAndFlush(layout);
    }

    /** 한 버전의 헤더 구성·재정의·항목을 통째로 바꾼다. FK 순서: CONST → HEADER → ITEM 지우고 반대로 넣는다(F3). */
    public void replaceVersionRows(Long layoutId, BigDecimal ver, List<Long> headerIds, List<MdmLayoutConst> consts,
                                   List<MdmLayoutItem> items) {
        deleteVersionRows(layoutId, ver);
        itemRepository.saveAll(items);
        itemRepository.flush();
        List<MdmLayoutHeader> stack = new ArrayList<>(headerIds.size());
        for (int i = 0; i < headerIds.size(); i++) {
            stack.add(new MdmLayoutHeader(layoutId, ver, i + 1, headerIds.get(i)));
        }
        headerRepository.saveAll(stack);
        headerRepository.flush();
        constRepository.saveAll(consts);
        constRepository.flush();
    }

    /** 헤더 레이아웃 한 버전의 항목만 바꾼다. 전문 행은 건드리지 않는다(I18 폐지 — 헤더 변경은 판정 시각 해석으로 전문에 반영된다). */
    public void replaceItems(Long layoutId, BigDecimal ver, List<MdmLayoutItem> items) {
        itemRepository.deleteAll(queries.itemsOf(layoutId, ver));
        itemRepository.flush();
        itemRepository.saveAll(items);
        itemRepository.flush();
    }

    /** 새 버전 — from 의 항목·헤더 구성·재정의를 칼럼 그대로 to 로 복사한다(번호를 새로 매기지 않는다). */
    public void copyVersionRows(Long layoutId, BigDecimal from, BigDecimal to) {
        List<MdmLayoutItem> items = new ArrayList<>();
        for (MdmLayoutItem s : queries.itemsOf(layoutId, from)) {
            MdmLayoutItem c = new MdmLayoutItem(layoutId, to, s.getSeq(), s.getFillKind());
            c.setColumnPhys(s.getColumnPhys());
            c.setTransUnit(s.getTransUnit());
            c.setUnitItem(s.getUnitItem());
            c.setNumFormat(s.getNumFormat());
            c.setDefaultValue(s.getDefaultValue());
            c.setFillerLength(s.getFillerLength());
            c.setOffset(s.getOffset());
            c.setLength(s.getLength());
            items.add(c);
        }
        List<Long> headerIds = queries.headersOf(layoutId, from).stream().map(MdmLayoutHeader::getHeaderLayoutId).toList();
        List<MdmLayoutConst> consts = queries.constsOf(layoutId, from).stream()
                .map(c -> new MdmLayoutConst(layoutId, to, c.getHeaderLayoutId(), c.getHeaderColumnPhys(), c.getConstValue())).toList();
        replaceVersionRows(layoutId, to, headerIds, consts, items);
    }

    /** DRAFT 삭제 정리(LayoutDraftDeletion) — CASCADE 가 없으므로 자식부터 지운다. */
    public void deleteVersionRows(Long layoutId, BigDecimal ver) {
        constRepository.deleteAll(queries.constsOf(layoutId, ver));
        constRepository.flush();
        headerRepository.deleteAll(queries.headersOf(layoutId, ver));
        headerRepository.flush();
        itemRepository.deleteAll(queries.itemsOf(layoutId, ver));
        itemRepository.flush();
    }
}
```

`LayoutVersioner.java` 를 지운다(`/usr/bin/git -C <worktree> rm src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout/LayoutVersioner.java`).

`LayoutMngService` — 생성자에서 `LayoutVersioner`·`LayoutSnapshotAssembler`(직접 사용 부분) 대신 `LayoutComposer composer`, `LayoutVersionStore versionStore`, `VersionWriteGuard writeGuard`, `MdmCurrentUser currentUser`, `Clock clock` 을 받는다. `save`:

```java
    public Map<String, Object> save(LayoutMngSaveRequest request, List<Map<String, Object>> headers,
                                    List<Map<String, Object>> consts, List<Map<String, Object>> items) {
        LocalDateTime asOf = LayoutTimes.asOf(request.getAsOf(), clock);
        String me = currentUser.userId();
        LayoutDraftBuilder.Built built = draftBuilder.build(request, headers, consts, items, asOf, true);
        if (!built.issues().isEmpty()) {
            throw LayoutRejections.reject(LayoutRejections.MESSAGE_PREFIX, built.issues());
        }
        LayoutDraft d = built.draft();
        MdmLayout layout;
        BigDecimal ver;
        long rowVersion;
        if (built.target() == null) {
            // 등록 — 부모 CREATED + 1.000 MAJOR DRAFT(소유자 = 등록한 사람, 담당자 역할을 요구하지 않는다)
            layout = new MdmLayout(MESSAGE, d.layoutName());
            layout.setSndSystem(d.sndSystem());
            layout.setRcvSystem(d.rcvSystem());
            layout = writer.saveLayout(layout);
            ver = VersionNumbers.FIRST;
            MdmLayoutVer v = new MdmLayoutVer(layout.getLayoutId(), ver, VersionKind.MAJOR, me);
            v.setEaiCode(d.eaiCode());
            v.setOwnLength(d.ownLength());
            versionStore.save(v);
            rowVersion = VersionConventions.INITIAL_ROW_VERSION;
        } else {
            layout = built.target();
            ver = LayoutVersions.requireVer(request.getVer());
            // 소유자(MDM003)·row_version(MDM001)·DRAFT(MDM002)·다른 미적용(MDM007)
            rowVersion = writeGuard.beginDraftWrite(new VersionRef(VersionTarget.LAYOUT, String.valueOf(layout.getLayoutId()), ver),
                    LayoutVersions.requireRowVersion(request.getRowVersion()), me);
            MdmLayoutVer v = versionStore.find(layout.getLayoutId(), ver).orElseThrow();
            v.setEaiCode(d.eaiCode());
            v.setOwnLength(d.ownLength());
            versionStore.save(v);
            layout.setLayoutName(d.layoutName());
            layout.setSndSystem(d.sndSystem());
            layout.setRcvSystem(d.rcvSystem());
            layout = writer.saveLayout(layout);
        }
        Long id = layout.getLayoutId();
        List<MdmLayoutConst> constRows = d.consts().stream()
                .map(c -> new MdmLayoutConst(id, ver, c.headerLayoutId(), c.headerColumnPhys(), c.value())).toList();
        writer.replaceVersionRows(id, ver, d.headerIds(), constRows,
                LayoutRows.entities(id, ver, d.items(), d.itemLengths(), d.bodyOffsets()));
        int headerLength = d.headers().stream().mapToInt(LayoutSnapshotAssembler.HeaderPart::length).sum();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("layoutId", id);
        out.put("ver", VersionNumbers.plain(ver));
        out.put("rowVersion", rowVersion);
        out.put("ownLength", d.ownLength());
        out.put("headerLength", headerLength);
        out.put("totalLength", headerLength + d.ownLength());
        out.put("asOf", LayoutTimes.text(asOf));
        return out;
    }
```

`view` — `versions = versionStore.versions(id)`, 고른 버전은 `request.getVer()` 가 있으면 그 버전, 없으면 `LayoutVersions.editTarget(versions, me, now)`. `asOf = LayoutTimes.asOf(request.getAsOf(), clock)`. 고른 버전이 LEGACY 면 `LayoutSnapshotJson.read(json)` 의 헤더·항목을 그대로 풀어 보이고 `editable=false`. 아니면 헤더 구성(`queries.headersOf(id, ver)`)마다 `composer.headerAt(hid, asOf)` 로 헤더 버전·항목을 읽어 지금처럼 행을 만들되 `HEADER_VER`(plain, 없으면 null)·`HEADER_STATE`(없으면 `"MISSING"`)를 더하고, 재정의는 `constsOf(id, ver)` 의 물리명으로 `OVERRIDE_VALUE` 를 붙인다. 본문 항목 `OFFSET` 은 화면 호환을 위해 절대값(헤더 합 + 저장값)으로 내려준다. `editable = selected.isDraft() && me.equals(selected.getOwnerId())`. `versions` 행은 Interfaces 의 키로 만들고 `STATE` 는 `LayoutVersions.state(v, now)`, 일시는 `LayoutTimes.text`, `LEGACY` 는 `"Y"|"N"`.

`search`(목록) — 전문 목록 → `versionStore.versionsOf(ids)` 한 번 → 전문마다 `current = releasedAt(now)`, `draft = draft(...)` → `keys = current 들` 로 `queries.headersOf(keys)`·`queries.itemsOf(keys)` 한 번씩 → 헤더 ID 들의 `versionsOf` 한 번으로 지금 시각 헤더 길이를 구해 `TOTAL_LENGTH = Σ 헤더 OWN_LENGTH + current.OWN_LENGTH`, `HEADER_SUMMARY`, `ITEM_COUNT`(current 항목 수) 를 채운다. 현재 버전이 없으면(첫 DRAFT 만 있는 전문) 길이·요약은 DRAFT 기준으로, `CURRENT_VER` 는 null. 헤더 구성 필터(`headerLayoutId`)는 current(없으면 draft) 구성으로 본다. 목록의 `VER` 키는 `AUD_VER`(감사)로 이름을 바꾼다. `target=HEADER`(헤더 선택 팝업)는 헤더마다 지금 시각 RELEASED 의 항목·길이를 준다(RELEASED 가 없으면 목록에서 뺀다 — 쌓을 수 없다).

`validate`·`execute` — `asOf` 를 `LayoutTimes.asOf(request.getAsOf(), clock)` 로 읽어 `draftBuilder.build(..., asOf, true)` 에 넘긴다. `execute` 의 스냅샷은 `assembler.fromDraft(built.draft(), ver, built.draft().headers())`(`ver` 는 요청 ver 가 있으면 그 값, 없으면 `VersionNumbers.FIRST`), 송신 시각 기본값은 `LocalDateTime.now(clock)`.

`export`:

```java
    public Map<String, Object> export(LayoutMngExportRequest request) {
        MdmLayout layout = message(request.getLayoutId());
        LocalDateTime asOf = LayoutTimes.asOf(request.getAsOf(), clock);
        MdmLayoutSnapshot snapshot = request.getVer() == null || request.getVer().isBlank()
                ? composer.at(layout.getLayoutId(), asOf)
                : composer.compose(layout.getLayoutId(), LayoutVersions.requireVer(request.getVer()), asOf);
        String ver = VersionNumbers.plain(snapshot.layoutVersion());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("layoutId", layout.getLayoutId());
        out.put("ver", ver);
        out.put("asOf", LayoutTimes.text(asOf));
        out.put("fileBase", "layout-" + layout.getLayoutId() + "-v" + ver + "-" + LayoutTimes.text(asOf).replaceAll("[^0-9]", ""));
        out.put("snapshot", LayoutSnapshotJson.toMap(snapshot));
        out.put("names", displayNames(snapshot));
        return out;
    }
```

`HeaderMngService.save` — 등록이면 부모 HEADER(CREATED) + `1.000 MAJOR DRAFT`(소유자 = 나, `OWN_LENGTH = placed.total()`), 수정이면 `beginDraftWrite` 뒤 `ver` 행 `OWN_LENGTH` 갱신·부모 이름 갱신. 항목은 `writer.replaceItems(headerId, ver, LayoutRows.entities(headerId, ver, drafts, lengths, placed.offsets()))`. ⑦~⑪(재정의 보관·재짝짓기·사용 전문 재계산·버전 기록)은 지운다 — 재정의는 물리명 키라 재짝짓기가 필요 없다. EAI 쓰기 직전에 다음 거부를 더한다:

```java
        if (eai != null && eaiCode != null
                && (changed(request.getEncoding(), eai.getEncoding()) || changed(request.getPadRule(), eai.getPadRule()))
                && !versionStore.messagesUsingEai(eaiCode).isEmpty()) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L11, null, "ENCODING", "EAI " + eaiCode
                    + " 를 쓰는 전문이 있어 인코딩·패딩을 바꿀 수 없다 — EAI 는 버전 대상이 아니라 운영 직렬화가 바로 바뀐다(D-144 3단계)"));
        }
```

(`changed(String requested, String current)` = 요청 값이 비어 있지 않고 현재 값과 다르다. 이 검사는 ③ 의 `issues` 묶음에 넣어 쓰기 전에 거부한다.) 지금의 ⑥(이 헤더를 가리키는 다른 EAI 의 연결 끊기·`eai.setHeaderLayoutId(headerId)`)은 지운다 — 대신 헤더 버전 행에 `v.setEaiCode(eaiCode)` 만 쓴다. EAI 행 쓰기는 두 경우만 남긴다: 새 EAI 이면 `new MdmEai(code, name, encoding)` + 패딩(연결 칸은 null), 이미 있는 EAI 이면 위 거부를 통과한 이름·인코딩·패딩 갱신. 연결은 Task 7 의 헤더 확정이 옮긴다. 응답은 Interfaces 의 네 키. `view`·`search` 는 `layoutMng` 와 같은 규칙으로 버전 목록·선택·`usedBy` 를 만든다 — `usedBy` 는 `queries.stacksUsing(headerId)` 의 행 중 그 전문 버전의 상태가 CURRENT·FUTURE·DRAFT 인 것만(PAST·LEGACY 제외), `TOTAL_LENGTH` 는 `composer.compose(msgId, ver, now)` 의 총 길이(실패하면 null).

BPMN 두 파일의 `documentation` 에서 "저장하면 그 자리에서 스냅샷 버전" 문구를 "저장은 내 DRAFT 에만 쓴다. 버전은 copy(새 버전)·확정(layoutConfirm)으로 바뀐다(D-144)" 로 바꾼다(액션 추가는 Task 6).

기존 시험 갱신(Files 의 Test Modify 목록): 서비스를 바로 부르는 클래스는 `extends LayoutServiceTestSupport` + `@Import(DmeTestSupport.Config.class)` 로 바꾸고, 저장 응답의 `ver`(감사 → 업무 문자열)·`layoutVersion`·`totalLength`(헤더 저장 응답) 단언, `itemRows(id)` 호출, 본문 `OFFSET` 기대값(절대 → 상대; view 응답은 절대 그대로)을 새 계약으로 바꾼다. `LayoutMngQueryCountTest:88-89`·`HeaderMngQueryCountTest` 의 상한은 시험을 돌려 실제 값을 읽고, 전문·헤더 수(2 → 6)에 따라 늘지 않는 것(`assertEquals(x2, x6)`)을 먼저 확인한 뒤 그 값으로 고친다 — 늘어나면 N+1 이므로 상한을 고치지 말고 묶음 조회로 고친다. `LayoutOasisFlowTest` 는 HTTP 로만 데이터를 만든다 — 헤더를 HTTP 로 저장한 뒤 `release` 와 같은 SQL 을 `jdbc` 로 실행해 RELEASED 로 만들고 전문을 저장한다(전문 save 요청에 `ver`·`rowVersion` 은 등록이라 없다). 총 길이 187 단언은 그대로 둔다.

- [ ] **Step 4: 통과 확인** — Task 3~5 의 모든 시험과 mdm 전체.

Run: `cd <worktree>/src/backend/mdm && export JAVA_HOME=/opt/homebrew/opt/openjdk@21 && ../gradlew :lib:test :api:test --offline`
Expected: PASS(전체). OASIS 계약 정적 검사: `oasis-contract-check` 스킬의 안내대로 스크립트를 돌려 ERROR 0.

- [ ] **Step 5: Commit**(Task 3·4 스테이징 포함)

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm src/backend/mdm/api/src/main/resources/services/dmb/layoutMng.bpmn src/backend/mdm/api/src/main/resources/services/dmb/headerMng.bpmn src/frontend/m-mdm/tests/fixtures/m201-snapshot.json
/usr/bin/git -C <worktree> commit -m "feat(mdm): 레이아웃 저장을 내 DRAFT 에만 쓰고 전문을 시각 T 의 헤더 버전으로 합성한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(`git add src/backend/mdm/lib/src` 는 이 Task 가 고친 파일만 담기는지 먼저 `/usr/bin/git -C <worktree> status --short src/backend/mdm` 로 보고, 다른 에이전트의 파일이 섞여 있으면 경로를 하나씩 적는다.)

---

### Task 6: 버전 액션 — 새 버전(major·minor)·삭제·확정취소·선점·해제·넘기기와 DRAFT 삭제 SPI

**Files:**
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout/LayoutVersionService.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout/LayoutDraftDeletion.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layoutMng/dto/LayoutVersionRequest.java`, `LayoutVersionResult.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layoutMng/service/LayoutMngService.java`(view 에 가능 여부 플래그, 위임 액션 6개), `.../dmb/headerMng/service/HeaderMngService.java`(같은 위임)
- Modify: `src/backend/mdm/api/src/main/resources/services/dmb/layoutMng.bpmn`, `headerMng.bpmn`(action `copy`·`delete`·`lock`·`unlock`·`handover` 분기)
- Test (Create): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/layoutMng/LayoutVersionActionSqliteTest.java`
- Test (Modify): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/LayoutOasisFlowTest.java`(copy·lock HTTP 바인딩 한 사례), `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmOasisActionVocabularyTest.java`(두 화면 action 목록이 시험에 하드코딩돼 있으면 더한다)

**Interfaces:**
- Consumes: 공통 `VersionWriteGuard.checkCanCreateVersion`, `VersionStateService.deleteDraft/cancelConfirm`, `DraftOwnershipService.acquire/release/handover`, `VersionNumbers.next/canMajor/canMinor`, Task 5 `LayoutWriter.copyVersionRows/deleteVersionRows`
- Produces:
  - `LayoutVersionRequest { Long layoutId; String ver; String verKind; Long rowVersion; String newOwnerId; String target /* VERSION|CONFIRM, delete 만 */ }`
  - `LayoutVersionResult { Long layoutId; String ver; String verKind; Long rowVersion }`
  - `LayoutVersionService`: `LayoutVersionResult newVersion(LayoutVersionRequest, String kind /* "HEADER"|"MESSAGE" */)`, `deleteDraft(...)`, `cancelConfirm(...)`, `lock(...)`, `unlock(...)`, `handover(...)`, `Map<String, Object> flags(List<MdmLayoutVer> versions, String layoutStatus, LocalDateTime now)` → `{canNewMajor, canNewMinor, nextMajor, nextMinor}`
  - OASIS `layoutMng`·`headerMng` action: `copy`(새 버전), `delete`(target `VERSION` = DRAFT 삭제, `CONFIRM` = 확정취소), `lock`, `unlock`, `handover` — 모두 `LayoutVersionRequest` DTO, 응답 `result` = `LayoutVersionResult`
  - `view` 응답에 `canNewMajor`·`canNewMinor`·`nextMajor`·`nextMinor`(마스터코드·룰과 같은 이름)
  - `LayoutDraftDeletion implements VersionDraftDeletionSpi` — `target() == LAYOUT`, `beforeDraftDelete(ref)` = `writer.deleteVersionRows(Long.valueOf(ref.objectId()), ref.ver())`

- [ ] **Step 1: 실패하는 시험 작성**

```java
package com.dongkuk.dmes.mdm.dmb.layoutMng;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionService;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngViewRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionRequest;
import java.math.BigDecimal;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/** D-144 3단계 — 레이아웃 새 버전 major/minor(직전 RELEASED 복사), 미적용 하나(MDM006), DRAFT 삭제는 그 버전 행만. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutVersionActionSqliteTest extends LayoutServiceTestSupport {

    @Autowired
    LayoutVersionService versions;

    @BeforeEach
    void setUp() {
        dictionary();
    }

    private static LayoutVersionRequest req(long id, String ver, String kind, Long rowVersion) {
        LayoutVersionRequest r = new LayoutVersionRequest();
        r.setLayoutId(id);
        r.setVer(ver);
        r.setVerKind(kind);
        r.setRowVersion(rowVersion);
        return r;
    }

    @Test
    void minorCopiesLatestReleasedRowsAndRecordsKind() {
        M201 m = m201();
        var out = versions.newVersion(req(m.message(), null, "MINOR", null), "MESSAGE");
        assertThat(out.getVer()).isEqualTo("1.001");
        assertThat(out.getVerKind()).isEqualTo("MINOR");
        assertThat(itemRows(m.message(), "1.001")).hasSameSizeAs(itemRows(m.message(), "1"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_LAYOUT_CONST WHERE LAYOUT_ID = ? AND VER = 1.001", Integer.class,
                m.message())).isEqualTo(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_LAYOUT_CONST WHERE LAYOUT_ID = ? AND VER = 1",
                Integer.class, m.message()));
        assertThat(jdbc.queryForObject("SELECT CAST(BASE_VER AS VARCHAR(40)) FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 1.001",
                String.class, m.message())).isEqualTo("1");
    }

    @Test
    void secondUnappliedVersionIsRejectedAndFlagsTurnOff() {
        M201 m = m201();
        versions.newVersion(req(m.message(), null, "MAJOR", null), "MESSAGE");
        BusinessException e = rejected(() -> versions.newVersion(req(m.message(), null, "MINOR", null), "MESSAGE"));
        assertThat(e.getMessage()).contains("MDM006");
        LayoutMngViewRequest v = new LayoutMngViewRequest();
        v.setLayoutId(m.message());
        Map<String, Object> view = layoutService.view(v);
        assertThat(view.get("canNewMajor")).isEqualTo(false);
        assertThat(view.get("canNewMinor")).isEqualTo(false);
        assertThat(((Map<?, ?>) view.get("selected")).get("VER")).isEqualTo("2.000");
    }

    @Test
    void deletingDraftRemovesOnlyThatVersionsRows() {
        M201 m = m201();
        versions.newVersion(req(m.message(), null, "MINOR", null), "MESSAGE");
        versions.deleteDraft(req(m.message(), "1.001", null, 0L), "MESSAGE");
        assertThat(versionRows(m.message())).hasSize(1);
        assertThat(itemRows(m.message(), "1.001")).isEmpty();
        assertThat(itemRows(m.message(), "1")).isNotEmpty();
    }

    @Test
    void headerNewVersionWorksTooAndLockNeedsSteward() {
        M201 m = m201();
        var h = versions.newVersion(req(m.l110(), null, "MAJOR", null), "HEADER");
        assertThat(h.getVer()).isEqualTo("2.000");
        versions.unlock(req(m.l110(), "2.000", null, 0L), "HEADER");
        user.set("lee", java.util.Set.of(com.dongkuk.dmes.mdm.contract.security.MdmRoles.STD_ADMIN));
        BusinessException e = rejected(() -> versions.lock(req(m.l110(), "2.000", null, 1L), "HEADER"));
        assertThat(e.getMessage()).contains("MDM");
        assertThat(jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 2", String.class, m.l110()))
                .isNull();
    }

    @Test
    void minorBoundaryAt999() {
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_ITEM WHERE LAYOUT_ID = 9200");
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = 9200");
        jdbc.update("DELETE FROM TB_MDM_LAYOUT WHERE LAYOUT_ID = 9200");
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, STATUS, VER) VALUES (9200, 'HEADER', 'H999', 'INUSE', 0)");
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, APPLY_FROM, APPLY_TO, OWN_LENGTH) "
                + "VALUES (9200, ?, 'MINOR', 'RELEASED', '2026-01-01 00:00:00', '9999-12-31 00:00:00', 5)", new BigDecimal("1.999"));
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, VER, SEQ, FILL_KIND, FILLER_LENGTH, `OFFSET`, `LENGTH`) "
                + "VALUES (9200, ?, 1, 'FILLER', 5, 0, 5)", new BigDecimal("1.999"));
        BusinessException e = rejected(() -> versions.newVersion(req(9200L, null, "MINOR", null), "HEADER"));
        assertThat(e.getMessage()).contains("major 를 올리십시오");
        assertThat(versions.newVersion(req(9200L, null, "MAJOR", null), "HEADER").getVer()).isEqualTo("2.000");
        assertThat(itemRows(9200L, "2")).hasSize(1);
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd <worktree>/src/backend/mdm && ../gradlew :api:test --tests '*LayoutVersionActionSqliteTest' --offline`
Expected: 컴파일 실패(`LayoutVersionService` 없음).

- [ ] **Step 3: 구현**

```java
package com.dongkuk.dmes.mdm.dmb.layout;

// import: MdmErrors, MdmErrorCode, MdmCurrentUser, VersionNumbers, VersionKind, VersionRef, VersionTarget, VersionWriteGuard,
//         VersionStateService, DraftOwnershipService, MdmLayout, MdmLayoutVer, MdmLayoutRepository, LayoutVersionRequest,
//         LayoutVersionResult, Clock, LocalDateTime, BigDecimal, List, Map, LinkedHashMap, Optional, PlatformTransactionManager, TransactionTemplate

/**
 * 레이아웃·헤더 버전 액션(D-144 3단계) — 새 버전(copy)·DRAFT 삭제·확정취소·선점·해제·넘기기. 상태·소유자·row_version 은 공통 서비스만
 * 바꾼다(룰 RuleVersionService 와 같은 경계). 새 버전은 담당자 역할을 요구하지 않는다(표준 관리자도 만들고, 확정은 담당자에게 넘긴다).
 * 번호는 VersionNumbers(MAJOR floor+1, MINOR +0.001, 상한 999), 내용은 직전 RELEASED 를 칼럼 그대로 복사한다.
 */
@Service
public class LayoutVersionService {

    private final LayoutVersionStore store;
    private final LayoutWriter writer;
    private final MdmLayoutRepository layoutRepository;
    private final VersionWriteGuard writeGuard;
    private final VersionStateService stateService;
    private final DraftOwnershipService ownership;
    private final MdmCurrentUser currentUser;
    private final Clock clock;
    private final TransactionTemplate tx;

    public LayoutVersionService(LayoutVersionStore store, LayoutWriter writer, MdmLayoutRepository layoutRepository,
                                VersionWriteGuard writeGuard, VersionStateService stateService, DraftOwnershipService ownership,
                                MdmCurrentUser currentUser, Clock clock, PlatformTransactionManager transactionManager) {
        this.store = store;
        this.writer = writer;
        this.layoutRepository = layoutRepository;
        this.writeGuard = writeGuard;
        this.stateService = stateService;
        this.ownership = ownership;
        this.currentUser = currentUser;
        this.clock = clock;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public LayoutVersionResult newVersion(LayoutVersionRequest request, String kind) {
        MdmLayout layout = load(request.getLayoutId(), kind);
        if ("DEPRECATED".equals(layout.getStatus())) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "폐기한 레이아웃은 새 버전을 만들 수 없습니다", List.of());
        }
        VersionKind verKind = parseKind(request.getVerKind());
        String id = String.valueOf(layout.getLayoutId());
        writeGuard.checkCanCreateVersion(VersionTarget.LAYOUT, id);
        List<MdmLayoutVer> versions = store.versions(layout.getLayoutId());
        MdmLayoutVer source = LayoutVersions.latestReleased(versions).orElseThrow(() -> MdmErrors.of(
                MdmErrorCode.TRANSITION_NOT_ALLOWED, "복사할 확정 버전이 없습니다 — 첫 DRAFT 를 확정하십시오", List.of()));
        BigDecimal max = LayoutVersions.maxVer(versions);
        if (verKind == VersionKind.MINOR && !VersionNumbers.canMinor(max)) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "minor 를 더 올릴 수 없습니다. major 를 올리십시오", List.of());
        }
        if (verKind == VersionKind.MAJOR && !VersionNumbers.canMajor(max)) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "major 를 더 올릴 수 없습니다", List.of());
        }
        BigDecimal next = VersionNumbers.next(max, verKind);
        String me = currentUser.userId();
        tx.executeWithoutResult(status -> {
            MdmLayoutVer created = new MdmLayoutVer(layout.getLayoutId(), next, verKind, me);
            created.setBaseVer(source.getVer());
            created.setEaiCode(source.getEaiCode());
            created.setOwnLength(source.getOwnLength());
            store.save(created);
            writer.copyVersionRows(layout.getLayoutId(), source.getVer(), next);
        });
        return new LayoutVersionResult(layout.getLayoutId(), VersionNumbers.plain(next), verKind.name(), 0L);
    }

    public LayoutVersionResult deleteDraft(LayoutVersionRequest request, String kind) {
        VersionRef ref = ref(load(request.getLayoutId(), kind), request.getVer());
        stateService.deleteDraft(ref, LayoutVersions.requireRowVersion(request.getRowVersion()), currentUser.userId());
        return result(ref, null);
    }

    public LayoutVersionResult cancelConfirm(LayoutVersionRequest request, String kind) {
        VersionRef ref = ref(load(request.getLayoutId(), kind), request.getVer());
        stateService.cancelConfirm(ref, LayoutVersions.requireRowVersion(request.getRowVersion()), currentUser.userId());
        return result(ref, null);
    }

    public LayoutVersionResult lock(LayoutVersionRequest request, String kind) {
        VersionRef ref = ref(load(request.getLayoutId(), kind), request.getVer());
        return result(ref, ownership.acquire(ref, LayoutVersions.requireRowVersion(request.getRowVersion()), currentUser.userId()));
    }

    public LayoutVersionResult unlock(LayoutVersionRequest request, String kind) {
        VersionRef ref = ref(load(request.getLayoutId(), kind), request.getVer());
        return result(ref, ownership.release(ref, LayoutVersions.requireRowVersion(request.getRowVersion()), currentUser.userId()));
    }

    public LayoutVersionResult handover(LayoutVersionRequest request, String kind) {
        VersionRef ref = ref(load(request.getLayoutId(), kind), request.getVer());
        return result(ref, ownership.handover(ref, LayoutVersions.requireRowVersion(request.getRowVersion()), currentUser.userId(),
                request.getNewOwnerId()));
    }

    /** 화면 버튼 활성 — 미적용 버전이 있거나 폐기면 둘 다 false(마스터코드 CodeEditService 와 같은 규칙). */
    public Map<String, Object> flags(List<MdmLayoutVer> versions, String layoutStatus, LocalDateTime now) {
        boolean blocked = "DEPRECATED".equals(layoutStatus) || LayoutVersions.hasUnapplied(versions, now)
                || LayoutVersions.latestReleased(versions).isEmpty();
        BigDecimal max = versions.isEmpty() ? null : LayoutVersions.maxVer(versions);
        boolean major = !blocked && VersionNumbers.canMajor(max);
        boolean minor = !blocked && VersionNumbers.canMinor(max);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("canNewMajor", major);
        out.put("canNewMinor", minor);
        out.put("nextMajor", major ? VersionNumbers.plain(VersionNumbers.nextMajor(max)) : null);
        out.put("nextMinor", minor ? VersionNumbers.plain(VersionNumbers.nextMinor(max)) : null);
        return out;
    }

    private MdmLayout load(Long layoutId, String kind) {
        MdmLayout l = layoutId == null ? null : layoutRepository.findById(layoutId).orElse(null);
        if (l == null || !kind.equals(l.getLayoutKind())) {
            throw LayoutRejections.notFound(layoutId, kind);
        }
        return l;
    }

    private static VersionRef ref(MdmLayout layout, String ver) {
        return new VersionRef(VersionTarget.LAYOUT, String.valueOf(layout.getLayoutId()), LayoutVersions.requireVer(ver));
    }

    private static LayoutVersionResult result(VersionRef ref, Long rowVersion) {
        return new LayoutVersionResult(Long.valueOf(ref.objectId()), VersionNumbers.plain(ref.ver()), null, rowVersion);
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
}
```

`LayoutDraftDeletion`:

```java
@Component
public class LayoutDraftDeletion implements VersionDraftDeletionSpi {

    private final LayoutWriter writer;

    public LayoutDraftDeletion(LayoutWriter writer) {
        this.writer = writer;
    }

    @Override
    public VersionTarget target() {
        return VersionTarget.LAYOUT;
    }

    /** 레이아웃 표는 CASCADE 가 없다(V4 불변 11) — 그 버전의 CONST → HEADER → ITEM 을 지운 뒤 공통 서비스가 VER 행을 지운다. */
    @Override
    public void beforeDraftDelete(VersionRef draft) {
        writer.deleteVersionRows(Long.valueOf(draft.objectId()), draft.ver());
    }
}
```

`LayoutMngService`·`HeaderMngService` 에 위임 메서드 `copy(LayoutVersionRequest)`·`delete(LayoutVersionRequest)`(target `CONFIRM` 이면 `cancelConfirm`, 아니면 `deleteDraft`)·`lock`·`unlock`·`handover` 를 두고 kind 를 `"MESSAGE"`/`"HEADER"` 로 넘긴다. 둘의 `view` 응답에 `versions.flags(versionRows, layout.getStatus(), now)` 를 펼쳐 넣는다.

BPMN — `bpmn-skill`(bpmn-tool CLI)로 두 파일의 `actionGateway` 에 `copy`·`delete`·`lock`·`unlock`·`handover` 다섯 분기를 더한다. 각 serviceTask 는 `camunda:class` = 화면 서비스 빈(`layoutMngService`/`headerMngService`), `method` = 위 메서드 이름, `output` = `result`, `dto` = `com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionRequest`. `documentation` 의 action 목록 줄을 고친다. `oasis-project-support` 스킬로 바인딩(평탄 DTO, 서비스 메서드 시그니처)을 확인한다.

`LayoutOasisFlowTest` 에 HTTP 사례 하나: 헤더 저장(등록) → `release` SQL → `copy`(`{layoutId, verKind:"MINOR"}`, 사용자 헤더 `X-Authenticated-Role: MDM_STEWARD`) → 응답 `data.result.ver == "1.001"`.

- [ ] **Step 4: 통과 확인**

Run: `cd <worktree>/src/backend/mdm && ../gradlew :api:test --tests '*LayoutVersionActionSqliteTest' --tests '*LayoutOasisFlowTest' --tests '*MdmOasisActionVocabularyTest' --tests '*BpmnAction*' --offline`
Expected: PASS. `oasis-contract-check` ERROR 0.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout/LayoutVersionService.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout/LayoutDraftDeletion.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layoutMng src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/headerMng src/backend/mdm/api/src/main/resources/services/dmb/layoutMng.bpmn src/backend/mdm/api/src/main/resources/services/dmb/headerMng.bpmn src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/layoutMng/LayoutVersionActionSqliteTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/LayoutOasisFlowTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmOasisActionVocabularyTest.java
/usr/bin/git -C <worktree> commit -m "feat(mdm): 레이아웃·헤더에 새 버전(major·minor)·삭제·확정취소·선점·해제·넘기기 액션을 둔다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 확정 — 검사 SPI, 변경 분류·전환 방식·본문 스냅샷 기록, layoutConfirm 서비스

**Files:**
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout/confirm/LayoutConfirmReport.java`, `LayoutConfirmChecks.java`, `LayoutConfirmCheck.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout/LayoutDraftBuilder.java`(`buildStored` 추가), `LayoutQueries.java`(`drafts()` 추가)
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layoutConfirm/service/LayoutConfirmService.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layoutConfirm/dto/LayoutConfirmSearchRequest.java`, `LayoutConfirmViewRequest.java`, `LayoutConfirmValidateRequest.java`, `LayoutConfirmRequest.java`
- Create: `src/backend/mdm/api/src/main/resources/services/dmb/layoutConfirm.bpmn`
- Test (Create): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/layoutConfirm/LayoutConfirmSqliteTest.java`
- Test (Modify): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/LayoutOasisFlowTest.java`(confirm HTTP 한 사례)

**Interfaces:**
- Consumes: 공통 `VersionStateService.confirm`(apply_from 순서·소유자·담당자·미적용 하나·SPI 검사·CAS·직전 닫기·부모 INUSE), `ApplyFromOrderCheck`, Task 4 `LayoutComposer`·`LayoutLengthRules`·`LayoutBodySnapshot`·`LayoutVersionStore.recordConfirm`, `LayoutChangeClassifier.classify`(그대로 재사용)
- Produces:
  - `record LayoutConfirmReport(String layoutKind, List<MdmCheckIssue> errors, List<MdmCheckIssue> warnings, LayoutChangeClassifier.Change change, List<Map<String, Object>> impact, List<String> eaiCodes)`
  - `LayoutConfirmChecks`: `LayoutConfirmReport report(VersionRef draft, LocalDateTime applyFrom)`, `LayoutChangeClassifier.Change classify(long layoutId, BigDecimal ver, LocalDateTime applyFrom)`, `String bodySnapshotJson(long layoutId, BigDecimal ver)`. 경고 코드 `SIMULTANEOUS_SWITCH`(동시 전환), 오류 코드는 `LayoutIssueCode` 이름(`L01`~`L16`)
  - `LayoutConfirmCheck implements VersionConfirmCheckSpi` — `target() == LAYOUT`
  - `LayoutDraftBuilder.buildStored(long messageId, BigDecimal ver, LocalDateTime asOf)` → `Built`(저장된 행을 요청 모양으로 바꿔 `build(..., asOf, false)` 를 탄다 — EAI 표준 헤더를 끼우지 않고 저장된 구성 그대로 검사, 재정의 물리명은 asOf 헤더 버전의 SEQ 로 바꾸고, 못 찾으면 L10)
  - 헤더 확정은 같은 트랜잭션에서 헤더 버전 행 `EAI_CODE` 대로 `TB_MDM_EAI.HEADER_LAYOUT_ID` 를 옮긴다(`linkEai`) (P3-15·P3-17 로 대체: EAI 표준 헤더는 시각 T 해석이고 확정은 HEADER_LAYOUT_ID 를 옮기지 않는다)
  - `LayoutQueries.drafts()` → `List<Object[]>` `{MdmLayoutVer, MdmLayout}`(STATUS='DRAFT')
  - OASIS `layoutConfirm` action: `search {keyword}` → `{rows:[{LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, VER, VER_KIND, OWNER_ID, ROW_VERSION, BASE_VER}]}`, `view {layoutId, ver?}` → `{layout:{LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, STATUS}, version:{VER, VER_KIND, STATUS, OWNER_ID, ROW_VERSION, BASE_VER, APPLY_FROM, APPLY_TO}, previous:{VER, APPLY_FROM, APPLY_TO}|null, firstVersion}`, `validate {layoutId, ver, applyFrom}` → `{checks:[{severity, code, message, field, itemKey}], applyFromCheck:{ok, message}, change:{switchMode, kinds, summary}, simultaneous, futureApplyFrom, impact, eais}`, `confirm {layoutId, ver, rowVersion, applyFrom, warningsAcknowledged}` → `{layoutId, ver, rowVersion, closedPreviousVer, switchMode, changeKinds, changeSummary}`

- [ ] **Step 1: 실패하는 시험 작성** — `LayoutVersionSqliteTest` 에서 지운 분류 사례를 확정 시점으로 옮긴다.

```java
package com.dongkuk.dmes.mdm.dmb.layoutConfirm;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionService;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmValidateRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.service.LayoutConfirmService;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/** D-144 3단계 — 확정 때 변경 분류·전환 방식·본문 스냅샷을 남기고, 동시 전환은 확인해야 확정된다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutConfirmSqliteTest extends LayoutServiceTestSupport {

    static final String JUL1 = "2026-07-01 00:00:00";

    @Autowired LayoutConfirmService confirmService;
    @Autowired LayoutVersionService versions;

    @BeforeEach
    void setUp() {
        dictionary();
    }

    private String newMinor(long id, String kind) {
        LayoutVersionRequest r = new LayoutVersionRequest();
        r.setLayoutId(id);
        r.setVerKind("MINOR");
        return versions.newVersion(r, kind).getVer();
    }

    /** M201 본문 마지막 여분 25 를 추가 항목 3 + 여분 22 로 쪼갠다(순차 전환). */
    private void saveFillerSplit(M201 m, String ver) {
        List<Map<String, Object>> items = new ArrayList<>(m201Items().subList(0, 3));
        items.add(item("DATA", "EXTRA_3", null));
        items.add(filler(22));
        layoutService.save(layoutReq("출측검사 실적 수신", m.eai(), r -> {
            r.setLayoutId(m.message());
            r.setVer(ver);
            r.setRowVersion(rowVersion(m.message(), ver));
        }), List.of(headerRow(m.l110())), List.of(), numbered(items));
    }

    private Map<String, Object> validate(long id, String ver, String applyFrom) {
        LayoutConfirmValidateRequest r = new LayoutConfirmValidateRequest();
        r.setLayoutId(id);
        r.setVer(ver);
        r.setApplyFrom(applyFrom);
        return confirmService.validate(r);
    }

    private Map<String, Object> confirm(long id, String ver, String applyFrom, boolean ack) {
        LayoutConfirmRequest r = new LayoutConfirmRequest();
        r.setLayoutId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion(id, ver));
        r.setApplyFrom(applyFrom);
        r.setWarningsAcknowledged(ack);
        return confirmService.confirm(r);
    }

    @Test
    void fillerSplitConfirmsSequentiallyAndStoresBodyOnlySnapshot() {
        M201 m = m201();
        String ver = newMinor(m.message(), "MESSAGE");
        saveFillerSplit(m, ver);
        Map<String, Object> checked = validate(m.message(), ver, JUL1);
        assertThat(checked.get("simultaneous")).isEqualTo(false);
        Map<String, Object> out = confirm(m.message(), ver, JUL1, false);
        assertThat(out.get("switchMode")).isEqualTo("SEQUENTIAL");
        assertThat(out.get("changeKinds")).isEqualTo("FILLER_SPLIT");
        assertThat(out.get("closedPreviousVer")).isEqualTo("1.000");
        Map<String, Object> row = jdbc.queryForMap("SELECT STATUS, APPLY_FROM, SNAPSHOT_JSON FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 1.001",
                m.message());
        assertThat(row.get("STATUS")).isEqualTo("RELEASED");
        assertThat(row.get("APPLY_FROM")).isEqualTo(JUL1);
        assertThat((String) row.get("SNAPSHOT_JSON")).contains("\"headerIds\"").doesNotContain("\"headers\"");
        assertThat(jdbc.queryForObject("SELECT APPLY_TO FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 1", String.class, m.message()))
                .isEqualTo(JUL1);
    }

    @Test
    void itemLengthChangeNeedsSimultaneousAcknowledgement() {
        M201 m = m201();
        String ver = newMinor(m.message(), "MESSAGE");
        List<Map<String, Object>> items = new ArrayList<>(m201Items());
        items.set(3, filler(30));
        layoutService.save(layoutReq("출측검사 실적 수신", m.eai(), r -> {
            r.setLayoutId(m.message());
            r.setVer(ver);
            r.setRowVersion(0L);
        }), List.of(headerRow(m.l110())), List.of(), numbered(items));
        Map<String, Object> checked = validate(m.message(), ver, JUL1);
        assertThat(checked.get("simultaneous")).isEqualTo(true);
        assertThat((List<Map<String, Object>>) checked.get("checks")).anySatisfy(c -> {
            assertThat(c.get("severity")).isEqualTo("WARNING");
            assertThat(c.get("code")).isEqualTo("SIMULTANEOUS_SWITCH");
            assertThat((String) c.get("message")).contains("송신·수신").contains(JUL1);
        });
        BusinessException e = rejected(() -> confirm(m.message(), ver, JUL1, false));
        assertThat(e.getMessage()).contains("MDM");
        assertThat(confirm(m.message(), ver, JUL1, true).get("switchMode")).isEqualTo("SIMULTANEOUS");
    }

    @Test
    void stackedHeaderWithoutReleaseAtApplyFromBlocksConfirm() {
        M201 m = m201();
        long h = saveHeader(headerReq(uniq("확정 전 헤더 "), r -> {}), l110Items()); // 1.000 DRAFT 그대로
        Map<String, Object> out = layoutService.save(layoutReq(uniq("새 헤더 쓰는 전문 "), m.eai(), r -> {}),
                List.of(headerRow(m.l110())), List.of(), m201Items());
        long id = ((Number) out.get("layoutId")).longValue();
        // 저장 시점 검사는 지금 시각 기준이라 통과했다 — 쌓은 헤더를 확정 안 된 헤더로 바꿔 넣는다
        jdbc.update("UPDATE TB_MDM_LAYOUT_HEADER SET HEADER_LAYOUT_ID = ? WHERE LAYOUT_ID = ? AND HEADER_LAYOUT_ID = ?", h, id, m.l110());
        Map<String, Object> checked = validate(id, "1.000", JUL1);
        assertThat((List<Map<String, Object>>) checked.get("checks"))
                .anySatisfy(c -> assertThat(c.get("code")).isEqualTo("L09"));
        assertThat(rejected(() -> confirm(id, "1.000", JUL1, true)).getMessage()).contains("MDM010");
    }

    @Test
    void firstConfirmPromotesParentAndOnlyStewardsConfirm() {
        M201 m = m201();
        Map<String, Object> out = layoutService.save(layoutReq(uniq("첫 확정 "), m.eai(), r -> {}), List.of(headerRow(m.l110())),
                List.of(), m201Items());
        long id = ((Number) out.get("layoutId")).longValue();
        user.set(KIM, Set.of(MdmRoles.STD_ADMIN));
        assertThat(rejected(() -> confirm(id, "1.000", "2026-06-01 00:00:00", true)).getMessage()).contains("MDM");
        user.set(KIM, Set.of(MdmRoles.STEWARD));
        confirm(id, "1.000", "2026-06-01 00:00:00", true);
        assertThat(layoutRow(id).get("STATUS")).isEqualTo("INUSE");
    }

    @Test
    void headerConstDefaultOnlyChangeIsSequential() {
        M201 m = m201();
        String ver = newMinor(m.l110(), "HEADER");
        List<Map<String, Object>> items = l110Items();
        items.get(0).put("DEFAULT_VALUE", "B2");
        headerService.save(headerReq("L2 구간 헤더", r -> {
            r.setLayoutId(m.l110());
            r.setVer(ver);
            r.setRowVersion(0L);
        }), items);
        assertThat(confirm(m.l110(), ver, JUL1, false).get("switchMode")).isEqualTo("SEQUENTIAL");
        assertThat(versionRows(m.message())).hasSize(1); // 헤더 확정은 전문 버전을 만들지 않는다(I18 폐지)
    }

    @Test
    void headerConfirmMovesEaiLinkFromVersionRow() {
        M201 m = m201();
        long claimer = saveHeader(headerReq(uniq("새 표준 헤더 "), r -> r.setEaiCode(m.eai())), l100Items());
        assertThat(jdbc.queryForObject("SELECT HEADER_LAYOUT_ID FROM TB_MDM_EAI WHERE EAI_CODE = ?", Long.class, m.eai())).isEqualTo(m.l100());
        confirm(claimer, "1.000", "2026-06-01 00:00:00", true);
        assertThat(jdbc.queryForObject("SELECT HEADER_LAYOUT_ID FROM TB_MDM_EAI WHERE EAI_CODE = ?", Long.class, m.eai())).isEqualTo(claimer);
    }
}
```

(`rejected(...)` 의 메시지 코드 문자열은 `MdmErrors.of` 가 만드는 메시지 형식에 맞춘다 — 기존 `RuleConfirmServiceTest` 가 코드를 단언하는 방식을 그대로 쓴다.)

- [ ] **Step 2: 실패 확인**

Run: `cd <worktree>/src/backend/mdm && ../gradlew :api:test --tests '*LayoutConfirmSqliteTest' --offline`
Expected: 컴파일 실패(`LayoutConfirmService` 없음).

- [ ] **Step 3: 구현**

`LayoutDraftBuilder.buildStored`:

```java
    /** 저장된 버전 행을 화면 요청 모양으로 바꿔 같은 검사를 탄다(확정 검사 — 판정 시각 = apply_from). */
    public Built buildStored(long messageId, BigDecimal ver, LocalDateTime asOf) {
        MdmLayout layout = message(messageId);
        MdmLayoutVer v = versionStore.find(messageId, ver).orElseThrow(() -> LayoutRejections.noVersion(messageId, ver));
        LayoutMngSaveRequest request = new LayoutMngSaveRequest();
        request.setLayoutId(messageId);
        request.setVer(VersionNumbers.plain(ver));
        request.setLayoutName(layout.getLayoutName());
        request.setEaiCode(v.getEaiCode());
        request.setSndSystem(layout.getSndSystem());
        request.setRcvSystem(layout.getRcvSystem());
        List<Map<String, Object>> headers = new ArrayList<>();
        for (MdmLayoutHeader h : queries.headersOf(messageId, ver)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("HEADER_LAYOUT_ID", h.getHeaderLayoutId());
            headers.add(row);
        }
        List<Map<String, Object>> consts = new ArrayList<>();
        List<LayoutIssue> unresolved = new ArrayList<>();
        for (MdmLayoutConst c : queries.constsOf(messageId, ver)) {
            Optional<MdmLayoutItem> target = composer.headerAt(c.getHeaderLayoutId(), asOf)
                    .flatMap(hv -> queries.itemsOf(c.getHeaderLayoutId(), hv.getVer()).stream()
                            .filter(i -> c.getHeaderColumnPhys().equals(i.getColumnPhys())).findFirst());
            if (target.isEmpty()) {
                unresolved.add(LayoutIssue.of(LayoutIssueCode.L10, null, "HEADER_COLUMN_PHYS", "재정의 대상 " + c.getHeaderColumnPhys()
                        + " 이 시각 " + LayoutTimes.text(asOf) + " 의 헤더 " + c.getHeaderLayoutId() + " 버전에 없다"));
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("HEADER_LAYOUT_ID", c.getHeaderLayoutId());
            row.put("HEADER_SEQ", target.get().getSeq());
            row.put("CONST_VALUE", c.getConstValue());
            consts.add(row);
        }
        Built built = build(request, headers, consts, LayoutRows.items(queries.itemsOf(messageId, ver), Map.of()), asOf, false); // 저장된 구성 그대로 — EAI 표준 헤더를 끼우지 않는다
        if (unresolved.isEmpty()) {
            return built;
        }
        List<LayoutIssue> issues = new ArrayList<>(built.issues());
        issues.addAll(unresolved);
        return new Built(null, issues, built.warnings(), built.target(), built.eai(), built.dictionary());
    }
```

(`LayoutDraftBuilder` 생성자에 `LayoutComposer composer`·`LayoutVersionStore versionStore` 를 더한다 — Task 5 에서 `composer` 를 이미 받았다면 `versionStore` 만.)

`LayoutQueries.drafts()`:

```java
    public List<Object[]> drafts() {
        return em.createQuery("SELECT v, l FROM MdmLayoutVer v, MdmLayout l WHERE l.layoutId = v.layoutId AND v.status = 'DRAFT' "
                + "ORDER BY l.layoutKind, l.layoutName", Object[].class).getResultList();
    }
```

`LayoutConfirmChecks`:

```java
package com.dongkuk.dmes.mdm.dmb.layout.confirm;

// import: LayoutComposer, LayoutDraftBuilder, LayoutVersionStore, LayoutQueries, LayoutVersions, LayoutLengthRules, LayoutIssue,
//         LayoutItemRules, LayoutRegistrationRules, LayoutRows, LayoutDictionary, LayoutConstJudge, LayoutCodecs, LayoutChangeClassifier,
//         LayoutBodySnapshot, LayoutSnapshotAssembler, LayoutSnapshotJson, LayoutTimes, LayoutHeaderImpact(Task 8), MdmCheckIssue,
//         MdmLayout, MdmLayoutVer, MdmLayoutRepository, VersionRef, VersionNumbers ...

/**
 * 레이아웃 확정 검사(D-144 3단계, 스펙 §7). 판정 시각은 apply_from — 그 시각의 헤더 버전으로 합성해 본다.
 * 전문: ① 등록 검사(L01~L15, 헤더 해석 L09, 재정의 L10) ② MSG_LENGTH 용량(L16) ③ 동시 전환이면 경고(SIMULTANEOUS_SWITCH).
 * 헤더: ① 항목 검사 ② 사용 전문 영향도(Task 8) ③ 동시 전환 경고. 분류는 확정 시점으로 옮긴 {@link LayoutChangeClassifier} 를 그대로 쓴다.
 */
@Component
public class LayoutConfirmChecks {

    public static final String SIMULTANEOUS_SWITCH = "SIMULTANEOUS_SWITCH";

    private final LayoutComposer composer;
    private final LayoutDraftBuilder draftBuilder;
    private final LayoutVersionStore store;
    private final LayoutQueries queries;
    private final LayoutDictionary dictionary;
    private final LayoutConstJudge constJudge;
    private final LayoutCodecs codecs;
    private final LayoutSnapshotAssembler assembler;
    private final MdmLayoutRepository layoutRepository;
    // Task 8 이 여기에 `private final LayoutHeaderImpact headerImpact;` 와 생성자 인자를 더한다

    // 생성자: 위 필드 전부

    public LayoutConfirmReport report(VersionRef draft, LocalDateTime applyFrom) {
        long id = Long.parseLong(draft.objectId());
        MdmLayout layout = layoutRepository.findById(id).orElseThrow(() -> LayoutRejections.notFound(id, "MESSAGE"));
        List<MdmCheckIssue> errors = new ArrayList<>();
        List<MdmCheckIssue> warnings = new ArrayList<>();
        List<Map<String, Object>> impact = List.of();
        List<String> eais = List.of();
        if ("HEADER".equals(layout.getLayoutKind())) {
            List<LayoutItemDraft> drafts = LayoutRows.drafts(LayoutRows.items(queries.itemsOf(id, draft.ver()), Map.of()));
            LayoutDictionary.Cache cache = dictionary.cache();
            Map<String, LayoutColumnInfo> dict = cache.byPhysNames(LayoutRows.physNames(drafts));
            List<LayoutIssue> issues = new ArrayList<>(LayoutItemRules.check(drafts, dict));
            issues.addAll(LayoutRegistrationRules.check(drafts, dict, codecs.units(), LayoutDraftBuilder.charset(headerEncoding(id)),
                    LayoutDraftBuilder.lengthsBySeq(drafts, dict), constJudge.forColumns(LayoutRows.physNames(drafts), cache), new ArrayList<>()));
            issues.forEach(i -> errors.add(issue(i, null)));
            // Task 8 이 이 줄을 영향도 평가(headerImpact.evaluate)로 바꾼다
            eais = queries.eaiOfHeader(id).stream().map(MdmEai::getEaiCode).toList();
        } else {
            LayoutDraftBuilder.Built built = draftBuilder.buildStored(id, draft.ver(), applyFrom);
            built.issues().forEach(i -> errors.add(issue(i, null)));
            if (errors.isEmpty()) {
                LayoutLengthRules.msgLengthIssues(composer.compose(id, draft.ver(), applyFrom)).forEach(i -> errors.add(issue(i, null)));
            }
        }
        LayoutChangeClassifier.Change change = errors.isEmpty() ? classify(id, draft.ver(), applyFrom) : null;
        if (change != null && LayoutChangeClassifier.SIMULTANEOUS.equals(change.switchMode())) {
            warnings.add(new MdmCheckIssue(SIMULTANEOUS_SWITCH, "동시 전환 — 송신·수신 양쪽이 " + LayoutTimes.text(applyFrom)
                    + " 에 맞춰 함께 전환해야 합니다: " + change.summary(), "SWITCH_MODE", null));
        }
        return new LayoutConfirmReport(layout.getLayoutKind(), List.copyOf(errors), List.copyOf(warnings), change, impact, eais);
    }

    /** 직전 RELEASED 대비 분류 — 전문은 두 버전을 같은 시각(apply_from)의 헤더로 합성해 비교한다. 최초면 INITIAL. */
    public LayoutChangeClassifier.Change classify(long layoutId, BigDecimal ver, LocalDateTime applyFrom) {
        MdmLayout layout = layoutRepository.findById(layoutId).orElseThrow(() -> LayoutRejections.notFound(layoutId, "MESSAGE"));
        boolean header = "HEADER".equals(layout.getLayoutKind());
        Optional<MdmLayoutVer> prev = LayoutVersions.previousReleased(store.versions(layoutId), ver);
        MdmLayoutSnapshot next = header ? composer.headerAlone(layoutId, ver) : composer.compose(layoutId, ver, applyFrom);
        MdmLayoutSnapshot before = prev.map(p -> header ? composer.headerAlone(layoutId, p.getVer())
                : composer.compose(layoutId, p.getVer(), applyFrom)).orElse(null);
        Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(physNames(before, next));
        return LayoutChangeClassifier.classify(before, next, phys -> dict.containsKey(phys) ? dict.get(phys).displayName() : null);
    }

    /** 확정 본문 스냅샷 — 헤더는 ID 만(K1). 항목 offset 은 저장값(본문 기준 상대 / 헤더 안 상대). */
    public String bodySnapshotJson(long layoutId, BigDecimal ver) {
        MdmLayout layout = layoutRepository.findById(layoutId).orElseThrow(() -> LayoutRejections.notFound(layoutId, "MESSAGE"));
        MdmLayoutVer v = store.find(layoutId, ver).orElseThrow(() -> LayoutRejections.noVersion(layoutId, ver));
        MdmLayoutSnapshot own = assembler.assemble(new LayoutSnapshotAssembler.MessagePart(layoutId, layout.getLayoutName(), v.getVer(),
                v.getEaiCode(), layout.getSndSystem(), layout.getRcvSystem(), v.getOwnLength(), queries.itemsOf(layoutId, ver)), List.of(), Map.of());
        return LayoutSnapshotJson.writeAny(LayoutBodySnapshot.of(layout, v, queries.headersOf(layoutId, ver), queries.constsOf(layoutId, ver),
                own.items()));
    }

    static MdmCheckIssue issue(LayoutIssue i, String itemKey) {
        return new MdmCheckIssue(i.code().name(), i.message(), i.field(), itemKey != null ? itemKey : i.seq() == null ? null : String.valueOf(i.seq()));
    }
    // headerEncoding(id): queries.eaiOfHeader(id) 첫 EAI 의 인코딩(없으면 null) — HeaderMngService.encoding 과 같은 규칙
    // physNames(...): LayoutVersioner 에 있던 같은 이름의 도우미를 이 클래스로 옮긴다
}
```

(Task 7 에서는 `LayoutHeaderImpact` 를 아직 만들지 않는다 — 헤더 분기는 항목 검사와 EAI 코드 목록만 채우고, 영향도는 Task 8 이 더한다.)

`LayoutConfirmReport`(record, Interfaces 그대로)와 SPI:

```java
@Component
public class LayoutConfirmCheck implements VersionConfirmCheckSpi {

    private final LayoutConfirmChecks checks;
    private final LayoutVersionStore store;

    public LayoutConfirmCheck(LayoutConfirmChecks checks, LayoutVersionStore store) {
        this.checks = checks;
        this.store = store;
    }

    @Override
    public VersionTarget target() {
        return VersionTarget.LAYOUT;
    }

    /** 레이아웃 diff 는 변경 분류(CHANGE_KINDS)로 대신한다 — 행 diff 는 두지 않는다. */
    @Override
    public VersionDiff diff(VersionRef draft) {
        VersionRef base = LayoutVersions.previousReleased(store.versions(Long.valueOf(draft.objectId())), draft.ver())
                .map(p -> new VersionRef(VersionTarget.LAYOUT, draft.objectId(), p.getVer())).orElse(null);
        return new VersionDiff(base, draft, List.of());
    }

    @Override
    public ConfirmCheckResult check(ConfirmCheckRequest request) {
        LayoutConfirmReport r = checks.report(request.draft(), request.requestedApplyFrom());
        return new ConfirmCheckResult(r.errors(), r.warnings());
    }
}
```

`LayoutConfirmService`(`@Service("layoutConfirmService")`, `@Transactional` 금지 — F11):

```java
    public Map<String, Object> confirm(LayoutConfirmRequest request) {
        MdmLayout layout = load(request.getLayoutId());
        BigDecimal ver = LayoutVersions.requireVer(request.getVer());
        LocalDateTime applyFrom = request.getApplyFrom() == null || request.getApplyFrom().isBlank() ? null
                : LayoutTimes.asOf(request.getApplyFrom(), clock);
        VersionRef ref = new VersionRef(VersionTarget.LAYOUT, String.valueOf(layout.getLayoutId()), ver);
        return tx.execute(status -> {
            ConfirmResult r = stateService.confirm(new ConfirmCommand(ref, LayoutVersions.requireRowVersion(request.getRowVersion()),
                    applyFrom, currentUser.userId(), request.isWarningsAcknowledged()));
            // 같은 트랜잭션 — 실패하면 확정도 되돌아간다
            LayoutChangeClassifier.Change change = checks.classify(layout.getLayoutId(), ver, applyFrom);
            String kinds = change.kinds().stream().map(Enum::name).collect(Collectors.joining(","));
            int n = store.recordConfirm(layout.getLayoutId(), ver, change.switchMode(), kinds, change.summary(),
                    checks.bodySnapshotJson(layout.getLayoutId(), ver), audit.currentStamp());
            if (n != 1) {
                throw new IllegalStateException("확정 기록 갱신 행 수가 1이 아닙니다: " + n + " " + ref);
            }
            if ("HEADER".equals(layout.getLayoutKind())) {
                linkEai(layout.getLayoutId(), store.find(layout.getLayoutId(), ver).orElseThrow().getEaiCode());
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("layoutId", layout.getLayoutId());
            out.put("ver", VersionNumbers.plain(ver));
            out.put("rowVersion", r.rowVersion());
            out.put("closedPreviousVer", r.closedPrevious() == null ? null : VersionNumbers.plain(r.closedPrevious().ver()));
            out.put("switchMode", change.switchMode());
            out.put("changeKinds", kinds);
            out.put("changeSummary", change.summary());
            return out;
        });
    }
```

헤더 확정의 EAI 연결 이동(같은 트랜잭션 — 실패하면 확정도 되돌아간다). 연결은 확정 시각에 옮기고, apply_from 이 미래여도 전문 저장의 끼움(I14)은 그 헤더에 저장 시각 RELEASED 가 생길 때부터 일어난다(Task 5 ②'): (P3-15·P3-17 로 대체: EAI 표준 헤더는 시각 T 해석이고 확정은 HEADER_LAYOUT_ID 를 옮기지 않는다)

```java
    /** EAI 표준 헤더 연결 — 헤더 버전 행의 EAI_CODE 가 정본. 이 헤더를 가리키던 다른 EAI 는 끊는다(EAI 당 헤더 하나). */
    private void linkEai(Long headerId, String eaiCode) {
        for (MdmEai other : queries.eaiOfHeader(headerId)) {
            if (!other.getEaiCode().equals(eaiCode)) {
                other.setHeaderLayoutId(null);
                eaiRepository.saveAndFlush(other);
            }
        }
        if (eaiCode != null) {
            MdmEai eai = eaiRepository.findById(eaiCode).orElseThrow(() -> LayoutRejections.reject(LayoutRejections.HEADER_PREFIX,
                    LayoutIssue.of(LayoutIssueCode.L11, null, "EAI_CODE", "EAI 가 없다: " + eaiCode)));
            eai.setHeaderLayoutId(headerId);
            eaiRepository.saveAndFlush(eai);
        }
    }
```

(필드: `LayoutConfirmChecks checks`, `LayoutVersionStore store`, `LayoutQueries queries`, `MdmLayoutRepository layoutRepository`, `MdmEaiRepository eaiRepository`, `VersionStateService stateService`, `ApplyFromOrderCheck applyFromOrderCheck`, `MdmNativeAuditSupport audit`, `MdmCurrentUser currentUser`, `Clock clock`, `TransactionTemplate tx`.) `validate` 는 `checks.report(ref, applyFrom)` + `applyFromOrderCheck.check(prev.applyFrom, applyFrom)`(ok/message) + `futureApplyFrom = applyFrom.isAfter(now)` + `change`·`simultaneous`·`impact`·`eais` 를 Interfaces 의 키로 낸다(검사 행 `severity` 는 errors → `"ERROR"`, warnings → `"WARNING"`). `search`·`view` 도 Interfaces 그대로(`view` 의 ver 가 비면 그 레이아웃의 DRAFT).

BPMN `services/dmb/layoutConfirm.bpmn` — `ruleConfirm.bpmn` 을 본보기로 `bpmn-skill` 로 만든다: process id `layoutConfirm`, name "레이아웃 확정", `actionGateway` 네 분기(search·view·validate·confirm), `camunda:class="layoutConfirmService"`, DTO 는 위 네 클래스. documentation 에 액션별 권한(READ·READ·EDIT·CONFIRM)과 "전문·헤더 공용, apply_from 시점 헤더 버전으로 합성해 검사" 를 적는다.

`LayoutOasisFlowTest` 에 HTTP 사례: 헤더·전문 등록·release SQL → 전문 copy(minor) → save → `layoutConfirm/confirm`(역할 헤더 `MDM_STEWARD`, `warningsAcknowledged: true`) → `data.result.switchMode` 가 있다.

- [ ] **Step 4: 통과 확인**

Run: `cd <worktree>/src/backend/mdm && ../gradlew :api:test --tests '*LayoutConfirmSqliteTest' --tests '*LayoutOasisFlowTest' --tests '*Bpmn*' --offline`
Expected: PASS. `oasis-contract-check` ERROR 0.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout/confirm src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout/LayoutDraftBuilder.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout/LayoutQueries.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layoutConfirm src/backend/mdm/api/src/main/resources/services/dmb/layoutConfirm.bpmn src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/layoutConfirm src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/LayoutOasisFlowTest.java
/usr/bin/git -C <worktree> commit -m "feat(mdm): 레이아웃 확정 때 변경 분류·전환 방식·본문 스냅샷을 기록하고 동시 전환은 확인을 받는다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 헤더 확정의 영향도와 검사 — 사용 전문·EAI, apply_from 시점 총 길이 변화

**Files:**
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout/confirm/LayoutHeaderImpact.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout/confirm/LayoutConfirmChecks.java`(헤더 분기에서 `headerImpact.evaluate`)
- Test (Create): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/layoutConfirm/LayoutHeaderConfirmImpactSqliteTest.java`

**Interfaces:**
- Consumes: `LayoutComposer.composeDetailed(..., headerPins)`, `LayoutLengthRules`, `LayoutQueries.stacksUsing/eaiOfHeader`, `LayoutVersionStore.versionsOf`, `LayoutVersions.state`
- Produces:
  - `LayoutHeaderImpact.evaluate(long headerId, BigDecimal draftVer, LocalDateTime applyFrom)` → `Result(List<Map<String, Object>> rows, List<MdmCheckIssue> errors, List<MdmCheckIssue> warnings, List<String> eaiCodes)`
  - 영향 행: `{LAYOUT_ID, LAYOUT_NAME, SND_RCV, VER, STATE /* CURRENT|FUTURE|DRAFT */, EVALUATED_AT, TOTAL_LENGTH_BEFORE, TOTAL_LENGTH_AFTER, ISSUES}` — 평가 시각 = max(apply_from, 그 전문 버전의 APPLY_FROM)(DRAFT 는 apply_from)
  - 오류: 합성 뒤 MSG_LENGTH 용량(L16), 재정의 값이 새 항목 길이를 넘음(L12). 경고: 재정의 대상이 새 헤더 버전에 CONST 항목으로 없음(코드 `ORPHAN_OVERRIDE`) — 전문별로 한 줄. `itemKey = LAYOUT_ID + "@" + VER`
  - 대상 전문 버전: 이 헤더를 쌓은 전문 버전 중 LEGACY 가 아니고 (DRAFT 이거나 RELEASED 이면서 `APPLY_TO > apply_from`)

- [ ] **Step 1: 실패하는 시험 작성**

```java
package com.dongkuk.dmes.mdm.dmb.layoutConfirm;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionService;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmValidateRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.service.LayoutConfirmService;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/** D-144 3단계 — 헤더 확정 화면의 영향도: 사용 전문·EAI, apply_from 시점 총 길이 전후, MSG_LENGTH 용량, 재정의 짝. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutHeaderConfirmImpactSqliteTest extends LayoutServiceTestSupport {

    static final String JUL1 = "2026-07-01 00:00:00";

    @Autowired LayoutConfirmService confirmService;
    @Autowired LayoutVersionService versions;

    @BeforeEach
    void setUp() {
        dictionary();
    }

    private String newMajorHeader(long id, List<Map<String, Object>> items) {
        LayoutVersionRequest r = new LayoutVersionRequest();
        r.setLayoutId(id);
        r.setVerKind("MAJOR");
        String ver = versions.newVersion(r, "HEADER").getVer();
        headerService.save(headerReq(layoutRow(id).get("LAYOUT_NAME").toString(), q -> {
            q.setLayoutId(id);
            q.setVer(ver);
            q.setRowVersion(0L);
        }), items);
        return ver;
    }

    private Map<String, Object> validate(long id, String ver) {
        LayoutConfirmValidateRequest r = new LayoutConfirmValidateRequest();
        r.setLayoutId(id);
        r.setVer(ver);
        r.setApplyFrom(JUL1);
        return confirmService.validate(r);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> m, String key) {
        return (List<Map<String, Object>>) m.get(key);
    }

    @Test
    void longerHeaderShowsUsingMessagesWithTotalLengthBeforeAndAfter() {
        M201 m = m201();
        List<Map<String, Object>> items = l110Items();
        items.set(5, filler(8));
        String ver = newMajorHeader(m.l110(), numbered(items));
        Map<String, Object> out = validate(m.l110(), ver);
        assertThat(list(out, "impact")).singleElement().satisfies(r -> {
            assertThat(((Number) r.get("LAYOUT_ID")).longValue()).isEqualTo(m.message());
            assertThat(r.get("STATE")).isEqualTo("CURRENT");
            assertThat(r.get("TOTAL_LENGTH_BEFORE")).isEqualTo(187);
            assertThat(r.get("TOTAL_LENGTH_AFTER")).isEqualTo(190);
        });
        assertThat(out.get("simultaneous")).isEqualTo(true);
    }

    @Test
    void eaiUsingTheHeaderIsListed() {
        M201 m = m201();
        String ver = newMajorHeader(m.l100(), l100Items());
        assertThat((List<String>) validate(m.l100(), ver).get("eais")).containsExactly(m.eai());
    }

    @Test
    void msgLengthOverflowBlocksHeaderConfirm() {
        column("LEN3", "길이 3자리", null, domain("T_NUM_3", "QTY", "NUMBER", 3, 0, null));
        long h = saveHeader(headerReq(uniq("길이칸 헤더 "), r -> {}), numbered(new ArrayList<>(List.of(item("AUTO", "LEN3", "MSG_LENGTH"), filler(7)))));
        release(h, "1.000", HEADER_FROM);
        Map<String, Object> saved = layoutService.save(layoutReq(uniq("긴 전문 "), null, r -> {}), List.of(headerRow(h)), List.of(),
                numbered(new ArrayList<>(List.of(filler(900)))));
        release(((Number) saved.get("layoutId")).longValue(), "1.000", MESSAGE_FROM);
        String ver = newMajorHeader(h, numbered(new ArrayList<>(List.of(item("AUTO", "LEN3", "MSG_LENGTH"), filler(97)))));
        Map<String, Object> out = validate(h, ver);
        assertThat(list(out, "checks")).anySatisfy(c -> {
            assertThat(c.get("severity")).isEqualTo("ERROR");
            assertThat(c.get("code")).isEqualTo("L16");
        });
        LayoutConfirmRequest r = new LayoutConfirmRequest();
        r.setLayoutId(h);
        r.setVer(ver);
        r.setRowVersion(rowVersion(h, ver));
        r.setApplyFrom(JUL1);
        r.setWarningsAcknowledged(true);
        assertThat(rejected(() -> confirmService.confirm(r)).getMessage()).contains("MDM010");
    }

    @Test
    void reorderKeepsOverrideButRemovedConstTargetWarnsPerMessage() {
        Map<String, Object> override = new LinkedHashMap<>();
        override.put("HEADER_SEQ", 2);
        override.put("CONST_VALUE", "B1");
        M201 m = m201(List.of(override)); // L100 SEQ 2 = SND_FAC_TP 재정의
        // 순서만 바꾼다(SND_FAC_TP ↔ SND_PROC_TP) — 물리명 짝이라 경고 없음
        List<Map<String, Object>> swapped = new ArrayList<>(l100Items());
        Map<String, Object> a = swapped.get(1);
        swapped.set(1, swapped.get(2));
        swapped.set(2, a);
        String ver = newMajorHeader(m.l100(), numbered(swapped));
        assertThat(list(validate(m.l100(), ver), "checks")).noneSatisfy(c -> assertThat(c.get("code")).isEqualTo("ORPHAN_OVERRIDE"));
        // 대상 항목을 같은 길이 여분으로 바꾼다 — 그 전문에 "재정의가 적용되지 않음" 경고
        List<Map<String, Object>> removed = new ArrayList<>(l100Items());
        removed.set(1, filler(4));
        LayoutVersionRequest del = new LayoutVersionRequest();
        del.setLayoutId(m.l100());
        del.setVer(ver);
        del.setRowVersion(rowVersion(m.l100(), ver));
        versions.deleteDraft(del, "HEADER");
        String ver2 = newMajorHeader(m.l100(), numbered(removed));
        Map<String, Object> out = validate(m.l100(), ver2);
        assertThat(list(out, "checks")).anySatisfy(c -> {
            assertThat(c.get("severity")).isEqualTo("WARNING");
            assertThat(c.get("code")).isEqualTo("ORPHAN_OVERRIDE");
            assertThat((String) c.get("message")).contains("SND_FAC_TP").contains("B1");
            assertThat(c.get("itemKey")).isEqualTo(m.message() + "@1.000");
        });
    }
}
```

(`m201(List)` 은 Task 5 에서 옮긴 도우미 — 재정의 행에 `HEADER_LAYOUT_ID` 를 L100 으로 채운다. `domain`·`column` 은 `LayoutTestSupport` 의 protected 도우미다.)

- [ ] **Step 2: 실패 확인**

Run: `cd <worktree>/src/backend/mdm && ../gradlew :api:test --tests '*LayoutHeaderConfirmImpactSqliteTest' --offline`
Expected: FAIL — `impact` 가 비고 L16·ORPHAN_OVERRIDE 가 없다.

- [ ] **Step 3: 구현**

```java
package com.dongkuk.dmes.mdm.dmb.layout.confirm;

/**
 * 헤더 확정 영향도(D-144 3단계, 스펙 §7) — 이 헤더를 쌓은 전문 버전(현재·미래 RELEASED, DRAFT)마다 apply_from 시점(그 버전이 더 늦게
 * 시작하면 그 시각)으로 "지금 헤더" 와 "이 헤더 DRAFT" 를 각각 합성해 총 길이 변화와 깨짐을 본다. 헤더 확정은 전문 버전을 만들지
 * 않는다(I18 폐지) — 영향은 판정 시각 해석으로 생긴다.
 */
@Component
public class LayoutHeaderImpact {

    public static final String ORPHAN_OVERRIDE = "ORPHAN_OVERRIDE";

    public record Result(List<Map<String, Object>> rows, List<MdmCheckIssue> errors, List<MdmCheckIssue> warnings, List<String> eaiCodes) {
    }

    private final LayoutQueries queries;
    private final LayoutVersionStore store;
    private final LayoutComposer composer;
    private final MdmLayoutRepository layoutRepository;
    private final Clock clock;

    // 생성자: 위 필드 전부

    public Result evaluate(long headerId, BigDecimal draftVer, LocalDateTime applyFrom) {
        LocalDateTime now = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        Set<LayoutKey> keys = new LinkedHashSet<>();
        for (MdmLayoutHeader h : queries.stacksUsing(headerId)) {
            keys.add(new LayoutKey(h.getLayoutId(), h.getVer()));
        }
        Map<Long, List<MdmLayoutVer>> versions = store.versionsOf(keys.stream().map(LayoutKey::layoutId).distinct().toList());
        List<Map<String, Object>> rows = new ArrayList<>();
        List<MdmCheckIssue> errors = new ArrayList<>();
        List<MdmCheckIssue> warnings = new ArrayList<>();
        for (LayoutKey k : keys) {
            MdmLayoutVer v = versions.getOrDefault(k.layoutId(), List.of()).stream()
                    .filter(x -> VersionNumbers.same(x.getVer(), k.ver())).findFirst().orElse(null);
            if (v == null || v.isLegacySnapshot() || v.isReleased() && !v.getApplyTo().isAfter(applyFrom)) {
                continue;
            }
            LocalDateTime at = v.isReleased() && v.getApplyFrom().isAfter(applyFrom) ? v.getApplyFrom() : applyFrom;
            MdmLayout msg = layoutRepository.findById(k.layoutId()).orElseThrow();
            String itemKey = k.layoutId() + "@" + VersionNumbers.plain(k.ver());
            String label = "전문 " + msg.getLayoutName() + " " + VersionNumbers.label(k.ver());
            Integer before = null;
            try {
                before = composer.compose(k.layoutId(), k.ver(), at).totalLength();
            } catch (BusinessException e) {
                // 지금 헤더로는 합성할 수 없다(예: 이 헤더의 첫 확정) — 전 길이를 비운다
            }
            List<String> issues = new ArrayList<>();
            Integer after = null;
            try {
                LayoutComposer.Composition c = composer.composeDetailed(k.layoutId(), k.ver(), at, Map.of(headerId, draftVer));
                after = c.snapshot().totalLength();
                for (LayoutIssue i : LayoutLengthRules.msgLengthIssues(c.snapshot())) {
                    errors.add(new MdmCheckIssue(i.code().name(), label + ": " + i.message(), i.field(), itemKey));
                    issues.add(i.message());
                }
                for (MdmCheckIssue i : overrideFit(c.snapshot(), headerId, label, itemKey)) {
                    errors.add(i);
                    issues.add(i.message());
                }
                for (LayoutComposer.OrphanOverride o : c.orphans()) {
                    if (o.headerLayoutId() != headerId) {
                        continue;
                    }
                    String message = label + ": 재정의 " + o.headerColumnPhys() + "=" + o.value()
                            + " 이 적용되지 않습니다(새 헤더 버전에 그 CONST 항목이 없다 — 헤더 기본값으로 나간다)";
                    warnings.add(new MdmCheckIssue(ORPHAN_OVERRIDE, message, "HEADER_COLUMN_PHYS", itemKey));
                    issues.add(message);
                }
            } catch (BusinessException e) {
                // 이 헤더 말고 다른 쌓인 헤더가 그 시각에 확정 버전이 없다 — 이 헤더 탓이 아니므로 경고로만 보인다
                warnings.add(new MdmCheckIssue("HEADER_UNRESOLVED", label + ": " + e.getMessage(), "HEADER_LAYOUT_ID", itemKey));
                issues.add(e.getMessage());
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("LAYOUT_ID", k.layoutId());
            row.put("LAYOUT_NAME", msg.getLayoutName());
            row.put("SND_RCV", msg.getSndSystem() + " → " + msg.getRcvSystem());
            row.put("VER", VersionNumbers.plain(k.ver()));
            row.put("STATE", LayoutVersions.state(v, now));
            row.put("EVALUATED_AT", LayoutTimes.text(at));
            row.put("TOTAL_LENGTH_BEFORE", before);
            row.put("TOTAL_LENGTH_AFTER", after);
            row.put("ISSUES", String.join(" / ", issues));
            rows.add(row);
        }
        List<String> eais = queries.eaiOfHeader(headerId).stream().map(MdmEai::getEaiCode).toList();
        return new Result(rows, errors, warnings, eais);
    }

    /** 재정의 값이 새 헤더 항목 길이(인코딩 바이트)를 넘으면 L12 — 직렬화가 넘침으로 실패한다. */
    private static List<MdmCheckIssue> overrideFit(MdmLayoutSnapshot s, long headerId, String label, String itemKey) {
        List<MdmCheckIssue> out = new ArrayList<>();
        Charset cs = LayoutSerializer.charset(s);
        for (MdmLayoutHeaderRef h : s.headers()) {
            if (h.headerLayoutId() != headerId) {
                continue;
            }
            for (MdmLayoutItemSnapshot i : h.items()) {
                if (i.overrideValue() != null && i.overrideValue().getBytes(cs).length > i.length()) {
                    out.add(new MdmCheckIssue(LayoutIssueCode.L12.name(), label + ": 재정의 " + i.columnPhys() + "=" + i.overrideValue()
                            + " 가 새 항목 길이 " + i.length() + " 를 넘습니다", "CONST_VALUE", itemKey));
                }
            }
        }
        return out;
    }
}
```

`LayoutConfirmChecks` 에 `private final LayoutHeaderImpact headerImpact;`(생성자 인자 포함)를 더하고, `report` 의 헤더 분기에서 `eais = queries.eaiOfHeader(...)` 줄을 다음으로 바꾼다:

```java
            LayoutHeaderImpact.Result r = headerImpact.evaluate(id, draft.ver(), applyFrom);
            errors.addAll(r.errors());
            warnings.addAll(r.warnings());
            impact = r.rows();
            eais = r.eaiCodes();
```

- [ ] **Step 4: 통과 확인**

Run: `cd <worktree>/src/backend/mdm && ../gradlew :api:test --tests '*LayoutHeaderConfirmImpactSqliteTest' --tests '*LayoutConfirmSqliteTest' --offline`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout/confirm src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/layoutConfirm/LayoutHeaderConfirmImpactSqliteTest.java
/usr/bin/git -C <worktree> commit -m "feat(mdm): 헤더 확정에 사용 전문·EAI 영향도와 apply_from 시점 총 길이·재정의 검사를 더한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 과거 재현 시험(목적 3) — 헤더 확정 전후 T 로 직렬화가 달라지고 이전 T 로 과거 전문을 재현한다

**Files:**
- Test (Create): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/layoutConfirm/LayoutPastReproductionSqliteTest.java`

**Interfaces:**
- Consumes: `MdmLayoutSnapshotResolver.at`(= `LayoutComposer`), `LayoutCodecs.serializer()/parser()`, `MdmLayoutSerializeContext`, `LayoutConfirmService.confirm`, `LayoutVersionService.newVersion`
- Produces: 없음(시험만). 실패하면 Task 4·5·7 의 결함이다 — 시험을 고치지 말고 그 Task 의 코드를 고친다.

- [ ] **Step 1: 시험 작성**

```java
package com.dongkuk.dmes.mdm.dmb.layoutConfirm;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSerializeContext;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshotResolver;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutCodecs;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionService;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.service.LayoutConfirmService;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionRequest;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/** D-144 목적 3 — 헤더 확정 전후 T 로 같은 전문 버전의 직렬화 결과가 달라지고, 이전 T 로 과거 전문을 그대로 재현한다(스펙 §11). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutPastReproductionSqliteTest extends LayoutServiceTestSupport {

    static final LocalDateTime BEFORE = LocalDateTime.of(2026, 6, 30, 23, 59, 59);
    static final LocalDateTime SWITCH = LocalDateTime.of(2026, 7, 1, 0, 0, 0);
    static final MdmLayoutSerializeContext CTX = new MdmLayoutSerializeContext(LocalDateTime.of(2026, 6, 30, 12, 0, 0), 7L);

    @Autowired MdmLayoutSnapshotResolver resolver;
    @Autowired LayoutCodecs codecs;
    @Autowired LayoutVersionService versions;
    @Autowired LayoutConfirmService confirmService;

    @BeforeEach
    void setUp() {
        dictionary();
    }

    private byte[] serialize(long messageId, LocalDateTime t, Map<String, Object> record) {
        MdmLayoutSnapshot s = resolver.at(messageId, t);
        return codecs.serializer().serialize(s, record, CTX);
    }

    @Test
    void headerConfirmChangesWireOnlyFromApplyFromAndPastIsReproducible() {
        M201 m = m201();
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("COIL_ID", "C123");
        record.put("PROD_DT", "20260630");
        record.put("COIL_THK", "1.5");
        byte[] past = serialize(m.message(), BEFORE, record);
        assertThat(past).hasSize(187);

        // L110 의 여분 5 → 8 (헤더 길이 30 → 33) 을 2026-07-01 에 적용하도록 확정한다
        LayoutVersionRequest nv = new LayoutVersionRequest();
        nv.setLayoutId(m.l110());
        nv.setVerKind("MAJOR");
        String ver = versions.newVersion(nv, "HEADER").getVer();
        List<Map<String, Object>> items = l110Items();
        items.set(5, filler(8));
        headerService.save(headerReq("L2 구간 헤더", r -> {
            r.setLayoutId(m.l110());
            r.setVer(ver);
            r.setRowVersion(0L);
        }), numbered(items));
        LayoutConfirmRequest c = new LayoutConfirmRequest();
        c.setLayoutId(m.l110());
        c.setVer(ver);
        c.setRowVersion(rowVersion(m.l110(), ver));
        c.setApplyFrom("2026-07-01 00:00:00");
        c.setWarningsAcknowledged(true);
        confirmService.confirm(c);

        // 전문 버전은 그대로(1.000) — 헤더 확정은 전문 버전을 만들지 않는다
        assertThat(versionRows(m.message())).hasSize(1);
        // 직전 T: 과거와 같은 바이트
        assertThat(serialize(m.message(), BEFORE, record)).isEqualTo(past);
        // 전환 T: 총 길이 190, 본문이 3 바이트 뒤로 밀린다
        byte[] after = serialize(m.message(), SWITCH, record);
        assertThat(after).hasSize(190);
        assertThat(new String(after, 133, 4)).isEqualTo("C123");
        assertThat(new String(past, 130, 4)).isEqualTo("C123");
        // 전환 뒤 시계에서도 이전 T 로 과거 전문을 재현한다
        clock.setLocal(LocalDateTime.of(2026, 7, 2, 9, 0, 0));
        assertThat(serialize(m.message(), BEFORE, record)).isEqualTo(past);
        // 같은 T 의 스냅샷으로 파싱하면 값이 돌아온다
        Map<String, Object> parsed = codecs.parser().parse(resolver.at(m.message(), SWITCH), after);
        assertThat(parsed.get("COIL_ID")).isEqualTo("C123");
    }

    @Test
    void preMigrationTimeUsesLegacySnapshot() {
        M201 m = m201();
        // 이행 전 이력 하나를 V19 이행 결과 모양(LEGACY)으로 둔다 — 헤더 길이가 지금과 다른(합 120) 시절
        String legacy = "{\"eaiCode\":null,\"encoding\":null,\"headers\":[],\"items\":[],\"layoutId\":" + m.message()
                + ",\"layoutName\":\"M\",\"layoutVersion\":1,\"padRule\":null,\"rcvSystem\":null,\"sndSystem\":null,\"totalLength\":177}";
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, APPLY_FROM, APPLY_TO, OWN_LENGTH, SNAPSHOT_JSON, "
                + "LEGACY_SNAPSHOT_YN) VALUES (?, 0.500, 'MAJOR', 'RELEASED', '2025-01-01 00:00:00', ?, 0, ?, 'Y')",
                m.message(), MESSAGE_FROM, legacy);
        assertThat(resolver.at(m.message(), LocalDateTime.of(2025, 6, 1, 0, 0)).totalLength()).isEqualTo(177);
        assertThat(resolver.at(m.message(), LocalDateTime.of(2026, 3, 1, 0, 0)).totalLength()).isEqualTo(187);
    }
}
```

(본문 첫 칸 `COIL_ID` 의 절대 위치: 헤더 100 + 30 = 130, 확정 뒤 100 + 33 = 133. 레코드 키·값 모양은 `LayoutSerializerRoundTripTest` 의 M201 레코드를 따른다 — 숫자 칸 `COIL_THK` 표현이 다르면 그 시험의 값을 쓴다.)

- [ ] **Step 2: 실행**

Run: `cd <worktree>/src/backend/mdm && ../gradlew :api:test --tests '*LayoutPastReproductionSqliteTest' --offline`
Expected: PASS(Task 4·5·7 이 맞으면 바로 통과한다). 실패하면 원인 Task 의 코드를 고친다.

- [ ] **Step 3: Commit**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/layoutConfirm/LayoutPastReproductionSqliteTest.java
/usr/bin/git -C <worktree> commit -m "test(mdm): 헤더 확정 전후 시각으로 전문 직렬화가 달라지고 이전 시각으로 과거 전문을 재현하는지 고정한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 컬럼·도메인 영향도가 RELEASED(현재·미래)와 DRAFT 를 구분한다

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout/LayoutImpactFinder.java:42-123`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout/LayoutItemReferenceSpi.java:27-37`
- Test (Modify): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/layoutMng/LayoutImpactSqliteTest.java`

**Interfaces:**
- Consumes: Task 4 `LayoutQueries.itemsUsingColumns` → `{item, layout, version}`, `LayoutVersions.state`, `LayoutQueries.stacksUsing`
- Produces:
  - `record Usage(MdmLayoutItem item, MdmLayout layout, MdmLayoutVer version, String state, long usedByCount)` — `state` ∈ `CURRENT|FUTURE|DRAFT`(PAST 는 결과에서 뺀다)
  - `search` 행에 `VER`(plain)·`VER_STATE` 추가. `IMPACT` 문구: CURRENT 는 지금 문구 그대로, FUTURE 는 `"적용 예정 " + label + " (" + APPLY_FROM + ") — 확정취소 또는 새 버전으로 반영"`, DRAFT 는 `"작성 중 " + label + " — 확정 전에 고칠 수 있다"`. 헤더 `USED_BY_COUNT` = 이 헤더를 쌓은 CURRENT·FUTURE·DRAFT 전문 버전의 서로 다른 전문 수
  - domainMng 참조 문자열 끝에 `" [" + label + " " + 상태 한글(현재·예정·작성 중) + "]"`

- [ ] **Step 1: 실패하는 시험 작성** — `LayoutImpactSqliteTest` 에 더한다(이 클래스는 Task 5 에서 `LayoutServiceTestSupport` 로 바뀌었다).

```java
    @Test
    void impactSeparatesCurrentFutureAndDraftVersions() {
        M201 m = m201();
        LayoutVersionRequest nv = new LayoutVersionRequest();
        nv.setLayoutId(m.message());
        nv.setVerKind("MINOR");
        String ver = versions.newVersion(nv, "MESSAGE").getVer();
        List<Map<String, Object>> rows = layoutService.search(impactReq("COIL_ID")).get("impacts") instanceof List<?> l
                ? (List<Map<String, Object>>) l : List.of();
        assertThat(rows).extracting(r -> r.get("VER") + "/" + r.get("VER_STATE"))
                .containsExactlyInAnyOrder("1.000/CURRENT", ver + "/DRAFT");
        release(m.message(), ver, "2026-12-01 00:00:00");
        List<Map<String, Object>> after = (List<Map<String, Object>>) layoutService.search(impactReq("COIL_ID")).get("impacts");
        assertThat(after).extracting(r -> r.get("VER") + "/" + r.get("VER_STATE"))
                .containsExactlyInAnyOrder("1.000/CURRENT", ver + "/FUTURE");
        assertThat(after).anySatisfy(r -> assertThat((String) r.get("IMPACT")).startsWith("적용 예정"));
    }
```

(`impactReq(keyword)` 는 `LayoutMngSearchRequest` 에 `target=IMPACT`·`keyword` 를 채우는 도우미 — 이 시험 클래스에 이미 같은 일을 하는 코드가 있으면 그것을 쓴다. `versions` 는 `@Autowired LayoutVersionService`. `release` 가 직전 열린 구간을 미래 시각에서 닫으므로 1.000 은 지금도 CURRENT 다.)

- [ ] **Step 2: 실패 확인**

Run: `cd <worktree>/src/backend/mdm && ../gradlew :api:test --tests '*LayoutImpactSqliteTest' --offline`
Expected: FAIL(`VER_STATE` 없음, 버전마다 행이 갈리지 않음).

- [ ] **Step 3: 구현** — `itemsUsing` 이 `queries.itemsUsingColumns` 의 `{item, layout, version}` 을 받아 `state = LayoutVersions.state(version, now)` 를 구하고 `PAST` 는 버린다(`now` 는 주입한 `Clock`). 헤더 사용 수는 헤더마다 한 번 `queries.stacksUsing(headerId)` → 그 행의 (전문, 버전) 상태가 PAST 가 아닌 서로 다른 전문 수(버전 상태는 `versionStore.versionsOf` 한 번으로 읽는다). `search` 의 행에 `VER`·`VER_STATE` 를 넣고 `IMPACT` 문구를 Interfaces 대로 고른다. `ITEM` 칸의 오프셋은 저장값(헤더 = 헤더 안, 본문 = 본문 기준)이므로 문구를 `"(본문 " + offset + " / " + length + ")"`(헤더면 `"(헤더 안 ...)"`)로 바꿔 오해를 막는다. `LayoutItemReferenceSpi` 는 같은 `Usage` 로 참조 문자열 끝에 상태 표시를 더한다.

- [ ] **Step 4: 통과 확인**

Run: `cd <worktree>/src/backend/mdm && ../gradlew :api:test --tests '*LayoutImpactSqliteTest' --tests '*DomainMng*' --tests '*LayoutOasisFlowTest' --offline`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout/LayoutImpactFinder.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmb/layout/LayoutItemReferenceSpi.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/layoutMng/LayoutImpactSqliteTest.java
/usr/bin/git -C <worktree> commit -m "feat(mdm): 컬럼·도메인 영향 전문을 현재·적용 예정·작성 중 버전으로 나눠 보인다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: 권한 — DMB 담당자 확정 권한과 layoutConfirm 메뉴 시드

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/security/MdmPermissions.java:45`
- Modify: `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java:1000`(호출 한 줄), `:1296`(dmb 행), `:1441-1462` 뒤(새 메서드 `seedMdmLayoutConfirmMenu`)
- Test (Modify): `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/security/SecurityScreenContractTest.java:96-98`(기대 매트릭스), `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmOasisActionVocabularyTest.java:145`(시드 매트릭스 대조 — 시드를 읽어 비교하므로 두 파일이 같으면 통과)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `MdmPermissions.MATRIX.get(DMB) == Map.of(STD_ADMIN, EDIT, STEWARD, CONFIRM)`
  - 메뉴 `dmb/layoutConfirm`(OBJECT_ID `layoutConfirm`, 이름 "레이아웃 확정", MENU_SEQ `003`, FULL_SEQ `5020130`), SYSADMIN `PERM_ALL`, `seedMdmObjectRbac("layoutConfirm", "dmb")`
  - action `copy`·`delete`·`lock`·`unlock`·`handover`(EDIT 세트)·`confirm`(CONFIRM 세트)은 이미 권한 세트에 있어 세트 정의는 바꾸지 않는다

- [ ] **Step 1: 실패하는 시험 작성** — `SecurityScreenContractTest` 의 기대 매트릭스 DMB 행을 `Map.of(MdmRoles.STD_ADMIN, MdmPermissions.EDIT, MdmRoles.STEWARD, MdmPermissions.CONFIRM)` 로 바꾸고, 같은 시험 클래스에 메뉴 시드 사례를 더한다(시드 파일을 읽는 기존 방식이 `MdmOasisActionVocabularyTest` 에 있으면 그쪽에):

```java
    @Test
    void layoutConfirmMenuIsSeededUnderDmb() throws Exception {
        String seed = java.nio.file.Files.readString(java.nio.file.Path.of(
                "../../mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java"));
        assertTrue(seed.contains("insertMcmSecMenuIfAbsent(\"layoutConfirm\", \"003\", \"5020130\", \"레이아웃 확정\", \"dmb\", \"layoutConfirm\")"));
        assertTrue(seed.contains("seedMdmObjectRbac(\"layoutConfirm\", \"dmb\")"));
    }
```

(상대 경로는 이 시험이 도는 모듈 디렉터리 기준이다 — `MdmOasisActionVocabularyTest` 가 DataInitializer 를 읽는 경로 상수를 그대로 쓴다.)

- [ ] **Step 2: 실패 확인**

Run: `cd <worktree>/src/backend/mdm && ../gradlew :lib:test --tests '*SecurityScreenContractTest' --offline && ../gradlew :api:test --tests '*MdmOasisActionVocabularyTest' --offline`
Expected: FAIL(매트릭스 DMB 가 READ, 메뉴 없음).

- [ ] **Step 3: 구현**

`MdmPermissions`:

```java
            MdmScreenGroup.DMB, Map.of(MdmRoles.STD_ADMIN, EDIT, MdmRoles.STEWARD, CONFIRM),
```

javadoc 에 "DMB 담당자 CONFIRM — 레이아웃·헤더 버전 확정(D-144 3단계). 공통 엔진이 선점·확정에 담당자 역할을 요구한다" 한 줄.

`DataInitializer.seedMdmObjectRbac` 의 dmb 행:

```java
                "dmb", java.util.Map.of("MDM_STD_ADMIN", "PERM_MDM_EDIT", "MDM_STEWARD", "PERM_MDM_CONFIRM"),
```

새 메서드(`seedMdmLayoutMenus()` 뒤, 호출은 `:1000` 의 `seedMdmLayoutMenus();` 다음 줄):

```java
    /**
     * D-144 3단계 — 레이아웃 확정(dmb/layoutConfirm, 전문·헤더 공용). 05-02 의 seedMdmLayoutMenus() 배열은 고치지 않고 같은 dmb 폴더
     * 아래 새 leaf 로 등록한다. action(search·view·validate·confirm)은 기존 권한 세트·allActions 안에 있다. DMB 담당자는 CONFIRM 이다
     * (이미 있는 DB 의 옛 READ 매핑 행은 남는다 — READ ⊂ CONFIRM 이라 합집합이 CONFIRM 이다).
     */
    private void seedMdmLayoutConfirmMenu() {
        final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
        final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";
        insertMcmSecObjIfAbsent("layoutConfirm", "레이아웃 확정", "mdm");
        insertMcmSecMenuIfAbsent("layoutConfirm", "003", "5020130", "레이아웃 확정", "dmb", "layoutConfirm");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID",     "PERMISSION_ID"},
                new String[]{"SYSADMIN", "layoutConfirm", "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', 'layoutConfirm', 'PERM_ALL'" + AUDIT_VALS + ")");
        seedMdmObjectRbac("layoutConfirm", "dmb");
        // 이미 시드된 headerMng·layoutMng 에도 담당자 CONFIRM 매핑을 더한다(insert-if-absent)
        seedMdmObjectRbac("headerMng", "dmb");
        seedMdmObjectRbac("layoutMng", "dmb");
        log.info("[DataInitializer] D-144 MDM 레이아웃 확정 시드 — OBJECT 1 + 메뉴 leaf 1(dmb) + RBAC, dmb 담당자 CONFIRM");
    }
```

(착수 때 `grep -n '"dmb"' DataInitializer.java` 로 MENU_SEQ `003`·FULL_SEQ `5020130` 이 비어 있는지 다시 본다 — 2단계가 같은 파일의 dme 쪽만 고쳤어야 한다.)

- [ ] **Step 4: 통과 확인**

Run: `cd <worktree>/src/backend/mdm && ../gradlew :lib:test --tests '*SecurityScreenContractTest' --offline && ../gradlew :api:test --tests '*MdmOasisActionVocabularyTest' --offline && cd <worktree>/src/backend && ./gradlew :mcm:api:compileJava --offline`
Expected: PASS·컴파일 성공(mcm 프로젝트 경로 이름이 다르면 `settings.gradle` 의 이름을 쓴다).

- [ ] **Step 5: Commit**(mcm 파일은 이 경로 하나만)

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/security/MdmPermissions.java src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/security/SecurityScreenContractTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmOasisActionVocabularyTest.java
/usr/bin/git -C <worktree> commit -m "feat(mdm,mcm): 레이아웃 그룹 담당자에게 확정 권한을 주고 레이아웃 확정 메뉴를 시드한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: 프런트 계약 — 버전 문자열·rowVersion·T, 버전 액션 API, 버전·영향도 탭 열

**Files (모두 `src/frontend/m-mdm/` 아래):**
- Modify: `pages/dmb/layoutMng/types.ts`(`LayoutDraft`·`LayoutRow`·`ViewResult`·`SaveResult`·`VersionRow`·`ExportResult`·`ImpactRow`), `pages/dmb/layoutMng/api.ts:84-127`
- Modify: `pages/dmb/headerMng/types.ts`(`HeaderDraft`·`HeaderRow`·`UsedByRow`·`ViewResult`·`SaveResult`), `pages/dmb/headerMng/api.ts:79-86`
- Create: `src/layout/version-api.ts`(두 화면 공용 버전 액션 호출), `src/layout/version-rows.ts`(버전 행 → 화면 상태 계산)
- Modify: `pages/dmb/layoutMng/components/VersionPanel.tsx`(열·행 키·선택), `pages/dmb/layoutMng/components/ImpactPanel.tsx`(버전·상태 열), `src/layout/snapshot-export.ts`(파일 이름·버전 표시)
- Test: `tests/dmb/layoutMng/api.test.ts`, `tests/dmb/layoutMng/tabs-render.test.ts`, `tests/dmb/headerMng/api.test.ts`, `tests/layout/version-rows.test.ts`(Create)

**Interfaces:**
- Consumes: Task 5~7 서버 계약(`view.selected`, `view.versions[*].VER: string`, `editable`, `canNewMajor/canNewMinor/nextMajor/nextMinor`, `save` 응답 `ver`·`rowVersion`, `export {ver, asOf}`, 버전 액션 `copy|delete|lock|unlock|handover`), 1단계 `fmtVer`·`normVer`·`sameVer`(`@/shell`)
- Produces:
  - `interface LayoutVersionRow { VER: string; VER_KIND: "MAJOR" | "MINOR"; STATUS: string; STATE: "DRAFT" | "CURRENT" | "FUTURE" | "PAST"; BASE_VER?: string | null; OWNER_ID?: string | null; APPLY_FROM?: string | null; APPLY_TO?: string | null; ROW_VERSION: number; OWN_LENGTH: number; SWITCH_MODE?: string | null; CHANGE_KINDS?: string | null; CHANGE_SUMMARY?: string | null; LEGACY: "Y" | "N"; REQUESTED_BY?: string | null; RELEASED_AT?: string | null }`(`src/layout/types.ts` 에 두고 두 화면이 쓴다)
  - `LayoutDraft { layoutId: number | null; ver: string | null; rowVersion: number | null; asOf: string | null; layoutName; eaiCode; sndSystem; rcvSystem }`, `HeaderDraft` 도 `ver: string | null; rowVersion: number | null` 추가(감사 카운터는 응답 `AUD_VER` 로만 받는다)
  - `version-api.ts`: `newLayoutVersion(screen: "layoutMng" | "headerMng", layoutId: number, verKind: "MAJOR" | "MINOR")`, `deleteLayoutDraft(screen, layoutId, ver: string, rowVersion: number)`, `cancelLayoutConfirm(screen, layoutId, ver, rowVersion)`, `lockLayoutDraft(...)`, `unlockLayoutDraft(...)`, `handoverLayoutDraft(screen, layoutId, ver, rowVersion, newOwnerId: string)` — 모두 `Promise<{ layoutId: number; ver: string; verKind?: string | null; rowVersion?: number | null }>`
  - `version-rows.ts`: `versionActionState(view: { selected?: LayoutVersionRow | null; versions?: LayoutVersionRow[]; editable?: boolean; canNewMajor?: boolean; canNewMinor?: boolean; nextMajor?: string | null; nextMinor?: string | null }, me: string, can: (action: string) => boolean)` → `{ newMajor, newMinor, delete, confirm, cancelConfirm, lock, unlock, handover }`(각 `VersionAction`)
  - `exportSnapshot(layoutId: number, ver?: string | null, asOf?: string | null)`, `viewLayout(layoutId: number, ver?: string | null, asOf?: string | null)`, `viewHeader(layoutId: number, ver?: string | null)`

- [ ] **Step 1: 실패하는 시험 작성**

`tests/layout/version-rows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { versionActionState } from "@/layout/version-rows";
import type { LayoutVersionRow } from "@/layout/types";

const row = (over: Partial<LayoutVersionRow>): LayoutVersionRow => ({
  VER: "1.000", VER_KIND: "MAJOR", STATUS: "RELEASED", STATE: "CURRENT", ROW_VERSION: 0, OWN_LENGTH: 57, LEGACY: "N", ...over,
});
const all = () => true;

describe("versionActionState", () => {
  it("my draft: delete·confirm·unlock·handover on, new versions off", () => {
    const draft = row({ VER: "1.001", VER_KIND: "MINOR", STATUS: "DRAFT", STATE: "DRAFT", OWNER_ID: "kim" });
    const s = versionActionState({ selected: draft, versions: [draft, row({})], editable: true, canNewMajor: false, canNewMinor: false }, "kim", all);
    expect(s.delete.enabled).toBe(true);
    expect(s.confirm.enabled).toBe(true);
    expect(s.unlock.enabled).toBe(true);
    expect(s.lock.enabled).toBe(false);
    expect(s.newMinor.enabled).toBe(false);
  });
  it("unowned draft can be locked, future release can be cancelled", () => {
    const unowned = row({ VER: "2.000", STATUS: "DRAFT", STATE: "DRAFT", OWNER_ID: null });
    expect(versionActionState({ selected: unowned, versions: [unowned] }, "kim", all).lock.enabled).toBe(true);
    const future = row({ VER: "2.000", STATE: "FUTURE", OWNER_ID: "kim" });
    expect(versionActionState({ selected: future, versions: [future] }, "kim", all).cancelConfirm.enabled).toBe(true);
  });
  it("new version titles show the next number", () => {
    const s = versionActionState({ selected: row({}), versions: [row({})], canNewMajor: true, canNewMinor: true, nextMajor: "2.000",
      nextMinor: "1.001" }, "kim", all);
    expect(s.newMajor.title).toContain("v2.000");
    expect(s.newMinor.title).toContain("v1.001");
  });
  it("permission gates every action", () => {
    const s = versionActionState({ selected: row({}), versions: [row({})], canNewMajor: true, canNewMinor: true }, "kim", () => false);
    expect(Object.values(s).every((a) => !a.enabled)).toBe(true);
  });
});
```

`tests/dmb/layoutMng/api.test.ts` 에 더한다(기존 fetch mock 방식 그대로):

```ts
  it("copy sends verKind and keeps minor version as string", async () => {
    mockOk({ layoutId: 201, ver: "1.001", verKind: "MINOR", rowVersion: 0 });
    const out = await newLayoutVersion("layoutMng", 201, "MINOR");
    expect(lastCall().url).toContain("/oasis/layoutMng/copy");
    expect(lastCall().params).toEqual({ layoutId: 201, verKind: "MINOR" });
    expect(out.ver).toBe("1.001");
  });
  it("export sends ver and asOf as strings", async () => {
    mockOk({ layoutId: 201, ver: "1.001", asOf: "2026-07-01 00:00:00" });
    await exportSnapshot(201, "1.001", "2026-07-01 00:00:00");
    expect(lastCall().params).toEqual({ layoutId: 201, ver: "1.001", asOf: "2026-07-01 00:00:00" });
  });
```

(`mockOk`·`lastCall` 은 이 시험 파일의 기존 도우미 이름을 쓴다 — 없으면 `globalThis.fetch` 를 `vi.fn` 으로 바꾸고 요청 본문 JSON 의 `params` 를 읽는 도우미를 이 파일에 둔다.)

`tests/dmb/layoutMng/tabs-render.test.ts` 에 VersionPanel 사례를 더한다(Review Focus 5):

```ts
  it("version panel keeps minor version strings and shows state·kind·apply range·owner", async () => {
    const onSelect = vi.fn();
    render(VersionPanel, {
      versions: [
        { VER: "1.001", VER_KIND: "MINOR", STATUS: "DRAFT", STATE: "DRAFT", OWNER_ID: "kim", ROW_VERSION: 0, OWN_LENGTH: 57, LEGACY: "N" },
        { VER: "1.000", VER_KIND: "MAJOR", STATUS: "RELEASED", STATE: "CURRENT", APPLY_FROM: "2026-02-01 00:00:00",
          APPLY_TO: "9999-12-31 00:00:00", ROW_VERSION: 1, OWN_LENGTH: 57, LEGACY: "N" },
      ],
      selectedVersion: "1.001", onSelectVersion: onSelect, snapshot: null, onDownloadJson: () => {}, onDownloadExcel: () => {}, busy: false,
    });
    const text = visibleText();
    expect(text).toContain("v1.001");
    expect(text).toContain("minor");
    expect(text).toContain("2026-02-01 00:00:00");
    expect(text).toContain("kim");
    clickRow("1.000");
    expect(onSelect).toHaveBeenCalledWith("1.000");
  });
```

(`render`·`visibleText`·`clickRow` 는 이 파일·`tests/dmb/helpers/render` 의 기존 도우미를 쓴다. AG Grid 행 클릭을 흉내 내는 도우미가 없으면 `onRowClick` 을 직접 부르는 방식으로 이 파일의 다른 그리드 시험과 같게 한다.)

- [ ] **Step 2: 실패 확인**

Run: `cd <worktree>/src/frontend/m-mdm && npx vitest run tests/layout/version-rows.test.ts tests/dmb/layoutMng/api.test.ts tests/dmb/layoutMng/tabs-render.test.ts`
Expected: FAIL(`@/layout/version-rows` 없음, `newLayoutVersion` 없음).

- [ ] **Step 3: 구현**

`src/layout/version-rows.ts`:

```ts
/** 레이아웃·헤더 버전 버튼 상태(D-144 3단계). 서버 판정값(editable·canNew*)을 다시 계산하지 않고 소유자·상태만 본다. */
import { fmtVer, type VersionAction } from "@/shell";
import type { LayoutVersionRow } from "./types";

export interface LayoutVersionView {
  selected?: LayoutVersionRow | null;
  versions?: LayoutVersionRow[];
  editable?: boolean;
  canNewMajor?: boolean;
  canNewMinor?: boolean;
  nextMajor?: string | null;
  nextMinor?: string | null;
}

export interface LayoutVersionActions {
  newMajor: VersionAction; newMinor: VersionAction; delete: VersionAction; confirm: VersionAction;
  cancelConfirm: VersionAction; lock: VersionAction; unlock: VersionAction; handover: VersionAction;
}

export function versionActionState(view: LayoutVersionView, me: string, can: (action: string) => boolean): LayoutVersionActions {
  const s = view.selected ?? null;
  const draft = s?.STATUS === "DRAFT";
  const mine = draft && s?.OWNER_ID === me;
  const off = (title: string): VersionAction => ({ enabled: false, title });
  const on = (ok: boolean, action: string, title: string): VersionAction =>
    ok && can(action) ? { enabled: true, title } : off(title);
  return {
    newMajor: on(!!view.canNewMajor, "copy", view.nextMajor ? `새 버전 ${fmtVer(view.nextMajor)}` : "미적용 버전이 있으면 만들 수 없습니다"),
    newMinor: on(!!view.canNewMinor, "copy", view.nextMinor ? `새 버전 ${fmtVer(view.nextMinor)}` : "minor 를 올릴 수 없습니다"),
    delete: on(!!mine, "delete", "내 DRAFT 만 지울 수 있습니다"),
    confirm: on(!!mine, "confirm", "내 DRAFT 를 확정 화면에서 확정합니다"),
    cancelConfirm: on(s?.STATE === "FUTURE" && s?.OWNER_ID === me, "delete", "적용 전 확정만 되돌릴 수 있습니다"),
    lock: on(draft && !s?.OWNER_ID, "lock", "소유자 없는 DRAFT 만 선점할 수 있습니다"),
    unlock: on(!!mine, "unlock", "내 DRAFT 만 해제할 수 있습니다"),
    handover: on(!!mine, "handover", "내 DRAFT 만 넘길 수 있습니다"),
  };
}
```

`src/layout/version-api.ts`(두 화면의 `callAction` 과 같은 봉투·`cleanParams` 규칙):

```ts
import { apiRequest } from "@dk-oasis/shared/http";

export type LayoutScreen = "layoutMng" | "headerMng";
export interface LayoutVersionResult { layoutId: number; ver: string; verKind?: string | null; rowVersion?: number | null }

interface Envelope { meta?: { success?: boolean; message?: string | null }; data?: { result?: LayoutVersionResult } }

async function call(screen: LayoutScreen, action: string, params: Record<string, unknown>): Promise<LayoutVersionResult> {
  const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ""));
  const res = (await apiRequest<unknown>(`/api/mdm/oasis/${screen}/${action}`, {
    method: "POST", body: JSON.stringify({ meta: { menuId: screen }, params: cleaned }),
  })) as Envelope;
  if (res?.meta && res.meta.success === false) throw new Error(res.meta.message?.trim() || "요청이 거부되었습니다.");
  return res.data?.result as LayoutVersionResult;
}

export const newLayoutVersion = (s: LayoutScreen, layoutId: number, verKind: "MAJOR" | "MINOR") => call(s, "copy", { layoutId, verKind });
export const deleteLayoutDraft = (s: LayoutScreen, layoutId: number, ver: string, rowVersion: number) =>
  call(s, "delete", { layoutId, ver, rowVersion, target: "VERSION" });
export const cancelLayoutConfirm = (s: LayoutScreen, layoutId: number, ver: string, rowVersion: number) =>
  call(s, "delete", { layoutId, ver, rowVersion, target: "CONFIRM" });
export const lockLayoutDraft = (s: LayoutScreen, layoutId: number, ver: string, rowVersion: number) => call(s, "lock", { layoutId, ver, rowVersion });
export const unlockLayoutDraft = (s: LayoutScreen, layoutId: number, ver: string, rowVersion: number) =>
  call(s, "unlock", { layoutId, ver, rowVersion });
export const handoverLayoutDraft = (s: LayoutScreen, layoutId: number, ver: string, rowVersion: number, newOwnerId: string) =>
  call(s, "handover", { layoutId, ver, rowVersion, newOwnerId });
```

(기존 `layoutMng/api.ts` 의 `callAction` 이 다른 봉투 해제 규칙(F11 빈 grid 등)을 쓰면 그 함수를 export 해 재사용하고 위 `call` 은 지운다 — 한 화면 안에서 봉투 해제가 두 갈래가 되지 않게.)

`VersionPanel` 열:

```ts
const COLUMNS: GridColumn[] = [
  { key: "VER", header: "버전", width: 70, render: (v) => fmtVer(v as string) },
  { key: "VER_KIND", header: "종류", width: 55, render: (v) => (v === "MINOR" ? "minor" : "major") },
  { key: "STATUS", header: "상태", width: 90, render: (v, r) => <VersionStatusBadge status={v as MdmVersionStatus} applyFrom={(r.APPLY_FROM as string) ?? null} /> },
  { key: "APPLY_FROM", header: "적용 시작", width: 130 },
  { key: "APPLY_TO", header: "적용 끝", width: 130 },
  { key: "OWNER_ID", header: "소유자", width: 80 },
  { key: "CHANGE_SUMMARY", header: "변경", width: 280 },
  { key: "OWN_LENGTH", header: "자기 길이", width: 70, align: "right" },
  { key: "SWITCH_MODE", header: "전환 방식", width: 90, render: (v) => modeBadge(v) },
];
```

`rowKey="VER"`, `highlightedRowKey={selectedVersion}`(`string | null`), `onRowClick={(r) => onSelectVersion(String(r.VER))}` — `Number(...)` 를 쓰지 않는다. 스냅샷 제목은 `레이아웃 스냅샷 — ${fmtVer(snapshot.ver)} · 시각 ${snapshot.asOf}`. LEGACY 행은 `CHANGE_SUMMARY` 앞에 "(이행 전 스냅샷) " 을 붙여 보인다. 안내 문구 "배포는 이번 범위 밖입니다" 는 그대로 둔다(스펙 §7). `ImpactPanel` 에 `{ key: "VER", header: "버전", render: fmtVer }`, `{ key: "VER_STATE", header: "버전 상태", render: (v) => ({ CURRENT: "현재", FUTURE: "적용 예정", DRAFT: "작성 중" } as Record<string, string>)[v as string] ?? "" }` 를 `LAYOUT_NAME` 뒤에 둔다. `snapshot-export.ts` 는 `ExportResult.fileBase` 를 그대로 쓰고 엑셀 머리의 버전 칸을 `fmtVer(snapshot.layoutVersion)` 으로 바꾼다(`layoutVersion` 은 이제 `number`(소수) — `normVer(String(v))` 로 문자열화).

`types.ts` 두 곳: Interfaces 의 모양대로 고친다 — `LayoutRow` 의 `LAYOUT_VERSION`·`VER` 를 `CURRENT_VER?: string | null; DRAFT_VER?: string | null; DRAFT_OWNER?: string | null; STATUS: string; AUD_VER: number` 로, `ViewResult` 에 `selected`·`versions: LayoutVersionRow[]`·`editable`·`canNewMajor`·`canNewMinor`·`nextMajor`·`nextMinor`·`asOf`, 헤더 행에 `HEADER_VER?: string | null; HEADER_STATE?: string`, `SaveResult` 는 `{ layoutId; ver: string; rowVersion: number; ownLength; headerLength; totalLength; asOf }`, `ExportResult` 는 `{ layoutId; ver: string; asOf: string; fileBase; snapshot; names }`, `ImpactRow` 에 `VER?: string | null; VER_STATE?: string | null`. 헤더 화면 `UsedByRow` 에 `VER: string; STATE: string`, `SaveResult` 에서 `recalculated`·`droppedOverrides` 를 지운다. `api.ts` 두 곳의 `viewLayout`·`viewHeader`·`exportSnapshot` 시그니처를 Interfaces 대로 바꾼다(`saveLayout`·`saveHeader` 는 `draft` 에 `ver`·`rowVersion`·`asOf` 가 실려 그대로 간다).

- [ ] **Step 4: 통과 확인**

Run: `cd <worktree>/src/frontend/m-mdm && npx vitest run tests/layout tests/dmb && rtk proxy pnpm run lint`
Expected: 이 Task 의 시험 PASS. `pnpm run lint` 의 tsc 오류는 `pages/dmb/layoutMng/page.tsx`·`pages/dmb/headerMng/page.tsx` 에만 남는다(Task 13 몫) — 다른 파일 오류가 있으면 이 Task 에서 고친다.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/frontend/m-mdm/src/layout src/frontend/m-mdm/pages/dmb/layoutMng/types.ts src/frontend/m-mdm/pages/dmb/layoutMng/api.ts src/frontend/m-mdm/pages/dmb/layoutMng/components/VersionPanel.tsx src/frontend/m-mdm/pages/dmb/layoutMng/components/ImpactPanel.tsx src/frontend/m-mdm/pages/dmb/headerMng/types.ts src/frontend/m-mdm/pages/dmb/headerMng/api.ts src/frontend/m-mdm/tests/layout src/frontend/m-mdm/tests/dmb
/usr/bin/git -C <worktree> commit -m "feat(m-mdm): 레이아웃 버전을 문자열로 다루고 버전 액션 호출·버전 이력 열을 더한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(tsc 가 page 두 곳에서 깨진 채 커밋된다 — Task 13 이 바로 잇는다. 깨진 커밋을 피하려면 Task 12·13 을 한 커밋으로 묶는다.)

---

### Task 13: 프런트 화면 — layoutMng·headerMng 버전 선택·시각 T·VersionActionBar·읽기 전용

**Files (모두 `src/frontend/m-mdm/` 아래):**
- Modify: `pages/dmb/layoutMng/page.tsx`(버전 상태·T·버튼·저장 인자), `pages/dmb/layoutMng/components/LayoutBasicForm.tsx`(버전 선택·T 입력 자리), `pages/dmb/layoutMng/components/LayoutList.tsx`(현재 버전·DRAFT 열)
- Modify: `pages/dmb/headerMng/page.tsx`, `pages/dmb/headerMng/components/HeaderForm.tsx`, `pages/dmb/headerMng/components/HeaderList.tsx`, `pages/dmb/headerMng/components/HeaderUsagePanel.tsx`(버전·상태 열)
- Test: `tests/dmb/layoutMng/page-render.test.ts`, `tests/dmb/headerMng/page-render.test.ts`

**Interfaces:**
- Consumes: Task 12 `versionActionState`, `version-api.ts`, 타입; `VersionActionBar`(`newVersionMode="majorMinor"`), `DraftLockBadge`, `VersionStatusBadge`, `openMdmPage`, `fmtVer`, `DateTimePicker`(`@dk-oasis/shared/form`), `useUserButtonRbac`/`canDoButton`
- Produces:
  - 화면 testid: `layout-ver-select`, `layout-asof`, `layout-ver-new-major`, `layout-ver-new-minor`, `layout-ver-delete`, `layout-ver-confirm`, `layout-ver-cancel-confirm`, `layout-ver-lock`, `layout-ver-unlock`, `layout-ver-handover`(헤더 화면은 `header-` 접두)
  - 확정 버튼 → `openMdmPage("dmb/layoutConfirm", { layoutId: String(id), ver: selected.VER })`
  - 읽기 전용 규칙: `readOnly = mode === "none" || !canEdit || busy || (mode === "edit" && !view.editable)` — 신규(`mode === "new"`)는 저장하면 1.000 DRAFT 가 생긴다

- [ ] **Step 1: 실패하는 시험 작성** — `tests/dmb/layoutMng/page-render.test.ts` 에 더한다(기존 fetch mock 의 `view` 응답에 `selected`·`versions`·`editable`·플래그를 넣는다):

```ts
  it("released version opens read-only with major/minor buttons and confirm goes to layoutConfirm", async () => {
    mockView({ editable: false, canNewMajor: true, canNewMinor: true, nextMajor: "2.000", nextMinor: "1.001",
      selected: { VER: "1.000", VER_KIND: "MAJOR", STATUS: "RELEASED", STATE: "CURRENT", OWNER_ID: null, ROW_VERSION: 1, OWN_LENGTH: 57, LEGACY: "N" } });
    await openLayout(201);
    expect(byTestId("layout-save").hasAttribute("disabled")).toBe(true);
    expect(byTestId("layout-ver-new-minor").hasAttribute("disabled")).toBe(false);
    expect(byTestId("layout-ver-confirm").hasAttribute("disabled")).toBe(true);
    await click(byTestId("layout-ver-new-minor"));
    expect(lastCall().url).toContain("/oasis/layoutMng/copy");
    expect(lastCall().params).toEqual({ layoutId: 201, verKind: "MINOR" });
  });

  it("my draft is editable, save sends ver and rowVersion, confirm hands off the minor version string", async () => {
    mockView({ editable: true, canNewMajor: false, canNewMinor: false,
      selected: { VER: "1.001", VER_KIND: "MINOR", STATUS: "DRAFT", STATE: "DRAFT", OWNER_ID: "tester", ROW_VERSION: 3, OWN_LENGTH: 57, LEGACY: "N" } });
    await openLayout(201);
    await click(byTestId("layout-save"));
    expect(lastCall().params).toMatchObject({ layoutId: 201, ver: "1.001", rowVersion: 3 });
    const opened = vi.fn();
    window.addEventListener("portal-open-tab", opened);
    await click(byTestId("layout-ver-confirm"));
    expect(takeMdmPageParams("dmb/layoutConfirm")).toEqual({ layoutId: "201", ver: "1.001" });
  });

  it("changing T re-reads the layout with asOf", async () => {
    mockView({ editable: false, selected: { VER: "1.000", VER_KIND: "MAJOR", STATUS: "RELEASED", STATE: "CURRENT", ROW_VERSION: 1, OWN_LENGTH: 57, LEGACY: "N" } });
    await openLayout(201);
    await pickDateTime(byTestId("layout-asof"), "2026-07-01 00:00:00");
    expect(lastCall().url).toContain("/oasis/layoutMng/view");
    expect(lastCall().params).toMatchObject({ layoutId: 201, asOf: "2026-07-01 00:00:00" });
  });
```

(`mockView`·`openLayout`·`byTestId`·`click`·`lastCall` 은 이 파일의 기존 도우미 이름에 맞춘다. 현재 사용자 ID 는 기존 시험이 `RBAC_STORE_KEY` 와 함께 심는 값(`tester`)을 쓴다. `pickDateTime` 은 `tests/helpers/datetime-picker`.) `tests/dmb/headerMng/page-render.test.ts` 에 같은 세 사례를 `header-` testid·`/oasis/headerMng/` 로 더하고, 저장 응답에 `recalculated` 가 없어도 오류 없이 "저장했습니다" 를 보이는 사례를 더한다.

- [ ] **Step 2: 실패 확인**

Run: `cd <worktree>/src/frontend/m-mdm && npx vitest run tests/dmb/layoutMng/page-render.test.ts tests/dmb/headerMng/page-render.test.ts`
Expected: FAIL(testid 없음).

- [ ] **Step 3: 구현** — `page.tsx`(layoutMng) 변경:
- 상태: `const [view, setView] = useState<ViewResult | null>(null)`, `const [asOf, setAsOf] = useState<string | null>(null)`(null = 지금), `selectedVersion: string | null`. `layoutVersion` 상태는 지운다.
- 상세 열기: `viewLayout(id, ver ?? null, asOf)` → `setDraft({ layoutId, ver: out.selected?.VER ?? null, rowVersion: out.selected?.ROW_VERSION ?? null, asOf, ... })`, `setView(out)`, `setVersions(out.versions ?? [])`.
- 버전 선택: `LayoutBasicForm` 위에 `Select`(`data-testid="layout-ver-select"`, 값 `VER` 문자열, 라벨 `${fmtVer(v.VER)} ${statusLabel(v.STATE)}`) — 바꾸면 그 버전으로 `viewLayout`. 옆에 `DateTimePicker`(`data-testid="layout-asof"`, 비우면 지금) — 바꾸면 다시 `viewLayout` 하고 편집 탭의 헤더 길이·오프셋 표시가 그 시각의 헤더로 바뀐다. 안내 문구: "시각 T 의 헤더 버전으로 총 길이·샘플·내보내기를 합성합니다".
- 버튼: `const actions = versionActionState(view ?? {}, me, (a) => canDoButton(rbac, SCREEN_ID, a))`. `VersionActionBar` 를 `newVersionMode="majorMinor"`, `ids={{ newMajor: "layout-ver-new-major", newMinor: "layout-ver-new-minor", delete: "layout-ver-delete", confirm: "layout-ver-confirm", cancelConfirm: "layout-ver-cancel-confirm", lock: "layout-ver-lock", unlock: "layout-ver-unlock", handover: "layout-ver-handover" }}` 로 두고 각 핸들러는 `version-api.ts` 함수 → 성공하면 결과 `ver` 로 `viewLayout` 다시. `onConfirm={() => openMdmPage("dmb/layoutConfirm", { layoutId: String(draft.layoutId), ver: view.selected.VER })}`. `trailing` 에 `DraftLockBadge`(소유자)·`VersionStatusBadge`. 넘기기 대상 입력은 룰 화면(`RuleDetailPanel` 의 `beforeHandover`)과 같은 모양.
- 읽기 전용: Interfaces 의 규칙. LEGACY 버전을 고르면 "이행 전 스냅샷(읽기 전용)" 안내.
- 저장: `saveLayout({ ...draft, ver: draft.ver, rowVersion: draft.rowVersion, asOf })` 성공 응답의 `rowVersion` 으로 `draft.rowVersion` 을 갱신하고 `ver` 를 유지한다(신규면 응답 `ver` = "1.000", `rowVersion` = 0 으로 `mode = "edit"`). 저장 응답에서 `versionCreated`·`switchMode` 안내를 지운다(저장은 버전을 만들지 않는다).
- 버전·영향도 탭: `loadSnapshot(selectedId, v.VER)` → `exportSnapshot(id, ver, asOf)`.
- 목록(`LayoutList`): `CURRENT_VER`(fmtVer)·`DRAFT_VER`(fmtVer + 소유자) 열, `LAYOUT_VERSION` 열 삭제.

`headerMng/page.tsx` 도 같은 방식(`screen = "headerMng"`, testid 접두 `header-`, T 입력은 없다 — 헤더 자신은 시각 합성 대상이 아니다). `HeaderUsagePanel` 에 `VER`(fmtVer)·`STATE` 열을 더하고 제목 옆에 "헤더 변경은 확정 apply_from 부터 사용 전문에 반영됩니다(전문 버전은 생기지 않음)" 안내. 저장 성공 메시지에서 `recalculated` 건수 안내를 지운다.

- [ ] **Step 4: 통과 확인**

Run: `cd <worktree>/src/frontend/m-mdm && rtk proxy pnpm run lint && rtk proxy pnpm run test`
Expected: tsc 오류 0, `[m-mdm test 합계] ... failed 0`

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/frontend/m-mdm/pages/dmb/layoutMng src/frontend/m-mdm/pages/dmb/headerMng src/frontend/m-mdm/tests/dmb
/usr/bin/git -C <worktree> commit -m "feat(m-mdm): 레이아웃·헤더 화면에 버전 선택·시각 T·버전 버튼을 두고 내 DRAFT 만 편집한다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: 프런트 확정 화면 `dmb/layoutConfirm`(전문·헤더 공용)

**Files:**
- Create: `src/frontend/m-mdm/pages/dmb/layoutConfirm/page.tsx`, `api.ts`, `types.ts`, `checks.ts`
- Modify: `src/frontend/m-mdm/tsup.config.ts:46-47` 뒤(`"pages/dmb/layoutConfirm/page": "pages/dmb/layoutConfirm/page.tsx"`)
- Modify: `src/frontend/m-mcm/lib/generated/page-registry.ts`(직접 고치지 않는다 — `cd src/frontend/m-mcm && node scripts/generate-page-registry.mjs` 로 다시 만든다)
- Test (Create): `src/frontend/m-mdm/tests/dmb/layoutConfirm/layout-confirm-page.test.ts`, `tests/dmb/layoutConfirm/checks.test.ts`

**Interfaces:**
- Consumes: Task 7·8 OASIS `layoutConfirm` 계약(search·view·validate·confirm), 화면 인계 `{ layoutId, ver }`, `ruleConfirm` 화면 구성(`pages/dme/ruleConfirm/page.tsx`·`checks.ts` 의 `toServerDateTime`·`canConfirm`)
- Produces:
  - `checks.ts`: `toServerDateTime`(ruleConfirm 의 함수를 `src/shell` 로 올리지 않고 그대로 가져다 쓴다 — `import { toServerDateTime } from "../../dme/ruleConfirm/checks"`), `canConfirmLayout(state: { validated: boolean; applyFrom: string | null; checkedApplyFrom: string | null; errors: number; warnings: number; acknowledged: boolean; isOwner: boolean; canConfirm: boolean }): boolean`
  - testid: `lc-list`, `lc-target`, `lc-apply-from`, `lc-validate`, `lc-checks`, `lc-simultaneous`, `lc-impact`, `lc-eais`, `lc-ack`, `lc-confirm`

- [ ] **Step 1: 실패하는 시험 작성**

`tests/dmb/layoutConfirm/checks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canConfirmLayout } from "../../../pages/dmb/layoutConfirm/checks";

const base = { validated: true, applyFrom: "2026-07-01 00:00:00", checkedApplyFrom: "2026-07-01 00:00:00", errors: 0, warnings: 0,
  acknowledged: false, isOwner: true, canConfirm: true };

describe("canConfirmLayout", () => {
  it("needs validation of the same applyFrom", () => {
    expect(canConfirmLayout(base)).toBe(true);
    expect(canConfirmLayout({ ...base, checkedApplyFrom: "2026-06-30 00:00:00" })).toBe(false);
    expect(canConfirmLayout({ ...base, validated: false })).toBe(false);
  });
  it("errors block, warnings need acknowledgement", () => {
    expect(canConfirmLayout({ ...base, errors: 1 })).toBe(false);
    expect(canConfirmLayout({ ...base, warnings: 2 })).toBe(false);
    expect(canConfirmLayout({ ...base, warnings: 2, acknowledged: true })).toBe(true);
  });
  it("owner and permission", () => {
    expect(canConfirmLayout({ ...base, isOwner: false })).toBe(false);
    expect(canConfirmLayout({ ...base, canConfirm: false })).toBe(false);
  });
});
```

`tests/dmb/layoutConfirm/layout-confirm-page.test.ts`(`rule-confirm-page.test.ts` 의 fetch mock·render 도우미 구성을 그대로 따른다):

```ts
/** @vitest-environment happy-dom */
// D-144 3단계 — layoutConfirm: handoff 진입(minor 버전 문자열), 검사·동시 전환 강조, 헤더 영향도 표, 경고 확인 후 확정.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { openMdmPage } from "@/shell";
import LayoutConfirmPage from "../../../pages/dmb/layoutConfirm/page";
import { pickDateTime } from "../../helpers/datetime-picker";
import { RBAC_STORE_KEY, flush, installDomStorage, jsonResponse, visibleText } from "../helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
const calls: { action: string; params: Record<string, unknown> }[] = [];

function ok(result: unknown) {
  return { meta: { success: true }, data: { result } };
}

const VIEW_HEADER = {
  layout: { LAYOUT_ID: 110, LAYOUT_KIND: "HEADER", LAYOUT_NAME: "L2 구간 헤더", STATUS: "INUSE" },
  version: { VER: "1.001", VER_KIND: "MINOR", STATUS: "DRAFT", OWNER_ID: "tester", ROW_VERSION: 2, BASE_VER: "1.000" },
  previous: { VER: "1.000", APPLY_FROM: "2026-01-01 00:00:00", APPLY_TO: "9999-12-31 00:00:00" },
  firstVersion: false,
};

const VALIDATE_HEADER = {
  checks: [{ severity: "WARNING", code: "SIMULTANEOUS_SWITCH", message: "동시 전환 — 송신·수신 양쪽이 2026-07-01 00:00:00 에 맞춰 함께 전환해야 합니다", field: "SWITCH_MODE", itemKey: null }],
  applyFromCheck: { ok: true, message: null },
  change: { switchMode: "SIMULTANEOUS", kinds: ["TOTAL_LENGTH"], summary: "총 길이 30 → 33" },
  simultaneous: true, futureApplyFrom: true,
  impact: [{ LAYOUT_ID: 201, LAYOUT_NAME: "출측검사 실적 수신", SND_RCV: "L2 → MES", VER: "1.000", STATE: "CURRENT",
    EVALUATED_AT: "2026-07-01 00:00:00", TOTAL_LENGTH_BEFORE: 187, TOTAL_LENGTH_AFTER: 190, ISSUES: "" }],
  eais: ["GLUE"],
};

beforeEach(() => {
  installDomStorage();
  localStorage.setItem(RBAC_STORE_KEY, JSON.stringify({ userId: "tester", buttons: { layoutConfirm: ["search", "view", "validate", "confirm"] } }));
  calls.length = 0;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const action = String(url).split("/").pop() as string;
    const params = JSON.parse(String(init.body)).params as Record<string, unknown>;
    calls.push({ action, params });
    if (action === "view") return jsonResponse(ok(VIEW_HEADER));
    if (action === "validate") return jsonResponse(ok(VALIDATE_HEADER));
    if (action === "confirm") return jsonResponse(ok({ layoutId: 110, ver: "1.001", rowVersion: 3, closedPreviousVer: "1.000", switchMode: "SIMULTANEOUS" }));
    return jsonResponse(ok({ rows: [] }));
  }) as typeof fetch;
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  globalThis.fetch = originalFetch;
});

async function mount() {
  root = createRoot(container);
  await act(async () => root!.render(createElement(DmesUiProvider, null, createElement(LayoutConfirmPage))));
  await flush();
}

describe("layoutConfirm page", () => {
  it("handoff opens the minor version as a string and shows header impact with simultaneous emphasis", async () => {
    openMdmPage("dmb/layoutConfirm", { layoutId: "110", ver: "1.001" });
    await mount();
    expect(calls.find((c) => c.action === "view")?.params).toEqual({ layoutId: 110, ver: "1.001" });
    expect(visibleText(container)).toContain("v1.001");
    await pickDateTime(container.querySelector('[data-testid="lc-apply-from"]')!, "2026-07-01 00:00:00");
    await act(async () => (container.querySelector('[data-testid="lc-validate"]') as HTMLButtonElement).click());
    await flush();
    expect(container.querySelector('[data-testid="lc-simultaneous"]')?.textContent).toContain("송신·수신");
    const impact = container.querySelector('[data-testid="lc-impact"]')!.textContent!;
    expect(impact).toContain("출측검사 실적 수신");
    expect(impact).toContain("187");
    expect(impact).toContain("190");
    expect(container.querySelector('[data-testid="lc-eais"]')?.textContent).toContain("GLUE");
    const confirm = container.querySelector('[data-testid="lc-confirm"]') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await act(async () => (container.querySelector('[data-testid="lc-ack"] input') as HTMLInputElement).click());
    expect(confirm.disabled).toBe(false);
    await act(async () => confirm.click());
    await flush();
    expect(calls.find((c) => c.action === "confirm")?.params).toEqual({
      layoutId: 110, ver: "1.001", rowVersion: 2, applyFrom: "2026-07-01 00:00:00", warningsAcknowledged: true,
    });
  });
});
```

(RBAC 저장소 키·사용자 ID 를 심는 방식은 `rule-confirm-page.test.ts` 의 `beforeEach` 를 그대로 옮긴다 — 위 `localStorage` 값 모양이 다르면 그 시험의 값을 쓴다.)

- [ ] **Step 2: 실패 확인**

Run: `cd <worktree>/src/frontend/m-mdm && npx vitest run tests/dmb/layoutConfirm`
Expected: FAIL(모듈 없음).

- [ ] **Step 3: 구현** — `ruleConfirm` 화면을 본보기로 만든다(공유 파일은 바꾸지 않는다):
- `api.ts`: `SERVICE = "layoutConfirm"`, `searchDrafts(keyword)`, `viewDraft(layoutId: number, ver?: string | null)`, `validateDraft(layoutId, ver, applyFrom)`, `confirmDraft(layoutId, ver, rowVersion, applyFrom, warningsAcknowledged)` — 봉투 해제·null 제거는 `ruleConfirm/api.ts` 의 `unwrap`·`callOasis` 와 같은 코드.
- `types.ts`: Task 7 Interfaces 의 응답 모양(`ViewResult`, `ValidateResult`, `ImpactRow`, `CheckRow`, `ConfirmResult`). 버전은 모두 `string`.
- `checks.ts`:

```ts
export { toServerDateTime } from "../../dme/ruleConfirm/checks";

export interface LayoutConfirmGate {
  validated: boolean; applyFrom: string | null; checkedApplyFrom: string | null; errors: number; warnings: number;
  acknowledged: boolean; isOwner: boolean; canConfirm: boolean;
}

/** 확정 버튼 — 같은 apply_from 으로 검사했고, 오류 0, 경고가 있으면 확인, 소유자, 권한. */
export function canConfirmLayout(g: LayoutConfirmGate): boolean {
  return g.validated && !!g.applyFrom && g.applyFrom === g.checkedApplyFrom && g.errors === 0
    && (g.warnings === 0 || g.acknowledged) && g.isOwner && g.canConfirm;
}
```

- `page.tsx`: 왼쪽 `lc-list`(DRAFT 목록 — 종류 배지 전문/헤더, `fmtVer(VER)`, 소유자), 오른쪽 대상(`lc-target`: 이름·종류·`fmtVer`·`VersionStatusBadge`·직전 RELEASED `fmtVer` 와 적용 구간), `DateTimePicker`(`lc-apply-from`) + `lc-validate` 버튼 → 검사 표(`lc-checks`, 오류 빨강·경고 노랑), `simultaneous` 면 `lc-simultaneous` 강조 띠("동시 전환 — 송신·수신 양쪽이 {applyFrom} 에 맞춰 함께 전환해야 합니다" + `change.summary`), 헤더면 영향 그리드(`lc-impact`: 전문·송수신·버전(fmtVer)·상태·평가 시각·총 길이 전→후·문제)와 EAI 목록(`lc-eais`), 경고가 있으면 확인 체크(`lc-ack`), `lc-confirm`(활성 = `canConfirmLayout`). handoff 는 `useMdmPageParams("dmb/layoutConfirm", tabId, (p) => open(Number(p.layoutId), normVer(p.ver)))` — `ver` 는 `normVer` 로만 다룬다(Number 금지). 확정 성공 뒤 "확정했습니다 — 직전 {fmtVer(closedPreviousVer)} 는 {applyFrom} 에 닫힙니다" 안내.
- `tsup.config.ts` 에 진입점 한 줄, `m-mcm` 의 생성기를 돌려 `page-registry.ts` 에 `"dmb/layoutConfirm"` 이 생긴 것을 확인한다.

- [ ] **Step 4: 통과 확인**

Run: `cd <worktree>/src/frontend/m-mdm && rtk proxy pnpm run lint && rtk proxy pnpm run test`
Expected: tsc 오류 0, failed 0. `cd <worktree>/src/frontend/m-mcm && node scripts/generate-page-registry.mjs && grep -c 'dmb/layoutConfirm' lib/generated/page-registry.ts` → `1`

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/frontend/m-mdm/pages/dmb/layoutConfirm src/frontend/m-mdm/tests/dmb/layoutConfirm src/frontend/m-mdm/tsup.config.ts src/frontend/m-mcm/lib/generated/page-registry.ts
/usr/bin/git -C <worktree> commit -m "feat(m-mdm): 전문·헤더 공용 레이아웃 확정 화면을 추가하고 동시 전환과 헤더 영향도를 보인다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: e2e·결정 기록·통합 확인

**Files:**
- Modify: `src/frontend/e2e/mdm-layoutMng.spec.ts`, `src/frontend/e2e/mdm-headerMng.spec.ts`, `src/frontend/e2e/mdm-user/dmb.user.ts`
- Create: `src/frontend/e2e/mdm-layoutConfirm.spec.ts`
- Modify: `docs/mdm/adr/0006-object-versioning-major-minor.md`(결과 절에 3단계), `docs/mdm/decisions.md`(새 D 번호 — 착수 때 원 작업 트리 `decisions.md` 의 마지막 번호를 확인해 정한다), `docs/guide/FrontEnd/Local-Rules.md` §24(레이아웃·헤더 줄)

**Interfaces:**
- Consumes: Task 1~14 전부
- Produces: e2e 녹색, 결정 기록

- [ ] **Step 1: e2e 갱신** — 기존 두 스펙의 단언을 새 계약으로 바꾼다: 저장 응답 "버전 n 생성" 문구·`LAYOUT_VERSION` 숫자 단언 → 버전 선택 `layout-ver-select` 의 `v1.000`; 헤더 저장 뒤 "사용 전문 다시 계산 n건" 단언 → 사용 전문 표에 버전·상태 열; 픽스처(`mdm-layout-m201.sql`, Task 2 에서 V19 모양)로 시작해 `layout-ver-new-minor` → 편집 → 저장 → `layout-ver-confirm` 으로 확정 화면 이동까지. 새 `mdm-layoutConfirm.spec.ts` 는 헤더 L110 의 minor DRAFT 를 만들어 확정 화면에서 apply_from 을 넣고 검사 → 영향 표에 M201 `187 → 190` → 경고 확인 → 확정 → 헤더 화면 버전 이력에 `v1.001` RELEASED(적용 예정)를 단언한다. 사용자 정의(`dmb.user.ts`)에 담당자 역할(확정용)을 더한다.

Run: 프런트 e2e 실행 방식은 `src/frontend/e2e` 의 기존 안내(README·`package.json` 스크립트)를 따른다 — 해당 세 스펙만 돌린다.
Expected: PASS(로컬 MDM 기동이 원 작업 트리 서버와 충돌하면 e2e 는 건너뛰고 보고에 적는다).

- [ ] **Step 2: 결정 기록** — `adr-write` 스킬로 ADR-0006 을 개정한다: 결과 절에 "3단계(레이아웃·헤더) 구현" 과 이 계획의 판단(아래 목록)을 적는다. `decisions.md` 에 새 번호로 `## D-<번호> (ISO 시각)` Source·Decision·Why 형식으로 다음을 적는다:
  1. 직렬화기·파서는 순수 함수로 두고 시각 T 는 `MdmLayoutSnapshotResolver` 가 받는다(스펙 §7 "계약에 T" 의 구현 방식).
  2. 버전 행 길이 칼럼 `OWN_LENGTH` = 그 버전 자신의 항목 길이 합, 전문 총 길이는 T 합성값. 본문 항목 `OFFSET` 저장값은 본문 기준 상대.
  3. 상수 재정의 키는 헤더 항목 물리명(`HEADER_COLUMN_PHYS`) — 헤더 버전이 바뀌어도 짝이 유지되고, 대상이 사라지면 헤더 확정 경고(ORPHAN_OVERRIDE).
  4. 이행 전 이력은 `LEGACY_SNAPSHOT_YN='Y'` 버전으로 합성 스냅샷을 그대로 쓴다.
  5. "전문 총 길이 규칙" = MSG_LENGTH(AUTO) 칸 자리수 용량(L16) + 재정의 값 길이(L12).
  6. DMB 담당자 CONFIRM, 새 버전·등록은 담당자 역할 불필요, 확정·선점은 담당자.
  7. EAI 는 버전 대상이 아니다 — 쓰는 전문이 있으면 인코딩·패딩 변경 거부. 헤더의 EAI 연결은 헤더 버전 행 `EAI_CODE` 에 두고 헤더 확정 때 `TB_MDM_EAI.HEADER_LAYOUT_ID` 로 옮긴다. 전문 저장의 표준 헤더 끼움(I14)은 그 헤더에 저장 시각 RELEASED 가 있을 때만, 확정 검사는 끼우지 않는다. (P3-15·P3-17 로 대체: EAI 표준 헤더는 시각 T 해석이고 확정은 HEADER_LAYOUT_ID 를 옮기지 않는다)
  8. 감사 카운터 `AUD_VER` 개명(레이아웃 4표), 레이아웃 계열 DTO 의 `ver` 는 업무 버전 문자열.
  `Local-Rules.md` §24 에 "레이아웃·헤더도 새 버전(major)·새 버전(minor) 두 버튼, 확정은 dmb/layoutConfirm(D-144)" 한 줄을 더한다. 원천 설계 문서(다른 저장소 `/Users/jji/project/mdm/docs/design` 03:72·06:988)는 이 계획에서 고치지 않고 보고의 남은 일로 적는다(1단계와 같은 처리).

- [ ] **Step 3: 전체 시험**

```bash
cd <worktree>/src/backend && export JAVA_HOME=/opt/homebrew/opt/openjdk@21 && ./gradlew :maru-mdm-engine:test --offline && (cd mdm && ../gradlew :lib:test :api:test --offline)
cd <worktree>/src/frontend/m-mdm && rtk proxy pnpm run lint && rtk proxy pnpm run test
```
Expected: 모두 통과.

- [ ] **Step 4: 화면 확인** — 워크트리에서 MDM 을 띄울 수 있으면(로컬 기동 사전조건: JDK 21, `TSUP_DTS=0 local-run.sh --mdm -q`) ego-browser 로 확인한다: 전문 레이아웃에서 M201 열기 → 새 버전(minor) → 본문 여분 쪼개기 저장 → 확정 화면에서 순차 전환 확인 → 확정. 헤더 정의에서 L110 새 버전(major) → 여분 늘리기 저장 → 확정 화면 영향 표의 `187 → 190`·동시 전환 강조 → 경고 확인 → 확정. 전문 화면 시각 T 를 apply_from 직전·직후로 바꿔 총 길이 187/190 이 바뀌는지 본다. 기동이 원 작업 트리 서버·포트와 충돌하면 건너뛰고 보고에 적는다. 확인 직후 보고 전에 연 ego-browser 작업 공간을 닫는다.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/frontend/e2e/mdm-layoutMng.spec.ts src/frontend/e2e/mdm-headerMng.spec.ts src/frontend/e2e/mdm-layoutConfirm.spec.ts src/frontend/e2e/mdm-user/dmb.user.ts docs/mdm/adr/0006-object-versioning-major-minor.md docs/mdm/adr/README.md docs/mdm/decisions.md docs/guide/FrontEnd/Local-Rules.md
/usr/bin/git -C <worktree> commit -m "docs(mdm): 레이아웃 버전 관리 결정을 기록하고 레이아웃·헤더·확정 e2e 를 새 계약으로 바꾼다

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: 보고** — 바꾼 범위, 시험 결과, 화면 확인 여부, 남은 일(원천 설계 문서 03·06 갱신, 배포(07) 연계, EAI 버전화 여부, 2단계와의 병합 순서 확인)을 정리한다.

---

## 자기 검토

**스펙 대응(§7 3단계):**

| 스펙 요구 | Task |
|---|---|
| V19 — 부모 STATUS·`VERSION` 제거·형식 속성 버전 행으로 | 2(부모 재생성, `EAI_CODE`·`OWN_LENGTH` 를 버전 행으로) |
| `TB_MDM_LAYOUT_VER` 재생성(표준 칼럼, `LAYOUT_VERSION`→`VER`), `SWITCH_MODE`·`CHANGE_KINDS`·`CHANGE_SUMMARY`·`SNAPSHOT_JSON` | 2 |
| ITEM·HEADER·CONST 키에 `VER` | 2·3 |
| 이행: 이력 → RELEASED, `APPLY_FROM=C_AT`, 다음 행 `C_AT` 으로 `APPLY_TO`, 항목 행은 최신에만, 헤더는 1.000 RELEASED, 이행 한계 | 2(시험 `MdmLayoutVersionV19MigrationTest`), 9(LEGACY 재현) |
| `VersionTarget.LAYOUT`·등록부·SPI·objectId 정수 바인딩 확인 | 1(친화도 시험), 6(`LayoutDraftDeletion`), 7(`LayoutConfirmCheck`) |
| 저장은 내 DRAFT 에만, I15 폐지, I18 폐지 | 5(부정 시험 포함) |
| 확정 시 변경 분류·전환 방식 기록, 동시 전환 강조, 본문 `SNAPSHOT_JSON` | 7, 14(강조 띠) |
| 헤더 확정 영향도(사용 전문·EAI, apply_from 시점 총 길이 변화)와 검사 | 8, 14 |
| 총 길이·내보내기·샘플을 T 기준 합성, 직렬화·파서 계약에 T | 4(합성기·계약), 5(조회·내보내기·샘플), 13(T 입력) |
| 확정 화면 `dmb/layoutConfirm`, 버전·영향도 탭 열, `VersionActionBar` | 7·14, 12, 13 |
| `LayoutImpactFinder` RELEASED(현재·미래)·DRAFT 구분 | 10 |
| 권한 시드(copy/delete/lock/unlock/handover/confirm) | 6(action), 11(시드·매트릭스) |
| 과거 재현 시험(목적 3) | 9 |
| 오류 처리 §8(MDM006, minor 999, 소유자, apply_from 순서, RELEASED 없는 헤더, 동시 저장) | 6, 5, 4, 7(공통 엔진 경로) |

**자리표시자 점검:** 아래 두 곳만 착수 때 실측으로 정하는 값이다 — 둘 다 정하는 절차를 적었다. ① 쿼리 수 상한(Task 5 Step 3: 늘지 않음을 먼저 확인한 뒤 실측값), ② decisions 번호(Task 15: 원 작업 트리의 마지막 번호 + 1).

**이름 일관성:** `LayoutComposer.at/compose/composeDetailed/headerAlone/headerAt`, `LayoutVersions.releasedAt/draft/previousReleased/latestReleased/hasUnapplied/maxVer/editTarget/state/requireVer/requireRowVersion`, `LayoutVersionStore.versions/versionsOf/find/save/recordConfirm/messagesUsingEai`, `LayoutWriter.replaceVersionRows/replaceItems/copyVersionRows/deleteVersionRows`, `LayoutVersionService.newVersion/deleteDraft/cancelConfirm/lock/unlock/handover/flags`, `LayoutConfirmChecks.report/classify/bodySnapshotJson`, `LayoutHeaderImpact.evaluate` — Task 간 같은 이름으로 썼다.

**스펙과 다르게 판단한 점(구현자·리뷰어 확인용):**
1. 직렬화기·파서 시그니처에 T 를 넣지 않고 새 계약 `MdmLayoutSnapshotResolver.at(layoutId, T)` 가 받는다 — 두 인터페이스는 순수 함수로 남는다(`MdmContractArchitectureTest`).
2. "형식 속성" 은 지금 표에 구분자·총 길이 정책 칼럼이 없어 `EAI_CODE` 와 자기 항목 길이 `OWN_LENGTH` 만 버전 행으로 옮긴다. 부모 `TOTAL_LENGTH` 는 T 합성값이라 저장하지 않는다.
3. 전문 본문 항목 `OFFSET` 저장값을 본문 기준 상대로 바꾼다(헤더 버전에 따라 절대 위치가 달라지므로).
4. 상수 재정의 키를 `HEADER_SEQ` 대신 헤더 항목 물리명으로 둔다(헤더 버전 사이 SEQ 이동에 안전, 지금의 D7 재짝짓기를 대신).
5. 이행 전 버전을 구분하는 `LEGACY_SNAPSHOT_YN` 칼럼을 더한다. 최신 이행 버전의 `SNAPSHOT_JSON` 은 NULL(항목 행이 있다).
6. "전문 총 길이 규칙" 을 MSG_LENGTH 칸 자리수 용량(L16)과 재정의 값 길이(L12)로 해석한다(03 에 총 길이 상한 규칙이 없다).
7. DMB 담당자 권한을 READ → CONFIRM 으로 올리고, 새 버전·등록은 담당자 역할을 요구하지 않는다(표준 관리자가 만든 DRAFT 는 넘겨서 확정).
8. EAI 는 버전 대상이 아니다(스펙에 없는 방어): 쓰는 전문이 있으면 인코딩·패딩 변경 거부, 헤더의 EAI 연결은 버전 행 `EAI_CODE` 에 두고 헤더 확정 때 옮긴다, 전문 저장의 표준 헤더 끼움(I14)은 그 헤더가 저장 시각에 RELEASED 일 때만, 확정 검사는 저장된 구성 그대로(끼우지 않음). (P3-15·P3-17 로 대체: EAI 표준 헤더는 시각 T 해석이고 확정은 HEADER_LAYOUT_ID 를 옮기지 않는다)
9. 레이아웃 4표의 감사 카운터를 `AUD_VER` 로 바꾸고(D-034 패턴), 레이아웃 계열 DTO 의 `ver` 를 업무 버전 문자열로 바꾼다(감사 카운터는 `AUD_VER`/`auditVer`).
