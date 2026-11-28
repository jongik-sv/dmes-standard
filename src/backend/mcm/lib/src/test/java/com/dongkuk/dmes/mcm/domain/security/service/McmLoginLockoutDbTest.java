package com.dongkuk.dmes.mcm.domain.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import com.dongkuk.dmes.cactus.autoconfigure.CactusProperties;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.security.auth.AuthService;
import com.dongkuk.dmes.cactus.security.auth.LoginRequest;
import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.dmes.cactus.security.jwt.JwtTokenProvider;
import com.dongkuk.dmes.mcm.testdb.McmOraTestDb;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.entity.SecUserPwd;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserPwdRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.security.account.McmAccountReader;
import com.dongkuk.dmes.mcm.security.password.McmPasswordProperties;
import com.dongkuk.dmes.mcm.security.password.PasswordPolicyEvaluator;
import jakarta.persistence.EntityManagerFactory;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * 로그인 실패 횟수·잠금·계정 상태·임시 비밀번호·사용 기간이 실제 DB 에서 시안대로 동작하는지 — Oracle 시험 PDB(Flyway 기준선, V24 포함)
 * + Hibernate + Spring 트랜잭션 프록시로 확인한다.
 *
 * <p>운영 빈과 같은 {@link McmAuthService}({@code @Transactional login}) → {@link McmSecUserRepository}(REQUIRED 합류) 경로를 탄다.
 * 2026-11-28 — 시안 「사용자 비활성화·퇴직 처리」: 잠금은 LOCK_YN(USE_TP 아님), 비밀번호 확인 뒤 상태 판정,
 * 임시 비밀번호·사용 기간은 토큰 없이 거절, SYSADMIN 은 시간 잠금.
 */
class McmLoginLockoutDbTest {

    private static final String RAW_PWD = "right-pwd1";
    private static final int MAX = 5;

    private static AnnotationConfigApplicationContext ctx;
    private static McmAuthService authService;
    private static JdbcTemplate admin;
    private static SecUserMappingRepository userMappingRepository;
    private static SecRoleGroupMappingRepository roleGroupMappingRepository;

    @BeforeAll
    static void startContext() throws Exception {
        McmOraTestDb.resetSchemas();
        ctx = new AnnotationConfigApplicationContext(Config.class);
        authService = (McmAuthService) ctx.getBean(AuthService.class);
        admin = new JdbcTemplate(ctx.getBean(DataSource.class));
        userMappingRepository = ctx.getBean(SecUserMappingRepository.class);
        roleGroupMappingRepository = ctx.getBean(SecRoleGroupMappingRepository.class);
    }

    @AfterAll
    static void stopContext() throws Exception {
        if (ctx != null) ctx.close();
    }

    @BeforeEach
    void roles() {
        reset(userMappingRepository, roleGroupMappingRepository);
        when(userMappingRepository.findRoleGroupIdsByUserId(anyString())).thenReturn(List.of());
    }

    @Nested
    @DisplayName("실패 횟수 · 잠금(LOCK_YN)")
    class Lockout {

        @Test
        @DisplayName("틀린 비밀번호 — PWD_FAIL_COUNT 가 1 오른 채 DB 에 남는다")
        void wrongPasswordIncrementsFailCount() {
            seed("u_wrong1", 0, "Y");

            assertLoginFails("u_wrong1", "bad", ErrorCode.AUTH_FAILED);

            assertThat(failCount("u_wrong1")).isEqualTo(1);
            assertThat(col("u_wrong1", "LOCK_YN")).isEqualTo("N");
        }

        @Test
        @DisplayName("최대 횟수에 닿는 실패 — LOCK_YN='Y'·LOCK_AT·LOCK_CNT=1 이 남고 USE_TP 는 그대로 Y")
        void failureReachingMaxLocksAccount() {
            seed("u_wrong_max", MAX - 1, "Y");

            assertLoginFails("u_wrong_max", "bad", ErrorCode.AUTH_FAILED);

            assertThat(failCount("u_wrong_max")).isEqualTo(MAX);
            assertThat(col("u_wrong_max", "LOCK_YN")).isEqualTo("Y");
            assertThat(col("u_wrong_max", "USE_TP")).isEqualTo("Y");
            assertThat(col("u_wrong_max", "LOCK_CNT")).isEqualTo("1");
            assertThat(admin.queryForObject("SELECT LOCK_AT FROM TB_MCM_SEC_USER WHERE USER_ID = 'u_wrong_max'",
                    Timestamp.class)).isNotNull();
        }

        @Test
        @DisplayName("잠긴 계정 — 맞는 비밀번호면 ACCOUNT_LOCKED, 틀리면 AUTH_FAILED. 잠금 중에는 횟수를 더 세지 않는다")
        void lockedRejectsAndStopsCounting() {
            seed("u_brute", 0, "Y");
            for (int i = 0; i < MAX; i++) {
                assertLoginFails("u_brute", "bad" + i, ErrorCode.AUTH_FAILED);
            }
            assertThat(failCount("u_brute")).isEqualTo(MAX);

            assertLoginFails("u_brute", RAW_PWD, ErrorCode.ACCOUNT_LOCKED);
            assertLoginFails("u_brute", "bad-more", ErrorCode.AUTH_FAILED);
            assertThat(failCount("u_brute")).isEqualTo(MAX);
        }

        @Test
        @DisplayName("일반 사용자 잠금은 시간이 지나도 풀리지 않는다 — 관리자 잠금 해제 뒤 로그인된다")
        void normalUserLockNeedsAdmin() {
            seed("u_lock_old", 0, "Y");
            admin.update("UPDATE TB_MCM_SEC_USER SET LOCK_YN = 'Y', LOCK_CNT = 1, LOCK_AT = ?, PWD_FAIL_COUNT = ? WHERE USER_ID = 'u_lock_old'",
                    Timestamp.valueOf(LocalDateTime.now().minusDays(2)), MAX);
            assertLoginFails("u_lock_old", RAW_PWD, ErrorCode.ACCOUNT_LOCKED);

            ctx.getBean(McmSecUserRepository.class).unlockUser("u_lock_old");

            assertThat(authService.login(new LoginRequest("u_lock_old", RAW_PWD))).containsKey("accessToken");
            assertThat(failCount("u_lock_old")).isZero();
            assertThat(col("u_lock_old", "LOCK_YN")).isEqualTo("N");
        }

        @Test
        @DisplayName("성공 로그인 — PWD_FAIL_COUNT·LOCK_CNT 를 0 으로 되돌린다")
        void successResetsFailCount() {
            seed("u_ok", 3, "Y");
            admin.update("UPDATE TB_MCM_SEC_USER SET LOCK_CNT = 2 WHERE USER_ID = 'u_ok'");

            Map<String, Object> result = authService.login(new LoginRequest("u_ok", RAW_PWD));

            assertThat(result).containsKeys("accessToken", "refreshToken");
            assertThat(failCount("u_ok")).isZero();
            assertThat(col("u_ok", "LOCK_CNT")).isEqualTo("0");
        }

        @Test
        @DisplayName("업무 예외가 아닌 런타임 예외가 나면 쓰기도 롤백된다")
        void nonBusinessRuntimeExceptionStillRollsBack() {
            seed("u_boom", 3, "Y");
            when(userMappingRepository.findRoleGroupIdsByUserId(eq("u_boom")))
                    .thenThrow(new IllegalStateException("roles down"));

            assertThatThrownBy(() -> authService.login(new LoginRequest("u_boom", RAW_PWD)))
                    .isInstanceOf(IllegalStateException.class);

            assertThat(failCount("u_boom")).isEqualTo(3);
        }

        @Test
        @DisplayName("실패 경로에서 DB BUSY 가 나면 횟수 증가도 롤백된다 — 로그인 재시도 때 두 번 오르지 않는다")
        void busyOnFailurePathRollsBackIncrement() {
            seed(Config.BUSY_USER, 3, "Y");

            assertThatThrownBy(() -> authService.login(new LoginRequest(Config.BUSY_USER, "bad")))
                    .isInstanceOf(CannotAcquireLockException.class);

            assertThat(failCount(Config.BUSY_USER)).isEqualTo(3);
            assertThat(col(Config.BUSY_USER, "LOCK_YN")).isEqualTo("N");
        }
    }

    @Nested
    @DisplayName("SYSADMIN 시간 잠금(D15)")
    class SysadminTimedLock {

        @BeforeEach
        void sysadminRole() {
            when(userMappingRepository.findRoleGroupIdsByUserId(eq("u_sa"))).thenReturn(List.of("G_SA"));
            when(roleGroupMappingRepository.findRoleIdsByRoleGroupIdIn(anyList())).thenReturn(List.of("SYSADMIN"));
        }

        @Test
        @DisplayName("잠근 지 15분 안 — 맞는 비밀번호도 「N분 뒤 다시 시도」로 거절")
        void withinWindowRejected() {
            seed("u_sa", MAX, "Y");
            admin.update("UPDATE TB_MCM_SEC_USER SET LOCK_YN = 'Y', LOCK_CNT = 1, LOCK_AT = ? WHERE USER_ID = 'u_sa'",
                    Timestamp.valueOf(LocalDateTime.now().minusMinutes(5)));

            assertThatThrownBy(() -> authService.login(new LoginRequest("u_sa", RAW_PWD)))
                    .isInstanceOfSatisfying(BusinessException.class, ex -> {
                        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.ACCOUNT_LOCKED);
                        assertThat(ex.getMessage()).contains("분 뒤 다시 시도");
                    });
        }

        @Test
        @DisplayName("15분이 지나면 저절로 풀려 로그인되고 LOCK_CNT 가 0 이 된다")
        void afterWindowReleased() {
            seed("u_sa", MAX, "Y");
            admin.update("UPDATE TB_MCM_SEC_USER SET LOCK_YN = 'Y', LOCK_CNT = 1, LOCK_AT = ? WHERE USER_ID = 'u_sa'",
                    Timestamp.valueOf(LocalDateTime.now().minusMinutes(16)));

            assertThat(authService.login(new LoginRequest("u_sa", RAW_PWD))).containsKey("accessToken");
            assertThat(col("u_sa", "LOCK_YN")).isEqualTo("N");
            assertThat(col("u_sa", "LOCK_CNT")).isEqualTo("0");
        }

        @Test
        @DisplayName("두 번째 연속 잠금은 30분 — 16분 지나도 아직 잠김")
        void secondLockIsLonger() {
            seed("u_sa", MAX, "Y");
            admin.update("UPDATE TB_MCM_SEC_USER SET LOCK_YN = 'Y', LOCK_CNT = 2, LOCK_AT = ? WHERE USER_ID = 'u_sa'",
                    Timestamp.valueOf(LocalDateTime.now().minusMinutes(16)));

            assertLoginFails("u_sa", RAW_PWD, ErrorCode.ACCOUNT_LOCKED);
            assertThat(authService.minutesFor(1)).isEqualTo(15);
            assertThat(authService.minutesFor(2)).isEqualTo(30);
            assertThat(authService.minutesFor(9)).isEqualTo(60);
        }
    }

    @Nested
    @DisplayName("계정 상태 — 비밀번호가 맞을 때만 사유를 알린다")
    class States {

        @Test
        @DisplayName("관리자 비활성(USE_TP='N') — 맞으면 ACCOUNT_DISABLED, 틀리면 AUTH_FAILED")
        void suspended() {
            seed("u_susp", 0, "N");
            assertLoginFails("u_susp", RAW_PWD, ErrorCode.ACCOUNT_DISABLED);
            assertLoginFails("u_susp", "bad", ErrorCode.AUTH_FAILED);
        }

        @Test
        @DisplayName("인사 휴직(HR_ST='LEAVE') — ACCOUNT_DISABLED")
        void hrLeave() {
            seed("u_leave", 0, "Y");
            admin.update("UPDATE TB_MCM_SEC_USER SET HR_ST = 'LEAVE' WHERE USER_ID = 'u_leave'");
            assertLoginFails("u_leave", RAW_PWD, ErrorCode.ACCOUNT_DISABLED);
        }

        @Test
        @DisplayName("퇴직(USE_TP='N' + 기한일 지남) — 맞는 비밀번호도 일반 실패 문구(AUTH_FAILED)")
        void retired() {
            seed("u_ret", 0, "N");
            admin.update("UPDATE TB_MCM_SEC_USER SET END_ACTIVE_DATE = ? WHERE USER_ID = 'u_ret'",
                    Timestamp.valueOf(LocalDateTime.now().minusDays(3).withNano(0)));
            assertLoginFails("u_ret", RAW_PWD, ErrorCode.AUTH_FAILED);
        }

        @Test
        @DisplayName("기한만 지난 협력업체(USE_TP='Y') — ACCOUNT_DISABLED")
        void contractEnded() {
            seed("u_exp", 0, "Y");
            admin.update("UPDATE TB_MCM_SEC_USER SET END_ACTIVE_DATE = ? WHERE USER_ID = 'u_exp'",
                    Timestamp.valueOf(LocalDateTime.now().minusDays(1).withNano(0)));
            assertLoginFails("u_exp", RAW_PWD, ErrorCode.ACCOUNT_DISABLED);
        }
    }

    @Nested
    @DisplayName("임시 비밀번호(D9·D10)·사용 기간(D14)")
    class Passwords {

        @Test
        @DisplayName("마지막 변경일 빈칸 — 토큰 없이 PASSWORD_CHANGE_REQUIRED")
        void tempPassword() {
            seed("u_temp", 0, "Y");
            admin.update("UPDATE TB_MCM_SEC_USER_PWD SET LAST_PWD_CHNG_DATE = NULL, TEMP_PWD_EXPIRATION_DATE = ? WHERE USER_ID = 'u_temp'",
                    Timestamp.valueOf(LocalDateTime.now().plusHours(3)));
            assertLoginFails("u_temp", RAW_PWD, ErrorCode.PASSWORD_CHANGE_REQUIRED);
            assertLoginFails("u_temp", "bad", ErrorCode.AUTH_FAILED);
        }

        @Test
        @DisplayName("임시 만료일 지남 — TEMP_PASSWORD_EXPIRED")
        void tempExpired() {
            seed("u_temp_x", 0, "Y");
            admin.update("UPDATE TB_MCM_SEC_USER_PWD SET LAST_PWD_CHNG_DATE = NULL, TEMP_PWD_EXPIRATION_DATE = ? WHERE USER_ID = 'u_temp_x'",
                    Timestamp.valueOf(LocalDateTime.now().minusMinutes(1)));
            assertLoginFails("u_temp_x", RAW_PWD, ErrorCode.TEMP_PASSWORD_EXPIRED);
        }

        @Test
        @DisplayName("사용 기간(90일) 지남 — PASSWORD_EXPIRED. 만료 제외 표시가 있으면 들어간다")
        void expired() {
            seed("u_old", 0, "Y");
            admin.update("UPDATE TB_MCM_SEC_USER_PWD SET LAST_PWD_CHNG_DATE = ? WHERE USER_ID = 'u_old'",
                    Timestamp.valueOf(LocalDateTime.now().minusDays(95)));
            assertLoginFails("u_old", RAW_PWD, ErrorCode.PASSWORD_EXPIRED);

            admin.update("UPDATE TB_MCM_SEC_USER SET PWD_EXPIRY_EXEMPT_YN = 'Y' WHERE USER_ID = 'u_old'");
            assertThat(authService.login(new LoginRequest("u_old", RAW_PWD))).containsKey("accessToken");
        }

        @Test
        @DisplayName("만료 7일 안 — 토큰과 함께 passwordExpiresInDays")
        void warns() {
            seed("u_soon", 0, "Y");
            admin.update("UPDATE TB_MCM_SEC_USER_PWD SET LAST_PWD_CHNG_DATE = ? WHERE USER_ID = 'u_soon'",
                    Timestamp.valueOf(LocalDateTime.now().minusDays(85)));
            Map<String, Object> out = authService.login(new LoginRequest("u_soon", RAW_PWD));
            assertThat(out).containsKey("accessToken");
            assertThat(out.get("passwordExpiresInDays")).isEqualTo(5L);
        }
    }

    @Nested
    @DisplayName("토큰 갱신")
    class Refresh {

        @Test
        @DisplayName("잠금은 갱신을 막지 않는다 · 비활성은 막는다")
        void refreshRules() {
            seed("u_ref", 0, "Y");
            String refresh = (String) authService.login(new LoginRequest("u_ref", RAW_PWD)).get("refreshToken");

            admin.update("UPDATE TB_MCM_SEC_USER SET LOCK_YN = 'Y' WHERE USER_ID = 'u_ref'");
            assertThat(authService.refresh(refresh)).containsKey("accessToken");

            admin.update("UPDATE TB_MCM_SEC_USER SET USE_TP = 'N' WHERE USER_ID = 'u_ref'");
            assertThatThrownBy(() -> authService.refresh(refresh))
                    .isInstanceOfSatisfying(BusinessException.class,
                            ex -> assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.ACCOUNT_DISABLED));
        }
    }

    // ─────────────────────────────────────────────────────────────────────

    private static void assertLoginFails(String userId, String pwd, ErrorCode code) {
        assertThatThrownBy(() -> authService.login(new LoginRequest(userId, pwd)))
                .isInstanceOfSatisfying(BusinessException.class,
                        ex -> assertThat(ex.getErrorCode()).isEqualTo(code));
    }

    private static void seed(String userId, int failCount, String useTp) {
        admin.update("DELETE FROM TB_MCM_SEC_USER_PWD WHERE USER_ID = ?", userId);
        admin.update("DELETE FROM TB_MCM_SEC_USER WHERE USER_ID = ?", userId);
        admin.update("INSERT INTO TB_MCM_SEC_USER (USER_ID, USER_NM, USE_TP, PWD_FAIL_COUNT, LOCK_YN, LOCK_CNT) "
                        + "VALUES (?, ?, ?, ?, 'N', 0)",
                userId, userId, useTp, failCount);
        admin.update("INSERT INTO TB_MCM_SEC_USER_PWD (USER_ID, USER_ENC_PWD, LAST_PWD_CHNG_DATE) VALUES (?, ?, ?)",
                userId, Config.ENCODER.encode(RAW_PWD), Timestamp.valueOf(LocalDateTime.now()));
    }

    private static int failCount(String userId) {
        return admin.queryForObject("SELECT PWD_FAIL_COUNT FROM TB_MCM_SEC_USER WHERE USER_ID = ?", Integer.class, userId);
    }

    private static String col(String userId, String column) {
        return admin.queryForObject("SELECT TO_CHAR(" + column + ") FROM TB_MCM_SEC_USER WHERE USER_ID = ?", String.class, userId);
    }

    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true) // Spring Boot 기본과 같게 클래스 프록시
    @EnableJpaRepositories(
            basePackageClasses = SecUserPwdRepository.class,
            includeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE,
                    classes = {SecUserPwdRepository.class, SecUserRepository.class}))
    static class Config {

        static final PasswordEncoder ENCODER = new PasswordEncoder();
        static final String BUSY_USER = "u_busy";

        @Bean(destroyMethod = "close")
        DataSource dataSource() {
            return McmOraTestDb.appDataSource("login-lockout-test");
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            return McmOraTestDb.entityManagerFactory(dataSource, "default",
                    SecUser.class.getName(), SecUserPwd.class.getName());
        }

        @Bean
        PlatformTransactionManager transactionManager(EntityManagerFactory emf) {
            return new JpaTransactionManager(emf);
        }

        @Bean
        McmAccountReader mcmAccountReader() {
            return new McmAccountReader();
        }

        @Bean
        McmSecUserRepository cactusSecUserRepoMcmAdapter(SecUserPwdRepository secUserPwdRepository,
                                                         McmAccountReader accountReader) {
            // u_busy 만 횟수를 쓴 직후 DB 잠금 실패(CannotAcquireLockException)를 흉내 낸다(로그인 통째 재시도 시 이중 집계 확인용).
            return new McmSecUserRepository(secUserPwdRepository, accountReader) {
                @Override
                public void incrementTryCnt(String userId) {
                    super.incrementTryCnt(userId);
                    if (BUSY_USER.equals(userId)) throw new CannotAcquireLockException("시험용 잠금 획득 실패");
                }
            };
        }

        @Bean
        SecUserMappingRepository secUserMappingRepository() {
            return mock(SecUserMappingRepository.class);
        }

        @Bean
        SecRoleGroupMappingRepository secRoleGroupMappingRepository() {
            return mock(SecRoleGroupMappingRepository.class);
        }

        @Bean
        McmAuthService mcmAuthService(McmSecUserRepository secUserRepository,
                                      SecUserMappingRepository secUserMappingRepository,
                                      SecRoleGroupMappingRepository secRoleGroupMappingRepository) {
            CactusProperties properties = new CactusProperties();
            properties.getJwt().setSecret(Base64.getEncoder().encodeToString(
                    "login-lockout-test-secret-key-at-least-32-bytes".getBytes(StandardCharsets.UTF_8)));
            properties.getJwt().setIssuer("mcm-test");
            properties.getJwt().setAccessTokenExpiry(3600);
            properties.getJwt().setRefreshTokenExpiry(86400);
            properties.getSecurity().setMaxLoginFailures(MAX);
            McmPasswordProperties pwd = new McmPasswordProperties(); // 코드 기본값 — 90일·7일 알림
            return new McmAuthService(new JwtTokenProvider(properties), ENCODER, secUserRepository, properties,
                    secUserMappingRepository, secRoleGroupMappingRepository, secUserRepository,
                    new PasswordPolicyEvaluator(pwd), mock(SysadminLockAlert.class), List.of(15L, 30L, 60L));
        }
    }
}
