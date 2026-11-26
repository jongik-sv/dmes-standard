package com.dongkuk.dmes.mdm.dma.domainMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainDeleteRequest;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * 도메인 삭제(action {@code delete}). 하위 도메인은 지운 도메인의 부모로 올라가고 유효 정의는 그대로다. 참조 컬럼은 부모로
 * 옮기고, 부모가 없으면 비운다. 실제 Oracle(Flyway 적용), 서비스 빈 직접 호출.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import({DomainMngTestConfig.Functions.class, DomainMngTestConfig.Codes.class})
class DomainMngDeleteTest extends DomainMngApiSupport {

    @BeforeEach
    void setUp() {
        fixtures();
    }

    private Map<String, Object> delete(Long id) {
        DomainDeleteRequest r = new DomainDeleteRequest();
        r.setDomainId(id);
        r.setVer(ver(id));
        return service.delete(r);
    }

    private boolean exists(Long id) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DOMAIN WHERE DOMAIN_ID = ?", Integer.class, id) == 1;
    }

    private Long column(Long domainId) {
        String phys = uniq("DEL_COL");
        jdbc.update("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID, REQUIRED, CHG_SEQ) VALUES (?, ?, ?, 0, 0)",
                "삭제 시험 " + phys, phys, domainId);
        return jdbc.queryForObject("SELECT COLUMN_ID FROM TB_MDM_COLUMN WHERE PHYS_NAME = ?", Long.class, phys);
    }

    private Long columnDomain(Long columnId) {
        Number n = jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_COLUMN WHERE COLUMN_ID = ?", Number.class, columnId);
        return n == null ? null : n.longValue();
    }

    private Long parentOf(Long id) {
        Object p = row(id).get("PARENT_DOMAIN_ID");
        return p == null ? null : ((Number) p).longValue();
    }

    private static Long id(Object o) {
        return o == null ? null : ((Number) o).longValue();
    }

    @Test
    void 하위도_참조도_없는_도메인을_지운다() {
        Long d = saveOk(req(r -> r.setLength(10)));
        Map<String, Object> out = delete(d);
        assertTrue(!exists(d));
        assertEquals(d, id(out.get("domainId")));
        assertEquals(List.of(), out.get("movedDomainIds"));
        assertEquals(0, out.get("movedColumnCount"));
    }

    @Test
    void 중간_도메인을_지우면_하위는_부모로_올라가고_유효_정의는_그대로다() {
        Long p = saveOk(req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setUnitCode("mm");
            r.setLength(20);
            r.setStdRule("value <= 30");
        }));
        Long m = saveOk(req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setParentDomainId(p);
            r.setLength(15);
            r.setStdRule("value >= 0");
        }));
        Long c = saveOk(req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setParentDomainId(m);
        }), cases(tc("10", true), tc("-1", false), tc("31", false)));
        Long col = column(m);

        Map<String, Object> out = delete(m);

        assertTrue(!exists(m));
        assertEquals(p, parentOf(c), "하위는 지운 도메인의 부모로 올라간다");
        assertEquals(15, ((Number) row(c).get("LENGTH")).intValue(), "지운 도메인의 길이를 하위가 받는다");
        assertEquals("value >= 0", row(c).get("STD_RULE"), "지운 도메인의 표준식을 하위가 받는다");
        assertEquals(p, columnDomain(col), "참조 컬럼은 부모 도메인으로 옮긴다");
        assertNull(jdbc.queryForObject("SELECT DATA_TYPE FROM TB_MDM_COLUMN WHERE COLUMN_ID = ?", String.class, col),
                "부모로 옮긴 컬럼은 기본 타입을 받지 않는다");
        assertEquals(0, out.get("baseTypedColumnCount"));
        assertEquals(List.of(c), ((List<?>) out.get("movedDomainIds")).stream().map(DomainMngDeleteTest::id).toList());
        assertEquals(1, out.get("movedColumnCount"));
        assertEquals(p, id(out.get("newParentDomainId")));
    }

    @Test
    void 최상위_도메인을_지우면_하위는_최상위가_되고_참조_컬럼은_비운다() {
        Long root = saveOk(req(r -> {
            r.setDomainKind("FLAG");
            r.setDataType("STRING");
            r.setLength(1);
            r.setStdRule("value == \"Y\" || value == \"N\"");
        }));
        Long child = saveOk(req(r -> {
            r.setDomainKind("FLAG");
            r.setDataType("STRING");
            r.setParentDomainId(root);
        }), cases(tc("Y", true), tc("X", false)));
        Long col = column(root);

        Map<String, Object> out = delete(root);

        assertTrue(!exists(root));
        assertNull(parentOf(child));
        assertEquals(1, ((Number) row(child).get("LENGTH")).intValue());
        assertEquals("value == \"Y\" || value == \"N\"", row(child).get("STD_RULE"),
                "최상위 FLAG 는 표준식이 있어야 한다(S04) — 지운 도메인 식을 받는다");
        assertNull(columnDomain(col), "부모가 없으면 참조 컬럼의 도메인을 비운다");
        Map<String, Object> colRow = jdbc.queryForMap("SELECT DATA_TYPE, LENGTH FROM TB_MDM_COLUMN WHERE COLUMN_ID = ?", col);
        assertEquals("STRING", colRow.get("DATA_TYPE"), "비운 컬럼은 지운 도메인의 유효 타입을 기본 타입으로 받는다");
        assertEquals(1, ((Number) colRow.get("LENGTH")).intValue());
        assertEquals(1, out.get("baseTypedColumnCount"));
    }

    /** 저장 검사를 거치지 않고 들어온 행(이관 데이터) — 코드 참조 없는 CODE 트리. */
    private Long rawCode(Long parent, int length) {
        String std = uniq("RAW_CD");
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, PARENT_DOMAIN_ID, DOMAIN_KIND, DATA_TYPE, LENGTH, CHG_SEQ, VER) "
                + "VALUES (?, ?, ?, 'CODE', 'STRING', ?, 0, 0)", "코드 " + std, std, parent, length);
        return jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = ?", Long.class, std);
    }

    @Test
    void 삭제_전에도_있던_오류는_막지_않고_알린다_코드_참조_없는_CODE_트리() {
        Long root = rawCode(null, 20);
        Long child = rawCode(root, 1);
        Long col = column(root);

        Map<String, Object> out = delete(root);

        assertTrue(!exists(root));
        assertNull(parentOf(child));
        assertEquals(1, ((Number) row(child).get("LENGTH")).intValue());
        assertNull(columnDomain(col));
        assertTrue(out.get("preexistingIssues").toString().contains("R09"), out.toString());
    }

    @Test
    void 버전이_다르면_거부하고_지우지_않는다() {
        Long d = saveOk(req(r -> r.setLength(10)));
        DomainDeleteRequest r = new DomainDeleteRequest();
        r.setDomainId(d);
        Long v = ver(d);
        r.setVer(v == null ? 99L : v + 99);
        BusinessException e = assertThrows(BusinessException.class, () -> service.delete(r));
        assertTrue(e.getMessage() != null);
        assertTrue(exists(d));
    }

    @Test
    void 없는_도메인은_거부한다() {
        DomainDeleteRequest r = new DomainDeleteRequest();
        r.setDomainId(-1L);
        BusinessException e = assertThrows(BusinessException.class, () -> service.delete(r));
        assertTrue(e.getMessage().contains("S06"), e.getMessage());
    }
}
