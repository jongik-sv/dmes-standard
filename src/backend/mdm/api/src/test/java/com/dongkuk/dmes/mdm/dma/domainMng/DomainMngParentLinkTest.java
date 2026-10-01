package com.dongkuk.dmes.mdm.dma.domainMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainDraftRequest;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * D-132 — 수정 중 부모 연결·교체·제거. 화면은 저장된 행 그대로의 초안에 부모만 바꿔 {@code validate}(경고 미리보기) →
 * {@code save}(확인 후 쓰기)로 보낸다. 실제 SQLite(Flyway 적용), 서비스 빈 직접 호출(트랜잭션 없음 — 저장 뒤 하위 재검사
 * 롤백은 {@link DomainMngOasisFlowTest} 가 HTTP 로 본다).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import({DomainMngTestConfig.Functions.class, DomainMngTestConfig.Codes.class})
class DomainMngParentLinkTest extends DomainMngApiSupport {

    @BeforeEach
    void setUp() {
        fixtures();
        seedCodeHeader("PROC_CD");
    }

    /** 저장된 행 그대로의 초안(화면 모달이 만드는 것) + edit. */
    private DomainDraftRequest stored(Long id, Consumer<DomainDraftRequest> edit) {
        Map<String, Object> row = row(id);
        DomainDraftRequest r = new DomainDraftRequest();
        r.setDomainId(id);
        r.setVer(ver(id));
        r.setDomainName((String) row.get("DOMAIN_NAME"));
        r.setStdName((String) row.get("STD_NAME"));
        r.setParentDomainId(row.get("PARENT_DOMAIN_ID") == null ? null : ((Number) row.get("PARENT_DOMAIN_ID")).longValue());
        r.setDomainKind((String) row.get("DOMAIN_KIND"));
        r.setDataType((String) row.get("DATA_TYPE"));
        r.setLength(row.get("LENGTH") == null ? null : ((Number) row.get("LENGTH")).intValue());
        r.setScale(row.get("SCALE") == null ? null : ((Number) row.get("SCALE")).intValue());
        r.setUnitCode((String) row.get("UNIT_CODE"));
        r.setMaruCodeId((String) row.get("MARU_CODE_ID"));
        r.setCateId((String) row.get("CATE_ID"));
        r.setStdRule((String) row.get("STD_RULE"));
        r.setBizRule((String) row.get("BIZ_RULE"));
        r.setDescription((String) row.get("DESCRIPTION"));
        edit.accept(r);
        return r;
    }

    private Long qty(Consumer<DomainDraftRequest> edit) {
        return saveOk(req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setUnitCode("mm");
            edit.accept(r);
        }));
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> m, String key) {
        return (List<Map<String, Object>>) m.get(key);
    }

    private static String message(Map<String, Object> result, String code) {
        return list(result, "issues").stream().filter(i -> code.equals(i.get("CODE"))).map(i -> (String) i.get("MESSAGE"))
                .findFirst().orElseThrow(() -> new AssertionError(code + " 없음: " + result.get("issues")));
    }

    private Long parentOf(Long id) {
        Object p = row(id).get("PARENT_DOMAIN_ID");
        return p == null ? null : ((Number) p).longValue();
    }

    @Test
    void 최상위_도메인을_부모에_연결한다_검증은_경고만_보이고_쓰지_않는다() {
        Long parent = qty(r -> {
            r.setLength(20);
            r.setStdRule("value <= 30");
        });
        Long top = qty(r -> {
            r.setLength(15);
            r.setStdRule("value >= 0");
        });
        jdbc.update("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID, REQUIRED, CHG_SEQ) VALUES (?, ?, ?, 0, 0)",
                "연결 시험 컬럼", uniq("LINK_COL"), top);
        List<Map<String, Object>> before = fingerprint();

        DomainDraftRequest link = stored(top, r -> r.setParentDomainId(parent));
        Map<String, Object> validated = service.validate(link, List.of(), List.of());
        assertEquals(Boolean.TRUE, validated.get("ok"), validated.get("issues").toString());
        assertEquals("PARENT_CHANGE", validated.get("classification"));
        assertTrue(message(validated, "W04").contains("참조 컬럼 1개, 하위 도메인 0개"), message(validated, "W04"));
        Map<String, Object> diff = list(validated, "diff").get(0);
        assertEquals("PARENT_DOMAIN_ID", diff.get("FIELD"));
        assertEquals("LINK", diff.get("DIRECTION"));
        assertEquals(before, fingerprint(), "validate 는 쓰지 않는다");

        Map<String, Object> saved = service.save(link, List.of(), List.of());
        assertEquals("PARENT_CHANGE", saved.get("classification"));
        assertTrue(list(saved, "warnings").stream().anyMatch(w -> "W04".equals(w.get("CODE"))), saved.toString());
        assertEquals(parent, parentOf(top));
        assertEquals("mm", row(top).get("UNIT_CODE"), "연결은 자기 값을 지우지 않는다");
        assertEquals("value >= 0", row(top).get("STD_RULE"));
    }

    @Test
    void 다른_부모로_교체한다() {
        Long p1 = qty(r -> r.setLength(20));
        Long p2 = qty(r -> r.setLength(30));
        Long child = saveOk(req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setParentDomainId(p1);
            r.setStdRule("value >= 1");
        }));
        Map<String, Object> saved = service.save(stored(child, r -> r.setParentDomainId(p2)), List.of(), List.of());
        assertEquals("PARENT_CHANGE", saved.get("classification"));
        assertEquals(p2, parentOf(child));
        assertNull(row(child).get("UNIT_CODE"), "유효 단위가 같으면 자기 단위 칸은 비운 채 둔다");
    }

    @Test
    void 교체로_상속_단위가_바뀌면_S02_로_거부한다() {
        Long mm = qty(r -> { });
        Long ton = qty(r -> r.setUnitCode("ton"));
        Long child = saveOk(req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setParentDomainId(mm);
            r.setStdRule("value >= 1");
        }));
        BusinessException e = assertRejected("S02", stored(child, r -> r.setParentDomainId(ton)));
        assertTrue(e.getMessage().contains("mm → ton"), e.getMessage());
        assertEquals(mm, parentOf(child));
    }

    @Test
    void 종류나_타입이_다른_부모에는_연결하지_않는다() {
        Long text = saveOk(req(r -> r.setStdRule("STR_LENGTH(value) <= 10")), cases(tc("abc", true)));
        Long top = qty(r -> r.setStdRule("value >= 0"));
        assertRejected("S02", stored(top, r -> r.setParentDomainId(text)));
        assertNull(parentOf(top));
    }

    @Test
    void 자기_하위를_부모로_고르면_R07_로_거부한다() {
        Long a = qty(r -> r.setStdRule("value >= 0"));
        Long b = saveOk(req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setParentDomainId(a);
            r.setStdRule("value <= 9");
        }));
        assertRejected("R07", stored(a, r -> r.setParentDomainId(b)));
    }

    @Test
    void 연결_제거는_상속받던_값을_구체화한다_QTY() {
        Long parent = qty(r -> {
            r.setLength(20);
            r.setScale(3);
            r.setStdRule("value <= 30");
        });
        Long child = saveOk(req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setParentDomainId(parent);
            r.setLength(15);
            r.setStdRule("value >= 0");
        }), cases(tc("25", true), tc("31", false)));
        DomainDraftRequest unlink = stored(child, r -> r.setParentDomainId(null));
        List<Map<String, Object>> keepCases = cases(tc("25", true), tc("31", false));

        Map<String, Object> validated = service.validate(unlink, keepCases, List.of());
        assertEquals(Boolean.TRUE, validated.get("ok"), validated.get("issues").toString());
        assertTrue(message(validated, "W05").contains("UNIT_CODE"), message(validated, "W05"));
        assertTrue(message(validated, "W04").contains("연결 제거"), message(validated, "W04"));
        assertEquals(List.of("UNIT_CODE", "PARENT_DOMAIN_ID", "SCALE", "STD_RULE"),
                list(validated, "diff").stream().map(m -> m.get("FIELD")).toList());
        @SuppressWarnings("unchecked")
        Map<String, Object> effective = (Map<String, Object>) validated.get("effective");
        assertEquals("(value <= 30) && (value >= 0)", effective.get("EFF_STD_EXPR"), "제거 뒤 유효 식이 같다");

        service.save(unlink, keepCases, List.of());
        Map<String, Object> after = row(child);
        assertNull(after.get("PARENT_DOMAIN_ID"));
        assertEquals("mm", after.get("UNIT_CODE"), "QTY 최상위 단위 필수를 채운다");
        assertEquals(15, ((Number) after.get("LENGTH")).intValue(), "자기 길이는 그대로");
        assertEquals(3, ((Number) after.get("SCALE")).intValue());
        assertEquals("(value <= 30) && (value >= 0)", after.get("STD_RULE"));
        assertTrue(((String) after.get("STD_AST")).contains("\"<=\""), "구체화한 식의 AST 를 저장한다");
    }

    @Test
    void 연결_제거는_FLAG_허용_값_목록을_복사해_DB_제약을_지킨다() {
        Long flag = saveOk(req(r -> {
            r.setDomainKind("FLAG");
            r.setStdRule("value == \"Y\" || value == \"N\"");
        }), cases(tc("Y", true), tc("X", false)));
        Long child = saveOk(req(r -> {
            r.setDomainKind("FLAG");
            r.setParentDomainId(flag);
        }), cases(tc("N", true)));
        service.save(stored(child, r -> r.setParentDomainId(null)), cases(tc("N", true)), List.of());
        assertNull(parentOf(child));
        assertEquals("value == \"Y\" || value == \"N\"", row(child).get("STD_RULE"), "CK_TB_MDM_DOMAIN_FLAG");
    }

    @Test
    void 연결_제거는_CODE_참조를_복사하고_표준식은_두지_않는다() {
        Long code = saveOk(req(r -> {
            r.setDomainKind("CODE");
            r.setMaruCodeId("PROC_CD");
            r.setCateId("BASE");
        }));
        Long child = saveOk(req(r -> {
            r.setDomainKind("CODE");
            r.setParentDomainId(code);
        }), cases(tc("C1", true), tc("ZZ", false)));
        service.save(stored(child, r -> r.setParentDomainId(null)), cases(tc("C1", true), tc("ZZ", false)), List.of());
        Map<String, Object> after = row(child);
        assertNull(after.get("PARENT_DOMAIN_ID"));
        assertEquals("PROC_CD", after.get("MARU_CODE_ID"));
        assertEquals("BASE", after.get("CATE_ID"));
        assertNull(after.get("STD_RULE"), "CK_TB_MDM_DOMAIN_CODE");
    }

    @Test
    void 구체화해도_제약을_못_채우면_이유를_들어_거부한다() {
        String phys = uniq("GONE_COL");
        Long owner = qty(r -> { });
        jdbc.update("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID, REQUIRED, CHG_SEQ) VALUES (?, ?, ?, 0, 0)",
                "사라질 컬럼", phys, owner);
        Long parent = qty(r -> r.setBizRule("value >= " + phys));
        Long child = saveOk(req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setParentDomainId(parent);
            r.setStdRule("value >= 0");
        }));
        jdbc.update("UPDATE TB_MDM_COLUMN SET PHYS_NAME = ? WHERE PHYS_NAME = ?", phys + "_RENAMED", phys);
        BusinessException e = assertRejected("R05", stored(child, r -> r.setParentDomainId(null)));
        assertTrue(e.getMessage().contains(phys), e.getMessage());
        assertEquals(parent, parentOf(child));
    }

    @Test
    void 하위_도메인_길이가_새_부모를_넘으면_검증이_R06_을_보인다() {
        Long narrow = qty(r -> r.setLength(10));
        Long top = qty(r -> { });
        Long sub = saveOk(req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setParentDomainId(top);
            r.setLength(18);
            r.setStdRule("value >= 0");
        }));
        Map<String, Object> validated = service.validate(stored(top, r -> r.setParentDomainId(narrow)), List.of(), List.of());
        assertEquals(Boolean.FALSE, validated.get("ok"));
        assertTrue(list(validated, "issues").stream().anyMatch(i -> "R06".equals(i.get("CODE"))
                && String.valueOf(sub).equals(i.get("ITEM_KEY"))), validated.get("issues").toString());
        assertTrue(message(validated, "W04").contains("하위 도메인 1개"), message(validated, "W04"));
    }

    @Test
    void 옛_버전으로_연결하면_MDM001_로_거부한다() {
        Long parent = qty(r -> r.setLength(20));
        Long top = qty(r -> r.setStdRule("value >= 0"));
        DomainDraftRequest link = stored(top, r -> r.setParentDomainId(parent));
        service.save(stored(top, r -> r.setDescription("먼저 저장")), List.of(), List.of());
        BusinessException e = assertThrows(BusinessException.class, () -> service.save(link, List.of(), List.of()));
        assertTrue(e.getMessage().contains("다른 사용자가 수정"), e.getMessage());
        assertNull(parentOf(top));
    }
}
