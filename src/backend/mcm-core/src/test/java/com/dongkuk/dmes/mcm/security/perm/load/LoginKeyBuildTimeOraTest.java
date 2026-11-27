package com.dongkuk.dmes.mcm.security.perm.load;

import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecPermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.security.endpoint.PermKey;
import com.dongkuk.dmes.mcm.security.endpoint.UserPermCache;
import com.dongkuk.dmes.mcm.security.perm.impl.DefaultPermResolver;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * perm-bench r3 — 로그인 키 빌드 시간을 옛 경로(legacy 저장소)와 v2(V2PermGraphLoader + resolver)로 잰다.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: clone PDB 에 같은 권한을 옛 표(ROLE_MAPPING·SEC_PERM)와 새 표(ROLE_PERM) 양쪽으로 넣는다.
 * 오브젝트 1,000 · 폴더 50 · 메뉴 1,000 · 다른 사용자 2,000. 사용자 3명(SYSADMIN·MDM_STEWARD·일반).
 * 두 경로의 키가 같은지 확인하고, 사람마다 중앙값·p90 을 표준 출력에 남긴다. 시간 기준은 걸지 않는다(측정 기록용).
 */
@SpringJUnitConfig(LoginKeyBuildTimeOraTest.Config.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class LoginKeyBuildTimeOraTest {

    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true)
    @EnableJpaRepositories(
            basePackageClasses = SecObjRepository.class,
            includeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {
                    SecUserMappingRepository.class, SecRoleGroupMappingRepository.class, SecRoleMappingRepository.class,
                    SecObjRepository.class, SecPermRepository.class}))
    static class Config {
        @Bean DataSource dataSource() { return McmCoreOraTestDb.appDataSource("perm-login-time"); }
        @Bean LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource ds) {
            return McmCoreOraTestDb.entityManagerFactory(ds, "com.dongkuk.dmes.mcm.entity");
        }
        @Bean PlatformTransactionManager transactionManager(EntityManagerFactory emf) { return new JpaTransactionManager(emf); }
        @Bean JdbcTemplate jdbcTemplate(DataSource ds) { return new JdbcTemplate(ds); }
        @Bean V2PermGraphLoader v2PermGraphLoader() { return new V2PermGraphLoader(); }
    }

    @Autowired V2PermGraphLoader v2Loader;
    @Autowired JdbcTemplate jdbc;
    @Autowired SecUserMappingRepository userMapping;
    @Autowired SecRoleGroupMappingRepository groupMapping;
    @Autowired SecRoleMappingRepository roleMapping;
    @Autowired SecObjRepository objRepo;
    @Autowired SecPermRepository permRepo;

    private static final List<String> TABLES = List.of(
            "TB_MCM_SEC_ROLE_PERM", "TB_MCM_SEC_ROLE_MAPPING", "TB_MCM_SEC_PERM", "TB_MCM_SEC_USER_MAPPING",
            "TB_MCM_SEC_ROLEGROUP_MAPPING", "TB_MCM_SEC_ROLEGROUP", "TB_MCM_SEC_ROLE",
            "TB_MCM_SEC_MENU", "TB_MCM_SEC_MENU_FLD", "TB_MCM_SEC_OBJ");

    /** 1,000 이하로 둔다 — legacy {@code findAllById} 는 IN 목록을 나누지 않아 1,001 개부터 ORA-01795. */
    private static final int OBJECTS = 1000;
    private static final int FOLDERS = 50;
    private static final int OTHER_USERS = 2000;
    private static final String BTN = "search,view,save,reg,delete";
    private static final String POPUP = "openPop";
    private static final int WARMUP = 5;
    private static final int RUNS = 30;

    /** 사람 → 역할 묶음. SYSADMIN 은 freepass 없이도 v2 가 모든 허용 값을 주므로 옛 줄도 전체 오브젝트에 P_EDIT 로 둔다. */
    private static final Map<String, String> USERS = new LinkedHashMap<>();
    static {
        USERS.put("perfAdm", "GA");
        USERS.put("perfStw", "GM");
        USERS.put("perfUsr", "GU");
    }

    @BeforeAll
    void seed() {
        clean();
        LocalDateTime start = LocalDateTime.of(2026, 1, 1, 0, 0);
        LocalDateTime end = LocalDateTime.of(2099, 12, 31, 0, 0);

        List<Object[]> objs = new ArrayList<>();
        List<Object[]> menus = new ArrayList<>();
        for (int i = 0; i < OBJECTS; i++) {
            String id = obj(i);
            objs.add(new Object[]{id, id, i % 3 == 0 ? "MDM" : "mcm", POPUP, Timestamp.valueOf(end)});
            menus.add(new Object[]{"M" + i, "M" + i, "F" + (i % FOLDERS), id});
        }
        jdbc.batchUpdate("INSERT INTO MCMAPUSER.TB_MCM_SEC_OBJ (OBJECT_ID, OBJECT_NM, SYSTEM_CODE, SERVICE, FORM_URL, PARAM, USE_TP, BTN_PERM, POPUP_PERM, END_ACTIVE_DATE) "
                + "VALUES (?, ?, ?, 'svc', '/u', 'p', 'Y', '" + BTN + "', ?, ?)", objs);
        List<Object[]> flds = new ArrayList<>();
        for (int f = 0; f < FOLDERS; f++) flds.add(new Object[]{"F" + f, "F" + f});
        jdbc.batchUpdate("INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD (MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, FULL_SEQ, USE_TP, MENU_VIEW_YN) "
                + "VALUES (?, '1', ?, NULL, 1, 'Y', 'Y')", flds);
        jdbc.batchUpdate("INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU (MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, OBJECT_ID, USE_TP, MENU_TP, MENU_VIEW_YN) "
                + "VALUES (?, '1', ?, ?, ?, 'Y', 'S', 'Y')", menus);

        // 옛 퍼미션 두 개: 읽기(search,view) · 편집(네 칸 합 = BTN 전부 + 팝업)
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_PERM (PERMISSION_ID, PERMISSION_NM, PERMISSION_COMMON, PERMISSION_CUSTOM, PERMISSION_ACTION, POPUP_BTN, USE_TP) "
                + "VALUES ('P_READ', 'P_READ', 'search,view', NULL, NULL, NULL, 'Y')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_PERM (PERMISSION_ID, PERMISSION_NM, PERMISSION_COMMON, PERMISSION_CUSTOM, PERMISSION_ACTION, POPUP_BTN, USE_TP) "
                + "VALUES ('P_EDIT', 'P_EDIT', 'search,view', 'save,reg', 'delete', 'openPop', 'Y')");

        // 역할: SYSADMIN = 전체 · MDM_STEWARD = 0..399 · GENERAL = 0..59 · EXTRA = 500..529
        role("SYSADMIN", start);
        role("MDM_STEWARD", start);
        role("GENERAL", start);
        role("EXTRA", start);
        grant("SYSADMIN", 0, OBJECTS, true);
        grant("MDM_STEWARD", 0, 400, true);
        grant("GENERAL", 0, 60, false);
        grant("EXTRA", 500, 530, false);

        group("GA", "SYSADMIN");
        group("GM", "MDM_STEWARD", "GENERAL");
        group("GU", "GENERAL", "EXTRA");
        List<Object[]> um = new ArrayList<>();
        USERS.forEach((u, g) -> um.add(new Object[]{u, g}));
        String[] gs = {"GM", "GU"};
        for (int i = 0; i < OTHER_USERS; i++) um.add(new Object[]{"other" + i, gs[i % 2]});
        jdbc.batchUpdate("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER_MAPPING (USER_ID, ROLE_GROUP_ID) VALUES (?, ?)", um);
    }

    @AfterAll
    void clean() {
        for (String t : TABLES) jdbc.update("DELETE FROM MCMAPUSER." + t);
    }

    private static String obj(int i) { return "perfObj" + i; }

    private void role(String id, LocalDateTime start) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE (ROLE_ID, ROLE_NM, USE_TP, START_ACTIVE_DATE) VALUES (?, ?, 'Y', ?)",
                id, id, Timestamp.valueOf(start));
    }

    private void group(String id, String... roles) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP (ROLE_GROUP_ID, ROLE_GROUP_NM, USE_TP) VALUES (?, ?, 'Y')", id, id);
        for (String r : roles) {
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (ROLE_GROUP_ID, ROLE_ID) VALUES (?, ?)", id, r);
        }
    }

    /** 같은 권한을 옛 줄(ROLE_MAPPING)과 새 줄(ROLE_PERM)로 넣는다. */
    private void grant(String role, int from, int to, boolean edit) {
        List<Object[]> old = new ArrayList<>();
        List<Object[]> v2 = new ArrayList<>();
        for (int i = from; i < to; i++) {
            old.add(new Object[]{role, obj(i), edit ? "P_EDIT" : "P_READ"});
            v2.add(new Object[]{role, obj(i), edit ? BTN : "search,view", edit ? POPUP : null});
        }
        jdbc.batchUpdate("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID) VALUES (?, ?, ?)", old);
        jdbc.batchUpdate("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_PERM (ROLE_ID, OBJECT_ID, BTN_PERM, POPUP_PERM, DATA_PERM) VALUES (?, ?, ?, ?, 'd1')", v2);
    }

    private UserPermCache legacyCache() {
        return new UserPermCache(userMapping, groupMapping, roleMapping, objRepo, permRepo, false);
    }

    private UserPermCache v2Cache() {
        return new UserPermCache(userMapping, groupMapping, roleMapping, objRepo, permRepo, false, "v2",
                v2Loader, new DefaultPermResolver());
    }

    @Test
    @DisplayName("로그인 키 빌드: legacy 와 v2 의 키가 같고, 사람마다 시간을 남긴다")
    void measure() {
        UserPermCache legacy = legacyCache();
        UserPermCache v2 = v2Cache();
        StringBuilder report = new StringBuilder("\n[perm-r3] login key build time (ms) — objects=" + OBJECTS
                + " menus=" + OBJECTS + " folders=" + FOLDERS + " otherUsers=" + OTHER_USERS + " runs=" + RUNS + "\n");
        for (String user : USERS.keySet()) {
            Set<PermKey> a = legacy.loadAndCache(user);
            Set<PermKey> b = v2.loadAndCache(user);
            assertThat(b).as(user).isEqualTo(a).isNotEmpty();

            double[] lt = time(legacy, user);
            double[] vt = time(v2, user);
            report.append(String.format("%-8s keys=%5d | legacy median=%7.2f p90=%7.2f | v2 median=%7.2f p90=%7.2f%n",
                    user, a.size(), lt[0], lt[1], vt[0], vt[1]));
        }
        System.out.println(report);
    }

    /** 앞 {@link #WARMUP} 번은 버리고 {@link #RUNS} 번 잰다. 반환 = {중앙값, p90}. */
    private static double[] time(UserPermCache cache, String user) {
        for (int i = 0; i < WARMUP; i++) cache.loadAndCache(user);
        double[] ms = new double[RUNS];
        for (int i = 0; i < RUNS; i++) {
            long t0 = System.nanoTime();
            cache.loadAndCache(user);
            ms[i] = (System.nanoTime() - t0) / 1_000_000.0;
        }
        Arrays.sort(ms);
        return new double[]{ms[RUNS / 2], ms[(int) Math.ceil(RUNS * 0.9) - 1]};
    }
}
