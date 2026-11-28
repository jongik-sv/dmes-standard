package com.dongkuk.dmes.mcm.security.perm;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.menu.MenuCatalog;
import com.dongkuk.dmes.mcm.repository.SecMenuFldLovRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecPermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.security.dto.MyMenusRequest;
import com.dongkuk.dmes.mcm.security.endpoint.PermKey;
import com.dongkuk.dmes.mcm.security.endpoint.UserPermCache;
import com.dongkuk.dmes.mcm.security.perm.impl.DefaultPermResolver;
import com.dongkuk.dmes.mcm.security.perm.load.V2PermGraphLoader;
import com.dongkuk.dmes.mcm.security.service.SecUserService;
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
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * perm-bench r5 — 설명(explain)·메뉴 트리가 런타임과 같은 답을 내는지 실제 Oracle(clone PDB)에서 본다.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 표본 사용자 3명(SYSADMIN·MDM_STEWARD·일반).
 * <ol>
 *   <li>v2 끼리: {@code PermExplainService.explain} 의 허가 버튼 == {@code UserPermCache} 키 (차이 0)</li>
 *   <li>v2 끼리: {@code PermExplainService.userMenuTree} 의 보이는 줄·숨김 == {@code SecUserService.getMyMenus} (차이 0)</li>
 *   <li>v2 ↔ legacy 런타임: 키·화면 메뉴 차이는 의도된 차이(D35 사용 안 함·기간 밖, SYSADMIN D13)로만 나와야 한다.
 *       분류 안 된 차이 = 실패. 목록 = {@code build/perm-parity/r5-diff.txt}</li>
 * </ol>
 * 비활성 사용자(사용자 USE_TP·기간)는 이 모듈의 로더·런타임이 보지 않는다(로그인이 막음). bench-be explain 의 NO_ROLE 은 그 레인 시험 몫.
 * bench-be {@code searchMenuTree} 는 {@code userMenuTree} 를 그대로 내린다는 전제로 2번이 그 대조를 맡는다.
 */
@SpringJUnitConfig(PermExplainParityOraTest.Config.class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PermExplainParityOraTest {

    /** 호출마다 사용자를 바꿔 끼우는 SecurityIdentity. 권한 문자열은 없다(freepass 꺼짐). */
    static final class SwitchIdentity implements SecurityIdentity {
        volatile String userId;
        @Override public String currentUserId() { return userId; }
        @Override public boolean hasAuthority(String authority) { return false; }
    }

    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true)
    @EnableJpaRepositories(
            basePackageClasses = SecObjRepository.class,
            includeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {
                    SecUserMappingRepository.class, SecRoleGroupMappingRepository.class, SecRoleMappingRepository.class,
                    SecObjRepository.class, SecPermRepository.class, SecMenuRepository.class}))
    static class Config {
        @Bean DataSource dataSource() { return McmCoreOraTestDb.appDataSource("perm-explain-parity"); }
        @Bean LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource ds) {
            return McmCoreOraTestDb.entityManagerFactory(ds, "com.dongkuk.dmes.mcm.entity");
        }
        @Bean PlatformTransactionManager transactionManager(EntityManagerFactory emf) { return new JpaTransactionManager(emf); }
        @Bean JdbcTemplate jdbcTemplate(DataSource ds) { return new JdbcTemplate(ds); }
        @Bean V2PermGraphLoader v2PermGraphLoader() { return new V2PermGraphLoader(); }
        @Bean DefaultPermResolver permResolver() { return new DefaultPermResolver(); }
        @Bean PermExplainService permExplainService(V2PermGraphLoader l, DefaultPermResolver r) { return new PermExplainService(l, r); }
        @Bean SecMenuFldLovRepository secMenuFldLovRepository() { return new SecMenuFldLovRepository(); }
        @Bean MenuCatalog menuCatalog(SecMenuRepository m, SecObjRepository o) { return new MenuCatalog(m, o); }
        @Bean SwitchIdentity identity() { return new SwitchIdentity(); }
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired V2PermGraphLoader v2Loader;
    @Autowired DefaultPermResolver resolver;
    @Autowired PermExplainService explainService;
    @Autowired SecUserMappingRepository userMapping;
    @Autowired SecRoleGroupMappingRepository groupMapping;
    @Autowired SecRoleMappingRepository roleMapping;
    @Autowired SecObjRepository objRepo;
    @Autowired SecPermRepository permRepo;
    @Autowired MenuCatalog menuCatalog;
    @Autowired SecMenuFldLovRepository fldRepo;
    @Autowired SwitchIdentity identity;

    private static final List<String> TABLES = List.of(
            "TB_MCM_SEC_ROLE_PERM", "TB_MCM_SEC_ROLE_MAPPING", "TB_MCM_SEC_PERM", "TB_MCM_SEC_USER_MAPPING",
            "TB_MCM_SEC_ROLEGROUP_MAPPING", "TB_MCM_SEC_ROLEGROUP", "TB_MCM_SEC_ROLE",
            "TB_MCM_SEC_MENU", "TB_MCM_SEC_MENU_FLD", "TB_MCM_SEC_OBJ");

    private static final List<String> USERS = List.of("pxAdm", "pxStw", "pxUsr");
    private static final String ADMIN = "pxAdm";
    private static final String BTN = "search,view,save";
    private static final String POPUP = "openPop";
    /** 사람마다 D35(역할·그룹·오브젝트 사용 안 함·기간 밖)로 legacy 에만 남는 오브젝트. */
    private static final Map<String, Set<String>> D35 = Map.of(
            "pxStw", Set.of("pxOff", "pxExp"),
            "pxUsr", Set.of("pxOff", "pxExp", "px3", "px4"));

    @BeforeAll
    void seed() {
        clean();
        LocalDateTime start = LocalDateTime.of(2026, 1, 1, 0, 0);
        LocalDateTime farEnd = LocalDateTime.of(2099, 12, 31, 0, 0);
        for (int i = 0; i < 10; i++) obj("px" + i, i % 2 == 0 ? "MDM" : null, "Y", farEnd);
        obj("pxOff", "mcm", "N", farEnd);
        obj("pxExp", "mcm", "Y", LocalDateTime.of(2020, 12, 31, 0, 0));

        fld("PXF0", null, "Y", "1");
        fld("PXF1", "PXF0", "Y", "1.1");
        fld("PXF2", "PXF0", "N", "1.2");
        fld("PXF3", "PXF0", "Y", "1.3"); // 보이는 화면이 없는 폴더
        for (int i = 0; i < 10; i++) {
            menu("PXM" + i, i == 8 ? "PXF2" : "PXF1", "px" + i, i == 9 ? "N" : "Y", "Y", String.format("2.%02d", i));
        }
        menu("PXMOFF", "PXF1", "pxOff", "Y", "Y", "2.20");
        menu("PXMEXP", "PXF1", "pxExp", "Y", "Y", "2.21");
        menu("PXMUNUSED", "PXF3", "px0", "Y", "N", "2.22"); // 화면 USE_TP=N → 어느 쪽도 안 보임

        oldPerm("PX_READ", "search,view", null, null, null);
        oldPerm("PX_EDIT", "search,view", "save", null, "openPop");

        role("SYSADMIN", "Y", start);
        role("MDM_STEWARD", "Y", start);
        role("PX_GENERAL", "Y", start);
        role("PX_EXTRA", "Y", start);
        role("PX_ROFF", "N", start);
        role("PX_RG", "Y", start);
        grant("SYSADMIN", false, "px0", "px1");
        grant("MDM_STEWARD", true, "px0", "px1", "px2", "px3", "px4", "px5");
        grant("PX_GENERAL", false, "px6", "px7", "px9", "pxOff", "pxExp");
        grant("PX_EXTRA", true, "px8");
        grant("PX_ROFF", true, "px3");
        grant("PX_RG", false, "px4");

        group("PXGA", "Y", "SYSADMIN");
        group("PXGM", "Y", "MDM_STEWARD", "PX_GENERAL");
        group("PXGU", "Y", "PX_GENERAL", "PX_EXTRA", "PX_ROFF");
        group("PXGOFF", "N", "PX_RG");
        user("pxAdm", "PXGA");
        user("pxStw", "PXGM");
        user("pxUsr", "PXGU", "PXGOFF");
        menuCatalog.invalidate();
    }

    @AfterAll
    void clean() {
        for (String t : TABLES) jdbc.update("DELETE FROM MCMAPUSER." + t);
        menuCatalog.invalidate();
    }

    // ── 픽스처 ──
    private void obj(String id, String sys, String useTp, LocalDateTime end) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_OBJ (OBJECT_ID, OBJECT_NM, SYSTEM_CODE, SERVICE, FORM_URL, PARAM, USE_TP, BTN_PERM, POPUP_PERM, END_ACTIVE_DATE) "
                + "VALUES (?, ?, ?, 'svc', '/u', 'p', ?, ?, ?, ?)", id, id, sys, useTp, BTN, POPUP, Timestamp.valueOf(end));
    }

    private void fld(String id, String parent, String useTp, String seq) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD (MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, USE_TP, MENU_VIEW_YN) "
                + "VALUES (?, ?, ?, ?, ?, 'Y')", id, seq, id, parent, useTp);
    }

    private void menu(String id, String parent, String obj, String viewYn, String useTp, String seq) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU (MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, OBJECT_ID, USE_TP, MENU_TP, MENU_VIEW_YN) "
                + "VALUES (?, ?, ?, ?, ?, ?, 'S', ?)", id, seq, id, parent, obj, useTp, viewYn);
    }

    private void oldPerm(String id, String common, String custom, String action, String popup) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_PERM (PERMISSION_ID, PERMISSION_NM, PERMISSION_COMMON, PERMISSION_CUSTOM, PERMISSION_ACTION, POPUP_BTN, USE_TP) "
                + "VALUES (?, ?, ?, ?, ?, ?, 'Y')", id, id, common, custom, action, popup);
    }

    private void role(String id, String useTp, LocalDateTime start) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE (ROLE_ID, ROLE_NM, USE_TP, START_ACTIVE_DATE) VALUES (?, ?, ?, ?)",
                id, id, useTp, Timestamp.valueOf(start));
    }

    private void group(String id, String useTp, String... roles) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP (ROLE_GROUP_ID, ROLE_GROUP_NM, USE_TP) VALUES (?, ?, ?)", id, id, useTp);
        for (String r : roles) {
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (ROLE_GROUP_ID, ROLE_ID) VALUES (?, ?)", id, r);
        }
    }

    private void user(String id, String... groups) {
        for (String g : groups) jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER_MAPPING (USER_ID, ROLE_GROUP_ID) VALUES (?, ?)", id, g);
    }

    /** 같은 권한을 옛 줄(ROLE_MAPPING)과 새 줄(ROLE_PERM)로 넣는다. */
    private void grant(String role, boolean edit, String... objs) {
        for (String o : objs) {
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID) VALUES (?, ?, ?)",
                    role, o, edit ? "PX_EDIT" : "PX_READ");
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_PERM (ROLE_ID, OBJECT_ID, BTN_PERM, POPUP_PERM, DATA_PERM) VALUES (?, ?, ?, ?, 'd1')",
                    role, o, edit ? BTN : "search,view", edit ? POPUP : null);
        }
    }

    // ── 런타임 ──
    private UserPermCache cache(boolean v2) {
        return v2
                ? new UserPermCache(userMapping, groupMapping, roleMapping, objRepo, permRepo, false, "v2", v2Loader, resolver)
                : new UserPermCache(userMapping, groupMapping, roleMapping, objRepo, permRepo, false);
    }

    private SecUserService userService(boolean v2) {
        return v2
                ? new SecUserService(userMapping, groupMapping, roleMapping, permRepo, menuCatalog, fldRepo, identity, false, "v2", v2Loader, resolver)
                : new SecUserService(userMapping, groupMapping, roleMapping, permRepo, menuCatalog, fldRepo, identity, false);
    }

    /** "objId/action" 꼴(objId 소문자, PermKey 와 같은 모양). */
    private static Set<String> keyStrings(Set<PermKey> keys) {
        return keys.stream().map(k -> k.objId() + "/" + k.action()).collect(Collectors.toCollection(TreeSet::new));
    }

    /** "menuId|hiddenYn" 꼴. */
    private List<String> myMenus(boolean v2, String userId) {
        identity.userId = userId;
        return userService(v2).getMyMenus(new MyMenusRequest()).stream()
                .map(r -> r.get("menuId") + "|" + r.get("hiddenYn")).sorted().toList();
    }

    private static Set<String> objectIdsOf(List<Map<String, Object>> rows) {
        return rows.stream().map(r -> (String) r.get("objId")).filter(o -> o != null).collect(Collectors.toCollection(TreeSet::new));
    }

    @Test
    @DisplayName("v2: explain 의 허가 버튼 == UserPermCache 키 (사람 3명 × 그래프의 모든 오브젝트)")
    void explainMatchesRuntimeKeys() {
        UserPermCache v2 = cache(true);
        PermGraph all = v2Loader.loadAll();
        for (String user : USERS) {
            Set<String> fromExplain = new TreeSet<>();
            for (String objectId : all.objects().keySet()) {
                Explain e = explainService.explain(user, objectId, null);
                for (ButtonVerdict b : e.buttons()) {
                    if (b.granted()) fromExplain.add(objectId.trim().toLowerCase() + "/" + b.code().toLowerCase());
                }
            }
            assertThat(fromExplain).as(user).isEqualTo(keyStrings(v2.loadAndCache(user))).isNotEmpty();
        }
    }

    @Test
    @DisplayName("v2: userMenuTree 의 보이는 줄·숨김 == SecUserService.getMyMenus")
    void menuTreeMatchesMyMenus() {
        for (String user : USERS) {
            List<String> fromTree = explainService.userMenuTree(user, null).stream()
                    .filter(PermExplainService.MenuTreeRow::visible)
                    .map(r -> r.menuId() + "|" + (r.hidden() ? "Y" : "N")).sorted().toList();
            assertThat(fromTree).as(user).isEqualTo(myMenus(true, user)).isNotEmpty();
        }
        // 숨김 화면은 내려가되 숨김 표시, 사용 안 함 폴더·빈 폴더는 안 내려간다
        assertThat(myMenus(true, "pxUsr")).contains("PXM9|Y").doesNotContain("PXF2|N", "PXF3|N");
    }

    @Test
    @DisplayName("v2 ↔ legacy 런타임: 키·화면 메뉴·버튼 차이는 D35·SYSADMIN 으로만 나온다")
    void v2VsLegacyOnlyIntendedDiffs() throws IOException {
        UserPermCache legacy = cache(false);
        UserPermCache v2 = cache(true);
        List<String> report = new ArrayList<>();
        List<String> unclassified = new ArrayList<>();
        Set<String> seenCategories = new TreeSet<>();
        for (String user : USERS) {
            Set<String> lk = keyStrings(legacy.loadAndCache(user));
            Set<String> vk = keyStrings(v2.loadAndCache(user));
            identity.userId = user;
            Set<String> lm = objectIdsOf(userService(false).getMyMenus(new MyMenusRequest()));
            Set<String> vm = objectIdsOf(userService(true).getMyMenus(new MyMenusRequest()));
            Set<String> lb = objectIdsOf(userService(false).getMyButtonEndpoints(new MyMenusRequest()));
            Set<String> vb = objectIdsOf(userService(true).getMyButtonEndpoints(new MyMenusRequest()));

            classify(user, "key", lk, vk, s -> s.substring(0, s.indexOf('/')), report, unclassified, seenCategories);
            classify(user, "menu", lm, vm, s -> s.toLowerCase(), report, unclassified, seenCategories);
            classify(user, "button", lb, vb, s -> s.toLowerCase(), report, unclassified, seenCategories);
        }
        Path out = Path.of("build", "perm-parity", "r5-diff.txt");
        Files.createDirectories(out.getParent());
        Files.write(out, report);
        System.out.println("[perm-r5] v2 vs legacy diffs (" + report.size() + ") → " + out.toAbsolutePath());
        report.forEach(l -> System.out.println("  " + l));

        assertThat(unclassified).as("분류 안 된 차이").isEmpty();
        // 픽스처가 두 갈래를 실제로 만들었는지(빈 대조 방지)
        assertThat(seenCategories).contains("D35", "SYSADMIN");
    }

    private static void classify(String user, String what, Set<String> legacy, Set<String> v2,
                                 java.util.function.Function<String, String> objOf,
                                 List<String> report, List<String> unclassified, Set<String> seen) {
        Set<String> d35 = D35.getOrDefault(user, Set.of()).stream().map(String::toLowerCase).collect(Collectors.toSet());
        for (String s : legacy) {
            if (v2.contains(s)) continue;
            String cat = ADMIN.equals(user) ? null : d35.contains(objOf.apply(s)) ? "D35" : null;
            line(user, what, "legacy-only", s, cat, report, unclassified, seen);
        }
        for (String s : v2) {
            if (legacy.contains(s)) continue;
            String cat = ADMIN.equals(user) ? "SYSADMIN" : null;
            line(user, what, "v2-only", s, cat, report, unclassified, seen);
        }
    }

    private static void line(String user, String what, String dir, String value, String cat,
                             List<String> report, List<String> unclassified, Set<String> seen) {
        String l = String.join("\t", cat == null ? "UNCLASSIFIED" : cat, user, what, dir, value);
        report.add(l);
        if (cat == null) unclassified.add(l);
        else seen.add(cat);
    }
}
