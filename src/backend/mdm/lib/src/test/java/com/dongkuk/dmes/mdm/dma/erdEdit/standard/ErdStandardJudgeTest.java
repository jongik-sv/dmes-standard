package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.naming.DomainEntry;
import com.dongkuk.dmes.mdm.dma.naming.TermDictionary;
import com.dongkuk.dmes.mdm.dma.naming.TermEntry;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class ErdStandardJudgeTest {

    static ErdDictionary dict() {
        TermDictionary terms = TermDictionary.of(List.of(
                new TermEntry(1L, "역할", 1, "", null, "Role", "ROLE", "[]", "[]"),
                new TermEntry(2L, "아이디", 1, "", null, "Id", "ID", "[]", "[]"),
                new TermEntry(3L, "명", 1, "", null, "Name", "NM", "[]", "[]"),
                new TermEntry(4L, "일자", 1, "", null, "Date", "DT", "[]", "[]"),
                new TermEntry(5L, "주문", 1, "", null, "Order", "ORD", "[]", "[]"),
                new TermEntry(6L, "주문", 2, "", null, "Order", "ODR", "[]", "[]")));
        var idDomain = new ErdDomainSpec(10L, "아이디", "VARCHAR2", 30, null);
        var dtDomain = new ErdDomainSpec(30L, "일자", "VARCHAR2", 8, null);
        return new ErdDictionary(terms, Set.of("ROLE_ID"), Set.of("ROLE_NM"),
                Map.of(10L, idDomain, 30L, dtDomain),
                List.of(new DomainEntry(10L, "아이디", "ID"), new DomainEntry(30L, "일자", "DT")));
    }

    ErdModel model(ErdNaming naming, ErdCommand... cmds) {
        var out = new ErdCommandEngine(naming).apply(ErdModel.empty("mcm", "S"), 0, 1, "s", List.of(cmds));
        return ((ApplyOutcome.Applied) out).next();
    }

    @Test
    void statusesForEachKind() {
        ErdDictionary d = dict();
        ErdModel m = model(ErdNaming.NONE,
                new AddTable("t-1", "TB_A", "에이", ""),
                new AddColumn("c-ok", "t-1", "ROLE_ID", "역할아이디", 10L, "VARCHAR2", 30, null, true, null, "", null),
                new AddColumn("c-al", "t-1", "ROLE_NM", "역할명", null, "VARCHAR2", 100, null, false, null, "", null),
                new AddColumn("c-new", "t-1", "ROLE_DT", "역할일자", 30L, "VARCHAR2", 8, null, false, null, "", null),
                new AddColumn("c-dom", "t-1", "ID", "아이디", 10L, "VARCHAR2", 255, null, false, null, "", null),
                new AddColumn("c-miss", "t-1", "BIZ_CD", "업무코드", null, "VARCHAR2", 10, null, false, null, "", null),
                new AddTable("t-2", "TB_B", "비", ""),
                new AddColumn("c-ty", "t-2", "ROLE_DT", "역할일자", null, "NUMBER", 8, null, false, null, "", null));
        Map<String, ErdColumnStatus> s = ErdStandardJudge.judge(m, d);
        assertThat(s.get("c-ok")).isEqualTo(ErdColumnStatus.OK);
        assertThat(s.get("c-al")).isEqualTo(ErdColumnStatus.ALIAS);
        assertThat(s.get("c-dom")).isEqualTo(ErdColumnStatus.DOMAIN);
        assertThat(s.get("c-miss")).isEqualTo(ErdColumnStatus.MISS);
        assertThat(s.get("c-ty")).isEqualTo(ErdColumnStatus.TYPE);
        assertThat(s.get("c-new")).isEqualTo(ErdColumnStatus.TYPE); // 같은 물리명 ROLE_DT 가 다른 표에서 NUMBER
    }

    @Test
    void addColumnFromLogicalFillsPhysAndDomain() {
        ErdModel m = model(dict(), new AddTable("t-1", "TB_A", "에이", ""),
                new AddColumn("c-1", "t-1", null, "역할아이디", null, null, null, null, true, null, "", null));
        assertThat(m.columns.get("c-1").phys).isEqualTo("ROLE_ID");
        assertThat(m.columns.get("c-1").domainId).isEqualTo(10L);
        assertThat(m.columns.get("c-1").length).isEqualTo(30);
    }

    @Test
    void ambiguousTokenNeedsChoice() {
        var out = new ErdCommandEngine(dict()).apply(ErdModel.empty("mcm", "S"), 0, 1, "s", List.of(
                new AddTable("t-1", "TB_A", "에이", ""),
                new AddColumn("c-1", "t-1", null, "주문일자", null, null, null, null, false, null, "", null)));
        var rej = ((ApplyOutcome.Rejected) out).rejection();
        assertThat(rej.code()).isEqualTo("NEEDS_CHOICE");
        assertThat(rej.choices().toString()).contains("ORD").contains("ODR");
    }

    @Test
    void addColumnWithUnknownTokenNeedsChoice() {
        var out = new ErdCommandEngine(dict()).apply(ErdModel.empty("mcm", "S"), 0, 1, "s", List.of(
                new AddTable("t-1", "TB_A", "에이", ""),
                new AddColumn("c-1", "t-1", null, "역할 (예비)", null, null, null, null, false, null, "", null)));
        var rej = ((ApplyOutcome.Rejected) out).rejection();
        assertThat(rej.code()).isEqualTo("NEEDS_CHOICE");
        assertThat(rej.choices().toString()).contains("UNKNOWN");
    }

    @Test
    void engineWarnsOnlyForTouchedColumns() {
        var engine = new ErdCommandEngine(dict());
        ErdModel m = model(ErdNaming.NONE, new AddTable("t-1", "TB_A", "에이", ""),
                new AddColumn("c-miss", "t-1", "BIZ_CD", "업무코드", null, "VARCHAR2", 10, null, false, null, "", null),
                new AddColumn("c-ok", "t-1", "ROLE_ID", "역할아이디", 10L, "VARCHAR2", 30, null, true, null, "", null));
        var out = (ApplyOutcome.Applied) engine.apply(m, 1, 2, "s",
                List.of(new UpdateColumn("c-ok", Map.of("comment", "설명"))));
        assertThat(out.warnings()).isEmpty();
    }
}
