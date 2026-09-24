package com.dongkuk.dmes.mdm.common.segment;

import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * TSK-07-03 design.md §2 — 05 선분 저장 코어 테스트 공용 픽스처. 시계는 {@code @Primary MutableClock}, 현재 사용자는
 * {@link DmaTestSupport.Config} 의 {@code MutableCurrentUser} 다. 마루 데이터·선분 행은 JdbcTemplate 네이티브로 넣는다
 * (마루 데이터 생성·라벨 지정은 TSK-07-02 몫이라 이 Task 는 픽스처로만 만든다).
 */
public final class DmdSegmentTestSupport {

    public static final LocalDateTime T0 = LocalDateTime.of(2026, 9, 1, 9, 0, 0);
    public static final String OPEN = "9999-12-31 00:00:00";
    public static final String DEFAULT_PATTERN = "^[0-9A-Z]{1,20}$";
    private static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private DmdSegmentTestSupport() {
    }

    @TestConfiguration(proxyBeanMethods = false)
    @Import(DmaTestSupport.Config.class)
    public static class Config {

        @Bean
        @Primary
        MutableClock dmdSegmentClock() {
            return new MutableClock(MdmClockConfig.KST, T0);
        }
    }

    public static String text(LocalDateTime at) {
        return TEXT.format(at);
    }

    public static void clear(JdbcTemplate jdbc) {
        jdbc.update("DELETE FROM TB_MDM_DATA_CATE_ITEM");
        jdbc.update("DELETE FROM TB_MDM_DATA_CATE");
        jdbc.update("DELETE FROM TB_MDM_DATA_ITEM");
        jdbc.update("DELETE FROM TB_MDM_DATA_RECV_ITEM");
        jdbc.update("DELETE FROM TB_MDM_DATA_RECV");
        jdbc.update("DELETE FROM TB_MDM_DATA_SYSTEM");
        jdbc.update("DELETE FROM TB_MDM_DATA");
    }

    /** MDM 원천·INUSE·기본 키 패턴. labels 는 attr01 부터 순서대로(null 은 라벨 없음). */
    public static void insertMdm(JdbcTemplate jdbc, String id, int lvlCnt, String... labels) {
        insertMaruData(jdbc, id, "MDM", null, "INUSE", DEFAULT_PATTERN, lvlCnt, labels);
    }

    public static void insertMaruData(JdbcTemplate jdbc, String id, String sourceKind, String sourceSystem, String status,
                                      String codePattern, int lvlCnt, String... labels) {
        List<Object> args = new ArrayList<>(List.of(id, id + " 이름", status, sourceKind));
        args.add(sourceSystem);
        args.add(codePattern);
        for (int i = 0; i < 10; i++) {
            args.add(i < labels.length ? labels[i] : null);
        }
        args.add(lvlCnt);
        jdbc.update("INSERT INTO TB_MDM_DATA (MARU_DATA_ID, MARU_DATA_NAME, STATUS, SOURCE_KIND, SOURCE_SYSTEM, CODE_PATTERN, "
                + "ATTR01_NAME, ATTR02_NAME, ATTR03_NAME, ATTR04_NAME, ATTR05_NAME, ATTR06_NAME, ATTR07_NAME, ATTR08_NAME, "
                + "ATTR09_NAME, ATTR10_NAME, LVL_CNT, LAST_CHG_SEQ, CHG_SEQ, VER) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)", args.toArray());
    }

    /** 선분 행 직접 삽입(픽스처). lvl·attr 는 앞에서부터. */
    public static void insertItemRow(JdbcTemplate jdbc, String md, String code, String name, LocalDateTime from,
                                     String to, int rowVersion, List<String> lvl, List<String> attr) {
        List<Object> args = new ArrayList<>(Arrays.asList(md, code, text(from), to, name, rowVersion));
        for (int i = 0; i < 5; i++) {
            args.add(lvl != null && i < lvl.size() ? lvl.get(i) : null);
        }
        for (int i = 0; i < 10; i++) {
            args.add(attr != null && i < attr.size() ? attr.get(i) : null);
        }
        jdbc.update("INSERT INTO TB_MDM_DATA_ITEM (MARU_DATA_ID, CODE, VALID_FROM, VALID_TO, NAME, ROW_VERSION, CHG_SEQ, "
                + "LVL1, LVL2, LVL3, LVL4, LVL5, ATTR01, ATTR02, ATTR03, ATTR04, ATTR05, ATTR06, ATTR07, ATTR08, ATTR09, "
                + "ATTR10, VER) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)", args.toArray());
    }

    public static void insertCateRow(JdbcTemplate jdbc, String md, String cateId, String defKind, String defExpr,
                                     String defTarget, LocalDateTime from, String to) {
        jdbc.update("INSERT INTO TB_MDM_DATA_CATE (MARU_DATA_ID, CATE_ID, VALID_FROM, VALID_TO, CATE_NAME, DEF_KIND, "
                + "DEF_EXPR, DEF_TARGET, CHG_SEQ, VER) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)",
                md, cateId, text(from), to, cateId + " 이름", defKind, defExpr, defTarget);
    }

    public static void insertMemberRow(JdbcTemplate jdbc, String md, String cateId, String code, LocalDateTime from,
                                       String to) {
        jdbc.update("INSERT INTO TB_MDM_DATA_CATE_ITEM (MARU_DATA_ID, CATE_ID, CODE, VALID_FROM, VALID_TO, CHG_SEQ, VER) "
                + "VALUES (?, ?, ?, ?, ?, 0, 0)", md, cateId, code, text(from), to);
    }

    /** 한 키의 선분이 서로 겹치는 쌍의 수(두 방언 공용 질의, design.md §3.3). */
    public static int overlapCount(JdbcTemplate jdbc, String md) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM a JOIN TB_MDM_DATA_ITEM b "
                + "ON a.MARU_DATA_ID = b.MARU_DATA_ID AND a.CODE = b.CODE AND a.VALID_FROM < b.VALID_FROM "
                + "AND b.VALID_FROM < a.VALID_TO WHERE a.MARU_DATA_ID = ?", Integer.class, md);
    }

    /** 키당 열린 행 수의 최댓값(없으면 0). */
    public static int maxOpenRowsPerKey(JdbcTemplate jdbc, String md) {
        Integer max = jdbc.queryForObject("SELECT MAX(c) FROM (SELECT COUNT(*) c FROM TB_MDM_DATA_ITEM "
                + "WHERE MARU_DATA_ID = ? AND VALID_TO = ? GROUP BY CODE) t", Integer.class, md, OPEN);
        return max == null ? 0 : max;
    }

    /** 한 키의 항목 행(모든 칼럼), VALID_FROM 오름차순. */
    public static List<Map<String, Object>> itemRows(JdbcTemplate jdbc, String md, String code) {
        return jdbc.queryForList("SELECT * FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = ? AND CODE = ? ORDER BY VALID_FROM",
                md, code);
    }

    public static int count(JdbcTemplate jdbc, String table) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    public static DataItemValue value(String name) {
        return new DataItemValue(name, null, null, null, List.of(), List.of());
    }

    public static DataItemValue value(String name, List<String> lvl, List<String> attr) {
        return new DataItemValue(name, null, null, null, lvl, attr);
    }
}
