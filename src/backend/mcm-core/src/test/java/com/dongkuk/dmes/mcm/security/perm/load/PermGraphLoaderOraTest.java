package com.dongkuk.dmes.mcm.security.perm.load;

import com.dongkuk.dmes.mcm.security.perm.MenuNode;
import com.dongkuk.dmes.mcm.security.perm.ObjMeta;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.RolePerm;
import com.dongkuk.dmes.mcm.security.perm.impl.DefaultPermResolver;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * perm-bench r2 — {@link V2PermGraphLoader}·{@link LegacyPermGraphLoader} 를 실제 Oracle(clone PDB)에서 돌린다.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 범위(사람·역할로 좁힘, objects·menus 는 늘 전체), 칸 읽기(USE_TP·유효 기간·토큰), 옛 줄 합치기(D11), IN 900개 나눔.
 * 표는 시험 앞뒤에 비운다.
 */
@SpringJUnitConfig(PermGraphLoaderOraTest.Config.class)
class PermGraphLoaderOraTest {

    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true)
    static class Config {
        @Bean DataSource dataSource() { return McmCoreOraTestDb.appDataSource("perm-loader"); }
        @Bean LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource ds) {
            return McmCoreOraTestDb.entityManagerFactory(ds, "com.dongkuk.dmes.mcm.entity");
        }
        @Bean PlatformTransactionManager transactionManager(EntityManagerFactory emf) { return new JpaTransactionManager(emf); }
        @Bean JdbcTemplate jdbcTemplate(DataSource ds) { return new JdbcTemplate(ds); }
        @Bean V2PermGraphLoader v2PermGraphLoader() { return new V2PermGraphLoader(); }
        @Bean LegacyPermGraphLoader legacyPermGraphLoader() { return new LegacyPermGraphLoader(); }
    }

    @Autowired V2PermGraphLoader v2;
    @Autowired LegacyPermGraphLoader legacy;
    @Autowired JdbcTemplate jdbc;

    private static final List<String> TABLES = List.of(
            "TB_MCM_SEC_ROLE_PERM", "TB_MCM_SEC_ROLE_MAPPING", "TB_MCM_SEC_PERM", "TB_MCM_SEC_USER_MAPPING",
            "TB_MCM_SEC_ROLEGROUP_MAPPING", "TB_MCM_SEC_ROLEGROUP", "TB_MCM_SEC_ROLE",
            "TB_MCM_SEC_MENU", "TB_MCM_SEC_MENU_FLD", "TB_MCM_SEC_OBJ");
    private static final LocalDateTime END = LocalDateTime.of(2026, 12, 31, 0, 0);

    @BeforeEach
    @AfterEach
    void clean() {
        for (String t : TABLES) jdbc.update("DELETE FROM MCMAPUSER." + t);
    }

    // ── 픽스처 ──
    private void obj(String id, String sys, String useTp, String btn, String popup) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_OBJ (OBJECT_ID, OBJECT_NM, SYSTEM_CODE, SERVICE, FORM_URL, PARAM, USE_TP, BTN_PERM, POPUP_PERM, END_ACTIVE_DATE) "
                + "VALUES (?, ?, ?, 'svc', '/u', 'p', ?, ?, ?, ?)", id, id, sys, useTp, btn, popup, Timestamp.valueOf(END));
    }

    private void role(String id, String useTp) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE (ROLE_ID, ROLE_NM, USE_TP, START_ACTIVE_DATE) VALUES (?, ?, ?, ?)",
                id, id, useTp, Timestamp.valueOf(LocalDateTime.of(2026, 1, 1, 0, 0)));
    }

    private void group(String id, String useTp, String... roles) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP (ROLE_GROUP_ID, ROLE_GROUP_NM, USE_TP) VALUES (?, ?, ?)", id, id, useTp);
        for (String r : roles) {
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (ROLE_GROUP_ID, ROLE_ID) VALUES (?, ?)", id, r);
        }
    }

    private void user(String id, String... groups) {
        for (String g : groups) {
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER_MAPPING (USER_ID, ROLE_GROUP_ID) VALUES (?, ?)", id, g);
        }
    }

    private void perm(String role, String obj, String btn, String popup) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_PERM (ROLE_ID, OBJECT_ID, BTN_PERM, POPUP_PERM, DATA_PERM) VALUES (?, ?, ?, ?, 'd1')",
                role, obj, btn, popup);
    }

    private void oldPerm(String id, String common, String custom, String action, String popup) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_PERM (PERMISSION_ID, PERMISSION_NM, PERMISSION_COMMON, PERMISSION_CUSTOM, PERMISSION_ACTION, POPUP_BTN, USE_TP) "
                + "VALUES (?, ?, ?, ?, ?, ?, 'N')", id, id, common, custom, action, popup);
    }

    private void oldMap(String role, String obj, String permId) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID) VALUES (?, ?, ?)", role, obj, permId);
    }

    private void fld(String id, String parent, String viewYn, String useTp) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD (MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, USE_TP, MENU_VIEW_YN) "
                + "VALUES (?, '1', ?, ?, ?, ?)", id, id, parent, useTp, viewYn);
    }

    private void menu(String id, String parent, String obj, String viewYn) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU (MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, OBJECT_ID, USE_TP, MENU_TP, MENU_VIEW_YN) "
                + "VALUES (?, '1', ?, ?, ?, 'Y', 'S', ?)", id, id, parent, obj, viewYn);
    }

    /** u1 → G1(R1, R2=N) · u2 → G2(N, R3) · R4 = 그룹 없음. objA·objB(MDM)·objOff(N). */
    private void baseV2() {
        obj("objA", "mcm", "Y", "search,save", "openPop");
        obj("objB", "MDM", "Y", "search", null);
        obj("objOff", null, "N", "search", null);
        role("R1", "Y");
        role("R2", "N");
        role("R3", "Y");
        role("R4", "Y");
        group("G1", "Y", "R1", "R2");
        group("G2", "N", "R3");
        user("u1", "G1");
        user("u2", "G2");
        perm("R1", "objA", " search , save,", "openPop");
        perm("R2", "objB", "search", null);
        perm("R3", "objB", "search", null);
        perm("R4", "objA", "save", null);
        fld("F_ROOT", null, "Y", "Y");
        fld("F_HID", "F_ROOT", "N", "Y");
        menu("M_A", "F_ROOT", "objA", "Y");
        menu("M_B", "F_HID", "objB", "N");
    }

    @Test
    @DisplayName("v2 loadForUsers: 사람·그룹·역할·퍼미션만 좁히고 objects·menus 는 전체")
    void v2ForUsers() {
        baseV2();
        PermGraph g = v2.loadForUsers(Set.of("u1"));

        assertThat(g.userGroups()).containsOnlyKeys("u1");
        assertThat(g.groupRoles()).containsOnlyKeys("G1");
        assertThat(g.roles()).containsOnlyKeys("R1", "R2");
        assertThat(g.groups()).containsOnlyKeys("G1");
        assertThat(g.rolePerms()).containsOnlyKeys("R1", "R2");
        assertThat(g.objects()).containsOnlyKeys("objA", "objB", "objOff");
        assertThat(g.menus()).extracting(MenuNode::menuId).containsExactlyInAnyOrder("F_ROOT", "F_HID", "M_A", "M_B");

        RolePerm p = g.rolePerms().get("R1").get("objA");
        assertThat(p.btnPerm()).containsExactly("search", "save");
        assertThat(p.popupPerm()).containsExactly("openPop");
        assertThat(p.dataPerm()).isEqualTo("d1");
        ObjMeta a = g.objects().get("objA");
        assertThat(a.systemCode()).isEqualTo("mcm");
        assertThat(a.btnPerm()).containsExactly("search", "save");
        assertThat(a.endActiveDate()).isEqualTo(END);
        assertThat(g.objects().get("objOff").systemCode()).isNull();
        assertThat(g.roles().get("R2").useTp()).isEqualTo("N");
        assertThat(g.roles().get("R1").startActiveDate()).isEqualTo(LocalDateTime.of(2026, 1, 1, 0, 0));
        MenuNode hid = g.menus().stream().filter(m -> m.menuId().equals("F_HID")).findFirst().orElseThrow();
        assertThat(hid.visible()).isFalse();
        assertThat(hid.parentMenuId()).isEqualTo("F_ROOT");
        assertThat(hid.objectId()).isNull();

        // resolver 와 이어 본다: R2 사용 안 함 → objB 빠짐
        assertThat(new DefaultPermResolver().actionsOf(g, "u1")).isEqualTo(Map.of("objA", Set.of("search", "save", "openPop")));
    }

    @Test
    @DisplayName("v2 loadForRoles: 역할이 든 그룹의 사람 전체 + 사람 없는 역할의 행도 싣는다")
    void v2ForRoles() {
        baseV2();
        PermGraph g = v2.loadForRoles(Set.of("R1", "R4"));

        assertThat(g.userGroups()).containsOnlyKeys("u1");
        assertThat(g.roles()).containsOnlyKeys("R1", "R2", "R4");
        assertThat(g.rolePerms()).containsKeys("R1", "R2", "R4");
        assertThat(g.objects()).hasSize(3);
    }

    @Test
    @DisplayName("v2 loadAll·빈 범위")
    void v2AllAndEmpty() {
        baseV2();
        PermGraph all = v2.loadAll();
        assertThat(all.userGroups()).containsOnlyKeys("u1", "u2");
        assertThat(all.rolePerms()).containsOnlyKeys("R1", "R2", "R3", "R4");
        assertThat(all.roles()).hasSize(4);

        PermGraph none = v2.loadForUsers(Set.of());
        assertThat(none.userGroups()).isEmpty();
        assertThat(none.rolePerms()).isEmpty();
        assertThat(none.objects()).hasSize(3);
        assertThat(none.menus()).hasSize(4);
    }

    @Test
    @DisplayName("IN 목록 900개 넘는 사람 수도 나눠 읽는다")
    void chunked() {
        obj("objA", "mcm", "Y", "search", null);
        role("R1", "Y");
        group("G1", "Y", "R1");
        perm("R1", "objA", "search", null);
        List<Object[]> rows = IntStream.range(0, 1900).mapToObj(i -> new Object[]{"user" + i, "G1"}).toList();
        jdbc.batchUpdate("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER_MAPPING (USER_ID, ROLE_GROUP_ID) VALUES (?, ?)", rows);
        Set<String> ids = IntStream.range(0, 1900).mapToObj(i -> "user" + i).collect(Collectors.toCollection(HashSet::new));

        assertThat(v2.loadForUsers(ids).userGroups()).hasSize(1900);
    }

    @Test
    @DisplayName("legacy: 옛 줄 여럿 = 행 하나, BTN = COMMON ∪ CUSTOM ∪ ACTION, POPUP = POPUP_BTN, 허용 값 = 옛 줄 전체 합집합")
    void legacyMerge() {
        obj("objA", "mcm", "Y", null, null);
        obj("objB", "mcm", "Y", null, null);
        role("R1", "Y");
        role("R9", "Y");
        group("G1", "Y", "R1");
        user("u1", "G1");
        oldPerm("P1", "search", "save", null, "openPop");
        oldPerm("P2", null, null, "approve,search", null);
        oldPerm("P3", "delete", null, null, "zoomPop");
        oldMap("R1", "objA", "P1");
        oldMap("R1", "objA", "P2");
        oldMap("R1", "objA", "P_GONE");   // 없는 퍼미션 = 건너뜀
        oldMap("R9", "objA", "P3");       // 다른 역할 줄도 허용 값에는 들어간다

        PermGraph g = legacy.loadForUsers(Set.of("u1"));

        assertThat(g.rolePerms()).containsOnlyKeys("R1");
        RolePerm p = g.rolePerms().get("R1").get("objA");
        assertThat(p.btnPerm()).containsExactly("search", "save", "approve");
        assertThat(p.popupPerm()).containsExactly("openPop");
        ObjMeta a = g.objects().get("objA");
        assertThat(a.btnPerm()).containsExactlyInAnyOrder("search", "save", "approve", "delete");
        assertThat(a.popupPerm()).containsExactlyInAnyOrder("openPop", "zoomPop");
        assertThat(g.objects().get("objB").btnPerm()).isEmpty();
        assertThat(new DefaultPermResolver().actionsOf(g, "u1"))
                .isEqualTo(Map.of("objA", Set.of("search", "save", "approve", "openPop")));
    }

    @Test
    @DisplayName("legacy 되돌림 = 옛 동작: 역할·그룹·오브젝트 USE_TP·유효 기간을 보지 않고, 없는 퍼미션 줄도 메뉴는 보인다")
    void legacyIgnoresUsage() {
        obj("objA", " ", "N", null, null);
        obj("objB", "mcm", "Y", null, null);
        role("R1", "N");
        group("G1", "N", "R1");
        user("u1", "G1");
        oldPerm("P1", "search", null, null, null);
        oldMap("R1", "objA", "P1");
        oldMap("R1", "objB", "P_GONE");   // 없는 퍼미션만 가리키는 줄

        PermGraph g = legacy.loadForUsers(Set.of("u1"));
        DefaultPermResolver resolver = new DefaultPermResolver();

        assertThat(g.roles().get("R1").useTp()).isEqualTo("Y");
        assertThat(g.groups().get("G1").useTp()).isEqualTo("Y");
        assertThat(g.objects().get("objA").useTp()).isEqualTo("Y");
        assertThat(g.objects().get("objA").systemCode()).isNull();   // 공백 SYSTEM_CODE = 없음(키는 mcm)
        assertThat(resolver.actionsOf(g, "u1")).isEqualTo(Map.of("objA", Set.of("search")));
        assertThat(resolver.visibleObjects(g, "u1")).containsExactlyInAnyOrder("objA", "objB");
    }

    @Test
    @DisplayName("legacy loadForRoles·loadAll")
    void legacyRolesAndAll() {
        obj("objA", "mcm", "Y", null, null);
        role("R1", "Y");
        role("R9", "Y");
        group("G1", "Y", "R1");
        user("u1", "G1");
        oldPerm("P1", "search", null, null, null);
        oldMap("R1", "objA", "P1");
        oldMap("R9", "objA", "P1");

        PermGraph byRole = legacy.loadForRoles(Set.of("R9"));
        assertThat(byRole.userGroups()).isEmpty();
        assertThat(byRole.rolePerms()).containsOnlyKeys("R9");
        PermGraph all = legacy.loadAll();
        assertThat(all.userGroups()).containsOnlyKeys("u1");
        assertThat(all.rolePerms()).containsOnlyKeys("R1", "R9");
    }

    @Test
    @DisplayName("null 범위 = 빈 범위(예외 없음)")
    void nullIds() {
        baseV2();
        assertThat(v2.loadForUsers(null).userGroups()).isEmpty();
        assertThat(v2.loadForRoles(null).rolePerms()).isEmpty();
        assertThat(v2.loadForUsers(null).objects()).hasSize(3);
    }
}
