package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdTable;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdColumnStatus;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** 확정 검사 판정(순수) — Oracle·스프링을 쓰지 않는다. */
class ErdConfirmCheckClassifyTest {

    private static ErdModel model() {
        ErdModel m = ErdModel.empty("m", "S");
        ErdTable t = new ErdTable();
        t.phys = "TB_A";
        m.tables.put("t-1", t);
        return m;
    }

    private static void col(ErdModel m, String id, String phys) {
        ErdColumn c = new ErdColumn();
        c.table = "t-1";
        c.phys = phys;
        m.columns.put(id, c);
        m.tables.get("t-1").columnOrder.add(id);
    }

    /** Review Focus 5: 두 번째 확정에서 새 표의 감사 컬럼 위반은 경고, 같은 묶음의 일반 컬럼 위반은 오류(U29). */
    @Test
    void auditColumnsNeverBlockConfirm() {
        ErdModel m = model();
        col(m, "c-1", "NAME_X");
        col(m, "c-a", "C_AT");
        Map<String, ErdColumnStatus> st = Map.of("c-1", ErdColumnStatus.MISS, "c-a", ErdColumnStatus.DOMAIN);

        var r = ErdConfirmCheck.classify(m, st, Set.of("c-1", "c-a"), false);

        assertThat(r.errors()).extracting(MdmCheckIssue::itemKey).containsExactly("c-1");
        assertThat(r.warnings()).extracting(MdmCheckIssue::itemKey).contains("c-a");
        assertThat(r.warnings()).filteredOn(i -> "c-a".equals(i.itemKey())).extracting(MdmCheckIssue::code)
                .containsExactly("ERD_STD_DOMAIN");
    }

    /** 물리명 대소문자와 상관없이 감사 컬럼이다(ErdAuditColumns.isAudit). */
    @Test
    void auditColumnMatchIgnoresCase() {
        ErdModel m = model();
        col(m, "c-a", "u_usr_id");
        var r = ErdConfirmCheck.classify(m, Map.of("c-a", ErdColumnStatus.TYPE), Set.of("c-a"), false);
        assertThat(r.errors()).isEmpty();
        assertThat(r.warnings()).extracting(MdmCheckIssue::itemKey).containsExactly("c-a");
    }

    @Test
    void firstVersionWarnsOnly() {
        ErdModel m = model();
        col(m, "c-1", "NAME_X");
        col(m, "c-a", "C_AT");
        Map<String, ErdColumnStatus> st = Map.of("c-1", ErdColumnStatus.MISS, "c-a", ErdColumnStatus.DOMAIN);

        var r = ErdConfirmCheck.classify(m, st, Set.of("c-1", "c-a"), true);

        assertThat(r.errors()).isEmpty();
        assertThat(r.warnings()).extracting(MdmCheckIssue::itemKey).containsExactlyInAnyOrder("c-1", "c-a");
    }

    @Test
    void unchangedViolationIsWarning() {
        ErdModel m = model();
        col(m, "c-1", "NAME_X");

        var r = ErdConfirmCheck.classify(m, Map.of("c-1", ErdColumnStatus.TYPE), Set.of(), false);

        assertThat(r.errors()).isEmpty();
        assertThat(r.warnings()).extracting(MdmCheckIssue::itemKey).containsExactly("c-1");
    }

    /** NEW·ALIAS·OK 는 확정을 막는 상태가 아니라 이슈 자체가 없다. */
    @Test
    void nonBlockingStatusesRaiseNothing() {
        ErdModel m = model();
        col(m, "c-1", "NAME_X");
        col(m, "c-2", "NAME_Y");

        var r = ErdConfirmCheck.classify(m, Map.of("c-1", ErdColumnStatus.NEW, "c-2", ErdColumnStatus.ALIAS),
                Set.of("c-1", "c-2"), false);

        assertThat(r.errors()).isEmpty();
        assertThat(r.warnings()).isEmpty();
    }

    @Test
    void inferredLeftStaysWarning() {
        ErdModel m = model();
        ErdRelation rel = new ErdRelation();
        rel.state = "INFERRED";
        m.relations.put("r-1", rel);

        var r = ErdConfirmCheck.classify(m, Map.of(), Set.of(), false);

        assertThat(r.errors()).isEmpty();
        assertThat(r.warnings()).extracting(MdmCheckIssue::code).containsExactly("ERD_INFERRED_LEFT");
    }
}
