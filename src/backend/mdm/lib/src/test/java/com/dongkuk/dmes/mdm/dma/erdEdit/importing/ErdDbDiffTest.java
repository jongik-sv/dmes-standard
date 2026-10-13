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

    /** 감사 컬럼 불변식: addTable 이 만든 8개 컬럼은 같은 모양의 DB 컬럼과 비교해 COLUMN_CHANGED 가 없다. */
    @Test
    void addTableAuditColumnsMatchDbShape() {
        var created = ((ApplyOutcome.Applied) new ErdCommandEngine(ErdNaming.NONE).apply(ErdModel.empty("m", "S"), 0, 1, "s",
                List.of(new com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.AddTable(null, "TB_A", "에이", "")))).next();
        List<Column> cols = new java.util.ArrayList<>();
        int pos = 1;
        for (String n : List.of("C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID")) {
            boolean ts = n.endsWith("_AT");
            // DB 사실: VARCHAR2(100 CHAR) nullable, TIMESTAMP(6) nullable(DATA_LENGTH 11, scale 6)
            cols.add(ts ? col(n, pos++, "TIMESTAMP(6)", 11, null, 6, true) : col(n, pos++, "VARCHAR2", 100, null, null, true));
        }
        ErdDbMeta meta = new ErdDbMeta("S", List.of(tb("TB_A", null, cols.toArray(new Column[0]))), List.of(), List.of());
        assertThat(ErdDbDiff.diff(created, meta)).isEmpty();
    }

    /** 양쪽 컬럼의 상대 순서가 다르면 표당 한 건(COLUMN_ORDER, 컬럼·전후 값 없음). 한쪽에만 있는 컬럼은 순서 판정에 넣지 않는다. */
    @Test
    void columnOrderIsOneItemPerTableOverSharedColumns() {
        ErdModel model = imported(before());
        ErdDbMeta moved = new ErdDbMeta("S", List.of(
                tb("TB_P", "부모", col("ID", 1, "VARCHAR2", 10, null, null, false)),
                tb("TB_C", "자식",
                        col("AMT", 1, "NUMBER", 22, 15, 2, true),
                        col("ID", 2, "NUMBER", 22, 19, 0, false),
                        col("P_ID", 3, "VARCHAR2", 10, null, null, true),
                        col("RATE", 4, "FLOAT", 22, 126, null, true),
                        col("NOTE", 5, "VARCHAR2", 10, null, null, true),
                        col("OLD", 6, "CHAR", 1, null, null, true),
                        col("AT", 7, "TIMESTAMP(6)", 11, null, 6, true)),
                tb("TB_GONE", null, col("A", 1, "DATE", 7, null, null, true))),
            before().constraints(), List.of());
        List<ErdDbDiffItem> items = ErdDbDiff.diff(model, moved);
        assertThat(items).extracting(ErdDbDiffItem::id).containsExactly("COLUMN_ORDER:TB_C");
        assertThat(items.get(0).kind()).isEqualTo(ErdDbDiff.COLUMN_ORDER);
        assertThat(items.get(0).column()).isNull();
        assertThat(items.get(0).before()).isNull();
        assertThat(items.get(0).after()).isNull();

        // 모델에만 있는 컬럼(X)이 가운데 있어도, DB 에만 있는 컬럼(Y)이 있어도 양쪽 순서가 같으면 차이가 아니다
        assertThat(ErdDbDiff.orderDiffers(List.of("A", "X", "B"), List.of("A", "Y", "B"))).isFalse();
        assertThat(ErdDbDiff.orderDiffers(List.of("A", "X", "B"), List.of("B", "A"))).isTrue();
    }

    static ErdDbMeta composite(List<String> childCols, List<String> parentCols) {
        return new ErdDbMeta("S", List.of(
                tb("TB_P", null, col("X", 1, "VARCHAR2", 10, null, null, false), col("Y", 2, "VARCHAR2", 10, null, null, false)),
                tb("TB_C", null, col("ID", 1, "NUMBER", 22, 19, 0, false),
                        col("A", 2, "VARCHAR2", 10, null, null, true), col("B", 3, "VARCHAR2", 10, null, null, true))),
            List.of(
                new Constraint("PK_TB_P", "TB_P", "P", List.of("X", "Y"), null, null),
                new Constraint("PK_TB_C", "TB_C", "P", List.of("ID"), null, null),
                new Constraint("FK_TB_C_P", "TB_C", "R", childCols, "TB_P", parentCols)),
            List.of());
    }

    /** 짝 순서만 다른 복합 FK 는 같은 FK 다(짝 집합). 짝 자체가 다르면 추가·삭제로 보인다. id 는 각자 순서를 그대로 쓴다. */
    @Test
    void compositeFkMatchesByPairSetNotOrder() {
        ErdModel model = imported(composite(List.of("A", "B"), List.of("X", "Y")));
        assertThat(ErdDbDiff.diff(model, composite(List.of("B", "A"), List.of("Y", "X")))).isEmpty();
        assertThat(ErdDbDiff.diff(model, composite(List.of("A", "B"), List.of("Y", "X"))))
                .extracting(ErdDbDiffItem::id)
                .containsExactly("FK_ADDED:TB_C(A,B)>TB_P(Y,X)", "FK_REMOVED:TB_C(A,B)>TB_P(X,Y)");
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
