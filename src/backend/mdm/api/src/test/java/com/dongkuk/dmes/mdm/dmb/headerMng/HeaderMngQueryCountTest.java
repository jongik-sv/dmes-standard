package com.dongkuk.dmes.mdm.dmb.headerMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.perf.QueryCountProbe;
import com.dongkuk.dmes.mdm.dmb.LayoutTestSupport;
import com.dongkuk.dmes.mdm.dmb.headerMng.dto.HeaderMngSaveRequest;
import com.dongkuk.dmes.mdm.dmb.headerMng.dto.HeaderMngViewRequest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * 헤더 저장·상세({@code headerMng.save}·{@code view}) 서버 부하 가드 — 이 헤더를 쌓은 전문 수 k 에 따라 SQL 문 수가 어떻게 느는지 본다.
 *
 * <p>2026-10-01 고치기 전(트랜잭션 안): save 길이 변경 33+24k·변경 없음 32+14k, view 7+k — 전문마다 도메인 트리 전체·컬럼 사전을 두 번씩,
 * 적층·항목·재정의·최신 이력을 따로 읽었다. 고친 뒤: save 길이 변경 41+11k·변경 없음 40+3k(전문마다 남는 것은 쓰기 — 본문 항목 UPDATE·
 * 전문 UPDATE 2·버전 이력 INSERT 와 merge 확인 SELECT·이 헤더 재정의 1건의 DELETE·merge 확인 SELECT·INSERT), view 8(상수).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class HeaderMngQueryCountTest extends LayoutTestSupport {

    @Autowired
    PlatformTransactionManager tm;
    @Autowired
    EntityManager em;
    @Autowired
    EntityManagerFactory emf;

    QueryCountProbe probe;
    String eai;
    long l100;
    long l110;

    @BeforeEach
    void setUp() {
        probe = new QueryCountProbe(tm, em, emf, "headerMng");
        probe.start();
    }

    @AfterEach
    void tearDown() {
        probe.stop();
    }

    /** 원장을 비우고 L100(EAI)·L110 과 L110 을 쌓은 전문 k 개(L110 LINE_CODE 재정의 포함)를 만든다. 이름은 k 로 고정한다. */
    private void seed(int k) {
        jdbc.update("UPDATE TB_MDM_LAYOUT SET EAI_CODE = NULL");
        jdbc.update("UPDATE TB_MDM_EAI SET HEADER_LAYOUT_ID = NULL");
        for (String t : new String[] {"TB_MDM_LAYOUT_VER", "TB_MDM_LAYOUT_CONST", "TB_MDM_LAYOUT_HEADER", "TB_MDM_LAYOUT_ITEM", "TB_MDM_LAYOUT",
                "TB_MDM_EAI"}) {
            jdbc.update("DELETE FROM " + t);
        }
        dictionary();
        eai = "GQ" + k;
        l100 = saveHeader(headerReq("공통 헤더 " + k, r -> {
            r.setEaiCode(eai);
            r.setEaiName("GLUE " + eai);
            r.setEncoding("EUC-KR");
            r.setPadRule("숫자 왼쪽 0, 문자 오른쪽 공백");
        }), l100Items());
        l110 = saveHeader(headerReq("구간 헤더 " + k, r -> {}), l110Items());
        for (int i = 0; i < k; i++) {
            saveLayout(layoutReq("전문 " + k + "-" + i, eai, r -> {}), List.of(headerRow(l110)), List.of(constRow(l110, 1, "C" + i)),
                    m201Items());
        }
    }

    private HeaderMngSaveRequest resaveL110() {
        Map<String, Object> row = layoutRow(l110);
        return headerReq((String) row.get("LAYOUT_NAME"), r -> {
            r.setLayoutId(l110);
            r.setVer(ver(row));
        });
    }

    /** 마지막 FILLER 길이를 바꾼다 — 사용 전문 총 길이·오프셋이 바뀌어 전문마다 새 버전이 생긴다. */
    private static List<Map<String, Object>> lengthChanged() {
        List<Map<String, Object>> items = new ArrayList<>(l110Items());
        Map<String, Object> f = filler(7);
        f.put("SEQ", items.size());
        items.set(items.size() - 1, f);
        return items;
    }

    /** TIME 을 EXTRA_3 상수로 바꾼다 — 이전 스냅샷에만 있는 물리명이 변경 요약에 쓰인다. */
    private static List<Map<String, Object>> physChanged() {
        List<Map<String, Object>> items = new ArrayList<>(l110Items());
        Map<String, Object> c = item("CONST", "EXTRA_3", "ABC");
        c.put("SEQ", 5);
        items.set(4, c);
        return items;
    }

    @Test
    void save_SQL_문_수() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (int k : new int[] {2, 6}) {
            seed(k);
            counts.put("len" + k, probe.inTx("save-len-k" + k, () -> headerService.save(resaveL110(), lengthChanged())));
            counts.put("same" + k, probe.inTx("save-same-k" + k, () -> headerService.save(resaveL110(), l110Items())));
            counts.put("phys" + k, probe.inTx("save-phys-k" + k, () -> headerService.save(resaveL110(), physChanged())));
        }
        // 전문 1개(본문 항목 4·이 헤더 재정의 1)마다: 항목 UPDATE 4 + 전문 UPDATE 2 + 버전 이력 SELECT·INSERT 2 + 재정의 DELETE·SELECT·INSERT 3
        assertEquals(4 * 11, counts.get("len6") - counts.get("len2"), counts::toString);
        assertEquals(4 * 11, counts.get("phys6") - counts.get("phys2"), counts::toString);
        // 스냅샷이 같으면(I18) 새 버전·오프셋 쓰기가 없고 재정의 다시 넣기 3문만 남는다
        assertEquals(4 * 3, counts.get("same6") - counts.get("same2"), counts::toString);
        // 2026-10-02 메타 변경 기록 INSERT 1문(헤더 + 사용 전문, 키 수와 무관 — MetaRevisionRecorder Ruling R1)
        assertTrue(counts.get("len2") <= 64 && counts.get("phys2") <= 65 && counts.get("same2") <= 47, counts::toString);
    }

    @Test
    void view_SQL_문_수() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (int k : new int[] {2, 6}) {
            seed(k);
            HeaderMngViewRequest r = new HeaderMngViewRequest();
            r.setLayoutId(l110);
            counts.put("view" + k, probe.inTx("view-k" + k, () -> headerService.view(r)));
            counts.put("viewNoTx" + k, probe.outsideTx("view-notx-k" + k, () -> headerService.view(r)));
        }
        // 사용 전문은 IN 한 번 — 전문 수와 무관하다
        assertEquals(counts.get("view2"), counts.get("view6"), counts::toString);
        assertTrue(counts.get("view6") <= 8, counts::toString);
    }
}
