package com.dongkuk.dmes.mdm.dme;

import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
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
}
