# ERD 도구 단계 1 — Task 4·5: 첫 가져오기, 표준 상태·DB 차이 읽기

> 공통 제약(Global Constraints)·단계 1 에서 정한 점(S1~S17)·Review Focus·인터페이스 정본은 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [01-backend-read.md](01-backend-read.md) · [README](README.md) · 다음: [03-frontend-shared.md](03-frontend-shared.md)

이 문서의 경로 약어:
- `L/` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/`
- `LT/` = `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/`
- `AT/` = `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/`

명령은 모두 `src/backend/mdm` 에서 부른다. 먼저 `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 을 한다. Bash timeout 은 600000ms 로 준다.

---

### Task 4: 첫 가져오기(`import` 액션)

**Files:**
- Modify: `L/standard/ErdDictionary.java`, `L/standard/ErdDictionaryLoader.java` (논리명 조회, S9)
- Create: `L/importing/ErdImportBuilder.java`, `L/dto/ErdImportResult.java`
- Modify: `L/service/ErdCommandService.java` (`applyImport`), `L/service/ErdEditService.java` (`importModel`)
- Modify: `src/backend/mdm/api/src/main/resources/services/dma/erdEdit.bpmn` (15번째 액션 `import`)
- Modify: `AT/MdmOasisActionVocabularyTest.java` (기대 집합 15개)
- Test: `LT/importing/ErdImportBuilderTest.java`, `AT/dma/erdEdit/ErdImportTest.java`

**Interfaces:**
- Consumes (README 정본 그대로):
  - Task 2: `ErdDbMeta`(`Table`·`Column`·`Constraint`·`Index`), `ErdDbMetaReader.read(String owner)`.
  - Task 3: `ErdRelationInferrer.infer(ErdDbMeta, ErdHints)`, `ErdHintsLoader.load(String module)`, `InferredRelation`, `ErdRelation.candidateRank`.
  - 단계 0: `ErdCommand.Restore`, `ErdChange`, `ErdDiagramCommand`, `ErdCommandEngine`, `ErdApplyResult`, `ErdModelCodec.MAPPER`.
- Produces:
  - `ErdDictionary.fill(String phys) : ErdDictionary.ColumnEntry` — 컬럼 사전 → 별칭 → `reverse(phys)` 순서로 논리명·도메인을 준다(S9).
  - `ErdDictionary.index(List<ColumnRow>, List<AliasRow>) : Map<String, ColumnEntry>` — 로더가 쓰는 순수 색인 함수.
  - `ErdImportBuilder.build(ErdDbMeta, List<InferredRelation>, ErdDictionary, long sinceRev) : Built` — `Built(Restore restore, List<JsonNode> diagramCommands, ErdImportResult.Summary summary, List<ErdWarning> skipped)`.
  - `ErdImportBuilder.typeOf(ErdDbMeta.Column) : ColumnType(dataType, length, scale)` — Task 5 의 `ErdDbDiff` 도 같은 함수를 쓴다.
  - `ErdCommandService.applyImport(modelId, baseRev, userId, session, source, Restore restore, List<JsonNode> diagramCommands) : ErdApplyResult` (README 정본 시그니처).
  - `record ErdImportResult(boolean applied, long rev, List<ErdChange> changes, List<ErdWarning> warnings, ErdRejection rejection, Summary summary)`, `record Summary(int tables, int columns, int keys, Map<String,Integer> relations, String diagramId)`.
  - OASIS `import`(kind `FROM_DB`, EDIT 권한) → `data.result` = `ErdImportResult`.

이 Task 에서 정하는 규칙:

| 항목 | 규칙 |
|---|---|
| 표 순서·id | 표는 이름순으로 만든다. 요소 id 는 `ErdIds.newId`(`t-`·`c-`·`k-`·`r-`·`d-` + UUID)다. 시험은 id 공급 함수를 바꿔 끼운다 |
| 표 논리명 | 표 주석의 첫 줄(앞뒤 공백 제거). 주석이 비었으면 물리명. `comment` 에는 주석 전체를 넣는다 |
| 컬럼 논리명·도메인 | `ErdDictionary.fill(phys)`: 컬럼 사전 물리명이면 그 `COLUMN_NAME`·`DOMAIN_ID`, 별칭 물리명이면 대응 컬럼의 것(여러 컬럼이면 `COLUMN_ID` 가 가장 작은 것), 둘 다 아니면 `reverse(phys).logicalName()` 과 도메인 null. 대소문자는 대문자로 맞춰 비교한다 |
| 컬럼 타입 | `typeOf`: `NUMBER` 는 length=정밀도·scale=스케일, `FLOAT` 는 length=정밀도·scale=null, `VARCHAR2·NVARCHAR2·CHAR·NCHAR·VARCHAR·RAW` 는 length=길이·scale=null, 그 밖(`DATE`·`TIMESTAMP(6)`·`CLOB` 등)은 둘 다 null |
| 컬럼 나머지 | `notNull = !nullable`, `default` = 기본값 앞뒤 공백 제거(비면 null), `comment` = 컬럼 주석. 순서는 `position` 순 |
| 키 | P 제약 → `PK`, U 제약 → `UK`. 인덱스는 이름이 P·U 제약과 같거나 컬럼 목록(순서 포함)이 같으면 뺀다(제약이 만든 인덱스). 남은 유일 인덱스 → `UK`, 나머지 → `IX`. 표 컬럼이 아닌 이름(함수 기반 인덱스의 `SYS_NC…$`)이 하나라도 있으면 그 키를 빼고 `IMPORT_SKIPPED` 경고를 낸다 |
| 관계 | 자식·부모 표와 컬럼을 모두 찾으면 넣는다. 못 찾거나 같은 관계가 두 번 오면 빼고 `IMPORT_SKIPPED` 경고를 낸다. `state` 는 추정기 값(`DB`·`INFERRED`), `dbFk = (state == DB)`, `evidence`·`candidateRank` 는 그대로 |
| 식별 관계 | 자식 표에 PK 가 있고 자식 컬럼이 모두 PK 안에 있으면 `identifying=true` |
| 기수 | 부모 쪽: 자식 컬럼이 모두 NOT NULL 이면 `ONE`, 아니면 `ZERO_OR_ONE`. 자식 쪽: 자식 컬럼 집합이 자식 표의 PK·UK·유일 인덱스 가운데 하나와 같으면 `ZERO_OR_ONE`(1:1), 아니면 `ZERO_OR_MORE` |
| 다이어그램(S8) | 업무영역 "기본", 이름 "전체", 정렬 0. 표를 이름순 격자로 놓는다. 가로 8개, x = (i % 8) × 280, y = (i / 8) × 220. 명령은 `addDiagram` 1건 + `placeTables` 1건(노드 전부)이다. 다이어그램 id 는 `d-<UUID>` 다(DIAGRAM_ID 는 모델을 가리지 않는 전역 PK 다) |
| 빈 모델 판정 | `applyImport` 가 모델 행을 잠근 뒤, 엔진을 부르기 전에 표가 하나라도 있으면 `INVALID`("이미 표가 있습니다…", hint "다시 가져오기 차이는 compare kind=DB_DIFF 로 보세요") 로 거절한다 |
| 빈 스키마 | 메타에 표가 없으면 잠그기 전에 `MdmErrors.invalid`(MDM021) 로 막는다(TPL_EMPTY 복제·권한 없음이 여기에 걸린다) |
| kind | `import` 는 `kind=FROM_DB` 만 받는다. 없거나 다르면 MDM021 |

엔진은 restore 가 든 묶음의 끊어진 참조를 `CONFLICT`("되돌릴 수 없습니다") 로 거절한다(`ErdIntegrity.fail`). 가져오기에서는 이 문구가 원인을 가리므로, 빌더가 참조를 미리 맞추고 시험이 엔진 적용까지 확인한다.

- [ ] **Step 1: 실패하는 단위 시험 작성 — `LT/importing/ErdImportBuilderTest.java`**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.importing;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Column;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Constraint;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Index;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Table;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ApplyOutcome;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommandEngine;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdNaming;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.InferredRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdEvidence;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdKey;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionary;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionary.AliasRow;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionary.ColumnRow;
import com.dongkuk.dmes.mdm.dma.naming.TermDictionary;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

class ErdImportBuilderTest {

    static Column col(String name, int pos, String type, Integer len, Integer prec, Integer scale, boolean nullable) {
        return new Column(name, pos, type, len, prec, scale, nullable, null, null);
    }

    static ErdDictionary emptyDict() {
        return new ErdDictionary(TermDictionary.of(List.of()), Set.of(), Set.of(), Map.of(), List.of());
    }

    static Function<Character, String> seqIds() {
        AtomicInteger n = new AtomicInteger();
        return c -> c + "-" + n.incrementAndGet();
    }

    /**
     * PK 없는 표(TB_NOPK), 복합 PK(TB_HEAD), 복합 UK 를 부모로 둔 FK(TB_CONST → TB_HEAD), 자기 참조 FK(TB_TREE),
     * 1:1(TB_LAYOUT_EXT → TB_LAYOUT), 제약이 만든 인덱스, 제약 없는 유일 인덱스, 함수 기반 인덱스를 담는다.
     */
    static ErdDbMeta meta() {
        return new ErdDbMeta("S", List.of(
                new Table("TB_NOPK", null, List.of(
                        col("CODE", 1, "VARCHAR2", 10, null, null, true),
                        new Column("USE_YN", 2, "CHAR", 1, null, null, false, " 'Y'\n", "사용 여부"))),
                new Table("TB_LAYOUT", "레이아웃", List.of(
                        col("LAYOUT_ID", 1, "VARCHAR2", 30, null, null, false))),
                new Table("TB_LAYOUT_EXT", "레이아웃 확장", List.of(
                        col("LAYOUT_ID", 1, "VARCHAR2", 30, null, null, false))),
                new Table("TB_HEAD", "머리", List.of(
                        col("LAYOUT_ID", 1, "VARCHAR2", 30, null, null, false),
                        col("VER", 2, "NUMBER", 22, 7, 3, false),
                        col("SEQ", 4, "NUMBER", 22, 10, 0, false),
                        col("HEADER_ID", 3, "VARCHAR2", 30, null, null, false))),
                new Table("TB_CONST", "제약", List.of(
                        col("CONST_ID", 1, "NUMBER", 22, 19, 0, false),
                        col("LAYOUT_ID", 2, "VARCHAR2", 30, null, null, false),
                        col("VER", 3, "NUMBER", 22, 7, 3, false),
                        col("HEADER_ID", 4, "VARCHAR2", 30, null, null, true))),
                new Table("TB_TREE", "나무\n둘째 줄", List.of(
                        col("NODE_ID", 1, "VARCHAR2", 20, null, null, false),
                        col("PARENT_NODE_ID", 2, "VARCHAR2", 20, null, null, true),
                        col("CREATED_AT", 3, "DATE", 7, null, null, true)))),
            List.of(
                new Constraint("PK_TB_LAYOUT", "TB_LAYOUT", "P", List.of("LAYOUT_ID"), null, null),
                new Constraint("PK_TB_LAYOUT_EXT", "TB_LAYOUT_EXT", "P", List.of("LAYOUT_ID"), null, null),
                new Constraint("PK_TB_HEAD", "TB_HEAD", "P", List.of("LAYOUT_ID", "VER", "SEQ"), null, null),
                new Constraint("UX_TB_HEAD_HDR", "TB_HEAD", "U", List.of("LAYOUT_ID", "VER", "HEADER_ID"), null, null),
                new Constraint("PK_TB_CONST", "TB_CONST", "P", List.of("CONST_ID"), null, null),
                new Constraint("FK_TB_CONST_HEAD", "TB_CONST", "R", List.of("LAYOUT_ID", "VER", "HEADER_ID"),
                        "TB_HEAD", List.of("LAYOUT_ID", "VER", "HEADER_ID")),
                new Constraint("PK_TB_TREE", "TB_TREE", "P", List.of("NODE_ID"), null, null),
                new Constraint("FK_TB_TREE_TREE", "TB_TREE", "R", List.of("PARENT_NODE_ID"), "TB_TREE", List.of("NODE_ID"))),
            List.of(
                new Index("PK_TB_HEAD", "TB_HEAD", true, List.of("LAYOUT_ID", "VER", "SEQ")),          // 이름이 PK 와 같다 → 뺀다
                new Index("SYS_C0099", "TB_TREE", true, List.of("NODE_ID")),                            // 컬럼이 PK 와 같다 → 뺀다
                new Index("UX_TB_HEAD_HDR", "TB_HEAD", true, List.of("LAYOUT_ID", "VER", "HEADER_ID")), // UK 가 만든 것 → 뺀다
                new Index("IX_TB_CONST_LAYOUT", "TB_CONST", false, List.of("LAYOUT_ID", "VER")),        // IX
                new Index("UX_TB_NOPK_CODE", "TB_NOPK", true, List.of("CODE")),                         // 제약 없는 유일 인덱스 → UK
                new Index("UX_TB_TREE_FN", "TB_TREE", true, List.of("SYS_NC00004$"))));                 // 함수 기반 → 빼고 경고
    }

    static List<InferredRelation> rels() {
        return List.of(
                new InferredRelation("TB_CONST", List.of("LAYOUT_ID", "VER", "HEADER_ID"), "TB_HEAD",
                        List.of("LAYOUT_ID", "VER", "HEADER_ID"), "DB", List.of(new ErdEvidence("DB_FK", "FK_TB_CONST_HEAD")), null),
                new InferredRelation("TB_TREE", List.of("PARENT_NODE_ID"), "TB_TREE", List.of("NODE_ID"), "DB",
                        List.of(new ErdEvidence("DB_FK", "FK_TB_TREE_TREE")), null),
                new InferredRelation("TB_HEAD", List.of("LAYOUT_ID"), "TB_LAYOUT", List.of("LAYOUT_ID"), "INFERRED",
                        List.of(new ErdEvidence("NAME_RULE", "PK 이름 일치")), 1),
                new InferredRelation("TB_CONST", List.of("LAYOUT_ID"), "TB_LAYOUT", List.of("LAYOUT_ID"), "INFERRED",
                        List.of(new ErdEvidence("NAME_RULE", "PK 이름 일치")), 2),
                new InferredRelation("TB_LAYOUT_EXT", List.of("LAYOUT_ID"), "TB_LAYOUT", List.of("LAYOUT_ID"), "INFERRED",
                        List.of(new ErdEvidence("DOC", "docs/x.dbml:3")), null),
                new InferredRelation("TB_GONE", List.of("X"), "TB_TREE", List.of("NODE_ID"), "INFERRED",   // 없는 표 → 빼고 경고
                        List.of(new ErdEvidence("SQL_JOIN", "A.java:1")), null));
    }

    static ErdModel apply(ErdImportBuilder.Built built) {
        var out = new ErdCommandEngine(ErdNaming.NONE).apply(ErdModel.empty("m", "S"), 0, 1, "s", List.of(built.restore()));
        assertThat(out).as(out.toString()).isInstanceOf(ApplyOutcome.Applied.class);
        return ((ApplyOutcome.Applied) out).next();
    }

    static String tableId(ErdModel m, String phys) {
        return m.tables.entrySet().stream().filter(e -> phys.equals(e.getValue().phys)).findFirst().orElseThrow().getKey();
    }

    static ErdColumn column(ErdModel m, String table, String phys) {
        String t = tableId(m, table);
        return m.columns.values().stream().filter(c -> t.equals(c.table) && phys.equals(c.phys)).findFirst().orElseThrow();
    }

    static String columnId(ErdModel m, String table, String phys) {
        String t = tableId(m, table);
        return m.columns.entrySet().stream().filter(e -> t.equals(e.getValue().table) && phys.equals(e.getValue().phys))
                .findFirst().orElseThrow().getKey();
    }

    static ErdRelation relation(ErdModel m, String child, String parent, String state) {
        String c = tableId(m, child), p = tableId(m, parent);
        return m.relations.values().stream().filter(r -> c.equals(r.child) && p.equals(r.parent) && state.equals(r.state))
                .findFirst().orElseThrow();
    }

    static List<ErdKey> keys(ErdModel m, String table) {
        String t = tableId(m, table);
        return m.keys.values().stream().filter(k -> t.equals(k.table)).toList();
    }

    /** Review Focus 1: PK 없는 표·복합 PK·UNIQUE 부모 FK·자기 참조 FK 가 모두 들어오고 엔진 무결성 검사를 통과한다. */
    @Test
    void importBuildsCompositeUniqueAndSelfReference() {
        ErdImportBuilder.Built built = ErdImportBuilder.build(meta(), rels(), emptyDict(), 0, seqIds());
        ErdModel m = apply(built);

        assertThat(m.tables.values()).extracting(t -> t.phys)
                .containsExactly("TB_CONST", "TB_HEAD", "TB_LAYOUT", "TB_LAYOUT_EXT", "TB_NOPK", "TB_TREE");
        assertThat(keys(m, "TB_NOPK")).extracting(k -> k.kind + ":" + k.name).containsExactly("UK:UX_TB_NOPK_CODE");
        assertThat(keys(m, "TB_HEAD")).extracting(k -> k.kind + ":" + k.name).containsExactlyInAnyOrder("PK:PK_TB_HEAD", "UK:UX_TB_HEAD_HDR");
        assertThat(keys(m, "TB_HEAD").stream().filter(k -> k.kind.equals("PK")).findFirst().orElseThrow().columns)
                .containsExactly(columnId(m, "TB_HEAD", "LAYOUT_ID"), columnId(m, "TB_HEAD", "VER"), columnId(m, "TB_HEAD", "SEQ"));
        assertThat(keys(m, "TB_CONST")).extracting(k -> k.kind + ":" + k.name).containsExactlyInAnyOrder("PK:PK_TB_CONST", "IX:IX_TB_CONST_LAYOUT");
        assertThat(keys(m, "TB_TREE")).extracting(k -> k.kind + ":" + k.name).containsExactly("PK:PK_TB_TREE");

        ErdRelation uk = relation(m, "TB_CONST", "TB_HEAD", "DB");
        assertThat(uk.dbFk).isTrue();
        assertThat(uk.pairs).containsExactly(
                List.of(columnId(m, "TB_CONST", "LAYOUT_ID"), columnId(m, "TB_HEAD", "LAYOUT_ID")),
                List.of(columnId(m, "TB_CONST", "VER"), columnId(m, "TB_HEAD", "VER")),
                List.of(columnId(m, "TB_CONST", "HEADER_ID"), columnId(m, "TB_HEAD", "HEADER_ID")));
        assertThat(uk.identifying).isFalse();
        assertThat(uk.cardinality.parent).isEqualTo("ZERO_OR_ONE");   // HEADER_ID 가 NULL 허용
        assertThat(uk.evidence).containsExactly(new ErdEvidence("DB_FK", "FK_TB_CONST_HEAD"));

        ErdRelation self = relation(m, "TB_TREE", "TB_TREE", "DB");
        assertThat(self.pairs).containsExactly(List.of(columnId(m, "TB_TREE", "PARENT_NODE_ID"), columnId(m, "TB_TREE", "NODE_ID")));
        assertThat(self.identifying).isFalse();
        assertThat(self.cardinality.child).isEqualTo("ZERO_OR_MORE");

        assertThat(built.summary().tables()).isEqualTo(6);
        assertThat(built.summary().columns()).isEqualTo(15);
        assertThat(built.summary().keys()).isEqualTo(8);
        assertThat(built.summary().relations()).containsExactly(Map.entry("DB", 2), Map.entry("INFERRED", 3));
        assertThat(built.skipped()).extracting(w -> w.code()).containsOnly(ErdImportBuilder.SKIPPED);
        assertThat(built.skipped()).hasSize(2);   // 함수 기반 인덱스 1, 없는 표의 관계 1
        assertThat(built.restore().sinceRev()).isZero();
        assertThat(built.restore().elements()).hasSize(6 + 15 + 8 + 5);
    }

    @Test
    void relationRulesFromPkContainment() {
        ErdModel m = apply(ErdImportBuilder.build(meta(), rels(), emptyDict(), 0, seqIds()));
        ErdRelation head = relation(m, "TB_HEAD", "TB_LAYOUT", "INFERRED");
        assertThat(head.identifying).isTrue();                     // LAYOUT_ID ⊂ PK(LAYOUT_ID, VER, SEQ)
        assertThat(head.cardinality.parent).isEqualTo("ONE");
        assertThat(head.cardinality.child).isEqualTo("ZERO_OR_MORE");
        assertThat(head.candidateRank).isEqualTo(1);
        assertThat(head.dbFk).isFalse();
        ErdRelation folded = relation(m, "TB_CONST", "TB_LAYOUT", "INFERRED");
        assertThat(folded.identifying).isFalse();
        assertThat(folded.candidateRank).isEqualTo(2);
        ErdRelation ext = relation(m, "TB_LAYOUT_EXT", "TB_LAYOUT", "INFERRED");
        assertThat(ext.identifying).isTrue();
        assertThat(ext.cardinality.child).isEqualTo("ZERO_OR_ONE");   // 자식 컬럼 = 자식 PK → 1:1
        assertThat(ext.candidateRank).isNull();
        assertThat(ext.evidence).containsExactly(new ErdEvidence("DOC", "docs/x.dbml:3"));
    }

    @Test
    void columnsCarryTypeNullDefaultCommentAndDictionaryLogical() {
        // 별칭 NODE_ID 가 컬럼 9 와 컬럼 5 에 걸린다(대소문자만 다르다) → COLUMN_ID 가 작은 5 를 쓴다
        var index = ErdDictionary.index(
                List.of(new ColumnRow(3L, "LAYOUT_ID", "레이아웃아이디", 12L),
                        new ColumnRow(5L, "NODE_NO", "노드아이디", 7L),
                        new ColumnRow(9L, "NODE_KEY", "다른", 8L)),
                List.of(new AliasRow(9L, "NODE_ID"), new AliasRow(5L, "node_id")));
        var dict = new ErdDictionary(TermDictionary.of(List.of()), Set.of("LAYOUT_ID"), Set.of("NODE_ID"), Map.of(), List.of(), index);
        ErdModel m = apply(ErdImportBuilder.build(meta(), rels(), dict, 0, seqIds()));

        ErdColumn layout = column(m, "TB_HEAD", "LAYOUT_ID");
        assertThat(layout.logical).isEqualTo("레이아웃아이디");
        assertThat(layout.domainId).isEqualTo(12L);
        assertThat(layout.dataType).isEqualTo("VARCHAR2");
        assertThat(layout.length).isEqualTo(30);
        assertThat(layout.scale).isNull();
        assertThat(layout.notNull).isTrue();
        ErdColumn node = column(m, "TB_TREE", "NODE_ID");
        assertThat(node.logical).isEqualTo("노드아이디");                  // 별칭이 두 컬럼에 걸리면 COLUMN_ID 가 작은 5
        assertThat(node.domainId).isEqualTo(7L);
        ErdColumn created = column(m, "TB_TREE", "CREATED_AT");
        assertThat(created.logical).contains("***");                     // 사전에 없는 토막
        assertThat(created.domainId).isNull();
        assertThat(created.dataType).isEqualTo("DATE");
        assertThat(created.length).isNull();
        ErdColumn ver = column(m, "TB_HEAD", "VER");
        assertThat(ver.length).isEqualTo(7);
        assertThat(ver.scale).isEqualTo(3);
        ErdColumn use = column(m, "TB_NOPK", "USE_YN");
        assertThat(use.defaultValue).isEqualTo("'Y'");
        assertThat(use.comment).isEqualTo("사용 여부");
        assertThat(column(m, "TB_CONST", "HEADER_ID").notNull).isFalse();

        assertThat(m.tables.get(tableId(m, "TB_TREE")).logical).isEqualTo("나무");
        assertThat(m.tables.get(tableId(m, "TB_TREE")).comment).isEqualTo("나무\n둘째 줄");
        assertThat(m.tables.get(tableId(m, "TB_NOPK")).logical).isEqualTo("TB_NOPK");
        assertThat(m.tables.get(tableId(m, "TB_HEAD")).columnOrder).containsExactly(
                columnId(m, "TB_HEAD", "LAYOUT_ID"), columnId(m, "TB_HEAD", "VER"),
                columnId(m, "TB_HEAD", "HEADER_ID"), columnId(m, "TB_HEAD", "SEQ"));   // position 순
    }

    @Test
    void dictionaryIndexPrefersColumnThenSmallestAlias() {
        var index = ErdDictionary.index(
                List.of(new ColumnRow(1L, "A_ID", "에이아이디", 10L), new ColumnRow(5L, "B_CD", "비코드", null),
                        new ColumnRow(9L, "C_NM", "씨명", 20L)),
                List.of(new AliasRow(9L, "A_ID"), new AliasRow(9L, "X_CD"), new AliasRow(5L, "x_cd")));
        assertThat(index.get("A_ID").logical()).isEqualTo("에이아이디");   // 컬럼 사전이 별칭보다 먼저
        assertThat(index.get("X_CD").logical()).isEqualTo("비코드");      // 별칭은 COLUMN_ID 가 작은 것
        assertThat(index).doesNotContainKey("x_cd");
    }

    @Test
    void diagramPlacesTablesInNameGrid() {
        List<Table> tables = new ArrayList<>();
        for (int i = 9; i >= 1; i--) tables.add(new Table("TB_0" + i, null, List.of(col("A", 1, "NUMBER", 22, null, null, true))));
        var built = ErdImportBuilder.build(new ErdDbMeta("S", tables, List.of(), List.of()), List.of(), emptyDict(), 4, seqIds());
        assertThat(built.diagramCommands()).hasSize(2);
        JsonNode add = built.diagramCommands().get(0);
        assertThat(add.path("op").asText()).isEqualTo("addDiagram");
        assertThat(add.path("id").asText()).isEqualTo(built.summary().diagramId()).startsWith("d-");
        assertThat(add.path("areaName").asText()).isEqualTo("기본");
        assertThat(add.path("diagramName").asText()).isEqualTo("전체");
        JsonNode place = built.diagramCommands().get(1);
        assertThat(place.path("op").asText()).isEqualTo("placeTables");
        assertThat(place.path("diagram").asText()).isEqualTo(built.summary().diagramId());
        assertThat(place.path("nodes")).hasSize(9);
        ErdModel m = apply(built);
        assertThat(place.at("/nodes/0/table").asText()).isEqualTo(tableId(m, "TB_01"));
        assertThat(place.at("/nodes/7/x").asInt()).isEqualTo(7 * 280);
        assertThat(place.at("/nodes/7/y").asInt()).isZero();
        assertThat(place.at("/nodes/8/table").asText()).isEqualTo(tableId(m, "TB_09"));
        assertThat(place.at("/nodes/8/x").asInt()).isZero();
        assertThat(place.at("/nodes/8/y").asInt()).isEqualTo(220);
        assertThat(built.restore().sinceRev()).isEqualTo(4);
        assertThat(built.summary().relations()).containsExactly(Map.entry("DB", 0), Map.entry("INFERRED", 0));
    }
}
```

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `../gradlew :lib:test --max-workers=2 --tests '*ErdImportBuilderTest'`
Expected: 컴파일 실패(`ErdImportBuilder`, `ErdDictionary.index`·`ColumnRow`·`AliasRow` 가 없다).

- [ ] **Step 3: 구현 — `ErdDictionary` 논리명 조회와 로더**

`L/standard/ErdDictionary.java` 를 세 군데 고친다. 판정기가 읽는 `columnPhys`·`aliasPhys` 는 그대로 둔다.

1. import 세 줄을 더한다: `java.util.Comparator`, `java.util.HashMap`, `java.util.Locale`.
2. 기존 생성자 `public ErdDictionary(TermDictionary terms, …, List<DomainEntry> domainEntries) { … }` 전체(필드 대입 5줄 포함)를 지우고, 그 자리에 아래 블록의 레코드 3개·필드·생성자 2개를 넣는다. 5개 인자 생성자는 6개 인자 생성자로 넘기기만 한다(`ErdStandardJudgeTest.dict()` 가 쓴다).
3. `reverse(String phys)` 메서드 다음에 아래 블록의 `index`·`fill` 을 넣는다.

```java
    // ---- 2번: 기존 생성자 자리 ----

    /** 가져오기 논리명 채우기 재료(README S9). logical 은 컬럼 사전의 논리명(TB_MDM_COLUMN.COLUMN_NAME)이다. */
    public record ColumnEntry(String logical, Long domainId) {}
    /** 컬럼 사전 한 행. */
    public record ColumnRow(Long columnId, String phys, String logical, Long domainId) {}
    /** 시스템별 별칭 한 행(TB_MDM_COLUMN_SYSTEM). SYSTEM_CODE 는 보지 않는다(S9). */
    public record AliasRow(Long columnId, String phys) {}

    /** 대문자 물리명 → 컬럼 사전 항목. 컬럼 사전 물리명과 별칭 물리명을 모두 담는다. */
    private final Map<String, ColumnEntry> columnsByPhys;

    public ErdDictionary(TermDictionary terms, Set<String> columnPhys, Set<String> aliasPhys,
                         Map<Long, ErdDomainSpec> domains, List<DomainEntry> domainEntries) {
        this(terms, columnPhys, aliasPhys, domains, domainEntries, Map.of());
    }

    public ErdDictionary(TermDictionary terms, Set<String> columnPhys, Set<String> aliasPhys,
                         Map<Long, ErdDomainSpec> domains, List<DomainEntry> domainEntries,
                         Map<String, ColumnEntry> columnsByPhys) {
        this.composer = new ColumnNameComposer(terms);
        this.columnPhys = columnPhys;
        this.aliasPhys = aliasPhys;
        this.domains = domains;
        this.domainEntries = domainEntries;
        this.columnsByPhys = columnsByPhys;
    }

    // ---- 3번: reverse(...) 다음 ----

    /**
     * 물리명 색인(S9). 컬럼 사전 물리명이 먼저다. 별칭 물리명은 사전에 없을 때만 넣고, 같은 별칭이 여러 컬럼에 걸리면
     * COLUMN_ID 가 가장 작은 컬럼을 쓴다. 키는 대문자다(별칭 물리명은 대소문자가 섞여 있다).
     */
    public static Map<String, ColumnEntry> index(List<ColumnRow> columns, List<AliasRow> aliases) {
        Map<String, ColumnEntry> out = new HashMap<>();
        Map<Long, ColumnEntry> byId = new HashMap<>();
        for (ColumnRow c : columns) {
            if (c.phys() == null || c.columnId() == null) continue;
            ColumnEntry e = new ColumnEntry(c.logical(), c.domainId());
            out.put(c.phys().toUpperCase(Locale.ROOT), e);
            byId.put(c.columnId(), e);
        }
        aliases.stream().filter(a -> a.phys() != null && a.columnId() != null)
                .sorted(Comparator.comparing(AliasRow::columnId))
                .forEach(a -> {
                    ColumnEntry e = byId.get(a.columnId());
                    if (e != null) out.putIfAbsent(a.phys().toUpperCase(Locale.ROOT), e);
                });
        return out;
    }

    /** 가져온 컬럼의 논리명·도메인(S9): 컬럼 사전 → 별칭 → 역분해(모르는 토막 ***, 도메인 없음). */
    public ColumnEntry fill(String phys) {
        ColumnEntry e = phys == null ? null : columnsByPhys.get(phys.toUpperCase(Locale.ROOT));
        if (e != null) return e;
        return new ColumnEntry(reverse(phys).logicalName(), null);
    }
```

`L/standard/ErdDictionaryLoader.java` 의 `load()` 를 아래로 바꾼다. `findAll()` 횟수는 단계 0 과 같다(4번).

```java
    @Transactional(readOnly = true)
    public ErdDictionary load() {
        var domainList = domains.findAll();
        Map<Long, ErdDomainSpec> specs = domainList.stream().collect(Collectors.toMap(
                d -> d.getDomainId(),
                d -> new ErdDomainSpec(d.getDomainId(), d.getDomainName(), d.getDataType(), d.getLength(), d.getScale())));
        List<DomainEntry> entries = domainList.stream()
                .map(d -> new DomainEntry(d.getDomainId(), d.getDomainName(), d.getStdName())).toList();
        var columnList = columns.findAll();
        var aliasList = aliases.findAll();
        Set<String> phys = columnList.stream().map(c -> c.getPhysName()).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Set<String> alias = aliasList.stream().map(a -> a.getPhysName()).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<String, ErdDictionary.ColumnEntry> byPhys = ErdDictionary.index(
                columnList.stream().map(c -> new ErdDictionary.ColumnRow(c.getColumnId(), c.getPhysName(),
                        c.getColumnName(), c.getDomainId())).toList(),
                aliasList.stream().map(a -> new ErdDictionary.AliasRow(a.getColumnId(), a.getPhysName())).toList());
        return new ErdDictionary(TermDictionaryLoader.load(terms), phys, alias, specs, entries, byPhys);
    }
```

- [ ] **Step 4: 구현 — `ErdImportResult`, `ErdImportBuilder`**

```java
// L/dto/ErdImportResult.java
package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdRejection;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning;
import java.util.List;
import java.util.Map;

/** import 응답(README 인터페이스) = ErdApplyResult 필드 + summary. 거절이면 summary 는 null 이다. */
public record ErdImportResult(boolean applied, long rev, List<ErdChange> changes, List<ErdWarning> warnings,
                              ErdRejection rejection, Summary summary) {

    /** relations 는 상태별 수(DB, INFERRED 두 키가 늘 있다). diagramId 는 새로 만든 다이어그램 "전체". */
    public record Summary(int tables, int columns, int keys, Map<String, Integer> relations, String diagramId) {}
}
```

```java
// L/importing/ErdImportBuilder.java
package com.dongkuk.dmes.mdm.dma.erdEdit.importing;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdImportResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdIds;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.InferredRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdKey;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdTable;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionary;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

/**
 * 첫 가져오기 요소 만들기(README S2·S8·S9). 순수 함수 — DB·스프링을 모른다.
 *
 * <p>DB 메타와 추정 관계로 표·컬럼·키·관계 요소 JSON 을 만들어 엔진 restore 명령 하나에 담고, 다이어그램 "전체" 명령 2건을 만든다.
 * 엔진은 restore 묶음의 끊어진 참조를 CONFLICT("되돌릴 수 없습니다")로 거절한다. 그래서 참조가 풀리지 않는 키·관계는 여기서 빼고
 * {@link #SKIPPED} 경고로 알린다.
 */
public final class ErdImportBuilder {

    public static final String SKIPPED = "IMPORT_SKIPPED";
    public static final String AREA = "기본";
    public static final String DIAGRAM = "전체";
    static final int GRID_COLS = 8;
    static final int GRID_DX = 280;
    static final int GRID_DY = 220;
    private static final Set<String> CHAR_TYPES = Set.of("VARCHAR2", "NVARCHAR2", "CHAR", "NCHAR", "VARCHAR", "RAW");

    public record ColumnType(String dataType, Integer length, Integer scale) {}

    public record Built(ErdCommand.Restore restore, List<JsonNode> diagramCommands, ErdImportResult.Summary summary,
                        List<ErdWarning> skipped) {}

    private final Function<Character, String> ids;
    private final ErdDictionary dict;
    /** 표 이름 → 표 id(이름순). */
    private final Map<String, String> tableIds = new LinkedHashMap<>();
    /** 표 이름 → 컬럼 이름 → 컬럼 id. */
    private final Map<String, Map<String, String>> columnIds = new HashMap<>();
    /** 표 이름 → 컬럼 이름 → DB 컬럼. */
    private final Map<String, Map<String, ErdDbMeta.Column>> dbColumns = new HashMap<>();
    /** 표 이름 → PK 컬럼 이름. */
    private final Map<String, List<String>> pkOf = new HashMap<>();
    /** 표 이름 → 유일한 컬럼 집합들(PK·UK·유일 인덱스). 1:1 판정에 쓴다. */
    private final Map<String, List<Set<String>>> uniqueSetsOf = new HashMap<>();
    private final List<ErdChange> tables = new ArrayList<>();
    private final List<ErdChange> columns = new ArrayList<>();
    private final List<ErdChange> keys = new ArrayList<>();
    private final List<ErdChange> relations = new ArrayList<>();
    private final List<ErdWarning> skipped = new ArrayList<>();
    private final Map<String, Integer> relationCounts = new LinkedHashMap<>();

    private ErdImportBuilder(Function<Character, String> ids, ErdDictionary dict) {
        this.ids = ids;
        this.dict = dict;
        relationCounts.put("DB", 0);
        relationCounts.put("INFERRED", 0);
    }

    /** DB 타입 → 모델 타입. 가져오기와 다시 가져오기 차이(ErdDbDiff)가 같은 함수를 써야 가져온 직후 차이가 0 이다. */
    public static ColumnType typeOf(ErdDbMeta.Column c) {
        String t = c.dataType();
        if ("NUMBER".equals(t)) return new ColumnType(t, c.precision(), c.scale());
        if ("FLOAT".equals(t)) return new ColumnType(t, c.precision(), null);
        if (t != null && CHAR_TYPES.contains(t)) return new ColumnType(t, c.length(), null);
        return new ColumnType(t, null, null);
    }

    public static Built build(ErdDbMeta meta, List<InferredRelation> inferred, ErdDictionary dict, long sinceRev) {
        return build(meta, inferred, dict, sinceRev, ErdIds::newId);
    }

    /** @param ids 요소 id 공급(접두 문자 → id). 시험은 순번 id 를 넣는다. */
    public static Built build(ErdDbMeta meta, List<InferredRelation> inferred, ErdDictionary dict, long sinceRev,
                              Function<Character, String> ids) {
        ErdImportBuilder b = new ErdImportBuilder(ids, dict);
        meta.tables().stream().sorted(Comparator.comparing(ErdDbMeta.Table::name)).forEach(b::table);
        b.keys(meta);
        b.relations(inferred);
        String diagramId = ids.apply('d');
        List<ErdChange> elements = new ArrayList<>(b.tables);
        elements.addAll(b.columns);
        elements.addAll(b.keys);
        elements.addAll(b.relations);
        List<ErdDiagramCommand.Node> nodes = new ArrayList<>();
        int i = 0;
        for (String tid : b.tableIds.values()) {
            nodes.add(new ErdDiagramCommand.Node(tid, (i % GRID_COLS) * GRID_DX, (i / GRID_COLS) * GRID_DY));
            i++;
        }
        List<JsonNode> diagramCommands = List.of(
                diagramJson(new ErdDiagramCommand.AddDiagram(diagramId, AREA, DIAGRAM, 0)),
                diagramJson(new ErdDiagramCommand.PlaceTables(diagramId, nodes)));
        var summary = new ErdImportResult.Summary(b.tables.size(), b.columns.size(), b.keys.size(),
                new LinkedHashMap<>(b.relationCounts), diagramId);
        return new Built(new ErdCommand.Restore(sinceRev, elements), diagramCommands, summary, List.copyOf(b.skipped));
    }

    private void table(ErdDbMeta.Table t) {
        String tid = ids.apply('t');
        tableIds.put(t.name(), tid);
        ErdTable et = new ErdTable();
        et.phys = t.name();
        et.logical = tableLogical(t);
        et.comment = t.comment();
        Map<String, String> cids = new LinkedHashMap<>();
        Map<String, ErdDbMeta.Column> byName = new HashMap<>();
        for (ErdDbMeta.Column c : t.columns().stream().sorted(Comparator.comparingInt(ErdDbMeta.Column::position)).toList()) {
            String cid = ids.apply('c');
            cids.put(c.name(), cid);
            byName.put(c.name(), c);
            et.columnOrder.add(cid);
            columns.add(upsert("column", cid, column(tid, c)));
        }
        columnIds.put(t.name(), cids);
        dbColumns.put(t.name(), byName);
        tables.add(upsert("table", tid, et));
    }

    private ErdColumn column(String tableId, ErdDbMeta.Column c) {
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

    /** 표 논리명: 주석 첫 줄, 주석이 비었으면 물리명. */
    static String tableLogical(ErdDbMeta.Table t) {
        if (t.comment() == null || t.comment().isBlank()) return t.name();
        return t.comment().strip().lines().findFirst().orElse(t.name()).strip();
    }

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
            uniqueSetsOf.computeIfAbsent(k.table(), x -> new ArrayList<>()).add(new HashSet<>(k.columns()));
            if ("P".equals(k.type())) pkOf.put(k.table(), k.columns());
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
            if (ix.unique()) uniqueSetsOf.computeIfAbsent(ix.table(), x -> new ArrayList<>()).add(new HashSet<>(ix.columns()));
        }
    }

    private void addKey(String table, String kind, String name, List<String> cids) {
        ErdKey k = new ErdKey();
        k.table = tableIds.get(table);
        k.kind = kind;
        k.name = name;
        k.columns = new ArrayList<>(cids);
        keys.add(upsert("key", ids.apply('k'), k));
    }

    private void relations(List<InferredRelation> inferred) {
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
            List<String> pk = pkOf.getOrDefault(r.childTable(), List.of());
            e.identifying = !pk.isEmpty() && pk.containsAll(r.childColumns());
            Map<String, ErdDbMeta.Column> cols = dbColumns.get(r.childTable());
            e.cardinality.parent = r.childColumns().stream().noneMatch(c -> cols.get(c).nullable()) ? "ONE" : "ZERO_OR_ONE";
            e.cardinality.child = uniqueSetsOf.getOrDefault(r.childTable(), List.of()).contains(new HashSet<>(r.childColumns()))
                    ? "ZERO_OR_ONE" : "ZERO_OR_MORE";
            e.state = r.state();
            e.dbFk = "DB".equals(r.state());
            e.evidence = new ArrayList<>(r.evidence() == null ? List.of() : r.evidence());
            e.candidateRank = r.candidateRank();
            relations.add(upsert("relation", ids.apply('r'), e));
            relationCounts.merge(r.state(), 1, Integer::sum);
        }
    }

    /** 표 이름·컬럼 이름 → 컬럼 id 목록. 표가 없거나, 목록이 비었거나, 컬럼 하나라도 없으면 null. */
    private List<String> resolve(String table, List<String> names) {
        Map<String, String> cids = table == null ? null : columnIds.get(table);
        if (cids == null || names == null || names.isEmpty()) return null;
        List<String> out = new ArrayList<>();
        for (String n : names) {
            String id = cids.get(n);
            if (id == null) return null;
            out.add(id);
        }
        return out;
    }

    private void skip(String message) {
        skipped.add(new ErdWarning(SKIPPED, null, message));
    }

    /** 모델 요소 객체를 restore 요소로. 요소 JSON 은 모델 클래스가 만든 그대로다(Ctx.put 이 FAIL_ON_UNKNOWN 으로 읽는다). */
    private static ErdChange upsert(String kind, String id, Object element) {
        return new ErdChange(kind, id, ErdChange.UPSERT, ErdModelCodec.MAPPER.valueToTree(element));
    }

    /** 상위 타입으로 써야 op 가 붙는다(구체 record 로 쓰면 @JsonTypeInfo 가 빠진다). */
    private static JsonNode diagramJson(ErdDiagramCommand cmd) {
        try {
            return ErdModelCodec.MAPPER.readTree(ErdModelCodec.MAPPER.writerFor(ErdDiagramCommand.class).writeValueAsString(cmd));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
```

- [ ] **Step 5: 단위 시험 통과 확인**

Run: `../gradlew :lib:test --max-workers=2 --tests '*ErdImportBuilderTest' --tests '*ErdStandardJudgeTest'`
Expected: `ErdImportBuilderTest` 5건, `ErdStandardJudgeTest` 기존 건수 모두 PASS.

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib
/usr/bin/git commit -F - <<'EOF'
feat(mdm): ERD 가져오기 요소 만들기 — 표·컬럼·키·관계를 restore 하나로, 논리명은 컬럼 사전·별칭·역분해 순

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

- [ ] **Step 7: 실패하는 Oracle 시험 작성 — `AT/dma/erdEdit/ErdImportTest.java`, 어휘 시험 15개**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 첫 가져오기(import kind=FROM_DB) — BPMN 15번째 흐름까지 HTTP 로 태운다. 시험 PDB(TPL_EMPTY 복제)에는 MDMAPUSER(V1~V6)만 있으므로
 * MDM 스키마를 가져온다. 기대 수는 실행 때 사전 뷰에서 센다(V 파일이 늘어도 흔들리지 않게).
 *
 * <p>가져오기 두 번은 차례로 보낸다. 시험 연결 풀은 2개이고 HTTP 쓰기 하나가 2개를 잡으므로(OASIS 트랜잭션 + 안쪽 트랜잭션,
 * deferred 27번) 동시에 보내면 풀이 마른다. 판정 자리는 잠금 뒤라 차례로 보내도 같은 경로를 시험한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + ErdImportTest.KEY)
@ActiveProfiles("local")
class ErdImportTest extends AbstractMdmSharedDbTest {

    static final String KEY = "erd-import-key";
    static final String TABLE_FILTER = "TABLE_NAME NOT LIKE 'BIN$%' AND TABLE_NAME <> 'flyway_schema_history'";
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    final ObjectMapper om = new ObjectMapper();
    final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void clean() throws Exception {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
        assertThat(call("reg", "owner", Map.of("modelId", "mdm", "moduleId", "mdm", "schemaName", "MDMAPUSER", "modelName", "MDM"))
                .at("/meta/success").asBoolean()).isTrue();
    }

    private static String clientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : KEY;
    }

    JsonNode call(String action, String user, Map<String, Object> params) throws Exception {
        String body = om.writeValueAsString(Map.of("meta", Map.of("menuId", "erdEdit"), "params", params));
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/oasis/erdEdit/" + action))
                .header("Content-Type", "application/json").header("X-Client-Key", clientKey())
                .header("X-Authenticated-User", user).header("X-Authenticated-Role", "MDM_STEWARD")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        return om.readTree(http.send(req, HttpResponse.BodyHandlers.ofString()).body());
    }

    JsonNode importDb(String user, long baseRev) throws Exception {
        return call("import", user, Map.of("modelId", "mdm", "kind", "FROM_DB", "baseRev", baseRev,
                "session", "ui-" + user, "source", "UI"));
    }

    long rev() {
        return jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = 'mdm'", Long.class);
    }

    JsonNode model() throws Exception {
        return om.readTree(call("view", "owner", Map.of("modelId", "mdm")).at("/data/result/model").asText());
    }

    /** 자식·부모 표 물리명이 맞는 DB 상태 관계. 없으면 null. */
    static JsonNode dbRelation(JsonNode model, String child, String parent) {
        String c = tableId(model, child), p = tableId(model, parent);
        for (JsonNode r : model.path("relations")) {
            if (r.path("child").asText().equals(c) && r.path("parent").asText().equals(p) && r.path("state").asText().equals("DB")) return r;
        }
        return null;
    }

    static String tableId(JsonNode model, String phys) {
        var it = model.path("tables").fields();
        while (it.hasNext()) {
            var e = it.next();
            if (e.getValue().path("phys").asText().equals(phys)) return e.getKey();
        }
        throw new AssertionError("표 없음: " + phys);
    }

    @Test
    void importsMdmSchemaWithDbRelationsAndDiagram() throws Exception {
        int tables = jdbc.queryForObject("SELECT COUNT(*) FROM USER_TABLES WHERE " + TABLE_FILTER, Integer.class);
        int columns = jdbc.queryForObject("SELECT COUNT(*) FROM USER_TAB_COLUMNS WHERE TABLE_NAME IN (SELECT TABLE_NAME FROM USER_TABLES WHERE "
                + TABLE_FILTER + ")", Integer.class);
        int fks = jdbc.queryForObject("SELECT COUNT(*) FROM USER_CONSTRAINTS WHERE CONSTRAINT_TYPE = 'R' AND " + TABLE_FILTER, Integer.class);
        int pks = jdbc.queryForObject("SELECT COUNT(*) FROM USER_CONSTRAINTS WHERE CONSTRAINT_TYPE = 'P' AND " + TABLE_FILTER, Integer.class);

        JsonNode r = importDb("owner", 0);
        assertThat(r.at("/meta/success").asBoolean()).as(r.toString()).isTrue();
        JsonNode res = r.at("/data/result");
        assertThat(res.path("applied").asBoolean()).as(res.path("rejection").toString()).isTrue();
        assertThat(res.path("rev").asLong()).isEqualTo(1);
        assertThat(res.at("/summary/tables").asInt()).isEqualTo(tables);
        assertThat(res.at("/summary/columns").asInt()).isEqualTo(columns);
        assertThat(res.at("/summary/keys").asInt()).isGreaterThanOrEqualTo(pks);
        assertThat(res.at("/summary/relations/DB").asInt()).isEqualTo(fks);
        assertThat(res.at("/summary/relations/INFERRED").asInt()).isPositive();
        String diagramId = res.at("/summary/diagramId").asText();
        assertThat(diagramId).startsWith("d-");
        assertThat(rev()).isEqualTo(1);

        JsonNode m = model();
        assertThat(m.path("tables").size()).isEqualTo(tables);
        // 단일 UNIQUE 를 부모로 둔 FK, 복합 UNIQUE 를 부모로 둔 FK, 자기 참조 FK
        assertThat(dbRelation(m, "TB_MDM_LAYOUT_ITEM", "TB_MDM_COLUMN")).isNotNull();
        assertThat(dbRelation(m, "TB_MDM_LAYOUT_CONST", "TB_MDM_LAYOUT_HEADER").path("pairs").size()).isEqualTo(3);
        JsonNode self = dbRelation(m, "TB_MDM_DOMAIN", "TB_MDM_DOMAIN");
        assertThat(self).isNotNull();
        assertThat(self.path("dbFk").asBoolean()).isTrue();
        assertThat(self.path("identifying").asBoolean()).isFalse();
        // 다이어그램 "전체"에 표가 모두 놓였다
        assertThat(jdbc.queryForObject("SELECT DIAGRAM_NAME FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID = ? AND ERD_MODEL_ID = 'mdm'",
                String.class, diagramId)).isEqualTo("전체");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ?", Integer.class, diagramId))
                .isEqualTo(tables);
        // 명령 기록 한 줄(rev 1), 출처 UI
        assertThat(jdbc.queryForMap("SELECT USER_ID, SOURCE FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = 'mdm' AND REV = 1"))
                .containsEntry("USER_ID", "owner").containsEntry("SOURCE", "UI");
    }

    /** Review Focus 3: 같은 모델에 가져오기를 두 번 보낸다(두 탭) → 둘째는 "표가 이미 있다" INVALID 이고 rev 는 한 번만 오른다. */
    @Test
    void secondImportIsInvalid() throws Exception {
        assertThat(importDb("owner", 0).at("/data/result/applied").asBoolean()).isTrue();
        JsonNode second = importDb("owner", 0);   // 다른 탭이 같은 baseRev 로 보낸 것
        assertThat(second.at("/meta/success").asBoolean()).as(second.toString()).isTrue();
        JsonNode res = second.at("/data/result");
        assertThat(res.path("applied").asBoolean()).isFalse();
        assertThat(res.at("/rejection/code").asText()).isEqualTo("INVALID");
        assertThat(res.at("/rejection/message").asText()).contains("이미 표가 있습니다");
        assertThat(res.at("/rejection/hint").asText()).contains("DB_DIFF");
        assertThat(res.path("summary").isNull() || res.path("summary").isMissingNode()).isTrue();
        assertThat(res.path("rev").asLong()).isEqualTo(1);
        assertThat(rev()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = 'mdm'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM WHERE ERD_MODEL_ID = 'mdm'", Integer.class)).isEqualTo(1);
        // 최신 rev 로 다시 보내도 같다
        assertThat(importDb("owner", 1).at("/data/result/rejection/code").asText()).isEqualTo("INVALID");
        assertThat(rev()).isEqualTo(1);
    }

    @Test
    void undoOfImportEmptiesModelAndAllowsReimport() throws Exception {
        assertThat(importDb("owner", 0).at("/data/result/rev").asLong()).isEqualTo(1);
        JsonNode undo = call("restore", "owner", Map.of("modelId", "mdm", "rev", 1, "session", "ui-owner", "source", "UI"));
        assertThat(undo.at("/data/result/applied").asBoolean()).as(undo.toString()).isTrue();
        assertThat(undo.at("/data/result/rev").asLong()).isEqualTo(2);
        JsonNode m = model();
        assertThat(m.path("tables").size()).isZero();
        assertThat(m.path("columns").size()).isZero();
        assertThat(m.path("relations").size()).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM WHERE ERD_MODEL_ID = 'mdm'", Integer.class)).isZero();
        JsonNode again = importDb("owner", 2);
        assertThat(again.at("/data/result/applied").asBoolean()).as(again.toString()).isTrue();
        assertThat(again.at("/data/result/rev").asLong()).isEqualTo(3);
    }

    @Test
    void importNeedsFromDbKindEditorAndTables() throws Exception {
        assertThat(call("import", "owner", Map.of("modelId", "mdm", "baseRev", 0)).at("/meta/code").asText()).isEqualTo("MDM021");
        assertThat(call("import", "owner", Map.of("modelId", "mdm", "kind", "APPLY_DIFF", "baseRev", 0)).at("/meta/code").asText())
                .isEqualTo("MDM021");
        assertThat(call("import", "owner", Map.of("modelId", "mdm", "kind", "FROM_DB")).at("/meta/code").asText()).isEqualTo("MDM021");
        JsonNode stranger = importDb("stranger", 0);
        assertThat(stranger.at("/data/result/rejection/code").asText()).as(stranger.toString()).isEqualTo("NOT_EDITOR");
        assertThat(rev()).isZero();
        // 표가 없는 스키마(복제 PDB 에 없는 스키마 이름)는 잠그기 전에 입력 오류다
        call("reg", "owner", Map.of("modelId", "nope", "moduleId", "nope", "schemaName", "NO_SUCH_SCHEMA", "modelName", "없음"));
        JsonNode empty = call("import", "owner", Map.of("modelId", "nope", "kind", "FROM_DB", "baseRev", 0));
        assertThat(empty.at("/meta/code").asText()).as(empty.toString()).isEqualTo("MDM021");
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = 'nope'", Long.class)).isZero();
    }
}
```

`AT/MdmOasisActionVocabularyTest.java` 의 erdEdit 시험을 아래로 바꾼다.

```java
    /** ERD 설계 단계 1 — 15개 액션(단계 1 에서 import 를 더했다). 모두 어휘 안에 있고, 확정(confirm)이 있어 확정 세트 안에서만 권한이 난다. */
    @Test
    void dma_erdEdit_bpmn_의_액션은_어휘_안의_15개다() throws Exception {
        Path path = bpmnPath("erdEdit.bpmn");
        assertActionsWithinVocabulary(path);
        assertEquals(Set.of("search", "view", "compare", "validate", "reg", "save", "restore", "execute", "copy", "delete",
                "lock", "unlock", "handover", "confirm", "import"), actionsFromGateway(path));
        assertTrue(new java.util.HashSet<>(MdmPermissions.CONFIRM_ACTIONS).containsAll(actionsFromGateway(path)), actionsFromGateway(path).toString());
    }
```

- [ ] **Step 8: 시험이 실패하는지 확인**

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdImportTest' --tests '*MdmOasisActionVocabularyTest'`
Expected: FAIL. 어휘 시험은 기대 15개와 실제 14개가 달라 실패한다. `ErdImportTest` 는 `import` 흐름이 없어 `meta.success=false` 로 실패한다.

- [ ] **Step 9: 구현 — `ErdCommandService.applyImport`**

`applyInternal` 에 마지막 인자 `boolean requireEmptyModel` 을 더한다. 기존 두 호출에는 `false` 를 넘긴다.

```java
    // apply(...) 안
        return applyInternal(modelId, baseRev, userId, session, source, raw, false, null, -1, false);
    // undo(...) 끝
        return applyInternal(modelId, -1, userId, session, source, raw, true, expectedAfter, rev, false);
```

```java
    /**
     * 첫 가져오기(README S2). 서비스 안에서만 부른다 — 공개 {@link #apply} 는 restore 를 계속 거절한다(R4-3).
     * 단계 0 apply 와 같은 순서(잠금 → baseRev → DRAFT·편집자 → 표지 → 엔진 → CAS → 기록 → 커밋 뒤 발행)를 거친다.
     * 묶음은 [restore, addDiagram, placeTables] 3건이고 rev 는 1 오른다. 모델에 표가 있으면 잠근 뒤 엔진 전에 INVALID 다
     * (restore upsert 는 물리명 중복을 보지 않으므로 여기서 막지 않으면 표가 두 벌 생긴다).
     */
    public ErdApplyResult applyImport(String modelId, long baseRev, String userId, String session, String source,
                                      ErdCommand.Restore restore, List<JsonNode> diagramCommands) {
        if (baseRev < 0) return rejectedNow(modelId, invalid(0, "baseRev 는 0 이상이어야 합니다", "view 가 준 rev 를 쓰세요"));
        List<JsonNode> raw = new ArrayList<>();
        raw.add(typed(ErdCommand.class, restore));
        raw.addAll(diagramCommands);
        return applyInternal(modelId, baseRev, userId, session, source, raw, true, null, -1, true);
    }
```

`applyInternal` 시그니처와 javadoc 을 고친다.

```java
     * @param requireEmptyModel 첫 가져오기일 때만 true: 잠근 뒤 모델에 표가 있으면 INVALID.
     */
    private ErdApplyResult applyInternal(String modelId, long baseRev, String userId, String session, String source,
                                         List<JsonNode> raw, boolean allowRestore,
                                         Map<String, JsonNode> expectedAfter, long undoOf, boolean requireEmptyModel) {
```

`ErdModel model = needModel ? ErdModelCodec.read(shown.getModelJson()) : null;` 바로 다음 줄에 넣는다.

```java
            if (requireEmptyModel && !model.tables.isEmpty()) {
                status.setRollbackOnly();
                return ErdApplyResult.rejected(rev, invalid(0,
                        "이미 표가 있습니다(" + model.tables.size() + "개). 첫 가져오기는 표가 없는 모델에만 합니다",
                        "다시 가져오기 차이는 compare kind=DB_DIFF 로 보세요"));
            }
```

`requireEmptyModel` 이면 묶음에 restore(모델 명령)가 있으므로 `needModel` 은 늘 true 다.

- [ ] **Step 10: 구현 — `ErdEditService.importModel`**

생성자에 `ErdDbMetaReader metaReader`, `ErdHintsLoader hintsLoader` 를 더한다. 필드 두 줄을 `outsideTx` 필드 위에 넣고, 기존 생성자 전체를 아래 생성자로 바꾼다.

```java
// import 추가
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMetaReader;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdApplyResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdImportResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning;
import com.dongkuk.dmes.mdm.dma.erdEdit.importing.ErdImportBuilder;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.ErdHintsLoader;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.ErdRelationInferrer;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.InferredRelation;

    private final ErdDbMetaReader metaReader;
    private final ErdHintsLoader hintsLoader;

    public ErdEditService(ErdModelStore store, ErdVersionService versions, ErdCommandService commands,
                          ErdConfirmCheck confirmCheck, ErdDictionaryLoader dictionaries, VersionStateService stateService,
                          DraftOwnershipService ownership, MdmCurrentUser currentUser, JdbcTemplate jdbc,
                          ErdEventHub hub, ErdDbMetaReader metaReader, ErdHintsLoader hintsLoader,
                          PlatformTransactionManager transactionManager) {
        this.store = store;
        this.versions = versions;
        this.commands = commands;
        this.confirmCheck = confirmCheck;
        this.dictionaries = dictionaries;
        this.stateService = stateService;
        this.ownership = ownership;
        this.currentUser = currentUser;
        this.jdbc = jdbc;
        this.hub = hub;
        this.metaReader = metaReader;
        this.hintsLoader = hintsLoader;
        this.outsideTx = new TransactionTemplate(transactionManager);
        this.outsideTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_NOT_SUPPORTED);
    }
```

`restore(...)` 메서드 아래에 넣는다. Java 메서드 이름에 `import` 를 쓸 수 없으므로 `importModel` 이다(BPMN `method` 값도 같다).

```java
    /**
     * 첫 가져오기(S2·S3). 메타 읽기·관계 추정·요소 만들기는 모델 행을 잠그기 전에 하고, 쓰기는 applyImport 한 번이다.
     * 사전은 여기(논리명)와 applyImport(엔진 경고)에서 두 번 읽는다. 거절은 성공 응답에 rejection 을 담는다(save 와 같다).
     */
    public Map<String, Object> importModel(ErdEditRequest r) {
        String modelId = requireModelId(r);
        if (!isKind(r, "FROM_DB")) throw MdmErrors.invalid("import 의 kind 는 FROM_DB 입니다: " + r.getKind());
        if (r.getBaseRev() == null) throw MdmErrors.invalid("baseRev 는 필수입니다");
        long baseRev = r.getBaseRev();
        String me = currentUser.userId();
        String session = session(r, me);
        String source = source(r);
        String[] moduleSchema = moduleAndSchema(modelId);
        ErdDbMeta meta = metaReader.read(moduleSchema[1]);
        if (meta.tables().isEmpty()) {
            throw MdmErrors.invalid("스키마 " + moduleSchema[1] + " 에 가져올 표가 없습니다(스키마 이름과 읽기 권한을 확인하세요)");
        }
        List<InferredRelation> inferred = new ErdRelationInferrer().infer(meta, hintsLoader.load(moduleSchema[0]));
        ErdImportBuilder.Built built = ErdImportBuilder.build(meta, inferred, dictionaries.load(), baseRev);
        ErdApplyResult res = outsideTx.execute(status -> commands.applyImport(modelId, baseRev, me, session, source,
                built.restore(), built.diagramCommands()));
        List<ErdWarning> warnings = new ArrayList<>(res.warnings());
        if (res.applied()) warnings.addAll(built.skipped());
        return plain(new ErdImportResult(res.applied(), res.rev(), res.changes(), warnings, res.rejection(),
                res.applied() ? built.summary() : null));
    }

    /** 모델 행의 [MODULE_ID, SCHEMA_NAME]. 없으면 ERD_MODEL_NOT_FOUND. */
    private String[] moduleAndSchema(String modelId) {
        List<String[]> rows = jdbc.query("SELECT MODULE_ID, SCHEMA_NAME FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = ?",
                (rs, i) -> new String[]{rs.getString(1), rs.getString(2)}, modelId);
        if (rows.isEmpty()) throw MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND);
        if (rows.get(0)[1] == null || rows.get(0)[1].isBlank()) throw MdmErrors.invalid("모델에 스키마 이름이 없습니다: " + modelId);
        return rows.get(0);
    }

    /** 요청 kind 가 k 인가(앞뒤 공백·대소문자 무시). */
    private static boolean isKind(ErdEditRequest r, String k) {
        return r.getKind() != null && k.equals(r.getKind().trim().toUpperCase(Locale.ROOT));
    }
```

Task 1 이 같은 일을 하는 kind 도우미를 이미 만들었으면 `isKind` 를 새로 만들지 않고 그것을 쓴다(이름만 맞춘다).

- [ ] **Step 11: BPMN — 15번째 흐름 `import`**

`src/backend/mdm/api/src/main/resources/services/dma/erdEdit.bpmn` 을 고친다. `bpmn-tool` 은 이 PC 에 깔려 있지 않으므로 형제 액션 `confirm` 을 그대로 본떠 손으로 넣는다.

1. `<bpmn:documentation>` 의 `import 는 단계 1 에서 더한다.` 를 `import 는 kind=FROM_DB(첫 가져오기)만 받는다. 메서드 이름은 importModel 이다(import 는 Java 예약어).` 로 바꾼다.
2. `actionGateway` 의 `<bpmn:outgoing>flow_confirm</bpmn:outgoing>` 다음 줄:

```xml
      <bpmn:outgoing>flow_import</bpmn:outgoing>
```

3. `confirmTask` 의 `</bpmn:serviceTask>` 다음:

```xml
    <bpmn:serviceTask id="importTask" name="DB 가져오기" camunda:class="erdEditService">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="method" value="importModel" />
          <camunda:property name="output" value="result" />
          <camunda:property name="dto" value="com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdEditRequest" />
        </camunda:properties>
      </bpmn:extensionElements>
      <bpmn:incoming>flow_import</bpmn:incoming>
      <bpmn:outgoing>flow_import_end</bpmn:outgoing>
    </bpmn:serviceTask>
```

4. `endConfirm` 의 `</bpmn:endEvent>` 다음:

```xml
    <bpmn:endEvent id="endImport" name="DB 가져오기 완료">
      <bpmn:incoming>flow_import_end</bpmn:incoming>
    </bpmn:endEvent>
```

5. `flow_confirm` 다음, `flow_confirm_end` 다음에 각각:

```xml
    <bpmn:sequenceFlow id="flow_import" name="import" sourceRef="actionGateway" targetRef="importTask" />
```

```xml
    <bpmn:sequenceFlow id="flow_import_end" sourceRef="importTask" targetRef="endImport" />
```

6. DI: `confirmTask_di`·`endConfirm_di`·`flow_confirm_di`·`flow_confirm_end_di` 다음에 각각(한 칸 = 120px 아래):

```xml
      <bpmndi:BPMNShape id="importTask_di" bpmnElement="importTask">
        <dc:Bounds x="380" y="1740" width="100" height="80" />
      </bpmndi:BPMNShape>
```

```xml
      <bpmndi:BPMNShape id="endImport_di" bpmnElement="endImport">
        <dc:Bounds x="560" y="1762" width="36" height="36" />
      </bpmndi:BPMNShape>
```

```xml
      <bpmndi:BPMNEdge id="flow_import_di" bpmnElement="flow_import">
        <di:waypoint x="270" y="955" />
        <di:waypoint x="270" y="1780" />
        <di:waypoint x="380" y="1780" />
      </bpmndi:BPMNEdge>
```

```xml
      <bpmndi:BPMNEdge id="flow_import_end_di" bpmnElement="flow_import_end">
        <di:waypoint x="480" y="1780" />
        <di:waypoint x="560" y="1780" />
      </bpmndi:BPMNEdge>
```

계약 검사(저장소 루트에서):

```bash
node .claude/skills/oasis-contract-check/scripts/check_oasis_contract.mjs --root .
```
Expected: ERROR 0.

- [ ] **Step 12: 시험 통과 확인**

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdImportTest' --tests '*MdmOasisActionVocabularyTest' --tests '*ErdCommandServiceTest' --tests '*ErdEditOasisHttpTest'`
Expected: 모두 PASS. `ErdImportTest` 4건이 새로 돌고, `applyInternal` 인자를 바꾼 단계 0 시험(`ErdCommandServiceTest`·`ErdEditOasisHttpTest`)은 그대로 통과한다.

`ErdImportTest` 가 `ORA-24816`·`ORA-01461` 로 실패하면 32KB 를 넘는 JSON 바인딩 순서 문제다. 계획 작성자 메모의 해당 줄을 보고 조정 세션에 알린다.

- [ ] **Step 13: 커밋**

```bash
/usr/bin/git add src/backend/mdm
/usr/bin/git commit -F - <<'EOF'
feat(mdm): ERD 첫 가져오기 — import kind=FROM_DB, restore 한 번으로 표·관계·다이어그램 "전체" 를 넣고 되돌릴 수 있게

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

---

### Task 5: 표준 상태·DB 차이 읽기

**Files:**
- Create: `L/importing/ErdDbDiff.java`, `L/importing/ErdDbDiffItem.java`
- Create: `L/dto/ErdStatusView.java`, `L/dto/ErdDbDiffView.java`
- Modify: `L/service/ErdEditService.java` (`view` kind=STATUS, `compare` kind=DB_DIFF), `L/dto/ErdEditRequest.java` (`kind` 설명)
- Test: `LT/importing/ErdDbDiffTest.java`, `AT/dma/erdEdit/ErdReadKindsTest.java`

**Interfaces:**
- Consumes: Task 4 의 `ErdImportBuilder.typeOf`·`build`, `ErdEditService.moduleAndSchema`·`isKind`, Task 2 의 `ErdDbMetaReader.read`, 단계 0 의 `ErdStandardJudge.judge`·`ErdDictionaryLoader.load`.
- Produces (README 정본 JSON 그대로):
  - `record ErdStatusView(String modelId, String ver, long rev, Map<String,String> statuses, Map<String,Domain> domains, Map<String,Integer> counts, long elapsedMs)`, `record Domain(String name, String dataType, Integer length, Integer scale)`.
  - `record ErdDbDiffItem(String id, String kind, String table, String column, Map<String,Object> before, Map<String,Object> after)`.
  - `record ErdDbDiffView(String modelId, long rev, String schema, List<ErdDbDiffItem> items)`.
  - `ErdDbDiff.diff(ErdModel model, ErdDbMeta meta) : List<ErdDbDiffItem>` — 순수 함수.

차이 규칙:

| kind | 언제 | `before` / `after` |
|---|---|---|
| `TABLE_ADDED` | DB 에만 있는 표 | null / null |
| `TABLE_REMOVED` | 모델에만 있는 표 | null / null |
| `COLUMN_ADDED` | 두 쪽에 다 있는 표에서 DB 에만 있는 컬럼 | null / 타입 |
| `COLUMN_REMOVED` | 두 쪽에 다 있는 표에서 모델에만 있는 컬럼 | 타입 / null |
| `COLUMN_CHANGED` | `dataType`·`length`·`scale`·`notNull` 가운데 하나라도 다르다. 논리명·주석·기본값은 비교하지 않는다 | 타입 / 타입 |
| `FK_ADDED` | DB 의 R 제약이 모델의 `dbFk=true` 관계에 없다. 자식 표가 모델에 있을 때만(없으면 `TABLE_ADDED` 가 덮는다) | null / FK |
| `FK_REMOVED` | 모델의 `dbFk=true` 관계(다른 모델 부모 `parentRef` 는 빼고)가 DB 에 없다. 자식 표가 DB 에 있을 때만 | FK / null |

- 타입 = `{dataType, length, scale, notNull}`. DB 쪽은 `ErdImportBuilder.typeOf` 로 바꾼 값이다. 그래서 가져온 직후 차이는 0건이다.
- FK = `{parentTable, childColumns, parentColumns}`.
- `id` 는 README 형식이다. 컬럼 `KIND:표.컬럼`, 표 `KIND:표`, FK `KIND:자식표(컬럼,…)>부모표(컬럼,…)`. 목록은 `id` 순이다.
- 관계의 상태(확정·기각)는 FK 비교에 쓰지 않는다. `dbFk` 만 본다.

- [ ] **Step 1: 실패하는 단위 시험 작성 — `LT/importing/ErdDbDiffTest.java`**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.importing;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Column;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Constraint;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Table;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ApplyOutcome;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommandEngine;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdNaming;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.InferredRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdEvidence;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionary;
import com.dongkuk.dmes.mdm.dma.naming.TermDictionary;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class ErdDbDiffTest {

    static Column col(String name, int pos, String type, Integer len, Integer prec, Integer scale, boolean nullable) {
        return new Column(name, pos, type, len, prec, scale, nullable, null, null);
    }

    static Table tb(String name, String comment, Column... cols) {
        return new Table(name, comment, List.of(cols));
    }

    static ErdDbMeta before() {
        return new ErdDbMeta("S", List.of(
                tb("TB_P", "부모", col("ID", 1, "VARCHAR2", 10, null, null, false)),
                tb("TB_C", "자식",
                        col("ID", 1, "NUMBER", 22, 19, 0, false),
                        col("P_ID", 2, "VARCHAR2", 10, null, null, true),
                        col("AMT", 3, "NUMBER", 22, 15, 2, true),
                        col("RATE", 4, "FLOAT", 22, 126, null, true),
                        col("NOTE", 5, "VARCHAR2", 10, null, null, true),
                        col("OLD", 6, "CHAR", 1, null, null, true),
                        col("AT", 7, "TIMESTAMP(6)", 11, null, 6, true)),
                tb("TB_GONE", null, col("A", 1, "DATE", 7, null, null, true))),
            List.of(
                new Constraint("PK_TB_P", "TB_P", "P", List.of("ID"), null, null),
                new Constraint("PK_TB_C", "TB_C", "P", List.of("ID"), null, null),
                new Constraint("FK_TB_C_P", "TB_C", "R", List.of("P_ID"), "TB_P", List.of("ID"))),
            List.of());
    }

    static ErdModel imported(ErdDbMeta meta) {
        List<InferredRelation> rels = meta.constraints().stream().filter(k -> k.type().equals("R"))
                .map(k -> new InferredRelation(k.table(), k.columns(), k.refTable(), k.refColumns(), "DB",
                        List.of(new ErdEvidence("DB_FK", k.name())), null)).toList();
        var dict = new ErdDictionary(TermDictionary.of(List.of()), Set.of(), Set.of(), Map.of(), List.of());
        var built = ErdImportBuilder.build(meta, rels, dict, 0);
        var out = new ErdCommandEngine(ErdNaming.NONE).apply(ErdModel.empty("m", "S"), 0, 1, "s", List.of(built.restore()));
        return ((ApplyOutcome.Applied) out).next();
    }

    @Test
    void diffRightAfterImportIsEmpty() {
        assertThat(ErdDbDiff.diff(imported(before()), before())).isEmpty();
    }

    @Test
    void reportsEveryKindByPhysicalNameInIdOrder() {
        ErdModel model = imported(before());
        ErdDbMeta after = new ErdDbMeta("S", List.of(
                tb("TB_P", "부모 이름 바뀜", col("ID", 1, "VARCHAR2", 10, null, null, false)),   // 주석만 바뀜 → 차이 아님
                tb("TB_C", "자식",
                        col("ID", 1, "NUMBER", 22, 19, 0, false),
                        col("P_ID", 2, "VARCHAR2", 10, null, null, false),               // NOT NULL 로
                        col("AMT", 3, "NUMBER", 22, 15, 2, true),
                        col("RATE", 4, "FLOAT", 22, 126, null, true),
                        new Column("NOTE", 5, "VARCHAR2", 20, null, null, true, "'x'", "주석"),   // 길이 10 → 20(기본값·주석은 비교 안 함)
                        col("AT", 7, "TIMESTAMP(6)", 11, null, 6, true),
                        col("EXTRA", 8, "NUMBER", 22, 5, 0, true)),                     // 새 컬럼, OLD 는 사라짐
                tb("TB_NEW", null, col("P_ID", 1, "VARCHAR2", 10, null, null, true))),  // 새 표, TB_GONE 은 사라짐
            List.of(
                new Constraint("PK_TB_P", "TB_P", "P", List.of("ID"), null, null),
                new Constraint("PK_TB_C", "TB_C", "P", List.of("ID"), null, null),
                new Constraint("FK_TB_C_P2", "TB_C", "R", List.of("ID"), "TB_P", List.of("ID")),          // 새 FK
                new Constraint("FK_TB_NEW_P", "TB_NEW", "R", List.of("P_ID"), "TB_P", List.of("ID"))),    // 새 표의 FK → TABLE_ADDED 가 덮음
            List.of());

        List<ErdDbDiffItem> items = ErdDbDiff.diff(model, after);
        assertThat(items).extracting(ErdDbDiffItem::id).containsExactly(
                "COLUMN_ADDED:TB_C.EXTRA",
                "COLUMN_CHANGED:TB_C.NOTE",
                "COLUMN_CHANGED:TB_C.P_ID",
                "COLUMN_REMOVED:TB_C.OLD",
                "FK_ADDED:TB_C(ID)>TB_P(ID)",
                "FK_REMOVED:TB_C(P_ID)>TB_P(ID)",
                "TABLE_ADDED:TB_NEW",
                "TABLE_REMOVED:TB_GONE");
        ErdDbDiffItem note = items.get(1);
        assertThat(note.kind()).isEqualTo("COLUMN_CHANGED");
        assertThat(note.table()).isEqualTo("TB_C");
        assertThat(note.column()).isEqualTo("NOTE");
        assertThat(note.before()).containsEntry("dataType", "VARCHAR2").containsEntry("length", 10).containsEntry("notNull", false);
        assertThat(note.before()).containsKey("scale");
        assertThat(note.after()).containsEntry("length", 20);
        assertThat(items.get(2).before()).containsEntry("notNull", false);
        assertThat(items.get(2).after()).containsEntry("notNull", true);
        assertThat(items.get(0).before()).isNull();
        assertThat(items.get(0).after()).containsEntry("length", 5).containsEntry("scale", 0);
        assertThat(items.get(3).after()).isNull();
        assertThat(items.get(4).after()).containsEntry("parentTable", "TB_P").containsEntry("childColumns", List.of("ID"));
        assertThat(items.get(5).before()).containsEntry("parentColumns", List.of("ID"));
        assertThat(items.get(6).column()).isNull();
    }
}
```

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `../gradlew :lib:test --max-workers=2 --tests '*ErdDbDiffTest'`
Expected: 컴파일 실패(`ErdDbDiff`, `ErdDbDiffItem` 이 없다).

- [ ] **Step 3: 구현 — `ErdDbDiffItem`, `ErdDbDiff`**

```java
// L/importing/ErdDbDiffItem.java
package com.dongkuk.dmes.mdm.dma.erdEdit.importing;

import java.util.Map;

/** 다시 가져오기 차이 한 건(README ErdDbDiffView.items). 물리명으로 맞춘다 — DB 에는 모델 요소 UUID 가 없다. */
public record ErdDbDiffItem(String id, String kind, String table, String column,
                            Map<String, Object> before, Map<String, Object> after) {
}
```

```java
// L/importing/ErdDbDiff.java
package com.dongkuk.dmes.mdm.dma.erdEdit.importing;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdTable;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** DB 와 모델의 차이(README S4, 스펙 D10). 읽기 전용 순수 함수. 반영(applyDbDiff)은 단계 2 다. */
public final class ErdDbDiff {

    public static final String TABLE_ADDED = "TABLE_ADDED";
    public static final String TABLE_REMOVED = "TABLE_REMOVED";
    public static final String COLUMN_ADDED = "COLUMN_ADDED";
    public static final String COLUMN_REMOVED = "COLUMN_REMOVED";
    public static final String COLUMN_CHANGED = "COLUMN_CHANGED";
    public static final String FK_ADDED = "FK_ADDED";
    public static final String FK_REMOVED = "FK_REMOVED";

    private ErdDbDiff() {
    }

    public static List<ErdDbDiffItem> diff(ErdModel model, ErdDbMeta meta) {
        List<ErdDbDiffItem> out = new ArrayList<>();
        Map<String, ErdTable> modelTables = new LinkedHashMap<>();
        model.tables.values().forEach(t -> modelTables.put(t.phys, t));
        Set<String> dbTables = new HashSet<>();
        for (ErdDbMeta.Table t : meta.tables()) {
            dbTables.add(t.name());
            ErdTable mt = modelTables.get(t.name());
            if (mt == null) {
                out.add(item(TABLE_ADDED, t.name(), null, null, null, t.name()));
                continue;
            }
            Map<String, ErdColumn> modelCols = new LinkedHashMap<>();
            for (String cid : mt.columnOrder) {
                ErdColumn c = model.columns.get(cid);
                if (c != null) modelCols.put(c.phys, c);
            }
            Set<String> dbCols = new HashSet<>();
            for (ErdDbMeta.Column c : t.columns()) {
                dbCols.add(c.name());
                ErdImportBuilder.ColumnType ty = ErdImportBuilder.typeOf(c);
                Map<String, Object> after = type(ty.dataType(), ty.length(), ty.scale(), !c.nullable());
                ErdColumn mc = modelCols.get(c.name());
                if (mc == null) {
                    out.add(item(COLUMN_ADDED, t.name(), c.name(), null, after, t.name() + "." + c.name()));
                } else {
                    Map<String, Object> before = type(mc.dataType, mc.length, mc.scale, mc.notNull);
                    if (!before.equals(after)) out.add(item(COLUMN_CHANGED, t.name(), c.name(), before, after, t.name() + "." + c.name()));
                }
            }
            for (ErdColumn mc : modelCols.values()) {
                if (!dbCols.contains(mc.phys)) {
                    out.add(item(COLUMN_REMOVED, t.name(), mc.phys, type(mc.dataType, mc.length, mc.scale, mc.notNull), null,
                            t.name() + "." + mc.phys));
                }
            }
        }
        for (String phys : modelTables.keySet()) {
            if (!dbTables.contains(phys)) out.add(item(TABLE_REMOVED, phys, null, null, null, phys));
        }
        Map<String, Fk> dbFks = new LinkedHashMap<>();
        for (ErdDbMeta.Constraint k : meta.constraints()) {
            if ("R".equals(k.type())) dbFks.put(fkKey(k.table(), k.columns(), k.refTable(), k.refColumns()),
                    new Fk(k.table(), k.columns(), k.refTable(), k.refColumns()));
        }
        Map<String, Fk> modelFks = new LinkedHashMap<>();
        for (ErdRelation r : model.relations.values()) {
            Fk fk = modelFk(model, r);
            if (fk != null) modelFks.put(fkKey(fk.child(), fk.childColumns(), fk.parent(), fk.parentColumns()), fk);
        }
        dbFks.forEach((key, fk) -> {
            if (!modelFks.containsKey(key) && modelTables.containsKey(fk.child())) {
                out.add(item(FK_ADDED, fk.child(), null, null, fk.json(), key));
            }
        });
        modelFks.forEach((key, fk) -> {
            if (!dbFks.containsKey(key) && dbTables.contains(fk.child())) {
                out.add(item(FK_REMOVED, fk.child(), null, fk.json(), null, key));
            }
        });
        out.sort(Comparator.comparing(ErdDbDiffItem::id));
        return out;
    }

    private record Fk(String child, List<String> childColumns, String parent, List<String> parentColumns) {
        Map<String, Object> json() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("parentTable", parent);
            m.put("childColumns", childColumns);
            m.put("parentColumns", parentColumns);
            return m;
        }
    }

    /** dbFk 관계를 물리명으로. 다른 모델 부모(parentRef)·끊어진 참조는 null. */
    private static Fk modelFk(ErdModel m, ErdRelation r) {
        if (!r.dbFk || r.parentRef != null) return null;
        ErdTable child = m.tables.get(r.child), parent = m.tables.get(r.parent);
        if (child == null || parent == null) return null;
        List<String> cc = new ArrayList<>(), pc = new ArrayList<>();
        for (List<String> p : r.pairs) {
            ErdColumn c = m.columns.get(p.get(0)), q = m.columns.get(p.get(1));
            if (c == null || q == null) return null;
            cc.add(c.phys);
            pc.add(q.phys);
        }
        return new Fk(child.phys, cc, parent.phys, pc);
    }

    static String fkKey(String child, List<String> childColumns, String parent, List<String> parentColumns) {
        return child + "(" + String.join(",", childColumns) + ")>" + parent + "(" + String.join(",", parentColumns) + ")";
    }

    /** null 값을 담아야 하므로 Map.of 를 쓰지 않는다. */
    private static Map<String, Object> type(String dataType, Integer length, Integer scale, boolean notNull) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("dataType", dataType);
        m.put("length", length);
        m.put("scale", scale);
        m.put("notNull", notNull);
        return m;
    }

    private static ErdDbDiffItem item(String kind, String table, String column, Map<String, Object> before,
                                      Map<String, Object> after, String idTail) {
        return new ErdDbDiffItem(kind + ":" + idTail, kind, table, column, before, after);
    }
}
```

- [ ] **Step 4: 단위 시험 통과 확인과 커밋**

Run: `../gradlew :lib:test --max-workers=2 --tests '*ErdDbDiffTest'`
Expected: 2건 PASS.

```bash
/usr/bin/git add src/backend/mdm/lib
/usr/bin/git commit -F - <<'EOF'
feat(mdm): ERD 다시 가져오기 차이 계산 — 표·컬럼·FK 차이를 물리명으로, 가져온 직후 0건

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

- [ ] **Step 5: 실패하는 Oracle 시험 작성 — `AT/dma/erdEdit/ErdReadKindsTest.java`**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 읽기 kind — view kind=STATUS, compare kind=DB_DIFF 를 OASIS HTTP 로 부른다(ErdEditOasisHttpTest 형식).
 * MDMAPUSER 를 가져온 모델에서 본다. 차이 시험은 이 시험이 만든 표(TB_ERD_DIFF_*)만 바꾼다 — V1~V6 표는 건드리지 않는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + ErdReadKindsTest.KEY)
@ActiveProfiles("local")
class ErdReadKindsTest extends AbstractMdmSharedDbTest {

    static final String KEY = "erd-read-key";
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    final ObjectMapper om = new ObjectMapper();
    final HttpClient http = HttpClient.newHttpClient();
    /** 시험이 넣는 도메인 id. 시험 PDB 의 사전은 비어 있으므로(reset) 겹치지 않는다. */
    static final long DOMAIN_ID = 900001L;

    @BeforeEach
    void setUp() throws Exception {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
        DmaTestSupport.clear(jdbc);
        dropDiffTables();
        jdbc.execute("CREATE TABLE TB_ERD_DIFF_P (ID VARCHAR2(10) NOT NULL, CONSTRAINT PK_TB_ERD_DIFF_P PRIMARY KEY (ID))");
        jdbc.execute("CREATE TABLE TB_ERD_DIFF_C (ID VARCHAR2(10) NOT NULL, P_ID VARCHAR2(10), NOTE VARCHAR2(10), "
                + "CONSTRAINT PK_TB_ERD_DIFF_C PRIMARY KEY (ID))");
        // 컬럼 사전 한 줄 — 가져오기가 DOMAIN_ID 컬럼에 이 도메인을 채운다(S9). 리포지토리 save 는 DmaTestSupport.Config(가짜 사용자)를
        // 가져와야 해서 헤더 사용자와 섞이므로 JdbcTemplate 으로 넣는다. NOT NULL 칸만 채운다(감사 칼럼은 NULL 허용).
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_ID, DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE) "
                + "VALUES (?, '도메인아이디', 'DOMAIN_ID', 'QTY', 'NUMBER', 19, 0)", DOMAIN_ID);
        jdbc.update("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID) VALUES ('도메인아이디', 'DOMAIN_ID', ?)", DOMAIN_ID);
        assertThat(call("reg", "owner", Map.of("modelId", "mdm", "moduleId", "mdm", "schemaName", "MDMAPUSER", "modelName", "MDM"))
                .at("/meta/success").asBoolean()).isTrue();
        JsonNode imported = call("import", "owner", Map.of("modelId", "mdm", "kind", "FROM_DB", "baseRev", 0));
        assertThat(imported.at("/data/result/applied").asBoolean()).as(imported.toString()).isTrue();
    }

    @AfterEach
    void tearDown() {
        dropDiffTables();
        DmaTestSupport.clear(jdbc);
    }

    void dropDiffTables() {
        for (String t : List.of("TB_ERD_DIFF_N", "TB_ERD_DIFF_C", "TB_ERD_DIFF_P")) {
            Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME = ?", Integer.class, t);
            if (n != null && n > 0) jdbc.execute("DROP TABLE " + t + " CASCADE CONSTRAINTS PURGE");
        }
    }

    private static String clientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : KEY;
    }

    JsonNode call(String action, String user, Map<String, Object> params) throws Exception {
        String body = om.writeValueAsString(Map.of("meta", Map.of("menuId", "erdEdit"), "params", params));
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/oasis/erdEdit/" + action))
                .header("Content-Type", "application/json").header("X-Client-Key", clientKey())
                .header("X-Authenticated-User", user).header("X-Authenticated-Role", "MDM_STEWARD")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        return om.readTree(http.send(req, HttpResponse.BodyHandlers.ofString()).body());
    }

    @Test
    void statusGivesEveryColumnStatusDomainsAndCounts() throws Exception {
        JsonNode model = om.readTree(call("view", "viewer", Map.of("modelId", "mdm")).at("/data/result/model").asText());
        JsonNode r = call("view", "viewer", Map.of("modelId", "mdm", "kind", "STATUS"));
        assertThat(r.at("/meta/success").asBoolean()).as(r.toString()).isTrue();
        JsonNode res = r.at("/data/result");
        assertThat(res.path("modelId").asText()).isEqualTo("mdm");
        assertThat(res.path("ver").asText()).isEqualTo("1.000");
        assertThat(res.path("rev").asLong()).isEqualTo(1);
        int columnCount = model.path("columns").size();
        assertThat(res.path("statuses").size()).isEqualTo(columnCount);
        int sum = 0;
        for (String s : List.of("OK", "ALIAS", "NEW", "TYPE", "DOMAIN", "MISS")) {
            assertThat(res.path("counts").has(s)).as(s).isTrue();
            sum += res.at("/counts/" + s).asInt();
        }
        assertThat(sum).isEqualTo(columnCount);
        String domainCol = null;
        var it = model.path("columns").fields();
        while (it.hasNext()) {
            var e = it.next();
            if (e.getValue().path("phys").asText().equals("DOMAIN_ID")) domainCol = e.getKey();
        }
        assertThat(domainCol).isNotNull();
        assertThat(res.at("/statuses/" + domainCol).asText()).isIn("OK", "DOMAIN", "TYPE");   // 사전에 있다 → MISS·NEW 가 아니다
        assertThat(res.at("/domains/" + DOMAIN_ID + "/name").asText()).isEqualTo("도메인아이디");
        assertThat(res.at("/domains/" + DOMAIN_ID + "/dataType").asText()).isEqualTo("NUMBER");
        assertThat(res.path("elapsedMs").asLong()).isNotNegative();
    }

    @Test
    void dbDiffIsEmptyAfterImportThenListsDbChanges() throws Exception {
        JsonNode empty = call("compare", "viewer", Map.of("modelId", "mdm", "kind", "DB_DIFF"));
        assertThat(empty.at("/meta/success").asBoolean()).as(empty.toString()).isTrue();
        assertThat(empty.at("/data/result/schema").asText()).isEqualTo("MDMAPUSER");
        assertThat(empty.at("/data/result/items").size()).as(empty.toString()).isZero();

        jdbc.execute("ALTER TABLE TB_ERD_DIFF_C MODIFY (NOTE VARCHAR2(20))");
        jdbc.execute("ALTER TABLE TB_ERD_DIFF_C ADD (EXTRA NUMBER(5))");
        jdbc.execute("ALTER TABLE TB_ERD_DIFF_C ADD CONSTRAINT FK_TB_ERD_DIFF_C_P FOREIGN KEY (P_ID) REFERENCES TB_ERD_DIFF_P (ID)");
        jdbc.execute("CREATE TABLE TB_ERD_DIFF_N (A NUMBER(3))");

        JsonNode diff = call("compare", "viewer", Map.of("modelId", "mdm", "kind", "DB_DIFF"));
        JsonNode items = diff.at("/data/result/items");
        List<String> ids = new ArrayList<>();
        items.forEach(i -> ids.add(i.path("id").asText()));
        assertThat(ids).as(diff.toString()).containsExactly(
                "COLUMN_ADDED:TB_ERD_DIFF_C.EXTRA",
                "COLUMN_CHANGED:TB_ERD_DIFF_C.NOTE",
                "FK_ADDED:TB_ERD_DIFF_C(P_ID)>TB_ERD_DIFF_P(ID)",
                "TABLE_ADDED:TB_ERD_DIFF_N");
        assertThat(items.at("/1/before/length").asInt()).isEqualTo(10);
        assertThat(items.at("/1/after/length").asInt()).isEqualTo(20);
        assertThat(diff.at("/data/result/rev").asLong()).isEqualTo(1);   // 읽기다 — rev 가 그대로
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = 'mdm'", Long.class)).isEqualTo(1);
    }

    @Test
    void unknownKindsAreInvalid() throws Exception {
        assertThat(call("view", "viewer", Map.of("modelId", "mdm", "kind", "NOPE")).at("/meta/code").asText()).isEqualTo("MDM021");
        assertThat(call("compare", "viewer", Map.of("modelId", "mdm", "kind", "NOPE")).at("/meta/code").asText()).isEqualTo("MDM021");
        // kind 가 없으면 단계 0 동작 그대로다
        assertThat(call("compare", "viewer", Map.of("phys", "DOMAIN_ID")).at("/data/result").has("tokens")).isTrue();
    }
}
```

- [ ] **Step 6: 시험이 실패하는지 확인**

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdReadKindsTest'`
Expected: FAIL. `kind=STATUS` 는 단계 0 의 모델 보기로 떨어져 `statuses` 가 없다. `compare kind=DB_DIFF` 는 `logical 또는 phys 를 입력하세요`(MDM021) 로 끝난다.

- [ ] **Step 7: 구현 — 응답 DTO**

```java
// L/dto/ErdStatusView.java
package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import java.util.Map;

/**
 * view kind=STATUS 응답(README S5). statuses 는 컬럼 id → ErdColumnStatus 이름, domains 는 모델에 쓰인 domainId(문자열) → 도메인,
 * counts 는 상태 6개 모두의 수(0 포함), elapsedMs 는 사전 적재 + 판정 시간이다. 읽을 때마다 계산한다(캐시 없음, P3).
 */
public record ErdStatusView(String modelId, String ver, long rev, Map<String, String> statuses,
                            Map<String, Domain> domains, Map<String, Integer> counts, long elapsedMs) {

    public record Domain(String name, String dataType, Integer length, Integer scale) {}
}
```

```java
// L/dto/ErdDbDiffView.java
package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import com.dongkuk.dmes.mdm.dma.erdEdit.importing.ErdDbDiffItem;
import java.util.List;

/** compare kind=DB_DIFF 응답(README S4). rev 는 비교한 시점의 모델 rev, schema 는 읽은 DB 스키마다. */
public record ErdDbDiffView(String modelId, long rev, String schema, List<ErdDbDiffItem> items) {
}
```

- [ ] **Step 8: 구현 — `ErdEditService` 의 `view`·`compare` kind**

import 를 더한다.

```java
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDbDiffView;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdStatusView;
import com.dongkuk.dmes.mdm.dma.erdEdit.importing.ErdDbDiff;
```

`view(ErdEditRequest r)` 의 첫 줄로 넣는다. Task 1 이 넣은 `SET_VIEW` 분기와 모르는 kind 막기보다 앞이다.

```java
        if (isKind(r, "STATUS")) return status(r);
```

Task 1 의 `view` 가 모르는 kind 를 막지 않으면 `unknownKindsAreInvalid` 가 실패한다. 그때는 `SET_VIEW` 분기 다음에 아래 줄을 더한다.

```java
        if (notBlank(r.getKind())) throw MdmErrors.invalid("지원하지 않는 kind 입니다: " + r.getKind());
```

`compare(ErdEditRequest r)` 의 첫 줄로 넣는다(`ErdDictionary d = dictionaries.load();` 앞).

```java
        if (notBlank(r.getKind())) {
            if (isKind(r, "DB_DIFF")) return dbDiff(r);
            throw MdmErrors.invalid("지원하지 않는 kind 입니다: " + r.getKind());
        }
```

`compare` 아래에 두 메서드를 넣는다.

```java
    /**
     * 컬럼별 표준 상태(README S5). 사전을 이 요청에서 한 번 읽어 모델 전체를 판정한다(P3, 캐시 없음).
     * elapsedMs 는 사전 적재 + 판정 시간이다 — 단계 1 마감(Task 12)이 L_MAIN 에서 이 값으로 판정 시간을 잰다.
     */
    private Map<String, Object> status(ErdEditRequest r) {
        String modelId = requireModelId(r);
        long rev = store.rev(modelId);
        MdmErdModelVer v = r.getVer() == null ? store.current(modelId)
                : store.find(ref(modelId, r.getVer())).orElseThrow(() -> MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND));
        ErdModel m = ErdModelCodec.read(v.getModelJson());
        long started = System.nanoTime();
        ErdDictionary d = dictionaries.load();
        Map<String, ErdColumnStatus> judged = ErdStandardJudge.judge(m, d);
        long elapsedMs = (System.nanoTime() - started) / 1_000_000;
        Map<String, String> statuses = new LinkedHashMap<>();
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (ErdColumnStatus s : ErdColumnStatus.values()) counts.put(s.name(), 0);
        judged.forEach((id, s) -> {
            statuses.put(id, s.name());
            counts.merge(s.name(), 1, Integer::sum);
        });
        Map<String, ErdStatusView.Domain> domainsUsed = new LinkedHashMap<>();
        for (ErdColumn c : m.columns.values()) {
            if (c.domainId == null || domainsUsed.containsKey(String.valueOf(c.domainId))) continue;
            d.domain(c.domainId).ifPresent(x -> domainsUsed.put(String.valueOf(c.domainId),
                    new ErdStatusView.Domain(x.domainName(), x.dataType(), x.length(), x.scale())));
        }
        return plain(new ErdStatusView(modelId, VersionNumbers.plain(v.getVer()), rev, statuses, domainsUsed, counts, elapsedMs));
    }

    /** DB 와 지금 보이는 버전(DRAFT 우선)의 차이(README S4). 읽기만 한다 — 반영은 단계 2 의 import kind=APPLY_DIFF 다. */
    private Map<String, Object> dbDiff(ErdEditRequest r) {
        String modelId = requireModelId(r);
        long rev = store.rev(modelId);
        String schema = moduleAndSchema(modelId)[1];
        ErdModel m = ErdModelCodec.read(store.current(modelId).getModelJson());
        return plain(new ErdDbDiffView(modelId, rev, schema, ErdDbDiff.diff(m, metaReader.read(schema))));
    }
```

`L/dto/ErdEditRequest.java` 의 `kind` 필드 javadoc(Task 1 이 고쳤으면 그 문장)을 아래로 바꾼다. 새 필드는 없다.

```java
    /** 액션별 종류 — view: SET_VIEW·STATUS, compare: DB_DIFF, import: FROM_DB, execute: ADD_EDITOR·REMOVE_EDITOR·CLAIM·RELEASE. */
    private String kind;
```

- [ ] **Step 9: 시험 통과 확인**

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdReadKindsTest' --tests '*ErdEditOasisHttpTest'`
Expected: `ErdReadKindsTest` 3건 PASS, `ErdEditOasisHttpTest` 기존 건수 PASS(`compare` 의 kind 없는 경로가 그대로다).

- [ ] **Step 10: 커밋**

```bash
/usr/bin/git add src/backend/mdm
/usr/bin/git commit -F - <<'EOF'
feat(mdm): ERD 읽기 kind — view kind=STATUS 로 컬럼별 표준 상태, compare kind=DB_DIFF 로 DB 차이

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

---

## 계획 작성자 메모

- README Review Focus 1 은 `importBuildsCompositeUniqueAndSelfReference` 를 Task 3 시험으로 적었다. 작성 지시에 따라 Task 4 의 `ErdImportBuilderTest` 에 두었다.
- README 예시의 `"diagramId":"d-all"` 은 고정 id 로 쓸 수 없다. `TB_MDM_ERD_DIAGRAM.DIAGRAM_ID` 는 모델을 가리지 않는 전역 PK 라 두 번째 모델(MCM 다음 MDM) 가져오기가 "이미 있는 다이어그램 id" 로 거절된다. 그래서 `d-<UUID>` 를 쓰고 summary 로 돌려준다.
- `ErdRelationInferrer` 는 README 가 "순수" 로 적었으므로 인자 없는 공개 생성자가 있다고 보고 `new ErdRelationInferrer()` 로 부른다. Task 3 이 의존이 있는 빈으로 만들면 `ErdEditService` 생성자로 주입하도록 고친다.
- `typeOf` 는 Task 2 가 `Column.length` 에 문자 길이(CHAR_LENGTH), `precision`·`scale` 에 DATA_PRECISION·DATA_SCALE 을 넣는다고 가정한다. 바이트 길이(DATA_LENGTH)를 넣으면 `VARCHAR2(n CHAR)` 의 길이가 사전 도메인과 어긋난다.
- 엔진 restore 의 upsert 는 요소의 모든 속성(`candidateRank`·`evidence`·`state`·`pairs` 포함)을 `_rev` 에 찍는다. README 는 `candidateRank` 가 `_rev` 대상이 아니라고 적었다. 충돌 판정에는 영향이 없다(그 속성을 고치는 명령이 없다).
- `ErdImportResult.warnings` 에는 엔진이 낸 표준 경고(STD_*, 가져온 컬럼 수만큼)와 `IMPORT_SKIPPED` 가 함께 들어간다. README 는 경고 내용을 정하지 않았다. 화면(Task 9)이 경고 목록을 그대로 그리면 수백 줄이 된다.
- 가져오기는 32KB 를 넘는 JSON 을 `ErdCommandLogStore.insert`·`ErdModelStore.writeJson` 에 처음 넘긴다. Oracle 이 `ORA-24816`·`ORA-01461` 을 내면 원인은 큰 문자열 바인딩 순서다. 그때는 계획이 아니라 두 저장소의 바인딩을 고친다.
- 사전은 가져오기 한 번에 두 번 읽힌다(빌더의 논리명, `applyImport` 안 엔진 경고). Task 12 의 판정 시간 측정 때 함께 본다.
- README 파일 구조에 `ErdImportResult`·`ErdDbDiffView` 가 없다. 둘 다 `dto/` 에 두었다. `ErdEditRequest` 는 Task 5 에서 `kind` 설명만 고치고 새 필드는 더하지 않는다.
- Task 5 의 `view` kind 분기는 Task 1 의 코드가 아직 없어 줄 위치로만 적었다. Task 1 이 모르는 kind 를 막지 않으면 `unknownKindsAreInvalid` 가 실패하고, Step 8 의 한 줄로 고친다.
- Task 4 는 약 1,190줄로 권장 상한(700줄)을 넘는다. README 가 Task 4 에 사전·빌더·명령 서비스·OASIS 서비스·BPMN·어휘 시험·시험 2개를 함께 맡겼기 때문이다. 나누려면 Step 1~6(lib 빌더, 자기 커밋)과 Step 7~13(서비스·BPMN·Oracle 시험)으로 자른다.
