package com.dongkuk.dmes.mdm.dme;

import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.FakeStewardDirectory;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import java.time.LocalDateTime;
import java.util.Set;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * TSK-08-02 design §3.1 — dme 서비스 테스트 공용. 가짜 사용자와 룰 행 삽입 헬퍼. 데이터는 JdbcTemplate 으로 넣는다(운영 시드 금지).
 * {@code DmeOasisHttpTest} 는 이 설정을 가져오지 않는다(역할은 헤더 → 실제 경로).
 */
public final class DmeTestSupport {

    /** 서비스 테스트의 현재 시각(KST). */
    public static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 15, 9, 0, 0);

    public static final Set<String> STEWARD = Set.of(MdmRoles.STEWARD);
    public static final Set<String> STD_ADMIN = Set.of(MdmRoles.STD_ADMIN);

    private DmeTestSupport() {
    }

    @TestConfiguration(proxyBeanMethods = false)
    public static class Config {

        @Bean
        @Primary
        MutableCurrentUser dmeCurrentUser() {
            return new MutableCurrentUser();
        }

        @Bean
        @Primary
        MutableClock dmeClock() {
            return new MutableClock(MdmClockConfig.KST, NOW);
        }

        /** 넘기기 대상 검사 가짜 — 기본 구현(UnresolvedStewardDirectory)은 늘 거부한다(F14). */
        @Bean
        @Primary
        FakeStewardDirectory dmeStewardDirectory() {
            return new FakeStewardDirectory();
        }
    }

    public static final class MutableCurrentUser implements MdmCurrentUser {
        private volatile String userId;
        private volatile Set<String> roles = Set.of();

        public void set(String userId, Set<String> roles) {
            this.userId = userId;
            this.roles = Set.copyOf(roles);
        }

        @Override
        public String userId() {
            return userId;
        }

        @Override
        public Set<String> roleIds() {
            return roles;
        }
    }

    public static void clear(JdbcTemplate jdbc) {
        jdbc.update("DELETE FROM TB_MDM_RULE_TEST_CASE");
        jdbc.update("DELETE FROM TB_MDM_RULE_ROW");
        jdbc.update("DELETE FROM TB_MDM_RULE_VAR");
        jdbc.update("DELETE FROM TB_MDM_RULE_VER");
        jdbc.update("DELETE FROM TB_MDM_RULE_SYSTEM");
        jdbc.update("DELETE FROM TB_MDM_RULE_RECV");
        jdbc.update("DELETE FROM TB_MDM_RULE_SET");
        jdbc.update("DELETE FROM TB_MDM_RULE");
    }

    public static void rule(JdbcTemplate jdbc, String id, String name, String kind, String status) {
        jdbc.update("INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, STATUS, SOURCE_KIND) VALUES (?, ?, ?, ?, 'MDM')",
                id, name, kind, status);
    }

    public static void externalRule(JdbcTemplate jdbc, String id, String name) {
        jdbc.update("INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, STATUS, SOURCE_KIND, SOURCE_SYSTEM) "
                + "VALUES (?, ?, 'DECISION', 'INUSE', 'EXTERNAL', 'MES')", id, name);
    }

    /** RELEASED 버전. {@code to} 가 null 이면 열린 끝. */
    public static void released(JdbcTemplate jdbc, String id, int ver, String hit, String from, String to) {
        jdbc.update("INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, HIT_POLICY, APPLY_FROM, APPLY_TO, ROW_VERSION) "
                + "VALUES (?, ?, 'RELEASED', ?, ?, ?, 0)", id, ver, hit, from, to == null ? "9999-12-31 00:00:00" : to);
    }

    /** 미적용 버전(DRAFT·REQUESTED·APPROVED). DRAFT 가 아니면 CHECK 가 적용 구간을 요구하므로 먼 미래 구간을 넣는다. */
    public static void pending(JdbcTemplate jdbc, String id, int ver, String status, String owner, String hit, Integer baseVer) {
        boolean draft = "DRAFT".equals(status);
        jdbc.update("INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, OWNER_ID, HIT_POLICY, BASE_VER, APPLY_FROM, APPLY_TO, ROW_VERSION) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)", id, ver, status, owner, hit, baseVer,
                draft ? null : "2099-01-01 00:00:00", draft ? null : "9999-12-31 00:00:00");
    }

    public static void var(JdbcTemplate jdbc, String id, int ver, int varId, String kind, String disp, String name, int seq) {
        jdbc.update("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, SEQ) VALUES (?, ?, ?, ?, ?, ?, ?)",
                id, ver, varId, kind, disp, name, seq);
    }

    public static void row(JdbcTemplate jdbc, String id, int ver, int rowId, int seq, String kind, String cells) {
        jdbc.update("INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) VALUES (?, ?, ?, ?, ?, ?)",
                id, ver, rowId, seq, kind, cells);
    }

    public static void var(JdbcTemplate jdbc, String id, int ver, int varId, String kind, String disp, String name, int seq, String dataType) {
        jdbc.update("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, SEQ, DATA_TYPE) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                id, ver, varId, kind, disp, name, seq, dataType);
    }

    public static void clearDictionary(JdbcTemplate jdbc) {
        jdbc.update("DELETE FROM TB_MDM_COLUMN_SYSTEM");
        jdbc.update("DELETE FROM TB_MDM_COLUMN");
        jdbc.update("DELETE FROM TB_MDM_DOMAIN");
    }

    public static long domain(JdbcTemplate jdbc, String stdName, String kind, String dataType, Integer scale) {
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, SCALE, VER) VALUES (?, ?, ?, ?, ?, 0)",
                stdName, stdName, kind, dataType, scale);
        return jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = ?", Long.class, stdName);
    }

    public static void column(JdbcTemplate jdbc, String physName, long domainId) {
        jdbc.update("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID) VALUES (?, ?, ?)", physName, physName, domainId);
    }

    // ── 06 샘플 QLTY_GRD_JDG(06:83-90) — design §3.4.3 e2e 픽스처와 같은 모양(결과 셀은 Value) ──

    public static final String Q_ROW1 = "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1.6\",\"right\":\"2.5\"},\"2\":{\"op\":\"GT\",\"left\":\"1000\"},"
            + "\"3\":{\"op\":\"IN\",\"list\":[\"A\"]},\"4\":{\"val\":\"A\"},\"5\":{\"val\":\"1.05\"}}";
    public static final String Q_ROW2 = "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1.6\",\"right\":\"2.5\"},\"2\":{\"op\":\"GT\",\"left\":\"1000\"},"
            + "\"3\":{\"op\":\"IN\",\"list\":[\"B\"]},\"4\":{\"val\":\"B\"},\"5\":{\"val\":\"1.00\"}}";
    public static final String Q_ROW3 = "{\"1\":{\"op\":\"GE\",\"left\":\"2.5\"},\"2\":{\"op\":\"NA\"},\"3\":{\"op\":\"NOT_IN\",\"list\":[\"C\"]},"
            + "\"4\":{\"val\":\"B\"},\"5\":{\"val\":\"0.98\"}}";
    public static final String Q_DEFAULT = "{\"4\":{\"val\":\"C\"},\"5\":{\"val\":\"0.90\"}}";

    /** 사전(두께 NUMBER scale 2·폭 NUMBER scale 0·표면등급 STRING)과 QLTY_GRD_JDG(INUSE, LAST_VAR_ID 5·LAST_ROW_ID 4) VER 1 RELEASED. */
    public static void sampleRule(JdbcTemplate jdbc) {
        column(jdbc, "COIL_THK", domain(jdbc, "COIL_THK_D", "QTY", "NUMBER", 2));
        column(jdbc, "COIL_WID", domain(jdbc, "COIL_WID_D", "QTY", "NUMBER", 0));
        column(jdbc, "SURF_GRD", domain(jdbc, "SURF_GRD_D", "TEXT", "STRING", null));
        rule(jdbc, "QLTY_GRD_JDG", "품질 등급 판정", "DECISION", "INUSE");
        jdbc.update("UPDATE TB_MDM_RULE SET LAST_VAR_ID = 5, LAST_ROW_ID = 4 WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'");
        released(jdbc, "QLTY_GRD_JDG", 1, "FIRST", "2026-01-01 00:00:00", null);
        sampleDefinition(jdbc, "QLTY_GRD_JDG", 1);
    }

    /** 샘플 변수 5개·행 4개를 그 버전에 넣는다. */
    public static void sampleDefinition(JdbcTemplate jdbc, String id, int ver) {
        var(jdbc, id, ver, 1, "COND", "2", "COIL_THK", 1, null);
        var(jdbc, id, ver, 2, "COND", "1", "COIL_WID", 2, null);
        var(jdbc, id, ver, 3, "COND", "1", "SURF_GRD", 3, null);
        var(jdbc, id, ver, 4, "RESULT", "Value", "QLTY_GRD", 1, "STRING");
        var(jdbc, id, ver, 5, "RESULT", "Value", "PRC_FCT", 2, "NUMBER");
        row(jdbc, id, ver, 1, 1, "NORMAL", Q_ROW1);
        row(jdbc, id, ver, 2, 2, "NORMAL", Q_ROW2);
        row(jdbc, id, ver, 3, 3, "NORMAL", Q_ROW3);
        row(jdbc, id, ver, 4, 0, "DEFAULT", Q_DEFAULT);
    }

    public static int count(JdbcTemplate jdbc, String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    public static long rowVersion(JdbcTemplate jdbc, String id, int ver) {
        return jdbc.queryForObject("SELECT ROW_VERSION FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = ? AND VER = ?", Long.class, id, ver);
    }
}
