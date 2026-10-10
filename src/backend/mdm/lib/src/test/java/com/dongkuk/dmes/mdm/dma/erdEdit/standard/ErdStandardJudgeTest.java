package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
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

    // ---- 도메인 논리 타입(STRING·NUMBER·DATE·BOOLEAN) ↔ 모델 물리 타입(Oracle) ----

    static ErdColumn col(String dataType, Integer length, Integer scale) {
        ErdColumn c = new ErdColumn();
        c.dataType = dataType;
        c.length = length;
        c.scale = scale;
        return c;
    }

    @Test
    void stringDomainMatchesCharTypesWithSameLength() {
        assertThat(ErdStandardJudge.sameType(col("VARCHAR2", 1, null), "STRING", 1, null)).isTrue();
        assertThat(ErdStandardJudge.sameType(col("CHAR", 1, null), "STRING", 1, null)).isTrue();
        assertThat(ErdStandardJudge.sameType(col("NVARCHAR2", 30, null), "STRING", 30, null)).isTrue();
        assertThat(ErdStandardJudge.sameType(col("VARCHAR2", 255, null), "STRING", null, null)).isTrue(); // 도메인 길이 없음
        assertThat(ErdStandardJudge.sameType(col("VARCHAR2", 2, null), "STRING", 1, null)).isFalse();     // 길이 다름
        assertThat(ErdStandardJudge.sameType(col("RAW", 16, null), "STRING", 16, null)).isFalse();
    }

    @Test
    void numberColumnIsNotStringDomain() {
        assertThat(ErdStandardJudge.sameType(col("NUMBER", 19, 0), "STRING", 20, null)).isFalse();
    }

    @Test
    void numberDomainComparesPrecisionAndScale() {
        assertThat(ErdStandardJudge.sameType(col("NUMBER", 5, 2), "NUMBER", 5, 2)).isTrue();
        assertThat(ErdStandardJudge.sameType(col("NUMBER", 5, 1), "NUMBER", 5, 2)).isFalse();
        assertThat(ErdStandardJudge.sameType(col("NUMBER", 6, 2), "NUMBER", 5, 2)).isFalse();
        assertThat(ErdStandardJudge.sameType(col("NUMBER", 19, 0), "NUMBER", 19, null)).isTrue();  // NUMBER(p) = NUMBER(p,0)
        assertThat(ErdStandardJudge.sameType(col("FLOAT", 5, null), "NUMBER", 5, null)).isFalse();
    }

    @Test
    void unconstrainedNumberDomainMatchesAnyNumber() {
        assertThat(ErdStandardJudge.sameType(col("NUMBER", 19, 0), "NUMBER", null, null)).isTrue();
        assertThat(ErdStandardJudge.sameType(col("NUMBER", null, null), "NUMBER", null, null)).isTrue();
        assertThat(ErdStandardJudge.sameType(col("VARCHAR2", 10, null), "NUMBER", null, null)).isFalse();
    }

    @Test
    void dateDomainWithoutScaleIsOracleDate() {
        assertThat(ErdStandardJudge.sameType(col("DATE", null, null), "DATE", null, null)).isTrue();
        assertThat(ErdStandardJudge.sameType(col("TIMESTAMP(6)", null, null), "DATE", null, null)).isFalse();
    }

    @Test
    void dateDomainWithScaleIsTimestamp() {
        assertThat(ErdStandardJudge.sameType(col("TIMESTAMP(6)", null, null), "DATE", null, 6)).isTrue();
        assertThat(ErdStandardJudge.sameType(col("TIMESTAMP(3)", null, null), "DATE", null, 6)).isFalse();
        assertThat(ErdStandardJudge.sameType(col("DATE", null, null), "DATE", null, 6)).isFalse();
        assertThat(ErdStandardJudge.sameType(col("TIMESTAMP(6) WITH TIME ZONE", null, null), "DATE", null, 6)).isFalse();
    }

    @Test
    void booleanDomainIsYnCharOne() {
        assertThat(ErdStandardJudge.sameType(col("VARCHAR2", 1, null), "BOOLEAN", null, null)).isTrue();
        assertThat(ErdStandardJudge.sameType(col("CHAR", 1, null), "BOOLEAN", 1, null)).isTrue();
        assertThat(ErdStandardJudge.sameType(col("VARCHAR2", 2, null), "BOOLEAN", null, null)).isFalse();
        assertThat(ErdStandardJudge.sameType(col("NUMBER", 1, 0), "BOOLEAN", null, null)).isFalse();
    }

    @Test
    void judgeUsesPhysicalMappingForDomain() {
        TermDictionary terms = TermDictionary.of(List.of());
        var yn = new ErdDomainSpec(1L, "여부", "STRING", 1, null);
        var id = new ErdDomainSpec(2L, "아이디", "STRING", 20, null);
        var dtm = new ErdDomainSpec(3L, "일시", "DATE", null, null);
        var ts = new ErdDomainSpec(4L, "타임스탬프", "DATE", null, 6);
        ErdDictionary d = new ErdDictionary(terms, Set.of("USE_YN", "ID", "C_AT", "U_AT"), Set.of(),
                Map.of(1L, yn, 2L, id, 3L, dtm, 4L, ts), List.of());
        ErdModel m = model(ErdNaming.NONE,
                new AddTable("t-1", "TB_A", "에이", ""),
                new AddColumn("c-yn", "t-1", "USE_YN", "사용여부", 1L, "VARCHAR2", 1, null, false, null, "", null),
                new AddColumn("c-id", "t-1", "ID", "아이디", 2L, "NUMBER", 19, 0, true, null, "", null),
                new AddColumn("c-ca", "t-1", "C_AT", "생성일시", 3L, "TIMESTAMP(6)", null, null, false, null, "", null),
                new AddColumn("c-ua", "t-1", "U_AT", "수정일시", 4L, "TIMESTAMP(6)", null, null, false, null, "", null));
        Map<String, ErdColumnStatus> s = ErdStandardJudge.judge(m, d);
        assertThat(s.get("c-yn")).isEqualTo(ErdColumnStatus.OK);
        assertThat(s.get("c-id")).isEqualTo(ErdColumnStatus.DOMAIN);
        assertThat(s.get("c-ca")).isEqualTo(ErdColumnStatus.DOMAIN);
        assertThat(s.get("c-ua")).isEqualTo(ErdColumnStatus.OK);
    }
}
