package com.dongkuk.dmes.mdm.dmb.layoutMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.perf.QueryCountProbe;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngSearchRequest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * 전문 레이아웃 헤더 선택 목록({@code layoutMng.search target=HEADER}) 서버 부하 가드 — 헤더 수 h 에 따라 SQL 문 수가 어떻게 느는지 본다.
 *
 * <p>2026-10-01 고치기 전 3+2h(헤더마다 항목·EAI 조회), 고친 뒤 5(상수 — 항목·EAI 를 IN 한 번씩 읽어 헤더별로 묶는다).
 * D-144 3단계: 헤더마다 지금 시각 RELEASED 버전을 고르는 버전 조회 IN 한 번이 더해져 6(상수).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutMngQueryCountTest extends LayoutServiceTestSupport {

    @Autowired
    PlatformTransactionManager tm;
    @Autowired
    EntityManager em;
    @Autowired
    EntityManagerFactory emf;

    QueryCountProbe probe;

    @BeforeEach
    void setUp() {
        probe = new QueryCountProbe(tm, em, emf, "layoutMng");
        probe.start();
    }

    @AfterEach
    void tearDown() {
        probe.stop();
    }

    /** 헤더 h 개 — 홀수 번째는 EAI 두 개가 가리킨다(첫 EAI 코드 순서 확인), 짝수 번째는 EAI 없음. 이름은 h 로 고정한다. */
    private void seed(int h) {
        jdbc.update("UPDATE TB_MDM_LAYOUT_VER SET EAI_CODE = NULL");
        jdbc.update("UPDATE TB_MDM_EAI SET HEADER_LAYOUT_ID = NULL");
        for (String t : new String[] {"TB_MDM_LAYOUT_CONST", "TB_MDM_LAYOUT_HEADER", "TB_MDM_LAYOUT_ITEM", "TB_MDM_LAYOUT_VER", "TB_MDM_LAYOUT",
                "TB_MDM_EAI"}) {
            jdbc.update("DELETE FROM " + t);
        }
        dictionary();
        for (int i = 0; i < h; i++) {
            int n = i;
            if (i % 2 == 0) {
                long id = saveHeader(headerReq("헤더 " + h + "-" + n, r -> {
                    r.setEaiCode("EZ" + n);
                    r.setEaiName("GLUE Z" + n);
                    r.setEncoding("EUC-KR");
                }), i % 4 == 0 ? l100Items() : l110Items());
                // 확정해야 헤더 선택 팝업에 나온다(EZ 표준 헤더도 시각 T 해석이라 확정 시각 이후에 보인다)
                release(id, "1.000", HEADER_FROM);
                // 같은 헤더를 가리키는 EAI 를 하나 더(코드가 앞선다) — 저장 경로는 하나만 두므로 SQL 로 넣는다.
                jdbc.update("INSERT INTO TB_MDM_EAI (EAI_CODE, EAI_NAME, ENCODING, HEADER_LAYOUT_ID) VALUES (?, ?, 'UTF-8', ?)", "EA" + n,
                        "GLUE A" + n, id);
            } else {
                release(saveHeader(headerReq("헤더 " + h + "-" + n, r -> {}), l110Items()), "1.000", HEADER_FROM);
            }
        }
    }

    @Test
    void search_HEADER_SQL_문_수() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (int h : new int[] {2, 6}) {
            seed(h);
            LayoutMngSearchRequest r = new LayoutMngSearchRequest();
            r.setTarget("HEADER");
            QueryCountProbe.Measured<Map<String, Object>> m = probe.measureInTx("search-header-h" + h, () -> layoutService.search(r));
            counts.put("header" + h, m.count());
            assertHeaders(h, m.result());
        }
        assertEquals(counts.get("header2"), counts.get("header6"), counts::toString);
        assertTrue(counts.get("header6") <= 6, counts::toString);
    }

    /**
     * 고치기 전(0afccb3e)과 같은 응답 — 헤더는 만든 순서, 짝수 번째는 EAI 코드가 "EZ"(저장 경로) 가 아니라 앞선 "EA" 이고 홀수 번째는 null, 항목은 SEQ 순서의 저장한 항목.
     */
    @SuppressWarnings("unchecked")
    private void assertHeaders(int h, Map<String, Object> out) {
        List<Map<String, Object>> rows = (List<Map<String, Object>>) out.get("headers");
        assertEquals(h, rows.size());
        for (int n = 0; n < h; n++) {
            Map<String, Object> row = rows.get(n);
            assertEquals("헤더 " + h + "-" + n, row.get("LAYOUT_NAME"), "헤더 순서");
            // 헤더의 EAI = 지금 적용 중인 헤더 버전 행의 EAI_CODE(Ruling P3-15) — TB_MDM_EAI.HEADER_LAYOUT_ID 로 더 가리킨 EA 는 보지 않는다
            assertEquals(n % 2 == 0 ? "EZ" + n : null, row.get("EAI_CODE"), "헤더 " + n);
            List<Map<String, Object>> want = n % 4 == 0 ? l100Items() : l110Items();
            List<Map<String, Object>> items = (List<Map<String, Object>>) row.get("items");
            assertEquals(want.size(), items.size(), "헤더 " + n + " 항목 수");
            for (int i = 0; i < want.size(); i++) {
                assertEquals(want.get(i).get("SEQ"), items.get(i).get("SEQ"), "헤더 " + n + " 항목 " + i);
                assertEquals(want.get(i).get("FILL_KIND"), items.get(i).get("FILL_KIND"), "헤더 " + n + " 항목 " + i);
                assertEquals(want.get(i).get("COLUMN_PHYS"), items.get(i).get("COLUMN_PHYS"), "헤더 " + n + " 항목 " + i);
            }
        }
    }
}
