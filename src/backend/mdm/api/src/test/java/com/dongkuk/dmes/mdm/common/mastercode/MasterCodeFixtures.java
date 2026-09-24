package com.dongkuk.dmes.mdm.common.mastercode;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * TSK-06-03 design.md §3 커밋 A — 04 표 시험 시드(네이티브 INSERT, Backend 가이드 §10 의 {@code seed} 접두).
 *
 * <p>제약: {@code CK_TB_MDM_CODE_VER_APPLY} 때문에 DRAFT 가 아닌 버전은 APPLY_FROM·APPLY_TO 를 둘 다 채운다.
 * {@code CK_TB_MDM_CODE_SRC_SYS} 때문에 MDM 은 SOURCE_SYSTEM NULL, EXTERNAL 은 {@code 'MES'}(V2 시드). REGEX 카테고리는
 * {@code CK_TB_MDM_CODE_CATE_DEF} 때문에 DEF_TARGET 이 있어야 한다. 업무 일시는 19자 TEXT 다(F16).
 */
public final class MasterCodeFixtures {

    public static final String OPEN = "9999";
    public static final String OPEN_END = "9999-12-31 00:00:00";

    private final JdbcTemplate jdbc;

    public MasterCodeFixtures(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** FK 역순(F16). */
    public void clear() {
        jdbc.update("DELETE FROM TB_MDM_CODE_CATE_ITEM");
        jdbc.update("DELETE FROM TB_MDM_CODE_CATE");
        jdbc.update("DELETE FROM TB_MDM_CODE_ITEM");
        jdbc.update("DELETE FROM TB_MDM_CODE_VER");
        jdbc.update("DELETE FROM TB_MDM_CODE");
    }

    /** attrNames 는 attr01_name 부터 차례로. */
    public void seedCode(String id, String name, String sourceKind, int lvlCnt, String... attrNames) {
        String[] labels = Arrays.copyOf(attrNames, 10);
        List<Object> args = new ArrayList<>(List.of(id, name, sourceKind));
        args.add("EXTERNAL".equals(sourceKind) ? "MES" : null);
        args.add(lvlCnt);
        args.addAll(Arrays.asList(labels));
        jdbc.update("INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND, SOURCE_SYSTEM, LVL_CNT, "
                + "ATTR01_NAME, ATTR02_NAME, ATTR03_NAME, ATTR04_NAME, ATTR05_NAME, ATTR06_NAME, ATTR07_NAME, "
                + "ATTR08_NAME, ATTR09_NAME, ATTR10_NAME, STATUS, VER) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INUSE', 0)", args.toArray());
    }

    public void seedVersion(String id, String ver, String status, String ownerId, String applyFrom, String applyTo,
                            long rowVersion) {
        BigDecimal v = new BigDecimal(ver);
        String kind = v.stripTrailingZeros().scale() <= 0 ? "MAJOR" : "MINOR";
        jdbc.update("INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, "
                        + "ROW_VERSION, AUD_VER) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
                id, ver, kind, status, ownerId, applyFrom, applyTo, rowVersion);
    }

    public void seedItem(String id, String code, String from, String to, String name, String alterName, Integer seq,
                         String attr01, String... lvls) {
        String[] l = Arrays.copyOf(lvls, 5);
        jdbc.update("INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER, TO_VER, NAME, ALTER_NAME, SEQ, "
                        + "LVL1, LVL2, LVL3, LVL4, LVL5, ATTR01, VER) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
                id, code, from, to, name, alterName, seq, l[0], l[1], l[2], l[3], l[4], attr01);
    }

    public void seedCate(String id, String cateId, String from, String to, String cateName, String kind, String expr,
                         String target) {
        jdbc.update("INSERT INTO TB_MDM_CODE_CATE (MARU_CODE_ID, CATE_ID, FROM_VER, TO_VER, CATE_NAME, DEF_KIND, "
                + "DEF_EXPR, DEF_TARGET, VER) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)", id, cateId, from, to, cateName, kind,
                expr, target);
    }

    public void seedCateItem(String id, String cateId, String code, String from, String to) {
        jdbc.update("INSERT INTO TB_MDM_CODE_CATE_ITEM (MARU_CODE_ID, CATE_ID, CODE, FROM_VER, TO_VER, VER) "
                + "VALUES (?, ?, ?, ?, ?, 0)", id, cateId, code, from, to);
    }

    /**
     * 원천 04:1059-1107 PROC_CD 를 DRAFT v2.000 이 82·83 을 닫기 <b>전</b> 상태로 둔다(§1.3): 82@1.000-9999,
     * 83@1.000-1.001(3CGl)·83@1.001-9999(3CGL), CATE_ITEM MAJOR 82@1.000-9999. v2.000 DRAFT 소유자 kim, row_version 0.
     */
    public void seedProcCdBeforeDraftEdits() {
        seedCode("PROC_CD", "공정 코드", "MDM", 0);
        seedVersion("PROC_CD", "1.000", "RELEASED", "kim", "2024-01-01 00:00:00", "2026-07-01 00:00:00", 0);
        seedVersion("PROC_CD", "1.001", "RELEASED", "kim", "2026-07-01 00:00:00", OPEN_END, 0);
        seedVersion("PROC_CD", "2.000", "DRAFT", "kim", null, null, 0);
        seedItem("PROC_CD", "1P", "1.000", OPEN, "PLTCM", "PLTCM", 11, null);
        seedItem("PROC_CD", "82", "1.000", OPEN, "2CGL", "CGL", 21, null);
        seedItem("PROC_CD", "83", "1.000", "1.001", "3CGl", "CGL", 22, null);
        seedItem("PROC_CD", "83", "1.001", OPEN, "3CGL", "CGL", 22, null);
        seedItem("PROC_CD", "2P", "1.001", OPEN, "PLTCM2", "PLTCM", 12, null);
        seedCate("PROC_CD", "BASE", "1.000", OPEN, "전체", "REGEX", ".*", "CODE");
        seedCate("PROC_CD", "COATING", "1.000", OPEN, "도금 공정", "REGEX", "8[0-9]", "CODE");
        seedCate("PROC_CD", "MAJOR", "1.000", OPEN, "주요 공정", "TABLE", null, null);
        seedCate("PROC_CD", "COLD_MILL", "1.000", OPEN, "냉연 공정", "TABLE", null, null);
        seedCateItem("PROC_CD", "MAJOR", "1P", "1.000", OPEN);
        seedCateItem("PROC_CD", "MAJOR", "82", "1.000", OPEN);
        seedCateItem("PROC_CD", "MAJOR", "2P", "1.001", OPEN);
        seedCateItem("PROC_CD", "COLD_MILL", "1P", "1.000", OPEN);
        seedCateItem("PROC_CD", "COLD_MILL", "2P", "1.001", OPEN);
    }

    /** 원천 04:1109-1148 STEEL_STD 8행(lvl_cnt 3, attr01 `인장강도`) + DRAFT 1.001(소유자 kim, row_version 0). */
    public void seedSteelStd() {
        seedCode("STEEL_STD", "강종 규격", "MDM", 3, "인장강도");
        seedVersion("STEEL_STD", "1.000", "RELEASED", "kim", "2026-01-01 00:00:00", OPEN_END, 0);
        seedVersion("STEEL_STD", "1.001", "DRAFT", "kim", null, null, 0);
        seedItem("STEEL_STD", "KS-9", "1.000", OPEN, "규격 외 KS", null, 9, null, "KS");
        seedItem("STEEL_STD", "KS-3-CGCC", "1.000", OPEN, "CGCC", null, 1, "270", "KS", "KS-3");
        seedItem("STEEL_STD", "KS-3-CGCD", "1.000", OPEN, "CGCD", null, 2, "270", "KS", "KS-3");
        seedItem("STEEL_STD", "KS-3-CGCH", "1.000", OPEN, "CGCH(기본)", null, 3, "270", "KS", "KS-3");
        seedItem("STEEL_STD", "KS-3-CGCH-Z12", "1.000", OPEN, "CGCH Z12", null, 1, "270", "KS", "KS-3", "KS-3-CGCH");
        seedItem("STEEL_STD", "KS-3-CGCH-Z27", "1.000", OPEN, "CGCH Z27", null, 2, "270", "KS", "KS-3", "KS-3-CGCH");
        seedItem("STEEL_STD", "JIS-3-CGCC", "1.000", OPEN, "CGCC(JIS)", null, 1, "270", "JIS", "JIS-3");
        seedItem("STEEL_STD", "JIS-4-SPCC", "1.000", OPEN, "SPCC", null, 1, "270", "JIS", "JIS-4");
        seedCate("STEEL_STD", "BASE", "1.000", OPEN, "전체", "REGEX", ".*", "CODE");
    }

    /** 원천 04:1100-1104 EQP_CD — EXTERNAL(MES), 1.000·2.000 RELEASED. */
    public void seedEqpCd() {
        seedCode("EQP_CD", "설비 코드", "EXTERNAL", 0);
        seedVersion("EQP_CD", "1.000", "RELEASED", null, "2026-08-01 00:00:00", "2026-09-01 00:00:00", 0);
        seedVersion("EQP_CD", "2.000", "RELEASED", null, "2026-09-01 00:00:00", OPEN_END, 0);
        seedItem("EQP_CD", "E1", "1.000", OPEN, "설비1", null, 1, null);
        seedCate("EQP_CD", "BASE", "1.000", OPEN, "전체", "REGEX", ".*", "CODE");
    }

    // ── 읽기 도우미 ──────────────────────────────────────────────────────

    /** "code@from-to" 문자열 목록(코드·from 순). to 는 9999 면 9999, 아니면 소수 세 자리. */
    public List<String> itemSegments(String id) {
        return jdbc.query("SELECT CODE, FROM_VER, TO_VER FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = ?",
                (rs, i) -> rs.getString(1) + "@" + fmt(rs.getBigDecimal(2)) + "-" + fmt(rs.getBigDecimal(3)), id)
                .stream().sorted().toList();
    }

    /** "code|from|to|name|alter|seq" 목록(정렬). */
    public List<String> itemRows(String id) {
        return jdbc.query("SELECT CODE, FROM_VER, TO_VER, NAME, ALTER_NAME, SEQ FROM TB_MDM_CODE_ITEM "
                        + "WHERE MARU_CODE_ID = ?",
                (rs, i) -> rs.getString(1) + "|" + fmt(rs.getBigDecimal(2)) + "|" + fmt(rs.getBigDecimal(3)) + "|"
                        + rs.getString(4) + "|" + rs.getString(5) + "|" + rs.getObject(6), id)
                .stream().sorted().toList();
    }

    public List<String> cateSegments(String id) {
        return jdbc.query("SELECT CATE_ID, FROM_VER, TO_VER FROM TB_MDM_CODE_CATE WHERE MARU_CODE_ID = ?",
                (rs, i) -> rs.getString(1) + "@" + fmt(rs.getBigDecimal(2)) + "-" + fmt(rs.getBigDecimal(3)), id)
                .stream().sorted().toList();
    }

    public List<String> cateItemSegments(String id) {
        return jdbc.query("SELECT CATE_ID, CODE, FROM_VER, TO_VER FROM TB_MDM_CODE_CATE_ITEM WHERE MARU_CODE_ID = ?",
                (rs, i) -> rs.getString(1) + " " + rs.getString(2) + "@" + fmt(rs.getBigDecimal(3)) + "-"
                        + fmt(rs.getBigDecimal(4)), id)
                .stream().sorted().toList();
    }

    public long rowVersion(String id, String ver) {
        return jdbc.query("SELECT VER, ROW_VERSION FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = ?",
                        (rs, i) -> new Object[]{rs.getBigDecimal(1), rs.getLong(2)}, id).stream()
                .filter(r -> ((BigDecimal) r[0]).setScale(3, java.math.RoundingMode.HALF_UP).compareTo(new BigDecimal(ver)) == 0)
                .map(r -> (Long) r[1]).findFirst().orElseThrow();
    }

    public static String fmt(BigDecimal v) {
        if (v.compareTo(new BigDecimal("9999")) == 0) {
            return "9999";
        }
        return v.setScale(3, java.math.RoundingMode.HALF_UP).toPlainString();
    }
}
