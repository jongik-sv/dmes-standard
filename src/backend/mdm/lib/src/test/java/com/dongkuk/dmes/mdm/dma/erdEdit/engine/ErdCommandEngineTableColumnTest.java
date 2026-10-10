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
