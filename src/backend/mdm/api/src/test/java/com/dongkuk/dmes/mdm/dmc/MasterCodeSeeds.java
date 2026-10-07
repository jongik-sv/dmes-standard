package com.dongkuk.dmes.mdm.dmc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * TSK-06-02 design.md §2 — 마루 코드 원장 <b>seed 전용</b> 헬퍼. 생성 API 가 없는 상태(RELEASED 버전·코드 행·카테고리·
 * EXTERNAL 코드·TB_MDM_DATA)를 JdbcTemplate 원시 INSERT 로 만든다(Backend 가이드 §10). 일시는
 * {@code 'yyyy-MM-dd HH:mm:ss'} 문자열로 받아 TIMESTAMP 로 묶고(Oracle 은 문자열 → TIMESTAMP 암시 변환이 NLS 에 기대어 ORA-01843 이 난다),
 * 버전 번호는 문자열("1.001")로 받아 BigDecimal 로 묶는다(NUMBER(7,3)).
 */
public final class MasterCodeSeeds {

    /** 호출이 기대한 mdm 오류 코드(첫 detail 코드와 문구 접두)로 실패하는지 본다. */
    public static BusinessException assertMdmError(MdmErrorCode expected, Supplier<?> call) {
        BusinessException e = assertThrows(BusinessException.class, call::get);
        assertEquals(expected.code(), e.getErrors().get(0).code(), e.getMessage());
        assertTrue(e.getMessage().startsWith(expected.defaultMessage()), e.getMessage());
        return e;
    }

    /** 과거 적용 시각(실시간 시계로도 결정적). */
    public static final String PAST = "2026-01-01 00:00:00";
    public static final String PAST2 = "2026-03-01 00:00:00";
    /** 미래 적용 시각. */
    public static final String FUTURE = "2099-01-01 00:00:00";
    public static final String OPEN_END = "9999-12-31 00:00:00";
    public static final String OPEN = "9999";

    private final JdbcTemplate jdbc;

    public MasterCodeSeeds(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 04 표를 FK 역순으로 비운다(CATE_ITEM → ITEM → CATE → VER → CODE), TB_MDM_DATA 도. */
    public void clear() {
        jdbc.update("DELETE FROM TB_MDM_CODE_CATE_ITEM");
        jdbc.update("DELETE FROM TB_MDM_CODE_ITEM");
        jdbc.update("DELETE FROM TB_MDM_CODE_CATE");
        jdbc.update("DELETE FROM TB_MDM_CODE_VER");
        jdbc.update("DELETE FROM TB_MDM_CODE");
        jdbc.update("DELETE FROM TB_MDM_DATA");
    }

    /** EXTERNAL 이면 원천 시스템 ERP(CK_TB_MDM_CODE_SRC_SYS). 감사 카운터 VER=0. */
    public void seedCode(String id, String status, String sourceKind) {
        jdbc.update("INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, STATUS, SOURCE_KIND, SOURCE_SYSTEM, LVL_CNT, VER)"
                + " VALUES (?, ?, ?, ?, ?, 0, 0)", id, id + " 이름", status, sourceKind,
                "EXTERNAL".equals(sourceKind) ? "ERP" : null);
    }

    public void setLvlCnt(String id, int lvlCnt) {
        jdbc.update("UPDATE TB_MDM_CODE SET LVL_CNT = ? WHERE MARU_CODE_ID = ?", lvlCnt, id);
    }

    /** RELEASED 는 applyFrom·applyTo 가 필요하다(CK_TB_MDM_CODE_VER_APPLY). DRAFT 는 null 로 둔다. */
    public void seedVer(String id, String ver, String kind, String status, String applyFrom, String applyTo, String owner) {
        jdbc.update("INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO,"
                        + " RELEASED_AT, ROW_VERSION, AUD_VER) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)",
                id, num(ver), kind, status, owner, ts(applyFrom), ts(applyTo), "RELEASED".equals(status) ? ts(applyFrom) : null);
    }

    /** RELEASED(과거 적용, 열린 끝). */
    public void released(String id, String ver, String applyFrom, String applyTo) {
        seedVer(id, ver, ver.endsWith(".000") ? "MAJOR" : "MINOR", "RELEASED", applyFrom, applyTo, "stw1");
    }

    public void draft(String id, String ver, String owner) {
        seedVer(id, ver, ver.endsWith(".000") ? "MAJOR" : "MINOR", "DRAFT", null, null, owner);
    }

    /** lvlsAndAttrs: lvl1..lvl5 다음 attr01..attr10 순서(모자라면 null). */
    public void seedItem(String id, String code, String from, String to, String name, Integer seq, String... lvlsAndAttrs) {
        List<Object> values = new ArrayList<>(List.of(id, code, num(from), num(to)));
        values.add(name);
        values.add(seq);
        String[] rest = Arrays.copyOf(lvlsAndAttrs, 15);
        values.addAll(Arrays.asList(rest));
        jdbc.update("INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER, TO_VER, NAME, SEQ,"
                + " LVL1, LVL2, LVL3, LVL4, LVL5, ATTR01, ATTR02, ATTR03, ATTR04, ATTR05, ATTR06, ATTR07, ATTR08, ATTR09, ATTR10,"
                + " VER) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)", values.toArray());
    }

    public void seedCate(String id, String cateId, String from, String to, String kind, String expr, String target,
                         String name) {
        jdbc.update("INSERT INTO TB_MDM_CODE_CATE (MARU_CODE_ID, CATE_ID, FROM_VER, TO_VER, CATE_NAME, DEF_KIND, DEF_EXPR,"
                + " DEF_TARGET, VER) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)", id, cateId, num(from), num(to), name, kind, expr, target);
    }

    /** BASE(REGEX .*, CODE) from 1.000. */
    public void seedBase(String id) {
        seedCate(id, "BASE", "1.000", OPEN, "REGEX", ".*", "CODE", "전체");
    }

    public void seedCateItem(String id, String cateId, String code, String from, String to) {
        jdbc.update("INSERT INTO TB_MDM_CODE_CATE_ITEM (MARU_CODE_ID, CATE_ID, CODE, FROM_VER, TO_VER, VER)"
                + " VALUES (?, ?, ?, ?, ?, 0)", id, cateId, code, num(from), num(to));
    }

    public void seedData(String maruDataId) {
        jdbc.update("INSERT INTO TB_MDM_DATA (MARU_DATA_ID, MARU_DATA_NAME, SOURCE_KIND) VALUES (?, ?, 'MDM')",
                maruDataId, maruDataId + " 데이터");
    }

    public int count(String table) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    public int count(String table, String id) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE MARU_CODE_ID = ?", Integer.class, id);
    }

    /**
     * 세 선분 표의 업무 칼럼 스냅숏(감사 칼럼 제외). 버전 번호는 scale 3 문자열로 맞춘다(Oracle NUMBER 는 1.000 을 1 로 읽는다).
     * 행 집합 비교용으로 정렬한 목록을 돌려준다.
     */
    public List<String> segments(String id) {
        List<String> out = new ArrayList<>();
        jdbc.query("SELECT CODE, CAST(FROM_VER AS VARCHAR(40)) F, CAST(TO_VER AS VARCHAR(40)) T, NAME, ALTER_NAME, SEQ,"
                        + " DESCRIPTION, LVL1, LVL2, LVL3, LVL4, LVL5, ATTR01, ATTR10 FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = ?",
                rs -> {
                    out.add("ITEM|" + rs.getString("CODE") + "|" + v(rs.getString("F")) + "|" + v(rs.getString("T")) + "|"
                            + rs.getString("NAME") + "|" + rs.getString("ALTER_NAME") + "|" + rs.getString("SEQ") + "|"
                            + rs.getString("DESCRIPTION") + "|" + rs.getString("LVL1") + "|" + rs.getString("LVL2") + "|"
                            + rs.getString("LVL3") + "|" + rs.getString("LVL4") + "|" + rs.getString("LVL5") + "|"
                            + rs.getString("ATTR01") + "|" + rs.getString("ATTR10"));
                }, id);
        jdbc.query("SELECT CATE_ID, CAST(FROM_VER AS VARCHAR(40)) F, CAST(TO_VER AS VARCHAR(40)) T, CATE_NAME, DEF_KIND,"
                        + " DEF_EXPR, DEF_TARGET, DESCRIPTION FROM TB_MDM_CODE_CATE WHERE MARU_CODE_ID = ?",
                rs -> {
                    out.add("CATE|" + rs.getString("CATE_ID") + "|" + v(rs.getString("F")) + "|" + v(rs.getString("T")) + "|"
                            + rs.getString("CATE_NAME") + "|" + rs.getString("DEF_KIND") + "|" + rs.getString("DEF_EXPR") + "|"
                            + rs.getString("DEF_TARGET") + "|" + rs.getString("DESCRIPTION"));
                }, id);
        jdbc.query("SELECT CATE_ID, CODE, CAST(FROM_VER AS VARCHAR(40)) F, CAST(TO_VER AS VARCHAR(40)) T"
                        + " FROM TB_MDM_CODE_CATE_ITEM WHERE MARU_CODE_ID = ?",
                rs -> {
                    out.add("CATE_ITEM|" + rs.getString("CATE_ID") + "," + rs.getString("CODE") + "|" + v(rs.getString("F"))
                            + "|" + v(rs.getString("T")));
                }, id);
        out.sort(null);
        return out;
    }

    /** 한 선분 표에서 FROM_VER 또는 TO_VER 가 ver 인 행 수(세 표 합). */
    public int touching(String id, String column, String ver) {
        int n = 0;
        for (String table : List.of("TB_MDM_CODE_ITEM", "TB_MDM_CODE_CATE", "TB_MDM_CODE_CATE_ITEM")) {
            n += jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE MARU_CODE_ID = ? AND " + column + " = ?",
                    Integer.class, id, num(ver));
        }
        return n;
    }

    /** 19자 텍스트 → TIMESTAMP 바인딩 값(null 은 그대로). */
    private static Timestamp ts(String text) {
        return text == null ? null : Timestamp.valueOf(text);
    }

    private static String v(String s) {
        return s == null ? null : new java.math.BigDecimal(s).setScale(3).toPlainString();
    }

    /** "1.000" → 1.0 등 수 값으로 바인딩(NUMBER(7,3) 칸). */
    private static Object num(String ver) {
        return ver == null ? null : new java.math.BigDecimal(ver);
    }
}
