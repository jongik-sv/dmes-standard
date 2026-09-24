package com.dongkuk.dmes.mdm.dma.domainMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.engine.MdmCodeLookupAvailability;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * design.md §4.2·§5 수용 기준 2 — 마스터코드 원장(서버 CodeLookup)이 없는 기본 컨텍스트(D2). R10 은 거부하지 않고 W02,
 * CODE 케이스는 판정 불가. 부모에만 참조가 있는 CODE 자식이 W02 와 함께 저장된다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class DomainMngWithoutCodeLedgerTest extends DomainMngApiSupport {

    @TempDir
    static Path tempDir;

    @Autowired
    MdmCodeLookupAvailability availability;

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        Path db = tempDir.resolve("domain-no-code.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + db);
    }

    @BeforeEach
    void setUp() {
        fixtures();
    }

    @Test
    void 코드_원장이_없는_컨텍스트다() {
        assertFalse(availability.available(), "테스트 CodeLookup 이 이 컨텍스트로 샜다");
    }

    @Test
    @SuppressWarnings("unchecked")
    void W02_코드_판정_불가는_경고이고_CODE_자식은_부모_참조로_저장된다() {
        Map<String, Object> parentCheck = service.validate(req(r -> {
            r.setDomainKind("CODE");
            r.setMaruCodeId("PROC_CD");
            r.setCateId("DRAFT_ONLY");
        }), List.of(), List.of());
        assertEquals(Boolean.TRUE, parentCheck.get("ok"));
        assertTrue(issueCodes(parentCheck).contains("W02"));
        assertFalse(issueCodes(parentCheck).contains("R10"));

        Long parent = saveOk(req(r -> {
            r.setDomainKind("CODE");
            r.setMaruCodeId("PROC_CD");
            r.setCateId("BASE");
        }));
        Map<String, Object> saved = service.save(req(r -> {
            r.setDomainKind("CODE");
            r.setParentDomainId(parent);
        }), cases(tc("C1", true)), List.of());
        List<Map<String, Object>> warnings = (List<Map<String, Object>>) saved.get("warnings");
        assertTrue(warnings.stream().anyMatch(w -> "W02".equals(w.get("CODE"))), warnings.toString());

        Map<String, Object> validated = service.validate(req(r -> {
            r.setDomainKind("CODE");
            r.setParentDomainId(parent);
        }), cases(tc("C1", true)), List.of());
        List<Map<String, Object>> results = (List<Map<String, Object>>) validated.get("testResults");
        assertEquals("UNDECIDED", results.get(0).get("RESULT"));
    }
}
