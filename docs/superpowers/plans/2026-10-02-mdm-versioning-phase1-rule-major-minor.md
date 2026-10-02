# MDM 버전 관리 1단계 — 공통 번호 체계 + 룰 major/minor 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 룰 버전을 정수에서 마스터코드와 같은 `NUMERIC(7,3)` + `VER_KIND`(MAJOR·MINOR)로 바꾸고, 룰 화면에 "새 버전(major)·새 버전(minor)" 두 버튼을 둔다.

**Architecture:** 마스터코드의 번호 계산(`MasterCodeVersionNumbers`)을 공통 `VersionNumbers` 로 올려 룰이 같이 쓴다. SQLite 에서 `NUMERIC(7,3)` 은 1.000 을 INTEGER 로, 1.001 을 REAL 로 저장하므로 마스터코드와 같은 규칙 — 버전 비교·정렬·최대값은 Java 에서, 바인딩은 `setScale(3)`, 읽기는 문자열 경유 — 을 룰 전 경로에 적용한다. 서버↔화면 계약에서 룰 버전은 문자열 `"1.000"` 이다(마스터코드 `toPlainString()` 선례).

**Tech Stack:** Java 21, Spring Boot, Hibernate/JPA, Flyway(SQLite), OASIS BPMN, JUnit 5 / React 19, Next.js, Mantine 9, ag-grid 33, vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-10-02-mdm-object-versioning-design.md` (§3 K3, §4, §5)

## Global Constraints

- 작업 위치: 워크트리 `/Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning`, 브랜치 `feat/mdm-versioning`. 원 작업 트리(`/Users/jji/project/dmes-standard`)의 파일·git 은 건드리지 않는다.
- git 은 `/usr/bin/git -C /Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning ...` 로 부른다(rtk 훅이 워크트리 격리 검사에 걸린다). `git stash` 금지.
- 버전 칼럼 타입 표기는 `NUMERIC(7,3)`(V9 마스터코드와 같음). 첫 버전 `1.000`, minor 상한 999, major 상한 9998(`MasterCodeConventions`).
- 버전 종류 칼럼 `VER_KIND VARCHAR(20) NOT NULL`, CHECK `IN ('MAJOR','MINOR')`. 만든 뒤 바꾸지 않는다.
- 감사 카운터(`TB_MDM_RULE.VER`, `TB_MDM_RULE_SET.VER`, `TB_MDM_RULE_TEST_CASE.VER`, `AUD_VER`, DTO `auditVer`)는 업무 버전이 아니다. 바꾸지 않는다.
- 버전 비교는 `compareTo`, 해시는 `stripTrailingZeros`, 저장·바인딩은 `setScale(3)`. `==`·`equals`·`intValueExact`·`<`·`>` 로 버전을 비교하지 않는다.
- 화면·DTO 계약의 룰 버전은 문자열(`BigDecimal.toPlainString()` 의 scale 3 결과, 예 `"1.000"`), 표시는 `v1.000`.
- 백엔드 시험은 SQLite 만, 도커 금지. JDK 21: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21`.
- 프런트 시험은 `src/frontend/m-mdm` 에서 `rtk proxy pnpm run test`(전체), 타입 검사 `rtk proxy pnpm run lint`.
- Flyway 새 번호는 착수 시 `flyway-migration-add` 스킬로 확인한다. 이 계획은 V17 로 적는다.
- 커밋 메시지는 Conventional Commits(`type(scope): 한국어 subject`), 끝에 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **minor 버전(1.001)이 SQLite 에서 REAL 로 저장된 뒤 다시 읽힐 때** — 화면·엔진·확정 검사가 `1.001` 을 `1.000` 이나 `1` 로 잘라 다른 버전을 집으면 안 된다. Task 5 에 1.001 왕복 시험을 둔다.
2. **같은 룰에 1.000·1.001·2.000 이 섞였을 때 "직전 RELEASED"·"최신 RELEASED"** — DB `ORDER BY`/`MAX` 가 INTEGER·REAL 혼합에서 틀리지 않아야 한다. Task 5 에 혼합 정렬 시험을 둔다.
3. **기존 정수 데이터가 있는 로컬 DB 에 V17 을 적용할 때** — 변수·행이 CASCADE 로 지워지거나 FK 위반으로 실패하면 안 된다. Task 2 에 데이터 보존·`PRAGMA foreign_key_check` 시험을 둔다.
4. **화면에서 버전 선택·인계(handoff)·확정 화면 이동** — 문자열 `"1.001"` 이 `Number()`·정수 정규식에서 사라지지 않아야 한다. Task 7 에 1.001 인계 시험을 둔다.
5. **minor 999 / 버전 없는 룰** — minor 버튼만 비활성, 첫 버전은 MAJOR 1.000. Task 6 에 경계 시험을 둔다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| Create `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/version/VersionNumbers.java` | 대상 무관 major/minor 채번·라벨·비교 |
| Modify `.../common/mastercode/MasterCodeVersionNumbers.java` | `VersionNumbers` 위임만 남김 |
| Create `.../contract/version/VersionKind.java` | `enum {MAJOR, MINOR}` 공통 종류 |
| Modify `.../contract/version/VersionTarget.java` | `BUSINESS_RULE` scale 3 |
| Create `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V17__rule_version_decimal.sql` | 룰 버전 칼럼 NUMERIC(7,3) + VER_KIND |
| Modify `.../entity/MdmRuleVer*.java`, `MdmRuleVar*.java`, `MdmRuleRow*.java` | `BigDecimal ver`, `verKind` |
| Modify `src/backend/maru-mdm-engine/.../spi/DefinitionLookup.java`, `rule/RuleResult.java`, `rule/RuleView.java`, `rule/RunTrace.java`, `rule/FlowRun.java`, `engine-contract.schema.json` | 엔진 룰 버전 `BigDecimal` |
| Modify `.../common/rule/**`, `.../dme/ruleMng/**`, `.../dme/ruleConfirm/**`, `.../dme/ruleEdit/**` | 서비스·DTO·쿼리의 버전 전환 |
| Create `src/frontend/m-mdm/src/shell/version-format.ts` | `fmtVer`, `sameVer` |
| Modify `src/frontend/m-mdm/pages/dme/{ruleMng,ruleConfirm,ruleEdit,ruleSetEdit}/**`, `src/dme/rule-handoff.ts` | 버전 문자열 전환, major/minor 버튼 |
| Create `docs/mdm/adr/0006-object-versioning-major-minor.md` | ADR |
| Modify `docs/mdm/decisions.md` | D-144 |

---

### Task 1: 공통 번호 체계 `VersionNumbers` 와 룰 scale 3

**Files:**
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/version/VersionNumbers.java`
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/version/VersionKind.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/mastercode/MasterCodeVersionNumbers.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/version/VersionTarget.java:10`
- Test: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/version/VersionNumbersTest.java` (Create)
- Test: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/version/VersionContractTest.java:78-79`

**Interfaces:**
- Produces:
  - `VersionNumbers.SCALE = 3`, `FIRST = new BigDecimal("1.000")`
  - `static BigDecimal maxVer(Collection<BigDecimal> all)` (null 이면 버전 없음)
  - `static BigDecimal nextMajor(BigDecimal max)`, `static boolean canMajor(BigDecimal max)`
  - `static BigDecimal nextMinor(BigDecimal max)`, `static boolean canMinor(BigDecimal max)`
  - `static BigDecimal next(BigDecimal max, VersionKind kind)` (불가하면 `IllegalStateException`)
  - `static String label(BigDecimal ver)` → `"v1.010"`
  - `static BigDecimal scaled(BigDecimal ver)` → `setScale(3)`, null 이면 null
  - `static BigDecimal parse(String raw)` → `new BigDecimal(raw.trim()).setScale(3)`, 소수 4자리 이상이면 `IllegalArgumentException`
  - `static boolean same(BigDecimal a, BigDecimal b)` → 둘 다 null 이거나 `compareTo == 0`
  - `static String plain(BigDecimal ver)` → `scaled(ver).toPlainString()`
  - `enum VersionKind { MAJOR, MINOR }`

- [ ] **Step 1: 실패하는 시험 작성** — `MasterCodeVersionNumbersTest` 의 사례를 그대로 옮기고 새 함수 사례를 더한다.

```java
package com.dongkuk.dmes.mdm.common.version;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class VersionNumbersTest {

    private static BigDecimal d(String s) { return new BigDecimal(s); }

    @Test
    void firstVersionIsMajorOne() {
        assertThat(VersionNumbers.nextMajor(null)).isEqualTo(d("1.000"));
        assertThat(VersionNumbers.canMinor(null)).isFalse();
    }

    @Test
    void majorFloorsThenAddsOne() {
        assertThat(VersionNumbers.nextMajor(d("1.007"))).isEqualTo(d("2.000"));
    }

    @Test
    void minorAddsOneThousandth() {
        assertThat(VersionNumbers.nextMinor(d("1.007"))).isEqualTo(d("1.008"));
        assertThat(VersionNumbers.canMinor(d("1.999"))).isFalse();
        assertThat(VersionNumbers.canMajor(d("9998.000"))).isFalse();
        assertThat(VersionNumbers.canMajor(d("9997.500"))).isTrue();
    }

    @Test
    void maxIgnoresScaleDifferences() {
        assertThat(VersionNumbers.maxVer(List.of(d("1"), d("1.001"), d("1.000")))).isEqualTo(d("1.001"));
    }

    @Test
    void nextByKind() {
        assertThat(VersionNumbers.next(d("2.004"), VersionKind.MAJOR)).isEqualTo(d("3.000"));
        assertThat(VersionNumbers.next(d("2.004"), VersionKind.MINOR)).isEqualTo(d("2.005"));
        assertThatThrownBy(() -> VersionNumbers.next(d("2.999"), VersionKind.MINOR)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void parseAndCompare() {
        assertThat(VersionNumbers.parse(" 1.001 ")).isEqualTo(d("1.001"));
        assertThat(VersionNumbers.parse("2")).isEqualTo(d("2.000"));
        assertThatThrownBy(() -> VersionNumbers.parse("1.0001")).isInstanceOf(IllegalArgumentException.class);
        assertThat(VersionNumbers.same(d("1"), d("1.000"))).isTrue();
        assertThat(VersionNumbers.same(d("1.001"), d("1.000"))).isFalse();
        assertThat(VersionNumbers.plain(d("1"))).isEqualTo("1.000");
        assertThat(VersionNumbers.label(d("1.01"))).isEqualTo("v1.010");
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mdm && ../gradlew :lib:test --tests '*VersionNumbersTest' --offline`
Expected: 컴파일 실패(`VersionNumbers` 없음)

- [ ] **Step 3: 구현** — `VersionKind`:

```java
package com.dongkuk.dmes.mdm.contract.version;

/** 버전 종류 — 마스터코드·룰·룰 세트·레이아웃 공통(D-144). 차이는 번호와 표시뿐이다(04:282). */
public enum VersionKind {
    MAJOR,
    MINOR
}
```

`VersionNumbers`(MasterCodeVersionNumbers 본문을 옮기고 아래를 더한다):

```java
package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collection;

/**
 * 버전 채번·비교 공통 규칙(D-144, 원천 04 「새 버전 대화상자」 I1~I4).
 *
 * <p>major = {@code floor(max) + 1}, minor = {@code max + 0.001}. max 는 상태로 거르지 않은 모든 버전에서 구한다.
 * SQLite NUMERIC 은 1.000 을 INTEGER, 1.001 을 REAL 로 저장하므로 산술·비교·정렬은 Java 에서만 한다(규칙표 #17).
 */
public final class VersionNumbers {

    public static final int SCALE = 3;
    public static final BigDecimal FIRST = MasterCodeConventions.FIRST_VER.setScale(SCALE);
    private static final BigDecimal MINOR_STEP = new BigDecimal("0.001");

    private VersionNumbers() {
    }

    public static BigDecimal maxVer(Collection<BigDecimal> all) {
        BigDecimal max = null;
        for (BigDecimal ver : all) {
            if (ver != null && (max == null || ver.compareTo(max) > 0)) {
                max = ver;
            }
        }
        return scaled(max);
    }

    public static BigDecimal nextMajor(BigDecimal max) {
        if (max == null) {
            return FIRST;
        }
        return max.setScale(0, RoundingMode.FLOOR).add(BigDecimal.ONE).setScale(SCALE);
    }

    public static boolean canMajor(BigDecimal max) {
        return nextMajor(max).setScale(0, RoundingMode.FLOOR).intValueExact() <= MasterCodeConventions.MAX_MAJOR;
    }

    public static boolean canMinor(BigDecimal max) {
        return max != null && minorPart(max) < MasterCodeConventions.MAX_MINOR;
    }

    public static BigDecimal nextMinor(BigDecimal max) {
        return max.add(MINOR_STEP).setScale(SCALE);
    }

    /** 종류별 다음 번호. 불가하면 IllegalStateException — 호출자가 can* 로 먼저 막는다. */
    public static BigDecimal next(BigDecimal max, VersionKind kind) {
        if (kind == VersionKind.MINOR) {
            if (!canMinor(max)) {
                throw new IllegalStateException("minor 를 더 올릴 수 없습니다: " + max);
            }
            return nextMinor(max);
        }
        if (!canMajor(max)) {
            throw new IllegalStateException("major 를 더 올릴 수 없습니다: " + max);
        }
        return nextMajor(max);
    }

    public static String label(BigDecimal ver) {
        return "v" + plain(ver);
    }

    public static BigDecimal scaled(BigDecimal ver) {
        return ver == null ? null : ver.setScale(SCALE, RoundingMode.UNNECESSARY);
    }

    public static BigDecimal parse(String raw) {
        BigDecimal v = new BigDecimal(raw.trim());
        if (v.stripTrailingZeros().scale() > SCALE) {
            throw new IllegalArgumentException("버전은 소수 셋째 자리까지입니다: " + raw);
        }
        return v.setScale(SCALE);
    }

    public static boolean same(BigDecimal a, BigDecimal b) {
        return a == null ? b == null : b != null && a.compareTo(b) == 0;
    }

    public static String plain(BigDecimal ver) {
        return scaled(ver).toPlainString();
    }

    private static int minorPart(BigDecimal ver) {
        return ver.subtract(new BigDecimal(ver.toBigInteger())).movePointRight(SCALE).intValueExact();
    }
}
```

`MasterCodeVersionNumbers` 의 각 메서드 본문을 `VersionNumbers` 같은 이름 호출로 바꾼다(`maxVer`, `nextMajor`, `canMajor`, `canMinor`, `nextMinor`, `label`). 클래스 javadoc 에 "D-144 부터 VersionNumbers 위임" 한 줄을 더한다.

`VersionTarget`:

```java
    MASTER_CODE("TB_MDM_CODE_VER", 3),
    BUSINESS_RULE("TB_MDM_RULE_VER", 3);
```

클래스 javadoc 의 "06 정수(06:971)" 를 "06 도 D-144 부터 NUMERIC(7,3)" 로 고친다. `VersionContractTest.java:78-79` 의 `assertEquals(0, VersionTarget.BUSINESS_RULE.versionScale())` 를 `assertEquals(3, ...)` 로 바꾼다.

- [ ] **Step 4: 통과 확인**

Run: `cd src/backend/mdm && ../gradlew :lib:test --tests '*VersionNumbersTest' --tests '*MasterCodeVersionNumbersTest' --tests '*VersionContractTest' --offline`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src
/usr/bin/git -C <worktree> commit -m "feat(mdm): 버전 채번을 공통 VersionNumbers 로 올리고 룰 버전 scale 을 3 으로 둔다"
```

(`<worktree>` = `/Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning`. 이후 Task 도 같다.)

---

### Task 2: V17 마이그레이션 — 룰 버전 칼럼 NUMERIC(7,3) + VER_KIND

**Files:**
- Create: `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V17__rule_version_decimal.sql`
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmBusinessRuleExpectations.java:55-73` (RULE_VER 칼럼 목록에 `VER_KIND` — `VER` 바로 뒤)
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmSharedContractMigrationTest.java:64,79-82` (버전 집합에 17)
- Modify: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/version/VersionFixtureTables.java:28-34` (`VER NUMERIC(7,3)`)
- Modify: `src/backend/mdm/sample/mdm-local-sample.sql:537-539,553,606,685-692` (VER 리터럴 `1.000`, VER_KIND `'MAJOR'`)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmRuleVersionDecimalMigrationTest.java` (Create)

**Interfaces:**
- Consumes: 없음(스키마)
- Produces: `TB_MDM_RULE_VER(VER NUMERIC(7,3), VER_KIND VARCHAR(20) NOT NULL, BASE_VER NUMERIC(7,3))`, `TB_MDM_RULE_VAR.VER`·`TB_MDM_RULE_ROW.VER`·`TB_MDM_RULE_RECV.VER` NUMERIC(7,3)

- [ ] **Step 1: 실패하는 시험 작성** — Flyway 를 V16 까지 적용한 DB 에 정수 데이터를 넣고 V17 을 적용한다. 기존 `MdmBusinessRuleMigrationTest` 의 Flyway 준비 방식(`Flyway.configure().target(...)`)을 그대로 따른다.

```java
package com.dongkuk.dmes.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class MdmRuleVersionDecimalMigrationTest {

    @TempDir
    Path dir;

    private Flyway flyway(String url, String target) {
        return Flyway.configure().dataSource(url, null, null)
                .locations("classpath:db/migration/mdm/sqlite").target(target).load();
    }

    @Test
    void integerVersionsBecomeMajorDecimalsAndChildrenSurvive() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("m.db") + "?foreign_keys=true";
        flyway(url, "16").migrate();
        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            s.execute("INSERT INTO TB_MDM_RULE (MARU_RULE_ID, RULE_NAME, RULE_KIND, STATUS) VALUES ('R1','r','DECISION','INUSE')");
            s.execute("INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, BASE_VER, APPLY_FROM, APPLY_TO) VALUES ('R1',1,'RELEASED',NULL,'2026-01-01 00:00:00','2026-02-01 00:00:00')");
            s.execute("INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, BASE_VER) VALUES ('R1',2,'DRAFT',1)");
            s.execute("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, SEQ) VALUES ('R1',2,1,'COND',1)");
            s.execute("INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, ROW_KIND, CELLS) VALUES ('R1',2,1,'NORMAL','{}')");
        }
        flyway(url, "17").migrate();
        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            ResultSet r = s.executeQuery("SELECT CAST(VER AS VARCHAR(40)), VER_KIND, CAST(BASE_VER AS VARCHAR(40)) FROM TB_MDM_RULE_VER ORDER BY VER");
            r.next();
            assertThat(new java.math.BigDecimal(r.getString(1)).setScale(3)).isEqualByComparingTo("1.000");
            assertThat(r.getString(2)).isEqualTo("MAJOR");
            r.next();
            assertThat(new java.math.BigDecimal(r.getString(3)).setScale(3)).isEqualByComparingTo("1.000");
            assertThat(count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID='R1'")).isEqualTo(1);
            assertThat(count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID='R1'")).isEqualTo(1);
            assertThat(s.executeQuery("PRAGMA foreign_key_check").next()).isFalse();
            // minor 버전 저장·자식 FK·CASCADE 가 그대로 동작한다
            s.execute("INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, VER_KIND, STATUS, BASE_VER) VALUES ('R1',2.001,'MINOR','DRAFT',2)");
            s.execute("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, SEQ) VALUES ('R1',2.001,1,'COND',1)");
            s.execute("DELETE FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID='R1' AND VER=2.001");
            assertThat(count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE VER=2.001")).isZero();
            assertThat(typeOf(s, "TB_MDM_RULE_VER", "VER")).isEqualTo("NUMERIC(7,3)");
            assertThat(typeOf(s, "TB_MDM_RULE_VAR", "VER")).isEqualTo("NUMERIC(7,3)");
            assertThat(typeOf(s, "TB_MDM_RULE_ROW", "VER")).isEqualTo("NUMERIC(7,3)");
            assertThat(typeOf(s, "TB_MDM_RULE_RECV", "VER")).isEqualTo("NUMERIC(7,3)");
        }
    }

    private static int count(Statement s, String sql) throws Exception {
        ResultSet r = s.executeQuery(sql);
        r.next();
        return r.getInt(1);
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

(INSERT 칼럼 이름이 V8/V14 의 NOT NULL 칼럼과 다르면 V8 정의를 열어 필수 칼럼을 채운다. `TB_MDM_RULE` 의 필수 칼럼은 `V8__create_mdm_business_rule.sql:11-38` 이 정본이다.)

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mdm && ../gradlew :api:test --tests '*MdmRuleVersionDecimalMigrationTest' --offline`
Expected: FAIL (V17 없음 → target 17 이 적용되지 않아 `VER_KIND` 없음)

- [ ] **Step 3: 마이그레이션 작성** — 순서가 중요하다. SQLite 는 FK 를 강제하므로 부모를 먼저 지우면 자식이 CASCADE 로 지워지거나(ON DELETE CASCADE) 위반으로 실패한다(V9:203-210 주석). 새 자식 표가 새 부모 표를 가리키게 만들고, 옛 자식 → 옛 부모 순으로 지운 뒤 이름을 바꾼다. SQLite 3.26+ 의 `ALTER TABLE ... RENAME` 은 다른 표 FK 의 표 이름도 함께 고친다.

파일 머리 주석에 다음을 적는다: 목적(D-144, 룰 버전 major/minor), V13 과 같은 "새 표 → 복사 → 지움 → 이름 바꿈" 패턴, PRAGMA 를 쓰지 않는 이유(V13 주석과 같음), 칼럼 순서는 V8/V13 그대로에 `VER_KIND` 만 `VER` 뒤에 둔다, 되돌리는 방법.

본문 골격(칼럼 정의는 `TB_MDM_RULE_VER` 는 V8:62-98, `TB_MDM_RULE_VAR` 는 V13:24-56 의 최신 정의, `TB_MDM_RULE_ROW` 는 V8:141-163, `TB_MDM_RULE_RECV` 는 V8:207-230 을 글자 그대로 옮기고 아래 차이만 둔다):

```sql
-- ① 새 부모
CREATE TABLE TB_MDM_RULE_VER_NEW (
    MARU_RULE_ID VARCHAR(50) NOT NULL,
    VER NUMERIC(7,3) NOT NULL,
    VER_KIND VARCHAR(20) NOT NULL DEFAULT 'MAJOR',
    STATUS VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    BASE_VER NUMERIC(7,3),
    -- (V8:67-91 의 나머지 칼럼 그대로)
    CONSTRAINT PK_TB_MDM_RULE_VER PRIMARY KEY (MARU_RULE_ID, VER),
    CONSTRAINT FK_TB_MDM_RULE_VER_RULE FOREIGN KEY (MARU_RULE_ID) REFERENCES TB_MDM_RULE (MARU_RULE_ID),
    CONSTRAINT CK_TB_MDM_RULE_VER_STATUS CHECK (STATUS IN ('DRAFT','REQUESTED','APPROVED','RELEASED','CANCELLED')),
    CONSTRAINT CK_TB_MDM_RULE_VER_KIND CHECK (VER_KIND IN ('MAJOR','MINOR')),
    -- (V8:95-97 의 HIT·APPLY·EMERGENCY_YN CHECK 그대로)
);
INSERT INTO TB_MDM_RULE_VER_NEW (MARU_RULE_ID, VER, VER_KIND, STATUS, BASE_VER, /* 나머지 칼럼 전부 */)
SELECT MARU_RULE_ID, CAST(VER AS NUMERIC), 'MAJOR', STATUS, CAST(BASE_VER AS NUMERIC), /* 나머지 칼럼 전부 */
FROM TB_MDM_RULE_VER;

-- ② 새 자식 — FK 는 TB_MDM_RULE_VER_NEW 를 가리킨다
CREATE TABLE TB_MDM_RULE_VAR_NEW ( /* V13 정의, VER NUMERIC(7,3) NOT NULL,
    CONSTRAINT FK_TB_MDM_RULE_VAR_VER FOREIGN KEY (MARU_RULE_ID, VER) REFERENCES TB_MDM_RULE_VER_NEW (MARU_RULE_ID, VER) ON DELETE CASCADE */ );
INSERT INTO TB_MDM_RULE_VAR_NEW (/* 칼럼 전부 */) SELECT /* VER 는 CAST(VER AS NUMERIC) */ FROM TB_MDM_RULE_VAR;
CREATE TABLE TB_MDM_RULE_ROW_NEW ( /* V8 정의, 같은 FK 변경 */ );
INSERT INTO TB_MDM_RULE_ROW_NEW (/* 칼럼 전부 */) SELECT /* CAST */ FROM TB_MDM_RULE_ROW;

-- ③ 옛 자식 → 옛 부모 순으로 지운다(옛 부모를 가리키는 표가 남지 않는다)
DROP TABLE TB_MDM_RULE_VAR;
DROP TABLE TB_MDM_RULE_ROW;
DROP TABLE TB_MDM_RULE_VER;

-- ④ 이름 바꿈(자식 FK 의 표 이름도 SQLite 가 함께 고친다)
ALTER TABLE TB_MDM_RULE_VER_NEW RENAME TO TB_MDM_RULE_VER;
ALTER TABLE TB_MDM_RULE_VAR_NEW RENAME TO TB_MDM_RULE_VAR;
ALTER TABLE TB_MDM_RULE_ROW_NEW RENAME TO TB_MDM_RULE_ROW;

-- ⑤ 인덱스 재생성(V13:75-76, V8:163)
CREATE UNIQUE INDEX UX_TB_MDM_RULE_VAR_SEQ ON TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_KIND, SEQ);
CREATE UNIQUE INDEX UX_TB_MDM_RULE_VAR_NAME ON TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_NAME) WHERE VAR_KIND = 'RESULT';
CREATE UNIQUE INDEX UX_TB_MDM_RULE_ROW_SEQ ON TB_MDM_RULE_ROW (MARU_RULE_ID, VER, SEQ) WHERE ROW_KIND = 'NORMAL';

-- ⑥ 수신 로그(FK 없음): 같은 패턴으로 VER 만 NUMERIC(7,3)
```

`VER_KIND` 에 `DEFAULT 'MAJOR'` 를 두는 이유를 주석에 적는다: 기존 INSERT 경로(샘플 SQL, 시험 보조)가 칼럼을 모르더라도 깨지지 않게 한다. 서비스는 항상 명시한다.

`MdmBusinessRuleExpectations` 의 RULE_VER 칼럼 목록에 `"VER_KIND"` 를 `"VER"` 다음에 넣고, 제약 이름 목록(:91-100)에 `CK_TB_MDM_RULE_VER_KIND` 를 더한다. `MdmSharedContractMigrationTest` 의 적용 버전 집합에 `17` 을 더한다. `VersionFixtureTables:28-34` 의 시험용 룰 버전 표 VER 를 `NUMERIC(7,3)` 로 바꾼다. 샘플 SQL 의 룰 VER·BASE_VER 리터럴을 `1.000`/`2.000` 으로 바꾼다.

- [ ] **Step 4: 통과 확인**

Run: `cd src/backend/mdm && ../gradlew :api:test --tests '*Migration*' --tests '*FkRebuild*' --tests '*MdmRuleVersionDecimalMigrationTest' --offline`
Expected: PASS. `MdmDomainCodeFkRebuildTest` 가 RULE_VAR 스키마 문자열 비교(:99-110)로 실패하면, 그 시험의 기준 정의를 V17 의 RULE_VAR 정의(VER 타입·FK 대상 표 이름 정규화 포함)로 갱신한다.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm
/usr/bin/git -C <worktree> commit -m "feat(mdm): 룰 버전 칼럼을 NUMERIC(7,3) 과 VER_KIND 로 바꾸는 V17 마이그레이션을 추가한다"
```

---

### Task 3: 룰 엔티티·Id 를 BigDecimal 로

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmRuleVer.java:33,39,94,104,106,126`
- Modify: `.../entity/MdmRuleVerId.java:14,20,26`, `MdmRuleVar.java:33,87,96`, `MdmRuleVarId.java:14,21,28`, `MdmRuleRow.java:29,54,64`, `MdmRuleRowId.java:14,21,28`
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmBusinessRuleEntityJpaRoundtripTest.java:100-109`

**Interfaces:**
- Consumes: `VersionNumbers.scaled/same`, `VersionKind`
- Produces:
  - `MdmRuleVer(String maruRuleId, BigDecimal ver, VersionKind verKind, String ownerId)`, `BigDecimal getVer()`(scale 3), `BigDecimal getBaseVer()`, `void setBaseVer(BigDecimal)`, `VersionKind getVerKind()`
  - `MdmRuleVar(String id, BigDecimal ver, int varId, String varKind, int seq)`, `BigDecimal getVer()`
  - `MdmRuleRow(String id, BigDecimal ver, int rowId, ...)` (기존 인자 순서 그대로, ver 타입만), `BigDecimal getVer()`
  - Id 클래스: `equals` 는 `VersionNumbers.same`, `hashCode` 는 `ver.stripTrailingZeros()`

- [ ] **Step 1: 실패하는 시험 작성** — 왕복 시험을 minor 로 바꾼다.

```java
        MdmRuleVer ver = new MdmRuleVer("RT_VER", new BigDecimal("2.001"), VersionKind.MINOR, "kim");
        ver.setBaseVer(new BigDecimal("2.000"));
        // 저장 → clear → 다시 읽기
        MdmRuleVer read = em.find(MdmRuleVer.class, new MdmRuleVerId("RT_VER", new BigDecimal("2.001")));
        assertThat(read).isNotNull();
        assertThat(read.getVer()).isEqualByComparingTo("2.001");
        assertThat(read.getVer().scale()).isEqualTo(3);
        assertThat(read.getVerKind()).isEqualTo(VersionKind.MINOR);
        assertThat(read.getBaseVer().scale()).isEqualTo(3);
        // 1.000 은 SQLite 에 INTEGER 로 저장되어도 같은 Id 로 찾힌다
        em.persist(new MdmRuleVer("RT_VER", new BigDecimal("1.000"), VersionKind.MAJOR, "kim"));
        em.flush(); em.clear();
        assertThat(em.find(MdmRuleVer.class, new MdmRuleVerId("RT_VER", new BigDecimal("1")))).isNotNull();
```

(기존 시험의 생성 부분 `new MdmRuleVer("RT_VER", 2, "kim")`, `setBaseVer(1)` 을 위로 바꾼다. 변수·행 왕복도 같은 방식으로 `ver` 를 `new BigDecimal("2.001")` 로 바꾼다.)

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mdm && ../gradlew :api:compileTestJava --offline`
Expected: 컴파일 실패(생성자 타입)

- [ ] **Step 3: 구현** — `MdmCodeVer`·`MdmCodeVerId` 의 방식을 그대로 따른다(`MdmCodeVerNumbers` 는 같은 `entity` 패키지라 바로 쓸 수 있으나, 새 코드는 `VersionNumbers` 를 쓴다).

```java
    @Id
    @Column(name = "VER", nullable = false, precision = 7, scale = 3)
    private BigDecimal ver;

    @Enumerated(EnumType.STRING)
    @Column(name = "VER_KIND", nullable = false, length = 20)
    private VersionKind verKind;

    @Column(name = "BASE_VER", precision = 7, scale = 3)
    private BigDecimal baseVer;

    public MdmRuleVer(String maruRuleId, BigDecimal ver, VersionKind verKind, String ownerId) {
        this.maruRuleId = maruRuleId;
        this.ver = VersionNumbers.scaled(ver);
        this.verKind = verKind;
        this.ownerId = ownerId;
    }

    public BigDecimal getVer() { return VersionNumbers.scaled(ver); }
    public BigDecimal getBaseVer() { return VersionNumbers.scaled(baseVer); }
    public void setBaseVer(BigDecimal baseVer) { this.baseVer = VersionNumbers.scaled(baseVer); }
    public VersionKind getVerKind() { return verKind; }
```

Id 클래스(`MdmRuleVerId` 예, Var·Row 도 같은 형태):

```java
    private BigDecimal ver;

    public MdmRuleVerId(String maruRuleId, BigDecimal ver) {
        this.maruRuleId = maruRuleId;
        this.ver = VersionNumbers.scaled(ver);
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof MdmRuleVerId other && Objects.equals(maruRuleId, other.maruRuleId)
                && VersionNumbers.same(ver, other.ver);
    }

    @Override
    public int hashCode() {
        return Objects.hash(maruRuleId, ver == null ? null : ver.stripTrailingZeros());
    }
```

이 Task 에서는 엔티티 컴파일만 맞춘다. 서비스의 컴파일 오류는 Task 5 에서 고친다 — 따라서 이 Task 의 시험은 Task 5 와 함께 돌린다(Step 4).

- [ ] **Step 4: 엔티티 단독 확인** — `:lib:compileJava` 는 Task 5 전까지 실패한다. 엔티티 파일만 문법 확인:

Run: `cd src/backend/mdm && ../gradlew :lib:compileJava --offline 2>&1 | grep -c 'entity/MdmRule'`
Expected: `0` (엔티티 파일 자체의 오류 없음. 다른 파일 오류는 Task 5 몫)

- [ ] **Step 5: Commit** — Task 5 와 함께 커밋한다(중간 커밋이 컴파일되지 않으므로). 이 Task 의 변경은 스테이징만 한다.

```bash
/usr/bin/git -C <worktree> add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmBusinessRuleEntityJpaRoundtripTest.java
```

---

### Task 4: 엔진 룰 버전 BigDecimal

**Files:**
- Modify: `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java:69`
- Modify: `.../engine/rule/RuleResult.java:20`, `RuleView.java:20`, `RunTrace.java:37`, `FlowRun.java:114,253`, `RuleEvaluator.java:499`, `MdmRuleEngine.java:250`, `CellTextGenerator.java:181`
- Modify: `src/backend/maru-mdm-engine/src/main/resources/engine-contract.schema.json:291,393`
- Test: `src/backend/maru-mdm-engine/src/test/.../RuleFixtures.java:185,191,227`, `SampleRuleValueTest.java:65`, `RuleSetTraceTest.java:77`, `RuleViewTest.java:94,158`
- Modify: `src/backend/mdm/lib/src/test/.../stub/RuleDefinitionLookupStub.java:71-72`
- Modify: `docs/mdm/engine-contract.md` (룰 버전 타입 설명)

**Interfaces:**
- Produces: `record RuleDefinition(String ruleId, BigDecimal ver, ...)`, `RuleResult.ver(): BigDecimal`, `RuleView.ver(): BigDecimal`, `RunTrace` 노드 `@Nullable BigDecimal ver`. JSON 계약: `"ver": {"type": "number"}` (null 허용 칸은 `["number","null"]`). 직렬화 값은 scale 3(`1.000` 은 JSON `1.000`).

- [ ] **Step 1: 실패하는 시험 작성** — `RuleViewTest` 에 minor 사례를 더한다.

```java
    @Test
    void minorVersionIsKeptOnView() {
        RuleDefinition def = RuleFixtures.decision("R_MINOR", new BigDecimal("1.001"));
        RuleView view = RuleView.of(def);
        assertThat(view.ver()).isEqualByComparingTo("1.001");
    }
```

(`RuleFixtures` 에 `decision(String id, BigDecimal ver)` 오버로드가 없으면 기존 `decision(...)` 의 `ver` 인자 타입을 `BigDecimal` 로 바꾸고 호출부의 `1` 을 `BigDecimal.ONE.setScale(3)` 으로 바꾼다. `RuleView.of` 이름은 실제 생성 경로에 맞춘다 — `RuleViewTest.java:94` 가 쓰는 생성 방식을 그대로 쓴다.)

기존 단언 `assertEquals(1, x.ver())` 들은 `assertThat(x.ver()).isEqualByComparingTo("1.000")` 로 바꾼다.

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend && ./gradlew :maru-mdm-engine:test --offline`
Expected: 컴파일 실패

- [ ] **Step 3: 구현** — 위 파일의 `int ver`/`Integer ver` 를 `BigDecimal` 로 바꾼다. `FlowRun.curVer` 는 `BigDecimal`. 스키마 두 곳을 `number` 로 바꾼다. `engine-contract.md` 의 룰 결과·트레이스 `ver` 설명을 "소수 셋째 자리 버전(예 1.001), D-144" 로 고친다. 백엔드 시험 스텁 `RuleDefinitionLookupStub:71-72` 의 정수를 `new BigDecimal("1.000")` 로 바꾼다.

- [ ] **Step 4: 통과 확인**

Run: `cd src/backend && ./gradlew :maru-mdm-engine:test --offline`
Expected: PASS

- [ ] **Step 5: Commit** — 엔진만 커밋한다(mdm 은 Task 5 에서 함께 맞춘다).

```bash
/usr/bin/git -C <worktree> add src/backend/maru-mdm-engine docs/mdm/engine-contract.md
/usr/bin/git -C <worktree> commit -m "feat(maru-mdm-engine): 룰 정의·결과·트레이스의 버전을 소수 셋째 자리 BigDecimal 로 바꾼다"
```

---

### Task 5: 백엔드 룰 서비스·쿼리·DTO 의 버전 전환

**Files (모두 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/` 아래):**
- Modify: `common/rule/RuleScreenSupport.java:69-77`
- Modify: `common/rule/RuleQueries.java:44,66,71,82-84,107,112-122,129-155,165-173,182-187,237-267`
- Modify: `common/rule/RuleNativeWrites.java:36-52`
- Modify: `common/rule/RuleVersions.java`, `RuleVersionRow.java`, `RuleIo.java`, `RuleIoReader.java:91,122-129,250,265`, `RuleUsageFinder.java:38-70`, `RuleVarTypeResolver.java:64,223`, `RuleSetAnalyzer.java:152,213,285`
- Modify: `common/rule/check/RuleSaveContext.java:13`, `check/RuleCheckInput.java:12`, `check/ledger/ContractChangeCheck.java:49-71`, `check/ledger/RuleSetOrderCheck.java:105-113`
- Modify: `common/rule/confirm/RuleConfirmChecks.java:81,112-123,143-168`
- Modify: `common/rule/definition/StoredRuleDefinitions.java:45-134`, `StoredDefinitionLookup.java:162`, `RuleDefinitionAssembler.java:84,135,165`
- Modify: `dme/ruleMng/service/RuleMngService.java:113,117,164,221-223,254`, `RuleVersionService.java:86-196`, `RuleHeaderService.java:156`
- Modify: `dme/ruleConfirm/service/RuleConfirmService.java:238-327,426-427`
- Modify: `dme/ruleEdit/service/RuleViewService.java:80-119,193`, `RuleEditService.java`, `RuleTableService.java:116,137-192,297-301`, `RuleColumnsService.java:137,179-188,261-266,402-465,564`, `RuleValueTestService.java:105`, `RuleUsageService.java:24`
- Modify DTO: `dme/ruleMng/dto/RuleVersionRequest.java`, `RuleVersionResult.java`, `RuleRegResult.java`, `RuleListRow.java`, `RuleMngViewResult.java`; `dme/ruleConfirm/dto/RuleConfirmRequest.java`, `RuleConfirmValidateRequest.java`, `RuleConfirmViewRequest.java`; `dme/ruleEdit/dto/RuleEditViewRequest.java`, `RuleEditSaveRequest.java`, `RuleTestRequest.java`, `RuleEditViewResult.java`, `RuleTestResult.java`
- Test 보조: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/DmeTestSupport.java:113-141`, `RulePerfFixture.java`, `ContractStubCompileTest.java:115,481`, `BusinessRuleConfirmCheckStub.java:35`, `RuleConfirmReportTest.java:33`
- Test (Create): `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/RuleVersionDecimalSqliteTest.java`

**Interfaces:**
- Consumes: Task 1 `VersionNumbers.*`, Task 3 엔티티, Task 4 엔진 `RuleDefinition(String, BigDecimal, ...)`
- Produces:
  - `RuleScreenSupport.ref(String id, BigDecimal ver): VersionRef`, `RuleScreenSupport.requireVer(String raw): BigDecimal` (null·빈 값이면 기존과 같은 INVALID_INPUT, 형식 오류면 INVALID_INPUT "버전 형식이 올바르지 않습니다")
  - DTO 요청의 `ver`·응답의 `ver`/`baseVer`/`releasedVer`/`pendingVer`/`currentVer`/`selectedVer`/`closedPreviousVer` 는 `String`(`VersionNumbers.plain`). 응답 버전 행에 `verKind`(`"MAJOR"|"MINOR"`)·`verLabel`(`"v1.000"`) 을 더한다.
  - 서비스 내부 시그니처의 `int ver` → `BigDecimal ver`

- [ ] **Step 1: 실패하는 시험 작성** — 혼합 정렬·minor 왕복·확정 경로를 SQLite 에서 고정한다. `DmeTestSupport` 의 기존 룰 준비 도우미를 쓴다(정수 INSERT 는 `new BigDecimal("1.000")` 바인딩으로 바꾼다).

```java
package com.dongkuk.dmes.mdm.dme;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

/** D-144 — 룰 버전 1.000·1.001·2.000 혼합에서 최신·직전 RELEASED 와 정의 조회가 정확한지. */
class RuleVersionDecimalSqliteTest extends DmeSqliteTestBase {

    @Test
    void latestReleasedPicksMinorOverMajorOfSameFloor() {
        support.releasedRule("R_MIX", "1.000", "2026-01-01 00:00:00", "2026-02-01 00:00:00");
        support.releasedRule("R_MIX", "1.001", "2026-02-01 00:00:00", "9999-12-31 00:00:00");
        var view = ruleMng.view("R_MIX");
        assertThat(view.getReleasedVer()).isEqualTo("1.001");
        assertThat(view.getVersions()).extracting("ver").containsExactly("1.001", "1.000");
    }

    @Test
    void minorVersionDefinitionIsReadBackExactly() {
        support.releasedRule("R_MIN", "1.000", "2026-01-01 00:00:00", "2026-02-01 00:00:00");
        support.releasedRule("R_MIN", "1.001", "2026-02-01 00:00:00", "9999-12-31 00:00:00");
        var def = definitions.rule("R_MIN", support.instant("2026-03-01 00:00:00"));
        assertThat(def.ver()).isEqualByComparingTo("1.001");
        var old = definitions.rule("R_MIN", support.instant("2026-01-15 00:00:00"));
        assertThat(old.ver()).isEqualByComparingTo("1.000");
    }

    @Test
    void editViewSelectsMinorVersionByString() {
        support.releasedRule("R_SEL", "1.000", "2026-01-01 00:00:00", "9999-12-31 00:00:00");
        support.draftRule("R_SEL", "1.001", "MINOR", "1.000", "kim");
        var view = ruleEdit.view("R_SEL", "1.001");
        assertThat(view.getSelectedVer()).isEqualTo("1.001");
    }
}
```

(`DmeSqliteTestBase`·`support.releasedRule/draftRule/instant`·`ruleMng.view`·`definitions.rule`·`ruleEdit.view` 는 기존 dme 시험의 기반 클래스와 도우미 이름에 맞춘다. 기존 `DmeTestSupport` 에 같은 일을 하는 도우미가 있으면 그것을 쓰고, 없으면 `DmeTestSupport` 에 `releasedRule(String id, String ver, String from, String to)`, `draftRule(String id, String ver, String kind, String baseVer, String owner)` 를 더한다 — INSERT 는 `TB_MDM_RULE`(없으면), `TB_MDM_RULE_VER`(VER·VER_KIND·STATUS·BASE_VER·OWNER_ID·APPLY_FROM·APPLY_TO), 최소 변수 1개·기본 행 1개.)

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mdm && ../gradlew :api:test --tests '*RuleVersionDecimalSqliteTest' --offline`
Expected: 컴파일 실패

- [ ] **Step 3: 구현 — 변환 규칙을 파일별로 적용**

공통 도우미(`RuleScreenSupport`):

```java
    public VersionRef ref(String id, BigDecimal ver) {
        return new VersionRef(VersionTarget.BUSINESS_RULE, id, VersionNumbers.scaled(ver));
    }

    public BigDecimal requireVer(String raw) {
        if (raw == null || raw.isBlank()) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "버전이 필요합니다", List.of());
        }
        try {
            return VersionNumbers.parse(raw);
        } catch (IllegalArgumentException e) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "버전 형식이 올바르지 않습니다: " + raw, List.of());
        }
    }
```

(`MdmErrors.of`·`MdmErrorCode.INVALID_INPUT` 은 기존 `requireVer` 가 쓰는 오류 생성 방식을 그대로 쓴다 — 기존 메시지 문구도 유지한다.)

`RuleQueries` — DB 의 `ORDER BY v.ver`·`MAX(v.ver)`·`r.ver = (SELECT MAX ...)` 는 SQLite 의 INTEGER/REAL 혼합에서 믿을 수 없다(Review Focus 2). 각 쿼리를 "룰 ID 로 버전 행 전부 읽기 → Java 에서 `compareTo` 로 정렬·최대 선택" 으로 바꾼다. 버전 값 바인딩(`:ver`)은 `VersionNumbers.scaled(ver)`. `Map<String,Integer>` 반환은 `Map<String,BigDecimal>`, `ReleasedHead(int ver)` 는 `ReleasedHead(BigDecimal ver)`.

예 — 최신 RELEASED 버전 맵:

```java
    public Map<String, BigDecimal> latestReleasedVers(Collection<String> ruleIds) {
        Map<String, BigDecimal> result = new HashMap<>();
        for (MdmRuleVer v : em.createQuery(
                "SELECT v FROM MdmRuleVer v WHERE v.maruRuleId IN :ids AND v.status = 'RELEASED'", MdmRuleVer.class)
                .setParameter("ids", ruleIds).getResultList()) {
            result.merge(v.getMaruRuleId(), v.getVer(), (a, b) -> a.compareTo(b) >= 0 ? a : b);
        }
        return result;
    }
```

정렬이 필요한 목록은 `list.sort(Comparator.comparing(MdmRuleVer::getVer).reversed())` 처럼 Java 에서 정렬한다.

`RuleNativeWrites`·`RuleColumnsService` native SQL: `.setParameter("ver", VersionNumbers.scaled(ver))`.

비교 연산 치환 목록(그대로 고친다):
- `RuleConfirmChecks.java:81` `draft.ver().intValueExact()` → `draft.ver()`(BigDecimal 그대로)
- `RuleConfirmChecks.java:123` `v.getVer() < ver` → `v.getVer().compareTo(ver) < 0`, `> best.getVer()` → `compareTo(...) > 0`
- `ContractChangeCheck.java:50` `releasedVer == ctx.ver()` → `VersionNumbers.same(releasedVer, ctx.ver())`
- `StoredRuleDefinitions.java:46` `v.getVer() == ver` → `VersionNumbers.same(v.getVer(), ver)`
- `RuleTableService.java:300` `v.getVer() == ver` → `VersionNumbers.same(v.getVer(), ver)`
- `RuleConfirmService.java:238,241,264` `intValueExact()`/`.equals(ver)` → `VersionNumbers.same`
- `RuleViewService.java:81` `v.getVer().equals(request.getVer())` → `VersionNumbers.same(v.getVer(), support.requireVer(request.getVer()))`
- `RuleIoReader.java:91,122-129` `Integer.valueOf(h.ver()).equals(...)` → `VersionNumbers.same`
- `RuleMngService.java:221-223` `Integer.compare(b.getVer(), a.getVer())` → `b.getVer().compareTo(a.getVer())`
- `StoredDefinitionLookup.java:162` 캐시 키 `ruleId + "@" + VersionNumbers.plain(v.getVer())`
- `RuleHeaderService.java:156`, `RuleConfirmService.java:427`, `RuleConfirmChecks.java:115` 의 `BigDecimal.valueOf(int)` → 이미 `BigDecimal` 인 값을 `VersionNumbers.scaled` 로

최초 버전(`RuleMngService.java:113,117`): `new MdmRuleVer(id, VersionNumbers.FIRST, VersionKind.MAJOR, me)`.

`RuleVersionService.newVersion` — 이 Task 에서는 종류를 아직 받지 않는다(Task 6). 번호만 `VersionNumbers.nextMajor(VersionNumbers.maxVer(versions.stream().map(MdmRuleVer::getVer).toList()))`, `VersionKind.MAJOR` 로 만든다. `copyDefinition(String id, BigDecimal from, BigDecimal to)`.

DTO: 버전 필드를 `String` 으로 바꾸고 응답을 만들 때 `VersionNumbers.plain(...)` 을 쓴다(null 이면 null). 버전 행 DTO(`RuleMngViewResult.VersionRow`, `RuleVersionRow`)에 `String verKind`, `String verLabel` 을 더한다. 오류 메시지의 `" v" + ver` 는 `" " + VersionNumbers.label(ver)` 로.

시험 보조: `DmeTestSupport.java:113-141`·`RulePerfFixture` 의 VER 정수 바인딩을 `new BigDecimal("n.000")`, INSERT 칼럼에 `VER_KIND` 를 더한다. `ContractStubCompileTest.java:115,481`, `BusinessRuleConfirmCheckStub.java:35`, `RuleConfirmReportTest.java:33` 의 `new BigDecimal("3")`·`BigDecimal.valueOf(2)` 를 `new BigDecimal("3.000")` 등으로.

OASIS BPMN 의 dto 바인딩은 필드 이름이 같으므로 바꾸지 않는다. `oasis-contract-check` 스킬로 확인한다.

- [ ] **Step 4: 통과 확인**

Run:
```bash
cd src/backend/mdm && export JAVA_HOME=/opt/homebrew/opt/openjdk@21 && ../gradlew :lib:test :api:test --offline
python3 /Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning/.claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root /Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning
```
Expected: 모두 PASS, OASIS ERROR 0. (스크립트 경로가 다르면 `oasis-contract-check` 스킬의 안내를 따른다.)

- [ ] **Step 5: Commit** (Task 3 스테이징 포함)

```bash
/usr/bin/git -C <worktree> add src/backend/mdm
/usr/bin/git -C <worktree> commit -m "feat(mdm): 룰 엔티티·서비스·쿼리·DTO 의 버전을 NUMERIC(7,3) 문자열 계약으로 바꾼다"
```

---

### Task 6: 룰 새 버전 major/minor

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleMng/dto/RuleVersionRequest.java` (`String verKind` 추가)
- Modify: `.../dme/ruleMng/service/RuleVersionService.java:86-120`
- Modify: `.../dme/ruleMng/dto/RuleMngViewResult.java` (`canNewMajor`, `canNewMinor`, `nextMajor`, `nextMinor` 추가)
- Modify: `.../dme/ruleMng/service/RuleMngService.java` (view 에서 위 플래그 계산)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/RuleNewVersionKindSqliteTest.java` (Create)

**Interfaces:**
- Consumes: `VersionNumbers.next/canMajor/canMinor/maxVer`, `VersionKind`
- Produces: OASIS `ruleMng` action `copy` 요청 `{maruRuleId, verKind: "MAJOR"|"MINOR"}`(없으면 MAJOR — 기존 화면 호환), 응답 `RuleVersionResult{maruRuleId, ver: "2.001", verKind}`. view 응답 플래그 `canNewMajor: boolean`, `canNewMinor: boolean`, `nextMajor: String|null`, `nextMinor: String|null` — 마스터코드 `edit-types` 와 같은 이름.

- [ ] **Step 1: 실패하는 시험 작성**

```java
class RuleNewVersionKindSqliteTest extends DmeSqliteTestBase {

    @Test
    void minorAddsOneThousandthAndRecordsKind() {
        support.releasedRule("R_K", "2.004", "2026-01-01 00:00:00", "9999-12-31 00:00:00");
        var result = ruleVersion.newVersion(request("R_K", "MINOR"));
        assertThat(result.getVer()).isEqualTo("2.005");
        assertThat(support.verKind("R_K", "2.005")).isEqualTo("MINOR");
    }

    @Test
    void majorFloorsAndAddsOne() {
        support.releasedRule("R_K2", "2.004", "2026-01-01 00:00:00", "9999-12-31 00:00:00");
        assertThat(ruleVersion.newVersion(request("R_K2", "MAJOR")).getVer()).isEqualTo("3.000");
    }

    @Test
    void missingKindDefaultsToMajor() {
        support.releasedRule("R_K3", "1.000", "2026-01-01 00:00:00", "9999-12-31 00:00:00");
        assertThat(ruleVersion.newVersion(request("R_K3", null)).getVer()).isEqualTo("2.000");
    }

    @Test
    void minorAt999IsRejectedAndFlaggedOff() {
        support.releasedRule("R_K4", "1.999", "2026-01-01 00:00:00", "9999-12-31 00:00:00");
        var view = ruleMng.view("R_K4");
        assertThat(view.isCanNewMinor()).isFalse();
        assertThat(view.isCanNewMajor()).isTrue();
        assertThat(view.getNextMajor()).isEqualTo("2.000");
        assertThatThrownBy(() -> ruleVersion.newVersion(request("R_K4", "MINOR")))
                .hasMessageContaining("major 를 올리십시오");
    }

    @Test
    void flagsOffWhileUnappliedVersionExists() {
        support.releasedRule("R_K5", "1.000", "2026-01-01 00:00:00", "9999-12-31 00:00:00");
        support.draftRule("R_K5", "1.001", "MINOR", "1.000", "kim");
        var view = ruleMng.view("R_K5");
        assertThat(view.isCanNewMajor()).isFalse();
        assertThat(view.isCanNewMinor()).isFalse();
    }

    private static RuleVersionRequest request(String id, String kind) {
        RuleVersionRequest r = new RuleVersionRequest();
        r.setMaruRuleId(id);
        r.setVerKind(kind);
        return r;
    }
}
```

(`support.verKind(id, ver)` 은 `SELECT VER_KIND FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID=? AND VER=?`(ver 는 `new BigDecimal(ver)` 바인딩)로 `DmeTestSupport` 에 더한다.)

- [ ] **Step 2: 실패 확인**

Run: `cd src/backend/mdm && ../gradlew :api:test --tests '*RuleNewVersionKindSqliteTest' --offline`
Expected: 컴파일 실패(`setVerKind` 없음)

- [ ] **Step 3: 구현**

`RuleVersionService.newVersion` 의 번호 계산부:

```java
        VersionKind kind = request.getVerKind() == null || request.getVerKind().isBlank()
                ? VersionKind.MAJOR : VersionKind.valueOf(request.getVerKind());
        BigDecimal max = VersionNumbers.maxVer(versions.stream().map(MdmRuleVer::getVer).toList());
        if (kind == VersionKind.MINOR && !VersionNumbers.canMinor(max)) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "minor 를 더 올릴 수 없습니다. major 를 올리십시오", List.of());
        }
        if (kind == VersionKind.MAJOR && !VersionNumbers.canMajor(max)) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "major 를 더 올릴 수 없습니다", List.of());
        }
        BigDecimal next = VersionNumbers.next(max, kind);
        // ... new MdmRuleVer(id, next, kind, me)
        return new RuleVersionResult(id, VersionNumbers.plain(next), kind.name(), 0L);
```

`VersionKind.valueOf` 가 잘못된 문자열에서 던지는 `IllegalArgumentException` 은 INVALID_INPUT "버전 종류는 MAJOR 또는 MINOR 입니다" 로 바꿔 던진다.

`RuleMngService.view` 의 플래그(마스터코드 `CodeEditService.java:458-471` 과 같은 규칙): 미적용 버전(DRAFT·REQUESTED·APPROVED, 또는 apply_from 이 미래인 RELEASED)이 있거나 룰이 DEPRECATED 이면 둘 다 false. 아니면 `canNewMajor = VersionNumbers.canMajor(max)`, `canNewMinor = VersionNumbers.canMinor(max)`, `nextMajor/nextMinor` 는 가능할 때만 `plain`.

- [ ] **Step 4: 통과 확인**

Run: `cd src/backend/mdm && ../gradlew :api:test --tests '*dme*' --offline`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/backend/mdm
/usr/bin/git -C <worktree> commit -m "feat(mdm): 룰 새 버전에 major/minor 종류를 받고 화면용 가능 여부 플래그를 내려준다"
```

---

### Task 7: 프런트 룰 버전 문자열 전환과 major/minor 버튼

**Files (모두 `src/frontend/m-mdm/` 아래):**
- Create: `src/shell/version-format.ts`, `tests/shell/version-format.test.ts`
- Modify: `src/shell/index.ts` (export 추가)
- Modify: `pages/dme/ruleMng/types.ts:12,15,53,69,76,102,124`, `api.ts:82-115`, `RuleDetailPanel.tsx`, `page.tsx:65,270`
- Modify: `pages/dme/ruleConfirm/types.ts:12,32,37,45,132-133`, `api.ts:51-61`, `page.tsx:126-140,204-212,294,311-365,389,408`
- Modify: `pages/dme/ruleEdit/types.ts`, `api.ts`, `page.tsx:90-93`, `cards.ts:28`, `state/useRuleEdit.ts`, `state/workbench-context.tsx`, `value-test/test-marks.ts`, `value-test/run-request.ts`, `sections/columns/column-draft.ts:115-116`, `sections/columns/ColumnSettingsSection.tsx:102`, `sections/contract/contract-view.ts:234`, `cards/TestResultCard.tsx:162,214`, `decision-table/table-state.ts:50`, `decision-table/DecisionTableCard.tsx:81,203,468`
- Modify: `pages/dme/ruleSetEdit/types.ts:36`, `panels/PropertyPanel.tsx:193`, `debugger/TraceDetail.tsx:178`
- Modify: `src/dme/rule-handoff.ts:15-34`
- Test: `tests/dme/rule-handoff.test.ts`, `tests/dme/ruleConfirm/rule-confirm-page.test.ts`, `tests/dme/ruleEdit/fixtures.ts` 와 ruleEdit 시험들, `tests/dme/ruleMng/rule-mng-page.test.ts`, `tests/dme/ruleSetEdit/rule-set-corpus.test.ts`, `legacy-upgrade.test.ts`
- Modify e2e: `src/frontend/e2e/mdm-ruleConfirm.spec.ts`, `mdm-ruleEdit.spec.ts`, `mdm-ruleMng.spec.ts`, `mdm-user/dme.user.ts`

**Interfaces:**
- Consumes: Task 5·6 서버 계약(버전 문자열 `"1.001"`, `verKind`, `verLabel`, `canNewMajor/canNewMinor/nextMajor/nextMinor`, copy 요청 `verKind`)
- Produces:
  - `fmtVer(ver: string | null | undefined): string` → `"v1.001"`, 빈 값이면 `""`
  - `sameVer(a: string | null | undefined, b: string | null | undefined): boolean` → 숫자 값 비교(`"1"` 과 `"1.000"` 같음)
  - `normVer(raw: string | number | null | undefined): string | null` → `"1.000"` 형식, 형식 오류면 null
  - `api.newVersion(maruRuleId: string, verKind: "MAJOR" | "MINOR")`
  - `RuleEditTarget.ver?: string`, `openRuleEdit(ruleId: string, ver?: string)`

- [ ] **Step 1: 실패하는 시험 작성**

```ts
// tests/shell/version-format.test.ts
import { describe, expect, it } from "vitest";
import { fmtVer, normVer, sameVer } from "@/shell";

describe("version-format", () => {
  it("formats three decimals", () => {
    expect(fmtVer("1.001")).toBe("v1.001");
    expect(fmtVer("2")).toBe("v2.000");
    expect(fmtVer(null)).toBe("");
  });
  it("normalizes handoff values", () => {
    expect(normVer("1.001")).toBe("1.001");
    expect(normVer(2)).toBe("2.000");
    expect(normVer("1.0001")).toBeNull();
    expect(normVer("abc")).toBeNull();
  });
  it("compares by value", () => {
    expect(sameVer("1", "1.000")).toBe(true);
    expect(sameVer("1.001", "1.000")).toBe(false);
    expect(sameVer(null, null)).toBe(true);
  });
});
```

`tests/dme/rule-handoff.test.ts` 에 minor 인계 사례를 더한다(Review Focus 4):

```ts
  it("keeps a minor version through handoff", () => {
    openRuleEdit("R1", "1.001");
    expect(readRuleEditTarget()?.ver).toBe("1.001");
  });
```

(`readRuleEditTarget` 는 기존 시험이 sessionStorage 값을 읽는 방식에 맞춘다.)

`tests/dme/ruleConfirm/rule-confirm-page.test.ts` 에 handoff `ver: "1.001"` 로 들어오면 대상 버전이 `v1.001` 로 보이는 사례를 더한다. `tests/dme/ruleMng/rule-mng-page.test.ts` 에 "새 버전(minor)" 클릭 시 `copy` 요청 본문이 `{maruRuleId, verKind: "MINOR"}` 인 사례, `canNewMinor: false` 일 때 minor 버튼 비활성 사례를 더한다.

- [ ] **Step 2: 실패 확인**

Run: `cd src/frontend/m-mdm && npx vitest run tests/shell/version-format.test.ts tests/dme/rule-handoff.test.ts`
Expected: FAIL (`fmtVer` 없음)

- [ ] **Step 3: 구현**

```ts
// src/shell/version-format.ts
/** 버전 문자열 공통 처리(D-144). 서버는 "1.000" 형식(scale 3)으로 내려준다. */
const VER_RE = /^\d{1,4}(\.\d{1,3})?$/;

export function normVer(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!VER_RE.test(s)) return null;
  return Number(s).toFixed(3);
}

export function fmtVer(ver: string | null | undefined): string {
  const n = normVer(ver);
  return n ? `v${n}` : "";
}

export function sameVer(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  const x = normVer(a);
  const y = normVer(b);
  return x !== null && x === y;
}
```

`src/shell/index.ts` 에 `export { fmtVer, normVer, sameVer } from "./version-format";`.

치환 규칙:
- 룰 버전 타입 `number` → `string`(목록·상세·확정·편집·세트 편집의 `ver`, `baseVer`, `releasedVer`, `pendingVer`, `currentVer`, `selectedVer`, `closedPreviousVer`). 감사 `auditVer` 는 그대로.
- `===` 로 버전을 비교하는 곳(`RuleDetailPanel.tsx:110-119`, `ColumnSettingsSection.tsx:102`, `contract-view.ts:234`, `TestResultCard.tsx:214`, `table-state.ts:50`, `DecisionTableCard.tsx:81,203`, `run-request.ts:37,51,59-60,116`, `test-marks.ts:85-101`) → `sameVer(a, b)`.
- 표시 보간(`` `v${...}` ``, `버전 ${...}`) → `fmtVer(...)` 또는 `` `버전 ${fmtVer(...)}` ``.
- `ruleConfirm/page.tsx:130-134` `toVer()` → `normVer(raw)`.
- `ruleEdit/page.tsx:90-93` Select: `value: v.ver`, `label: `${fmtVer(v.ver)} (${v.status})``, `onChange={(v) => void state.selectVer(v)}`(문자열 그대로). `useRuleEdit.ts` 의 `NextVer = string | null | undefined`.
- `column-draft.ts:115-116` 의 sessionStorage 키는 `normVer(ver)` 로 만든다(같은 버전이 `"1"`/`"1.000"` 두 키로 갈리지 않게).
- `rule-handoff.ts` `ver?: string`, 읽을 때 `normVer` 로 정규화(옛 sessionStorage 의 숫자 값도 받는다).
- `RuleDetailPanel.tsx`: 새 버전 버튼을 둘로. `VersionActionBar` 에 `newVersionMode="majorMinor"`, `newMajor={{enabled, title}}`, `newMinor={{enabled, title}}`, `onNewMajor`, `onNewMinor`, `ids.newMajor="rule-ver-new-major"`, `ids.newMinor="rule-ver-new-minor"` 를 넘긴다(지금은 `newVersionMode="single"`). 마스터코드 `CodeDetail.tsx` 의 사용법이 정본이다. 활성 조건은 서버 플래그 `canNewMajor && canDo("copy")`, `canNewMinor && canDo("copy")`. title 에 `nextMajor`/`nextMinor` 를 `fmtVer` 로 보인다. 클릭 → `api.newVersion(id, "MAJOR" | "MINOR")`.
- `ruleMng/api.ts` 의 `newVersion(maruRuleId)` → `newVersion(maruRuleId, verKind)` 로 `copy` 요청 본문에 `verKind` 를 싣는다.

e2e: 문구·값을 문자열 버전으로 바꾼다 — `toHaveValue("1")` → `toHaveValue("1.000")`, "버전 1" → "버전 v1.000", 행 testid `rule-ver-row-1` → 행 키가 `ver` 문자열이면 `rule-ver-row-1.000`(RuleDetailPanel 의 `rowKey="ver"` 가 그대로 testid 에 쓰이는지 확인하고 실제 값에 맞춘다), `rc-row-${id}-${ver}` 의 `ver` 를 문자열로, 요청 단언 `ver: 1` → `ver: "1.000"`. "새 버전" 클릭은 "새 버전(major)" 로.

- [ ] **Step 4: 통과 확인**

Run: `cd src/frontend/m-mdm && rtk proxy pnpm run lint && rtk proxy pnpm run test`
Expected: tsc 오류 0, `[m-mdm test 합계] ... failed 0`

- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add src/frontend
/usr/bin/git -C <worktree> commit -m "feat(m-mdm): 룰 버전을 소수 셋째 자리 문자열로 다루고 새 버전(major·minor) 두 버튼을 둔다"
```

---

### Task 8: 결정 기록 — ADR-0006, D-144, 가이드

**Files:**
- Create: `docs/mdm/adr/0006-object-versioning-major-minor.md` (번호는 `adr-write` 스킬로 확인)
- Modify: `docs/mdm/adr/README.md` (인덱스)
- Modify: `docs/mdm/decisions.md` (D-144 — 번호는 원 작업 트리 `decisions.md` 의 마지막 번호를 확인해 정한다)
- Modify: `docs/guide/FrontEnd/Local-Rules.md` §24 (룰도 major/minor 두 버튼)

- [ ] **Step 1: ADR 작성** — `adr-write` 스킬을 따른다. 내용: 상태 PROPOSED→ACCEPTED(사용자 결정 2026-10-02), 맥락(목적 넷), 결정 K1~K7(스펙 §3 표를 옮긴다), 번복 대상(스펙 §2 표), 결과(1단계 범위, 2·3단계 예정), 대안(B·C안, 정수 유지, JSON 스냅샷)과 기각 이유.
- [ ] **Step 2: D-144 기록** — `decisions.md` 형식(`## D-144 (ISO 시각)`, Source·Decision·Why)으로 "룰 버전 NUMERIC(7,3)+VER_KIND, 버전 계약 문자열, 새 버전 major/minor" 를 적고 ADR-0006·스펙 링크를 단다.
- [ ] **Step 3: Local-Rules §24** 에 "룰·룰 세트·레이아웃도 새 버전(major)·새 버전(minor) 두 버튼(D-144)" 한 줄을 더한다.
- [ ] **Step 4: 확인** — `adr-write` 스킬의 린트·인덱스 정합 검사를 돌린다.
- [ ] **Step 5: Commit**

```bash
/usr/bin/git -C <worktree> add docs
/usr/bin/git -C <worktree> commit -m "docs(mdm): ADR-0006·D-144 로 룰 major/minor 와 버전 관리 확장 결정을 기록한다"
```

---

### Task 9: 통합 확인

- [ ] **Step 1: 전체 시험**

```bash
cd /Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning/src/backend && export JAVA_HOME=/opt/homebrew/opt/openjdk@21 && ./gradlew :maru-mdm-engine:test --offline && (cd mdm && ../gradlew :lib:test :api:test --offline)
cd /Users/jji/project/dmes-standard/.claude/worktrees/mdm-versioning/src/frontend/m-mdm && rtk proxy pnpm run lint && rtk proxy pnpm run test
```
Expected: 모두 통과.

- [ ] **Step 2: 화면 확인** — 워크트리에서 MDM 을 띄울 수 있으면(로컬 기동 사전조건: JDK 21, `TSUP_DTS=0 local-run.sh --mdm -q`) ego-browser 로 룰 관리 화면에서 새 버전(minor) → 편집 → 확정 화면 이동 → 확정까지 한 번 돌리고 `v1.001` 표시를 확인한다. 워크트리 기동이 원 작업 트리 서버·포트와 충돌하면 이 단계는 건너뛰고 보고에 적는다. 확인 뒤 연 브라우저 작업 공간을 닫는다.

- [ ] **Step 3: 보고** — 바꾼 범위, 시험 결과, 화면 확인 여부, 남은 일(2단계 룰 세트, `reg`→`copy` 권한 이행, 원천 설계 문서 06:971 갱신)을 정리한다.
