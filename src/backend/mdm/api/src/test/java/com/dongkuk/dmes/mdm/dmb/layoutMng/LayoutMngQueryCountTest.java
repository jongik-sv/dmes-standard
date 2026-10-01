package com.dongkuk.dmes.mdm.dmb.layoutMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.perf.QueryCountProbe;
import com.dongkuk.dmes.mdm.dmb.LayoutTestSupport;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngSearchRequest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * 전문 레이아웃 헤더 선택 목록({@code layoutMng.search target=HEADER}) 서버 부하 가드 — 헤더 수 h 에 따라 SQL 문 수가 어떻게 느는지 본다.
 *
 * <p>2026-10-01 고치기 전 3+2h(헤더마다 항목·EAI 조회), 고친 뒤 5(상수 — 항목·EAI 를 IN 한 번씩 읽어 헤더별로 묶는다).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class LayoutMngQueryCountTest extends LayoutTestSupport {

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
        jdbc.update("UPDATE TB_MDM_LAYOUT SET EAI_CODE = NULL");
        jdbc.update("UPDATE TB_MDM_EAI SET HEADER_LAYOUT_ID = NULL");
        for (String t : new String[] {"TB_MDM_LAYOUT_VER", "TB_MDM_LAYOUT_CONST", "TB_MDM_LAYOUT_HEADER", "TB_MDM_LAYOUT_ITEM", "TB_MDM_LAYOUT",
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
                // 같은 헤더를 가리키는 EAI 를 하나 더(코드가 앞선다) — 저장 경로는 하나만 두므로 SQL 로 넣는다.
                jdbc.update("INSERT INTO TB_MDM_EAI (EAI_CODE, EAI_NAME, ENCODING, HEADER_LAYOUT_ID) VALUES (?, ?, 'UTF-8', ?)", "EA" + n,
                        "GLUE A" + n, id);
            } else {
                saveHeader(headerReq("헤더 " + h + "-" + n, r -> {}), l110Items());
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
            counts.put("header" + h, probe.inTx("search-header-h" + h, () -> layoutService.search(r)));
        }
        assertEquals(counts.get("header2"), counts.get("header6"), counts::toString);
        assertTrue(counts.get("header6") <= 5, counts::toString);
    }
}
