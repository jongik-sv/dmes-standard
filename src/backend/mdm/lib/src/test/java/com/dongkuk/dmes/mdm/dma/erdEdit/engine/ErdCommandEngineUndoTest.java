package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.dongkuk.dmes.mdm.dma.naming.NameComposition;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** 되돌리기(속성 단위 restore + 참조 무결성)와 잘못된 입력 거절 시험. */
class ErdCommandEngineUndoTest {

    final ErdCommandEngine engine = new ErdCommandEngine(ErdNaming.NONE);

    ErdModel base() {
        var r = (ApplyOutcome.Applied) engine.apply(ErdModel.empty("mcm", "MCMAPUSER"), 0, 1, "s-a", List.of(
                new AddTable("t-1", "TB_MCM_SEC_ROLE", "역할", "", false),
                new AddColumn("c-1", "t-1", "ROLE_ID", "역할아이디", null, "VARCHAR2", 30, null, true, null, "", null),
                new AddColumn("c-2", "t-1", "ROLE_NM", "역할명", null, "VARCHAR2", 100, null, false, null, "", null),
                new SetPrimaryKey("t-1", List.of("c-1"), null)));
        return r.next();
    }

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

    AddColumn col(String id, String phys) {
        return new AddColumn(id, "t-1", phys, phys, null, "VARCHAR2", 10, null, false, null, "", null);
    }

    /** _rev·_tombstones 를 뺀 모델 JSON. */
    JsonNode plain(ErdModel m) {
        JsonNode n = ErdModelCodec.MAPPER.valueToTree(m);
        strip(n);
        return n;
    }

    void strip(JsonNode n) {
        if (n instanceof ObjectNode o) {
            o.remove("_rev");
            o.remove("_tombstones");
            o.elements().forEachRemaining(this::strip);
        }
    }

    // ---- F1: 오래된 명령 되돌리기 ----

    @Test
    void undoAddColumnAfterDeleteTableConflictsAndLeavesModelUntouched() {
        var add = ok(base(), 1, 2, "s-a", col("c-3", "EXTRA"));
        var del = ok(add.next(), 2, 3, "s-a", new DeleteTable("t-1"));
        var rej = rej(engine.apply(del.next(), 3, 4, "s-a", add.inverse()));
        assertThat(rej.code()).isEqualTo("CONFLICT");
        assertThat(del.next().tables).isEmpty();
    }

    @Test
    void undoOlderAddColumnConflictsOnColumnOrder() {
        var add3 = ok(base(), 1, 2, "s-a", col("c-3", "EXTRA3"));
        var add4 = ok(add3.next(), 2, 3, "s-a", col("c-4", "EXTRA4"));
        var rej = rej(engine.apply(add4.next(), 3, 4, "s-a", add3.inverse()));
        assertThat(rej.code()).isEqualTo("CONFLICT");
        assertThat(rej.property()).isEqualTo("columnOrder");
        assertThat(add4.next().tables.get("t-1").columnOrder).containsExactly("c-1", "c-2", "c-3", "c-4");
    }

    @Test
    void undoRevertsOnlyTheUndoneProperty() {
        var one = ok(base(), 1, 2, "s-a", new UpdateColumn("c-2", Map.of("logical", "역할이름")));
        var two = ok(one.next(), 2, 3, "s-a", new UpdateColumn("c-2", Map.of("length", 200)));
        var back = ok(two.next(), 3, 4, "s-a", one.inverse().toArray(new ErdCommand[0])).next();
        assertThat(back.columns.get("c-2").logical).isEqualTo("역할명");
        assertThat(back.columns.get("c-2").length).isEqualTo(200);
    }

    @Test
    void undoAddColumnConflictsWhenOtherSessionAddedKeyOnIt() {
        var add = ok(base(), 1, 2, "s-a", col("c-3", "EXTRA"));
        var uk = ok(add.next(), 2, 3, "s-b", new AddKey("k-9", "t-1", "UK", "UK_EXTRA", List.of("c-3")));
        var rej = rej(engine.apply(uk.next(), 3, 4, "s-a", add.inverse()));
        assertThat(rej.code()).isEqualTo("CONFLICT");
        assertThat(uk.next().keys).containsKey("k-9");
        assertThat(uk.next().columns).containsKey("c-3");
    }

    @Test
    void undoAppliesWhenOtherSessionChangedDifferentPropertyLater() {
        var one = ok(base(), 1, 2, "s-a", new UpdateColumn("c-2", Map.of("logical", "역할이름")));
        var two = ok(one.next(), 2, 3, "s-b", new UpdateColumn("c-2", Map.of("length", 200)));
        var back = ok(two.next(), 3, 4, "s-a", one.inverse().toArray(new ErdCommand[0])).next();
        assertThat(back.columns.get("c-2").logical).isEqualTo("역할명");
        assertThat(back.columns.get("c-2").length).isEqualTo(200);
    }

    @Test
    void undoConflictsEvenWhenSameSessionChangedSamePropertyLater() {
        var one = ok(base(), 1, 2, "s-a", new UpdateColumn("c-2", Map.of("logical", "첫 값")));
        var two = ok(one.next(), 2, 3, "s-a", new UpdateColumn("c-2", Map.of("logical", "나중 값")));
        assertThat(rej(engine.apply(two.next(), 3, 4, "s-a", one.inverse())).code()).isEqualTo("CONFLICT");
    }

    // ---- 역명령 왕복 ----

    @Test
    void setPrimaryKeyRoundTrip() {
        ErdModel m = base();
        var change = ok(m, 1, 2, "s-a", new SetPrimaryKey("t-1", List.of("c-2"), null));
        assertThat(change.next().columns.get("c-2").notNull).isTrue();
        var back = ok(change.next(), 2, 3, "s-a", change.inverse().toArray(new ErdCommand[0])).next();
        assertThat(plain(back)).isEqualTo(plain(m));
    }

    @Test
    void setPrimaryKeyCreatingKeyRoundTrip() {
        ErdModel noPk = ok(ErdModel.empty("mcm", "S"), 0, 1, "s-a",
                new AddTable("t-1", "TB_X", "엑스", "", false), col("c-1", "X_ID")).next();
        var change = ok(noPk, 1, 2, "s-a", new SetPrimaryKey("t-1", List.of("c-1"), null));
        var back = ok(change.next(), 2, 3, "s-a", change.inverse().toArray(new ErdCommand[0])).next();
        assertThat(plain(back)).isEqualTo(plain(noPk));
    }

    @Test
    void addTableRoundTrip() {
        ErdModel m = base();
        var add = ok(m, 1, 2, "s-a", new AddTable("t-2", "TB_OTHER", "다른", "", false), col("c-9", "X"));
        // c-9 는 t-1 에 붙는다 — 표와 컬럼이 모두 되돌려져야 한다.
        var back = ok(add.next(), 2, 3, "s-a", add.inverse().toArray(new ErdCommand[0])).next();
        assertThat(plain(back)).isEqualTo(plain(m));
    }

    @Test
    void deleteTableRoundTrip() {
        ErdModel m = base();
        var del = ok(m, 1, 2, "s-a", new DeleteTable("t-1"));
        assertThat(del.next().columns).isEmpty();
        var back = ok(del.next(), 2, 3, "s-a", del.inverse().toArray(new ErdCommand[0])).next();
        assertThat(plain(back)).isEqualTo(plain(m));
    }

    @Test
    void createdElementsAppearInDeltaAndInverse() {
        var add = ok(base(), 1, 2, "s-a", new AddTable("t-2", "TB_OTHER", "다른", "", false));
        assertThat(add.changes()).extracting(ErdChange::kind, ErdChange::id, ErdChange::op)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("table", "t-2", "upsert"));
        assertThat(((Restore) add.inverse().get(0)).elements()).extracting(ErdChange::id, ErdChange::op)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("t-2", "delete"));
    }

    // ---- F2: 잘못된 입력 ----

    @Test
    void malformedSetValuesAreInvalidWithCommandIndex() {
        ErdModel m = base();
        List<ErdCommand> bad = List.of(
                new UpdateColumn("c-2", Map.of("length", "abc")),
                new UpdateColumn("c-2", Map.of("length", 3.7)),
                new UpdateColumn("c-2", Map.of("scale", 99999999999L)),
                new UpdateColumn("c-2", Map.of("notNull", "Y")),
                new UpdateColumn("c-2", Map.of("logical", 5)),
                new UpdateColumn("c-2", Map.of("domainId", "x")),
                new UpdateTable("t-1", Map.of("logical", 5)),
                new UpdateTable("t-1", Map.of("phys", 5)),
                new AddKey("k-9", "t-1", null, "UK_A", List.of("c-2")),
                new AddKey("k-9", "t-1", "UK", "UK_A", null),
                new SetPrimaryKey("t-1", null, null),
                new UpdateKey("k-1", Map.of("columns", "c-1")));
        // 키 id 가 없어 마지막 항목은 NOT_FOUND 가 아니라 INVALID(없는 id)다.
        for (ErdCommand cmd : bad) {
            var out = engine.apply(m, 1, 2, "s-a", List.of(new UpdateColumn("c-2", Map.of("comment", "ok")), cmd));
            var r = rej(out);
            assertThat(r.code()).as(cmd.toString()).isEqualTo("INVALID");
            assertThat(r.commandIndex()).as(cmd.toString()).isEqualTo(1);
        }
    }

    @Test
    void integralDoubleIsAcceptedAsInteger() {
        var out = ok(base(), 1, 2, "s-a", new UpdateColumn("c-2", Map.of("length", 50.0)));
        assertThat(out.next().columns.get("c-2").length).isEqualTo(50);
    }

    @Test
    void restoreWithMissingFieldsOrUnknownKindIsInvalid() {
        ErdModel m = base();
        assertThat(rej(engine.apply(m, 1, 2, "s-a", List.of(new Restore(1, null)))).code()).isEqualTo("INVALID");
        assertThat(rej(engine.apply(m, 1, 2, "s-a", List.of(
                new Restore(1, List.of(new ErdChange(null, "c-1", "delete", null)))))).code()).isEqualTo("INVALID");
        assertThat(rej(engine.apply(m, 1, 2, "s-a", List.of(
                new Restore(1, List.of(new ErdChange("bogus", "c-1", "delete", null)))))).code()).isEqualTo("INVALID");
        assertThat(rej(engine.apply(m, 1, 2, "s-a", List.of(
                new Restore(1, List.of(new ErdChange("column", "c-1", "upsert", null)))))).code()).isEqualTo("INVALID");
    }

    @Test
    void unexpectedRuntimeExceptionBecomesInvalidWithMessage() {
        ErdNaming boom = new ErdNaming() {
            public Optional<NameComposition> forward(String logical) { return Optional.empty(); }
            public Optional<ErdDomainSpec> domain(Long domainId) { throw new IllegalStateException("boom"); }
            public Optional<ErdDomainSpec> recommendDomain(String physName) { return Optional.empty(); }
            public List<ErdWarning> warnings(ErdModel model, List<String> columnIds) { return List.of(); }
        };
        var out = new ErdCommandEngine(boom).apply(base(), 1, 2, "s-a", List.of(new ApplyDomain("c-2", 1L)));
        var r = rej(out);
        assertThat(r.code()).isEqualTo("INVALID");
        assertThat(r.commandIndex()).isEqualTo(0);
        assertThat(r.message()).contains("boom");
    }

    // ---- 키 검증 ----

    @Test
    void secondPrimaryKeyIsInvalid() {
        var r = rej(engine.apply(base(), 1, 2, "s-a", List.of(new AddKey("k-9", "t-1", "PK", "PK_SECOND", List.of("c-2")))));
        assertThat(r.code()).isEqualTo("INVALID");
        assertThat(r.hint()).contains("setPrimaryKey");
    }

    @Test
    void keyColumnFromOtherTableIsInvalid() {
        ErdModel m = ok(base(), 1, 2, "s-a", new AddTable("t-2", "TB_OTHER", "다른", "", false),
                new AddColumn("c-5", "t-2", "OTHER_ID", "다른아이디", null, "VARCHAR2", 10, null, false, null, "", null)).next();
        var r = rej(engine.apply(m, 2, 3, "s-a", List.of(new AddKey("k-9", "t-1", "UK", "UK_X", List.of("c-5")))));
        assertThat(r.code()).isEqualTo("INVALID");
    }

    @Test
    void keyColumnsMustBeNonEmptyUniqueAndNameUnique() {
        ErdModel m = ok(base(), 1, 2, "s-a", new AddKey("k-8", "t-1", "UK", "UK_A", List.of("c-2"))).next();
        for (ErdCommand cmd : List.<ErdCommand>of(
                new AddKey("k-9", "t-1", "UK", "UK_B", List.of()),
                new AddKey("k-9", "t-1", "UK", "UK_B", List.of("c-2", "c-2")),
                new UpdateKey("k-8", Map.of("columns", List.of())),
                new UpdateKey("k-8", Map.of("columns", List.of("c-1", "c-1"))),
                new UpdateKey("k-8", Map.of("name", "PK_TB_MCM_SEC_ROLE")))) {
            assertThat(rej(engine.apply(m, 2, 3, "s-a", List.of(cmd))).code()).as(cmd.toString()).isEqualTo("INVALID");
        }
    }

    @Test
    void updateKeyColumnsKeepsReferencesValid() {
        ErdModel m = ok(base(), 1, 2, "s-a", new AddKey("k-8", "t-1", "UK", "UK_A", List.of("c-2"))).next();
        var out = ok(m, 2, 3, "s-a", new UpdateKey("k-8", Map.of("columns", List.of("c-1", "c-2"))));
        assertThat(out.next().keys.get("k-8").columns).containsExactly("c-1", "c-2");
        assertThat(new HashMap<>(out.next().keys)).hasSize(2);
    }
}
