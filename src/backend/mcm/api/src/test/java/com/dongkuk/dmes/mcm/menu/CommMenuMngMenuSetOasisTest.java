package com.dongkuk.dmes.mcm.menu;

import com.dongkuk.dmes.cactus.oasis.CactusRequestConverter;
import com.dongkuk.dmes.cactus.oasis.CactusResponseConverter;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.request.GridData;
import com.dongkuk.dmes.cactus.web.request.RequestMeta;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.csa.commMenuMng.service.CommMenuMngService;
import com.dongkuk.dmes.mcm.csa.commObjMng.query.CommObjMngQuery;
import com.dongkuk.dmes.mcm.csa.commObjMng.service.CommObjMngService;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.entity.SecRoleMapping;
import com.dongkuk.dmes.mcm.entity.SecRolePerm;
import com.dongkuk.dmes.mcm.repository.CommPermQueryRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuFldLovRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecPermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRolePermRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.security.dto.MyMenusRequest;
import com.dongkuk.dmes.mcm.security.service.SecUserService;
import com.dongkuk.dmes.mcm.testdb.McmOraTestDb;
import jakarta.persistence.EntityManagerFactory;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * commMenuMng 메뉴 셋(2026-11-26) — 실제 {@code commMenuMng.bpmn} 을 OASIS 로 돌려 본다.
 *
 * <ul>
 *   <li>{@code search} 의 {@code cboMENUTP}(NULL MENU_TP = WEB)</li>
 *   <li>{@code searchUnplacedObj} 의 응답 {@code ds_unplacedObj}</li>
 *   <li>{@code save} 의 빈 MENU_ID 자동 부여와 FORM_URL 고정 — 그 뒤 메뉴를 다른 폴더로 옮겨도 내 메뉴 componentPath 가 그대로다</li>
 * </ul>
 * 조립은 {@link MenuCatalogOasisSaveIntegrationTest} 와 같다(운영 serviceStarter·Oracle 시험 PDB).
 */
@Execution(ExecutionMode.SAME_THREAD)
class CommMenuMngMenuSetOasisTest {

    private static AnnotationConfigApplicationContext ctx;
    private static OasisServiceExecutor executor;
    private static JdbcTemplate jdbc;

    @BeforeAll
    static void startContext() {
        McmOraTestDb.resetSchemas();
        ctx = new AnnotationConfigApplicationContext(Config.class);
        executor = new OasisServiceExecutor(starter(), ctx, new CactusRequestConverter(), new CactusResponseConverter());
        jdbc = new JdbcTemplate(ctx.getBean(DataSource.class));
    }

    @AfterAll
    static void stopContext() {
        if (ctx != null) ctx.close();
    }

    @BeforeEach
    void seed() {
        jdbc.update("DELETE FROM TB_MCM_SEC_ROLE_MAPPING");
        jdbc.update("DELETE FROM TB_MCM_SEC_MENU");
        jdbc.update("DELETE FROM TB_MCM_SEC_OBJ");
        jdbc.update("DELETE FROM TB_MCM_SEC_MENU_FLD");
        fld("mcm", "1", null);
        fld("csa", "1", "mcm");
        fld("cmq", "2", "mcm");
        obj("commUserMng", "사용자 관리 화면");
        obj("commMenuMng", "메뉴 관리 화면");
        obj("commObjMng", "OBJECT 관리 화면");
        menu("commUserMng", "commUserMng", null);     // MENU_TP NULL = WEB
        menu("M_USER_MOB", "commUserMng", "MOBIL");
        ctx.getBean(MenuCatalog.class).invalidate();
    }

    @Test
    @DisplayName("search — cboMENUTP=WEB 은 MENU_TP NULL 행, MOBIL 은 MOBIL 행만, 빈 값은 전체")
    void searchByMenuSet() {
        assertThat(menuIds(result("search", Map.of("cboMENUTP", "WEB")), "ds_menuList")).containsExactly("commUserMng");
        assertThat(menuIds(result("search", Map.of("cboMENUTP", "MOBIL")), "ds_menuList")).containsExactly("M_USER_MOB");
        assertThat(menuIds(result("search", Map.of("cboMENUTP", "")), "ds_menuList"))
                .containsExactlyInAnyOrder("commUserMng", "M_USER_MOB");
    }

    @Test
    @DisplayName("searchUnplacedObj — 셋에 놓이지 않은 OBJECT 만 ds_unplacedObj 로 (빈 셋은 WEB), 검색어 필터")
    @SuppressWarnings("unchecked")
    void searchUnplacedObj() {
        Map<String, Object> web = result("searchUnplacedObj", Map.of("cboMENUTP", ""));
        List<Map<String, Object>> rows = (List<Map<String, Object>>) web.get("ds_unplacedObj");
        assertThat(rows).extracting(r -> r.get("OBJECT_ID")).containsExactly("commMenuMng", "commObjMng");
        assertThat(rows.get(0)).containsOnlyKeys("OBJECT_ID", "OBJECT_NM", "SYSTEM_CODE", "OBJECT_TYPE", "FORM_URL")
                .containsEntry("OBJECT_NM", "메뉴 관리 화면").containsEntry("SYSTEM_CODE", "mcm");

        Map<String, Object> filtered = result("searchUnplacedObj", Map.of("cboMENUTP", "MOBIL", "edtOBJECTID", "objmng"));
        assertThat((List<Map<String, Object>>) filtered.get("ds_unplacedObj"))
                .extracting(r -> r.get("OBJECT_ID")).containsExactly("commObjMng");
    }

    @Test
    @DisplayName("save — 빈 MENU_ID 는 OBJECT_ID, 쓰이면 OBJECT_ID_MENU_TP. FORM_URL 이 고정돼 폴더를 옮겨도 componentPath 가 그대로")
    void saveAutoMenuIdAndStableCodePath() {
        CactusResponse res = executor.execute("commMenuMng", "save", grid(List.of(
                row("C", null, "commMenuMng", "WEB", "csa"),
                row("C", "", "commUserMng", "WEB", "csa"))));
        assertThat(res.getMeta().success()).as("%s %s", res.getMeta().code(), res.getMeta().message()).isTrue();

        assertThat(jdbc.queryForList("SELECT MENU_ID FROM TB_MCM_SEC_MENU", String.class))
                .containsExactlyInAnyOrder("commUserMng", "M_USER_MOB", "commMenuMng", "commUserMng_WEB");
        assertThat(formUrl("commMenuMng")).isEqualTo("csa/commMenuMng");
        assertThat(formUrl("commUserMng")).as("이미 놓여 있던 OBJECT 도 저장 때 고정된다").isEqualTo("csa/commUserMng");
        assertThat(componentPath("commMenuMng")).isEqualTo("csa/commMenuMng");

        // 메뉴를 다른 폴더(cmq)로 옮긴다 — 화면 코드 경로는 OBJECT 의 것이라 바뀌지 않는다.
        CactusResponse moved = executor.execute("commMenuMng", "save", grid(List.of(
                row("U", "commMenuMng", "commMenuMng", "WEB", "cmq"))));
        assertThat(moved.getMeta().success()).as("%s %s", moved.getMeta().code(), moved.getMeta().message()).isTrue();
        assertThat(jdbc.queryForObject("SELECT PARENT_MENU_ID FROM TB_MCM_SEC_MENU WHERE MENU_ID = 'commMenuMng'",
                String.class)).isEqualTo("cmq");
        assertThat(componentPath("commMenuMng")).isEqualTo("csa/commMenuMng");
    }

    @Test
    @DisplayName("save — 자동 MENU_ID 두 후보가 모두 쓰이면 직접 입력을 요구하는 오류로 끝나고 아무것도 저장하지 않는다")
    void saveAutoMenuIdRejected() {
        menu("commObjMng", "commObjMng", null);
        menu("commObjMng_MOBIL", "commObjMng", "MOBIL");

        CactusResponse res = executor.execute("commMenuMng", "save", grid(List.of(
                row("C", null, "commUserMng", "WEB", "csa"),
                row("C", null, "commObjMng", "MOBIL", "csa"))));

        assertThat(res.getMeta().success()).isFalse();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MCM_SEC_MENU WHERE MENU_ID = 'commUserMng_WEB'",
                Integer.class)).as("같은 묶음의 앞 행(자동 commUserMng_WEB)도 롤백").isZero();
    }

    // ── 도우미 ──────────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private static Map<String, Object> result(String action, Map<String, Object> params) {
        CactusResponse res = executor.execute("commMenuMng", action,
                new CactusRequest(new RequestMeta("admin", "commMenuMng"), new HashMap<>(params), Map.of()));
        assertThat(res.getMeta().success()).as("%s %s", res.getMeta().code(), res.getMeta().message()).isTrue();
        return (Map<String, Object>) res.getData().get("result");
    }

    @SuppressWarnings("unchecked")
    private static List<Object> menuIds(Map<String, Object> result, String key) {
        return ((List<Map<String, Object>>) result.get(key)).stream().map(r -> r.get("MENU_ID")).toList();
    }

    private static String formUrl(String objectId) {
        return jdbc.queryForObject("SELECT FORM_URL FROM TB_MCM_SEC_OBJ WHERE OBJECT_ID = ?", String.class, objectId);
    }

    private static Object componentPath(String menuId) {
        ctx.getBean(MenuCatalog.class).invalidate();
        return ctx.getBean(SecUserService.class).getMyMenus(new MyMenusRequest()).stream()
                .filter(r -> menuId.equals(r.get("menuId"))).findFirst().orElseThrow().get("componentPath");
    }

    private static CactusRequest grid(List<Map<String, Object>> rows) {
        return new CactusRequest(new RequestMeta("admin", "commMenuMng"), new HashMap<>(),
                Map.of("master", new GridData(rows)));
    }

    private static Map<String, Object> row(String status, String menuId, String objectId, String menuTp, String parent) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("rowStatus", status);
        row.put("MENU_ID", menuId);
        row.put("MENU_SEQ", "1");
        row.put("MENU_NM", objectId + " 메뉴");
        row.put("MENU_TP", menuTp);
        row.put("OBJECT_ID", objectId);
        row.put("USE_TP", "Y");
        row.put("MENU_VIEW_YN", "Y");
        row.put("PARENT_MENU_ID", parent);
        return row;
    }

    private static void fld(String id, String seq, String parent) {
        jdbc.update("INSERT INTO TB_MCM_SEC_MENU_FLD (MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, USE_TP, MENU_VIEW_YN)"
                + " VALUES (?, ?, ?, ?, 'Y', 'Y')", id, seq, id + " 폴더", parent);
    }

    private static void obj(String id, String nm) {
        jdbc.update("INSERT INTO TB_MCM_SEC_OBJ (OBJECT_ID, OBJECT_NM, SYSTEM_CODE, USE_TP, ACCESS_TP, START_ACTIVE_DATE, END_ACTIVE_DATE)"
                + " VALUES (?, ?, 'mcm', 'Y', '내부', ?, ?)", id, nm,
                LocalDateTime.of(2026, 1, 1, 0, 0), LocalDateTime.of(9999, 12, 31, 0, 0));
    }

    private static void menu(String id, String objectId, String menuTp) {
        jdbc.update("INSERT INTO TB_MCM_SEC_MENU (MENU_ID, MENU_SEQ, MENU_NM, MENU_TP, OBJECT_ID, USE_TP, MENU_VIEW_YN, PARENT_MENU_ID)"
                + " VALUES (?, '00000001', ?, ?, ?, 'Y', 'Y', 'csa')", id, id + " 메뉴", menuTp, objectId);
    }

    /** 운영과 같은 조립 — {@link OasisAutoConfiguration#serviceStarter} 의 transactional + multi-tx 분기. */
    private static com.dongkuk.oasis.service.ServiceStarter starter() {
        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath("/services");
        CactusTxProperties txProps = new CactusTxProperties();
        txProps.getManagers().put("txBiz", new CactusTxProperties.TxMgrConfig());
        txProps.setDefaultManager("txBiz");
        return new OasisAutoConfiguration().serviceStarter(props, txProps, ctx);
    }

    @Configuration
    @EnableTransactionManagement
    @EnableJpaRepositories(
            basePackageClasses = SecMenuRepository.class,
            includeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {
                    SecMenuRepository.class, SecObjRepository.class, SecRoleMappingRepository.class,
                    SecRolePermRepository.class}),
            transactionManagerRef = "transactionManager")
    @Import({SecMenuNativeRepository.class, SecMenuFldLovRepository.class,
            CommPermQueryRepository.class, CommObjMngQuery.class})
    static class Config {

        @Bean(destroyMethod = "close")
        DataSource dataSource() {
            return McmOraTestDb.appDataSource("menu-set-oasis");
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            return McmOraTestDb.entityManagerFactory(dataSource, "default",
                    SecMenu.class.getName(), SecObj.class.getName(), SecRoleMapping.class.getName(),
                    SecRolePerm.class.getName());
        }

        @Bean(name = {"transactionManager", "txBiz"})
        PlatformTransactionManager transactionManager(EntityManagerFactory emf) {
            return new JpaTransactionManager(emf);
        }

        @Bean
        MenuCatalog menuCatalog(SecMenuRepository menus, SecObjRepository objs) {
            return new MenuCatalog(menus, objs);
        }

        @Bean
        CommMenuMngService commMenuMngService(SecMenuRepository menus, SecMenuNativeRepository nativeRepo,
                                              ApplicationEventPublisher publisher) {
            return new CommMenuMngService(menus, nativeRepo, publisher);
        }

        @Bean
        CommObjMngService commObjMngService(SecObjRepository objs, SecMenuFldLovRepository fld,
                                            SecRoleMappingRepository mappings, SecRolePermRepository rolePerms,
                                            CommPermQueryRepository permQuery, CommObjMngQuery objQuery,
                                            ApplicationEventPublisher publisher) {
            return new CommObjMngService(objs, fld, mappings, rolePerms, permQuery, objQuery, publisher);
        }

        /** 내 메뉴 — SYSADMIN 브레이크글라스(권한 매핑 해석 없이 전체 leaf)로 componentPath 만 본다. */
        @Bean
        SecUserService secUserService(MenuCatalog catalog, SecMenuFldLovRepository fld,
                                      SecRoleMappingRepository mappings) {
            SecurityIdentity admin = new SecurityIdentity() {
                @Override public String currentUserId() { return "admin"; }
                @Override public boolean hasAuthority(String authority) { return "ROLE_SYSADMIN".equals(authority); }
            };
            return new SecUserService(
                    mock(SecUserMappingRepository.class),
                    mock(SecRoleGroupMappingRepository.class),
                    mappings,
                    mock(SecPermRepository.class),
                    catalog,
                    fld,
                    admin,
                    true);
        }
    }
}
