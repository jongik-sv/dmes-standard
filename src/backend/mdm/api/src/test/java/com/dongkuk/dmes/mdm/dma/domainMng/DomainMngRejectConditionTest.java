package com.dongkuk.dmes.mdm.dma.domainMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainDraftRequest;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * design.md §4.2 — 저장 거부 조건 R01~R10(02:177) 각 1개 + 보충 S01~S06 + 경고 W01. 실제 SQLite(Flyway 적용),
 * 서비스 빈 직접 호출. 이 컨텍스트에는 메모리 {@code CodeLookup}(R10)과 비즈니스 함수 {@code THK_OK} 가 있다.
 * 코드 원장이 없는 컨텍스트(W02·수용 기준 2 양성 대조)는 {@link DomainMngWithoutCodeLedgerTest}.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import({DomainMngTestConfig.Functions.class, DomainMngTestConfig.Codes.class})
class DomainMngRejectConditionTest extends DomainMngApiSupport {

    @BeforeEach
    void setUp() {
        fixtures();
        // R09·R10 은 PROC_CD 를 참조하는 CODE 도메인을 저장한다(FK_TB_MDM_DOMAIN_CODE 전제, TSK-06-01 D11). NO_SUCH_CODE 는 넣지 않는다(R10).
        seedCodeHeader("PROC_CD");
    }

    @Test
    void R01_파싱_실패는_저장을_거부한다() {
        assertRejected("R01", req(r -> r.setStdRule("value >=")));
    }

    @Test
    void R02_칸_화이트리스트_밖_함수는_저장을_거부한다() {
        assertRejected("R02", req(r -> r.setStdRule("THK_OK(value)")));
        // 대조: 비즈니스 칸에서는 허용된다
        assertFalse(issueCodes(service.validate(req(r -> r.setBizRule("THK_OK(value)")), List.of(), List.of())).contains("R02"));
    }

    @Test
    void R02_표준칸_MASTER_AT_는_거부한다() {
        assertRejected("R02", req(r -> r.setStdRule("MASTER_AT(\"PROC_CD\", \"BASE\", value, \"20260101\")")));
    }

    @Test
    void R03_결과가_불린이_아니면_거부한다() {
        assertRejected("R03", req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setUnitCode("mm");
            r.setStdRule("value + 1");
        }), cases(tc("1", true)));
    }

    @Test
    void R04_표준식에_value_외_변수가_있으면_거부한다() {
        assertRejected("R04", req(r -> r.setStdRule("value > OTHER_COL")));
    }

    @Test
    void R05_비즈니스식_변수가_컬럼_사전에_없으면_거부한다() {
        assertRejected("R05", req(r -> r.setBizRule("value >= NO_SUCH_COL")));
        Long owner = saveOk(req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setUnitCode("ton");
        }));
        jdbc.update("INSERT OR IGNORE INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID, REQUIRED, CHG_SEQ) "
                + "VALUES ('코일 순중량', 'COIL_NET_WGT', ?, 0, 0)", owner);
        assertFalse(issueCodes(service.validate(req(r -> r.setBizRule("value >= COIL_NET_WGT")), List.of(), List.of()))
                .contains("R05"));
    }

    @Test
    void R06_길이가_부모보다_크면_거부한다() {
        Long parent = saveOk(req(r -> r.setLength(20)));
        assertRejected("R06", req(r -> {
            r.setParentDomainId(parent);
            r.setLength(30);
        }));
    }

    @Test
    void R07_상속_순환은_거부한다() {
        String stdA = uniq("A");
        Long a = saveOk(req(r -> {
            r.setStdName(stdA);
            r.setStdRule("STR_LENGTH(value) <= 20");
        }), cases(tc("abc", true)));
        Long b = saveOk(req(r -> r.setParentDomainId(a)));
        DomainDraftRequest cycle = req(r -> {
            r.setDomainId(a);
            r.setVer(ver(a));
            r.setStdName(stdA);
            r.setDomainName("도메인 " + stdA);
            r.setStdRule("STR_LENGTH(value) <= 20");
            r.setParentDomainId(b);
        });
        assertRejected("R07", cycle, cases(tc("abc", true)));
        List<String> codes = issueCodes(service.validate(cycle, cases(tc("abc", true)), List.of()));
        assertTrue(codes.contains("R07") && codes.contains("S01"), "검사기는 전부 모은다(I7): " + codes);
    }

    @Test
    void R08_자기_테스트_케이스가_틀리면_거부한다() {
        assertRejected("R08", req(r -> r.setStdRule("STR_LENGTH(value) <= 3")), cases(tc("abcdef", true)));
    }

    @Test
    void R09_CODE_종류는_체인에_코드_참조가_있어야_한다() {
        assertRejected("R09", req(r -> r.setDomainKind("CODE")));
        Long parent = saveOk(req(r -> {
            r.setDomainKind("CODE");
            r.setMaruCodeId("PROC_CD");
            r.setCateId("BASE");
        }));
        Long child = saveOk(req(r -> {
            r.setDomainKind("CODE");
            r.setParentDomainId(parent);
        }), cases(tc("C1", true), tc("ZZ", false)));
        assertEquals(parent, ((Number) row(child).get("PARENT_DOMAIN_ID")).longValue());
    }

    @Test
    void R10_RELEASED_에_없는_카테고리는_거부한다() {
        assertRejected("R10", req(r -> {
            r.setDomainKind("CODE");
            r.setMaruCodeId("PROC_CD");
            r.setCateId("DRAFT_ONLY");
        }));
        assertRejected("R10", req(r -> {
            r.setDomainKind("CODE");
            r.setMaruCodeId("NO_SUCH_CODE");
            r.setCateId("BASE");
        }));
        saveOk(req(r -> {
            r.setDomainKind("CODE");
            r.setMaruCodeId("PROC_CD");
            r.setCateId("COATING");
        }), cases(tc("C1", true), tc("C2", false)));
    }

    @ParameterizedTest
    @ValueSource(strings = {"DOMAIN_KIND", "DATA_TYPE", "UNIT_CODE", "PARENT_DOMAIN_ID"})
    void S01_구조_변경은_거부한다(String column) {
        Long other = saveOk(req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setUnitCode("mm");
        }));
        String std = uniq("S");
        Long id = saveOk(req(r -> {
            r.setStdName(std);
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setUnitCode("mm");
        }));
        DomainDraftRequest change = req(r -> {
            r.setDomainId(id);
            r.setVer(ver(id));
            r.setStdName(std);
            r.setDomainName("도메인 " + std);
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setUnitCode("mm");
            switch (column) {
                case "DOMAIN_KIND" -> r.setDomainKind("TEXT");
                case "DATA_TYPE" -> r.setDataType("STRING");
                case "UNIT_CODE" -> r.setUnitCode("ton");
                default -> {
                    r.setParentDomainId(other);
                    r.setUnitCode(null);
                }
            }
        });
        assertRejected("S01", change);
    }

    @Test
    void S02_자식의_종류_타입_단위는_부모와_같아야_한다() {
        Long parent = saveOk(req(r -> {
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setUnitCode("mm");
        }));
        assertRejected("S02", req(r -> {
            r.setParentDomainId(parent);
            r.setDomainKind("QTY");
            r.setDataType("NUMBER");
            r.setUnitCode("ton");
        }));
    }

    @Test
    void S03_코드_참조_규칙() {
        assertRejected("S03", req(r -> {
            r.setMaruCodeId("PROC_CD");
            r.setCateId("BASE");
        }));
        assertRejected("S03", req(r -> {
            r.setDomainKind("CODE");
            r.setMaruCodeId("PROC_CD");
            r.setCateId("BASE");
            r.setStdRule("value == \"C1\"");
        }));
    }

    @Test
    void S04_FLAG_최상위는_표준식이_있어야_한다() {
        assertRejected("S04", req(r -> r.setDomainKind("FLAG")));
    }

    @Test
    void S05_예약_변수_정규식_정책() {
        assertRejected("S05", req(r -> r.setBizRule("value > _HIDDEN")));
        assertRejected("S05", req(r -> r.setStdRule("STR_MATCHES(value, \"(a+)+\")")));
    }

    @Test
    void S06_필수_형식() {
        assertRejected("S06", req(r -> r.setStdName("bad name")));
        assertRejected("S06", req(r -> r.setUnitCode("furlong")));
        assertRejected("S06", req(r -> r.setStdRule("value == \"A\"")), cases(tc("A", "maybe")));
        BusinessException missing = assertRejected("S06", req(r -> {
            r.setDomainId(987654L);
            r.setVer(0L);
        }));
        assertTrue(missing.getMessage().startsWith("도메인 저장 거부:"), missing.getMessage());
    }

    @Test
    void 거부_예외는_MDM_오류_코드와_이슈를_싣는다() {
        BusinessException e = assertRejected("R04", req(r -> r.setStdRule("value > OTHER_COL")));
        assertEquals(MdmErrorCode.DOMAIN_SAVE_REJECTED.code(), e.getErrors().get(0).code());
        assertTrue(e.getErrors().stream().anyMatch(d -> "R04".equals(d.code())), e.getErrors().toString());
    }

    @Test
    void W01_빈_말단은_경고만_하고_저장된다() {
        Long parent = saveOk(req(r -> r.setStdRule("STR_LENGTH(value) <= 20")), cases(tc("abc", true)));
        DomainDraftRequest leaf = req(r -> r.setParentDomainId(parent));
        Map<String, Object> validated = service.validate(leaf, List.of(), List.of());
        assertEquals(Boolean.TRUE, validated.get("ok"));
        assertTrue(issueCodes(validated).contains("W01"));
        Map<String, Object> saved = service.save(leaf, List.of(), List.of());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> warnings = (List<Map<String, Object>>) saved.get("warnings");
        assertTrue(warnings.stream().anyMatch(w -> "W01".equals(w.get("CODE"))), warnings.toString());
        assertEquals("NEW", saved.get("classification"));
    }

    @Test
    void 저장은_자기_식의_AST_만_쓰고_파생값과_배포_순번은_쓰지_않는다() {
        Long parent = saveOk(req(r -> r.setStdRule("STR_LENGTH(value) <= 20")), cases(tc("abc", true)));
        Long child = saveOk(req(r -> {
            r.setParentDomainId(parent);
            r.setStdRule("STR_LENGTH(value) >= 2");
        }), cases(tc("abc", true)));
        Map<String, Object> c = row(child);
        assertEquals("STR_LENGTH(value) >= 2", c.get("STD_RULE"));
        assertTrue(((String) c.get("STD_AST")).contains("\">=\""), (String) c.get("STD_AST"));
        assertFalse(((String) c.get("STD_AST")).contains("\"<=\""), "유효 AST(부모 식)를 저장했다(I1)");
        assertNull(c.get("BIZ_AST"));
        assertEquals(0, ((Number) c.get("CHG_SEQ")).intValue());
        assertTrue(((String) c.get("TEST_CASES")).contains("\"value\":\"abc\""), (String) c.get("TEST_CASES"));
    }
}
