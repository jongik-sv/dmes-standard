package com.dongkuk.dmes.mcm.notice;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import com.dongkuk.dmes.mcm.common.audit.SecurityIdentityHolder;
import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.init.DataInitializer;
import com.dongkuk.dmes.mcm.repository.RuleMasterRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecPermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.security.endpoint.EndpointPermissionFilter;
import com.dongkuk.dmes.mcm.security.endpoint.PermKey;
import com.dongkuk.dmes.mcm.security.endpoint.UserPermCache;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Properties;
import java.util.Set;
import org.hibernate.jpa.HibernatePersistenceProvider;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 공지 화면(noticeMgmt·noticeBoard)의 권한 판정 시험 — 실제 SQLite 시드 + 실제 {@link UserPermCache} + 실제
 * {@link EndpointPermissionFilter} 를 묶어 확인한다(2026-10-07 notice-perm-test, notice-to-mcm 후속 LOW 9).
 *
 * <p>기존 필터 시험({@code EndpointPermissionFilter*Test})은 권한 캐시를 가짜로 끼워서 시드·캐시·필터가 이어지는 구간을 보지 못한다.
 * 여기서는 {@link DataInitializer} 가 빈 SQLite 에 시드한 OBJECT(noticeMgmt, SYSTEM_CODE=mcm)·{@code PERM_ALL} 위에
 * 역할 매핑 행을 직접 넣고 빼면서 판정이 바뀌는지 본다.
 * <ul>
 *   <li>noticeMgmt 의 search·save·delete — 권한 있는 사용자는 통과, 권한 없는 사용자는 403</li>
 *   <li>noticeBoard search — AUTH_ONLY 라 권한 행이 없는 로그인 사용자도 통과</li>
 *   <li>권한 부여·회수 — 캐시를 비워야 판정이 바뀐다(TTL 10분 동안은 이전 판정이 남는다)</li>
 *   <li>SYSTEM_CODE 가 mls 로 남은 옛 OBJECT 행 — 시드 보정 전에는 403, 보정(시드 재실행, 끝에서 캐시 무효화) 뒤에는 통과</li>
 * </ul>
 * 공용 로컬 DB·실서버를 건드리지 않도록 임시 SQLite 파일을 쓴다(DataInitializerSeedFingerprintTest 와 같은 구성).
 */
class NoticePermissionFilterTest {

    private static final String GRANTED = "notice-op";
    private static final String PLAIN = "notice-plain";

    private static Path dbFile;
    private static HikariDataSource dataSource;
    private static LocalContainerEntityManagerFactoryBean emfBean;
    private static EntityManagerFactory emf;
    private static DataInitializer initializer;
    private static JdbcTemplate jdbc;
    private static UserPermCache permCache;
    private static boolean prevInspectorSqlite;
    private static SecurityContext prevSecurityContext;
    private static SecurityIdentity prevIdentity;

    private final SecurityIdentity securityIdentity = mock(SecurityIdentity.class);

    @BeforeAll
    static void seedEmptySqlite() throws Exception {
        prevInspectorSqlite = McmAuditStatementInspector.isSqlite();
        prevIdentity = SecurityIdentityHolder.get();
        prevSecurityContext = SecurityContextHolder.getContext();
        SecurityIdentityHolder.set(null);
        SecurityContextHolder.clearContext();

        dbFile = Files.createTempFile("mcm-notice-perm", ".db");
        Files.delete(dbFile);
        dataSource = new HikariDataSource();
        dataSource.setJdbcUrl("jdbc:sqlite:" + dbFile);
        dataSource.setMaximumPoolSize(2);

        // JpaConfig#entityManagerFactory 의 SQLite 분기와 같은 구성(DataInitializerSeedFingerprintTest 와 동일).
        Properties props = new Properties();
        props.put("hibernate.dialect", "org.hibernate.community.dialect.SQLiteDialect");
        props.put("hibernate.hbm2ddl.auto", "update");
        props.put("hibernate.hbm2ddl.jdbc_metadata_extraction_strategy", "individually");
        props.put("hibernate.session_factory.statement_inspector", McmAuditStatementInspector.class.getName());
        McmAuditStatementInspector.setSqlite(true);
        props.put("hibernate.metadata_builder_contributor",
                "com.dongkuk.dmes.mcm.common.persistence.SqliteTemporalConverterContributor");

        emfBean = new LocalContainerEntityManagerFactoryBean();
        emfBean.setDataSource(dataSource);
        emfBean.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        emfBean.setJpaProperties(props);
        emfBean.setPersistenceUnitName("default");
        emfBean.setPackagesToScan(
                "com.dongkuk.dmes.cactus.security.auth",
                "com.dongkuk.dmes.cactus.mastercode",
                "com.dongkuk.dmes.mcm");
        emfBean.setPersistenceProviderClass(HibernatePersistenceProvider.class);
        emfBean.afterPropertiesSet();
        emf = emfBean.getObject();
        EntityManager sharedEm = SharedEntityManagerCreator.createSharedEntityManager(emf);
        JpaRepositoryFactory repos = new JpaRepositoryFactory(sharedEm);

        permCache = new UserPermCache(
                repos.getRepository(SecUserMappingRepository.class),
                repos.getRepository(SecRoleGroupMappingRepository.class),
                repos.getRepository(SecRoleMappingRepository.class),
                repos.getRepository(SecObjRepository.class),
                repos.getRepository(SecPermRepository.class),
                false);

        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("local");
        initializer = new DataInitializer(new PasswordEncoder(), env);
        SecMenuNativeRepository secMenuNativeRepository = new SecMenuNativeRepository();
        ReflectionTestUtils.setField(secMenuNativeRepository, "entityManager", sharedEm);
        ReflectionTestUtils.setField(initializer, "entityManager", sharedEm);
        ReflectionTestUtils.setField(initializer, "secMenuNativeRepository", secMenuNativeRepository);
        ReflectionTestUtils.setField(initializer, "ruleMasterRepository", repos.getRepository(RuleMasterRepository.class));
        ReflectionTestUtils.setField(initializer, "initEnabled", true);
        ReflectionTestUtils.setField(initializer, "userPermCache", permCache);
        runSeed();

        jdbc = new JdbcTemplate(dataSource);
    }

    @AfterAll
    static void tearDown() throws Exception {
        McmAuditStatementInspector.setSqlite(prevInspectorSqlite);
        SecurityIdentityHolder.set(prevIdentity);
        SecurityContextHolder.setContext(prevSecurityContext);
        if (emfBean != null) emfBean.destroy();
        if (dataSource != null) dataSource.close();
        if (dbFile != null) Files.deleteIfExists(dbFile);
    }

    private static void runSeed() {
        new TransactionTemplate(new JpaTransactionManager(emf)).executeWithoutResult(s -> initializer.run(null));
    }

    /**
     * 시험마다 같은 출발점 — 공지 OBJECT 는 mcm, GRANTED 만 역할그룹(RG_NOTICE_OP)과 noticeMgmt 권한 행이 있고, PLAIN 은 역할그룹이
     * 없으며, 캐시는 비어 있다. noticeBoard OBJECT 행은 시드가 만들지 않으므로(AUTH_ONLY) 10-02 에 잠시 시드됐던 잔존 행을 흉내 내 넣는다.
     */
    @BeforeEach
    void resetFixture() {
        jdbc.update("DELETE FROM TB_MCM_SEC_OBJ WHERE OBJECT_ID = 'noticeBoard'");
        jdbc.update("INSERT INTO TB_MCM_SEC_OBJ (OBJECT_ID, OBJECT_NM, SYSTEM_CODE, OBJECT_TYPE, USE_TP, ACCESS_TP) "
                + "VALUES ('noticeBoard', '공지 목록', 'mcm', 'web', 'Y', '내부')");
        jdbc.update("UPDATE TB_MCM_SEC_OBJ SET SYSTEM_CODE = 'mcm' WHERE OBJECT_ID = 'noticeMgmt'");
        jdbc.update("DELETE FROM TB_MCM_SEC_PERM WHERE PERMISSION_ID = 'PERM_NOTICE_SEARCH'");
        jdbc.update("DELETE FROM TB_MCM_SEC_ROLE_MAPPING WHERE ROLE_ID = 'NOTICE_OP'");
        jdbc.update("DELETE FROM TB_MCM_SEC_ROLEGROUP_MAPPING WHERE ROLE_GROUP_ID = 'RG_NOTICE_OP'");
        jdbc.update("DELETE FROM TB_MCM_SEC_USER_MAPPING WHERE USER_ID IN (?, ?)", GRANTED, PLAIN);
        jdbc.update("INSERT INTO TB_MCM_SEC_USER_MAPPING (USER_ID, ROLE_GROUP_ID) VALUES (?, 'RG_NOTICE_OP')", GRANTED);
        jdbc.update("INSERT INTO TB_MCM_SEC_ROLEGROUP_MAPPING (ROLE_GROUP_ID, ROLE_ID) VALUES ('RG_NOTICE_OP', 'NOTICE_OP')");
        grantNoticeMgmt();
        permCache.invalidateAll();
    }

    @AfterEach
    void logout() {
        SecurityContextHolder.clearContext();
    }

    private static void grantNoticeMgmt() {
        jdbc.update("INSERT INTO TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID) VALUES ('NOTICE_OP', 'noticeMgmt', 'PERM_ALL')");
    }

    private static void revokeNoticeMgmt() {
        jdbc.update("DELETE FROM TB_MCM_SEC_ROLE_MAPPING WHERE ROLE_ID = 'NOTICE_OP' AND OBJECT_ID = 'noticeMgmt'");
    }

    private EndpointPermissionFilter filter() {
        return new EndpointPermissionFilter(permCache, securityIdentity, "mcm", false);
    }

    /** userId 로 로그인한 상태에서 POST uri 가 필터를 지나면 true, 403 이면 false. */
    private boolean passes(String userId, String uri) throws Exception {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(userId, null, List.of()));
        when(securityIdentity.currentUserId()).thenReturn(userId);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", uri);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        filter().doFilter(request, response, chain);
        boolean passed = chain.getRequest() == request;
        assertThat(response.getStatus()).as("POST " + uri + " (" + userId + ")").isEqualTo(passed ? 200 : 403);
        return passed;
    }

    // ── (a) noticeMgmt search·save·delete ───────────────────────────────────

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"search", "save", "delete", "changeStatus"})
    @DisplayName("noticeMgmt — 권한 있는 사용자는 통과한다 (FE 4-segment · BFF→BE 두 모양)")
    void noticeMgmtAllowedForGranted(String action) throws Exception {
        assertThat(passes(GRANTED, "/api/mcm/oasis/noticeMgmt/" + action)).isTrue();
        assertThat(passes(GRANTED, "/oasis/noticeMgmt/" + action)).isTrue();
        assertThat(passes(GRANTED, "/mcm/oasis/noticeMgmt/" + action)).isTrue();
        assertThat(passes(GRANTED, "/api/mcm/noticeMgmt/" + action)).isTrue(); // 3-segment 컨벤션 URL
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"search", "save", "delete", "changeStatus"})
    @DisplayName("noticeMgmt — 권한 행이 없는 로그인 사용자는 403")
    void noticeMgmtDeniedForPlain(String action) throws Exception {
        assertThat(passes(PLAIN, "/api/mcm/noticeMgmt/" + action)).isFalse(); // 3-segment 컨벤션 URL
        assertThat(passes(PLAIN, "/api/mcm/oasis/noticeMgmt/" + action)).isFalse();
        assertThat(passes(PLAIN, "/oasis/noticeMgmt/" + action)).isFalse();
        assertThat(passes(PLAIN, "/mcm/oasis/noticeMgmt/" + action)).isFalse();
    }

    @Test
    @DisplayName("noticeMgmt — 다른 화면 권한만 가진 사용자는 403 (공지 권한키가 따로 있어야 한다)")
    void noticeMgmtDeniedForOtherObjectOnly() throws Exception {
        jdbc.update("INSERT INTO TB_MCM_SEC_USER_MAPPING (USER_ID, ROLE_GROUP_ID) VALUES (?, 'RG_NOTICE_OP')", PLAIN);
        revokeNoticeMgmt();
        jdbc.update("INSERT INTO TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID) VALUES ('NOTICE_OP', 'commObjMng', 'PERM_ALL')");
        permCache.invalidateAll();

        assertThat(passes(PLAIN, "/api/mcm/oasis/commObjMng/search")).isTrue();
        assertThat(passes(PLAIN, "/api/mcm/oasis/noticeMgmt/search")).isFalse();
    }

    @Test
    @DisplayName("noticeMgmt — action 단위로 판정한다: search 만 가진 사용자는 search 통과, save·delete 는 403")
    void noticeMgmtDecidedPerAction() throws Exception {
        jdbc.update("INSERT INTO TB_MCM_SEC_PERM (PERMISSION_ID, PERMISSION_NM, PERMISSION_ACTION, USE_TP) "
                + "VALUES ('PERM_NOTICE_SEARCH', '공지 조회만', 'search', 'Y')");
        jdbc.update("UPDATE TB_MCM_SEC_ROLE_MAPPING SET PERMISSION_ID = 'PERM_NOTICE_SEARCH' "
                + "WHERE ROLE_ID = 'NOTICE_OP' AND OBJECT_ID = 'noticeMgmt'");
        permCache.invalidateAll();

        assertThat(passes(GRANTED, "/api/mcm/oasis/noticeMgmt/search")).isTrue();
        assertThat(passes(GRANTED, "/api/mcm/noticeMgmt/search")).isTrue();
        assertThat(passes(GRANTED, "/api/mcm/oasis/noticeMgmt/save")).isFalse();
        assertThat(passes(GRANTED, "/api/mcm/oasis/noticeMgmt/delete")).isFalse();
        assertThat(passes(GRANTED, "/oasis/noticeMgmt/changeStatus")).isFalse();
    }

    @Test
    @DisplayName("noticeMgmt — 시드한 SYSADMIN(admin)도 PERM_ALL 로 search·save·delete 를 통과한다")
    void noticeMgmtAllowedForSeededAdmin() throws Exception {
        for (String action : List.of("search", "save", "delete", "changeStatus")) {
            assertThat(passes("admin", "/api/mcm/oasis/noticeMgmt/" + action)).as(action).isTrue();
        }
    }

    // ── (b) noticeBoard search ──────────────────────────────────────────────

    @Test
    @DisplayName("noticeBoard search — AUTH_ONLY 라 권한 행이 없는 로그인 사용자도 통과한다")
    void noticeBoardSearchAllowedForAnyLoggedInUser() throws Exception {
        assertThat(permCache.getPermissions(PLAIN)).isEmpty();
        assertThat(passes(PLAIN, "/api/mcm/oasis/noticeBoard/search")).isTrue();
        assertThat(passes(PLAIN, "/api/mcm/noticeBoard/search")).isTrue();
        assertThat(passes(PLAIN, "/oasis/noticeBoard/search")).isTrue();
        assertThat(passes(PLAIN, "/mcm/oasis/noticeBoard/search")).isTrue();
    }

    @Test
    @DisplayName("noticeBoard — AUTH_ONLY 는 search 하나뿐이다. 다른 action 은 권한이 없으면 403")
    void noticeBoardOtherActionsNotAuthOnly() throws Exception {
        for (String action : List.of("save", "delete")) {
            assertThat(passes(PLAIN, "/api/mcm/oasis/noticeBoard/" + action)).isFalse();
            assertThat(passes(PLAIN, "/api/mcm/noticeBoard/" + action)).isFalse();
            assertThat(passes(PLAIN, "/oasis/noticeBoard/" + action)).isFalse();
            assertThat(passes(PLAIN, "/mcm/oasis/noticeBoard/" + action)).isFalse();
        }
    }

    // ── (c) 권한 부여·회수와 캐시 비우기 ───────────────────────────────────

    @Test
    @DisplayName("권한 회수 — 캐시를 비우기 전에는 이전 판정이 남고, 비우면 403 으로 바뀐다")
    void revokeTakesEffectAfterInvalidate() throws Exception {
        assertThat(passes(GRANTED, "/api/mcm/oasis/noticeMgmt/save")).isTrue(); // 캐시 채움

        revokeNoticeMgmt();
        assertThat(passes(GRANTED, "/api/mcm/oasis/noticeMgmt/save")).as("캐시 유효 — 이전 판정").isTrue();

        permCache.invalidateAll();
        assertThat(passes(GRANTED, "/api/mcm/oasis/noticeMgmt/save")).isFalse();
        assertThat(passes(GRANTED, "/api/mcm/oasis/noticeMgmt/search")).isFalse();
    }

    @Test
    @DisplayName("권한 부여 — 캐시를 비우기 전에는 이전 판정(403)이 남고, 비우면 통과로 바뀐다")
    void grantTakesEffectAfterInvalidate() throws Exception {
        revokeNoticeMgmt();
        permCache.invalidateAll();
        assertThat(passes(GRANTED, "/api/mcm/oasis/noticeMgmt/search")).isFalse(); // 빈 판정이 캐시됨

        grantNoticeMgmt();
        assertThat(passes(GRANTED, "/api/mcm/oasis/noticeMgmt/search")).as("캐시 유효 — 이전 판정").isFalse();

        permCache.invalidate(GRANTED);
        assertThat(passes(GRANTED, "/api/mcm/oasis/noticeMgmt/search")).isTrue();
    }

    @Test
    @DisplayName("RoleChangedEvent(역할 변경 저장이 내는 이벤트)가 전체 캐시를 비워 판정이 바뀐다")
    void roleChangedEventInvalidatesCache() throws Exception {
        assertThat(passes(GRANTED, "/api/mcm/oasis/noticeMgmt/delete")).isTrue();
        revokeNoticeMgmt();

        permCache.onRoleChanged(new RoleChangedEvent(Set.of("NOTICE_OP")));

        assertThat(passes(GRANTED, "/api/mcm/oasis/noticeMgmt/delete")).isFalse();
    }

    @Test
    @DisplayName("권한키는 소문자 (mcm, oasis, noticemgmt, action) 로 만들어진다")
    void permKeysBuiltFromObject() {
        Set<PermKey> keys = permCache.getPermissions(GRANTED);
        assertThat(keys).contains(
                new PermKey("mcm", "oasis", "noticemgmt", "search"),
                new PermKey("mcm", "oasis", "noticemgmt", "save"),
                new PermKey("mcm", "oasis", "noticemgmt", "delete"),
                new PermKey("mcm", "oasis", "noticemgmt", "changestatus"));
    }

    // ── (d) SYSTEM_CODE 가 mls 로 남은 옛 OBJECT 행 ─────────────────────────

    @ParameterizedTest(name = "[{0}]")
    @ValueSource(strings = {"mls", "MLS", " mls "})
    @DisplayName("SYSTEM_CODE 가 mls 로 남은 공지 OBJECT — 보정 전에는 403, 시드 보정(끝의 캐시 무효화 포함) 뒤에는 mcm 으로 통과")
    void legacyMlsSystemCodeDeniedUntilSeedCorrection(String legacyCode) throws Exception {
        jdbc.update("UPDATE TB_MCM_SEC_OBJ SET SYSTEM_CODE = ? WHERE OBJECT_ID IN ('noticeMgmt', 'noticeBoard')", legacyCode);
        permCache.invalidateAll();

        assertThat(permCache.getPermissions(GRANTED))
                .contains(new PermKey("mls", "oasis", "noticemgmt", "search"))
                .doesNotContain(new PermKey("mcm", "oasis", "noticemgmt", "search"));
        assertThat(passes(GRANTED, "/api/mcm/oasis/noticeMgmt/search")).as("보정 전").isFalse();
        assertThat(passes(GRANTED, "/oasis/noticeMgmt/search")).as("보정 전, BFF→BE").isFalse();

        runSeed(); // 멱등 보정 + 끝에서 UserPermCache.invalidateAll()

        assertThat(jdbc.queryForList(
                "SELECT SYSTEM_CODE FROM TB_MCM_SEC_OBJ WHERE OBJECT_ID IN ('noticeMgmt', 'noticeBoard')", String.class))
                .containsOnly("mcm");
        assertThat(passes(GRANTED, "/api/mcm/oasis/noticeMgmt/search")).as("보정 뒤").isTrue();
        assertThat(passes(GRANTED, "/api/mcm/oasis/noticeMgmt/save")).as("보정 뒤").isTrue();
        assertThat(passes(GRANTED, "/oasis/noticeMgmt/delete")).as("보정 뒤, BFF→BE").isTrue();
        assertThat(passes(PLAIN, "/api/mcm/oasis/noticeMgmt/search")).as("권한 없는 사용자는 보정 뒤에도 403").isFalse();
    }

    @Test
    @DisplayName("시드 보정은 mls 가 아닌 값(사용자가 메뉴 관리에서 바꾼 값)을 건드리지 않는다")
    void seedCorrectionLeavesOtherSystemCodes() {
        jdbc.update("UPDATE TB_MCM_SEC_OBJ SET SYSTEM_CODE = 'mpp' WHERE OBJECT_ID = 'noticeBoard'");

        runSeed();

        assertThat(jdbc.queryForObject(
                "SELECT SYSTEM_CODE FROM TB_MCM_SEC_OBJ WHERE OBJECT_ID = 'noticeBoard'", String.class)).isEqualTo("mpp");
        assertThat(jdbc.queryForObject(
                "SELECT SYSTEM_CODE FROM TB_MCM_SEC_OBJ WHERE OBJECT_ID = 'noticeMgmt'", String.class)).isEqualTo("mcm");
    }
}
