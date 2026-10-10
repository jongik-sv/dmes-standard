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
