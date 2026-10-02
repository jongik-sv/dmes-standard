package com.dongkuk.dmes.mdm.common.metarev;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;

/** TB_MDM_META_REV 시험 도우미(spec 2026-10-02-mdm-meta-cache-design §7) — 기록 단언과 도메인·컬럼 픽스처. */
public final class MetaRevTestSupport {

    private MetaRevTestSupport() {
    }

    public static void clear(JdbcTemplate jdbc) {
        jdbc.update("DELETE FROM TB_MDM_META_REV");
    }

    /** 기록 행을 순번 순으로 {@code TYPE:KEY:KIND}. */
    public static List<String> rows(JdbcTemplate jdbc) {
        return jdbc.queryForList("SELECT TARGET_TYPE || ':' || TARGET_KEY || ':' || CHANGE_KIND FROM TB_MDM_META_REV ORDER BY REV_SEQ",
                String.class);
    }

    /** 대상 종류 하나의 키 집합. */
    public static Set<String> keys(JdbcTemplate jdbc, String type) {
        return new LinkedHashSet<>(jdbc.queryForList(
                "SELECT TARGET_KEY FROM TB_MDM_META_REV WHERE TARGET_TYPE = ? ORDER BY REV_SEQ", String.class, type));
    }

    /** 도메인 한 행. CODE 면 STRING, 그 밖에는 NUMBER. 돌려주는 값은 DOMAIN_ID. */
    public static long domain(JdbcTemplate jdbc, String stdName, String kind, Long parentId, String maruCodeId) {
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, PARENT_DOMAIN_ID, MARU_CODE_ID, VER) "
                        + "VALUES (?, ?, ?, ?, ?, ?, 0)",
                stdName, stdName, kind, "CODE".equals(kind) ? "STRING" : "NUMBER", parentId, maruCodeId);
        return jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = ?", Long.class, stdName);
    }

    public static void column(JdbcTemplate jdbc, String physName, long domainId) {
        jdbc.update("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID) VALUES (?, ?, ?)", physName, physName, domainId);
    }
}
