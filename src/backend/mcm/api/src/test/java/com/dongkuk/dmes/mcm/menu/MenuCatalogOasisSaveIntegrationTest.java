package com.dongkuk.dmes.mcm.menu;

import com.dongkuk.dmes.mcm.testdb.McmOraTestDb;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

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
import com.dongkuk.dmes.mcm.audit.AuditLogger;
import com.dongkuk.dmes.mcm.common.event.MenuChangedEvent;
import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.csa.commMenuMng.service.CommMenuMngService;
import com.dongkuk.dmes.mcm.csa.commObjMng.service.CommObjMngService;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.entity.SecRoleMapping;
import com.dongkuk.dmes.mcm.repository.SecMenuFldLovRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecPermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.security.PasswordHasher;
import com.dongkuk.dmes.mcm.security.UserAccountRepository;
import com.dongkuk.dmes.mcm.security.dto.MyMenusRequest;
import com.dongkuk.dmes.mcm.security.password.PasswordPolicyEvaluator;
import com.dongkuk.dmes.mcm.security.service.SecUserService;
import jakarta.persistence.EntityManagerFactory;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 메뉴 카탈로그 캐시가 OASIS 실제 경로의 저장 직후 다음 조회에 새·바뀐 메뉴를 보여 주는지 — 끝에서 끝 통합 시험.
 *
 * <p>운영과 같은 조립: {@link OasisAutoConfiguration#serviceStarter} (transactional + multi-tx, 기본 매니저 {@code txBiz}
 * = JPA) → {@link OasisServiceExecutor} → 실제 {@code services/csa/commMenuMng/commMenuMng.bpmn}·{@code commObjMng.bpmn}
 * → {@code commMenuMngService}·{@code commObjMngService}. DB 는 Oracle 시험 PDB(Flyway 기준선)이고 운영 {@code JpaConfig} 와 같은
 * Hibernate 설정(OracleDialect)으로 같은 SQL 을 돈다.
 * 메뉴를 읽는 쪽은 {@link SecUserService#getMyMenus}(내 메뉴) — 저장 전에 한 번 불러 캐시를 채운 뒤 시작한다.
 *
 * <p>이 시험이 판정하는 것:
 * <ol>
 *   <li>OASIS 트랜잭션 안에서 서비스가 이벤트를 낼 때 Spring 트랜잭션 동기화가 열려 있는가
 *       ({@code isSynchronizationActive}) — 그리고 fallback 없는 {@code AFTER_COMMIT} 시험 리스너가 실제로 한 번 불리는가.
 *       이것이 0 이면 커밋 뒤 무효화는 fallback 으로만 돌고 있다는 뜻이다.</li>
 *   <li>커밋 직전(BEFORE_COMMIT)에 다른 스레드가 커밋 전 데이터로 카탈로그를 다시 채워도, 커밋 뒤 무효화가 그것을 비워
 *       다음 조회가 새 데이터를 보는가 — 즉시 한 번 + 커밋 뒤 한 번 두 단계가 모두 필요하고 동작한다.</li>
 *   <li>이벤트를 낸 트랜잭션이 같은 트랜잭션에서 카탈로그를 채운 뒤 롤백돼도 트랜잭션 끝(AFTER_COMPLETION) 무효화가
 *       커밋 전 행이 담긴 스냅샷을 비우는가.</li>
 *   <li>OBJECT 저장은 SYSADMIN 매핑을 미리 넣어 {@link RoleChangedEvent} 가 나가지 않게 한다 — 반영이 새
 *       {@link MenuChangedEvent} 때문임을 보인다.</li>
 * </ol>
 *
 * <p>a8 3b(SpringTransactionHandler 교체) dev 머지 뒤에도 같은 {@code serviceStarter} 공개 메서드로 조립하므로 시험을 고치지
 * 않고 다시 돌려 확인한다.
 */
@Execution(ExecutionMode.SAME_THREAD)
class MenuCatalogOasisSaveIntegrationTest {

    private static AnnotationConfigApplicationContext ctx;
    private static OasisServiceExecutor executor;
    private static SecUserService secUserService;
    private static MenuCatalog catalog;
    private static Probe probe;
    private static TransactionTemplate tx;

    @BeforeAll
    static void startContext() throws Exception {
        // 메뉴 폴더(TB_MCM_SEC_MENU_FLD)를 포함한 스키마는 Flyway 기준선이 만든다(oracle-1007).
        McmOraTestDb.resetSchemas();
        ctx = new AnnotationConfigApplicationContext(Config.class);
        executor = new OasisServiceExecutor(starter(), ctx, new CactusRequestConverter(), new CactusResponseConverter());
        secUserService = ctx.getBean(SecUserService.class);
        catalog = ctx.getBean(MenuCatalog.class);
        probe = ctx.getBean(Probe.class);
        tx = new TransactionTemplate(ctx.getBean("transactionManager", PlatformTransactionManager.class));
    }

    @AfterAll
    static void stopContext() throws Exception {
        if (ctx != null) ctx.close();
    }

    @BeforeEach
    void seed() {
        JdbcTemplate jdbc = new JdbcTemplate(ctx.getBean(DataSource.class));
        jdbc.update("DELETE FROM TB_MCM_SEC_MENU_FLD");
        jdbc.update("INSERT INTO TB_MCM_SEC_MENU_FLD (MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, USE_TP, MENU_VIEW_YN)"
                + " VALUES ('mcm', '1', '공통관리', NULL, 'Y', 'Y')");
        jdbc.update("INSERT INTO TB_MCM_SEC_MENU_FLD (MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, USE_TP, MENU_VIEW_YN)"
                + " VALUES ('csa', '1', '시스템관리', 'mcm', 'Y', 'Y')");
        SecMenuRepository menus = ctx.getBean(SecMenuRepository.class);
        SecObjRepository objs = ctx.getBean(SecObjRepository.class);
        SecRoleMappingRepository mappings = ctx.getBean(SecRoleMappingRepository.class);
        tx.executeWithoutResult(s -> {
            mappings.deleteAll();
            menus.deleteAll();
            objs.deleteAll();
            objs.save(obj("commUserMng", "사용자 관리 화면", "mcm"));
            objs.save(obj("commMenuMng", "메뉴 관리 화면", "mcm"));
            menus.save(menu("M_USER", "사용자 관리", "commUserMng"));
            // SYSADMIN 매핑을 미리 둔다 → OBJECT update 가 RoleChangedEvent 를 내지 않는다.
            mappings.save(sysadmin("commUserMng"));
            mappings.save(sysadmin("commMenuMng"));
        });
        catalog.invalidate();
        probe.reset();
    }

    @Test
    @DisplayName("commMenuMng save(OASIS) 직후 내 메뉴에 새 메뉴·바뀐 메뉴명이 보이고, 커밋 뒤 무효화가 트랜잭션 동기화로 불린다")
    void commMenuMngSave_isVisibleOnNextRead() {
        // 저장 전 조회로 캐시를 채운다.
        assertThat(menuNames()).containsExactly("사용자 관리");
        probe.refillBeforeCommit = true;

        List<Map<String, Object>> rows = new ArrayList<>();
        rows.add(menuRow("C", "M_NEW", "2", "새 메뉴", "commMenuMng"));
        rows.add(menuRow("U", "M_USER", "1", "사용자 관리(바뀜)", "commUserMng"));
        CactusResponse res = executor.execute("commMenuMng", "save", gridRequest(rows));

        assertThat(res.getMeta().success()).as("응답 %s %s", res.getMeta().code(), res.getMeta().message()).isTrue();
        assertThat(menuNames()).containsExactly("사용자 관리(바뀜)", "새 메뉴");

        assertThat(probe.syncActiveAtPublish).as("서비스가 이벤트를 낼 때 Spring 트랜잭션 동기화가 열려 있다").containsExactly(true);
        assertThat(probe.afterCommitStrict.get()).as("fallback 없는 AFTER_COMMIT 리스너가 커밋 뒤 한 번 불린다").isEqualTo(1);
        assertThat(probe.refilledBeforeCommit)
                .as("커밋 직전 다른 스레드는 커밋 전 데이터로 캐시를 다시 채웠다 — 그래도 위 조회는 새 데이터다(커밋 뒤 무효화)")
                .containsExactly("사용자 관리");
        assertThat(probe.roleEvents.get()).isZero();
    }

    @Test
    @DisplayName("commObjMng save(OASIS) 직후 내 메뉴의 sysCd·objNm 이 바뀐다 — RoleChangedEvent 없이 MenuChangedEvent 만으로")
    void commObjMngSave_isVisibleOnNextRead() {
        Map<String, Object> before = myMenu("M_USER");
        assertThat(before).containsEntry("sysCd", "mcm").containsEntry("objNm", "사용자 관리 화면");
        probe.refillBeforeCommit = true;

        Map<String, Object> row = new HashMap<>();
        row.put("rowStatus", "U");
        row.put("OBJECT_ID", "commUserMng");
        row.put("OBJECT_NM", "사용자 관리 화면(바뀜)");
        row.put("SYSTEM_CODE", "mcs");
        row.put("USE_TP", "Y");
        CactusResponse res = executor.execute("commObjMng", "save", gridRequest(List.of(row)));

        assertThat(res.getMeta().success()).as("응답 %s %s", res.getMeta().code(), res.getMeta().message()).isTrue();
        assertThat(myMenu("M_USER")).containsEntry("sysCd", "mcs").containsEntry("objNm", "사용자 관리 화면(바뀜)");
        assertThat(probe.roleEvents.get()).as("SYSADMIN 매핑이 이미 있어 역할 이벤트는 없다").isZero();
        assertThat(probe.syncActiveAtPublish).containsExactly(true);
        assertThat(probe.afterCommitStrict.get()).isEqualTo(1);
        assertThat(probe.refilledObjectsBeforeCommit)
                .as("커밋 직전 다른 스레드는 커밋 전(옛) OBJECT 로 캐시를 다시 채웠다 — 그래도 위 조회는 새 데이터다(커밋 뒤 무효화)")
                .containsExactly("메뉴 관리 화면", "사용자 관리 화면");
    }

    @Test
    @DisplayName("이벤트를 낸 트랜잭션이 같은 트랜잭션에서 카탈로그를 채운 뒤 롤백돼도, 다음 조회에 롤백된 행이 남지 않는다")
    void rolledBackSave_doesNotLeaveUncommittedRowsInCatalog() {
        assertThat(menuNames()).containsExactly("사용자 관리");
        SecMenuRepository menus = ctx.getBean(SecMenuRepository.class);
        List<String> seenInTx = new ArrayList<>();

        tx.executeWithoutResult(s -> {
            menus.save(menu("M_ROLLBACK", "롤백될 메뉴", "commMenuMng"));
            ctx.publishEvent(new MenuChangedEvent(MenuChangedEvent.MENU));
            catalog.menus().stream().map(SecMenu::getMenuNm).sorted().forEach(seenInTx::add);
            s.setRollbackOnly();
        });

        assertThat(seenInTx).as("같은 트랜잭션의 적재는 커밋 전 행을 본다 — 이 스냅샷이 현재 세대로 저장된다")
                .containsExactly("롤백될 메뉴", "사용자 관리");
        assertThat(probe.afterCommitStrict.get()).as("롤백이라 AFTER_COMMIT 은 불리지 않는다").isZero();
        assertThat(menuNames()).as("롤백 뒤(AFTER_COMPLETION) 무효화로 다음 조회는 커밋된 행만 본다")
                .containsExactly("사용자 관리");
    }

    // ── 도우미 ──────────────────────────────────────────────────────────────────

    private static List<String> menuNames() {
        List<String> names = new ArrayList<>();
        for (Map<String, Object> r : secUserService.getMyMenus(new MyMenusRequest())) {
            if (r.get("objId") != null) names.add(String.valueOf(r.get("menuNm")));
        }
        Collections.sort(names);
        return names;
    }

    private static Map<String, Object> myMenu(String menuId) {
        return secUserService.getMyMenus(new MyMenusRequest()).stream()
                .filter(r -> menuId.equals(r.get("menuId"))).findFirst().orElseThrow();
    }

    private static Map<String, Object> menuRow(String status, String id, String seq, String nm, String objectId) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("rowStatus", status);
        row.put("MENU_ID", id);
        row.put("MENU_SEQ", seq);
        row.put("MENU_NM", nm);
        row.put("MENU_TP", "S");
        row.put("OBJECT_ID", objectId);
        row.put("USE_TP", "Y");
        row.put("MENU_VIEW_YN", "Y");
        row.put("PARENT_MENU_ID", "csa");
        return row;
    }

    private static CactusRequest gridRequest(List<Map<String, Object>> rows) {
        return new CactusRequest(new RequestMeta("admin", "M1"), new HashMap<>(), Map.of("master", new GridData(rows)));
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

    private static SecMenu menu(String id, String nm, String objectId) {
        SecMenu m = new SecMenu();
        m.setMenuId(id);
        m.setMenuSeq("00000001");
        m.setMenuNm(nm);
        m.setMenuTp("S");
        m.setObjectId(objectId);
        m.setUseTp("Y");
        m.setMenuViewYn("Y");
        m.setParentMenuId("csa");
        m.setStartActiveDate(LocalDateTime.of(2026, 1, 1, 0, 0));
        m.setEndActiveDate(LocalDateTime.of(9999, 12, 31, 0, 0));
        return m;
    }

    private static SecObj obj(String id, String nm, String systemCode) {
        SecObj o = new SecObj();
        o.setObjectId(id);
        o.setObjectNm(nm);
        o.setSystemCode(systemCode);
        o.setUseTp("Y");
        o.setStartActiveDate(LocalDateTime.of(2026, 1, 1, 0, 0));
        o.setEndActiveDate(LocalDateTime.of(9999, 12, 31, 0, 0));
        return o;
    }

    private static SecRoleMapping sysadmin(String objectId) {
        SecRoleMapping m = new SecRoleMapping();
        m.setRoleId("SYSADMIN");
        m.setObjectId(objectId);
        m.setPermissionId("PERM_ALL");
        return m;
    }

    /**
     * 시험 관측용 리스너.
     * <ul>
     *   <li>발행 시점의 트랜잭션 동기화 여부</li>
     *   <li>fallback 없는 AFTER_COMMIT 호출 수 — 트랜잭션 동기화로만 불린다</li>
     *   <li>BEFORE_COMMIT 에서 다른 스레드로 카탈로그를 다시 채운다(커밋 전 데이터) — 커밋 뒤 무효화가 필요한 상황을 만든다</li>
     * </ul>
     */
    static class Probe {
        final List<Boolean> syncActiveAtPublish = Collections.synchronizedList(new ArrayList<>());
        final AtomicInteger afterCommitStrict = new AtomicInteger();
        final AtomicInteger roleEvents = new AtomicInteger();
        final List<String> refilledBeforeCommit = Collections.synchronizedList(new ArrayList<>());
        final List<String> refilledObjectsBeforeCommit = Collections.synchronizedList(new ArrayList<>());
        volatile boolean refillBeforeCommit;
        private final MenuCatalog catalog;

        Probe(MenuCatalog catalog) {
            this.catalog = catalog;
        }

        void reset() {
            syncActiveAtPublish.clear();
            afterCommitStrict.set(0);
            roleEvents.set(0);
            refilledBeforeCommit.clear();
            refilledObjectsBeforeCommit.clear();
            refillBeforeCommit = false;
        }

        @EventListener
        public void onPublish(MenuChangedEvent e) {
            syncActiveAtPublish.add(TransactionSynchronizationManager.isSynchronizationActive());
        }

        @EventListener
        public void onRole(RoleChangedEvent e) {
            roleEvents.incrementAndGet();
        }

        @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
        public void onAfterCommit(MenuChangedEvent e) {
            afterCommitStrict.incrementAndGet();
        }

        @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
        public void onBeforeCommit(MenuChangedEvent e) throws Exception {
            if (!refillBeforeCommit) return;
            // 다른 요청 스레드가 커밋 전에 카탈로그를 읽는 상황 — 이 스레드의 트랜잭션 밖이라 커밋된(옛) 데이터를 본다.
            MenuCatalog.Snapshot snap = CompletableFuture.supplyAsync(catalog::snapshot).get(10, TimeUnit.SECONDS);
            refilledBeforeCommit.addAll(snap.menus().stream().map(SecMenu::getMenuNm).sorted().toList());
            refilledObjectsBeforeCommit.addAll(snap.objects().stream().map(SecObj::getObjectNm).sorted().toList());
        }
    }

    @Configuration
    @EnableTransactionManagement
    @EnableJpaRepositories(
            basePackageClasses = SecMenuRepository.class,
            includeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {
                    SecMenuRepository.class, SecObjRepository.class, SecRoleMappingRepository.class}),
            transactionManagerRef = "transactionManager")
    @Import({SecMenuNativeRepository.class, SecMenuFldLovRepository.class})
    static class Config {

        @Bean(destroyMethod = "close")
        DataSource dataSource() {
            return McmOraTestDb.appDataSource("menu-catalog-oasis");
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            // 운영 JpaConfig 와 같은 구성(OracleDialect·ddl none). 네이티브 저장소의 @PersistenceContext(unitName = "default").
            return McmOraTestDb.entityManagerFactory(dataSource, "default",
                    SecMenu.class.getName(), SecObj.class.getName(), SecRoleMapping.class.getName());
        }

        /** OASIS 기본 매니저 txBiz = 운영의 primary JPA 매니저({@code transactionManager}) 별칭. */
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
                                            SecRoleMappingRepository mappings, ApplicationEventPublisher publisher) {
            return new CommObjMngService(objs, fld, mappings, publisher);
        }

        /** 내 메뉴 — SYSADMIN 브레이크글라스(권한 매핑 해석 없이 전체 leaf)로 카탈로그 경로만 본다. */
        @Bean
        SecUserService secUserService(MenuCatalog catalog, SecMenuFldLovRepository fld,
                                      SecRoleMappingRepository mappings) {
            SecurityIdentity admin = new SecurityIdentity() {
                @Override public String currentUserId() { return "admin"; }
                @Override public boolean hasAuthority(String authority) { return "ROLE_SYSADMIN".equals(authority); }
            };
            return new SecUserService(
                    mock(UserAccountRepository.class),
                    mock(SecUserMappingRepository.class),
                    mock(SecRoleGroupMappingRepository.class),
                    mappings,
                    mock(SecPermRepository.class),
                    catalog,
                    fld,
                    mock(PasswordHasher.class),
                    admin,
                    mock(AuditLogger.class),
                    mock(PasswordPolicyEvaluator.class),
                    true);
        }

        @Bean
        Probe probe(MenuCatalog catalog) {
            return new Probe(catalog);
        }
    }
}
