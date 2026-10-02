package com.dongkuk.dmes.mdm.dmb;

import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dmb.headerMng.dto.HeaderMngSaveRequest;
import com.dongkuk.dmes.mdm.dmb.headerMng.service.HeaderMngService;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngSaveRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.service.LayoutMngService;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * TSK-05-02 design.md §3.2 — api 통합 테스트 공용. 도메인·컬럼은 네이티브 SQL({@code INSERT … WHERE NOT EXISTS}·{@code OR
 * IGNORE}), **헤더 L100·L110 은 반드시 {@link HeaderMngService#save} 로 만든다**(SQL 로 넣으면 헤더 오프셋·총 길이 계산을 아무도
 * 거치지 않는다). 서비스는 트랜잭션 없이 부른다. 한 클래스가 DB 하나를 쓰므로 EAI 코드·레이아웃 이름은 호출마다 새로 만든다.
 * 행·요청 도우미만 둔다(HTTP 시험도 쓴다) — 서비스로 저장하는 도우미는 {@link LayoutServiceTestSupport}(D-144 3단계).
 */
public abstract class LayoutTestSupport extends AbstractMdmSharedDbTest {

    public static final String W4 = "SIGN=N;ZERO=Y;SCALE=1;WIDTH=4";

    @Autowired
    protected HeaderMngService headerService;
    @Autowired
    protected LayoutMngService layoutService;
    @Autowired
    protected JdbcTemplate jdbc;

    private static int seq;

    protected static synchronized String uniq(String prefix) {
        return prefix + (++seq);
    }

    // ------------------------------------------------------------------ 사전

    protected long domain(String std, String kind, String type, Integer length, Integer scale, Long parent) {
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, PARENT_DOMAIN_ID, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, CHG_SEQ, VER) "
                + "SELECT ?, ?, ?, ?, ?, ?, ?, 0, 0 WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_DOMAIN WHERE STD_NAME = ?)",
                "도메인 " + std, std, parent, kind, type, length, scale, std);
        return jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = ?", Long.class, std);
    }

    protected void column(String phys, String name, String label, long domainId) {
        jdbc.update("INSERT OR IGNORE INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, PHYS_NAME, DOMAIN_ID, REQUIRED, CHG_SEQ, VER) "
                + "VALUES (?, ?, ?, ?, 0, 0, 0)", name, label, phys, domainId);
    }

    private long str(int len) {
        return domain("T_STR_" + len, "TEXT", "STRING", len, null, null);
    }

    private long num(int len) {
        return domain("T_NUM_" + len, "QTY", "NUMBER", len, 0, null);
    }

    /** §3.2 헤더 항목 사전 + M201 본문 사전. 몇 번 불러도 같다. */
    protected void dictionary() {
        jdbc.update("INSERT OR IGNORE INTO TB_MDM_UNIT (UNIT_CODE, DIMENSION, BASE_UNIT, FACTOR, CHG_SEQ) VALUES ('mm','LENGTH','mm',1,0)");
        column("TC_CD", "트랜잭션 코드", null, str(8));
        column("SND_FAC_TP", "송신공장구분", null, str(4));
        column("SND_PROC_TP", "송신공정구분", null, str(3));
        column("RCV_FAC_TP", "수신공장구분", null, str(4));
        column("RCV_PROC_TP", "수신공정구분", null, str(3));
        column("SNT_SND_HRP", "송신일시", null, str(14));
        column("SND_PGM_ID", "송신프로그램", null, str(14));
        column("EAI_IF_ID", "EAI 인터페이스 ID", null, str(12));
        column("SNT_TP", "송신구분", null, str(1));
        column("SNT_ORD", "송신순번", null, num(5));
        column("IF_DATA_NTR", "데이터성격", null, str(1));
        column("SNT_LTH", "전문길이", null, num(6));
        column("LINE_CODE", "라인코드", null, str(2));
        column("SEQUENCE_NO", "일련번호", null, num(4));
        column("LENGTH", "길이", null, num(5));
        column("DATE", "일자", null, str(8));
        column("TIME", "시각", null, str(6));
        column("EXTRA_3", "추가 항목", null, str(3));
        column("COIL_ID", "코일 아이디", "코일 ID", domain("COIL_ID", "ID", "STRING", 20, null, null));
        column("PROD_DT", "생산일자", null, domain("DT", "DATE", "STRING", 8, null, null));
        column("COIL_THK", "코일 두께", null, domain("COIL_THK", "QTY", "NUMBER", 3, 1, null));
    }

    // ------------------------------------------------------------------ 사전(TSK-05-03 — 단위·유효 식 도메인, design.md §3.2)

    /** 단위 원장 한 행(몇 번 불러도 같다). 계수 = 차원 기준 단위로의 배수. */
    protected void unit(String code, String dimension, String base, String factor) {
        jdbc.update("INSERT OR IGNORE INTO TB_MDM_UNIT (UNIT_CODE, DIMENSION, BASE_UNIT, FACTOR, CHG_SEQ) VALUES (?, ?, ?, ?, 0)",
                code, dimension, base, new BigDecimal(factor));
    }

    /** 기준 단위가 있는 도메인 — 단위는 먼저 {@link #unit} 으로 넣는다. */
    protected long domainWithUnit(String std, String type, int length, Integer scale, String unit) {
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, UNIT_CODE, CHG_SEQ, VER) "
                + "SELECT ?, ?, 'QTY', ?, ?, ?, ?, 0, 0 WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_DOMAIN WHERE STD_NAME = ?)",
                "도메인 " + std, std, type, length, scale, unit, std);
        return jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = ?", Long.class, std);
    }

    /** 유효 표준식이 있는 도메인(F21 — 판정은 STD_RULE 텍스트만으로 된다). */
    protected long ruleDomain(String std, String type, int length, Integer scale, String stdRule) {
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, STD_RULE, CHG_SEQ, VER) "
                + "SELECT ?, ?, 'QTY', ?, ?, ?, ?, 0, 0 WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_DOMAIN WHERE STD_NAME = ?)",
                "도메인 " + std, std, type, length, scale, stdRule, std);
        return jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = ?", Long.class, std);
    }

    /** 샘플 렌더 예시 값 한 행(grid {@code samples}). */
    protected static Map<String, Object> sample(String phys, String value) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("COLUMN_PHYS", phys);
        m.put("VALUE", value);
        return m;
    }

    // ------------------------------------------------------------------ 행

    protected static Map<String, Object> item(String fillKind, String phys, String defaultValue) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("FILL_KIND", fillKind);
        if (phys != null) {
            m.put("COLUMN_PHYS", phys);
        }
        if (defaultValue != null) {
            m.put("DEFAULT_VALUE", defaultValue);
        }
        return m;
    }

    protected static Map<String, Object> filler(int length) {
        Map<String, Object> m = item("FILLER", null, null);
        m.put("FILLER_LENGTH", length);
        return m;
    }

    protected static List<Map<String, Object>> numbered(List<Map<String, Object>> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> m = new LinkedHashMap<>(rows.get(i));
            m.put("SEQ", i + 1);
            out.add(m);
        }
        return out;
    }

    protected static List<Map<String, Object>> l100Items() {
        return numbered(new ArrayList<>(List.of(
                item("AUTO", "TC_CD", "LAYOUT_ID"), item("CONST", "SND_FAC_TP", "B0"), item("CONST", "SND_PROC_TP", "L2"),
                item("CONST", "RCV_FAC_TP", "B1"), item("CONST", "RCV_PROC_TP", "MES"), item("AUTO", "SNT_SND_HRP", "SEND_TIME"),
                item("CONST", "SND_PGM_ID", "L2IFSND"), item("CONST", "EAI_IF_ID", null), item("CONST", "SNT_TP", "S"),
                item("AUTO", "SNT_ORD", "SEQ"), item("CONST", "IF_DATA_NTR", "I"), item("AUTO", "SNT_LTH", "MSG_LENGTH"),
                filler(25))));
    }

    protected static List<Map<String, Object>> l110Items() {
        return numbered(new ArrayList<>(List.of(
                item("CONST", "LINE_CODE", "B1"), item("AUTO", "SEQUENCE_NO", "SEQ"), item("AUTO", "LENGTH", "MSG_LENGTH"),
                item("AUTO", "DATE", "SEND_TIME"), item("AUTO", "TIME", "SEND_TIME"), filler(5))));
    }

    protected static List<Map<String, Object>> m201Items() {
        Map<String, Object> thk = item("DATA", "COIL_THK", null);
        thk.put("NUM_FORMAT", W4);
        return numbered(new ArrayList<>(List.of(item("DATA", "COIL_ID", null), item("DATA", "PROD_DT", null), thk, filler(25))));
    }

    protected static Map<String, Object> headerRow(long headerId) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("HEADER_LAYOUT_ID", headerId);
        return m;
    }

    protected static Map<String, Object> constRow(long headerId, int headerSeq, String value) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("HEADER_LAYOUT_ID", headerId);
        m.put("HEADER_SEQ", headerSeq);
        m.put("CONST_VALUE", value);
        return m;
    }

    // ------------------------------------------------------------------ 확정(시험 준비 — D-144 3단계)

    /** 시험 준비용 확정자. */
    protected static final String RELEASED_BY = "kim";

    /**
     * DRAFT → RELEASED(구간 [applyFrom, 9999)), 직전 열린 RELEASED 를 applyFrom 에서 닫고 부모를 INUSE 로. EAI 표준 헤더 연결
     * ({@code TB_MDM_EAI.HEADER_LAYOUT_ID})은 건드리지 않는다 — 운영 확정과 같다(표준 헤더는 시각 T 해석, Ruling P3-15·P3-18).
     */
    protected void release(long layoutId, String ver, String applyFrom) {
        jdbc.update("UPDATE TB_MDM_LAYOUT_VER SET APPLY_TO = ? WHERE LAYOUT_ID = ? AND STATUS = 'RELEASED' "
                + "AND APPLY_TO = '9999-12-31 00:00:00'", applyFrom, layoutId);
        jdbc.update("UPDATE TB_MDM_LAYOUT_VER SET STATUS = 'RELEASED', APPLY_FROM = ?, APPLY_TO = '9999-12-31 00:00:00', "
                + "REQUESTED_BY = ?, REQUESTED_AT = ?, RELEASED_AT = ? WHERE LAYOUT_ID = ? AND VER = ?",
                applyFrom, RELEASED_BY, applyFrom, applyFrom, layoutId, new BigDecimal(ver));
        jdbc.update("UPDATE TB_MDM_LAYOUT SET STATUS = 'INUSE' WHERE LAYOUT_ID = ?", layoutId);
    }

    // ------------------------------------------------------------------ 요청 도우미(저장 도우미는 LayoutServiceTestSupport)

    protected static HeaderMngSaveRequest headerReq(String name, Consumer<HeaderMngSaveRequest> edit) {
        HeaderMngSaveRequest r = new HeaderMngSaveRequest();
        r.setLayoutName(name);
        edit.accept(r);
        return r;
    }

    protected static LayoutMngSaveRequest layoutReq(String name, String eai, Consumer<LayoutMngSaveRequest> edit) {
        LayoutMngSaveRequest r = new LayoutMngSaveRequest();
        r.setLayoutName(name);
        r.setEaiCode(eai);
        r.setSndSystem("L2");
        r.setRcvSystem("MES");
        edit.accept(r);
        return r;
    }

    /** 재정의 한 행 — HEADER_LAYOUT_ID 는 m201() 이 L100 으로 채운다. */
    protected static Map<String, Object> l100Const(int headerSeq, String value) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("HEADER_SEQ", headerSeq);
        m.put("CONST_VALUE", value);
        return m;
    }

    // ------------------------------------------------------------------ 조회

    protected Map<String, Object> layoutRow(long id) {
        return jdbc.queryForMap("SELECT * FROM TB_MDM_LAYOUT WHERE LAYOUT_ID = ?", id);
    }

    /** 한 버전의 항목 행(SEQ 순). 버전은 {@code "1"}·{@code "1.000"} 처럼 — 바인딩은 {@code new BigDecimal(ver)}. */
    protected List<Map<String, Object>> itemRows(long id, String ver) {
        return jdbc.queryForList("SELECT * FROM TB_MDM_LAYOUT_ITEM WHERE LAYOUT_ID = ? AND VER = ? ORDER BY SEQ", id,
                new BigDecimal(ver));
    }

    protected List<Integer> column(List<Map<String, Object>> rows, String key) {
        return rows.stream().map(r -> ((Number) r.get(key)).intValue()).toList();
    }

    protected List<Map<String, Object>> constRows(long messageId) {
        return jdbc.queryForList("SELECT * FROM TB_MDM_LAYOUT_CONST WHERE LAYOUT_ID = ? ORDER BY HEADER_LAYOUT_ID, HEADER_COLUMN_PHYS",
                messageId);
    }

    protected static long ver(Map<String, Object> row) {
        return ((Number) row.get("VER")).longValue();
    }

    protected static BusinessException rejected(org.junit.jupiter.api.function.Executable call) {
        return assertThrows(BusinessException.class, call);
    }
}
