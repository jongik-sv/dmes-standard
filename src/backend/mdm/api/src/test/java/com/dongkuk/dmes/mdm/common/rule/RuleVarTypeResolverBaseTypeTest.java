package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** 컬럼 기본 타입(2026-11-26) — 도메인 없는 컬럼은 기본 타입으로 풀리고(COLUMN), 도메인 있는 컬럼은 그대로다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class RuleVarTypeResolverBaseTypeTest extends AbstractMdmSharedDbTest {

    private static final BigDecimal VER = new BigDecimal("1.000");

    @Autowired
    RuleVarTypeResolver resolver;
    @Autowired
    MdmDomainRepository domainRepository;
    @Autowired
    MdmColumnRepository columnRepository;
    @Autowired
    JdbcTemplate jdbc;

    long thk;

    @BeforeEach
    void seed() {
        jdbc.update("DELETE FROM TB_MDM_RULE_ROW");
        jdbc.update("DELETE FROM TB_MDM_RULE_VAR");
        jdbc.update("DELETE FROM TB_MDM_RULE_VER");
        jdbc.update("DELETE FROM TB_MDM_RULE");
        jdbc.update("DELETE FROM TB_MDM_COLUMN_SYSTEM");
        jdbc.update("DELETE FROM TB_MDM_COLUMN");
        jdbc.update("DELETE FROM TB_MDM_DOMAIN");

        MdmDomain t = new MdmDomain("두께", "두께", "QTY", "NUMBER");
        t.setScale(2);
        thk = domainRepository.save(t).getDomainId();

        MdmColumn base = new MdmColumn("기본 수량", "BASE_QTY", null);
        base.setLabelMid("기본수량");
        base.setDataType("NUMBER");
        base.setLength(10);
        base.setScale(3);
        columnRepository.save(base);
        MdmColumn both = new MdmColumn("두께 컬럼", "BOTH_THK", thk);
        both.setLabelMid("두께");
        both.setDataType("STRING");
        columnRepository.save(both);
        columnRepository.save(new MdmColumn("타입 없음", "NO_TYPE", null));
    }

    private ResolvedVar one(String name) {
        MdmRuleVar v = new MdmRuleVar("SELF_RULE", VER, 1, "COND", 1);
        v.setDispType("1");
        v.setVarName(name);
        List<ResolvedVar> out = resolver.resolve("SELF_RULE", VER, List.of(v));
        assertEquals(1, out.size());
        return out.get(0);
    }

    @Test
    void 도메인_없는_컬럼은_기본_타입으로_풀리고_출처는_COLUMN_이다() {
        ResolvedVar r = one("BASE_QTY");
        assertEquals("NUMBER", r.dataType());
        assertEquals(3, r.scale());
        assertEquals("COLUMN", r.typeSource());
        assertNull(r.domainId());
        assertEquals("기본수량", r.label());
    }

    @Test
    void 도메인이_있는_컬럼은_기본_타입_칸과_무관하게_도메인으로_푼다() {
        ResolvedVar r = one("BOTH_THK");
        assertEquals("NUMBER", r.dataType());
        assertEquals(2, r.scale());
        assertEquals(thk, r.domainId());
        assertEquals("COLUMN", r.typeSource());
    }

    @Test
    void 도메인_없는_컬럼의_기본_타입은_같은_이름의_다른_룰_RELEASED_결과_변수보다_먼저_이긴다() {
        DmeTestSupport.rule(jdbc, "PROD_RULE", "생산 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "PROD_RULE", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "PROD_RULE", 1, 1, "RESULT", "Value", "BASE_QTY", 1, "STRING");

        ResolvedVar r = one("BASE_QTY");
        assertEquals("COLUMN", r.typeSource());
        assertEquals("NUMBER", r.dataType());
        assertEquals(3, r.scale());
    }

    @Test
    void 도메인도_기본_타입도_없는_컬럼은_여전히_UNRESOLVED_다() {
        assertEquals("UNRESOLVED", one("NO_TYPE").typeSource());
    }
}
