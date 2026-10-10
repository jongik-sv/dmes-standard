# ERD 도구 단계 2 — Task 1·2·3: 타입 대응, 엔진 규칙, 다시 가져오기 반영 요소 (레인 BE1)

> 공통 제약(Global Constraints)·단계 2 에서 정한 점(S2-1~S2-28)·Review Focus·인터페이스 정본은 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [README](README.md) · 다음: [02-backend-contracts.md](02-backend-contracts.md)

이 문서의 경로 약어:
- `E/` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/`
- `ET/` = `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/`
- `AT/` = `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/`

명령은 모두 `src/backend/mdm` 에서 부른다. 먼저 `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 을 한다. Bash timeout 은 600000ms 로 준다. lib 단위 시험은 Oracle 을 쓰지 않으므로 `../gradlew :lib:test` 로 바로 부른다. api 시험은 Oracle 을 쓰므로 언제나 heavy.mjs 를 거친다(Global Constraints).

레인 BE1 은 `E/standard/**`, `E/engine/**`(`ErdRejection.java` 는 빼고), `E/importing/**`, `E/model/ErdModelCodec.java`, lib 시험을 고친다. `E/service/**`·`E/stream/**`·`E/dto/**` 는 레인 BE2 의 것이라 고치지 않는다. 예외 두 가지는 "계획 작성자 메모" 에 적었다(api 새 시험 파일 1개, `E/dbmeta/ErdDbMetaReader.java` 한 곳).

### 착수 확인

- [ ] **Step 0: 브랜치와 기준 커밋 확인**

```bash
/usr/bin/git rev-parse --abbrev-ref HEAD
/usr/bin/git merge-base --is-ancestor 25bc64ff3 HEAD && echo "deferred 27 포함"
```

Expected: 첫 줄 `erd-stage2-be1`, 둘째 줄 `deferred 27 포함`. 둘 중 하나라도 다르면 멈추고 조정 세션에 알린다.

---

### Task 1: 도메인 → 물리 타입 대응 `ErdTypeMapping` (S2-3, deferred 42)

**Files:**
- Create: `E/standard/ErdTypeMapping.java`
- Modify: `E/standard/ErdStandardJudge.java` (`sameType` 을 옮기고 위임만 남긴다)
- Modify: `E/engine/ErdCommandEngine.java` (`copyDomain`)
- Test: `ET/standard/ErdTypeMappingTest.java`(새), `ET/standard/ErdStandardJudgeTest.java`(호출 이름만 바꾼다), `AT/ErdTypeMappingOracleTest.java`(새, 실제 Oracle DDL 왕복)

**Interfaces:**
- Consumes:
  - 단계 0·1: `ErdDomainSpec(domainId, domainName, dataType, length, scale)`, `ErdColumn`, `ErdCommandEngine`, `ErdNaming.domain`.
  - 단계 1: `ErdImportBuilder.typeOf(ErdDbMeta.Column) : ColumnType`, `ErdDbDiff.diff(ErdModel, ErdDbMeta)`, `ErdDbMetaReader.read(String owner)`.
- Produces (README 정본 그대로):
  - `ErdTypeMapping.PhysType(String dataType, Integer length, Integer scale)` (record)
  - `ErdTypeMapping.physicalOf(String dataType, Integer length, Integer scale) : PhysType`
  - `ErdTypeMapping.physicalOf(ErdDomainSpec d) : PhysType` — 위와 같다(편의 오버로드)
  - `ErdTypeMapping.sameType(ErdColumn c, String dataType, Integer length, Integer scale) : boolean` — `ErdStandardJudge.sameType` 을 옮긴 것이다. 판정·미리보기·확정 검사·엔진 경고가 모두 이 함수로 비교한다.
  - `ErdTypeMapping.NUMBER_MAX_PRECISION = 38`
- BE2 Task 5 가 적용하는 미리보기 대응: `E/service/ErdEditService.java` 의 `previewStatus` 에서 `dom.ifPresent(x -> { … })` 블록(지금 281~286행)을 아래로 바꾼다. BE1 은 이 파일을 고치지 않는다.

```java
        dom.ifPresent(x -> {
            ErdTypeMapping.PhysType p = ErdTypeMapping.physicalOf(x);   // S2-3: 미리보기도 copyDomain 과 같은 대응을 쓴다
            c.domainId = x.domainId();
            c.dataType = p.dataType();
            c.length = p.length();
            c.scale = p.scale();
        });
```

이 Task 에서 정하는 규칙(README 대응표를 코드로 옮긴다):

| 도메인 (타입, 길이, 소수) | `physicalOf` | `sameType` 이 맞다고 보는 모델 컬럼 |
|---|---|---|
| `STRING`(n) | `VARCHAR2`, n, null | `VARCHAR2`·`NVARCHAR2`·`VARCHAR`·`CHAR`·`NCHAR` 이고 길이 n |
| `STRING`(없음) | `CLOB`, null, null | 문자 타입(길이 무관) 또는 `CLOB`(새 규칙) |
| `NUMBER`(p, s) | `NUMBER`, p, s | `NUMBER`, 정밀도 p, 소수 s. 정밀도가 있는 컬럼의 소수 null 은 0 |
| `NUMBER`(p, 없음) | `NUMBER`, p, 0 | 위와 같다(NUMBER(p) = NUMBER(p,0)) |
| `NUMBER`(없음, 없음) | `NUMBER`, null, null | 모든 `NUMBER` |
| `NUMBER`(없음, s) | `NUMBER`, 38, s | `NUMBER` 이고 소수만 s(새 규칙). DDL 은 `NUMBER(38,s)` 로 쓴다 |
| `DATE`(scale 없음) | `DATE`, null, null | `DATE` |
| `DATE`(scale n) | `TIMESTAMP(n)`, null, null | `TIMESTAMP(n)`(가져오기와 같은 글자 표현) |
| `BOOLEAN` | `VARCHAR2`, 1, null | 길이 1 문자 타입 |
| 그 밖(물리 타입이거나 모르는 타입) | 그대로 | 세 값이 그대로 같을 때만 |
| 타입 null | (null, 길이, 소수) 그대로 | 세 값이 그대로 같을 때만 |

- 타입 이름은 `strip()` 뒤 대문자로 맞춰 고른다(`"string"` 도 STRING 이다). 그대로 돌려주는 경우는 받은 글자를 바꾸지 않는다.
- `addColumn` 은 지금처럼 호출자가 `dataType` 을 주지 않았을 때만 도메인을 복사한다. `applyDomain` 은 늘 복사한다. 두 곳 모두 `copyDomain` 을 거치므로 대응이 한 번에 바뀐다.
- 관계가 부모 컬럼 타입을 자식으로 복사하는 길(`ErdRelationOps.add`)은 이미 물리 타입을 복사하므로 바꾸지 않는다.

- [ ] **Step 1: 실패하는 단위 시험 작성 — `ET/standard/ErdTypeMappingTest.java`**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ApplyOutcome;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.AddColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.AddTable;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.ApplyDomain;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommandEngine;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdDomainSpec;
import com.dongkuk.dmes.mdm.dma.erdEdit.importing.ErdDbDiff;
import com.dongkuk.dmes.mdm.dma.erdEdit.importing.ErdImportBuilder;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdTypeMapping.PhysType;
import com.dongkuk.dmes.mdm.dma.naming.TermDictionary;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/** S2-3·deferred 42: 도메인 → 물리 타입 대응과, 판정·가져오기 표현과의 왕복. */
class ErdTypeMappingTest {

    /** README 대응표의 모든 행 + 소문자 이름 + 이미 물리 타입인 도메인. id 가 짝수면 NOT NULL 로 만든다. */
    static final List<ErdDomainSpec> DOMAINS = List.of(
            new ErdDomainSpec(1L, "명", "STRING", 100, null),
            new ErdDomainSpec(2L, "긴글", "STRING", null, null),
            new ErdDomainSpec(3L, "금액", "NUMBER", 15, 2),
            new ErdDomainSpec(4L, "순번", "NUMBER", 19, null),
            new ErdDomainSpec(5L, "수", "NUMBER", null, null),
            new ErdDomainSpec(6L, "비율", "NUMBER", null, 4),
            new ErdDomainSpec(7L, "일자", "DATE", null, null),
            new ErdDomainSpec(8L, "일시", "DATE", null, 6),
            new ErdDomainSpec(9L, "여부", "BOOLEAN", null, null),
            new ErdDomainSpec(10L, "여부1", "BOOLEAN", 1, null),
            new ErdDomainSpec(11L, "코드", "string", 20, null),
            new ErdDomainSpec(12L, "물리", "VARCHAR2", 30, null));

    /** DOMAINS 와 같은 순서의 기대 물리 타입. */
    static final List<PhysType> EXPECTED = List.of(
            new PhysType("VARCHAR2", 100, null),
            new PhysType("CLOB", null, null),
            new PhysType("NUMBER", 15, 2),
            new PhysType("NUMBER", 19, 0),
            new PhysType("NUMBER", null, null),
            new PhysType("NUMBER", 38, 4),
            new PhysType("DATE", null, null),
            new PhysType("TIMESTAMP(6)", null, null),
            new PhysType("VARCHAR2", 1, null),
            new PhysType("VARCHAR2", 1, null),
            new PhysType("VARCHAR2", 20, null),
            new PhysType("VARCHAR2", 30, null));

    private static final Pattern TIMESTAMP = Pattern.compile("^TIMESTAMP\\((\\d+)\\)$");

    /**
     * 그 물리 타입으로 DDL 을 만든 컬럼을 ErdDbMetaReader 가 읽은 모양. VARCHAR2(n CHAR) → length n, NUMBER(p,s) → precision p·scale s,
     * NUMBER → 둘 다 null, TIMESTAMP(n) → scale n, DATE·CLOB → 모두 null(ErdDbMetaReaderTest 의 V1 실측과 같다).
     * 실제 Oracle 왕복은 api 의 ErdTypeMappingOracleTest 가 확인한다.
     */
    static ErdDbMeta.Column reported(String name, int position, PhysType p, boolean nullable) {
        String t = p.dataType();
        if (ErdTypeMapping.CHAR_TYPES.contains(t)) {
            return new ErdDbMeta.Column(name, position, t, p.length(), null, null, nullable, null, null);
        }
        if ("NUMBER".equals(t)) return new ErdDbMeta.Column(name, position, t, null, p.length(), p.scale(), nullable, null, null);
        Matcher ts = TIMESTAMP.matcher(t);
        Integer scale = ts.matches() ? Integer.valueOf(ts.group(1)) : null;
        return new ErdDbMeta.Column(name, position, t, null, null, scale, nullable, null, null);
    }

    static ErdColumn col(PhysType p) {
        ErdColumn c = new ErdColumn();
        c.dataType = p.dataType();
        c.length = p.length();
        c.scale = p.scale();
        return c;
    }

    static ErdDictionary dict(Set<String> columnPhys) {
        Map<Long, ErdDomainSpec> byId = DOMAINS.stream()
                .collect(Collectors.toMap(ErdDomainSpec::domainId, Function.identity()));
        return new ErdDictionary(TermDictionary.of(List.of()), columnPhys, Set.of(), byId, List.of());
    }

    @Test
    void physicalOfFollowsMappingTable() {
        for (int i = 0; i < DOMAINS.size(); i++) {
            assertThat(ErdTypeMapping.physicalOf(DOMAINS.get(i))).as(DOMAINS.get(i).toString()).isEqualTo(EXPECTED.get(i));
        }
        assertThat(ErdTypeMapping.physicalOf(null, 10, null)).isEqualTo(new PhysType(null, 10, null));
        assertThat(ErdTypeMapping.physicalOf(" Date ", null, 3)).isEqualTo(new PhysType("TIMESTAMP(3)", null, null));
    }

    /** Review Focus 7: sameType(physicalOf(d), d) 가 늘 참이고, 가져오기 typeOf 표현과 같아서 DB_DIFF 가 비어 있다. */
    @Test
    void physicalOfRoundTripsThroughJudgeAndImport() {
        for (ErdDomainSpec d : DOMAINS) {
            PhysType p = ErdTypeMapping.physicalOf(d);
            assertThat(ErdTypeMapping.sameType(col(p), d.dataType(), d.length(), d.scale())).as("판정 " + d).isTrue();
            ErdImportBuilder.ColumnType back = ErdImportBuilder.typeOf(reported("X", 1, p, true));
            assertThat(new PhysType(back.dataType(), back.length(), back.scale())).as("가져오기 " + d).isEqualTo(p);
        }

        // 엔진이 도메인으로 컬럼을 만들고(copyDomain), 같은 타입으로 만든 DB 표와 비교하면 차이가 없고 판정도 모두 OK 다.
        List<ErdCommand> cmds = new ArrayList<>();
        cmds.add(new AddTable("t-1", "TB_TYPE_MAP", "타입 대응", ""));
        for (ErdDomainSpec d : DOMAINS) {
            cmds.add(new AddColumn("c-" + d.domainId(), "t-1", "COL_" + d.domainId(), "컬럼" + d.domainId(), d.domainId(),
                    null, null, null, d.domainId() % 2 == 0, null, "", null));
        }
        ErdDictionary dict = dict(DOMAINS.stream().map(d -> "COL_" + d.domainId()).collect(Collectors.toSet()));
        var out = new ErdCommandEngine(dict).apply(ErdModel.empty("m", "S"), 0, 1, "s", cmds);
        assertThat(out).as(out.toString()).isInstanceOf(ApplyOutcome.Applied.class);
        ErdModel m = ((ApplyOutcome.Applied) out).next();
        assertThat(m.columns.get("c-1").dataType).isEqualTo("VARCHAR2");   // deferred 42: STRING 을 그대로 복사하지 않는다
        assertThat(m.columns.get("c-2").dataType).isEqualTo("CLOB");

        List<ErdDbMeta.Column> dbCols = new ArrayList<>();
        int pos = 1;
        for (String cid : m.tables.get("t-1").columnOrder) {
            ErdColumn c = m.columns.get(cid);
            dbCols.add(reported(c.phys, pos++, new PhysType(c.dataType, c.length, c.scale), !c.notNull));
        }
        ErdDbMeta meta = new ErdDbMeta("S", List.of(new ErdDbMeta.Table("TB_TYPE_MAP", "타입 대응", dbCols)), List.of(), List.of());
        assertThat(ErdDbDiff.diff(m, meta)).isEmpty();
        assertThat(ErdStandardJudge.judge(m, dict)).hasSize(DOMAINS.size())
                .allSatisfy((id, s) -> assertThat(s).as(id).isEqualTo(ErdColumnStatus.OK));
    }

    @Test
    void applyDomainWritesPhysicalTypeAndGivenTypeIsKept() {
        var engine = new ErdCommandEngine(dict(Set.of()));
        ErdModel m = ((ApplyOutcome.Applied) engine.apply(ErdModel.empty("m", "S"), 0, 1, "s", List.of(
                new AddTable("t-1", "TB_A", "에이", ""),
                new AddColumn("c-a", "t-1", "A_DT", "에이일시", null, "VARCHAR2", 8, null, false, null, "", null),
                new AddColumn("c-b", "t-1", "B_NO", "비번호", 3L, "NUMBER", 5, 0, false, null, "", null)))).next();
        assertThat(m.columns.get("c-b").length).isEqualTo(5);   // 타입을 준 addColumn 은 도메인을 복사하지 않는다(단계 0 그대로)
        ErdModel after = ((ApplyOutcome.Applied) engine.apply(m, 1, 2, "s", List.of(new ApplyDomain("c-a", 8L)))).next();
        ErdColumn a = after.columns.get("c-a");
        assertThat(a.domainId).isEqualTo(8L);
        assertThat(a.dataType).isEqualTo("TIMESTAMP(6)");
        assertThat(a.length).isNull();
        assertThat(a.scale).isNull();
    }

    @Test
    void clobMatchesStringDomainWithoutLength() {
        assertThat(ErdTypeMapping.sameType(col(new PhysType("CLOB", null, null)), "STRING", null, null)).isTrue();
        assertThat(ErdTypeMapping.sameType(col(new PhysType("CLOB", null, null)), "STRING", 4000, null)).isFalse();
        assertThat(ErdTypeMapping.sameType(col(new PhysType("NCLOB", null, null)), "STRING", null, null)).isFalse();
        assertThat(ErdTypeMapping.sameType(col(new PhysType("VARCHAR2", 255, null)), "STRING", null, null)).isTrue();
    }

    @Test
    void numberDomainWithoutPrecisionComparesScaleOnly() {
        assertThat(ErdTypeMapping.sameType(col(new PhysType("NUMBER", 38, 4)), "NUMBER", null, 4)).isTrue();
        assertThat(ErdTypeMapping.sameType(col(new PhysType("NUMBER", 12, 4)), "NUMBER", null, 4)).isTrue();
        assertThat(ErdTypeMapping.sameType(col(new PhysType("NUMBER", 12, 2)), "NUMBER", null, 4)).isFalse();
        assertThat(ErdTypeMapping.sameType(col(new PhysType("NUMBER", 12, null)), "NUMBER", null, 0)).isTrue();  // NUMBER(12) = NUMBER(12,0)
        assertThat(ErdTypeMapping.sameType(col(new PhysType("NUMBER", null, null)), "NUMBER", null, null)).isTrue();
        assertThat(ErdTypeMapping.sameType(col(new PhysType("FLOAT", 12, null)), "NUMBER", null, 0)).isFalse();
    }
}
```

`ET/standard/ErdStandardJudgeTest.java` 의 `sameType` 시험 7개는 자리를 옮기지 않고 부르는 클래스 이름만 바꾼다(같은 패키지라 import 는 필요 없다).

```bash
perl -pi -e 's/ErdStandardJudge\.sameType\(/ErdTypeMapping.sameType(/g' \
  lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/standard/ErdStandardJudgeTest.java
grep -c 'ErdTypeMapping.sameType(' lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/standard/ErdStandardJudgeTest.java
```

Expected: 마지막 줄이 `25`.

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `../gradlew :lib:test --max-workers=2 --tests '*ErdTypeMappingTest' --tests '*ErdStandardJudgeTest'`
Expected: 컴파일 실패(`ErdTypeMapping` 이 없다).

- [ ] **Step 3: 구현 — `E/standard/ErdTypeMapping.java`**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdDomainSpec;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 도메인 타입(STRING·NUMBER·DATE·BOOLEAN) → Oracle 물리 타입 대응(physicalOf)과, 모델 컬럼이 도메인에 맞는지 보는 비교(sameType).
 * 둘을 한 파일에 둔다(S2-3, deferred 42) — 어긋나면 엔진이 도메인으로 만든 컬럼이 곧바로 DOMAIN·TYPE 위반이 된다.
 *
 * <p>쓰는 곳: 엔진 copyDomain(addColumn·applyDomain), 표준 판정(ErdStandardJudge), 미리보기(ErdEditService.previewStatus),
 * 다음 단계의 DDL 생성(P3). 물리 타입 표현은 가져오기(ErdImportBuilder.typeOf)와 같다 — TIMESTAMP 는 "TIMESTAMP(n)" 글자에
 * 길이·소수 null, NUMBER(p) 는 (p, 0) 이다. 그래야 DDL 로 만든 표를 다시 가져와도 DB_DIFF 가 비어 있다.
 */
public final class ErdTypeMapping {

    /** 모델 컬럼의 물리 타입 세 값. */
    public record PhysType(String dataType, Integer length, Integer scale) {}

    /** STRING 도메인에 맞는 문자 타입. RAW 는 바이트라 넣지 않는다. */
    static final Set<String> CHAR_TYPES = Set.of("VARCHAR2", "NVARCHAR2", "VARCHAR", "CHAR", "NCHAR");
    /** 정밀도 없이 소수만 있는 NUMBER 도메인에 주는 정밀도(Oracle NUMBER(*,s) 의 정밀도). DDL 은 NUMBER(38,s) 로 쓴다. */
    public static final int NUMBER_MAX_PRECISION = 38;
    private static final Pattern TIMESTAMP = Pattern.compile("^TIMESTAMP\\((\\d+)\\)$");

    private ErdTypeMapping() {
    }

    public static PhysType physicalOf(ErdDomainSpec d) {
        return physicalOf(d.dataType(), d.length(), d.scale());
    }

    /**
     * 도메인 타입 → 물리 타입. 이름은 앞뒤 공백을 지우고 대문자로 맞춰 고른다. 네 논리 타입이 아니면(이미 물리 타입이거나 모르는 타입)
     * 받은 값을 그대로 돌려준다.
     */
    public static PhysType physicalOf(String dataType, Integer length, Integer scale) {
        if (dataType == null) return new PhysType(null, length, scale);
        return switch (dataType.strip().toUpperCase(Locale.ROOT)) {
            case "STRING" -> length == null ? new PhysType("CLOB", null, null) : new PhysType("VARCHAR2", length, null);
            case "NUMBER" -> {
                if (length == null && scale == null) yield new PhysType("NUMBER", null, null);
                if (length == null) yield new PhysType("NUMBER", NUMBER_MAX_PRECISION, scale);
                yield new PhysType("NUMBER", length, scale == null ? 0 : scale);
            }
            case "DATE" -> scale == null ? new PhysType("DATE", null, null) : new PhysType("TIMESTAMP(" + scale + ")", null, null);
            case "BOOLEAN" -> new PhysType("VARCHAR2", 1, null);
            default -> new PhysType(dataType, length, scale);
        };
    }

    /**
     * 모델 컬럼 타입(Oracle 물리 타입)이 도메인 타입에 맞는지 본다. 표준 판정·미리보기·확정 검사·엔진 경고가 모두 이 함수로 비교한다.
     * <ul>
     *   <li>세 값(타입·길이·소수)이 그대로 같으면 맞다 — 물리 타입으로 만든 도메인, 옛 모델에 남은 논리 타입 컬럼.</li>
     *   <li>STRING ↔ 문자 타입. 길이(글자 수)가 같아야 하고, 도메인 길이가 없으면 길이를 보지 않는다. 길이 없는 STRING 은 CLOB 도 맞다.</li>
     *   <li>NUMBER ↔ NUMBER. 정밀도·소수가 같아야 한다. 정밀도가 있는 컬럼의 소수 null 은 0 이다(NUMBER(p) = NUMBER(p,0)).
     *       도메인에 정밀도·소수가 모두 없으면 어떤 NUMBER 든 맞고, 소수만 있으면 소수만 본다.</li>
     *   <li>DATE(scale 없음) ↔ DATE, DATE(scale n) ↔ TIMESTAMP(n). WITH TIME ZONE 계열은 맞지 않는다.</li>
     *   <li>BOOLEAN ↔ 길이 1 문자 타입(Y/N) — DMES 의 _YN 컬럼 관례 VARCHAR2(1 CHAR).</li>
     * </ul>
     */
    public static boolean sameType(ErdColumn c, String dataType, Integer length, Integer scale) {
        if (Objects.equals(c.dataType, dataType) && Objects.equals(c.length, length) && Objects.equals(c.scale, scale)) {
            return true;
        }
        if (c.dataType == null || dataType == null) return false;
        String phys = c.dataType.strip().toUpperCase(Locale.ROOT);
        return switch (dataType.strip().toUpperCase(Locale.ROOT)) {
            case "STRING" -> CHAR_TYPES.contains(phys) && (length == null || length.equals(c.length))
                    || "CLOB".equals(phys) && length == null;
            case "NUMBER" -> "NUMBER".equals(phys) && numberMatches(c, length, scale);
            case "DATE" -> scale == null ? "DATE".equals(phys) : Integer.valueOf(scale).equals(timestampScale(phys));
            case "BOOLEAN" -> CHAR_TYPES.contains(phys) && Integer.valueOf(1).equals(c.length);
            default -> false;
        };
    }

    private static boolean numberMatches(ErdColumn c, Integer length, Integer scale) {
        if (length == null && scale == null) return true;
        // 정밀도가 있는 컬럼의 scale null 은 0 이다. 정밀도 없는 NUMBER 의 scale null 은 "제한 없음" 이라 0 으로 보지 않는다.
        Integer colScale = c.length != null && c.scale == null ? Integer.valueOf(0) : c.scale;
        if (length == null) return scale.equals(colScale);
        return length.equals(c.length) && (scale == null ? 0 : scale) == (colScale == null ? 0 : colScale);
    }

    /** {@code TIMESTAMP(n)} 의 n. 가져오기는 ALL_TAB_COLUMNS.DATA_TYPE 문자열을 그대로 두므로 여기서 푼다. */
    private static Integer timestampScale(String phys) {
        Matcher m = TIMESTAMP.matcher(phys);
        return m.matches() ? Integer.valueOf(m.group(1)) : null;
    }
}
```

- [ ] **Step 4: 구현 — `E/standard/ErdStandardJudge.java` 를 아래 전체로 바꾼다**

`sameType`·`zeroIfNull`·`timestampScale`·`CHAR_TYPES`·`TIMESTAMP` 를 지우고 `judge` 가 `ErdTypeMapping.sameType` 을 부른다. 쓰지 않게 된 import(`Locale`·`Objects`·`Matcher`·`Pattern`)도 지운다.

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/** 컬럼 표준 판정(스펙 2.1-3). 저장하지 않고 읽을 때 계산한다. 도메인 타입 비교는 {@link ErdTypeMapping#sameType} 이 한다(S2-3). */
public final class ErdStandardJudge {

    private ErdStandardJudge() {
    }

    public static Map<String, ErdColumnStatus> judge(ErdModel m, ErdDictionary d) {
        return judge(m, d, m.columns.keySet());
    }

    public static Map<String, ErdColumnStatus> judge(ErdModel m, ErdDictionary d, Collection<String> columnIds) {
        Map<String, Set<String>> typesByPhys = new HashMap<>();
        for (ErdColumn c : m.columns.values()) {
            typesByPhys.computeIfAbsent(c.phys, k -> new HashSet<>()).add(typeKey(c));
        }
        Map<String, ErdColumnStatus> out = new LinkedHashMap<>();
        for (String id : columnIds) {
            ErdColumn c = m.columns.get(id);
            if (c == null) continue;
            ErdColumnStatus s;
            if (d.columnPhys.contains(c.phys)) s = ErdColumnStatus.OK;
            else if (d.aliasPhys.contains(c.phys)) s = ErdColumnStatus.ALIAS;
            else if (d.reverse(c.phys).placeholder()) s = ErdColumnStatus.MISS;
            else s = ErdColumnStatus.NEW;
            if (c.domainId != null) {
                var dom = d.domain(c.domainId);
                if (dom.isPresent() && !ErdTypeMapping.sameType(c, dom.get().dataType(), dom.get().length(), dom.get().scale())) {
                    s = s.worse(ErdColumnStatus.DOMAIN);
                }
            }
            if (typesByPhys.getOrDefault(c.phys, Set.of()).size() > 1) s = s.worse(ErdColumnStatus.TYPE);
            out.put(id, s);
        }
        return out;
    }

    static String typeKey(ErdColumn c) {
        return c.dataType + "(" + c.length + "," + c.scale + ")";
    }
}
```

- [ ] **Step 5: 구현 — `E/engine/ErdCommandEngine.java` 의 `copyDomain`**

import 블록의 `import com.dongkuk.dmes.mdm.dma.erdEdit.model.*;` 다음 줄에 한 줄을 더한다.

```java
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdTypeMapping;
```

`copyDomain` 메서드 전체(지금 292~296행)를 아래로 바꾼다.

```java
    /** 도메인 타입을 물리 타입으로 바꿔 넣는다(S2-3, deferred 42). STRING 을 그대로 넣으면 TYPE 판정·DB 차이·DDL 이 틀린다. */
    static void copyDomain(ErdColumn col, ErdDomainSpec d) {
        ErdTypeMapping.PhysType p = ErdTypeMapping.physicalOf(d);
        col.dataType = p.dataType();
        col.length = p.length();
        col.scale = p.scale();
    }
```

- [ ] **Step 6: 단위 시험 통과 확인**

Run: `../gradlew :lib:test --max-workers=2 --tests '*ErdTypeMappingTest' --tests '*ErdStandardJudgeTest' --tests '*ErdCommandEngine*' --tests '*ErdImportBuilderTest' --tests '*ErdDbDiffTest'`
Expected: 모두 PASS. `ErdTypeMappingTest` 5건이 새로 돈다. `ErdStandardJudgeTest` 는 기존 건수 그대로 PASS 다. 옛 규칙의 경우는 새 규칙에서도 결과가 같다.

- [ ] **Step 7: 실제 Oracle 왕복 시험 작성 — `AT/ErdTypeMappingOracleTest.java`**

단위 시험의 `reported` 는 Oracle 이 보고하는 모양을 흉내 낸 것이다. 이 시험은 대응표의 물리 타입으로 시험 PDB 에 표를 만들고 `ErdDbMetaReader` 로 다시 읽어 `typeOf` 가 `physicalOf` 와 같은지 본다. `NUMBER(38,4)` 의 정밀도처럼 흉내로는 확인할 수 없는 값을 여기서 확인한다. `ErdDbMetaReaderTest` 와 같은 어노테이션이라 스프링 문맥을 나눠 쓴다.

```java
package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMetaReader;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdDomainSpec;
import com.dongkuk.dmes.mdm.dma.erdEdit.importing.ErdImportBuilder;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdTypeMapping;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdTypeMapping.PhysType;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** S2-3 실측: physicalOf 로 DDL 을 만들고 다시 가져오면 같은 물리 타입이 나온다(DB_DIFF 0 의 근거). MDMAPUSER 에 시험 표 하나만 만든다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class ErdTypeMappingOracleTest extends AbstractMdmSharedDbTest {

    static final String TABLE = "TB_ERD_TYPE_MAP";

    static final List<ErdDomainSpec> DOMAINS = List.of(
            new ErdDomainSpec(1L, "명", "STRING", 100, null),
            new ErdDomainSpec(2L, "긴글", "STRING", null, null),
            new ErdDomainSpec(3L, "금액", "NUMBER", 15, 2),
            new ErdDomainSpec(4L, "순번", "NUMBER", 19, null),
            new ErdDomainSpec(5L, "수", "NUMBER", null, null),
            new ErdDomainSpec(6L, "비율", "NUMBER", null, 4),
            new ErdDomainSpec(7L, "일자", "DATE", null, null),
            new ErdDomainSpec(8L, "일시", "DATE", null, 6),
            new ErdDomainSpec(9L, "여부", "BOOLEAN", null, null));

    @Autowired ErdDbMetaReader reader;
    @Autowired JdbcTemplate jdbc;

    /** P3 의 DDL 생성기가 쓸 글자와 같다: 문자 길이는 CHAR 의미, NUMBER 는 정밀도가 있으면 (p,s). */
    static String ddl(PhysType p) {
        if ("VARCHAR2".equals(p.dataType())) return "VARCHAR2(" + p.length() + " CHAR)";
        if ("NUMBER".equals(p.dataType())) return p.length() == null ? "NUMBER" : "NUMBER(" + p.length() + "," + p.scale() + ")";
        return p.dataType();   // DATE · CLOB · TIMESTAMP(n)
    }

    @Test
    void physicalTypesSurviveOracleDdlRoundTrip() {
        drop();
        try {
            List<String> cols = new ArrayList<>();
            for (int i = 0; i < DOMAINS.size(); i++) cols.add("C" + i + " " + ddl(ErdTypeMapping.physicalOf(DOMAINS.get(i))));
            jdbc.execute("CREATE TABLE " + TABLE + " (" + String.join(", ", cols) + ")");
            ErdDbMeta.Table t = reader.read("MDMAPUSER").tables().stream()
                    .filter(x -> x.name().equals(TABLE)).findFirst().orElseThrow();
            for (int i = 0; i < DOMAINS.size(); i++) {
                String name = "C" + i;
                ErdDbMeta.Column c = t.columns().stream().filter(x -> x.name().equals(name)).findFirst().orElseThrow();
                ErdImportBuilder.ColumnType back = ErdImportBuilder.typeOf(c);
                assertThat(new PhysType(back.dataType(), back.length(), back.scale()))
                        .as(DOMAINS.get(i) + " → " + c).isEqualTo(ErdTypeMapping.physicalOf(DOMAINS.get(i)));
            }
        } finally {
            drop();
        }
    }

    void drop() {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME = ?", Integer.class, TABLE);
        if (n != null && n > 0) jdbc.execute("DROP TABLE " + TABLE + " PURGE");
    }
}
```

- [ ] **Step 8: Oracle 시험 실행 — 새 시험과 판정을 쓰는 기존 시험**

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdTypeMappingOracleTest' --tests '*ErdReadKindsTest' --tests '*ErdImportTest' --tests '*ErdVersionServiceTest' --tests '*ErdConcurrentSaveHttpTest'`
Expected: 모두 PASS. `ErdTypeMappingOracleTest` 1건이 새로 돈다.

`ErdTypeMappingOracleTest` 가 실패하면 실패 문구에 Oracle 이 보고한 컬럼(`→` 뒤)과 기대 값이 나온다. 이때는 시험을 고치지 않고 `physicalOf` 를 Oracle 의 보고 모양에 맞춘다. 예를 들어 `NUMBER(38,4)` 의 precision 이 null 로 오면 `NUMBER`(없음, s) 대응을 `(NUMBER, null, s)` 로 바꾸고 `EXPECTED` 의 6번째 값을 같이 고친다. `numberMatches` 의 "소수만 본다" 규칙은 그대로 둔다. 바꾼 내용은 레인 보고에 한 줄로 적는다.

- [ ] **Step 9: lib 서버 레인 시험 하나 더 — 전달 큐**

Run: `../gradlew :lib:test --max-workers=2 --tests '*ErdEventHubQueueTest'`
Expected: 3건 PASS(README "착수 전": 서버 레인은 머지 전마다 이 시험과 `ErdConcurrentSaveHttpTest` 를 다시 돈다. 후자는 Step 8 에서 돌았다).

- [ ] **Step 10: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/standard \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/engine/ErdCommandEngine.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/standard \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/ErdTypeMappingOracleTest.java
/usr/bin/git commit -F - <<'EOF'
feat(erd): 도메인 → 물리 타입 대응 ErdTypeMapping, sameType 이동·CLOB 판정, copyDomain 대응(S2-3, deferred 42)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

---

### Task 2: 엔진 규칙 — 삭제 충돌(31), 빈 되돌리기(S2-24), `touchedTables`(25), `schemaVersion`(32), 식별 전환(29), 중복 관계(30)

**Files:**
- Modify: `E/engine/ApplyOutcome.java` (`Applied.touchedTables`)
- Modify: `E/engine/ErdCommandEngine.java` (`apply`·`dispatch`·`deleteTable`·`deleteColumn`·`deleteKey`·`setPrimaryKey` 한 줄·`restore`·`patchExisting`)
- Modify: `E/engine/ErdRelationOps.java` (전체 교체: `add`·`update`·`delete`)
- Modify: `E/model/ErdModelCodec.java` (`read`)
- Test: `ET/engine/ErdCommandEngineCascadeConflictTest.java`(새), `ET/engine/ErdCommandEngineRelationRulesTest.java`(새), `ET/engine/ErdCommandEngineRelationTest.java`(시험 1개 교체), `ET/model/ErdModelCodecTest.java`(시험 1개 추가)

**Interfaces:**
- Consumes: 단계 0 엔진(`Ctx.checkConflict`·`Ctx.touch`·`Ctx.stamp`, `ErdRejection` 의 10인자 보조 생성자). `ErdRejection.java` 는 BE2 가 `byUserId` 를 더하는 파일이라 고치지 않고 보조 생성자만 쓴다(`Ctx.invalid`·`Ctx.conflict` 가 이미 그렇게 만든다).
- Produces (README 정본 그대로):
  - `ApplyOutcome.Applied(ErdModel next, List<ErdChange> changes, List<ErdCommand> inverse, List<ErdWarning> warnings, List<String> touchedTables)`. `touchedTables` 는 정렬되고 중복이 없다. BE2 Task 4·5 의 서비스가 CLAIMED 경고와 MCP·CLI 접속자 `selectedTables` 를 이 목록으로 만든다.
  - 거절 모양(서비스가 그대로 응답에 싣는다):

| 규칙 | code | elementId · property | message · hint |
|---|---|---|---|
| 31 딸린 요소 충돌 | `CONFLICT` | 딸린 요소 id · 그 요소에서 남이 고친 속성 | 단계 0 `checkConflict` 문구 그대로("다른 세션(s)이 rev n 에서 먼저 고쳤습니다" / "getChangesSince(b) 로 최신 값을 읽고 다시 보내세요"). `byRev`·`bySession`·`current` 를 채운다 |
| S2-24 빈 되돌리기 | `INVALID` | null · null | "되돌릴 변경이 없습니다. 이미 되돌렸거나 값이 같습니다" / "변경 기록에서 다른 rev 를 고르세요" |
| 30 중복 관계 | `INVALID` | 기존 관계 id · null | "같은 자식·부모·컬럼 짝의 관계가 이미 있습니다: r-…(상태)" / "confirmRelation 또는 updateRelation 으로 기존 관계를 쓰세요" |
| 30 parentRef.columns | `INVALID` | 새 관계 id · `parentRef` | "parentRef.columns 가 pairs 의 부모 컬럼과 다릅니다" / "parentRef.columns 를 pairs 의 부모 쪽과 같은 순서로 넣거나 비워 두세요" |
| 32 schemaVersion | 예외 | — | `IllegalStateException("모델 JSON schemaVersion 을 모릅니다: n")` |

이 Task 에서 정하는 규칙:

| 항목 | 규칙 |
|---|---|
| 31 범위 | `deleteTable`·`deleteColumn` 이 지우는 컬럼·키·관계와, 크기를 줄이는 키의 `_rev` 모든 속성에 단계 0 규칙(`rev > baseRev` 이고 다른 세션)을 쓴다. 단독 `deleteColumn` 이 고치는 표 `columnOrder` 는 보지 않는다. 남이 같은 표에 컬럼을 더한 뒤 다른 컬럼을 지우는 일은 통과한다. `deleteTable` 은 단계 0 부터 표 자신의 모든 속성(`columnOrder` 포함)을 본다 |
| 31 구현 | `deleteColumn`·`deleteKey`·`ErdRelationOps.delete` 의 `checkConflict` 인자를 없애고 늘 검사한다. 같은 묶음의 앞 명령이 찍은 rev 는 같은 세션이라 걸리지 않는다 |
| S2-24 | `restore` 명령 하나가 지우거나 만들거나 고친 요소가 하나도 없으면 INVALID 다. 모델 명령이 없는 되돌리기(다이어그램만)는 엔진을 부르지 않으므로 이 규칙에 걸리지 않는다 |
| 25 | `touchedTables` = 표 변경의 표 id ∪ 컬럼·키의 `table` ∪ 관계의 `child`·`parent`. 지운 요소는 지우기 전 값, 만든 요소는 만든 뒤 값으로 본다. 다른 모델 부모(`parent` null)는 뺀다 |
| 29 | `updateRelation` 이 `identifying` 값을 실제로 바꿀 때만 자식 PK 를 맞춘다. 켜면 짝의 자식 컬럼을 PK 끝에 더한다(PK 가 없으면 `setPrimaryKey` 가 `PK_` + 자식 표 물리명으로 만든다). 끄면 PK 에서 뺀다. 같은 자식 표의 다른 식별 관계가 쓰는 컬럼은 남긴다. PK 가 비면 키를 지운다. 모두 `setPrimaryKey` 를 거치므로 NOT NULL·역명령·충돌 검사가 따라온다. 끌 때 NOT NULL 은 되돌리지 않는다 |
| 30 | 같은 자식 표, 같은 부모(같은 모델이면 `parent`, 다른 모델이면 `parentRef` 의 model·table), 같은 짝 집합(순서 무관)의 관계가 있으면 상태와 상관없이 INVALID 다. 짝을 준 경우와 다른 모델 관계는 짝을 다 읽은 뒤, 짝 없이 그린 경우는 `RENAME` 이 아니고 부모 PK 컬럼이 모두 자식에 같은 이름으로 있을 때 이름 겹침 선택(NEEDS_CHOICE) 전에 본다. 검사는 식별 관계 PK 처리 전에 한다 |
| 30 parentRef | `parentRef.columns` 가 null 이면 짝의 부모 쪽으로 채운다. 값이 있고 짝의 부모 쪽(순서 포함)과 다르면 INVALID 다 |
| 32 | `ErdModelCodec.read` 는 `schemaVersion` 이 1 이 아니면 던진다. 쓰기 쪽은 바꾸지 않는다 |

- [ ] **Step 1: 실패하는 시험 작성 — `ET/engine/ErdCommandEngineCascadeConflictTest.java`**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** deferred 31(딸린 요소 삭제의 충돌 검사), S2-24(바뀐 것이 없는 되돌리기), deferred 25(touchedTables). */
class ErdCommandEngineCascadeConflictTest {

    final ErdCommandEngine engine = new ErdCommandEngine(ErdNaming.NONE);

    ApplyOutcome.Applied ok(ErdModel m, long base, long rev, String session, ErdCommand... cmds) {
        var out = engine.apply(m, base, rev, session, List.of(cmds));
        assertThat(out).as("rejected: %s", out instanceof ApplyOutcome.Rejected r ? r.rejection() : null)
                .isInstanceOf(ApplyOutcome.Applied.class);
        return (ApplyOutcome.Applied) out;
    }

    ErdRejection rej(ApplyOutcome out) {
        assertThat(out).isInstanceOf(ApplyOutcome.Rejected.class);
        return ((ApplyOutcome.Rejected) out).rejection();
    }

    /** rev 1(s-a): 부모 TB_P(P_ID PK) · 자식 TB_C(C_ID PK, P_ID, NOTE, UK(NOTE, P_ID)) · 관계 r-1(TB_C.P_ID > TB_P.P_ID). */
    ErdModel base() {
        return ok(ErdModel.empty("mcm", "S"), 0, 1, "s-a",
                new AddTable("t-p", "TB_P", "부모", ""),
                new AddColumn("c-p1", "t-p", "P_ID", "부모아이디", null, "VARCHAR2", 10, null, true, null, "", null),
                new SetPrimaryKey("t-p", List.of("c-p1"), null),
                new AddTable("t-c", "TB_C", "자식", ""),
                new AddColumn("c-c1", "t-c", "C_ID", "자식아이디", null, "VARCHAR2", 10, null, true, null, "", null),
                new AddColumn("c-c2", "t-c", "P_ID", "부모아이디", null, "VARCHAR2", 10, null, false, null, "", null),
                new AddColumn("c-c3", "t-c", "NOTE", "비고", null, "VARCHAR2", 100, null, false, null, "", null),
                new SetPrimaryKey("t-c", List.of("c-c1"), null),
                new AddKey("k-u", "t-c", "UK", "UK_TB_C_NOTE", List.of("c-c3", "c-c2")),
                new AddRelation("r-1", "t-c", "t-p", null, false, List.of(List.of("c-c2", "c-p1")), null, null)).next();
    }

    /** Review Focus 2: 남이 baseRev 뒤에 자식 컬럼 논리명을 바꾼 표를 지우면 CONFLICT 이고 아무것도 지워지지 않는다. */
    @Test
    void deleteTableConflictsWhenPeerChangedChildColumn() {
        ErdModel peer = ok(base(), 1, 2, "s-b", new UpdateColumn("c-c3", Map.of("logical", "메모"))).next();
        ErdRejection r = rej(engine.apply(peer, 1, 3, "s-a", List.of(new DeleteTable("t-c"))));
        assertThat(r.code()).isEqualTo("CONFLICT");
        assertThat(r.elementId()).isEqualTo("c-c3");
        assertThat(r.property()).isEqualTo("logical");
        assertThat(r.byRev()).isEqualTo(2);
        assertThat(r.bySession()).isEqualTo("s-b");
        assertThat(r.current().asText()).isEqualTo("메모");
        assertThat(peer.tables).containsKey("t-c");   // 엔진은 사본에서 일한다 — 넘긴 모델은 그대로다
        assertThat(peer.columns).containsKeys("c-c1", "c-c2", "c-c3");
        assertThat(peer.relations).containsKey("r-1");
    }

    @Test
    void deleteParentTableConflictsWhenPeerDecidedRelation() {
        ErdModel peer = ok(base(), 1, 2, "s-b", new RejectRelation("r-1")).next();
        ErdRejection r = rej(engine.apply(peer, 1, 3, "s-a", List.of(new DeleteTable("t-p"))));
        assertThat(r.code()).isEqualTo("CONFLICT");
        assertThat(r.elementId()).isEqualTo("r-1");
        assertThat(r.property()).isEqualTo("state");
        assertThat(r.bySession()).isEqualTo("s-b");
    }

    @Test
    void deleteColumnConflictsWhenPeerChangedKeyColumns() {
        ErdModel peer = ok(base(), 1, 2, "s-b", new UpdateKey("k-u", Map.of("columns", List.of("c-c2", "c-c3")))).next();
        ErdRejection r = rej(engine.apply(peer, 1, 3, "s-a", List.of(new DeleteColumn("c-c3"))));
        assertThat(r.code()).isEqualTo("CONFLICT");
        assertThat(r.elementId()).isEqualTo("k-u");
        assertThat(r.property()).isEqualTo("columns");
        assertThat(r.byRev()).isEqualTo(2);
    }

    @Test
    void cascadePassesForOwnOrOlderChanges() {
        ErdModel mine = ok(base(), 1, 2, "s-a", new UpdateColumn("c-c3", Map.of("logical", "메모"))).next();
        assertThat(ok(mine, 1, 3, "s-a", new DeleteTable("t-c")).next().tables).doesNotContainKey("t-c");
        ErdModel peer = ok(base(), 1, 2, "s-b", new UpdateColumn("c-c3", Map.of("logical", "메모"))).next();
        assertThat(ok(peer, 2, 3, "s-a", new DeleteTable("t-c")).next().tables).doesNotContainKey("t-c");
    }

    /** 남이 같은 표에 컬럼을 더해 columnOrder 가 바뀌어도 다른 컬럼 삭제는 통과한다(딸린 요소만 본다). */
    @Test
    void deleteColumnIgnoresPeerColumnOrderChange() {
        ErdModel peer = ok(base(), 1, 2, "s-b",
                new AddColumn("c-c4", "t-c", "EXTRA", "추가", null, "VARCHAR2", 10, null, false, null, "", null)).next();
        ErdModel m = ok(peer, 1, 3, "s-a", new DeleteColumn("c-c3")).next();
        assertThat(m.tables.get("t-c").columnOrder).containsExactly("c-c1", "c-c2", "c-c4");
        assertThat(m.keys.get("k-u").columns).containsExactly("c-c2");
    }

    /** S2-24: 이미 되돌린 rev 를 다시 되돌리면 빈 rev 를 만들지 않고 INVALID 다. */
    @Test
    void restoreThatChangesNothingIsInvalid() {
        var upd = ok(base(), 1, 2, "s-a", new UpdateColumn("c-c3", Map.of("logical", "메모")));
        var undone = ok(upd.next(), 2, 3, "s-a", upd.inverse().toArray(new ErdCommand[0]));
        assertThat(undone.next().columns.get("c-c3").logical).isEqualTo("비고");
        ErdRejection r = rej(engine.apply(undone.next(), 3, 4, "s-a", upd.inverse()));
        assertThat(r.code()).isEqualTo("INVALID");
        assertThat(r.message()).isEqualTo("되돌릴 변경이 없습니다. 이미 되돌렸거나 값이 같습니다");
        assertThat(r.hint()).isEqualTo("변경 기록에서 다른 rev 를 고르세요");

        var add = ok(base(), 1, 2, "s-a", new AddTable("t-x", "TB_X", "엑스", ""));
        var gone = ok(add.next(), 2, 3, "s-a", add.inverse().toArray(new ErdCommand[0]));
        assertThat(rej(engine.apply(gone.next(), 3, 4, "s-a", add.inverse())).code()).isEqualTo("INVALID");
    }

    /** deferred 25: 컬럼 삭제·키·관계 변경도 걸친 표를 알린다. */
    @Test
    void touchedTablesCoverKeysRelationsAndDeletedColumns() {
        assertThat(ok(base(), 1, 2, "s-a", new DeleteColumn("c-c3")).touchedTables()).containsExactly("t-c");
        assertThat(ok(base(), 1, 2, "s-a", new UpdateKey("k-u", Map.of("name", "UK_TB_C_X"))).touchedTables())
                .containsExactly("t-c");
        assertThat(ok(base(), 1, 2, "s-a", new UpdateRelation("r-1",
                Map.of("cardinality", Map.of("parent", "ZERO_OR_ONE")))).touchedTables()).containsExactly("t-c", "t-p");
        assertThat(ok(base(), 1, 2, "s-a", new DeleteTable("t-p")).touchedTables()).containsExactly("t-c", "t-p");
        assertThat(ok(base(), 1, 2, "s-a", new AddTable("t-x", "TB_X", "엑스", "")).touchedTables()).containsExactly("t-x");
    }
}
```

`ET/model/ErdModelCodecTest.java` 에 시험 하나를 더한다. import 에 `import static org.assertj.core.api.Assertions.assertThatThrownBy;` 를 더하고, `candidateRankIsOptional` 다음에 넣는다.

```java
    /** deferred 32: 모르는 스키마 버전의 모델 JSON 은 읽지 않는다. */
    @Test
    void unknownSchemaVersionIsRejected() {
        assertThatThrownBy(() -> ErdModelCodec.read(JSON.replace("\"schemaVersion\":1", "\"schemaVersion\":2")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("모델 JSON schemaVersion 을 모릅니다: 2");
    }
```

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `../gradlew :lib:test --max-workers=2 --tests '*ErdCommandEngineCascadeConflictTest' --tests '*ErdModelCodecTest'`
Expected: 컴파일 실패(`ApplyOutcome.Applied.touchedTables()` 가 없다).

- [ ] **Step 3: 구현 — `ApplyOutcome`, `ErdModelCodec`**

`E/engine/ApplyOutcome.java` 전체:

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import java.util.List;

/** 명령 묶음의 결과. 묶음은 전부 적용되거나(Applied) 전부 버려진다(Rejected). */
public sealed interface ApplyOutcome {
    /**
     * @param touchedTables 바뀐 요소가 걸친 표 id(정렬, 중복 없음, deferred 25). 표 변경은 그 표, 컬럼·키는 table(지운 요소는 지우기 전 값),
     *                      관계는 child·parent 다. 서비스가 CLAIMED 경고와 MCP·CLI 접속자 selectedTables 를 이 목록으로 만든다.
     */
    record Applied(ErdModel next, List<ErdChange> changes, List<ErdCommand> inverse, List<ErdWarning> warnings,
                   List<String> touchedTables) implements ApplyOutcome {}

    record Rejected(ErdRejection rejection) implements ApplyOutcome {}
}
```

`E/model/ErdModelCodec.java` 의 `private ErdModelCodec() { }` 위에 상수를 더하고, `read` 를 아래로 바꾼다.

```java
    /** 이 코드가 아는 모델 JSON 스키마 버전(ErdModel.schemaVersion). 두 번째 버전이 생기면 여기서 옮겨 읽는다(deferred 32). */
    static final int SCHEMA_VERSION = 1;
```

```java
    public static ErdModel read(String json) {
        ErdModel m;
        try {
            m = MAPPER.readValue(json, ErdModel.class);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("MODEL_JSON 을 읽을 수 없습니다: " + e.getOriginalMessage(), e);
        }
        if (m.schemaVersion != SCHEMA_VERSION) {
            throw new IllegalStateException("모델 JSON schemaVersion 을 모릅니다: " + m.schemaVersion);
        }
        return m;
    }
```

- [ ] **Step 4: 구현 — `E/engine/ErdCommandEngine.java` (31·S2-24·25)**

(1) `apply` 의 `List<ErdChange> changes = new ArrayList<>();` 부터 `apply` 를 닫는 `}` 까지(지금 54~70행)를 아래로 바꾸고, `inverseOf` 앞에 `touchedTables`·`addText` 를 더한다.

```java
        List<ErdChange> changes = new ArrayList<>();
        List<ErdChange> restore = new ArrayList<>();
        List<String> touchedColumns = new ArrayList<>();
        Set<String> touchedTables = new TreeSet<>();
        for (var e : c.before.entrySet()) {
            String kind = e.getKey().kind(), id = e.getKey().id();
            JsonNode before = e.getValue();
            JsonNode after = c.snapshot(kind, id);
            changes.add(new ErdChange(kind, id, after == null ? ErdChange.DELETE : ErdChange.UPSERT, after));
            ErdChange back = inverseOf(kind, id, before, after);
            if (back != null) restore.add(back);
            if (kind.equals("column") && after != null) touchedColumns.add(id);
            touchedTables(kind, id, before, after, touchedTables);
        }
        List<ErdWarning> warnings = new ArrayList<>(naming.warnings(c.m, touchedColumns));
        warnings.addAll(c.warnings);
        List<ErdCommand> inverse = restore.isEmpty() ? List.of() : List.of(new Restore(newRev, restore));
        return new ApplyOutcome.Applied(c.m, changes, inverse, warnings, List.copyOf(touchedTables));
    }

    /** deferred 25: 바뀐 요소가 걸친 표 id. 지운 요소는 지우기 전 값, 만든 요소는 만든 뒤 값으로 본다. 다른 모델 부모(null)는 뺀다. */
    private static void touchedTables(String kind, String id, JsonNode before, JsonNode after, Set<String> out) {
        for (JsonNode n : new JsonNode[] {before, after}) {
            if (n == null) continue;
            switch (kind) {
                case "table" -> out.add(id);
                case "column", "key" -> addText(n, "table", out);
                case "relation" -> {
                    addText(n, "child", out);
                    addText(n, "parent", out);
                }
                default -> { }
            }
        }
    }

    private static void addText(JsonNode n, String field, Set<String> out) {
        JsonNode v = n.get(field);
        if (v != null && v.isTextual()) out.add(v.asText());
    }
```

(2) `dispatch` 의 세 줄을 바꾼다.

```java
            case DeleteColumn d -> deleteColumn(c, d.id());
```
```java
            case DeleteKey d -> deleteKey(c, d.id());
```
```java
            case DeleteRelation d -> ErdRelationOps.delete(c, d.id());
```

(3) `deleteTable` 전체를 아래로 바꾼다.

```java
    void deleteTable(Ctx c, String id) {
        ErdTable t = c.table(id);
        c.checkConflict(t.rev, t.rev.keySet(), id, c.node(t));
        // deferred 31: 딸린 컬럼·키·관계도 지우기 전에 충돌을 본다(deleteColumn·deleteKey·ErdRelationOps.delete 가 늘 검사한다).
        for (String colId : List.copyOf(t.columnOrder)) deleteColumn(c, colId);
        for (var e : List.copyOf(c.m.keys.entrySet())) if (id.equals(e.getValue().table)) deleteKey(c, e.getKey());
        for (var e : List.copyOf(c.m.relations.entrySet())) {
            ErdRelation r = e.getValue();
            if (id.equals(r.child) || id.equals(r.parent)) ErdRelationOps.delete(c, e.getKey());
        }
        c.touch("table", id);
        c.m.tables.remove(id);
        c.m.tombstones.put(id, new PropRev(c.newRev, c.session));
    }
```

(4) `deleteColumn` 전체를 아래로 바꾼다.

```java
    /**
     * 컬럼 삭제. 이 컬럼을 가진 키는 줄이고(비면 지우고), 이 컬럼이 짝에 든 관계는 지운다. deferred 31: 컬럼 자신, 줄이거나 지우는 키,
     * 지우는 관계의 모든 속성에 충돌 규칙을 쓴다. 표 columnOrder 는 보지 않는다 — 남이 같은 표에 컬럼을 더해도 다른 컬럼 삭제는 통과한다.
     */
    void deleteColumn(Ctx c, String id) {
        ErdColumn col = c.column(id);
        c.checkConflict(col.rev, col.rev.keySet(), id, c.node(col));
        for (var e : List.copyOf(c.m.keys.entrySet())) {
            ErdKey k = e.getValue();
            if (!k.columns.contains(id)) continue;
            c.checkConflict(k.rev, k.rev.keySet(), e.getKey(), c.node(k));
            c.touch("key", e.getKey());
            k.columns.remove(id);
            if (k.columns.isEmpty()) deleteKey(c, e.getKey());
            else c.stamp(k.rev, Set.of("columns"));
        }
        for (var e : List.copyOf(c.m.relations.entrySet())) {
            boolean uses = e.getValue().pairs.stream().anyMatch(p -> p.contains(id));
            if (uses) ErdRelationOps.delete(c, e.getKey());
        }
        ErdTable t = c.m.tables.get(col.table);
        c.touch("table", col.table);
        t.columnOrder.remove(id);
        c.stamp(t.rev, Set.of("columnOrder"));
        c.touch("column", id);
        c.m.columns.remove(id);
        c.m.tombstones.put(id, new PropRev(c.newRev, c.session));
    }
```

(5) `setPrimaryKey` 의 `if (keyId != null) deleteKey(c, keyId, true);` 를 `if (keyId != null) deleteKey(c, keyId);` 로 바꾼다.

(6) `deleteKey` 전체를 아래로 바꾼다.

```java
    void deleteKey(Ctx c, String id) {
        ErdKey k = c.key(id);
        c.checkConflict(k.rev, k.rev.keySet(), id, c.node(k));
        c.touch("key", id);
        c.m.keys.remove(id);
        c.m.tombstones.put(id, new PropRev(c.newRev, c.session));
    }
```

(7) `restore` 의 두 번째 `for` 문(적용 루프)부터 메서드 끝까지와 `patchExisting` 전체를 아래로 바꾼다. 첫 번째 `for` 문(입력 검사)은 그대로 둔다.

```java
        boolean changed = false;
        for (ErdChange e : r.elements()) {
            String kind = e.kind(), id = e.id();
            JsonNode now = c.snapshot(kind, id);
            switch (e.op()) {
                case ErdChange.DELETE -> {
                    if (now == null) continue;
                    for (var pr : c.revOf(kind, id).entrySet()) {
                        if (pr.getValue().rev() > r.sinceRev()) {
                            throw restoreConflict(c, id, pr.getKey(), pr.getValue(), now.get(pr.getKey()));
                        }
                    }
                    c.touch(kind, id);
                    c.put(kind, id, null);
                    changed = true;
                }
                case ErdChange.UPSERT -> {
                    if (now == null) {
                        PropRev tomb = c.m.tombstones.get(id);
                        if (tomb != null && tomb.rev() > r.sinceRev()) throw restoreConflict(c, id, null, tomb, null);
                        ObjectNode node = ((ObjectNode) e.value()).deepCopy();
                        node.remove(Ctx.REV);
                        List<String> all = new ArrayList<>();
                        node.fieldNames().forEachRemaining(all::add);
                        c.stampNode(node, all);
                        c.touch(kind, id);
                        c.put(kind, id, node);
                        changed = true;
                    } else {
                        Set<String> props = new LinkedHashSet<>();
                        e.value().fieldNames().forEachRemaining(props::add);
                        now.fieldNames().forEachRemaining(props::add);
                        props.remove(Ctx.REV);
                        changed |= patchExisting(c, r.sinceRev(), kind, id, now, e.value(), props);
                    }
                }
                default -> {  // PATCH
                    if (now == null) {
                        PropRev tomb = c.m.tombstones.get(id);
                        if (tomb != null) throw restoreConflict(c, id, null, tomb, null);
                        throw c.invalid("없는 요소 id 입니다: " + id, "getModelText 로 id 를 확인하세요", id, null);
                    }
                    Set<String> props = new LinkedHashSet<>();
                    e.value().fieldNames().forEachRemaining(props::add);
                    props.remove(Ctx.REV);
                    changed |= patchExisting(c, r.sinceRev(), kind, id, now, e.value(), props);
                }
            }
        }
        // S2-24: 이미 되돌렸거나 값이 같아 바뀐 것이 없으면 빈 rev·빈 기록을 만들지 않는다.
        if (!changed) throw c.invalid("되돌릴 변경이 없습니다. 이미 되돌렸거나 값이 같습니다", "변경 기록에서 다른 rev 를 고르세요", null, null);
    }

    /** @return 바꾼 속성이 있으면 true */
    private static boolean patchExisting(Ctx c, long since, String kind, String id, JsonNode now, JsonNode want,
                                         Set<String> props) {
        ObjectNode node = ((ObjectNode) now).deepCopy();
        Map<String, PropRev> revs = c.revOf(kind, id);
        List<String> changed = new ArrayList<>();
        for (String p : props) {
            JsonNode w = want.get(p) == null ? NullNode.getInstance() : want.get(p);
            JsonNode h = now.get(p) == null ? NullNode.getInstance() : now.get(p);
            if (Ctx.jsonEquals(w, h)) continue;
            PropRev pr = revs.get(p);
            if (pr != null && pr.rev() > since) throw restoreConflict(c, id, p, pr, h);
            node.set(p, w);
            changed.add(p);
        }
        if (changed.isEmpty()) return false;
        c.stampNode(node, changed);
        c.touch(kind, id);
        c.put(kind, id, node);
        return true;
    }
```

`restore` 의 javadoc 목록 끝에 한 줄을 더한다.

```java
     *   <li>바뀐 요소가 하나도 없으면 INVALID(S2-24) — 이미 되돌린 rev 를 다시 되돌릴 때다.</li>
```

(8) `E/engine/ErdRelationOps.java` 의 `delete` 를 아래로 바꾼다(Step 8 의 파일 전체 교체에도 같은 코드가 들어 있다).

```java
    /** deferred 31: 직접 지울 때도, 표·컬럼 삭제에 딸려 지울 때도 충돌을 본다. */
    static void delete(Ctx c, String id) {
        ErdRelation r = c.relation(id);
        c.checkConflict(r.rev, r.rev.keySet(), id, c.node(r));
        c.touch("relation", id);
        c.m.relations.remove(id);
        c.m.tombstones.put(id, new PropRev(c.newRev, c.session));
    }
```

- [ ] **Step 5: 시험 통과 확인과 중간 커밋**

Run: `../gradlew :lib:test --max-workers=2 --tests 'com.dongkuk.dmes.mdm.dma.erdEdit.*'`
Expected: 모두 PASS. `ErdCommandEngineCascadeConflictTest` 7건, `ErdModelCodecTest` 5건. 기존 엔진 시험(`ErdCommandEngineTableColumnTest`·`ErdCommandEngineRelationTest`·`ErdCommandEngineUndoTest`)은 모두 한 세션(`s-a`)이 지우므로 그대로 PASS 다.

```bash
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/engine \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/model/ErdModelCodec.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/engine/ErdCommandEngineCascadeConflictTest.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/model/ErdModelCodecTest.java
/usr/bin/git commit -F - <<'EOF'
fix(erd): 딸린 요소 삭제 충돌 검사·빈 되돌리기 INVALID·touchedTables·schemaVersion 검사(deferred 31·25·32, S2-24)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

- [ ] **Step 6: 실패하는 시험 작성 — `ET/engine/ErdCommandEngineRelationRulesTest.java` 와 기존 시험 교체**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** deferred 29(식별 여부를 바꾸면 자식 PK 가 따라간다), deferred 30(같은 관계 중복 막기, parentRef.columns 일치). */
class ErdCommandEngineRelationRulesTest {

    final ErdCommandEngine engine = new ErdCommandEngine(ErdNaming.NONE);

    ApplyOutcome.Applied ok(ErdModel m, long base, long rev, String session, ErdCommand... cmds) {
        var out = engine.apply(m, base, rev, session, List.of(cmds));
        assertThat(out).as("rejected: %s", out instanceof ApplyOutcome.Rejected r ? r.rejection() : null)
                .isInstanceOf(ApplyOutcome.Applied.class);
        return (ApplyOutcome.Applied) out;
    }

    ErdRejection rej(ApplyOutcome out) {
        assertThat(out).isInstanceOf(ApplyOutcome.Rejected.class);
        return ((ApplyOutcome.Rejected) out).rejection();
    }

    /**
     * rev 1(s-a): TB_ROLE(ROLE_ID PK) · TB_ROLE_MAP(OBJECT_ID, ROLE_ID) · r-1 = 비식별 TB_ROLE_MAP.ROLE_ID > TB_ROLE.ROLE_ID.
     * withChildPk 면 TB_ROLE_MAP 의 PK 는 (OBJECT_ID), 아니면 PK 가 없다.
     */
    ErdModel base(boolean withChildPk) {
        List<ErdCommand> cmds = new ArrayList<>(List.of(
                new AddTable("t-r", "TB_ROLE", "역할", ""),
                new AddColumn("c-r1", "t-r", "ROLE_ID", "역할아이디", null, "VARCHAR2", 30, null, true, null, "", null),
                new SetPrimaryKey("t-r", List.of("c-r1"), null),
                new AddTable("t-m", "TB_ROLE_MAP", "역할매핑", ""),
                new AddColumn("c-m1", "t-m", "OBJECT_ID", "객체아이디", null, "VARCHAR2", 50, null, true, null, "", null),
                new AddColumn("c-m2", "t-m", "ROLE_ID", "역할아이디", null, "VARCHAR2", 30, null, false, null, "", null)));
        if (withChildPk) cmds.add(new SetPrimaryKey("t-m", List.of("c-m1"), null));
        cmds.add(new AddRelation("r-1", "t-m", "t-r", null, false, List.of(List.of("c-m2", "c-r1")), null, null));
        return ok(ErdModel.empty("mcm", "S"), 0, 1, "s-a", cmds.toArray(new ErdCommand[0])).next();
    }

    /** 표의 PK 컬럼 목록. PK 가 없으면 null. */
    static List<String> pk(ErdModel m, String table) {
        return m.keys.values().stream().filter(k -> table.equals(k.table) && "PK".equals(k.kind)).findFirst()
                .map(k -> k.columns).orElse(null);
    }

    // ---- deferred 29 ----

    @Test
    void identifyingOnAddsPairColumnsToChildPkAndUndoRemovesThem() {
        var on = ok(base(true), 1, 2, "s-a", new UpdateRelation("r-1", Map.of("identifying", true)));
        assertThat(pk(on.next(), "t-m")).containsExactly("c-m1", "c-m2");
        assertThat(on.next().columns.get("c-m2").notNull).isTrue();
        assertThat(on.changes()).extracting(ErdChange::kind).containsExactlyInAnyOrder("relation", "key", "column");
        ErdModel back = ok(on.next(), 2, 3, "s-a", on.inverse().toArray(new ErdCommand[0])).next();
        assertThat(pk(back, "t-m")).containsExactly("c-m1");
        assertThat(back.relations.get("r-1").identifying).isFalse();
        assertThat(back.columns.get("c-m2").notNull).isFalse();
    }

    @Test
    void identifyingOnCreatesChildPkWhenMissing() {
        var on = ok(base(false), 1, 2, "s-a", new UpdateRelation("r-1", Map.of("identifying", true)));
        assertThat(on.next().keys.values()).filteredOn(k -> "t-m".equals(k.table)).singleElement().satisfies(k -> {
            assertThat(k.kind).isEqualTo("PK");
            assertThat(k.name).isEqualTo("PK_TB_ROLE_MAP");
            assertThat(k.columns).containsExactly("c-m2");
        });
    }

    @Test
    void identifyingOffRemovesPairColumnsAndDropsEmptyPk() {
        ErdModel on = ok(base(false), 1, 2, "s-a", new UpdateRelation("r-1", Map.of("identifying", true))).next();
        ErdModel off = ok(on, 2, 3, "s-a", new UpdateRelation("r-1", Map.of("identifying", false))).next();
        assertThat(pk(off, "t-m")).isNull();
        ErdModel on2 = ok(base(true), 1, 2, "s-a", new UpdateRelation("r-1", Map.of("identifying", true))).next();
        ErdModel off2 = ok(on2, 2, 3, "s-a", new UpdateRelation("r-1", Map.of("identifying", false))).next();
        assertThat(pk(off2, "t-m")).containsExactly("c-m1");
    }

    /** 같은 자식 컬럼을 다른 식별 관계도 쓰면 PK 에 남긴다. */
    @Test
    void identifyingOffKeepsColumnNeededByAnotherIdentifyingRelation() {
        ErdModel m = ok(base(true), 1, 2, "s-a",
                new AddTable("t-b", "TB_ROLE_B", "역할비", ""),
                new AddColumn("c-b1", "t-b", "ROLE_ID", "역할아이디", null, "VARCHAR2", 30, null, true, null, "", null),
                new UpdateRelation("r-1", Map.of("identifying", true)),
                new AddRelation("r-2", "t-m", "t-b", null, true, List.of(List.of("c-m2", "c-b1")), null, null)).next();
        assertThat(pk(m, "t-m")).containsExactly("c-m1", "c-m2");
        ErdModel off = ok(m, 2, 3, "s-a", new UpdateRelation("r-1", Map.of("identifying", false))).next();
        assertThat(pk(off, "t-m")).containsExactly("c-m1", "c-m2");
    }

    @Test
    void identifyingFlipConflictsWhenPeerChangedChildPk() {
        ErdModel peer = ok(base(true), 1, 2, "s-b",
                new AddColumn("c-m3", "t-m", "SEQ", "순번", null, "NUMBER", 5, 0, true, null, "", null),
                new SetPrimaryKey("t-m", List.of("c-m1", "c-m3"), null)).next();
        ErdRejection r = rej(engine.apply(peer, 1, 3, "s-a", List.of(new UpdateRelation("r-1", Map.of("identifying", true)))));
        assertThat(r.code()).isEqualTo("CONFLICT");
        assertThat(r.property()).isEqualTo("columns");
        assertThat(r.bySession()).isEqualTo("s-b");
    }

    @Test
    void unchangedIdentifyingDoesNotTouchPk() {
        var same = ok(base(true), 1, 2, "s-a", new UpdateRelation("r-1", Map.of("identifying", false)));
        assertThat(same.changes()).extracting(ErdChange::kind).containsExactly("relation");
    }

    // ---- deferred 30 ----

    @Test
    void duplicateRelationIsInvalidEvenWhenRejected() {
        ErdModel m = ok(base(true), 1, 2, "s-a", new RejectRelation("r-1")).next();
        ErdRejection r = rej(engine.apply(m, 2, 3, "s-a",
                List.of(new AddRelation("r-2", "t-m", "t-r", null, false, List.of(List.of("c-m2", "c-r1")), null, null))));
        assertThat(r.code()).isEqualTo("INVALID");
        assertThat(r.elementId()).isEqualTo("r-1");
        assertThat(r.message()).contains("REJECTED");
        assertThat(r.hint()).isEqualTo("confirmRelation 또는 updateRelation 으로 기존 관계를 쓰세요");
        // 짝을 주지 않고 그려도(ASK·REUSE) 같은 관계가 되면 이름 겹침 선택 전에 막는다.
        for (String mode : new String[] {null, "REUSE"}) {
            ErdRejection drawn = rej(engine.apply(m, 2, 3, "s-a",
                    List.of(new AddRelation("r-2", "t-m", "t-r", null, false, null, mode, null))));
            assertThat(drawn.code()).as(String.valueOf(mode)).isEqualTo("INVALID");
            assertThat(drawn.elementId()).isEqualTo("r-1");
        }
        // RENAME 은 새 컬럼을 만드므로 다른 관계다.
        var renamed = ok(m, 2, 3, "s-a", new AddRelation("r-2", "t-m", "t-r", null, false, null, "RENAME", null));
        assertThat(renamed.next().relations).containsKeys("r-1", "r-2");
    }

    @Test
    void pairOrderDoesNotMakeANewRelation() {
        ErdModel m = ok(base(true), 1, 2, "s-a", new AddRelation("r-2", "t-m", "t-r", null, false,
                List.of(List.of("c-m1", "c-r1"), List.of("c-m2", "c-r1")), null, null)).next();
        ErdRejection r = rej(engine.apply(m, 2, 3, "s-a", List.of(new AddRelation("r-3", "t-m", "t-r", null, false,
                List.of(List.of("c-m2", "c-r1"), List.of("c-m1", "c-r1")), null, null))));
        assertThat(r.code()).isEqualTo("INVALID");
        assertThat(r.elementId()).isEqualTo("r-2");
    }

    @Test
    void crossModelParentRefColumnsFollowPairs() {
        ErdModel m = base(true);
        ErdRejection bad = rej(engine.apply(m, 1, 2, "s-a", List.of(new AddRelation("r-x", "t-m", null,
                new ErdParentRefArg("mdm", "t-x", List.of("c-y")), false, List.of(List.of("c-m2", "c-x")), null, null))));
        assertThat(bad.code()).isEqualTo("INVALID");
        assertThat(bad.property()).isEqualTo("parentRef");
        ErdModel withRef = ok(m, 1, 2, "s-a", new AddRelation("r-x", "t-m", null,
                new ErdParentRefArg("mdm", "t-x", null), false, List.of(List.of("c-m2", "c-x")), null, null)).next();
        assertThat(withRef.relations.get("r-x").parentRef.columns()).containsExactly("c-x");
        ErdRejection dup = rej(engine.apply(withRef, 2, 3, "s-a", List.of(new AddRelation("r-y", "t-m", null,
                new ErdParentRefArg("mdm", "t-x", List.of("c-x")), false, List.of(List.of("c-m2", "c-x")), null, null))));
        assertThat(dup.code()).isEqualTo("INVALID");
        assertThat(dup.elementId()).isEqualTo("r-x");
    }
}
```

`ET/engine/ErdCommandEngineRelationTest.java` 의 `updateRelationUndoIsPropertyLevelAndConflictChecked` 는 29 때문에 바뀐 요소가 3개(관계·자식 PK·NOT NULL 이 된 컬럼)가 된다. 메서드 전체를 아래로 바꾼다.

```java
    @Test
    void updateRelationUndoIsPropertyLevelAndConflictChecked() {
        ErdModel m = ((ApplyOutcome.Applied) engine.apply(base(true), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, false, null, "REUSE", null)))).next();
        var upd = (ApplyOutcome.Applied) engine.apply(m, 2, 3, "s-a", List.of(new UpdateRelation("r-1",
                Map.of("identifying", true))));
        // deferred 29: 식별로 바꾸면 자식 짝 컬럼(c-m2)이 자식 PK 에 들어가고 NOT NULL 이 된다.
        assertThat(upd.changes()).extracting(ErdChange::kind).containsExactlyInAnyOrder("relation", "key", "column");
        Restore back = (Restore) upd.inverse().get(0);
        assertThat(back.elements()).filteredOn(e -> e.kind().equals("relation")).singleElement().satisfies(e -> {
            assertThat(e.op()).isEqualTo(ErdChange.PATCH);
            assertThat(e.value().fieldNames()).toIterable().containsExactly("identifying");
        });
        // 다른 세션이 base 이후 고친 속성은 CONFLICT
        assertThat(rej(engine.apply(upd.next(), 2, 4, "s-b", List.of(new UpdateRelation("r-1",
                Map.of("identifying", false))))).code()).isEqualTo("CONFLICT");
        // 되돌리면 원래 값
        ErdModel undone = ((ApplyOutcome.Applied) engine.apply(upd.next(), 3, 4, "s-a", upd.inverse())).next();
        assertThat(undone.relations.get("r-1").identifying).isFalse();
        assertThat(undone.keys.values()).filteredOn(k -> "t-m".equals(k.table) && "PK".equals(k.kind))
                .singleElement().satisfies(k -> assertThat(k.columns).containsExactly("c-m1"));
    }
```

- [ ] **Step 7: 시험이 실패하는지 확인**

Run: `../gradlew :lib:test --max-workers=2 --tests '*ErdCommandEngineRelationRulesTest' --tests '*ErdCommandEngineRelationTest'`
Expected: FAIL. `identifyingOn…` 은 PK 가 `[c-m1]` 그대로라 실패, `duplicateRelationIsInvalidEvenWhenRejected`·`pairOrderDoesNotMakeANewRelation` 은 Applied 가 와서 실패, `crossModelParentRefColumnsFollowPairs` 는 INVALID 가 오지 않아 실패, `updateRelationUndoIsPropertyLevelAndConflictChecked` 는 바뀐 요소가 1개라 실패한다.

- [ ] **Step 8: 구현 — `E/engine/ErdRelationOps.java` 전체 교체와 `dispatch` 한 줄**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.*;
import com.fasterxml.jackson.databind.node.ArrayNode;
import java.util.*;

/** 관계 명령(스펙 4.1·D7·D8). */
final class ErdRelationOps {

    private static final Set<String> PARENT_CARD = Set.of("ONE", "ZERO_OR_ONE");
    private static final Set<String> CHILD_CARD = Set.of("ZERO_OR_MORE", "ONE_OR_MORE", "ZERO_OR_ONE", "ONE");
    private static final Set<String> CLASH_MODES = Set.of("ASK", "REUSE", "RENAME");

    private ErdRelationOps() {
    }

    static void add(ErdCommandEngine e, Ctx c, AddRelation a) {
        String id = c.newIdOrGiven(a.id(), 'r');
        ErdTable child = c.table(a.child());
        boolean cross = a.parentRef() != null;
        boolean dbFk = a.dbFk() == null ? !cross : a.dbFk();
        if (cross && dbFk) {
            throw c.invalid("다른 모델 표와의 관계는 DB FK 로 만들 수 없습니다(ADR 0003)", "dbFk 를 false 로 두세요", id, "dbFk");
        }
        String mode = a.onNameClash() == null ? "ASK" : a.onNameClash();
        if (!CLASH_MODES.contains(mode)) {
            throw c.invalid("onNameClash 값이 틀렸습니다: " + mode, "ASK·REUSE·RENAME 중에서 고르세요", id, "onNameClash");
        }
        List<List<String>> pairs = new ArrayList<>();
        List<String> refColumns = null;
        if (cross) {
            ErdParentRefArg ref = a.parentRef();
            if (isBlank(ref.model()) || isBlank(ref.table())) {
                throw c.invalid("parentRef 에 model·table 이 필요합니다", "다른 모델 id 와 표 id 를 넣으세요", id, "parentRef");
            }
            if (a.pairs() == null || a.pairs().isEmpty()) {
                throw c.invalid("다른 모델 관계는 pairs 가 필요합니다", "[[자식 컬럼 id, 부모 컬럼 id]] 를 넣으세요", id, "pairs");
            }
            for (List<String> p : a.pairs()) {
                requirePair(c, p, id);
                requireColumnOf(c, p.get(0), a.child(), id);
                pairs.add(List.of(p.get(0), p.get(1)));
            }
            // deferred 30: parentRef.columns 는 짝의 부모 쪽(순서 포함)이다. 비우면 채운다.
            refColumns = pairs.stream().map(p -> p.get(1)).toList();
            if (ref.columns() != null && !ref.columns().equals(refColumns)) {
                throw c.invalid("parentRef.columns 가 pairs 의 부모 컬럼과 다릅니다",
                        "parentRef.columns 를 pairs 의 부모 쪽과 같은 순서로 넣거나 비워 두세요", id, "parentRef");
            }
            requireNotDuplicate(c, a.child(), null, ref, pairs);
        } else if (a.pairs() != null && !a.pairs().isEmpty()) {
            c.table(a.parent());
            for (List<String> p : a.pairs()) {
                requirePair(c, p, id);
                requireColumnOf(c, p.get(0), a.child(), id);
                requireColumnOf(c, p.get(1), a.parent(), id);
                pairs.add(List.of(p.get(0), p.get(1)));
            }
            requireNotDuplicate(c, a.child(), a.parent(), null, pairs);
        } else {
            if (a.parent() == null) throw c.invalid("parent 가 필요합니다", "부모 표 id 를 넣으세요", id, "parent");
            ErdTable parent = c.table(a.parent());
            List<String> parentPk = pkColumns(c, a.parent());
            if (parentPk.isEmpty()) {
                throw c.invalid("부모 표에 PK 가 없습니다: " + parent.phys, "부모 표의 PK 를 먼저 정하세요", a.parent(), null);
            }
            ArrayNode clashes = ErdModelCodec.MAPPER.createArrayNode();
            Map<String, String> sameName = new LinkedHashMap<>();
            for (String pcid : parentPk) {
                ErdColumn pc = c.column(pcid);
                child.columnOrder.stream().filter(cid -> pc.phys.equals(c.m.columns.get(cid).phys)).findFirst()
                        .ifPresent(cid -> {
                            sameName.put(pcid, cid);
                            clashes.addObject().put("parentColumn", pcid).put("childColumn", cid).put("phys", pc.phys);
                        });
            }
            // deferred 30: 이름이 모두 겹쳐 REUSE 가 기존 관계와 같아지면 선택을 묻기 전에 막는다(추정 점선 위에 다시 그린 경우).
            if (!mode.equals("RENAME") && sameName.size() == parentPk.size()) {
                List<List<String>> reuse = parentPk.stream().map(p -> List.of(sameName.get(p), p)).toList();
                requireNotDuplicate(c, a.child(), a.parent(), null, reuse);
            }
            if (!sameName.isEmpty() && mode.equals("ASK")) {
                throw c.needsChoice(id, "onNameClash", "자식 표에 같은 이름의 컬럼이 있습니다",
                        "onNameClash 를 REUSE(그 컬럼을 쓴다) 또는 RENAME(접두를 붙여 새로 만든다)으로 다시 보내세요", clashes);
            }
            for (String pcid : parentPk) {
                ErdColumn pc = c.column(pcid);
                String childCol = sameName.get(pcid);
                if (childCol == null || mode.equals("RENAME")) {
                    String phys = childCol == null ? pc.phys : prefix(parent.phys) + "_" + pc.phys;
                    String newId = ErdIds.newId('c');
                    e.addColumn(c, new AddColumn(newId, a.child(), phys, pc.logical, pc.domainId, pc.dataType,
                            pc.length, pc.scale, a.identifying(), null, "", null));
                    childCol = newId;
                }
                pairs.add(List.of(childCol, pcid));
            }
        }
        if (a.identifying()) {
            List<String> pk = new ArrayList<>(pkColumns(c, a.child()));
            boolean changed = false;
            for (List<String> p : pairs) {
                if (!pk.contains(p.get(0))) {
                    pk.add(p.get(0));
                    changed = true;
                }
            }
            if (changed) e.dispatchPublic(c, new SetPrimaryKey(a.child(), pk, null));
        }
        c.touch("relation", id);
        ErdRelation r = new ErdRelation();
        r.child = a.child();
        r.parent = cross ? null : a.parent();
        r.parentRef = cross ? new ErdParentRef(a.parentRef().model(), a.parentRef().table(), List.copyOf(refColumns)) : null;
        r.pairs = pairs;
        r.identifying = a.identifying();
        r.dbFk = dbFk;
        r.state = "CONFIRMED";
        c.m.relations.put(id, r);
        c.m.tombstones.remove(id);
        c.stamp(r.rev, Set.of("identifying", "cardinality", "dbFk", "state"));
    }

    static void update(ErdCommandEngine e, Ctx c, UpdateRelation u) {
        ErdRelation r = c.relation(u.id());
        c.requireKnownKeys(u.set(), ErdCommandEngine.RELATION_PROPS, u.id());
        c.checkConflict(r.rev, u.set().keySet(), u.id(), c.node(r));
        c.touch("relation", u.id());
        boolean wasIdentifying = r.identifying;
        for (String key : u.set().keySet()) {
            switch (key) {
                case "identifying" -> r.identifying = c.bool(u.set(), key, u.id());
                case "dbFk" -> {
                    boolean v = c.bool(u.set(), key, u.id());
                    if (v && r.parentRef != null) {
                        throw c.invalid("다른 모델 표와의 관계는 DB FK 로 만들 수 없습니다", "dbFk 를 false 로 두세요", u.id(), "dbFk");
                    }
                    r.dbFk = v;
                }
                case "cardinality" -> {
                    Map<String, String> card = cardinalityArg(c, u.set().get(key), u.id());
                    String p = card.getOrDefault("parent", r.cardinality.parent);
                    String ch = card.getOrDefault("child", r.cardinality.child);
                    if (!PARENT_CARD.contains(p) || !CHILD_CARD.contains(ch)) {
                        throw c.invalid("카디널리티 값이 틀렸습니다", "parent: " + PARENT_CARD + ", child: " + CHILD_CARD, u.id(), "cardinality");
                    }
                    r.cardinality.parent = p;
                    r.cardinality.child = ch;
                }
                default -> throw new IllegalStateException();
            }
        }
        c.stamp(r.rev, u.set().keySet());
        if (r.identifying != wasIdentifying) syncChildPk(e, c, u.id(), r);
    }

    /**
     * deferred 29: 식별 여부가 바뀌면 짝의 자식 컬럼을 자식 PK 에 넣거나 뺀다. 같은 자식 표의 다른 식별 관계가 쓰는 컬럼은 남긴다.
     * setPrimaryKey 를 거치므로 NOT NULL·키 만들기(PK_ + 표 물리명)·키 지우기·역명령·충돌 검사가 따라온다.
     */
    private static void syncChildPk(ErdCommandEngine e, Ctx c, String relId, ErdRelation r) {
        List<String> pk = new ArrayList<>(pkColumns(c, r.child));
        boolean changed = false;
        if (r.identifying) {
            for (List<String> p : r.pairs) {
                if (!pk.contains(p.get(0))) {
                    pk.add(p.get(0));
                    changed = true;
                }
            }
        } else {
            Set<String> keep = new HashSet<>();
            c.m.relations.forEach((oid, o) -> {
                if (!oid.equals(relId) && o.identifying && r.child.equals(o.child)) o.pairs.forEach(p -> keep.add(p.get(0)));
            });
            for (List<String> p : r.pairs) {
                if (!keep.contains(p.get(0)) && pk.remove(p.get(0))) changed = true;
            }
        }
        if (changed) e.dispatchPublic(c, new SetPrimaryKey(r.child, pk, null));
    }

    static void setState(Ctx c, String id, String state) {
        ErdRelation r = c.relation(id);
        c.checkConflict(r.rev, Set.of("state"), id, c.node(r));
        c.touch("relation", id);
        r.state = state;
        c.stamp(r.rev, Set.of("state"));
    }

    /** deferred 31: 직접 지울 때도, 표·컬럼 삭제에 딸려 지울 때도 충돌을 본다. */
    static void delete(Ctx c, String id) {
        ErdRelation r = c.relation(id);
        c.checkConflict(r.rev, r.rev.keySet(), id, c.node(r));
        c.touch("relation", id);
        c.m.relations.remove(id);
        c.m.tombstones.put(id, new PropRev(c.newRev, c.session));
    }

    /** TB_MCM_SEC_ROLE → MCM_SEC_ROLE (RENAME 접두). */
    static String prefix(String tablePhys) {
        return tablePhys.startsWith("TB_") ? tablePhys.substring(3) : tablePhys;
    }

    // ---- 입력 검사 ----

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    /** 표의 PK 컬럼 id 목록. PK 가 없으면 빈 목록. */
    private static List<String> pkColumns(Ctx c, String table) {
        return c.m.keys.values().stream().filter(k -> table.equals(k.table) && "PK".equals(k.kind))
                .findFirst().map(k -> k.columns).orElse(List.of());
    }

    /**
     * deferred 30: 같은 자식 표·같은 부모·같은 짝 집합(순서 무관)의 관계가 있으면 상태와 상관없이(REJECTED 포함) INVALID.
     * 같은 모델이면 parent 로, 다른 모델이면 parentRef 의 model·table 로 부모를 비교한다.
     */
    private static void requireNotDuplicate(Ctx c, String child, String parent, ErdParentRefArg ref, List<List<String>> pairs) {
        Set<List<String>> want = new HashSet<>(pairs);
        for (var en : c.m.relations.entrySet()) {
            ErdRelation o = en.getValue();
            if (!child.equals(o.child) || !new HashSet<>(o.pairs).equals(want)) continue;
            boolean sameParent = ref == null
                    ? o.parentRef == null && Objects.equals(parent, o.parent)
                    : o.parentRef != null && ref.model().equals(o.parentRef.model()) && ref.table().equals(o.parentRef.table());
            if (sameParent) {
                throw c.invalid("같은 자식·부모·컬럼 짝의 관계가 이미 있습니다: " + en.getKey() + "(" + o.state + ")",
                        "confirmRelation 또는 updateRelation 으로 기존 관계를 쓰세요", en.getKey(), null);
            }
        }
    }

    private static void requirePair(Ctx c, List<String> p, String relId) {
        if (p == null || p.size() != 2 || p.get(0) == null || p.get(1) == null) {
            throw c.invalid("pairs 의 각 항목은 [자식 컬럼 id, 부모 컬럼 id] 두 개여야 합니다", "pairs 를 고치세요", relId, "pairs");
        }
    }

    /** 컬럼이 있고 기대한 표의 것인지 확인한다. */
    private static void requireColumnOf(Ctx c, String columnId, String tableId, String relId) {
        ErdColumn col = c.column(columnId);
        if (!Objects.equals(tableId, col.table)) {
            throw c.invalid("짝의 컬럼이 다른 표 소속입니다: " + columnId, "자식 컬럼은 자식 표, 부모 컬럼은 부모 표의 것을 고르세요", relId, "pairs");
        }
    }

    private static Map<String, String> cardinalityArg(Ctx c, Object v, String relId) {
        if (!(v instanceof Map<?, ?> raw)) {
            throw c.invalid("cardinality 는 {parent, child} 객체여야 합니다", "{\"parent\":\"ONE\",\"child\":\"ZERO_OR_MORE\"} 모양으로 보내세요", relId, "cardinality");
        }
        Map<String, String> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> en : raw.entrySet()) {
            if (!(en.getKey() instanceof String k) || !(k.equals("parent") || k.equals("child"))) {
                throw c.invalid("cardinality 에는 parent·child 만 쓸 수 있습니다: " + en.getKey(), "parent·child 만 넣으세요", relId, "cardinality");
            }
            if (!(en.getValue() instanceof String s)) {
                throw c.invalid("cardinality." + k + " 는 문자열이어야 합니다", "ONE·ZERO_OR_ONE 같은 값을 문자열로 보내세요", relId, "cardinality");
            }
            out.put(k, s);
        }
        return out;
    }
}
```

`E/engine/ErdCommandEngine.java` 의 `dispatch` 에서 `case UpdateRelation u -> ErdRelationOps.update(c, u);` 를 아래로 바꾼다.

```java
            case UpdateRelation u -> ErdRelationOps.update(this, c, u);
```

- [ ] **Step 9: lib 시험 통과 확인**

Run: `../gradlew :lib:test --max-workers=2 --tests 'com.dongkuk.dmes.mdm.dma.erdEdit.*'`
Expected: 모두 PASS. `ErdCommandEngineRelationRulesTest` 9건이 새로 돈다.

- [ ] **Step 10: Oracle 회귀 — 엔진을 쓰는 서버 시험**

엔진 규칙은 저장·되돌리기·가져오기 경로 전체에 걸린다. BE2 가 고칠 api 시험 파일은 건드리지 않고 그대로 돌려 본다.

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdCommandServiceTest' --tests '*ErdEditOasisHttpTest' --tests '*ErdImportTest' --tests '*ErdVersionServiceTest' --tests '*ErdConcurrentSaveHttpTest' --tests '*ErdStreamTest'`
Expected: 모두 PASS. 기존 api 시험에는 삭제 명령(`deleteTable`·`deleteColumn`·`deleteKey`·`deleteRelation`)이 없고, 같은 rev 를 두 번 되돌리거나 같은 관계를 두 번 만드는 곳도 없다(계획 작성 때 `AT/` 에서 `grep -n 'deleteTable\|deleteColumn\|deleteKey\|deleteRelation' *.java`·`undo`·`addRelation` 을 찾아 확인했다).

하나라도 실패하면 실패한 시험이 이 Task 의 어느 규칙에 걸렸는지 메시지로 가린다(`되돌릴 변경이 없습니다` → S2-24, `같은 자식·부모` → 30, CONFLICT 의 `elementId` 가 딸린 요소 → 31). 규칙이 맞고 시험의 가정이 낡았으면 그 시험을 고치지 않고 멈춘 뒤 조정 세션에 알린다. api 시험 파일은 BE2 의 것이다.

- [ ] **Step 11: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/engine \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/engine
/usr/bin/git commit -F - <<'EOF'
fix(erd): 식별 전환 때 자식 PK 따라가기·같은 관계 중복 막기·parentRef.columns 일치(deferred 29·30)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

---

### Task 3: 다시 가져오기 반영 요소 `ErdDiffApplier` (S2-14, D10, deferred 51)

**Files:**
- Create: `E/importing/ErdDiffApplier.java`
- Modify: `E/importing/ErdImportBuilder.java` (표 하나 만들기 `oneTable`, `columnOf`·`shape`·`dbRelation` 공개, `relations` 가 `shape` 를 쓴다)
- Modify: `E/engine/Ctx.java` (deferred 51: `candidateRank` 에 `_rev` 를 찍지 않는다)
- Modify: `E/dbmeta/ErdDbMetaReader.java` (deferred 51: 보이지 않는 컬럼의 `COLUMN_ID` null)
- Test: `ET/importing/ErdDiffApplierTest.java`(새), `ET/importing/ErdImportBuilderTest.java`(시험 2개 추가), `AT/ErdDbMetaReaderTest.java`(시험 1개 추가)

**Interfaces:**
- Consumes:
  - 단계 1: `ErdDbDiff.diff(ErdModel, ErdDbMeta) : List<ErdDbDiffItem>`(항목 id `<종류>:<표>[.<컬럼>]`, FK 는 `<종류>:<자식>(<컬럼…>)><부모>(<컬럼…>)`), `ErdDbDiffItem(id, kind, table, column, before, after)`, `ErdImportBuilder`, `ErdDbMeta`, `ErdDictionary.fill`.
  - Task 2: 엔진 `restore` 의 S2-24 규칙, `Applied.touchedTables`.
- Produces (README 정본 그대로):
  - `ErdDiffApplier.build(ErdModel model, ErdDbMeta meta, ErdDictionary dict, List<String> itemIds, long sinceRev, Supplier<String> idSource) : Built`
  - `ErdDiffApplier.build(ErdModel model, ErdDbMeta meta, ErdDictionary dict, List<String> itemIds, long sinceRev) : Built` — `idSource` 가 `UUID.randomUUID().toString()` 이다. BE2 Task 5 의 서비스는 이것을 부른다.
  - `record Built(ErdCommand.Restore restore, Summary summary, List<String> staleIds)`. `staleIds` 가 비어 있지 않으면 `restore`·`summary` 는 null 이다.
  - `record Summary(int items, int tablesAdded, int tablesRemoved, int columnsAdded, int columnsRemoved, int columnsChanged, int relationsAdded, int dbFkSet, int dbFkCleared, List<String> removedIds)`
  - `ErdImportBuilder.oneTable(ErdDbMeta, String tableName, ErdDictionary, Function<Character,String> ids) : TablePart(String tableId, Map<String,String> columnIds, List<ErdChange> elements, List<ErdWarning> skipped)`
  - `ErdImportBuilder.columnOf(String tableId, ErdDbMeta.Column, ErdDictionary) : ErdColumn`, `ErdImportBuilder.shape(ErdDbMeta, String childTable, List<String> childColumns) : Shape(boolean identifying, String parentCardinality, String childCardinality)`, `ErdImportBuilder.dbRelation(ErdDbMeta, ErdDbMeta.Constraint fk, String childId, String parentId, List<List<String>> pairIds) : ErdRelation`
- BE2 Task 5 가 서비스에서 맡는 것: 항목 수 1~500 검사, 모델에 표가 없을 때의 INVALID, `staleIds` → README 의 INVALID 거절 모양(`elementId` = 첫 id, `choices` = 전부), `restore` 를 `allowRestore=true` 로 엔진에 넣기. `ErdDiffApplier` 는 요청 id 의 중복만 없앤다.

이 Task 에서 정하는 규칙:

| 항목 | 규칙 |
|---|---|
| 다시 계산 | 넘겨받은 모델(서비스가 잠근 뒤 읽은 것)로 `ErdDbDiff.diff` 를 다시 부른다. 요청 id 가 그 목록에 없으면 `staleIds` 다 |
| 만드는 방법 | 모델 사본에 고른 항목을 차례로 적용하고, 원래 모델과 사본의 차이를 요소마다 하나로 만든다. 없어졌으면 delete, 새로 생겼으면 upsert(`_rev` 없이), 바뀌었으면 바뀐 속성만 patch 다. 엔진 restore 는 같은 묶음 안에서 앞 요소가 찍은 rev 도 "sinceRev 뒤의 변경" 으로 보므로, 한 요소를 두 번 적으면 스스로 충돌한다 |
| 적용 순서 | TABLE_ADDED → COLUMN_ADDED → 새 표의 DB FK → COLUMN_CHANGED → FK_ADDED → COLUMN_REMOVED → TABLE_REMOVED → FK_REMOVED. 같은 종류는 id 순서다 |
| TABLE_ADDED | `oneTable` 로 표·컬럼·PK·UK·IX 를 만든다(첫 가져오기 규칙). 다이어그램에 놓지 않고 이름 규칙 추정을 하지 않는다. 그 표가 자식인 DB FK 는 부모가 모델이나 같은 묶음의 새 표에 있으면 함께 넣는다(`ErdDbDiff` 는 자식 표가 모델에 없는 FK 를 FK_ADDED 로 보이지 않는다). 부모를 못 풀면 넣지 않는다. 다음 차이에 FK_ADDED 로 보인다 |
| COLUMN_ADDED | `columnOf` 로 컬럼을 만들고 표 `columnOrder` 끝에 붙인다. 한 표의 여러 컬럼은 patch 하나로 합쳐진다 |
| COLUMN_CHANGED | 컬럼의 `dataType`·`length`·`scale`·`notNull` 을 `after` 값으로 바꾼다. 다른 속성은 건드리지 않는다 |
| FK_ADDED | 같은 자식·부모·짝 집합의 관계가 있으면(상태 무관) `dbFk=true`. 상태가 `INFERRED` 면 `DB` 로 바꾸고 `candidateRank` 를 지운다. `CONFIRMED`·`REJECTED` 는 그대로 둔다(D10). 근거에 `DB_FK`+제약 이름이 없으면 더한다. 관계가 없으면 `dbRelation` 으로 새로 만든다(`state=DB`, 식별·기수는 첫 가져오기 규칙). 자식·부모 표나 컬럼이 모델에도 같은 묶음의 새 항목에도 없으면 그 FK_ADDED id 를 `staleIds` 에 넣는다 |
| COLUMN_REMOVED | 컬럼 delete, 그 컬럼을 가진 키의 `columns` 를 줄이고(비면 키 delete), 그 컬럼이 짝에 든 관계 delete, 표 `columnOrder` 에서 뺀다 |
| TABLE_REMOVED | 표, 그 컬럼·키, 그 표가 자식이거나 부모인 관계(상태 무관)를 모두 delete |
| FK_REMOVED | 같은 관계(`dbFk=true`)의 `dbFk=false`. 상태 `DB` 는 `CONFIRMED` 로 바꾼다. 관계를 지우지 않는다. 같은 묶음의 COLUMN_REMOVED·TABLE_REMOVED 가 이미 지운 관계면 건너뛴다(지움이 고침보다 앞선다) |
| summary | `items` = 중복을 뺀 요청 수. `relationsAdded` = 새로 만든 관계(FK_ADDED + 새 표의 FK). `dbFkSet` = FK_ADDED 가 고친 기존 관계. `dbFkCleared` = 실제로 고친 FK_REMOVED. `removedIds` = delete 요소 id 전부(정렬) |
| deferred 51(앞) | 엔진 `stampNode` 는 `candidateRank` 를 건너뛴다. 명령이 고치지 않는 속성이라 `_rev` 가 필요 없다 |
| deferred 51(뒤) | `ErdDbMetaReader` 는 `COLUMN_ID` 가 null 인 보이지 않는 컬럼을 보이는 컬럼 뒤(10000 + 표 안 순번)에 둔다. 정렬은 `C.COLUMN_ID NULLS LAST, C.COLUMN_NAME` 이다 |

- [ ] **Step 1: 실패하는 단위 시험 작성 — `ET/importing/ErdDiffApplierTest.java`**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.importing;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Column;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Constraint;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Table;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ApplyOutcome;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommandEngine;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdNaming;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdRejection;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.InferredRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdEvidence;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionary;
import com.dongkuk.dmes.mdm.dma.naming.TermDictionary;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

/** README "다시 가져오기 반영": 항목 종류별 restore 요소, 낡은 id, 결정한 관계 유지, 스스로 충돌하지 않는 요소 합치기. */
class ErdDiffApplierTest {

    final ErdCommandEngine engine = new ErdCommandEngine(ErdNaming.NONE);
    static final ErdDictionary DICT = new ErdDictionary(TermDictionary.of(List.of()), Set.of(), Set.of(), Map.of(), List.of());

    static final Constraint PK_P = new Constraint("PK_TB_P", "TB_P", "P", List.of("ID"), null, null);
    static final Constraint PK_C = new Constraint("PK_TB_C", "TB_C", "P", List.of("ID"), null, null);
    static final Constraint FK_C_P = new Constraint("FK_TB_C_P", "TB_C", "R", List.of("P_ID"), "TB_P", List.of("ID"));

    static Column col(String name, int pos, String type, Integer len, Integer prec, Integer scale, boolean nullable) {
        return new Column(name, pos, type, len, prec, scale, nullable, null, null);
    }

    static Table tb(String name, Column... cols) {
        return new Table(name, name, List.of(cols));
    }

    /** TB_P(ID PK) · TB_C(ID PK, P_ID, NOTE(10), OLD) · TB_GONE(A). */
    static List<Table> baseTables() {
        return List.of(
                tb("TB_P", col("ID", 1, "VARCHAR2", 10, null, null, false)),
                tb("TB_C", col("ID", 1, "NUMBER", 22, 19, 0, false), col("P_ID", 2, "VARCHAR2", 10, null, null, true),
                        col("NOTE", 3, "VARCHAR2", 10, null, null, true), col("OLD", 4, "CHAR", 1, null, null, true)),
                tb("TB_GONE", col("A", 1, "DATE", 7, null, null, true)));
    }

    /** 가져온 때의 DB. fk 면 TB_C(P_ID) > TB_P(ID) DB FK 가 있다. */
    static ErdDbMeta before(boolean fk) {
        List<Constraint> cons = new ArrayList<>(List.of(PK_P, PK_C));
        if (fk) cons.add(FK_C_P);
        return new ErdDbMeta("S", baseTables(), cons, List.of());
    }

    /**
     * 바뀐 DB: NOTE 길이 20, EXTRA 추가, OLD 삭제, TB_NEW(N_ID PK, P_ID → TB_P) 추가, TB_GONE 삭제,
     * FK_TB_C_P 삭제, FK_TB_C_NOTE(TB_C.NOTE > TB_P.ID) 추가.
     */
    static ErdDbMeta after() {
        return new ErdDbMeta("S", List.of(
                tb("TB_P", col("ID", 1, "VARCHAR2", 10, null, null, false)),
                tb("TB_C", col("ID", 1, "NUMBER", 22, 19, 0, false), col("P_ID", 2, "VARCHAR2", 10, null, null, true),
                        col("NOTE", 3, "VARCHAR2", 20, null, null, true), col("EXTRA", 5, "NUMBER", 22, 5, 0, true)),
                tb("TB_NEW", col("N_ID", 1, "VARCHAR2", 10, null, null, false), col("P_ID", 2, "VARCHAR2", 10, null, null, true))),
            List.of(PK_P, PK_C,
                new Constraint("PK_TB_NEW", "TB_NEW", "P", List.of("N_ID"), null, null),
                new Constraint("FK_TB_NEW_P", "TB_NEW", "R", List.of("P_ID"), "TB_P", List.of("ID")),
                new Constraint("FK_TB_C_NOTE", "TB_C", "R", List.of("NOTE"), "TB_P", List.of("ID"))),
            List.of());
    }

    static final List<String> ALL = List.of(
            "COLUMN_ADDED:TB_C.EXTRA", "COLUMN_CHANGED:TB_C.NOTE", "COLUMN_REMOVED:TB_C.OLD",
            "FK_ADDED:TB_C(NOTE)>TB_P(ID)", "FK_REMOVED:TB_C(P_ID)>TB_P(ID)", "TABLE_ADDED:TB_NEW", "TABLE_REMOVED:TB_GONE");

    /** 가져온 모델(rev 1, 세션 s-imp). 관계는 준 대로 넣는다. */
    static ErdModel imported(ErdDbMeta meta, List<InferredRelation> rels) {
        AtomicInteger n = new AtomicInteger();
        var built = ErdImportBuilder.build(meta, rels, DICT, 0, ch -> ch + "-" + n.incrementAndGet());
        var out = new ErdCommandEngine(ErdNaming.NONE).apply(ErdModel.empty("m", "S"), 0, 1, "s-imp", List.of(built.restore()));
        return ((ApplyOutcome.Applied) out).next();
    }

    static List<InferredRelation> dbRels(ErdDbMeta meta) {
        return meta.constraints().stream().filter(k -> k.type().equals("R"))
                .map(k -> new InferredRelation(k.table(), k.columns(), k.refTable(), k.refColumns(), "DB",
                        List.of(new ErdEvidence("DB_FK", k.name())), null)).toList();
    }

    /** 새 요소 id 몸통 n1, n2, … — 가져오기의 순번 id(t-1, c-2 …)와 겹치지 않는다. */
    static Supplier<String> seq() {
        AtomicInteger n = new AtomicInteger();
        return () -> "n" + n.incrementAndGet();
    }

    static String tableId(ErdModel m, String phys) {
        return m.tables.entrySet().stream().filter(e -> phys.equals(e.getValue().phys)).findFirst().orElseThrow().getKey();
    }

    static String columnId(ErdModel m, String table, String phys) {
        String t = tableId(m, table);
        return m.columns.entrySet().stream().filter(e -> t.equals(e.getValue().table) && phys.equals(e.getValue().phys))
                .findFirst().orElseThrow().getKey();
    }

    /** 짝의 첫 자식 컬럼이 table.column 인 관계 id. */
    static String relationIdOn(ErdModel m, String table, String column) {
        String c = columnId(m, table, column);
        return m.relations.entrySet().stream().filter(e -> e.getValue().pairs.get(0).get(0).equals(c))
                .findFirst().orElseThrow().getKey();
    }

    static ErdRelation relationOn(ErdModel m, String table, String column) {
        return m.relations.get(relationIdOn(m, table, column));
    }

    ErdModel apply(ErdModel m, long base, long rev, String session, ErdCommand.Restore restore) {
        var out = engine.apply(m, base, rev, session, List.of(restore));
        assertThat(out).as("rejected: %s", out instanceof ApplyOutcome.Rejected r ? r.rejection() : null)
                .isInstanceOf(ApplyOutcome.Applied.class);
        return ((ApplyOutcome.Applied) out).next();
    }

    /** 모든 종류를 한 번에 고르면 엔진이 받아들이고, 다시 계산한 차이가 비어 있다. */
    @Test
    void appliesEveryKindAndDiffBecomesEmpty() {
        ErdModel m = imported(before(true), dbRels(before(true)));
        assertThat(ErdDbDiff.diff(m, after())).extracting(ErdDbDiffItem::id).containsExactlyElementsOf(ALL);
        var built = ErdDiffApplier.build(m, after(), DICT, ALL, 1, seq());
        assertThat(built.staleIds()).isEmpty();
        assertThat(built.restore().sinceRev()).isEqualTo(1);
        ErdModel next = apply(m, 1, 2, "s-a", built.restore());

        assertThat(ErdDbDiff.diff(next, after())).isEmpty();
        assertThat(next.tables.values()).extracting(t -> t.phys).containsExactlyInAnyOrder("TB_P", "TB_C", "TB_NEW");
        ErdRelation old = relationOn(next, "TB_C", "P_ID");
        assertThat(old.dbFk).isFalse();
        assertThat(old.state).isEqualTo("CONFIRMED");   // DB 에서 FK 가 빠진 DB 상태 관계
        ErdRelation note = relationOn(next, "TB_C", "NOTE");
        assertThat(note.state).isEqualTo("DB");
        assertThat(note.dbFk).isTrue();
        assertThat(note.evidence).containsExactly(new ErdEvidence("DB_FK", "FK_TB_C_NOTE"));
        assertThat(relationOn(next, "TB_NEW", "P_ID").state).isEqualTo("DB");   // 새 표의 DB FK 도 함께 들어온다
        assertThat(next.tables.get(tableId(m, "TB_C")).columnOrder).extracting(id -> next.columns.get(id).phys)
                .containsExactly("ID", "P_ID", "NOTE", "EXTRA");

        var s = built.summary();
        assertThat(List.of(s.items(), s.tablesAdded(), s.tablesRemoved(), s.columnsAdded(), s.columnsRemoved(),
                s.columnsChanged(), s.relationsAdded(), s.dbFkSet(), s.dbFkCleared())).containsExactly(7, 1, 1, 1, 1, 1, 2, 0, 1);
        assertThat(s.removedIds()).containsExactlyInAnyOrder(
                columnId(m, "TB_C", "OLD"), tableId(m, "TB_GONE"), columnId(m, "TB_GONE", "A"));
    }

    /** Review Focus 5: 확정·기각한 관계에 걸린 FK_ADDED 는 dbFk 만 켜고 상태를 그대로 둔다. 추정 관계는 DB 가 된다. */
    @Test
    void fkAddedKeepsDecidedRelationState() {
        List<InferredRelation> inferred = List.of(new InferredRelation("TB_C", List.of("P_ID"), "TB_P", List.of("ID"),
                "INFERRED", List.of(new ErdEvidence("NAME_RULE", "PK 이름 일치")), 2));
        String item = "FK_ADDED:TB_C(P_ID)>TB_P(ID)";
        for (String decided : new String[] {"CONFIRMED", "REJECTED", "INFERRED"}) {
            ErdModel m = imported(before(false), inferred);
            String rid = relationIdOn(m, "TB_C", "P_ID");
            long rev = 1;
            if (!decided.equals("INFERRED")) {
                ErdCommand cmd = decided.equals("CONFIRMED") ? new ErdCommand.ConfirmRelation(rid) : new ErdCommand.RejectRelation(rid);
                m = ((ApplyOutcome.Applied) engine.apply(m, 1, 2, "s-b", List.of(cmd))).next();
                rev = 2;
            }
            assertThat(ErdDbDiff.diff(m, before(true))).extracting(ErdDbDiffItem::id).containsExactly(item);
            var built = ErdDiffApplier.build(m, before(true), DICT, List.of(item), rev, seq());
            ErdModel next = apply(m, rev, rev + 1, "s-a", built.restore());
            assertThat(next.relations).as(decided).hasSize(1);
            ErdRelation r = next.relations.get(rid);
            assertThat(r.dbFk).as(decided).isTrue();
            assertThat(r.state).as(decided).isEqualTo(decided.equals("INFERRED") ? "DB" : decided);
            assertThat(r.candidateRank).as(decided).isEqualTo(decided.equals("INFERRED") ? null : 2);
            assertThat(r.evidence).as(decided).contains(new ErdEvidence("DB_FK", "FK_TB_C_P"));
            assertThat(built.summary().dbFkSet()).isEqualTo(1);
            assertThat(built.summary().relationsAdded()).isZero();
        }
    }

    @Test
    void staleIdsAreReturnedWithoutRestore() {
        ErdModel m = imported(before(true), dbRels(before(true)));
        var built = ErdDiffApplier.build(m, after(), DICT,
                List.of("COLUMN_CHANGED:TB_C.NOTE", "COLUMN_ADDED:TB_X.Y", "COLUMN_ADDED:TB_X.Y"), 1, seq());
        assertThat(built.restore()).isNull();
        assertThat(built.summary()).isNull();
        assertThat(built.staleIds()).containsExactly("COLUMN_ADDED:TB_X.Y");
    }

    /** 컬럼 삭제와 그 컬럼의 FK 삭제를 함께 고르면 관계는 delete 하나다(patch 뒤 delete 로 스스로 충돌하지 않는다). */
    @Test
    void removedColumnAndItsForeignKeyBecomeOneDelete() {
        ErdModel m = imported(before(true), dbRels(before(true)));
        ErdDbMeta noPid = new ErdDbMeta("S", List.of(
                tb("TB_P", col("ID", 1, "VARCHAR2", 10, null, null, false)),
                tb("TB_C", col("ID", 1, "NUMBER", 22, 19, 0, false), col("NOTE", 3, "VARCHAR2", 10, null, null, true),
                        col("OLD", 4, "CHAR", 1, null, null, true)),
                tb("TB_GONE", col("A", 1, "DATE", 7, null, null, true))), List.of(PK_P, PK_C), List.of());
        List<String> ids = List.of("COLUMN_REMOVED:TB_C.P_ID", "FK_REMOVED:TB_C(P_ID)>TB_P(ID)");
        assertThat(ErdDbDiff.diff(m, noPid)).extracting(ErdDbDiffItem::id).containsExactlyElementsOf(ids);
        String rid = relationIdOn(m, "TB_C", "P_ID");
        var built = ErdDiffApplier.build(m, noPid, DICT, ids, 1, seq());
        assertThat(built.restore().elements()).filteredOn(e -> e.id().equals(rid)).singleElement()
                .satisfies(e -> assertThat(e.op()).isEqualTo(ErdChange.DELETE));
        ErdModel next = apply(m, 1, 2, "s-a", built.restore());
        assertThat(next.relations).isEmpty();
        assertThat(ErdDbDiff.diff(next, noPid)).isEmpty();
        assertThat(built.summary().columnsRemoved()).isEqualTo(1);
        assertThat(built.summary().dbFkCleared()).isZero();
        assertThat(built.summary().removedIds()).containsExactlyInAnyOrder(columnId(m, "TB_C", "P_ID"), rid);
    }

    /** 부모가 새 표인 FK_ADDED 는 그 표의 TABLE_ADDED 를 함께 골라야 들어간다. */
    @Test
    void foreignKeyToUnselectedNewTableIsStale() {
        ErdModel m = imported(before(false), List.of());
        List<Table> tables = new ArrayList<>(baseTables());
        tables.add(tb("TB_NEW2", col("ID", 1, "VARCHAR2", 10, null, null, false)));
        ErdDbMeta withNew2 = new ErdDbMeta("S", tables, List.of(PK_P, PK_C,
                new Constraint("PK_TB_NEW2", "TB_NEW2", "P", List.of("ID"), null, null),
                new Constraint("FK_TB_C_NEW2", "TB_C", "R", List.of("P_ID"), "TB_NEW2", List.of("ID"))), List.of());
        String fk = "FK_ADDED:TB_C(P_ID)>TB_NEW2(ID)", table = "TABLE_ADDED:TB_NEW2";
        assertThat(ErdDbDiff.diff(m, withNew2)).extracting(ErdDbDiffItem::id).containsExactly(fk, table);

        var alone = ErdDiffApplier.build(m, withNew2, DICT, List.of(fk), 1, seq());
        assertThat(alone.restore()).isNull();
        assertThat(alone.staleIds()).containsExactly(fk);

        var both = ErdDiffApplier.build(m, withNew2, DICT, List.of(fk, table), 1, seq());
        ErdModel next = apply(m, 1, 2, "s-a", both.restore());
        assertThat(ErdDbDiff.diff(next, withNew2)).isEmpty();
        assertThat(both.summary().relationsAdded()).isEqualTo(1);
    }

    /** sinceRev = 요청 baseRev: 차이를 본 뒤 남이 같은 속성을 고쳤으면 CONFLICT 이고, 그 rev 를 본 뒤 보내면 들어간다. */
    @Test
    void peerChangeAfterBaseRevConflicts() {
        ErdModel m = imported(before(true), dbRels(before(true)));
        String note = columnId(m, "TB_C", "NOTE");
        ErdModel peer = ((ApplyOutcome.Applied) engine.apply(m, 1, 2, "s-b",
                List.of(new ErdCommand.UpdateColumn(note, Map.of("length", 30))))).next();
        var stale = ErdDiffApplier.build(peer, after(), DICT, List.of("COLUMN_CHANGED:TB_C.NOTE"), 1, seq());
        ErdRejection r = ((ApplyOutcome.Rejected) engine.apply(peer, 1, 3, "s-a", List.of(stale.restore()))).rejection();
        assertThat(r.code()).isEqualTo("CONFLICT");
        assertThat(r.elementId()).isEqualTo(note);
        assertThat(r.property()).isEqualTo("length");
        assertThat(r.byRev()).isEqualTo(2);
        var fresh = ErdDiffApplier.build(peer, after(), DICT, List.of("COLUMN_CHANGED:TB_C.NOTE"), 2, seq());
        assertThat(apply(peer, 2, 3, "s-a", fresh.restore()).columns.get(note).length).isEqualTo(20);
    }
}
```

`ET/importing/ErdImportBuilderTest.java` 에 시험 2개를 더한다. import 에 `import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;` 를 더하고 `diagramPlacesTablesInNameGrid` 다음에 넣는다.

```java
    /** APPLY_DIFF 의 표 하나 만들기: 첫 가져오기와 같은 키 규칙, 표 → 컬럼 → 키 순서, 관계 없음. */
    @Test
    void oneTableBuildsTableColumnsAndKeysOnly() {
        var part = ErdImportBuilder.oneTable(meta(), "TB_HEAD", emptyDict(), seqIds());
        assertThat(part.tableId()).isEqualTo("t-1");
        assertThat(part.columnIds()).containsOnlyKeys("LAYOUT_ID", "VER", "HEADER_ID", "SEQ");
        assertThat(part.elements()).extracting(ErdChange::kind)
                .containsExactly("table", "column", "column", "column", "column", "key", "key");
        assertThat(part.elements()).filteredOn(e -> e.kind().equals("key")).extracting(e -> e.value().path("name").asText())
                .containsExactlyInAnyOrder("PK_TB_HEAD", "UX_TB_HEAD_HDR");
        assertThat(part.skipped()).isEmpty();
        assertThat(ErdImportBuilder.oneTable(meta(), "TB_TREE", emptyDict(), seqIds()).skipped()).hasSize(1);   // 함수 기반 인덱스
    }

    /** deferred 51: restore 는 명령이 고치지 않는 candidateRank 에 _rev 를 찍지 않는다. */
    @Test
    void restoreDoesNotStampCandidateRank() {
        ErdModel m = apply(ErdImportBuilder.build(meta(), rels(), emptyDict(), 0, seqIds()));
        ErdRelation folded = relation(m, "TB_CONST", "TB_LAYOUT", "INFERRED");
        assertThat(folded.candidateRank).isEqualTo(2);
        assertThat(folded.rev).containsKey("state").doesNotContainKey("candidateRank");
    }
```

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `../gradlew :lib:test --max-workers=2 --tests '*ErdDiffApplierTest' --tests '*ErdImportBuilderTest'`
Expected: 컴파일 실패(`ErdDiffApplier`, `ErdImportBuilder.oneTable` 이 없다).

- [ ] **Step 3: 구현 — `E/engine/Ctx.java` (deferred 51)**

`static final String REV = "_rev";` 다음 줄에 상수를 더하고, `stampNode` 를 아래로 바꾼다.

```java
    /** 명령이 고치지 않는 속성 — restore 가 값을 써도 _rev 를 찍지 않는다(deferred 51). */
    static final Set<String> UNSTAMPED = Set.of("candidateRank");
```

```java
    /** 요소 JSON 의 {@code _rev} 에 속성별 이번 rev·세션을 적는다(restore 가 JSON 단계에서 고칠 때 쓴다). UNSTAMPED 는 건너뛴다. */
    void stampNode(ObjectNode node, Collection<String> props) {
        ObjectNode revs = node.get(REV) instanceof ObjectNode o ? o : node.putObject(REV);
        for (String p : props) {
            if (UNSTAMPED.contains(p)) continue;
            ObjectNode pr = revs.putObject(p);
            pr.put("rev", newRev);
            pr.put("session", session);
        }
    }
```

- [ ] **Step 4: 구현 — `E/importing/ErdImportBuilder.java`**

여섯 군데를 고친다. 첫 가져오기의 결과(요소·id 순서·관계 규칙)는 그대로다. 기존 `ErdImportBuilderTest`·`ErdDbDiffTest` 가 지킨다.

(1) import 에 `import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdEvidence;` 를 더한다.

(2) 필드 `dbColumns`·`pkOf`·`uniqueSetsOf` 세 개와 그 javadoc 세 줄을 지운다(관계 규칙이 `shape` 로 옮겨 가서 쓰지 않는다). `public record Built(…)` 다음에 레코드 두 개를 더한다.

```java
    /** APPLY_DIFF 의 TABLE_ADDED 용 표 하나. columnIds 는 컬럼 이름 → 컬럼 id(DB 순서). skipped 는 뺀 키의 경고. */
    public record TablePart(String tableId, Map<String, String> columnIds, List<ErdChange> elements, List<ErdWarning> skipped) {}

    /** 관계 하나의 식별 여부와 기수(가져오기 규칙). 첫 가져오기와 APPLY_DIFF 가 같이 쓴다. */
    public record Shape(boolean identifying, String parentCardinality, String childCardinality) {}
```

(3) `build` 의 `b.relations(inferred);` 를 `b.relations(meta, inferred);` 로 바꾸고, `build` 다음에 공개 함수 네 개를 더한다.

```java
    /**
     * 표 하나와 그 컬럼·PK·UK·IX 요소를 첫 가져오기와 같은 규칙으로 만든다(README "다시 가져오기 반영" TABLE_ADDED).
     * 다이어그램·관계·이름 규칙 추정은 하지 않는다. 요소 순서는 build 와 같다(표 → 컬럼 → 키).
     */
    public static TablePart oneTable(ErdDbMeta meta, String tableName, ErdDictionary dict, Function<Character, String> ids) {
        ErdDbMeta.Table t = meta.tables().stream().filter(x -> x.name().equals(tableName)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("DB 메타에 없는 표입니다: " + tableName));
        ErdImportBuilder b = new ErdImportBuilder(ids, dict);
        b.table(t);
        b.keys(new ErdDbMeta(meta.owner(), List.of(t),
                meta.constraints().stream().filter(k -> k.table().equals(tableName)).toList(),
                meta.indexes().stream().filter(ix -> ix.table().equals(tableName)).toList()));
        List<ErdChange> elements = new ArrayList<>(b.tables);
        elements.addAll(b.columns);
        elements.addAll(b.keys);
        return new TablePart(b.tableIds.get(tableName), new LinkedHashMap<>(b.columnIds.get(tableName)), elements,
                List.copyOf(b.skipped));
    }

    /** DB 컬럼 → 모델 컬럼(논리명·도메인은 사전, 타입은 typeOf). */
    public static ErdColumn columnOf(String tableId, ErdDbMeta.Column c, ErdDictionary dict) {
        ErdColumn e = new ErdColumn();
        e.table = tableId;
        e.phys = c.name();
        ErdDictionary.ColumnEntry fill = dict.fill(c.name());
        e.logical = fill.logical();
        e.domainId = fill.domainId();
        ColumnType type = typeOf(c);
        e.dataType = type.dataType();
        e.length = type.length();
        e.scale = type.scale();
        e.notNull = !c.nullable();
        e.defaultValue = c.defaultValue() == null || c.defaultValue().isBlank() ? null : c.defaultValue().strip();
        e.comment = c.comment();
        return e;
    }

    /**
     * 관계 하나의 식별·기수(단계 1 Task 4 규칙). 자식 표에 PK 가 있고 자식 컬럼이 모두 PK 안이면 식별. 부모 쪽은 자식 컬럼이 모두
     * NOT NULL 이면 ONE, 아니면 ZERO_OR_ONE. 자식 쪽은 자식 컬럼 집합이 자식 표의 PK·UK·유일 인덱스와 같으면 ZERO_OR_ONE(1:1).
     */
    public static Shape shape(ErdDbMeta meta, String childTable, List<String> childColumns) {
        List<String> pk = meta.constraints().stream().filter(k -> "P".equals(k.type()) && k.table().equals(childTable))
                .findFirst().map(ErdDbMeta.Constraint::columns).orElse(List.of());
        boolean identifying = !pk.isEmpty() && pk.containsAll(childColumns);
        Map<String, ErdDbMeta.Column> cols = new HashMap<>();
        meta.tables().stream().filter(t -> t.name().equals(childTable)).findFirst()
                .ifPresent(t -> t.columns().forEach(c -> cols.put(c.name(), c)));
        boolean allNotNull = childColumns.stream().allMatch(c -> cols.containsKey(c) && !cols.get(c).nullable());
        Set<String> want = new HashSet<>(childColumns);
        boolean unique = meta.constraints().stream().anyMatch(k -> ("P".equals(k.type()) || "U".equals(k.type()))
                        && k.table().equals(childTable) && new HashSet<>(k.columns()).equals(want))
                || meta.indexes().stream().anyMatch(ix -> ix.unique() && ix.table().equals(childTable)
                        && new HashSet<>(ix.columns()).equals(want));
        return new Shape(identifying, allNotNull ? "ONE" : "ZERO_OR_ONE", unique ? "ZERO_OR_ONE" : "ZERO_OR_MORE");
    }

    /** DB FK 하나의 관계 요소(state DB, dbFk, 근거 DB_FK + 제약 이름). APPLY_DIFF 의 FK_ADDED·새 표의 FK 가 쓴다. */
    public static ErdRelation dbRelation(ErdDbMeta meta, ErdDbMeta.Constraint fk, String childId, String parentId,
                                         List<List<String>> pairIds) {
        ErdRelation e = new ErdRelation();
        e.child = childId;
        e.parent = parentId;
        pairIds.forEach(p -> e.pairs.add(List.of(p.get(0), p.get(1))));
        Shape s = shape(meta, fk.table(), fk.columns());
        e.identifying = s.identifying();
        e.cardinality.parent = s.parentCardinality();
        e.cardinality.child = s.childCardinality();
        e.state = "DB";
        e.dbFk = true;
        e.evidence = new ArrayList<>(List.of(new ErdEvidence("DB_FK", fk.name())));
        return e;
    }
```

(4) `table(ErdDbMeta.Table t)` 와 `column(String tableId, ErdDbMeta.Column c)` 두 메서드를 지우고 아래 `table` 하나로 바꾼다.

```java
    private void table(ErdDbMeta.Table t) {
        String tid = ids.apply('t');
        tableIds.put(t.name(), tid);
        ErdTable et = new ErdTable();
        et.phys = t.name();
        et.logical = tableLogical(t);
        et.comment = t.comment();
        Map<String, String> cids = new LinkedHashMap<>();
        for (ErdDbMeta.Column c : t.columns().stream().sorted(Comparator.comparingInt(ErdDbMeta.Column::position)).toList()) {
            String cid = ids.apply('c');
            cids.put(c.name(), cid);
            et.columnOrder.add(cid);
            columns.add(upsert("column", cid, columnOf(tid, c, dict)));
        }
        columnIds.put(t.name(), cids);
        tables.add(upsert("table", tid, et));
    }
```

(5) `keys(ErdDbMeta meta)` 를 아래로 바꾼다(지운 필드를 채우던 세 줄만 빠진다).

```java
    private void keys(ErdDbMeta meta) {
        Set<String> constraintNames = new HashSet<>();
        Map<String, List<List<String>>> constraintColumns = new HashMap<>();
        for (ErdDbMeta.Constraint k : meta.constraints()) {
            if (!"P".equals(k.type()) && !"U".equals(k.type())) continue;
            constraintNames.add(k.name());
            constraintColumns.computeIfAbsent(k.table(), x -> new ArrayList<>()).add(k.columns());
            List<String> cids = resolve(k.table(), k.columns());
            if (cids == null) {
                skip("키 " + k.name() + " 의 표·컬럼을 찾지 못해 뺐습니다");
                continue;
            }
            addKey(k.table(), "P".equals(k.type()) ? "PK" : "UK", k.name(), cids);
        }
        for (ErdDbMeta.Index ix : meta.indexes()) {
            // PK·UK 제약이 만든 인덱스: 이름이 같거나(사용자 이름) 컬럼 목록이 같다(SYS_C… 이름).
            if (constraintNames.contains(ix.name())
                    || constraintColumns.getOrDefault(ix.table(), List.of()).contains(ix.columns())) continue;
            List<String> cids = resolve(ix.table(), ix.columns());
            if (cids == null) {
                skip("인덱스 " + ix.name() + " 에 표 컬럼이 아닌 식(함수 기반 인덱스 등)이 있어 뺐습니다");
                continue;
            }
            addKey(ix.table(), ix.unique() ? "UK" : "IX", ix.name(), cids);
        }
    }
```

(6) `relations(List<InferredRelation> inferred)` 를 아래로 바꾼다. 식별·기수는 `shape` 가 같은 규칙으로 준다.

```java
    private void relations(ErdDbMeta meta, List<InferredRelation> inferred) {
        Set<String> seen = new HashSet<>();
        for (InferredRelation r : inferred) {
            String sig = r.childTable() + r.childColumns() + ">" + r.parentTable() + r.parentColumns();
            List<String> child = resolve(r.childTable(), r.childColumns());
            List<String> parent = resolve(r.parentTable(), r.parentColumns());
            if (child == null || parent == null || child.size() != parent.size()) {
                skip("관계 " + sig + " 의 표·컬럼을 찾지 못해 뺐습니다");
                continue;
            }
            if (!seen.add(sig)) {
                skip("관계 " + sig + " 가 두 번 나와 하나만 넣었습니다");
                continue;
            }
            ErdRelation e = new ErdRelation();
            e.child = tableIds.get(r.childTable());
            e.parent = tableIds.get(r.parentTable());
            for (int i = 0; i < child.size(); i++) e.pairs.add(List.of(child.get(i), parent.get(i)));
            Shape s = shape(meta, r.childTable(), r.childColumns());
            e.identifying = s.identifying();
            e.cardinality.parent = s.parentCardinality();
            e.cardinality.child = s.childCardinality();
            e.state = r.state();
            e.dbFk = "DB".equals(r.state());
            e.evidence = new ArrayList<>(r.evidence() == null ? List.of() : r.evidence());
            e.candidateRank = r.candidateRank();
            relations.add(upsert("relation", ids.apply('r'), e));
            relationCounts.merge(r.state(), 1, Integer::sum);
        }
    }
```

- [ ] **Step 5: 구현 — `E/importing/ErdDiffApplier.java`**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.importing;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdEvidence;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdKey;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdTable;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionary;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * 다시 가져오기 반영(import kind=APPLY_DIFF, README S2-14·스펙 D10)의 restore 요소 만들기. 순수 함수 — DB·스프링을 모른다.
 *
 * <p>넘겨받은 모델(서비스가 잠근 뒤 읽은 것)로 차이를 다시 계산하고, 고른 항목을 모델 사본에 차례로 적용한 뒤 원래 모델과의 차이를
 * restore 요소로 만든다. 요소는 (kind, id) 마다 하나다 — 엔진 restore 는 같은 묶음 안에서 앞 요소가 찍은 rev 도 "sinceRev 뒤의
 * 변경" 으로 보므로, 같은 요소를 두 번 적으면 스스로 충돌한다. 지운 요소는 delete 하나로 끝난다(지움이 고침보다 앞선다).
 *
 * <p>적용 순서: TABLE_ADDED → COLUMN_ADDED → 새 표의 DB FK → COLUMN_CHANGED → FK_ADDED → COLUMN_REMOVED → TABLE_REMOVED →
 * FK_REMOVED. 새 표·새 컬럼을 먼저 넣어야 FK 의 부모·컬럼이 풀린다.
 *
 * <p>검사 나눔: 항목 수(1~500)와 "모델에 표가 없음" 은 서비스가 본다. 여기서는 잠근 모델 기준으로 항목 id 를 본다.
 */
public final class ErdDiffApplier {

    /**
     * @param restore  넣을 restore(sinceRev = 요청 baseRev). staleIds 가 비어 있지 않으면 null.
     * @param summary  반영 요약. staleIds 가 비어 있지 않으면 null.
     * @param staleIds 넣을 수 없는 항목 id(요청 순서): 지금 차이 목록에 없는 id, 그리고 자식·부모 표나 컬럼이 모델에도 같은 묶음의
     *                 새 항목에도 없어 풀 수 없는 FK_ADDED. 비어 있지 않으면 서비스가 INVALID 로 거절한다.
     */
    public record Built(ErdCommand.Restore restore, Summary summary, List<String> staleIds) {}

    /** README ErdDiffApplySummary. removedIds 는 delete 요소 id(정렬). */
    public record Summary(int items, int tablesAdded, int tablesRemoved, int columnsAdded, int columnsRemoved,
                          int columnsChanged, int relationsAdded, int dbFkSet, int dbFkCleared, List<String> removedIds) {}

    private static final String REV = "_rev";
    private static final List<String> ADD_KINDS = List.of(ErdDbDiff.TABLE_ADDED, ErdDbDiff.COLUMN_ADDED);
    private static final List<String> OTHER_KINDS = List.of(ErdDbDiff.COLUMN_CHANGED, ErdDbDiff.FK_ADDED,
            ErdDbDiff.COLUMN_REMOVED, ErdDbDiff.TABLE_REMOVED, ErdDbDiff.FK_REMOVED);

    private record Key(String kind, String id) {}

    private final ErdModel original;
    private final ErdModel work;
    private final ErdDbMeta meta;
    private final ErdDictionary dict;
    private final Function<Character, String> ids;
    /** 사본에서 건드린 요소(처음 건드린 순서). 요소는 이 순서로 하나씩 나간다. */
    private final Set<Key> touched = new LinkedHashSet<>();
    private final List<String> newTables = new ArrayList<>();
    private int tablesAdded, tablesRemoved, columnsAdded, columnsRemoved, columnsChanged, relationsAdded, dbFkSet, dbFkCleared;

    private ErdDiffApplier(ErdModel model, ErdDbMeta meta, ErdDictionary dict, Function<Character, String> ids) {
        this.original = model;
        this.work = ErdModelCodec.copy(model);
        this.meta = meta;
        this.dict = dict;
        this.ids = ids;
    }

    public static Built build(ErdModel model, ErdDbMeta meta, ErdDictionary dict, List<String> itemIds, long sinceRev) {
        return build(model, meta, dict, itemIds, sinceRev, () -> UUID.randomUUID().toString());
    }

    /** @param idSource 새 요소 id 의 몸통. 접두("t-"·"c-"·"k-"·"r-")는 여기서 붙인다. 기본은 UUID 다. 시험은 순번을 넣는다. */
    public static Built build(ErdModel model, ErdDbMeta meta, ErdDictionary dict, List<String> itemIds, long sinceRev,
                              Supplier<String> idSource) {
        Map<String, ErdDbDiffItem> diff = new LinkedHashMap<>();
        for (ErdDbDiffItem it : ErdDbDiff.diff(model, meta)) diff.put(it.id(), it);
        List<String> wanted = itemIds.stream().distinct().toList();
        List<String> stale = wanted.stream().filter(id -> !diff.containsKey(id)).toList();
        if (!stale.isEmpty()) return new Built(null, null, stale);

        ErdDiffApplier a = new ErdDiffApplier(model, meta, dict, p -> p + "-" + idSource.get());
        List<ErdDbDiffItem> items = wanted.stream().map(diff::get).toList();
        for (String kind : ADD_KINDS) for (ErdDbDiffItem it : ofKind(items, kind)) a.apply(it);
        a.addNewTableForeignKeys();
        Set<String> unresolved = new HashSet<>();
        for (String kind : OTHER_KINDS) for (ErdDbDiffItem it : ofKind(items, kind)) if (!a.apply(it)) unresolved.add(it.id());
        if (!unresolved.isEmpty()) return new Built(null, null, wanted.stream().filter(unresolved::contains).toList());

        List<ErdChange> elements = a.elements();
        List<String> removed = elements.stream().filter(e -> ErdChange.DELETE.equals(e.op())).map(ErdChange::id).sorted().toList();
        Summary s = new Summary(wanted.size(), a.tablesAdded, a.tablesRemoved, a.columnsAdded, a.columnsRemoved,
                a.columnsChanged, a.relationsAdded, a.dbFkSet, a.dbFkCleared, removed);
        return new Built(new ErdCommand.Restore(sinceRev, elements), s, List.of());
    }

    private static List<ErdDbDiffItem> ofKind(List<ErdDbDiffItem> items, String kind) {
        return items.stream().filter(i -> i.kind().equals(kind)).sorted(Comparator.comparing(ErdDbDiffItem::id)).toList();
    }

    /** @return 넣었으면 true. 자식·부모를 풀 수 없는 FK_ADDED 만 false 다. */
    private boolean apply(ErdDbDiffItem it) {
        switch (it.kind()) {
            case ErdDbDiff.TABLE_ADDED -> addTable(it.table());
            case ErdDbDiff.COLUMN_ADDED -> addColumn(it.table(), it.column());
            case ErdDbDiff.COLUMN_CHANGED -> changeColumn(it.table(), it.column(), it.after());
            case ErdDbDiff.FK_ADDED -> {
                return addForeignKey(it);
            }
            case ErdDbDiff.COLUMN_REMOVED -> removeColumn(it.table(), it.column());
            case ErdDbDiff.TABLE_REMOVED -> removeTable(it.table());
            case ErdDbDiff.FK_REMOVED -> clearForeignKey(it);
            default -> throw new IllegalStateException("모르는 차이 종류입니다: " + it.kind());
        }
        return true;
    }

    // ---- 넣기 ----

    private void addTable(String phys) {
        ErdImportBuilder.TablePart part = ErdImportBuilder.oneTable(meta, phys, dict, ids);
        for (ErdChange e : part.elements()) put(e.kind(), e.id(), e.value());
        newTables.add(phys);
        tablesAdded++;
    }

    private void addColumn(String table, String column) {
        String tid = tableId(table);
        String cid = ids.apply('c');
        work.columns.put(cid, ErdImportBuilder.columnOf(tid, dbColumn(table, column), dict));
        touched.add(new Key("column", cid));
        work.tables.get(tid).columnOrder.add(cid);   // 표 columnOrder 끝에 붙인다
        touched.add(new Key("table", tid));
        columnsAdded++;
    }

    private void changeColumn(String table, String column, Map<String, Object> after) {
        String cid = columnId(tableId(table), column);
        ErdColumn c = work.columns.get(cid);
        c.dataType = (String) after.get("dataType");
        c.length = (Integer) after.get("length");
        c.scale = (Integer) after.get("scale");
        c.notNull = (Boolean) after.get("notNull");
        touched.add(new Key("column", cid));
        columnsChanged++;
    }

    /** 새 표(TABLE_ADDED)가 자식인 DB FK. 부모를 모델에서도 같은 묶음의 새 표에서도 못 찾으면 넣지 않는다(다음 차이의 FK_ADDED). */
    private void addNewTableForeignKeys() {
        for (String phys : newTables) {
            for (ErdDbMeta.Constraint k : meta.constraints()) {
                if (!"R".equals(k.type()) || !phys.equals(k.table())) continue;
                List<List<String>> pairs = resolvePairs(k.table(), k.columns(), k.refTable(), k.refColumns());
                if (pairs == null) continue;
                String rid = ids.apply('r');
                work.relations.put(rid, ErdImportBuilder.dbRelation(meta, k, tableId(k.table()), tableId(k.refTable()), pairs));
                touched.add(new Key("relation", rid));
                relationsAdded++;
            }
        }
    }

    /**
     * FK_ADDED: 같은 자식·부모·짝 집합의 관계가 있으면(상태 무관) dbFk=true. INFERRED 면 DB 로 바꾸고 접기 순위를 지운다.
     * CONFIRMED·REJECTED 는 그대로 둔다(D10). 없으면 새 관계(state DB, 가져오기 규칙의 식별·기수, 근거 DB_FK).
     */
    private boolean addForeignKey(ErdDbDiffItem it) {
        Map<String, Object> fk = it.after();
        String parent = (String) fk.get("parentTable");
        List<String> childCols = strings(fk.get("childColumns"));
        List<String> parentCols = strings(fk.get("parentColumns"));
        List<List<String>> pairs = resolvePairs(it.table(), childCols, parent, parentCols);
        if (pairs == null) return false;
        String childId = tableId(it.table()), parentId = tableId(parent);
        ErdDbMeta.Constraint k = constraint(it.table(), childCols, parent, parentCols);
        String existing = findRelation(childId, parentId, pairs, false);
        if (existing == null) {
            String rid = ids.apply('r');
            work.relations.put(rid, ErdImportBuilder.dbRelation(meta, k, childId, parentId, pairs));
            touched.add(new Key("relation", rid));
            relationsAdded++;
            return true;
        }
        ErdRelation r = work.relations.get(existing);
        r.dbFk = true;
        if ("INFERRED".equals(r.state)) {
            r.state = "DB";
            r.candidateRank = null;
        }
        ErdEvidence ev = new ErdEvidence("DB_FK", k.name());
        if (!r.evidence.contains(ev)) r.evidence.add(ev);
        touched.add(new Key("relation", existing));
        dbFkSet++;
        return true;
    }

    // ---- 지우기·끄기 ----

    private void removeColumn(String table, String column) {
        deleteColumn(columnId(tableId(table), column));
        columnsRemoved++;
    }

    private void removeTable(String phys) {
        String tid = tableId(phys);
        for (String cid : List.copyOf(work.tables.get(tid).columnOrder)) deleteColumn(cid);
        for (var e : List.copyOf(work.keys.entrySet())) if (tid.equals(e.getValue().table)) remove("key", e.getKey());
        for (var e : List.copyOf(work.relations.entrySet())) {
            if (tid.equals(e.getValue().child) || tid.equals(e.getValue().parent)) remove("relation", e.getKey());
        }
        remove("table", tid);
        tablesRemoved++;
    }

    /** 컬럼과 딸린 것: 키 columns 를 줄이고(비면 키를 지운다), 짝에 든 관계를 지우고, 표 columnOrder 에서 뺀다. */
    private void deleteColumn(String cid) {
        ErdColumn col = work.columns.get(cid);
        for (var e : List.copyOf(work.keys.entrySet())) {
            ErdKey k = e.getValue();
            if (!k.columns.remove(cid)) continue;
            if (k.columns.isEmpty()) remove("key", e.getKey());
            else touched.add(new Key("key", e.getKey()));
        }
        for (var e : List.copyOf(work.relations.entrySet())) {
            if (e.getValue().pairs.stream().anyMatch(p -> p.contains(cid))) remove("relation", e.getKey());
        }
        work.tables.get(col.table).columnOrder.remove(cid);
        touched.add(new Key("table", col.table));
        remove("column", cid);
    }

    /**
     * FK_REMOVED: 같은 관계(dbFk=true)의 dbFk=false. 상태 DB 는 CONFIRMED 로 바꾼다(DB 에 없는 FK 를 DB 상태로 두지 않는다).
     * 관계를 지우지 않는다. 같은 묶음의 COLUMN_REMOVED·TABLE_REMOVED 가 이미 지운 관계면 건너뛴다.
     */
    private void clearForeignKey(ErdDbDiffItem it) {
        Map<String, Object> fk = it.before();
        String parent = (String) fk.get("parentTable");
        List<List<String>> pairs = resolvePairs(it.table(), strings(fk.get("childColumns")), parent, strings(fk.get("parentColumns")));
        if (pairs == null) return;
        String rid = findRelation(tableId(it.table()), tableId(parent), pairs, true);
        if (rid == null) return;
        ErdRelation r = work.relations.get(rid);
        r.dbFk = false;
        if ("DB".equals(r.state)) r.state = "CONFIRMED";
        touched.add(new Key("relation", rid));
        dbFkCleared++;
    }

    // ---- 요소 만들기 ----

    /** 원래 모델과 사본의 차이를 요소마다 하나로: 없어졌으면 delete, 새로 생겼으면 upsert(_rev 없이), 바뀌었으면 바뀐 속성만 patch. */
    private List<ErdChange> elements() {
        List<ErdChange> out = new ArrayList<>();
        for (Key k : touched) {
            JsonNode before = snapshot(original, k), after = snapshot(work, k);
            if (after == null) {
                if (before != null) out.add(new ErdChange(k.kind(), k.id(), ErdChange.DELETE, null));
                continue;
            }
            ObjectNode a = ((ObjectNode) after).deepCopy();
            a.remove(REV);
            if (before == null) {
                out.add(new ErdChange(k.kind(), k.id(), ErdChange.UPSERT, a));
                continue;
            }
            ObjectNode patch = ErdModelCodec.MAPPER.createObjectNode();
            Set<String> props = new LinkedHashSet<>();
            before.fieldNames().forEachRemaining(props::add);
            a.fieldNames().forEachRemaining(props::add);
            props.remove(REV);
            for (String p : props) {
                JsonNode b = before.get(p) == null ? NullNode.getInstance() : before.get(p);
                JsonNode v = a.get(p) == null ? NullNode.getInstance() : a.get(p);
                if (!b.equals(v)) patch.set(p, v);
            }
            if (!patch.isEmpty()) out.add(new ErdChange(k.kind(), k.id(), ErdChange.PATCH, patch));
        }
        return out;
    }

    private static JsonNode snapshot(ErdModel m, Key k) {
        Object o = switch (k.kind()) {
            case "table" -> m.tables.get(k.id());
            case "column" -> m.columns.get(k.id());
            case "key" -> m.keys.get(k.id());
            case "relation" -> m.relations.get(k.id());
            default -> throw new IllegalArgumentException(k.kind());
        };
        return o == null ? null : ErdModelCodec.MAPPER.valueToTree(o);
    }

    private void put(String kind, String id, JsonNode value) {
        var mapper = ErdModelCodec.MAPPER;
        try {
            switch (kind) {
                case "table" -> work.tables.put(id, mapper.treeToValue(value, ErdTable.class));
                case "column" -> work.columns.put(id, mapper.treeToValue(value, ErdColumn.class));
                case "key" -> work.keys.put(id, mapper.treeToValue(value, ErdKey.class));
                case "relation" -> work.relations.put(id, mapper.treeToValue(value, ErdRelation.class));
                default -> throw new IllegalArgumentException(kind);
            }
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("가져오기 요소를 읽을 수 없습니다: " + id, e);
        }
        touched.add(new Key(kind, id));
    }

    private void remove(String kind, String id) {
        switch (kind) {
            case "table" -> work.tables.remove(id);
            case "column" -> work.columns.remove(id);
            case "key" -> work.keys.remove(id);
            case "relation" -> work.relations.remove(id);
            default -> throw new IllegalArgumentException(kind);
        }
        touched.add(new Key(kind, id));
    }

    // ---- 찾기(사본 기준 — 같은 묶음에서 넣거나 지운 것이 보인다) ----

    private String tableId(String phys) {
        for (var e : work.tables.entrySet()) if (phys.equals(e.getValue().phys)) return e.getKey();
        return null;
    }

    private String columnId(String tableId, String phys) {
        if (tableId == null) return null;
        for (String cid : work.tables.get(tableId).columnOrder) if (phys.equals(work.columns.get(cid).phys)) return cid;
        return null;
    }

    /** 물리명 짝 → [자식 컬럼 id, 부모 컬럼 id] 목록. 표·컬럼 하나라도 없으면 null. */
    private List<List<String>> resolvePairs(String child, List<String> childCols, String parent, List<String> parentCols) {
        String c = tableId(child), p = tableId(parent);
        if (c == null || p == null || childCols.size() != parentCols.size()) return null;
        List<List<String>> out = new ArrayList<>();
        for (int i = 0; i < childCols.size(); i++) {
            String a = columnId(c, childCols.get(i)), b = columnId(p, parentCols.get(i));
            if (a == null || b == null) return null;
            out.add(List.of(a, b));
        }
        return out;
    }

    /** 같은 모델의 같은 자식·부모·짝 집합(순서 무관) 관계. onlyDbFk 면 dbFk=true 인 것만 본다. */
    private String findRelation(String childId, String parentId, List<List<String>> pairs, boolean onlyDbFk) {
        Set<List<String>> want = new HashSet<>(pairs);
        for (var e : work.relations.entrySet()) {
            ErdRelation r = e.getValue();
            if (r.parentRef == null && childId.equals(r.child) && parentId.equals(r.parent)
                    && (!onlyDbFk || r.dbFk) && new HashSet<>(r.pairs).equals(want)) return e.getKey();
        }
        return null;
    }

    private ErdDbMeta.Column dbColumn(String table, String column) {
        return meta.tables().stream().filter(t -> t.name().equals(table)).flatMap(t -> t.columns().stream())
                .filter(c -> c.name().equals(column)).findFirst()
                .orElseThrow(() -> new IllegalStateException("DB 메타에 없는 컬럼입니다: " + table + "." + column));
    }

    private ErdDbMeta.Constraint constraint(String table, List<String> cols, String refTable, List<String> refCols) {
        return meta.constraints().stream().filter(k -> "R".equals(k.type()) && k.table().equals(table) && k.columns().equals(cols)
                        && Objects.equals(k.refTable(), refTable) && k.refColumns().equals(refCols)).findFirst()
                .orElseThrow(() -> new IllegalStateException("DB 메타에 없는 FK 입니다: " + table + cols + ">" + refTable + refCols));
    }

    @SuppressWarnings("unchecked")
    private static List<String> strings(Object o) {
        return (List<String>) o;
    }
}
```

- [ ] **Step 6: 단위 시험 통과 확인**

Run: `../gradlew :lib:test --max-workers=2 --tests 'com.dongkuk.dmes.mdm.dma.erdEdit.*'`
Expected: 모두 PASS. `ErdDiffApplierTest` 6건과 `ErdImportBuilderTest` 의 새 2건이 돈다. 기존 `ErdImportBuilderTest`(식별·기수·1:1)와 `ErdDbDiffTest`(가져온 직후 차이 0)는 `shape` 로 옮긴 뒤에도 그대로 PASS 다.

- [ ] **Step 7: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/importing \
  src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/engine/Ctx.java \
  src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/importing
/usr/bin/git commit -F - <<'EOF'
feat(erd): 다시 가져오기 반영 요소 ErdDiffApplier·표 하나 만들기·restore 의 candidateRank 기록 제외(S2-14, deferred 51)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

- [ ] **Step 8: 실패하는 Oracle 시험 작성 — 보이지 않는 컬럼(deferred 51 뒷부분)**

`AT/ErdDbMetaReaderTest.java` 의 `ownerIsValidatedAndUnknownOwnerIsEmpty` 다음에 시험 하나와 도움 함수 하나를 더한다. `MCM_SOURCE` 에 표 하나를 만들고 끝에 지운다.

```java
    /** deferred 51: 보이지 않는(INVISIBLE) 컬럼은 COLUMN_ID 가 null 이다. 0 으로 맨 앞에 오지 않고 보이는 컬럼 뒤에 온다. */
    @Test
    void invisibleColumnGoesAfterVisibleColumns() throws Exception {
        try (Connection con = DriverManager.getConnection(url, OTHER, password); Statement st = con.createStatement()) {
            dropInvisible(st);
            try {
                st.execute("CREATE TABLE TB_ERD_INVISIBLE (A VARCHAR2(1 CHAR), H VARCHAR2(1 CHAR) INVISIBLE, B VARCHAR2(1 CHAR))");
                Table t = table(reader.read(OTHER), "TB_ERD_INVISIBLE");
                assertThat(t.columns()).extracting(Column::name).containsExactly("A", "B", "H");
                assertThat(column(t, "H").position()).isGreaterThan(column(t, "B").position());
            } finally {
                dropInvisible(st);
            }
        }
    }

    private static void dropInvisible(Statement st) throws SQLException {
        try {
            st.execute("DROP TABLE TB_ERD_INVISIBLE PURGE");
        } catch (SQLException e) {
            if (e.getErrorCode() != 942) throw e;
        }
    }
```

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdDbMetaReaderTest'`
Expected: `invisibleColumnGoesAfterVisibleColumns` 만 FAIL. 메시지는 `H` 의 position 0 이 `B` 의 2 보다 크지 않다는 것이다.

다른 이유로 실패하면 다음과 같이 가린다.
- `containsExactly` 에서 `H` 가 목록에 없으면, 이 Oracle 의 `ALL_TAB_COLUMNS` 는 보이지 않는 컬럼을 보이지 않는다는 뜻이다. 결함이 없으므로 Step 9 를 하지 않는다. 기대 값을 `containsExactly("A", "B")` 로 바꾸고 position 줄을 지운 뒤 PASS 를 확인한다. 레인 보고에 "deferred 51 의 COLUMN_ID 부분은 재현되지 않음" 을 적는다.

- [ ] **Step 9: 구현 — `E/dbmeta/ErdDbMetaReader.java`**

(1) `COLUMNS_SQL` 의 마지막 줄 `ORDER BY C.TABLE_NAME, C.COLUMN_ID` 를 아래로 바꾼다.

```sql
             ORDER BY C.TABLE_NAME, C.COLUMN_ID NULLS LAST, C.COLUMN_NAME
```

(2) 클래스 상수 자리(`COLUMNS_SQL` 위)에 상수를 더한다.

```java
    /** 보이지 않는 컬럼(COLUMN_ID null)의 자리 시작값. Oracle 표의 컬럼 상한(1000)보다 커서 보이는 컬럼 뒤에 온다(deferred 51). */
    static final int INVISIBLE_POSITION_BASE = 10_000;
```

(3) `query(COLUMNS_SQL, o, rs -> { … })` 안의 `list.add(new ErdDbMeta.Column(rs.getString("COLUMN_NAME"), rs.getInt("COLUMN_ID"), type,` 를 아래 두 문장으로 바꾼다(뒤의 인자 줄은 그대로다).

```java
            Integer columnId = intOrNull(rs, "COLUMN_ID");
            int position = columnId != null ? columnId : INVISIBLE_POSITION_BASE + list.size();
            list.add(new ErdDbMeta.Column(rs.getString("COLUMN_NAME"), position, type,
```

- [ ] **Step 10: Oracle 시험 통과 확인 — 가져오기·차이·메타를 쓰는 시험 전부**

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdDbMetaReaderTest' --tests '*ErdImportTest' --tests '*ErdReadKindsTest' --tests '*ErdInferRegressionTest' --tests '*ErdTypeMappingOracleTest' --tests '*ErdConcurrentSaveHttpTest'`
Expected: 모두 PASS. `ErdDbMetaReaderTest` 는 기존 3건 + 새 1건이다.

Run: `../gradlew :lib:test --max-workers=2 --tests '*ErdEventHubQueueTest'`
Expected: 3건 PASS.

- [ ] **Step 11: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/dbmeta/ErdDbMetaReader.java \
  src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/ErdDbMetaReaderTest.java
/usr/bin/git commit -F - <<'EOF'
fix(erd): 보이지 않는 컬럼을 보이는 컬럼 뒤에 둠 — COLUMN_ID null 을 0 으로 읽지 않음(deferred 51)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

레인 머지는 README Global Constraints 를 따른다(커밋을 하나로 합치기, `--ff-only`, 조정 세션 허가). BE1 은 Task 하나가 끝날 때마다 합칠 수 있다. Task 3 이 합쳐지면 BE2 Task 5 가 rebase 한다.

---

## 계획 작성자 메모

- `ErdEditService.previewStatus` 의 대응(S2-3)은 `E/service/**` 소유인 BE2 Task 5 가 적용한다. Task 1 "Interfaces" 에 바꿀 코드를 적었다.
- 새 api 시험 파일 `AT/ErdTypeMappingOracleTest.java` 를 BE1 이 만든다. 레인 표는 api 시험을 BE2 에 주지만, 새 파일이라 겹치지 않는다. `NUMBER(38,s)` 의 정밀도는 흉내로 확인할 수 없어 실제 DDL 왕복이 필요하다.
- deferred 51 의 `COLUMN_ID` 부분은 레인 표에 소유자가 없는 `E/dbmeta/ErdDbMetaReader.java` 와 BE2 몫인 `AT/ErdDbMetaReaderTest.java` 를 고친다. BE2 의 파일 목록에는 이 시험 파일이 없다. 소유를 바꾸려면 Task 3 Step 8~11 을 BE2 로 옮긴다. (판정: BE1 이 갖는다. README 레인 표에 두 파일과 `AT/ErdTypeMappingOracleTest.java` 를 BE1 소유로 적었다.)
- README 의 `Built` 에는 "부모 표·컬럼을 풀 수 없는 FK_ADDED" 를 알릴 칸이 없다. 그 id 를 `staleIds` 에 넣었다. README 의 거절 문구 "차이 목록에 없는 항목 n개" 는 이 경우에 맞지 않는다. BE2 Task 5 에서 문구를 "차이 목록에 없거나 함께 골라야 할 항목이 빠진 항목 n개가 있습니다" 로 넓히길 제안한다. FE3 Task 15 는 FK_ADDED 를 고르면 부모 쪽 TABLE_ADDED·COLUMN_ADDED 를 함께 고르게 하면 좋다.
- README 는 TABLE_ADDED 의 관계가 "FK_ADDED 항목으로 따로 온다" 고 적었다. 그러나 `ErdDbDiff` 는 자식 표가 모델에 없는 FK 를 FK_ADDED 로 보이지 않는다(`ErdDbDiffTest` "새 표의 FK → TABLE_ADDED 가 덮음"). 그래서 TABLE_ADDED 가 그 표가 자식인 DB FK 를 함께 넣게 했다. 부모를 풀 수 없는 FK 는 다음 차이에 FK_ADDED 로 보인다. 마감(Task 16)과 FE3 는 이 동작을 기준으로 본다.
- README 의 `idSource` 는 `Supplier<String>` 이다. 접두가 필요해서 공급자는 id 몸통만 주고 `ErdDiffApplier` 가 `t-`·`c-`·`k-`·`r-` 를 붙인다. 서비스용으로 UUID 를 쓰는 5인자 `build` 를 더했다.
- 항목 수 1~500 검사와 "모델에 표가 없음" INVALID 는 BE2 서비스가 한다. `ErdDiffApplier` 는 중복 id 만 없앤다.
- README 의 "같은 물리명 표·컬럼이 있으면 INVALID"(TABLE_ADDED·COLUMN_ADDED)는 잠근 모델로 차이를 다시 계산하므로 생길 수 없다. 따로 검사하지 않는다.
- FK_ADDED 가 기존 관계를 고칠 때 README 에 없는 두 가지를 더 한다. `INFERRED` → `DB` 면 `candidateRank` 를 지운다(DB 관계는 null 이라는 단계 1 S7 규칙). 근거에 `DB_FK`+제약 이름이 없으면 더한다.
- COLUMN_ADDED 여러 개는 항목 id 순서(컬럼 이름순)로 `columnOrder` 끝에 붙는다. DB 컬럼 순서가 아니다.
- TABLE_ADDED 에서 뺀 키(함수 기반 인덱스)의 `IMPORT_SKIPPED` 경고는 `Built` 에 칸이 없어 버린다.
- deferred 29: 식별을 끌 때 NOT NULL 은 되돌리지 않는다. 같은 자식 표의 다른 식별 관계가 쓰는 컬럼은 PK 에 남긴다. 둘 다 README 에 없는 세부라 시험으로 고정했다.
- deferred 30: `parentRef.columns` 가 null 이면 짝으로 채운다. 이미 저장된 모델의 빈 `parentRef.columns`(`[]`)는 옮기지 않는다.
- S2-24: 모델 부분은 이미 되돌렸고 다이어그램 부분만 남은 되돌리기는 묶음 전체가 INVALID 가 된다. 드문 경우라 그대로 두었다.
- deferred 31 의 범위는 README 대로 딸린 요소만이다. 단독 `deleteColumn` 은 표 `columnOrder` 를 보지 않는다(`deleteColumnIgnoresPeerColumnOrderChange` 로 고정).
- S2-3 의 `NUMBER`(없음, s) → `NUMBER(38,s)` 는 P3 의 DDL 생성기가 `NUMBER(*,s)` 가 아니라 `NUMBER(38,s)` 로 써야 DB_DIFF 가 비어 있다. `ErdTypeMappingOracleTest` 의 `ddl` 이 그 글자를 쓴다.
- `addColumn`·`updateColumn` 에 호출자가 `dataType: "STRING"` 같은 논리 타입을 직접 넣는 경우는 대응하지 않는다(README 는 도메인 복사만 정했다). 같은 물리명의 다른 컬럼이 있으면 STD_TYPE 경고로만 드러난다. 막으려면 deferred 새 행으로 올린다.
- Task 2 는 약 970줄로 권장 상한(700줄)을 넘는다. `ErdRelationOps` 를 파일 전체로 실었기 때문이다. 나누려면 Step 1~5(31·S2-24·25·32, 자기 커밋)와 Step 6~11(29·30)로 자른다.
- Task 3 은 약 1,040줄로 권장 상한을 넘는다. `ErdDiffApplier` 전체와 `ErdImportBuilder` 의 바뀌는 메서드를 실었기 때문이다. 나누려면 Step 1~7(lib, 자기 커밋)과 Step 8~11(deferred 51 의 `COLUMN_ID`, Oracle)로 자른다.
