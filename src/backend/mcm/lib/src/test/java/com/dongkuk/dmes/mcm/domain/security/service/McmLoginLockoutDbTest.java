package com.dongkuk.dmes.mcm.domain.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
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
import jakarta.persistence.EntityManagerFactory;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
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
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 로그인 실패 횟수·계정 잠금이 실제 DB 에 남는지 — Oracle 시험 PDB(Flyway 기준선) + Hibernate + Spring 트랜잭션 프록시로 확인한다.
 *
 * <p>운영 JpaConfig 와 같은 Hibernate 설정({@link McmOraTestDb#jpaProperties})으로 {@code MCMAPUSER.} 접두 SQL 을 그대로 돌리고,
 * 운영 빈과 같은 {@link McmAuthService}({@code @Transactional login}) → {@link McmSecUserRepository}(REQUIRED 합류) 경로를 탄다.
 * {@code AuthServiceTest} 는 저장소를 mock 해 호출 여부만 보므로, 트랜잭션 롤백으로 쓰기가 사라지는 것은 여기서만 잡힌다.
 */
class McmLoginLockoutDbTest {

    private static final String RAW_PWD = "right-pwd";
    private static final int MAX = 5;

    private static AnnotationConfigApplicationContext ctx;
    private static AuthService authService;
    private static JdbcTemplate admin;
    private static SecUserMappingRepository userMappingRepository;

    @BeforeAll
    static void startContext() throws Exception {
        McmOraTestDb.resetSchemas();
        ctx = new AnnotationConfigApplicationContext(Config.class);
        authService = ctx.getBean(AuthService.class);
        admin = new JdbcTemplate(ctx.getBean(DataSource.class));
        userMappingRepository = ctx.getBean(SecUserMappingRepository.class);
        when(userMappingRepository.findRoleGroupIdsByUserId(anyString())).thenReturn(List.of());
    }

    @AfterAll
    static void stopContext() throws Exception {
        if (ctx != null) ctx.close();
    }

    @Test
    @DisplayName("틀린 비밀번호 — PWD_FAIL_COUNT 가 1 오른 채 DB 에 남는다")
    void wrongPasswordIncrementsFailCount() {
        seed("u_wrong1", 0, "Y");

        assertLoginFails("u_wrong1", "bad", ErrorCode.AUTH_FAILED);

        assertThat(failCount("u_wrong1")).isEqualTo(1);
        assertThat(useTp("u_wrong1")).isEqualTo("Y");
    }

    @Test
    @DisplayName("최대 횟수에 닿는 실패 — 횟수와 잠금(USE_TP='N')이 DB 에 남는다")
    void failureReachingMaxLocksAccount() {
        seed("u_wrong_max", MAX - 1, "Y");

        assertLoginFails("u_wrong_max", "bad", ErrorCode.AUTH_FAILED);

        assertThat(failCount("u_wrong_max")).isEqualTo(MAX);
        assertThat(useTp("u_wrong_max")).isEqualTo("N");
    }

    @Test
    @DisplayName("연속 실패로 잠긴 계정은 맞는 비밀번호로도 거부된다")
    void lockedAfterRepeatedFailuresRejectsRightPassword() {
        seed("u_brute", 0, "Y");

        for (int i = 0; i < MAX; i++) {
            assertLoginFails("u_brute", "bad" + i, ErrorCode.AUTH_FAILED);
        }

        assertThat(failCount("u_brute")).isEqualTo(MAX);
        // McmSecUserRepository 는 잠금을 USE_TP='N' 으로 표시하므로 비활성(ACCOUNT_DISABLED)으로 거부된다.
        assertLoginFails("u_brute", RAW_PWD, ErrorCode.ACCOUNT_DISABLED);
        assertThat(failCount("u_brute")).isEqualTo(MAX);
    }

    @Test
    @DisplayName("횟수가 이미 최대인 활성 계정 — 잠금 표시가 DB 에 남고 ACCOUNT_LOCKED 로 거부된다")
    void alreadyAtMaxIsLockedOnNextAttempt() {
        seed("u_at_max", MAX, "Y");

        assertLoginFails("u_at_max", RAW_PWD, ErrorCode.ACCOUNT_LOCKED);

        assertThat(useTp("u_at_max")).isEqualTo("N");
        assertThat(failCount("u_at_max")).isEqualTo(MAX);
    }

    @Test
    @DisplayName("성공 로그인 — PWD_FAIL_COUNT 를 0 으로 되돌린다")
    void successResetsFailCount() {
        seed("u_ok", 3, "Y");

        Map<String, Object> result = authService.login(new LoginRequest("u_ok", RAW_PWD));

        assertThat(result).containsKeys("accessToken", "refreshToken");
        assertThat(failCount("u_ok")).isZero();
    }

    @Test
    @DisplayName("성공 경로에서 업무 예외가 아닌 런타임 예외가 나면 횟수 초기화도 롤백된다")
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
        assertThat(useTp(Config.BUSY_USER)).isEqualTo("Y");
    }

    @Test
    @DisplayName("잠긴 계정(PWD_FAIL_COUNT=5)을 계정 재생성하면 다시 잠기지 않고 맞는 비밀번호로 로그인된다")
    void reRegisteredLockedAccountIsNotRelocked() {
        seed("u_rereg", 0, "Y");
        for (int i = 0; i < MAX; i++) {
            assertLoginFails("u_rereg", "bad" + i, ErrorCode.AUTH_FAILED);
        }
        assertThat(failCount("u_rereg")).isEqualTo(MAX);
        assertThat(useTp("u_rereg")).isEqualTo("N");

        // commUserMng 의 reRegCmUser 와 같은 호출(비밀번호 재설정은 시험 비밀번호를 그대로 둔다).
        SecUserRepository userRepository = ctx.getBean(SecUserRepository.class);
        new TransactionTemplate(ctx.getBean(PlatformTransactionManager.class)).executeWithoutResult(s ->
                userRepository.updateReRegUser("u_rereg", LocalDateTime.now().withNano(0),
                        LocalDateTime.of(9999, 12, 31, 23, 59, 59), "Y"));

        assertThat(failCount("u_rereg")).isZero();
        assertThat(authService.login(new LoginRequest("u_rereg", RAW_PWD))).containsKey("accessToken");
        assertThat(useTp("u_rereg")).isEqualTo("Y");
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
        admin.update("INSERT INTO TB_MCM_SEC_USER (USER_ID, USER_NM, USE_TP, PWD_FAIL_COUNT) VALUES (?, ?, ?, ?)",
                userId, userId, useTp, failCount);
        admin.update("INSERT INTO TB_MCM_SEC_USER_PWD (USER_ID, USER_ENC_PWD) VALUES (?, ?)",
                userId, Config.ENCODER.encode(RAW_PWD));
    }

    private static int failCount(String userId) {
        return admin.queryForObject("SELECT PWD_FAIL_COUNT FROM TB_MCM_SEC_USER WHERE USER_ID = ?", Integer.class, userId);
    }

    private static String useTp(String userId) {
        return admin.queryForObject("SELECT USE_TP FROM TB_MCM_SEC_USER WHERE USER_ID = ?", String.class, userId);
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
        McmSecUserRepository cactusSecUserRepoMcmAdapter(SecUserPwdRepository secUserPwdRepository) {
            // u_busy 만 횟수를 쓴 직후 DB 잠금 실패(CannotAcquireLockException)를 흉내 낸다(로그인 통째 재시도 시 이중 집계 확인용).
            return new McmSecUserRepository(secUserPwdRepository) {
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
            return new McmAuthService(new JwtTokenProvider(properties), ENCODER, secUserRepository, properties,
                    secUserMappingRepository, secRoleGroupMappingRepository);
        }
    }
}
