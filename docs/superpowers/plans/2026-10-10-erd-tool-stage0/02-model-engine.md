# ERD 도구 단계 0 — Task 3~4: 모델 타입·명령 엔진 1

> 공통 제약(Global Constraints)·스펙과 다르게 정한 점(P1~P10)·Review Focus·파일 구조는 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [01-schema.md](01-schema.md) · [README](README.md) · 다음: [03-relation-standard.md](03-relation-standard.md)

### Task 3: 모델 타입과 JSON 코덱

**Files:**
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/model/{ErdModel,ErdModelInfo,ErdTable,ErdColumn,ErdKey,ErdRelation,ErdCardinality,ErdEvidence,ErdParentRef,PropRev,ErdModelCodec}.java`
- Test: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/model/ErdModelCodecTest.java`

**Interfaces:**
- Produces:
  - `ErdModel` 공개 필드 `schemaVersion`, `model`, `tables`, `columns`, `keys`, `relations`, `tombstones`(JSON `_tombstones`). 맵은 모두 `LinkedHashMap<String, …>`(키 = 요소 UUID).
  - 요소 클래스마다 공개 필드 `rev`(JSON `_rev`) `LinkedHashMap<String, PropRev>`.
  - `record PropRev(long rev, String session)`.
  - `ErdModelCodec.read(String) : ErdModel`, `write(ErdModel) : String`, `copy(ErdModel) : ErdModel`, `MAPPER : ObjectMapper`.

- [ ] **Step 1: 실패하는 시험 작성**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.model;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ErdModelCodecTest {

    static final String JSON = """
        {"schemaVersion":1,"model":{"module":"mcm","schema":"MCMAPUSER"},
         "tables":{"t-1":{"phys":"TB_MCM_SEC_MENU","logical":"메뉴","comment":"","columnOrder":["c-1"],
                          "_rev":{"logical":{"rev":213,"session":"claude-erd-a"}}}},
         "columns":{"c-1":{"table":"t-1","phys":"MENU_ID","logical":"메뉴아이디","domainId":12,"dataType":"VARCHAR2",
                           "length":30,"scale":null,"notNull":true,"default":null,"comment":"","_rev":{}}},
         "keys":{"k-1":{"table":"t-1","kind":"PK","name":"PK_TB_MCM_SEC_MENU","columns":["c-1"],"_rev":{}}},
         "relations":{},"_tombstones":{"c-9":{"rev":200,"session":"ui-41000132"}}}
        """;

    @Test
    void readsAndWritesRoundTrip() {
        ErdModel m = ErdModelCodec.read(JSON);
        assertThat(m.tables.get("t-1").rev.get("logical")).isEqualTo(new PropRev(213, "claude-erd-a"));
        assertThat(m.columns.get("c-1").defaultValue).isNull();
        assertThat(m.tombstones).containsKey("c-9");
        ErdModel again = ErdModelCodec.read(ErdModelCodec.write(m));
        assertThat(ErdModelCodec.write(again)).isEqualTo(ErdModelCodec.write(m));
    }

    @Test
    void copyIsDeep() {
        ErdModel m = ErdModelCodec.read(JSON);
        ErdModel c = ErdModelCodec.copy(m);
        c.tables.get("t-1").logical = "바뀜";
        assertThat(m.tables.get("t-1").logical).isEqualTo("메뉴");
    }

    @Test
    void emptyModelHasDefaults() {
        ErdModel m = ErdModel.empty("mcm", "MCMAPUSER");
        assertThat(ErdModelCodec.write(m)).contains("\"schemaVersion\":1").contains("\"_tombstones\":{}");
    }
}
```

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `cd src/backend/mdm && ../gradlew :lib:test --max-workers=2 --tests '*ErdModelCodecTest'`
Expected: 컴파일 실패.

- [ ] **Step 3: 구현**

```java
// ErdModel.java
package com.dongkuk.dmes.mdm.dma.erdEdit.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.LinkedHashMap;

/** ERD 모델 JSON(스펙 3.1). 엔진 안에서만 고친다 — 밖에서는 {@link ErdModelCodec#copy} 로 받은 사본을 쓴다. */
public final class ErdModel {
    public int schemaVersion = 1;
    public ErdModelInfo model = new ErdModelInfo();
    public LinkedHashMap<String, ErdTable> tables = new LinkedHashMap<>();
    public LinkedHashMap<String, ErdColumn> columns = new LinkedHashMap<>();
    public LinkedHashMap<String, ErdKey> keys = new LinkedHashMap<>();
    public LinkedHashMap<String, ErdRelation> relations = new LinkedHashMap<>();
    /** 지운 요소 id → 지운 rev·세션(계획 P6). NOT_FOUND 응답에 쓴다. */
    @JsonProperty("_tombstones")
    public LinkedHashMap<String, PropRev> tombstones = new LinkedHashMap<>();

    public static ErdModel empty(String module, String schema) {
        ErdModel m = new ErdModel();
        m.model.module = module;
        m.model.schema = schema;
        return m;
    }
}

// ErdModelInfo.java
public final class ErdModelInfo {
    public String module;
    public String schema;
}

// PropRev.java
/** 속성이 마지막으로 바뀐 rev 와 바꾼 세션(스펙 4.3 충돌 판정). */
public record PropRev(long rev, String session) {
}

// ErdTable.java
public final class ErdTable {
    public String phys;
    public String logical;
    public String comment;
    public java.util.List<String> columnOrder = new java.util.ArrayList<>();
    @com.fasterxml.jackson.annotation.JsonProperty("_rev")
    public java.util.LinkedHashMap<String, PropRev> rev = new java.util.LinkedHashMap<>();
}

// ErdColumn.java
public final class ErdColumn {
    public String table;
    public String phys;
    public String logical;
    public Long domainId;
    public String dataType;
    public Integer length;
    public Integer scale;
    public boolean notNull;
    @com.fasterxml.jackson.annotation.JsonProperty("default")
    public String defaultValue;
    public String comment;
    @com.fasterxml.jackson.annotation.JsonProperty("_rev")
    public java.util.LinkedHashMap<String, PropRev> rev = new java.util.LinkedHashMap<>();
}

// ErdKey.java — kind: PK | UK | IX
public final class ErdKey {
    public String table;
    public String kind;
    public String name;
    public java.util.List<String> columns = new java.util.ArrayList<>();
    @com.fasterxml.jackson.annotation.JsonProperty("_rev")
    public java.util.LinkedHashMap<String, PropRev> rev = new java.util.LinkedHashMap<>();
}

// ErdRelation.java — state: DB | INFERRED | CONFIRMED | REJECTED
public final class ErdRelation {
    public String child;
    public String parent;
    /** [자식 컬럼 id, 부모 컬럼 id] 짝. parentRef 가 있으면 부모 쪽은 다른 모델의 컬럼 id 다. */
    public java.util.List<java.util.List<String>> pairs = new java.util.ArrayList<>();
    public boolean identifying;
    public ErdCardinality cardinality = new ErdCardinality();
    public String state = "CONFIRMED";
    public boolean dbFk;
    public java.util.List<ErdEvidence> evidence = new java.util.ArrayList<>();
    public ErdParentRef parentRef;
    @com.fasterxml.jackson.annotation.JsonProperty("_rev")
    public java.util.LinkedHashMap<String, PropRev> rev = new java.util.LinkedHashMap<>();
}

// ErdCardinality.java — parent: ONE | ZERO_OR_ONE, child: ZERO_OR_MORE | ONE_OR_MORE | ZERO_OR_ONE | ONE
public final class ErdCardinality {
    public String parent = "ONE";
    public String child = "ZERO_OR_MORE";
}

// ErdEvidence.java — kind: DB_FK | DOC | SQL_JOIN | NAME_RULE
public record ErdEvidence(String kind, String ref) {
}

// ErdParentRef.java — 모듈 사이 관계의 부모(스펙 D8)
public record ErdParentRef(String model, String table, java.util.List<String> columns) {
}

// ErdModelCodec.java
package com.dongkuk.dmes.mdm.dma.erdEdit.model;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;

/** MODEL_JSON 읽기·쓰기. 키 순서는 삽입 순서를 지킨다(스냅샷·diff 가 흔들리지 않게). */
public final class ErdModelCodec {

    public static final ObjectMapper MAPPER = JsonMapper.builder()
            .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, false)
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, true)
            .build();

    private ErdModelCodec() {
    }

    public static ErdModel read(String json) {
        try {
            return MAPPER.readValue(json, ErdModel.class);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("MODEL_JSON 을 읽을 수 없습니다: " + e.getOriginalMessage(), e);
        }
    }

    public static String write(ErdModel model) {
        try {
            return MAPPER.writeValueAsString(model);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("MODEL_JSON 을 쓸 수 없습니다", e);
        }
    }

    public static ErdModel copy(ErdModel model) {
        return read(write(model));
    }
}
```
요소 클래스는 각각 자기 파일에 두고 `package` 선언과 필요한 import 를 적는다(위에서는 지면을 줄이려고 완전한 이름을 썼다).

- [ ] **Step 4: 시험 통과 확인**

Run: Step 2 명령. Expected: 3건 PASS.

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib
/usr/bin/git commit -m "feat(mdm): ERD 모델 JSON 타입·코덱"
```

---

### Task 4: 명령 엔진 1 — 표·컬럼·키, 충돌, 되돌리기

**Files:**
- Create: `.../dma/erdEdit/engine/{ErdCommand,ErdCommandEngine,ApplyOutcome,ErdChange,ErdRejection,ErdWarning,ErdIds,ErdNaming,ErdDomainSpec}.java`
- Test: `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/engine/ErdCommandEngineTableColumnTest.java`

**Interfaces:**
- Consumes: Task 3 모델 타입, `ErdModelCodec.copy`.
- Produces:
  - `sealed interface ErdCommand` — JSON `op` 로 하위형을 고른다. 이 Task 의 하위형: `AddTable(id, phys, logical, comment)`, `UpdateTable(id, Map<String,Object> set)`, `DeleteTable(id)`, `AddColumn(id, table, phys, logical, domainId, dataType, length, scale, notNull, defaultValue, comment, position)`, `UpdateColumn(id, set)`, `MoveColumn(id, position)`, `DeleteColumn(id)`, `ApplyDomain(id, domainId)`, `SetPrimaryKey(table, columns, name)`, `AddKey(id, table, kind, name, columns)`, `UpdateKey(id, set)`, `DeleteKey(id)`, `Restore(sinceRev, List<ErdChange> elements)`.
  - `record ErdChange(String kind, String id, String op, JsonNode value)` — kind `table|column|key|relation|diagram|diagramNode`, op `upsert|delete`.
  - `sealed interface ApplyOutcome permits Applied, Rejected`; `record Applied(ErdModel next, List<ErdChange> changes, List<ErdCommand> inverse, List<ErdWarning> warnings)`; `record Rejected(ErdRejection rejection)`.
  - `record ErdRejection(String code, int commandIndex, String message, String hint, String elementId, String property, Long byRev, String bySession, JsonNode current, JsonNode choices)` — code `INVALID|CONFLICT|NOT_FOUND|NEEDS_CHOICE`.
  - `record ErdWarning(String code, String elementId, String message)`.
  - `interface ErdNaming` (Task 6 이 구현) 와 `ErdNaming.NONE`(아무 판정 안 함).
  - `new ErdCommandEngine(ErdNaming naming)`; `ApplyOutcome apply(ErdModel current, long baseRev, long newRev, String session, List<ErdCommand> commands)`.

- [ ] **Step 1: 실패하는 시험 작성**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ErdCommandEngineTableColumnTest {

    final ErdCommandEngine engine = new ErdCommandEngine(ErdNaming.NONE);

    ErdModel base() {
        ErdModel m = ErdModel.empty("mcm", "MCMAPUSER");
        var r = (ApplyOutcome.Applied) engine.apply(m, 0, 1, "s-a", List.of(
                new AddTable("t-1", "TB_MCM_SEC_ROLE", "역할", ""),
                new AddColumn("c-1", "t-1", "ROLE_ID", "역할아이디", null, "VARCHAR2", 30, null, true, null, "", null),
                new AddColumn("c-2", "t-1", "ROLE_NM", "역할명", null, "VARCHAR2", 100, null, false, null, "", null),
                new SetPrimaryKey("t-1", List.of("c-1"), null)));
        return r.next();
    }

    @Test
    void addRecordsRevAndDelta() {
        ErdModel m = base();
        assertThat(m.tables.get("t-1").columnOrder).containsExactly("c-1", "c-2");
        assertThat(m.columns.get("c-2").rev.get("logical").rev()).isEqualTo(1);
        assertThat(m.keys.values()).singleElement().satisfies(k -> {
            assertThat(k.kind).isEqualTo("PK");
            assertThat(k.name).isEqualTo("PK_TB_MCM_SEC_ROLE");
        });
    }

    @Test
    void batchRefersToElementCreatedEarlier() {
        var out = engine.apply(ErdModel.empty("mcm", "S"), 0, 1, "s-a", List.of(
                new AddTable("t-9", "TB_X", "엑스", ""),
                new AddColumn("c-9", "t-9", "X_ID", "엑스아이디", null, "VARCHAR2", 10, null, true, null, "", null)));
        assertThat(out).isInstanceOf(ApplyOutcome.Applied.class);
    }

    @Test
    void sameSessionCanOverwriteItsOwnChange() {
        ErdModel m = base();
        var out = engine.apply(m, 0, 2, "s-a", List.of(new UpdateColumn("c-2", Map.of("logical", "역할이름"))));
        assertThat(out).isInstanceOf(ApplyOutcome.Applied.class);
    }

    @Test
    void otherSessionOnSamePropertyConflicts() {
        ErdModel m = ((ApplyOutcome.Applied) engine.apply(base(), 1, 2, "s-b",
                List.of(new UpdateColumn("c-2", Map.of("logical", "역할설명"))))).next();
        var out = engine.apply(m, 1, 3, "s-a", List.of(new UpdateColumn("c-2", Map.of("logical", "역할이름"))));
        var rej = ((ApplyOutcome.Rejected) out).rejection();
        assertThat(rej.code()).isEqualTo("CONFLICT");
        assertThat(rej.property()).isEqualTo("logical");
        assertThat(rej.byRev()).isEqualTo(2);
        assertThat(rej.bySession()).isEqualTo("s-b");
        assertThat(rej.current().asText()).isEqualTo("역할설명");
    }

    @Test
    void otherSessionOnDifferentPropertyApplies() {
        ErdModel m = ((ApplyOutcome.Applied) engine.apply(base(), 1, 2, "s-b",
                List.of(new UpdateColumn("c-2", Map.of("logical", "역할설명"))))).next();
        var out = engine.apply(m, 1, 3, "s-a", List.of(new UpdateColumn("c-2", Map.of("length", 200))));
        assertThat(out).isInstanceOf(ApplyOutcome.Applied.class);
    }

    @Test
    void batchIsAllOrNothing() {
        ErdModel m = base();
        var out = engine.apply(m, 1, 2, "s-a", List.of(
                new UpdateColumn("c-2", Map.of("logical", "바뀜")),
                new AddColumn("c-3", "t-1", "ROLE_NM", "중복", null, "VARCHAR2", 1, null, false, null, "", null)));
        assertThat(((ApplyOutcome.Rejected) out).rejection().code()).isEqualTo("INVALID");
        assertThat(((ApplyOutcome.Rejected) out).rejection().commandIndex()).isEqualTo(1);
        assertThat(m.columns.get("c-2").logical).isEqualTo("역할명");
    }

    @Test
    void invalidOracleIdentifierRejected() {
        var out = engine.apply(base(), 1, 2, "s-a", List.of(new UpdateTable("t-1", Map.of("phys", "tb role"))));
        assertThat(((ApplyOutcome.Rejected) out).rejection().code()).isEqualTo("INVALID");
    }

    @Test
    void unknownSetKeyRejected() {
        var out = engine.apply(base(), 1, 2, "s-a", List.of(new UpdateColumn("c-2", Map.of("color", "red"))));
        assertThat(((ApplyOutcome.Rejected) out).rejection().code()).isEqualTo("INVALID");
    }

    @Test
    void deletedElementIsNotFoundWithTombstone() {
        ErdModel m = ((ApplyOutcome.Applied) engine.apply(base(), 1, 2, "s-b", List.of(new DeleteColumn("c-2")))).next();
        var rej = ((ApplyOutcome.Rejected) engine.apply(m, 1, 3, "s-a",
                List.of(new UpdateColumn("c-2", Map.of("logical", "x"))))).rejection();
        assertThat(rej.code()).isEqualTo("NOT_FOUND");
        assertThat(rej.byRev()).isEqualTo(2);
        assertThat(rej.bySession()).isEqualTo("s-b");
    }

    @Test
    void deleteColumnInPkShrinksKeyAndUndoRestores() {
        var del = (ApplyOutcome.Applied) engine.apply(base(), 1, 2, "s-a", List.of(new DeleteColumn("c-1")));
        assertThat(del.next().keys).isEmpty();
        var undo = engine.apply(del.next(), 2, 3, "s-a", del.inverse());
        ErdModel back = ((ApplyOutcome.Applied) undo).next();
        assertThat(back.columns).containsKey("c-1");
        assertThat(back.keys.values()).singleElement().satisfies(k -> assertThat(k.columns).containsExactly("c-1"));
        assertThat(back.tables.get("t-1").columnOrder).containsExactly("c-1", "c-2");
    }

    @Test
    void undoConflictsWhenOtherSessionChangedLater() {
        var mine = (ApplyOutcome.Applied) engine.apply(base(), 1, 2, "s-a",
                List.of(new UpdateColumn("c-2", Map.of("logical", "내 값"))));
        ErdModel later = ((ApplyOutcome.Applied) engine.apply(mine.next(), 2, 3, "s-b",
                List.of(new UpdateColumn("c-2", Map.of("logical", "남의 값"))))).next();
        var out = engine.apply(later, 3, 4, "s-a", mine.inverse());
        assertThat(((ApplyOutcome.Rejected) out).rejection().code()).isEqualTo("CONFLICT");
    }

    @Test
    void deltaContainsOnlyTouchedElements() {
        var out = (ApplyOutcome.Applied) engine.apply(base(), 1, 2, "s-a",
                List.of(new UpdateColumn("c-2", Map.of("logical", "역할이름"))));
        assertThat(out.changes()).extracting(ErdChange::kind, ErdChange::id, ErdChange::op)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("column", "c-2", "upsert"));
    }
}
```

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `cd src/backend/mdm && ../gradlew :lib:test --max-workers=2 --tests '*ErdCommandEngineTableColumnTest'`
Expected: 컴파일 실패.

- [ ] **Step 3: 명령·결과 타입 작성**

```java
// ErdCommand.java
package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import java.util.List;
import java.util.Map;

/**
 * 모델 명령(스펙 4.1). JSON 은 {@code {"op":"updateColumn", ...}}. id 가 null 인 add 명령은 엔진이 id 를 만든다.
 * 다이어그램 명령은 버전 밖이라 엔진이 아니라 ErdDiagramStore 가 처리한다(Task 9).
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "op")
@JsonSubTypes({
        @JsonSubTypes.Type(value = ErdCommand.AddTable.class, name = "addTable"),
        @JsonSubTypes.Type(value = ErdCommand.UpdateTable.class, name = "updateTable"),
        @JsonSubTypes.Type(value = ErdCommand.DeleteTable.class, name = "deleteTable"),
        @JsonSubTypes.Type(value = ErdCommand.AddColumn.class, name = "addColumn"),
        @JsonSubTypes.Type(value = ErdCommand.UpdateColumn.class, name = "updateColumn"),
        @JsonSubTypes.Type(value = ErdCommand.MoveColumn.class, name = "moveColumn"),
        @JsonSubTypes.Type(value = ErdCommand.DeleteColumn.class, name = "deleteColumn"),
        @JsonSubTypes.Type(value = ErdCommand.ApplyDomain.class, name = "applyDomain"),
        @JsonSubTypes.Type(value = ErdCommand.SetPrimaryKey.class, name = "setPrimaryKey"),
        @JsonSubTypes.Type(value = ErdCommand.AddKey.class, name = "addKey"),
        @JsonSubTypes.Type(value = ErdCommand.UpdateKey.class, name = "updateKey"),
        @JsonSubTypes.Type(value = ErdCommand.DeleteKey.class, name = "deleteKey"),
        @JsonSubTypes.Type(value = ErdCommand.AddRelation.class, name = "addRelation"),
        @JsonSubTypes.Type(value = ErdCommand.UpdateRelation.class, name = "updateRelation"),
        @JsonSubTypes.Type(value = ErdCommand.ConfirmRelation.class, name = "confirmRelation"),
        @JsonSubTypes.Type(value = ErdCommand.RejectRelation.class, name = "rejectRelation"),
        @JsonSubTypes.Type(value = ErdCommand.DeleteRelation.class, name = "deleteRelation"),
        @JsonSubTypes.Type(value = ErdCommand.Restore.class, name = "restore")
})
public sealed interface ErdCommand {

    record AddTable(String id, String phys, String logical, String comment) implements ErdCommand {}
    record UpdateTable(String id, Map<String, Object> set) implements ErdCommand {}
    record DeleteTable(String id) implements ErdCommand {}

    record AddColumn(String id, String table, String phys, String logical, Long domainId, String dataType,
                     Integer length, Integer scale, Boolean notNull, String defaultValue, String comment,
                     Integer position) implements ErdCommand {}
    record UpdateColumn(String id, Map<String, Object> set) implements ErdCommand {}
    record MoveColumn(String id, int position) implements ErdCommand {}
    record DeleteColumn(String id) implements ErdCommand {}
    record ApplyDomain(String id, Long domainId) implements ErdCommand {}

    record SetPrimaryKey(String table, List<String> columns, String name) implements ErdCommand {}
    record AddKey(String id, String table, String kind, String name, List<String> columns) implements ErdCommand {}
    record UpdateKey(String id, Map<String, Object> set) implements ErdCommand {}
    record DeleteKey(String id) implements ErdCommand {}

    /** Task 5. onNameClash: ASK(기본) | REUSE | RENAME. */
    record AddRelation(String id, String child, String parent, ErdParentRefArg parentRef, boolean identifying,
                       List<List<String>> pairs, String onNameClash, Boolean dbFk) implements ErdCommand {}
    record ErdParentRefArg(String model, String table, List<String> columns) {}
    record UpdateRelation(String id, Map<String, Object> set) implements ErdCommand {}
    record ConfirmRelation(String id) implements ErdCommand {}
    record RejectRelation(String id) implements ErdCommand {}
    record DeleteRelation(String id) implements ErdCommand {}

    /** 되돌리기 전용. elements 의 상태로 되돌린다. sinceRev 뒤에 다른 세션이 고친 요소가 있으면 CONFLICT. */
    record Restore(long sinceRev, List<ErdChange> elements) implements ErdCommand {}
}

// ErdChange.java
/** 델타 한 건(스펙 4.4). value 는 upsert 면 요소 JSON, delete 면 null. */
public record ErdChange(String kind, String id, String op, com.fasterxml.jackson.databind.JsonNode value) {
    public static final String UPSERT = "upsert";
    public static final String DELETE = "delete";
}

// ErdRejection.java
/** 거절(스펙 4.2·4.5). hint 는 "다음에 할 일" 문장이다. */
public record ErdRejection(String code, int commandIndex, String message, String hint, String elementId,
                           String property, Long byRev, String bySession,
                           com.fasterxml.jackson.databind.JsonNode current,
                           com.fasterxml.jackson.databind.JsonNode choices) {
    public static final String INVALID = "INVALID";
    public static final String CONFLICT = "CONFLICT";
    public static final String NOT_FOUND = "NOT_FOUND";
    public static final String NEEDS_CHOICE = "NEEDS_CHOICE";
}

// ErdWarning.java — code: STD_MISS | STD_DOMAIN | STD_TYPE | STD_NEW | CLAIMED
public record ErdWarning(String code, String elementId, String message) {
}

// ApplyOutcome.java
public sealed interface ApplyOutcome {
    record Applied(com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel next, java.util.List<ErdChange> changes,
                   java.util.List<ErdCommand> inverse, java.util.List<ErdWarning> warnings) implements ApplyOutcome {}
    record Rejected(ErdRejection rejection) implements ApplyOutcome {}
}

// ErdDomainSpec.java
public record ErdDomainSpec(Long domainId, String domainName, String dataType, Integer length, Integer scale) {
}

// ErdNaming.java
package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.naming.NameComposition;
import java.util.List;
import java.util.Optional;

/** 엔진이 쓰는 사전 판정(Task 6 의 ErdDictionary 가 구현). 엔진은 DB 를 모른다. */
public interface ErdNaming {

    /** 논리명 → 물리명 분해. 사전이 없으면 empty. */
    Optional<NameComposition> forward(String logical);

    Optional<ErdDomainSpec> domain(Long domainId);

    Optional<ErdDomainSpec> recommendDomain(String physName);

    /** 바뀐 컬럼의 표준 경고(모델 전체를 보고 타입 불일치까지 판정). */
    List<ErdWarning> warnings(ErdModel model, List<String> columnIds);

    ErdNaming NONE = new ErdNaming() {
        public Optional<NameComposition> forward(String logical) { return Optional.empty(); }
        public Optional<ErdDomainSpec> domain(Long domainId) { return Optional.empty(); }
        public Optional<ErdDomainSpec> recommendDomain(String physName) { return Optional.empty(); }
        public List<ErdWarning> warnings(ErdModel model, List<String> columnIds) { return List.of(); }
    };
}

// ErdIds.java
public final class ErdIds {
    private static final java.util.regex.Pattern ORACLE_ID = java.util.regex.Pattern.compile("^[A-Z][A-Z0-9_$#]{0,127}$");
    private static final java.util.regex.Pattern ELEMENT_ID = java.util.regex.Pattern.compile("^[a-z]-[0-9a-zA-Z-]{1,48}$");
    private ErdIds() {}
    public static String newId(char prefix) { return prefix + "-" + java.util.UUID.randomUUID(); }
    public static boolean isOracleIdentifier(String s) { return s != null && ORACLE_ID.matcher(s).matches(); }
    public static boolean isElementId(String s) { return s != null && ELEMENT_ID.matcher(s).matches(); }
}
```

- [ ] **Step 4: 엔진 작성**

엔진의 규칙:
- `apply` 는 `current` 를 `ErdModelCodec.copy` 한 작업 사본에서 명령을 차례로 처리한다. 하나라도 거절되면 사본을 버리고 `Rejected` 를 돌려준다(원본은 그대로).
- 명령마다 "고치기 전 요소" 를 `before` 맵(kind:id → JsonNode 또는 null)에 처음 한 번만 담는다. 묶음이 끝나면 `before` 에 있는 모든 요소의 "고친 뒤" 상태로 `changes` 를 만들고, `before` 그대로 `Restore(newRev, …)` 하나를 `inverse` 로 돌려준다.
- 충돌 판정 `checkConflict(prev, props)`: `prev.rev` 에서 `props` 의 각 속성에 대해 `pr.rev() > baseRev && !pr.session().equals(session)` 이면 CONFLICT. 삭제 명령은 요소의 모든 `_rev` 항목을 본다.
- 묶음 안의 같은 세션 쓰기는 `_rev` 에 `newRev` 로 남는다. `newRev > baseRev` 이므로 같은 묶음의 뒤 명령이 자기 앞 명령과 충돌하지 않도록 세션 비교가 먼저다.
- 요소 삭제는 `tombstones.put(id, new PropRev(newRev, session))`. 요소를 다시 넣으면(Restore) tombstone 을 지운다.
- 대상 요소가 없을 때: tombstone 이 있으면 `NOT_FOUND`(byRev·bySession 채움), 없으면 `INVALID`("없는 요소 id").

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.*;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;

/** ERD 명령 엔진(스펙 4.1~4.3). 순수 함수 — DB·시각·스프링을 모른다. */
public final class ErdCommandEngine {

    static final Set<String> TABLE_PROPS = Set.of("phys", "logical", "comment");
    static final Set<String> COLUMN_PROPS = Set.of("phys", "logical", "domainId", "dataType", "length", "scale",
            "notNull", "default", "comment");
    static final Set<String> KEY_PROPS = Set.of("name", "columns");
    static final Set<String> RELATION_PROPS = Set.of("identifying", "cardinality", "dbFk");

    private final ErdNaming naming;

    public ErdCommandEngine(ErdNaming naming) {
        this.naming = naming;
    }

    public ApplyOutcome apply(ErdModel current, long baseRev, long newRev, String session, List<ErdCommand> commands) {
        Ctx c = new Ctx(ErdModelCodec.copy(current), baseRev, newRev, session);
        for (int i = 0; i < commands.size(); i++) {
            c.index = i;
            try {
                dispatch(c, commands.get(i));
            } catch (Reject r) {
                return new ApplyOutcome.Rejected(r.rejection);
            }
        }
        List<ErdChange> changes = new ArrayList<>();
        List<ErdChange> restore = new ArrayList<>();
        List<String> touchedColumns = new ArrayList<>();
        for (var e : c.before.entrySet()) {
            String kind = e.getKey().kind(), id = e.getKey().id();
            JsonNode after = c.snapshot(kind, id);
            changes.add(new ErdChange(kind, id, after == null ? ErdChange.DELETE : ErdChange.UPSERT, after));
            restore.add(new ErdChange(kind, id, e.getValue() == null ? ErdChange.DELETE : ErdChange.UPSERT, e.getValue()));
            if (kind.equals("column") && after != null) touchedColumns.add(id);
        }
        List<ErdWarning> warnings = new ArrayList<>(naming.warnings(c.m, touchedColumns));
        warnings.addAll(c.warnings);
        List<ErdCommand> inverse = restore.isEmpty() ? List.of() : List.of(new Restore(newRev, restore));
        return new ApplyOutcome.Applied(c.m, changes, inverse, warnings);
    }

    private void dispatch(Ctx c, ErdCommand cmd) {
        switch (cmd) {
            case AddTable a -> addTable(c, a);
            case UpdateTable u -> updateTable(c, u);
            case DeleteTable d -> deleteTable(c, d.id());
            case AddColumn a -> addColumn(c, a);
            case UpdateColumn u -> updateColumn(c, u);
            case MoveColumn mv -> moveColumn(c, mv);
            case DeleteColumn d -> deleteColumn(c, d.id(), true);
            case ApplyDomain ad -> applyDomain(c, ad);
            case SetPrimaryKey pk -> setPrimaryKey(c, pk);
            case AddKey a -> addKey(c, a);
            case UpdateKey u -> updateKey(c, u);
            case DeleteKey d -> deleteKey(c, d.id(), true);
            case AddRelation a -> ErdRelationOps.add(this, c, a);
            case UpdateRelation u -> ErdRelationOps.update(c, u);
            case ConfirmRelation cr -> ErdRelationOps.setState(c, cr.id(), "CONFIRMED");
            case RejectRelation rr -> ErdRelationOps.setState(c, rr.id(), "REJECTED");
            case DeleteRelation d -> ErdRelationOps.delete(c, d.id(), true);
            case Restore r -> restore(c, r);
        }
    }

    // ---- 표 ----

    private void addTable(Ctx c, AddTable a) {
        String id = c.newIdOrGiven(a.id(), 't');
        requireOracleId(c, a.phys(), "phys", id);
        if (c.m.tables.values().stream().anyMatch(t -> a.phys().equals(t.phys))) {
            throw c.invalid("같은 물리명의 표가 이미 있습니다: " + a.phys(), "다른 물리명을 쓰세요", id, "phys");
        }
        c.touch("table", id);
        ErdTable t = new ErdTable();
        t.phys = a.phys();
        t.logical = a.logical();
        t.comment = a.comment() == null ? "" : a.comment();
        c.m.tables.put(id, t);
        c.m.tombstones.remove(id);
        c.stamp(t.rev, TABLE_PROPS);
    }

    private void updateTable(Ctx c, UpdateTable u) {
        ErdTable t = c.table(u.id());
        c.requireKnownKeys(u.set(), TABLE_PROPS, u.id());
        c.checkConflict(t.rev, u.set().keySet(), u.id(), c.node(t));
        c.touch("table", u.id());
        for (var e : u.set().entrySet()) {
            switch (e.getKey()) {
                case "phys" -> {
                    String phys = (String) e.getValue();
                    requireOracleId(c, phys, "phys", u.id());
                    boolean dup = c.m.tables.entrySet().stream()
                            .anyMatch(x -> !x.getKey().equals(u.id()) && phys.equals(x.getValue().phys));
                    if (dup) throw c.invalid("같은 물리명의 표가 이미 있습니다: " + phys, "다른 물리명을 쓰세요", u.id(), "phys");
                    t.phys = phys;
                }
                case "logical" -> t.logical = (String) e.getValue();
                case "comment" -> t.comment = (String) e.getValue();
                default -> throw new IllegalStateException();
            }
        }
        c.stamp(t.rev, u.set().keySet());
    }

    void deleteTable(Ctx c, String id) {
        ErdTable t = c.table(id);
        c.checkConflict(t.rev, t.rev.keySet(), id, c.node(t));
        for (String colId : List.copyOf(t.columnOrder)) deleteColumn(c, colId, false);
        for (var e : List.copyOf(c.m.keys.entrySet())) if (id.equals(e.getValue().table)) deleteKey(c, e.getKey(), false);
        for (var e : List.copyOf(c.m.relations.entrySet())) {
            ErdRelation r = e.getValue();
            if (id.equals(r.child) || id.equals(r.parent)) ErdRelationOps.delete(c, e.getKey(), false);
        }
        c.touch("table", id);
        c.m.tables.remove(id);
        c.m.tombstones.put(id, new PropRev(c.newRev, c.session));
    }

    // ---- 컬럼 ----

    void addColumn(Ctx c, AddColumn a) {
        ErdTable t = c.table(a.table());
        String id = c.newIdOrGiven(a.id(), 'c');
        String phys = a.phys();
        Long domainId = a.domainId();
        if (phys == null) {
            ErdColumnFill fill = ErdColumnFill.fromLogical(naming, c, a.logical(), id);  // Task 6. 이 Task 에서는 INVALID 만 던진다.
            phys = fill.phys();
            if (domainId == null) domainId = fill.domainId();
        }
        requireOracleId(c, phys, "phys", id);
        String finalPhys = phys;
        if (t.columnOrder.stream().anyMatch(cid -> finalPhys.equals(c.m.columns.get(cid).phys))) {
            throw c.invalid("표 " + t.phys + " 에 같은 물리명의 컬럼이 있습니다: " + phys, "다른 물리명을 쓰세요", id, "phys");
        }
        c.touch("table", a.table());
        c.touch("column", id);
        ErdColumn col = new ErdColumn();
        col.table = a.table();
        col.phys = phys;
        col.logical = a.logical();
        col.domainId = domainId;
        col.dataType = a.dataType();
        col.length = a.length();
        col.scale = a.scale();
        col.notNull = Boolean.TRUE.equals(a.notNull());
        col.defaultValue = a.defaultValue();
        col.comment = a.comment() == null ? "" : a.comment();
        if (col.dataType == null && domainId != null) naming.domain(domainId).ifPresent(d -> copyDomain(col, d));
        c.m.columns.put(id, col);
        c.m.tombstones.remove(id);
        int pos = a.position() == null ? t.columnOrder.size() : Math.max(0, Math.min(a.position(), t.columnOrder.size()));
        t.columnOrder.add(pos, id);
        c.stamp(col.rev, COLUMN_PROPS);
        c.stamp(t.rev, Set.of("columnOrder"));
    }

    private void updateColumn(Ctx c, UpdateColumn u) {
        ErdColumn col = c.column(u.id());
        c.requireKnownKeys(u.set(), COLUMN_PROPS, u.id());
        c.checkConflict(col.rev, u.set().keySet(), u.id(), c.node(col));
        c.touch("column", u.id());
        for (var e : u.set().entrySet()) {
            Object v = e.getValue();
            switch (e.getKey()) {
                case "phys" -> {
                    String phys = (String) v;
                    requireOracleId(c, phys, "phys", u.id());
                    ErdTable t = c.m.tables.get(col.table);
                    boolean dup = t.columnOrder.stream()
                            .anyMatch(cid -> !cid.equals(u.id()) && phys.equals(c.m.columns.get(cid).phys));
                    if (dup) throw c.invalid("같은 물리명의 컬럼이 있습니다: " + phys, "다른 물리명을 쓰세요", u.id(), "phys");
                    col.phys = phys;
                }
                case "logical" -> col.logical = (String) v;
                case "domainId" -> col.domainId = v == null ? null : ((Number) v).longValue();
                case "dataType" -> col.dataType = (String) v;
                case "length" -> col.length = v == null ? null : ((Number) v).intValue();
                case "scale" -> col.scale = v == null ? null : ((Number) v).intValue();
                case "notNull" -> col.notNull = Boolean.TRUE.equals(v);
                case "default" -> col.defaultValue = (String) v;
                case "comment" -> col.comment = (String) v;
                default -> throw new IllegalStateException();
            }
        }
        c.stamp(col.rev, u.set().keySet());
    }

    private void moveColumn(Ctx c, MoveColumn mv) {
        ErdColumn col = c.column(mv.id());
        ErdTable t = c.m.tables.get(col.table);
        c.checkConflict(t.rev, Set.of("columnOrder"), col.table, c.node(t));
        c.touch("table", col.table);
        t.columnOrder.remove(mv.id());
        t.columnOrder.add(Math.max(0, Math.min(mv.position(), t.columnOrder.size())), mv.id());
        c.stamp(t.rev, Set.of("columnOrder"));
    }

    void deleteColumn(Ctx c, String id, boolean checkConflict) {
        ErdColumn col = c.column(id);
        if (checkConflict) c.checkConflict(col.rev, col.rev.keySet(), id, c.node(col));
        for (var e : List.copyOf(c.m.keys.entrySet())) {
            ErdKey k = e.getValue();
            if (k.columns.contains(id)) {
                c.touch("key", e.getKey());
                k.columns.remove(id);
                if (k.columns.isEmpty()) deleteKey(c, e.getKey(), false);
                else c.stamp(k.rev, Set.of("columns"));
            }
        }
        for (var e : List.copyOf(c.m.relations.entrySet())) {
            boolean uses = e.getValue().pairs.stream().anyMatch(p -> p.contains(id));
            if (uses) ErdRelationOps.delete(c, e.getKey(), false);
        }
        ErdTable t = c.m.tables.get(col.table);
        c.touch("table", col.table);
        t.columnOrder.remove(id);
        c.stamp(t.rev, Set.of("columnOrder"));
        c.touch("column", id);
        c.m.columns.remove(id);
        c.m.tombstones.put(id, new PropRev(c.newRev, c.session));
    }

    private void applyDomain(Ctx c, ApplyDomain ad) {
        ErdColumn col = c.column(ad.id());
        ErdDomainSpec d = naming.domain(ad.domainId()).orElseThrow(() ->
                c.invalid("없는 도메인입니다: " + ad.domainId(), "도메인 목록에서 고르세요", ad.id(), "domainId"));
        Set<String> props = Set.of("domainId", "dataType", "length", "scale");
        c.checkConflict(col.rev, props, ad.id(), c.node(col));
        c.touch("column", ad.id());
        col.domainId = d.domainId();
        copyDomain(col, d);
        c.stamp(col.rev, props);
    }

    static void copyDomain(ErdColumn col, ErdDomainSpec d) {
        col.dataType = d.dataType();
        col.length = d.length();
        col.scale = d.scale();
    }

    // ---- 키 ----

    private void setPrimaryKey(Ctx c, SetPrimaryKey pk) {
        ErdTable t = c.table(pk.table());
        for (String cid : pk.columns()) {
            ErdColumn col = c.column(cid);
            if (!pk.table().equals(col.table)) throw c.invalid("다른 표의 컬럼입니다: " + cid, "같은 표의 컬럼만 고르세요", cid, "columns");
        }
        String keyId = c.m.keys.entrySet().stream()
                .filter(e -> pk.table().equals(e.getValue().table) && "PK".equals(e.getValue().kind))
                .map(Map.Entry::getKey).findFirst().orElse(null);
        if (pk.columns().isEmpty()) {
            if (keyId != null) deleteKey(c, keyId, true);
            return;
        }
        if (keyId == null) {
            addKey(c, new AddKey(null, pk.table(), "PK", pk.name() == null ? "PK_" + t.phys : pk.name(), pk.columns()));
        } else {
            Map<String, Object> set = new LinkedHashMap<>();
            set.put("columns", pk.columns());
            if (pk.name() != null) set.put("name", pk.name());
            updateKey(c, new UpdateKey(keyId, set));
        }
        for (String cid : pk.columns()) {
            ErdColumn col = c.m.columns.get(cid);
            if (!col.notNull) {
                c.touch("column", cid);
                col.notNull = true;
                c.stamp(col.rev, Set.of("notNull"));
            }
        }
    }

    private void addKey(Ctx c, AddKey a) {
        c.table(a.table());
        if (!Set.of("PK", "UK", "IX").contains(a.kind())) throw c.invalid("키 종류는 PK·UK·IX 입니다", "kind 를 고치세요", a.id(), "kind");
        String id = c.newIdOrGiven(a.id(), 'k');
        requireOracleId(c, a.name(), "name", id);
        if (c.m.keys.values().stream().anyMatch(k -> a.name().equals(k.name))) {
            throw c.invalid("같은 이름의 키가 있습니다: " + a.name(), "다른 이름을 쓰세요", id, "name");
        }
        for (String cid : a.columns()) c.column(cid);
        c.touch("key", id);
        ErdKey k = new ErdKey();
        k.table = a.table();
        k.kind = a.kind();
        k.name = a.name();
        k.columns = new ArrayList<>(a.columns());
        c.m.keys.put(id, k);
        c.m.tombstones.remove(id);
        c.stamp(k.rev, KEY_PROPS);
    }

    @SuppressWarnings("unchecked")
    private void updateKey(Ctx c, UpdateKey u) {
        ErdKey k = c.key(u.id());
        c.requireKnownKeys(u.set(), KEY_PROPS, u.id());
        c.checkConflict(k.rev, u.set().keySet(), u.id(), c.node(k));
        c.touch("key", u.id());
        if (u.set().containsKey("name")) {
            String name = (String) u.set().get("name");
            requireOracleId(c, name, "name", u.id());
            k.name = name;
        }
        if (u.set().containsKey("columns")) {
            List<String> cols = (List<String>) u.set().get("columns");
            for (String cid : cols) c.column(cid);
            k.columns = new ArrayList<>(cols);
        }
        c.stamp(k.rev, u.set().keySet());
    }

    void deleteKey(Ctx c, String id, boolean checkConflict) {
        ErdKey k = c.key(id);
        if (checkConflict) c.checkConflict(k.rev, k.rev.keySet(), id, c.node(k));
        c.touch("key", id);
        c.m.keys.remove(id);
        c.m.tombstones.put(id, new PropRev(c.newRev, c.session));
    }

    // ---- 되돌리기 ----

    private void restore(Ctx c, Restore r) {
        for (ErdChange e : r.elements()) {
            JsonNode now = c.snapshot(e.kind(), e.id());
            if (now != null) {
                Map<String, PropRev> revs = c.revOf(e.kind(), e.id());
                for (var pr : revs.entrySet()) {
                    if (pr.getValue().rev() > r.sinceRev() && !pr.getValue().session().equals(c.session)) {
                        throw c.conflict(e.id(), pr.getKey(), pr.getValue(), now.get(pr.getKey()),
                                "되돌리려는 뒤에 다른 세션이 이 값을 고쳤습니다", "getChangesSince 로 확인한 뒤 직접 고치세요");
                    }
                }
            } else {
                PropRev tomb = c.m.tombstones.get(e.id());
                if (tomb != null && tomb.rev() > r.sinceRev() && !tomb.session().equals(c.session)) {
                    throw c.conflict(e.id(), null, tomb, null, "되돌리려는 뒤에 다른 세션이 이 요소를 지웠습니다", "필요하면 다시 만드세요");
                }
            }
        }
        for (ErdChange e : r.elements()) {
            c.touch(e.kind(), e.id());
            boolean delete = e.op().equals(ErdChange.DELETE);
            c.put(e.kind(), e.id(), delete ? null : e.value());
            // 되살린 값도 이번 rev·세션의 쓰기다 — 그래야 다음 충돌 판정이 되돌리기 이후를 기준으로 한다.
            if (!delete) {
                Map<String, PropRev> revs = c.revOf(e.kind(), e.id());
                c.stamp(revs, new ArrayList<>(revs.keySet()));
            }
        }
    }

    // ---- 공통 ----

    static void requireOracleId(Ctx c, String s, String prop, String elementId) {
        if (!ErdIds.isOracleIdentifier(s)) {
            throw c.invalid("Oracle 식별자 규칙에 맞지 않습니다: " + s,
                    "영문 대문자로 시작하고 대문자·숫자·_ 만 128자 이내로 쓰세요", elementId, prop);
        }
    }
}
```

`Ctx`(작업 사본과 묶음 상태)와 `Reject`(거절을 운반하는 예외)는 같은 패키지의 package-private 클래스로 둔다.

```java
// Ctx.java
package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.*;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;

final class Ctx {
    record Key(String kind, String id) {}

    final ErdModel m;
    final long baseRev;
    final long newRev;
    final String session;
    final LinkedHashMap<Key, JsonNode> before = new LinkedHashMap<>();
    final List<ErdWarning> warnings = new ArrayList<>();
    int index;

    Ctx(ErdModel m, long baseRev, long newRev, String session) {
        this.m = m;
        this.baseRev = baseRev;
        this.newRev = newRev;
        this.session = session;
    }

    /** 고치기 전 상태를 처음 한 번만 담는다(역명령·델타 재료). */
    void touch(String kind, String id) {
        before.computeIfAbsent(new Key(kind, id), k -> snapshot(kind, id));
    }

    JsonNode snapshot(String kind, String id) {
        Object o = switch (kind) {
            case "table" -> m.tables.get(id);
            case "column" -> m.columns.get(id);
            case "key" -> m.keys.get(id);
            case "relation" -> m.relations.get(id);
            default -> throw new IllegalArgumentException(kind);
        };
        return o == null ? null : ErdModelCodec.MAPPER.valueToTree(o);
    }

    JsonNode node(Object element) {
        return ErdModelCodec.MAPPER.valueToTree(element);
    }

    void put(String kind, String id, JsonNode value) {
        var mapper = ErdModelCodec.MAPPER;
        try {
            switch (kind) {
                case "table" -> { if (value == null) m.tables.remove(id); else m.tables.put(id, mapper.treeToValue(value, ErdTable.class)); }
                case "column" -> { if (value == null) m.columns.remove(id); else m.columns.put(id, mapper.treeToValue(value, ErdColumn.class)); }
                case "key" -> { if (value == null) m.keys.remove(id); else m.keys.put(id, mapper.treeToValue(value, ErdKey.class)); }
                case "relation" -> { if (value == null) m.relations.remove(id); else m.relations.put(id, mapper.treeToValue(value, ErdRelation.class)); }
                default -> throw new IllegalArgumentException(kind);
            }
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw invalid("요소 JSON 을 읽을 수 없습니다: " + id, "restore 값은 getChangesSince 가 준 값을 그대로 쓰세요", id, null);
        }
        if (value == null) m.tombstones.put(id, new PropRev(newRev, session)); else m.tombstones.remove(id);
    }

    Map<String, PropRev> revOf(String kind, String id) {
        return switch (kind) {
            case "table" -> m.tables.get(id).rev;
            case "column" -> m.columns.get(id).rev;
            case "key" -> m.keys.get(id).rev;
            case "relation" -> m.relations.get(id).rev;
            default -> throw new IllegalArgumentException(kind);
        };
    }

    void stamp(Map<String, PropRev> rev, Collection<String> props) {
        for (String p : props) rev.put(p, new PropRev(newRev, session));
    }

    void checkConflict(Map<String, PropRev> rev, Collection<String> props, String elementId, JsonNode current) {
        for (String p : props) {
            PropRev pr = rev.get(p);
            if (pr != null && !pr.session().equals(session) && pr.rev() > baseRev) {
                throw conflict(elementId, p, pr, current == null ? null : current.get(p),
                        "다른 세션(" + pr.session() + ")이 rev " + pr.rev() + " 에서 먼저 고쳤습니다",
                        "getChangesSince(" + baseRev + ") 로 최신 값을 읽고 다시 보내세요");
            }
        }
    }

    void requireKnownKeys(Map<String, Object> set, Set<String> allowed, String elementId) {
        if (set == null || set.isEmpty()) throw invalid("set 이 비었습니다", "고칠 속성을 넣으세요", elementId, null);
        for (String k : set.keySet()) {
            if (!allowed.contains(k)) throw invalid("고칠 수 없는 속성입니다: " + k, "허용: " + allowed, elementId, k);
        }
    }

    String newIdOrGiven(String given, char prefix) {
        if (given == null) return ErdIds.newId(prefix);
        if (!ErdIds.isElementId(given) || given.charAt(0) != prefix) {
            throw invalid("요소 id 형식이 틀렸습니다: " + given, prefix + "-로 시작하는 id 를 쓰거나 비워 두세요", given, "id");
        }
        if (snapshotAny(given)) throw invalid("이미 있는 id 입니다: " + given, "다른 id 를 쓰세요", given, "id");
        return given;
    }

    private boolean snapshotAny(String id) {
        return m.tables.containsKey(id) || m.columns.containsKey(id) || m.keys.containsKey(id) || m.relations.containsKey(id);
    }

    ErdTable table(String id) { return require(m.tables.get(id), id); }
    ErdColumn column(String id) { return require(m.columns.get(id), id); }
    ErdKey key(String id) { return require(m.keys.get(id), id); }
    ErdRelation relation(String id) { return require(m.relations.get(id), id); }

    private <T> T require(T v, String id) {
        if (v != null) return v;
        PropRev tomb = m.tombstones.get(id);
        if (tomb != null) {
            return fail(new ErdRejection(ErdRejection.NOT_FOUND, index, "이미 지워진 요소입니다: " + id,
                    "getChangesSince 로 최신 모델을 읽으세요", id, null, tomb.rev(), tomb.session(), null, null));
        }
        return fail(new ErdRejection(ErdRejection.INVALID, index, "없는 요소 id 입니다: " + id,
                "getModelText 로 id 를 확인하세요", id, null, null, null, null, null));
    }

    Reject invalid(String message, String hint, String elementId, String property) {
        return new Reject(new ErdRejection(ErdRejection.INVALID, index, message, hint, elementId, property, null, null, null, null));
    }

    Reject conflict(String elementId, String property, PropRev by, JsonNode current, String message, String hint) {
        return new Reject(new ErdRejection(ErdRejection.CONFLICT, index, message, hint, elementId, property,
                by.rev(), by.session(), current, null));
    }

    Reject needsChoice(String elementId, String property, String message, String hint, JsonNode choices) {
        return new Reject(new ErdRejection(ErdRejection.NEEDS_CHOICE, index, message, hint, elementId, property, null, null, null, choices));
    }

    private static <T> T fail(ErdRejection r) {
        throw new Reject(r);
    }
}

// Reject.java
final class Reject extends RuntimeException {
    final ErdRejection rejection;
    Reject(ErdRejection rejection) {
        super(rejection.message(), null, false, false);
        this.rejection = rejection;
    }
}
```

`ErdColumnFill` 과 `ErdRelationOps` 는 Task 5·6 에서 채운다. 이 Task 에서는 컴파일되도록 아래 최소본을 둔다.

```java
// ErdColumnFill.java — Task 6 에서 완성한다.
record ErdColumnFill(String phys, Long domainId) {
    static ErdColumnFill fromLogical(ErdNaming naming, Ctx c, String logical, String id) {
        throw c.invalid("물리명이 없습니다", "phys 를 넣으세요", id, "phys");
    }
}

// ErdRelationOps.java — Task 5 에서 완성한다.
final class ErdRelationOps {
    static void add(ErdCommandEngine e, Ctx c, ErdCommand.AddRelation a) { throw c.invalid("아직 지원하지 않습니다", "", a.id(), null); }
    static void update(Ctx c, ErdCommand.UpdateRelation u) { throw c.invalid("아직 지원하지 않습니다", "", u.id(), null); }
    static void setState(Ctx c, String id, String state) { throw c.invalid("아직 지원하지 않습니다", "", id, null); }
    static void delete(Ctx c, String id, boolean checkConflict) {
        c.touch("relation", id);
        c.m.relations.remove(id);
        c.m.tombstones.put(id, new com.dongkuk.dmes.mdm.dma.erdEdit.model.PropRev(c.newRev, c.session));
    }
}
```

- [ ] **Step 5: 시험 통과 확인**

Run: Step 2 명령. Expected: 12건 PASS.

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib
/usr/bin/git commit -m "feat(mdm): ERD 명령 엔진 — 표·컬럼·키, 속성 단위 충돌, 되돌리기"
```
