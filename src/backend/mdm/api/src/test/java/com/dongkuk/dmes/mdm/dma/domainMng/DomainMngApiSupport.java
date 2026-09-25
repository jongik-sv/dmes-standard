package com.dongkuk.dmes.mdm.dma.domainMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainDraftRequest;
import com.dongkuk.dmes.mdm.dma.domainMng.service.DomainMngService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * TSK-04-03 api 통합 테스트 공용 — 픽스처는 네이티브 SQL, 호출은 {@link DomainMngService} 빈 직접(트랜잭션 없이 부른다.
 * 쓰기 전에 거부해야 하므로 앞서 쓴 행이 있으면 그 쓰기는 커밋돼 "행 불변" 단언이 잡는다 — 불변 I7).
 */
abstract class DomainMngApiSupport extends AbstractMdmSharedDbTest {

    @Autowired
    protected DomainMngService service;
    @Autowired
    protected JdbcTemplate jdbc;

    private static int seq;

    /** 실행마다 다른 표준명 — 한 클래스의 테스트가 같은 DB 를 쓴다. */
    protected static synchronized String uniq(String prefix) {
        return prefix + "_" + (++seq);
    }

    protected void fixtures() {
        jdbc.update("INSERT OR IGNORE INTO TB_MDM_UNIT (UNIT_CODE, DIMENSION, BASE_UNIT, FACTOR, CHG_SEQ) VALUES ('mm','LENGTH','mm',1,0)");
        jdbc.update("INSERT OR IGNORE INTO TB_MDM_UNIT (UNIT_CODE, DIMENSION, BASE_UNIT, FACTOR, CHG_SEQ) VALUES ('ton','MASS','ton',1,0)");
    }

    /**
     * TSK-06-01 D11 — {@code TB_MDM_DOMAIN.MARU_CODE_ID} 는 {@code FK_TB_MDM_DOMAIN_CODE} 라 CODE 도메인을 저장하려면 부모
     * {@code TB_MDM_CODE} 행이 먼저 있어야 한다. 헤더 한 행만 넣는다 — FK 는 {@code MARU_CODE_ID} 만 보고, 이 행을 읽는
     * {@code CodeLookup} 빈은 없다(코드 원장 유무는 {@code CodeLookup} 빈으로 정해지며 이 행과 무관하다).
     */
    protected void seedCodeHeader(String maruCodeId) {
        jdbc.update("INSERT OR IGNORE INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, STATUS, SOURCE_KIND) VALUES (?, ?, 'INUSE', 'MDM')",
                maruCodeId, maruCodeId);
    }

    protected static DomainDraftRequest req(Consumer<DomainDraftRequest> edit) {
        DomainDraftRequest r = new DomainDraftRequest();
        String std = uniq("T");
        r.setDomainName("도메인 " + std);
        r.setStdName(std);
        r.setDomainKind("TEXT");
        r.setDataType("STRING");
        edit.accept(r);
        return r;
    }

    protected static Map<String, Object> tc(String value, Object expect) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("VALUE", value);
        m.put("EXPECT", expect);
        return m;
    }

    protected static List<Map<String, Object>> cases(Map<String, Object>... rows) {
        return new ArrayList<>(List.of(rows));
    }

    protected Long saveOk(DomainDraftRequest r, List<Map<String, Object>> testCases) {
        Map<String, Object> out = service.save(r, testCases, List.of());
        return ((Number) out.get("domainId")).longValue();
    }

    protected Long saveOk(DomainDraftRequest r) {
        return saveOk(r, List.of());
    }

    @SuppressWarnings("unchecked")
    protected List<String> issueCodes(Map<String, Object> validateResult) {
        return ((List<Map<String, Object>>) validateResult.get("issues")).stream().map(m -> (String) m.get("CODE")).toList();
    }

    protected int rowCount() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DOMAIN", Integer.class);
    }

    /** 행 수만으로는 update 를 못 잡는다(I16b) — 내용 지문(B6 와 같은 칼럼 집합)으로 본다. */
    protected List<Map<String, Object>> fingerprint() {
        return jdbc.queryForList("SELECT DOMAIN_ID, VER, U_AT, DESCRIPTION, STD_RULE FROM TB_MDM_DOMAIN ORDER BY DOMAIN_ID");
    }

    protected Map<String, Object> row(Long id) {
        return jdbc.queryForMap("SELECT * FROM TB_MDM_DOMAIN WHERE DOMAIN_ID = ?", id);
    }

    protected Long ver(Long id) {
        Number n = (Number) row(id).get("VER");
        return n == null ? null : n.longValue();
    }

    /**
     * ① validate 의 issues 에 code 가 있고 validate 는 행을 남기지 않으며 ② save 가 BusinessException 을 던지며(메시지에 code) ③ 행 수와 대상 행 값이
     * 호출 전과 같다.
     */
    protected BusinessException assertRejected(String code, DomainDraftRequest r, List<Map<String, Object>> testCases) {
        int before = rowCount();
        List<Map<String, Object>> beforeAll = fingerprint();
        List<Map<String, Object>> target = r.getDomainId() == null ? null
                : jdbc.queryForList("SELECT * FROM TB_MDM_DOMAIN WHERE DOMAIN_ID = ?", r.getDomainId());
        Map<String, Object> validated = service.validate(r, testCases, List.of());
        assertTrue(issueCodes(validated).contains(code), code + " 가 validate 이슈에 없다: " + validated.get("issues"));
        assertEquals(Boolean.FALSE, validated.get("ok"));
        assertEquals(before, rowCount(), "validate 가 행을 남겼다(쓰기는 save 만, I16)");
        assertEquals(beforeAll, fingerprint(), "validate 가 기존 행을 바꿨다(쓰기는 save 만, I16b)");
        BusinessException e = assertThrows(BusinessException.class, () -> service.save(r, testCases, List.of()));
        assertTrue(e.getMessage().contains(code), e.getMessage());
        assertEquals(before, rowCount(), "거부된 저장이 행을 남겼다");
        if (target != null) {
            assertEquals(target, jdbc.queryForList("SELECT * FROM TB_MDM_DOMAIN WHERE DOMAIN_ID = ?", r.getDomainId()),
                    "거부된 저장이 대상 행을 바꿨다");
        }
        return e;
    }

    protected BusinessException assertRejected(String code, DomainDraftRequest r) {
        return assertRejected(code, r, List.of());
    }
}
