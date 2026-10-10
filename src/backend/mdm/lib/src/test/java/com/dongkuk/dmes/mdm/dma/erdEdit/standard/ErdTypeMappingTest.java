package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ApplyOutcome;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.AddColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.AddTable;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.ApplyDomain;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommandEngine;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdDomainSpec;
import com.dongkuk.dmes.mdm.dma.erdEdit.importing.ErdDbDiff;
import com.dongkuk.dmes.mdm.dma.erdEdit.importing.ErdImportBuilder;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdTypeMapping.PhysType;
import com.dongkuk.dmes.mdm.dma.naming.TermDictionary;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/** S2-3·deferred 42: 도메인 → 물리 타입 대응과, 판정·가져오기 표현과의 왕복. */
class ErdTypeMappingTest {

    /** README 대응표의 모든 행 + 소문자 이름 + 이미 물리 타입인 도메인. id 가 짝수면 NOT NULL 로 만든다. */
    static final List<ErdDomainSpec> DOMAINS = List.of(
            new ErdDomainSpec(1L, "명", "STRING", 100, null),
            new ErdDomainSpec(2L, "긴글", "STRING", null, null),
            new ErdDomainSpec(3L, "금액", "NUMBER", 15, 2),
            new ErdDomainSpec(4L, "순번", "NUMBER", 19, null),
            new ErdDomainSpec(5L, "수", "NUMBER", null, null),
            new ErdDomainSpec(6L, "비율", "NUMBER", null, 4),
            new ErdDomainSpec(7L, "일자", "DATE", null, null),
            new ErdDomainSpec(8L, "일시", "DATE", null, 6),
            new ErdDomainSpec(9L, "여부", "BOOLEAN", null, null),
            new ErdDomainSpec(10L, "여부1", "BOOLEAN", 1, null),
            new ErdDomainSpec(11L, "코드", "string", 20, null),
            new ErdDomainSpec(12L, "물리", "VARCHAR2", 30, null));

    /** DOMAINS 와 같은 순서의 기대 물리 타입. */
    static final List<PhysType> EXPECTED = List.of(
            new PhysType("VARCHAR2", 100, null),
            new PhysType("CLOB", null, null),
            new PhysType("NUMBER", 15, 2),
            new PhysType("NUMBER", 19, 0),
            new PhysType("NUMBER", null, null),
            new PhysType("NUMBER", 38, 4),
            new PhysType("DATE", null, null),
            new PhysType("TIMESTAMP(6)", null, null),
            new PhysType("VARCHAR2", 1, null),
            new PhysType("VARCHAR2", 1, null),
            new PhysType("VARCHAR2", 20, null),
            new PhysType("VARCHAR2", 30, null));

    private static final Pattern TIMESTAMP = Pattern.compile("^TIMESTAMP\\((\\d+)\\)$");

    /**
     * 그 물리 타입으로 DDL 을 만든 컬럼을 ErdDbMetaReader 가 읽은 모양. VARCHAR2(n CHAR) → length n, NUMBER(p,s) → precision p·scale s,
     * NUMBER → 둘 다 null, TIMESTAMP(n) → scale n, DATE·CLOB → 모두 null(ErdDbMetaReaderTest 의 V1 실측과 같다).
     * 실제 Oracle 왕복은 api 의 ErdTypeMappingOracleTest 가 확인한다.
     */
    static ErdDbMeta.Column reported(String name, int position, PhysType p, boolean nullable) {
        String t = p.dataType();
        if (ErdTypeMapping.CHAR_TYPES.contains(t)) {
            return new ErdDbMeta.Column(name, position, t, p.length(), null, null, nullable, null, null);
        }
        if ("NUMBER".equals(t)) return new ErdDbMeta.Column(name, position, t, null, p.length(), p.scale(), nullable, null, null);
        Matcher ts = TIMESTAMP.matcher(t);
        Integer scale = ts.matches() ? Integer.valueOf(ts.group(1)) : null;
        return new ErdDbMeta.Column(name, position, t, null, null, scale, nullable, null, null);
    }

    static ErdColumn col(PhysType p) {
        ErdColumn c = new ErdColumn();
        c.dataType = p.dataType();
        c.length = p.length();
        c.scale = p.scale();
        return c;
    }

    static ErdDictionary dict(Set<String> columnPhys) {
        Map<Long, ErdDomainSpec> byId = DOMAINS.stream()
                .collect(Collectors.toMap(ErdDomainSpec::domainId, Function.identity()));
        return new ErdDictionary(TermDictionary.of(List.of()), columnPhys, Set.of(), byId, List.of());
    }

    @Test
    void physicalOfFollowsMappingTable() {
        for (int i = 0; i < DOMAINS.size(); i++) {
            assertThat(ErdTypeMapping.physicalOf(DOMAINS.get(i))).as(DOMAINS.get(i).toString()).isEqualTo(EXPECTED.get(i));
        }
        assertThat(ErdTypeMapping.physicalOf(null, 10, null)).isEqualTo(new PhysType(null, 10, null));
        assertThat(ErdTypeMapping.physicalOf(" Date ", null, 3)).isEqualTo(new PhysType("TIMESTAMP(3)", null, null));
    }

    /** Review Focus 7: sameType(physicalOf(d), d) 가 늘 참이고, 가져오기 typeOf 표현과 같아서 DB_DIFF 가 비어 있다. */
    @Test
    void physicalOfRoundTripsThroughJudgeAndImport() {
        for (ErdDomainSpec d : DOMAINS) {
            PhysType p = ErdTypeMapping.physicalOf(d);
            assertThat(ErdTypeMapping.sameType(col(p), d.dataType(), d.length(), d.scale())).as("판정 " + d).isTrue();
            ErdImportBuilder.ColumnType back = ErdImportBuilder.typeOf(reported("X", 1, p, true));
            assertThat(new PhysType(back.dataType(), back.length(), back.scale())).as("가져오기 " + d).isEqualTo(p);
        }

        // 엔진이 도메인으로 컬럼을 만들고(copyDomain), 같은 타입으로 만든 DB 표와 비교하면 차이가 없고 판정도 모두 OK 다.
        List<ErdCommand> cmds = new ArrayList<>();
        cmds.add(new AddTable("t-1", "TB_TYPE_MAP", "타입 대응", ""));
        for (ErdDomainSpec d : DOMAINS) {
            cmds.add(new AddColumn("c-" + d.domainId(), "t-1", "COL_" + d.domainId(), "컬럼" + d.domainId(), d.domainId(),
                    null, null, null, d.domainId() % 2 == 0, null, "", null));
        }
        ErdDictionary dict = dict(DOMAINS.stream().map(d -> "COL_" + d.domainId()).collect(Collectors.toSet()));
        var out = new ErdCommandEngine(dict).apply(ErdModel.empty("m", "S"), 0, 1, "s", cmds);
        assertThat(out).as(out.toString()).isInstanceOf(ApplyOutcome.Applied.class);
        ErdModel m = ((ApplyOutcome.Applied) out).next();
        assertThat(m.columns.get("c-1").dataType).isEqualTo("VARCHAR2");   // deferred 42: STRING 을 그대로 복사하지 않는다
        assertThat(m.columns.get("c-2").dataType).isEqualTo("CLOB");

        List<ErdDbMeta.Column> dbCols = new ArrayList<>();
        int pos = 1;
        for (String cid : m.tables.get("t-1").columnOrder) {
            ErdColumn c = m.columns.get(cid);
            dbCols.add(reported(c.phys, pos++, new PhysType(c.dataType, c.length, c.scale), !c.notNull));
        }
        ErdDbMeta meta = new ErdDbMeta("S", List.of(new ErdDbMeta.Table("TB_TYPE_MAP", "타입 대응", dbCols)), List.of(), List.of());
        assertThat(ErdDbDiff.diff(m, meta)).isEmpty();
        assertThat(ErdStandardJudge.judge(m, dict)).hasSize(DOMAINS.size())
                .allSatisfy((id, s) -> assertThat(s).as(id).isEqualTo(ErdColumnStatus.OK));
    }

    @Test
    void applyDomainWritesPhysicalTypeAndGivenTypeIsKept() {
        var engine = new ErdCommandEngine(dict(Set.of()));
        ErdModel m = ((ApplyOutcome.Applied) engine.apply(ErdModel.empty("m", "S"), 0, 1, "s", List.of(
                new AddTable("t-1", "TB_A", "에이", ""),
                new AddColumn("c-a", "t-1", "A_DT", "에이일시", null, "VARCHAR2", 8, null, false, null, "", null),
                new AddColumn("c-b", "t-1", "B_NO", "비번호", 3L, "NUMBER", 5, 0, false, null, "", null)))).next();
        assertThat(m.columns.get("c-b").length).isEqualTo(5);   // 타입을 준 addColumn 은 도메인을 복사하지 않는다(단계 0 그대로)
        ErdModel after = ((ApplyOutcome.Applied) engine.apply(m, 1, 2, "s", List.of(new ApplyDomain("c-a", 8L)))).next();
        ErdColumn a = after.columns.get("c-a");
        assertThat(a.domainId).isEqualTo(8L);
        assertThat(a.dataType).isEqualTo("TIMESTAMP(6)");
        assertThat(a.length).isNull();
        assertThat(a.scale).isNull();
    }

    @Test
    void clobMatchesStringDomainWithoutLength() {
        assertThat(ErdTypeMapping.sameType(col(new PhysType("CLOB", null, null)), "STRING", null, null)).isTrue();
        assertThat(ErdTypeMapping.sameType(col(new PhysType("CLOB", null, null)), "STRING", 4000, null)).isFalse();
        assertThat(ErdTypeMapping.sameType(col(new PhysType("NCLOB", null, null)), "STRING", null, null)).isFalse();
        assertThat(ErdTypeMapping.sameType(col(new PhysType("VARCHAR2", 255, null)), "STRING", null, null)).isTrue();
    }

    @Test
    void numberDomainWithoutPrecisionComparesScaleOnly() {
        assertThat(ErdTypeMapping.sameType(col(new PhysType("NUMBER", 38, 4)), "NUMBER", null, 4)).isTrue();
        assertThat(ErdTypeMapping.sameType(col(new PhysType("NUMBER", 12, 4)), "NUMBER", null, 4)).isTrue();
        assertThat(ErdTypeMapping.sameType(col(new PhysType("NUMBER", 12, 2)), "NUMBER", null, 4)).isFalse();
        assertThat(ErdTypeMapping.sameType(col(new PhysType("NUMBER", 12, null)), "NUMBER", null, 0)).isTrue();  // NUMBER(12) = NUMBER(12,0)
        assertThat(ErdTypeMapping.sameType(col(new PhysType("NUMBER", null, null)), "NUMBER", null, null)).isTrue();
        assertThat(ErdTypeMapping.sameType(col(new PhysType("FLOAT", 12, null)), "NUMBER", null, 0)).isFalse();
    }
}
