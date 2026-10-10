package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionary;
import com.dongkuk.dmes.mdm.dma.naming.NameComposition;
import com.dongkuk.dmes.mdm.dma.naming.TermDictionary;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** addTable 감사 컬럼 8개 자동 추가(묶음 끝) + 끝 위치 규칙(addColumn·moveColumn 은 감사 블록 앞) 시험. */
class ErdCommandEngineAuditTest {

    static final List<String> AUDIT = List.of("C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID");

    final ErdCommandEngine engine = new ErdCommandEngine(ErdNaming.NONE);

    /** 사전 채움만 가짜로 준다. C_USR_ID 는 논리명·도메인이 있고 C_AT 는 논리명이 빈 문자열이다. */
    final ErdCommandEngine dictEngine = new ErdCommandEngine(new ErdNaming() {
        public Optional<NameComposition> forward(String logical) { return Optional.empty(); }
        public Optional<ErdDomainSpec> domain(Long domainId) {
            // 도메인을 복사하면 타입이 바뀐다 — 감사 컬럼은 복사하지 않아야 한다는 것을 잡으려 일부러 다른 타입을 준다.
            return Optional.of(new ErdDomainSpec(domainId, "D", "CHAR", 5, null));
        }
        public Optional<ErdDomainSpec> recommendDomain(String physName) { return Optional.empty(); }
        public List<ErdWarning> warnings(ErdModel model, List<String> columnIds) { return List.of(); }
        public PhysFill fillByPhys(String phys) {
            return switch (phys) {
                case "C_USR_ID" -> new PhysFill("사전 생성자", 77L);
                case "C_AT" -> new PhysFill("  ", null);
                default -> new PhysFill("사전 " + phys, null);
            };
        }
    });

    ApplyOutcome.Applied ok(ErdCommandEngine e, ErdModel m, long base, long rev, ErdCommand... cmds) {
        var out = e.apply(m, base, rev, "s-a", List.of(cmds));
        assertThat(out).as("rejected: %s", out instanceof ApplyOutcome.Rejected r ? r.rejection() : null)
                .isInstanceOf(ApplyOutcome.Applied.class);
        return (ApplyOutcome.Applied) out;
    }

    ApplyOutcome.Applied ok(ErdModel m, long base, long rev, ErdCommand... cmds) {
        return ok(engine, m, base, rev, cmds);
    }

    ErdModel empty() { return ErdModel.empty("mcm", "MCMAPUSER"); }

    List<String> phys(ErdModel m, String tableId) {
        return m.tables.get(tableId).columnOrder.stream().map(id -> m.columns.get(id).phys).toList();
    }

    ErdColumn col(ErdModel m, String tableId, String phys) {
        return m.tables.get(tableId).columnOrder.stream().map(m.columns::get).filter(c -> c.phys.equals(phys)).findFirst().orElseThrow();
    }

    AddColumn add(String id, String table, String phys, Integer position) {
        return new AddColumn(id, table, phys, phys, null, "VARCHAR2", 10, null, false, null, "", position);
    }

    /** 감사 8개를 이미 가진 표 t-1 (USER_A, USER_B 가 앞). */
    ErdModel withAuditTable() {
        return ok(empty(), 0, 1,
                new AddTable("t-1", "TB_A", "에이", ""),
                add("c-1", "t-1", "USER_A", null), add("c-2", "t-1", "USER_B", null)).next();
    }

    @Test
    void auditNamesAreFixed() {
        assertThat(ErdAuditColumns.NAMES).containsExactly("C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID");
        assertThat(ErdAuditColumns.isAudit("c_at")).isTrue();
        assertThat(ErdAuditColumns.isAudit("VER")).isFalse();
        assertThat(ErdAuditColumns.isAudit(null)).isFalse();
    }

    @Test
    void addTableAppendsEightAuditColumnsWithDbTypes() {
        var r = ok(empty(), 0, 1, new AddTable("t-1", "TB_A", "에이", ""));
        ErdModel m = r.next();
        assertThat(phys(m, "t-1")).containsExactlyElementsOf(AUDIT);
        for (String p : AUDIT) {
            ErdColumn c = col(m, "t-1", p);
            if (p.endsWith("_AT")) {
                assertThat(c.dataType).isEqualTo("TIMESTAMP(6)");
                assertThat(c.length).isNull();
            } else {
                assertThat(c.dataType).isEqualTo("VARCHAR2");
                assertThat(c.length).isEqualTo(100);
            }
            assertThat(c.scale).isNull();
            assertThat(c.notNull).isFalse();
            assertThat(c.defaultValue).isNull();
            // comment 는 기존 표 DDL 의 COMMENT 와 같은 고정 글이다.
            assertThat(c.comment).isEqualTo(ErdAuditColumns.SPECS.stream().filter(x -> x.phys().equals(p)).findFirst().orElseThrow().fallbackLogical());
            assertThat(c.table).isEqualTo("t-1");
        }
        // 고정 논리명(사전 없음)
        assertThat(col(m, "t-1", "C_USR_ID").logical).isEqualTo("생성자 아이디");
        assertThat(col(m, "t-1", "U_PGM_ID").logical).isEqualTo("수정 프로그램 아이디");
        // 델타·역명령에도 들어간다
        assertThat(r.changes().stream().filter(ch -> ch.kind().equals("column")).count()).isEqualTo(8);
        assertThat(m.tables.get("t-1").rev.get("columnOrder")).isNotNull();
    }

    @Test
    void logicalAndDomainIdComeFromDictionaryButTypeDoesNotFollowDomain() {
        ErdModel m = ok(dictEngine, empty(), 0, 1, new AddTable("t-1", "TB_A", "에이", "")).next();
        ErdColumn usr = col(m, "t-1", "C_USR_ID");
        assertThat(usr.logical).isEqualTo("사전 생성자");
        assertThat(usr.domainId).isEqualTo(77L);
        assertThat(usr.dataType).isEqualTo("VARCHAR2");
        assertThat(usr.length).isEqualTo(100);
        // 사전이 빈 논리명을 주면 고정 논리명
        assertThat(col(m, "t-1", "C_AT").logical).isEqualTo("생성일시");
        assertThat(col(m, "t-1", "C_AT").dataType).isEqualTo("TIMESTAMP(6)");
        assertThat(col(m, "t-1", "U_AT").logical).isEqualTo("사전 U_AT");
        // 논리명이 사전 글이어도 comment 는 고정 글
        assertThat(usr.comment).isEqualTo("생성자 아이디");
        assertThat(col(m, "t-1", "U_AT").comment).isEqualTo("수정일시");
    }

    @Test
    void auditFalseAddsNothingAndNullMeansTrue() {
        assertThat(ok(empty(), 0, 1, new AddTable("t-1", "TB_A", "에이", "", false)).next().columns).isEmpty();
        assertThat(ok(empty(), 0, 1, new AddTable("t-1", "TB_A", "에이", "", true)).next().columns).hasSize(8);
        assertThat(ok(empty(), 0, 1, new AddTable("t-1", "TB_A", "에이", "", null)).next().columns).hasSize(8);
    }

    @Test
    void staleAuditRecordIsClearedWhenTableRecreatedWithAuditFalse() {
        ErdModel m = ok(empty(), 0, 1, new AddTable("t-1", "TB_A", "에이", ""), new DeleteTable("t-1"),
                new AddTable("t-1", "TB_A", "에이", "", false)).next();
        assertThat(m.tables).containsKey("t-1");
        assertThat(m.columns).isEmpty();
    }

    @Test
    void realDictionaryWithoutAuditEntriesUsesFixedNamesNotPlaceholder() {
        var dict = new ErdDictionary(TermDictionary.of(List.of()), java.util.Set.of(), java.util.Set.of(), java.util.Map.of(), List.of());
        ErdModel m = ok(new ErdCommandEngine(dict), empty(), 0, 1, new AddTable("t-1", "TB_A", "에이", "")).next();
        assertThat(col(m, "t-1", "C_USR_ID").logical).isEqualTo("생성자 아이디");
        assertThat(col(m, "t-1", "U_PGM_ID").logical).isEqualTo("수정 프로그램 아이디");
        assertThat(m.columns.values()).allSatisfy(c -> {
            assertThat(c.logical).doesNotContain("*");
            assertThat(c.domainId).isNull();
        });
    }

    @Test
    void realDictionaryHitSuppliesLogicalAndDomain() {
        var entry = java.util.Map.of("C_USR_ID", new ErdDictionary.ColumnEntry("사전 생성자", 5L));
        var dict = new ErdDictionary(TermDictionary.of(List.of()), java.util.Set.of(), java.util.Set.of(), java.util.Map.of(), List.of(), entry);
        ErdModel m = ok(new ErdCommandEngine(dict), empty(), 0, 1, new AddTable("t-1", "TB_A", "에이", "")).next();
        ErdColumn c = col(m, "t-1", "C_USR_ID");
        assertThat(c.logical).isEqualTo("사전 생성자");
        assertThat(c.domainId).isEqualTo(5L);
        assertThat(c.comment).isEqualTo("생성자 아이디");
        assertThat(c.dataType).isEqualTo("VARCHAR2");
        assertThat(col(m, "t-1", "C_AT").logical).isEqualTo("생성일시");
    }

    @Test
    void sameBatchUserAuditColumnIsKeptAndRestAreAdded() {
        ErdModel m = ok(empty(), 0, 1,
                new AddTable("t-1", "TB_A", "에이", ""),
                new AddColumn("c-1", "t-1", "A_ID", "에이", null, "VARCHAR2", 10, null, true, null, "", null),
                new AddColumn("c-2", "t-1", "C_AT", "내 일시", null, "DATE", null, null, false, null, "", null),
                add("c-3", "t-1", "A_NM", null)).next();
        assertThat(phys(m, "t-1")).containsExactly("A_ID", "A_NM", "C_AT",
                "C_USR_ID", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID");
        assertThat(m.columns.get("c-2").dataType).isEqualTo("DATE");
        assertThat(m.columns).hasSize(10);
    }

    @Test
    void sameBatchAddColumnWithExactAuditNameDoesNotHitDuplicate() {
        ErdModel m = ok(empty(), 0, 1,
                new AddTable("t-1", "TB_A", "에이", ""),
                new AddColumn("c-1", "t-1", "C_AT", "생성", null, "TIMESTAMP(3)", null, null, false, null, "", null)).next();
        assertThat(m.columns.get("c-1").dataType).isEqualTo("TIMESTAMP(3)");
        assertThat(m.columns).hasSize(8);
        assertThat(phys(m, "t-1")).containsExactly("C_AT", "C_USR_ID", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID");
    }

    @Test
    void addThenDeleteTableInSameBatchLeavesNothing() {
        var r = ok(empty(), 0, 1, new AddTable("t-1", "TB_A", "에이", ""), new DeleteTable("t-1"));
        assertThat(r.next().tables).isEmpty();
        assertThat(r.next().columns).isEmpty();
    }

    @Test
    void undoDeletesTableAndAllAuditColumns() {
        var r = ok(empty(), 0, 1, new AddTable("t-1", "TB_A", "에이", ""), add("c-1", "t-1", "A_ID", null));
        assertThat(r.next().columns).hasSize(9);
        var back = ok(r.next(), 1, 2, r.inverse().toArray(new ErdCommand[0]));
        assertThat(back.next().tables).isEmpty();
        assertThat(back.next().columns).isEmpty();
    }

    @Test
    void restoreDoesNotAppendAudit() {
        // addTable 이 아닌 경로(restore 로 되살린 표)는 감사 컬럼을 붙이지 않는다.
        var r = ok(empty(), 0, 1, new AddTable("t-1", "TB_A", "에이", "", false), add("c-1", "t-1", "A_ID", null));
        var del = ok(r.next(), 1, 2, new DeleteTable("t-1"));
        var again = ok(del.next(), 2, 3, del.inverse().toArray(new ErdCommand[0]));
        assertThat(phys(again.next(), "t-1")).containsExactly("A_ID");
    }

    // ---- 끝 위치 규칙: addColumn(위치 없음)·moveColumn(끝) 은 감사 블록 앞 ----

    @Test
    void addColumnWithoutPositionGoesBeforeAuditBlock() {
        ErdModel m = withAuditTable();
        ErdModel n = ok(m, 1, 2, add("c-9", "t-1", "USER_C", null)).next();
        assertThat(phys(n, "t-1")).containsExactly("USER_A", "USER_B", "USER_C",
                "C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID");
    }

    @Test
    void addColumnExplicitPositionIsHonored() {
        ErdModel m = withAuditTable();
        // 범위 안 명시 위치: 감사 블록 안(index 4), 맨 앞
        ErdModel n = ok(m, 1, 2, add("c-9", "t-1", "IN_BLOCK", 4), add("c-7", "t-1", "AT_FRONT", 0)).next();
        List<String> p = phys(n, "t-1");
        assertThat(p.get(0)).isEqualTo("AT_FRONT");
        assertThat(p.indexOf("IN_BLOCK")).isEqualTo(5);  // 앞에 AT_FRONT 가 들어가 한 칸 밀림
        assertThat(p.get(p.size() - 1)).isEqualTo("U_PGM_ID");
    }

    @Test
    void addColumnPositionAtOrPastEndIsTreatedAsEnd() {
        ErdModel m = withAuditTable();  // 크기 10
        for (int pos : new int[] {10, 99}) {
            ErdModel n = ok(m, 1, 2, add("c-9", "t-1", "USER_C", pos)).next();
            assertThat(phys(n, "t-1").subList(0, 3)).containsExactly("USER_A", "USER_B", "USER_C");
            assertThat(phys(n, "t-1").get(10)).isEqualTo("U_PGM_ID");
        }
        // 크기 - 1 은 범위 안이라 그대로(감사 블록 마지막 앞)
        ErdModel in = ok(m, 1, 2, add("c-9", "t-1", "USER_C", 9)).next();
        assertThat(phys(in, "t-1").get(9)).isEqualTo("USER_C");
        assertThat(phys(in, "t-1").get(10)).isEqualTo("U_PGM_ID");
    }

    @Test
    void addAuditNamedColumnGoesToVeryEnd() {
        ErdModel n = ok(empty(), 0, 1, new AddTable("t-1", "TB_A", "에이", "", false), add("c-1", "t-1", "A_ID", null),
                add("c-2", "t-1", "C_AT", null), add("c-3", "t-1", "A_NM", null), add("c-4", "t-1", "U_AT", null)).next();
        // C_AT 뒤에 일반 컬럼 A_NM 은 감사 블록(C_AT) 앞, U_AT 는 맨 끝
        assertThat(phys(n, "t-1")).containsExactly("A_ID", "A_NM", "C_AT", "U_AT");
    }

    @Test
    void moveColumnToEndGoesBeforeAuditBlock() {
        ErdModel m = withAuditTable();
        ErdModel n = ok(m, 1, 2, new MoveColumn("c-1", 99)).next();
        assertThat(phys(n, "t-1")).containsExactly("USER_B", "USER_A",
                "C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID");
    }

    @Test
    void moveColumnBoundaries() {
        ErdModel m = withAuditTable();  // USER_A USER_B + 감사 8 = 10
        int n = m.tables.get("t-1").columnOrder.size();
        // n-1 = 제자리 뺀 뒤 크기 -> 끝 -> 감사 블록 앞
        List<String> end = phys(ok(m, 1, 2, new MoveColumn("c-1", n - 1)).next(), "t-1");
        assertThat(end.subList(0, 2)).containsExactly("USER_B", "USER_A");
        // n-2 = 범위 안(감사 블록 마지막 앞)
        List<String> in = phys(ok(m, 1, 2, new MoveColumn("c-1", n - 2)).next(), "t-1");
        assertThat(in.get(n - 2)).isEqualTo("USER_A");
        assertThat(in.get(n - 1)).isEqualTo("U_PGM_ID");
        // 감사 컬럼을 범위 안으로 옮기면 그대로 그 자리
        String audit = m.tables.get("t-1").columnOrder.get(5);  // C_PGM_ID 앞쪽 감사
        List<String> mid = phys(ok(m, 1, 2, new MoveColumn(audit, 0)).next(), "t-1");
        assertThat(mid.get(0)).isEqualTo(m.columns.get(audit).phys);
    }

    @Test
    void moveColumnLocatedAfterNonTrailingAuditColumnGoesToPlainEnd() {
        // [A, B, C_AT] -> X 를 1 에 -> [A, X, B, C_AT] -> C_AT 를 1 로 -> [A, C_AT, X, B]: 감사 컬럼이 끝이 아니다.
        ErdModel m = ok(empty(), 0, 1, new AddTable("t-1", "TB_A", "에이", "", false),
                add("c-1", "t-1", "A", null), add("c-2", "t-1", "B", null), add("c-3", "t-1", "C_AT", null),
                add("c-4", "t-1", "X", 1), new MoveColumn("c-3", 1)).next();
        assertThat(phys(m, "t-1")).containsExactly("A", "C_AT", "X", "B");
        ErdModel n = ok(m, 1, 2, new MoveColumn("c-1", 99)).next();
        assertThat(phys(n, "t-1")).containsExactly("C_AT", "X", "B", "A");
    }

    @Test
    void moveColumnInsideRangeStaysAndAuditColumnMovesToVeryEnd() {
        ErdModel m = withAuditTable();
        String auditId = m.tables.get("t-1").columnOrder.get(2);  // C_USR_ID
        ErdModel inside = ok(m, 1, 2, new MoveColumn("c-2", 3)).next();
        assertThat(phys(inside, "t-1").get(3)).isEqualTo("USER_B");
        ErdModel end = ok(m, 1, 2, new MoveColumn(auditId, 99)).next();
        assertThat(phys(end, "t-1").get(9)).isEqualTo("C_USR_ID");
    }

    @Test
    void tableNotEndingWithAuditKeepsPlainEnd() {
        ErdModel m = ok(empty(), 0, 1, new AddTable("t-1", "TB_A", "에이", "", false),
                add("c-1", "t-1", "A_ID", null), add("c-2", "t-1", "A_NM", null)).next();
        ErdModel n = ok(m, 1, 2, add("c-3", "t-1", "A_X", null), new MoveColumn("c-1", 99)).next();
        assertThat(phys(n, "t-1")).containsExactly("A_NM", "A_X", "A_ID");
    }

    @Test
    void endInsertIndexSkipsTrailingAuditRun() {
        var phys = java.util.Map.of("a", "X", "b", "c_at", "c", "U_PGM_ID", "d", "Y");
        assertThat(ErdAuditColumns.endInsertIndex(List.of("a", "b", "c"), phys::get)).isEqualTo(1);
        assertThat(ErdAuditColumns.endInsertIndex(List.of("a", "b", "c", "d"), phys::get)).isEqualTo(4);
        assertThat(ErdAuditColumns.endInsertIndex(List.of("b", "c"), phys::get)).isEqualTo(0);
        assertThat(ErdAuditColumns.endInsertIndex(List.of(), phys::get)).isEqualTo(0);
    }
}
