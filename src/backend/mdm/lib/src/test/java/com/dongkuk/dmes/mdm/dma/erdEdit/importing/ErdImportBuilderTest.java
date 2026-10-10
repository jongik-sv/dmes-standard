package com.dongkuk.dmes.mdm.dma.erdEdit.importing;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Column;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Constraint;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Index;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Table;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ApplyOutcome;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
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
}
