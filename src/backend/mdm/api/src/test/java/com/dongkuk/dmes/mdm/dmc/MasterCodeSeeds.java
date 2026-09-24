package com.dongkuk.dmes.mdm.dmc;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * TSK-06-02 design.md §2 — 마루 코드 원장 <b>seed 전용</b> 헬퍼. 생성 API 가 없는 상태(RELEASED 버전·코드 행·카테고리·
 * EXTERNAL 코드·TB_MDM_DATA)를 JdbcTemplate 원시 INSERT 로 만든다(Backend 가이드 §10). 일시는 SQLite 저장 형식
 * {@code 'yyyy-MM-dd HH:mm:ss'} 문자열, 버전 번호는 문자열("1.001")로 넘겨 NUMERIC 친화도에 맡긴다(운영 쓰기와 같은 저장 형식).
 */
public final class MasterCodeSeeds {

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
                id, num(ver), kind, status, owner, applyFrom, applyTo, "RELEASED".equals(status) ? applyFrom : null);
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

    /** "1.000" → 1.0 등 수 값으로 바인딩(NUMERIC 친화도가 운영 쓰기와 같은 형식으로 저장). */
    private static Object num(String ver) {
        return ver == null ? null : new java.math.BigDecimal(ver);
    }
}
