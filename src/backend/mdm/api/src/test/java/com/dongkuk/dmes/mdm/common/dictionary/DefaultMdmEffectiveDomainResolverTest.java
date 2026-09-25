package com.dongkuk.dmes.mdm.common.dictionary;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmCodeRef;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainDraft;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainKind;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmEffectiveDomain;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmEffectiveDomainResolver;
import com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainMngSearchRequest;
import com.dongkuk.dmes.mdm.dma.domainMng.service.DomainMngService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** design.md §4.2 — 계약 구현 resolve = 목록 조립값(세 자리가 같은 답, 불변 I3), resolveDraft 는 저장 없이 초안을 얹는다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class DefaultMdmEffectiveDomainResolverTest extends AbstractMdmSharedDbTest {

    @Autowired
    MdmEffectiveDomainResolver resolver;
    @Autowired
    DomainMngService service;
    @Autowired
    JdbcTemplate jdbc;

    private void tree() {
        if (jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DOMAIN", Integer.class) > 0) {
            return;
        }
        // 3·4 번 도메인의 PROC_CD 참조는 FK_TB_MDM_DOMAIN_CODE 라 부모 코드 행이 먼저 있어야 한다(TSK-06-01 D11).
        jdbc.update("INSERT OR IGNORE INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, STATUS, SOURCE_KIND) VALUES ('PROC_CD', '공정', 'INUSE', 'MDM')");
        String ins = "INSERT INTO TB_MDM_DOMAIN (DOMAIN_ID, DOMAIN_NAME, STD_NAME, PARENT_DOMAIN_ID, DOMAIN_KIND, DATA_TYPE, "
                + "MARU_CODE_ID, CATE_ID, STD_RULE, STD_AST, BIZ_RULE, BIZ_AST, CHG_SEQ, VER) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,0)";
        jdbc.update(ins, 1, "두께", "THK", null, "TEXT", "STRING", null, null, "STR_LENGTH(value) > 0",
                "{\"type\":\"INFIX_OPERATOR\",\"value\":\">\",\"params\":[{\"type\":\"FUNCTION\",\"value\":\"STR_LENGTH\",\"params\":[{\"type\":\"VARIABLE_OR_CONSTANT\",\"value\":\"value\"}]},{\"type\":\"NUMBER_LITERAL\",\"value\":\"0\"}]}",
                null, null);
        jdbc.update(ins, 2, "코일 두께", "COIL_THK", 1, "TEXT", "STRING", null, null, null, null,
                "value != REF_COL", "{\"type\":\"INFIX_OPERATOR\",\"value\":\"!=\",\"params\":[{\"type\":\"VARIABLE_OR_CONSTANT\",\"value\":\"value\"},{\"type\":\"VARIABLE_OR_CONSTANT\",\"value\":\"REF_COL\"}]}");
        jdbc.update(ins, 3, "공정", "PROC", null, "CODE", "STRING", "PROC_CD", "BASE", null, null, null, null);
        jdbc.update(ins, 4, "도금 공정", "COAT_PROC", 3, "CODE", "STRING", "PROC_CD", "COATING", null, null, null, null);
    }

    @Test
    @SuppressWarnings("unchecked")
    void resolve_는_목록의_유효값과_같다() {
        tree();
        List<Map<String, Object>> rows = (List<Map<String, Object>>) service.search(new DomainMngSearchRequest()).get("domains");
        assertEquals(4, rows.size());
        for (Map<String, Object> row : rows) {
            MdmEffectiveDomain r = resolver.resolve(((Number) row.get("DOMAIN_ID")).longValue());
            assertEquals(row.get("EFF_STD_EXPR"), r.effectiveStdExpr(), row.toString());
            assertEquals(row.get("EFF_STD_AST"), r.effectiveStdAstJson(), row.toString());
            assertEquals(row.get("EFF_BIZ_EXPR"), r.effectiveBizExpr(), row.toString());
            assertEquals(row.get("BIZ_REQUIRED_VARS"), r.bizRequiredVars(), row.toString());
            assertEquals(row.get("EFF_MARU_CODE_ID"), r.effectiveCodeRef() == null ? null : r.effectiveCodeRef().maruCodeId());
            assertEquals(row.get("EFF_CATE_ID"), r.effectiveCodeRef() == null ? null : r.effectiveCodeRef().cateId());
        }
        MdmEffectiveDomain coil = resolver.resolve(2L);
        assertEquals("STR_LENGTH(value) > 0", coil.effectiveStdExpr());
        assertEquals(List.of("REF_COL"), coil.bizRequiredVars());
        assertEquals(new MdmCodeRef("PROC_CD", "COATING"), resolver.resolve(4L).effectiveCodeRef());
    }

    @Test
    void resolveDraft_는_저장하지_않고_초안을_얹는다() {
        tree();
        MdmEffectiveDomain draft = resolver.resolveDraft(
                new MdmDomainDraft(null, 1L, MdmDomainKind.TEXT, "STR_LENGTH(value) <= 8", null, null));
        assertEquals("(STR_LENGTH(value) > 0) && (STR_LENGTH(value) <= 8)", draft.effectiveStdExpr());
        assertNull(draft.effectiveBizExpr());
        MdmEffectiveDomain edited = resolver.resolveDraft(
                new MdmDomainDraft(4L, 3L, MdmDomainKind.CODE, null, null, null));
        assertEquals(new MdmCodeRef("PROC_CD", "BASE"), edited.effectiveCodeRef(), "초안이 참조를 비우면 부모 참조");
        assertEquals(4, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DOMAIN", Integer.class));
        assertEquals("COATING", jdbc.queryForObject("SELECT CATE_ID FROM TB_MDM_DOMAIN WHERE DOMAIN_ID = 4", String.class));
    }
}
