package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-08-02 design §3.1 「RuleVarTypeResolverTest」·§6.4·I16 — 변수 타입은 서버 한 곳에서 여섯 갈래 순서로 해석한다.
 * 도메인 상속은 도메인 화면·계약과 같은 조립기(DomainChainAssembler)로 푼다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class RuleVarTypeResolverTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleVarTypeResolver resolver;
    @Autowired
    MdmDomainRepository domainRepository;
    @Autowired
    MdmColumnRepository columnRepository;
    @Autowired
    JdbcTemplate jdbc;

    long thk;
    long code;
    long date;
    long lenChild;

    @BeforeEach
    void seed() {
        jdbc.update("DELETE FROM TB_MDM_RULE_ROW");
        jdbc.update("DELETE FROM TB_MDM_RULE_VAR");
        jdbc.update("DELETE FROM TB_MDM_RULE_VER");
        jdbc.update("DELETE FROM TB_MDM_RULE");
        jdbc.update("DELETE FROM TB_MDM_COLUMN_SYSTEM");
        jdbc.update("DELETE FROM TB_MDM_COLUMN");
        jdbc.update("DELETE FROM TB_MDM_DOMAIN");
        jdbc.update("INSERT OR IGNORE INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND) VALUES ('SURF_GRD_CD', '표면등급', 'MDM')");

        MdmDomain t = new MdmDomain("두께", "두께", "QTY", "NUMBER");
        t.setScale(2);
        t.setDescription("두께 도메인");
        thk = domainRepository.save(t).getDomainId();
        MdmDomain c = new MdmDomain("표면등급코드", "표면등급코드", "CODE", "STRING");
        c.setMaruCodeId("SURF_GRD_CD");
        code = domainRepository.save(c).getDomainId();
        MdmDomain d = new MdmDomain("일자8", "일자8", "DATE", "STRING");
        d.setLength(8);
        date = domainRepository.save(d).getDomainId();
        MdmDomain len = new MdmDomain("길이", "길이", "QTY", "NUMBER");
        len.setScale(1);
        long lenParent = domainRepository.save(len).getDomainId();
        MdmDomain child = new MdmDomain("코일길이", "코일길이", "QTY", "NUMBER");
        child.setParentDomainId(lenParent);
        lenChild = domainRepository.save(child).getDomainId();

        MdmColumn thkCol = new MdmColumn("코일 두께", "COIL_THK", thk);
        thkCol.setLabelMid("두께");
        thkCol.setLabelLong("코일 두께(mm)");
        thkCol.setDescription("코일 두께 설명");
        columnRepository.save(thkCol);
        MdmColumn surf = new MdmColumn("표면 등급", "SURF_GRD", code);
        surf.setLabelLong("표면 등급");
        columnRepository.save(surf);
        columnRepository.save(new MdmColumn("생산 일자", "PROD_DT", date));
        columnRepository.save(new MdmColumn("코일 길이", "COIL_LEN", lenChild));

        // 앞 룰: 최신 RELEASED(ver 2)의 결과 변수만 본다. ver 1(옛 RELEASED)·ver 3(DRAFT)은 무시한다.
        jdbc.update("INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, STATUS, SOURCE_KIND) VALUES ('PREV_RULE', '앞', 'DECISION', 'INUSE', 'MDM')");
        released("PREV_RULE", 1, "2026-01-01 00:00:00", "2026-03-01 00:00:00");
        released("PREV_RULE", 2, "2026-03-01 00:00:00", "9999-12-31 00:00:00");
        jdbc.update("INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, OWNER_ID) VALUES ('PREV_RULE', 3, 'DRAFT', 'kim')");
        resultVar("PREV_RULE", 1, 1, "QLTY_GRD", null, "STRING", null);
        resultVar("PREV_RULE", 2, 1, "QLTY_GRD", thk, null, null);
        resultVar("PREV_RULE", 2, 2, "TEXTURE", null, "NUMBER", "BASE_SPD");
        resultVar("PREV_RULE", 3, 1, "QLTY_GRD", null, "BOOLEAN", null);
        // 대상 룰 자신의 RELEASED 결과는 "다른 룰" 이 아니다.
        jdbc.update("INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, STATUS, SOURCE_KIND) VALUES ('SELF_RULE', '나', 'DECISION', 'INUSE', 'MDM')");
        released("SELF_RULE", 1, "2026-01-01 00:00:00", "9999-12-31 00:00:00");
        resultVar("SELF_RULE", 1, 1, "SELF_OUT", null, "NUMBER", null);
    }

    private void released(String id, int ver, String from, String to) {
        jdbc.update("INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, HIT_POLICY, APPLY_FROM, APPLY_TO) VALUES (?, ?, 'RELEASED', 'FIRST', ?, ?)",
                id, ver, from, to);
    }

    private void resultVar(String id, int ver, int varId, String name, Long domainId, String dataType, String resGrp) {
        jdbc.update("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DOMAIN_ID, DATA_TYPE, RES_GRP, SEQ) "
                + "VALUES (?, ?, ?, 'RESULT', 'Value', ?, ?, ?, ?, ?)", id, ver, varId, name, domainId, dataType, resGrp, varId);
    }

    static MdmRuleVar cond(int varId, String disp, String name) {
        MdmRuleVar v = new MdmRuleVar("SELF_RULE", 2, varId, "COND", varId);
        v.setDispType(disp);
        v.setVarName(name);
        return v;
    }

    private ResolvedVar one(MdmRuleVar v) {
        List<ResolvedVar> out = resolver.resolve("SELF_RULE", 2, List.of(v));
        assertEquals(1, out.size());
        return out.get(0);
    }

    @Test
    void 컬럼_사전의_NUMBER_도메인은_scale_을_싣고_라벨과_설명을_채운다() {
        assertEquals(new ResolvedVar(1, "COND", "2", 1, "COIL_THK", false, "두께", "NUMBER", 2, false, null, thk, "두께", "COLUMN",
                "코일 두께 설명"), one(cond(1, "2", "COIL_THK")));
    }

    @Test
    void 코드_도메인은_maruCodeId_를_싣고_라벨은_중간명이_없으면_긴_이름이다() {
        assertEquals(new ResolvedVar(2, "COND", "1", 2, "SURF_GRD", false, "표면 등급", "STRING", null, false, "SURF_GRD_CD", code,
                "표면등급코드", "COLUMN", null), one(cond(2, "1", "SURF_GRD")));
    }

    @Test
    void 일자_도메인은_DATE_종류_STRING_길이_8_이면_dateString_이다() {
        ResolvedVar r = one(cond(3, "1", "PROD_DT"));
        assertEquals("STRING", r.dataType());
        assertEquals(true, r.dateString());
        assertEquals("COLUMN", r.typeSource());
    }

    @Test
    void 일자_도메인의_길이가_4_6_8_이_아니면_dateString_이_아니다() {
        jdbc.update("UPDATE TB_MDM_DOMAIN SET LENGTH = 10 WHERE DOMAIN_ID = ?", date);
        assertEquals(false, one(cond(3, "1", "PROD_DT")).dateString());
        jdbc.update("UPDATE TB_MDM_DOMAIN SET LENGTH = 6 WHERE DOMAIN_ID = ?", date);
        assertEquals(true, one(cond(3, "1", "PROD_DT")).dateString());
        jdbc.update("UPDATE TB_MDM_DOMAIN SET LENGTH = 4 WHERE DOMAIN_ID = ?", date);
        assertEquals(true, one(cond(3, "1", "PROD_DT")).dateString());
    }

    @Test
    void 자식_도메인이_비운_scale_은_부모_사슬에서_가져온다() {
        ResolvedVar r = one(cond(4, "1", "COIL_LEN"));
        assertEquals("NUMBER", r.dataType());
        assertEquals(1, r.scale());
        assertEquals(lenChild, r.domainId());
    }

    @Test
    void 앞_룰의_최신_RELEASED_결과_변수에서_타입을_가져온다() {
        assertEquals(new ResolvedVar(5, "COND", "1", 5, "QLTY_GRD", false, null, "NUMBER", 2, false, null, thk, "두께", "RULE_RESULT", null),
                one(cond(5, "1", "QLTY_GRD")));
    }

    @Test
    void 앞_룰의_결과_열_그룹_이름으로도_찾는다() {
        ResolvedVar r = one(cond(6, "1", "BASE_SPD"));
        assertEquals("NUMBER", r.dataType());
        assertEquals("RULE_RESULT", r.typeSource());
    }

    @Test
    void 대상_룰_자신의_결과는_앞_룰이_아니다() {
        assertEquals("UNRESOLVED", one(cond(7, "1", "SELF_OUT")).typeSource());
    }

    @Test
    void 선언한_DATA_TYPE_은_컬럼_사전보다_먼저다() {
        MdmRuleVar v = cond(8, "1", "COIL_THK");
        v.setDataType("STRING");
        ResolvedVar r = one(v);
        assertEquals("STRING", r.dataType());
        assertEquals(null, r.scale());
        assertEquals("DECLARED", r.typeSource());
    }

    @Test
    void 선언한_DOMAIN_ID_는_그_도메인으로_푼다() {
        MdmRuleVar v = new MdmRuleVar("SELF_RULE", 2, 9, "RESULT", 1);
        v.setDispType("Value");
        v.setVarName("OUT_GRD");
        v.setDomainId(code);
        v.setLabel("판정");
        v.setDescription("결과 설명");
        assertEquals(new ResolvedVar(9, "RESULT", "Value", 1, "OUT_GRD", false, "판정", "STRING", null, false, "SURF_GRD_CD", code,
                "표면등급코드", "DECLARED", "결과 설명"), one(v));
    }

    @Test
    void 식_변수는_이름으로_찾지_않고_선언이_없으면_UNRESOLVED_다() {
        MdmRuleVar v = cond(10, "1", "COIL_THK * 2");
        v.setVarAst("{\"type\":\"OPERATOR\"}");
        ResolvedVar r = one(v);
        assertEquals(true, r.exprVar());
        assertEquals("STRING", r.dataType());
        assertEquals("UNRESOLVED", r.typeSource());
        v.setDomainId(thk);
        assertEquals("NUMBER", one(v).dataType());
        assertEquals(2, one(v).scale());
    }

    @Test
    void Expression_조건_열은_EXPRESSION_COLUMN_STRING_이다() {
        MdmRuleVar v = cond(11, "Expression", null);
        v.setDataType("NUMBER");
        ResolvedVar r = one(v);
        assertEquals("STRING", r.dataType());
        assertEquals("EXPRESSION_COLUMN", r.typeSource());
    }

    @Test
    void 해석할_수_없으면_STRING_UNRESOLVED_다() {
        assertEquals(new ResolvedVar(12, "COND", "1", 12, "UNKNOWN_X", false, null, "STRING", null, false, null, null, null, "UNRESOLVED", null),
                one(cond(12, "1", "UNKNOWN_X")));
    }

    @Test
    void 입력_순서를_지킨다() {
        List<ResolvedVar> out = resolver.resolve("SELF_RULE", 2, List.of(cond(3, "1", "PROD_DT"), cond(1, "2", "COIL_THK")));
        assertEquals(List.of(3, 1), out.stream().map(ResolvedVar::varId).toList());
    }
}
