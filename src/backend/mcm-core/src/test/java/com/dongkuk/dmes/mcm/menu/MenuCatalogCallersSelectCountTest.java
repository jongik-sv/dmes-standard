package com.dongkuk.dmes.mcm.menu;

import com.dongkuk.dmes.mcm.audit.AuditLogger;
import com.dongkuk.dmes.mcm.common.event.MenuChangedEvent;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.entity.SecRoleMapping;
import com.dongkuk.dmes.mcm.favorite.dto.SecFavoriteSearchRequest;
import com.dongkuk.dmes.mcm.favorite.dto.SecFavoriteToggleRequest;
import com.dongkuk.dmes.mcm.favorite.entity.SecUserFavorite;
import com.dongkuk.dmes.mcm.favorite.repository.SecUserFavoriteFoldRepository;
import com.dongkuk.dmes.mcm.favorite.repository.SecUserFavoriteRepository;
import com.dongkuk.dmes.mcm.favorite.service.SecFavoriteService;
import com.dongkuk.dmes.mcm.repository.SecMenuFldLovRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecPermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalog;
import com.dongkuk.dmes.mcm.security.PasswordHasher;
import com.dongkuk.dmes.mcm.security.UserAccountRepository;
import com.dongkuk.dmes.mcm.security.dto.MyMenusRequest;
import com.dongkuk.dmes.mcm.security.password.PasswordPolicyEvaluator;
import com.dongkuk.dmes.mcm.security.service.SecUserService;
import com.dongkuk.dmes.mcm.startpgm.dto.SecStartPgmSearchRequest;
import com.dongkuk.dmes.mcm.startpgm.dto.SecStartPgmToggleRequest;
import com.dongkuk.dmes.mcm.startpgm.entity.SecUserStartPgm;
import com.dongkuk.dmes.mcm.startpgm.repository.SecUserStartPgmRepository;
import com.dongkuk.dmes.mcm.startpgm.service.SecStartPgmService;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import jakarta.persistence.EntityManagerFactory;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.persistenceunit.PersistenceManagedTypes;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 메뉴 카탈로그를 쓰는 호출부 4곳(내 메뉴·즐겨찾기·기본 화면·화면 사용 통계 메뉴 목록)이 실제 DB(Oracle 시험 PDB, 기준선 V1)에서
 * SEC_MENU·SEC_OBJ 를 몇 번 전수 SELECT 하는지 센다 — perf-mcm P3 근거.
 *
 * <p>Hibernate StatementInspector 로 WHERE 없는 {@code FROM MCMAPUSER.TB_MCM_SEC_MENU}·{@code TB_MCM_SEC_OBJ} 문장만 센다.
 * 바꾸기 전 코드는 호출마다 직접 findAll 했다: getMyMenus 2, searchFavorites 2, searchStartPgms 2, ScreenMenuCatalog.load 1
 * → 4곳 × 2회 = 14문장. 캐시 없는 카탈로그(TTL 0) 대조는 ScreenMenuCatalog 도 OBJECT 까지 읽어 16문장이다.
 *
 * <p>SEC_MENU·SEC_OBJ 저장소만 실제이고, 사용자·즐겨찾기·기본 화면 행·폴더 조회는 mock 이다(세는 대상이 아니다).
 */
@SpringJUnitConfig(MenuCatalogCallersSelectCountTest.Config.class)
class MenuCatalogCallersSelectCountTest {

    private static final Logger log = LoggerFactory.getLogger(MenuCatalogCallersSelectCountTest.class);

    @Autowired SecMenuRepository menuRepo;
    @Autowired SecObjRepository objRepo;

    MenuCatalog catalog;
    SecUserService secUserService;
    SecFavoriteService favoriteService;
    SecStartPgmService startPgmService;
    ScreenMenuCatalog screenMenuCatalog;

    @BeforeEach
    void setUp() {
        menuRepo.deleteAll();
        objRepo.deleteAll();
        menuRepo.save(menu("M_USER", "csa", "commUserMng", "사용자 관리"));
        menuRepo.save(menu("M_MENU", "csa", "commMenuMng", "메뉴 관리"));
        objRepo.save(obj("commUserMng", "mcm"));
        objRepo.save(obj("commMenuMng", "mcm"));
        useCatalog(new MenuCatalog(menuRepo, objRepo));
    }

    /** 카탈로그를 바꿔 끼우고 호출부 4곳을 다시 만든다. 카운터는 0 으로. */
    void useCatalog(MenuCatalog c) {
        catalog = c;
        SecurityIdentity identity = mock(SecurityIdentity.class);
        when(identity.currentUserId()).thenReturn("admin");
        when(identity.requireUserId()).thenReturn("admin"); // mock 은 인터페이스 default 메서드도 대역이다
        when(identity.hasAuthority("ROLE_SYSADMIN")).thenReturn(true);
        SecMenuFldLovRepository fldRepo = mock(SecMenuFldLovRepository.class);
        when(fldRepo.findAllForMyMenus()).thenReturn(List.of());
        secUserService = new SecUserService(
                mock(UserAccountRepository.class),
                mock(SecUserMappingRepository.class),
                mock(SecRoleGroupMappingRepository.class),
                mock(SecRoleMappingRepository.class),
                mock(SecPermRepository.class),
                catalog,
                fldRepo,
                mock(PasswordHasher.class),
                identity,
                mock(AuditLogger.class),
                mock(PasswordPolicyEvaluator.class),
                true); // 브레이크글라스 — 권한 매핑 없이 전체 leaf 를 보게 해 카탈로그 경로만 본다

        SecUserFavoriteRepository favRepo = mock(SecUserFavoriteRepository.class);
        SecUserFavorite fav = new SecUserFavorite();
        fav.setUserId("admin");
        fav.setFvtFoldId("FVT001");
        fav.setMenuId("M_USER");
        fav.setFullId("csa/commUserMng");
        fav.setFvtSeq(1);
        when(favRepo.findByUserId("admin")).thenReturn(new java.util.ArrayList<>(List.of(fav)));
        SecUserFavoriteFoldRepository foldRepo = mock(SecUserFavoriteFoldRepository.class);
        when(foldRepo.findByUserIdOrderByFvtFoldSeq("admin")).thenReturn(List.of());
        favoriteService = new SecFavoriteService(favRepo, foldRepo, catalog, identity);

        SecUserStartPgmRepository startRepo = mock(SecUserStartPgmRepository.class);
        SecUserStartPgm start = new SecUserStartPgm();
        start.setUserId("admin");
        start.setMenuId("M_MENU");
        start.setFullId("csa/commMenuMng");
        start.setStartSeq(1);
        when(startRepo.findByUserIdOrderByStartSeqAsc("admin")).thenReturn(List.of(start));
        when(startRepo.findByUserIdAndFullIdAndMenuId(anyString(), anyString(), anyString())).thenReturn(List.of());
        startPgmService = new SecStartPgmService(startRepo, catalog, identity);

        SecMenuNativeRepository nativeRepo = mock(SecMenuNativeRepository.class);
        when(nativeRepo.searchMenuFld()).thenReturn(List.of(Map.of("MENU_ID", "csa", "MENU_NM", "시스템관리")));
        screenMenuCatalog = new ScreenMenuCatalog(catalog, nativeRepo);

        COUNTER.reset();
    }

    /** 4곳을 한 번씩 — 각 호출부가 카탈로그의 메뉴명·시스템 코드를 그대로 쓰는지 확인하며 부른다. */
    void callAllOnce() {
        List<Map<String, Object>> myMenus = secUserService.getMyMenus(new MyMenusRequest());
        assertThat(myMenus).extracting(r -> r.get("menuNm")).containsExactlyInAnyOrder("사용자 관리", "메뉴 관리");
        assertThat(myMenus).allSatisfy(r -> assertThat(r.get("sysCd")).isEqualTo("mcm"));

        List<Map<String, Object>> favorites = favoriteService.searchFavorites(new SecFavoriteSearchRequest());
        assertThat(favorites).singleElement().satisfies(r -> {
            assertThat(r.get("menuNm")).isEqualTo("사용자 관리");
            assertThat(r.get("sysCd")).isEqualTo("mcm");
        });

        List<Map<String, Object>> starts = startPgmService.searchStartPgms(new SecStartPgmSearchRequest());
        assertThat(starts).singleElement().satisfies(r -> {
            assertThat(r.get("menuNm")).isEqualTo("메뉴 관리");
            assertThat(r.get("sysCd")).isEqualTo("mcm");
        });

        Map<String, ScreenMenuCatalog.MenuInfo> screens = screenMenuCatalog.load();
        assertThat(screens).containsOnlyKeys("csa/commUserMng", "csa/commMenuMng");
        assertThat(screens.get("csa/commMenuMng").menuPath()).isEqualTo("시스템관리");
    }

    @Test
    @DisplayName("[P3] 4곳을 각 2회 부르면 SEC_MENU·SEC_OBJ 전수 SELECT 는 첫 적재 한 번씩뿐이다 (바꾸기 전 14문장)")
    void cachedCatalog_loadsOnceForAllCallers() {
        callAllOnce();
        callAllOnce();

        log.info("[P3] 캐시 카탈로그: 4곳×2회 SEC_MENU 전수 SELECT={} SEC_OBJ 전수 SELECT={}", COUNTER.menu.get(), COUNTER.obj.get());
        assertThat(COUNTER.menu.get()).isEqualTo(1);
        assertThat(COUNTER.obj.get()).isEqualTo(1);
    }

    @Test
    @DisplayName("[P3 대조] 캐시 없는 카탈로그(TTL 0)는 호출마다 두 테이블을 읽는다 — 4곳×2회 = 16문장")
    void uncachedCatalog_loadsEveryCall() {
        useCatalog(new MenuCatalog(menuRepo, objRepo, Clock.systemUTC(), Duration.ZERO));
        callAllOnce();
        callAllOnce();

        log.info("[P3] 캐시 없음 대조: 4곳×2회 SEC_MENU 전수 SELECT={} SEC_OBJ 전수 SELECT={}", COUNTER.menu.get(), COUNTER.obj.get());
        assertThat(COUNTER.menu.get()).isEqualTo(8);
        assertThat(COUNTER.obj.get()).isEqualTo(8);
    }

    @Test
    @DisplayName("저장 이벤트 뒤에는 한 세트만 다시 읽고, 바뀐 메뉴명이 4곳 모두에 보인다")
    void menuChangedEvent_reloadsOneSetAndShowsNewName() {
        callAllOnce();
        SecMenu m = menuRepo.findById("M_USER").orElseThrow();
        m.setMenuNm("사용자 관리(새)");
        menuRepo.save(m);
        catalog.onChanged(new MenuChangedEvent(MenuChangedEvent.MENU));
        catalog.onChangedAfterCompletion(new MenuChangedEvent(MenuChangedEvent.MENU));
        COUNTER.reset();

        assertThat(secUserService.getMyMenus(new MyMenusRequest())).extracting(r -> r.get("menuNm"))
                .contains("사용자 관리(새)");
        assertThat(favoriteService.searchFavorites(new SecFavoriteSearchRequest()).get(0).get("menuNm"))
                .isEqualTo("사용자 관리(새)");
        assertThat(screenMenuCatalog.load().get("csa/commUserMng").menuNm()).isEqualTo("사용자 관리(새)");

        assertThat(COUNTER.menu.get()).isEqualTo(1);
        assertThat(COUNTER.obj.get()).isEqualTo(1);
    }

    @Test
    @DisplayName("즐겨찾기·기본 화면 토글의 메뉴 매칭도 카탈로그로 한다 — 두 토글이 전수 SELECT 를 더하지 않는다")
    void togglesMatchThroughCatalog() {
        callAllOnce();
        COUNTER.reset();

        SecFavoriteToggleRequest fav = new SecFavoriteToggleRequest();
        fav.setPageId("mcm:csa/commMenuMng");
        fav.setFvtFoldId("FVT001");
        assertThat(favoriteService.toggleFavorite(fav)).containsEntry("menuId", "M_MENU").containsEntry("favorited", true);

        SecStartPgmToggleRequest start = new SecStartPgmToggleRequest();
        start.setPageId("mcm:csa/commUserMng");
        assertThat(startPgmService.toggleStartPgm(start)).containsEntry("menuId", "M_USER").containsEntry("registered", true);

        assertThat(COUNTER.menu.get()).isZero();
        assertThat(COUNTER.obj.get()).isZero();
    }

    @Test
    @DisplayName("브레이크글라스 없이 사용자 A·B·A 순으로 내 메뉴를 부르면 같은 스냅샷을 써도 각자 권한 메뉴만 받고, 전수 SELECT 는 한 세트다")
    void myMenus_sharedSnapshotStillFiltersPerUser() {
        AtomicReference<String> currentUser = new AtomicReference<>();
        SecurityIdentity identity = mock(SecurityIdentity.class);
        when(identity.currentUserId()).thenAnswer(inv -> currentUser.get());
        when(identity.requireUserId()).thenAnswer(inv -> currentUser.get());
        // hasAuthority 는 mock 기본값 false — SYSADMIN 아님

        SecUserMappingRepository userMappingRepo = mock(SecUserMappingRepository.class);
        when(userMappingRepo.findRoleGroupIdsByUserId("userA")).thenReturn(List.of("RG_A"));
        when(userMappingRepo.findRoleGroupIdsByUserId("userB")).thenReturn(List.of("RG_B"));
        SecRoleGroupMappingRepository roleGroupRepo = mock(SecRoleGroupMappingRepository.class);
        when(roleGroupRepo.findRoleIdsByRoleGroupIdIn(List.of("RG_A"))).thenReturn(List.of("ROLE_A"));
        when(roleGroupRepo.findRoleIdsByRoleGroupIdIn(List.of("RG_B"))).thenReturn(List.of("ROLE_B"));
        SecRoleMappingRepository roleMappingRepo = mock(SecRoleMappingRepository.class);
        when(roleMappingRepo.findByRoleIdIn(Set.of("ROLE_A"))).thenReturn(List.of(roleMapping("ROLE_A", "commUserMng")));
        when(roleMappingRepo.findByRoleIdIn(Set.of("ROLE_B"))).thenReturn(List.of(roleMapping("ROLE_B", "commMenuMng")));
        SecMenuFldLovRepository fldRepo = mock(SecMenuFldLovRepository.class);
        when(fldRepo.findAllForMyMenus()).thenReturn(List.of());

        SecUserService filtered = new SecUserService(
                mock(UserAccountRepository.class),
                userMappingRepo,
                roleGroupRepo,
                roleMappingRepo,
                mock(SecPermRepository.class),
                catalog,
                fldRepo,
                mock(PasswordHasher.class),
                identity,
                mock(AuditLogger.class),
                mock(PasswordPolicyEvaluator.class),
                false); // 브레이크글라스 끔 — 역할 매핑 필터를 실제로 탄다

        currentUser.set("userA");
        List<Map<String, Object>> firstA = filtered.getMyMenus(new MyMenusRequest());
        currentUser.set("userB");
        List<Map<String, Object>> b = filtered.getMyMenus(new MyMenusRequest());
        currentUser.set("userA");
        List<Map<String, Object>> secondA = filtered.getMyMenus(new MyMenusRequest());

        assertThat(firstA).extracting(r -> r.get("objId")).containsExactly("commUserMng");
        assertThat(b).extracting(r -> r.get("objId")).containsExactly("commMenuMng");
        assertThat(secondA).isEqualTo(firstA);
        // 사용자별 필터 결과가 공유 스냅샷으로 새어 들어가지 않았다 — 카탈로그는 여전히 전수 두 행이다.
        assertThat(catalog.menus()).extracting(SecMenu::getMenuId).containsExactlyInAnyOrder("M_USER", "M_MENU");

        assertThat(COUNTER.menu.get()).isEqualTo(1);
        assertThat(COUNTER.obj.get()).isEqualTo(1);
    }

    static SecRoleMapping roleMapping(String roleId, String objectId) {
        SecRoleMapping rm = new SecRoleMapping();
        rm.setRoleId(roleId);
        rm.setObjectId(objectId);
        rm.setPermissionId("PERM_ALL");
        return rm;
    }

    static SecMenu menu(String menuId, String parent, String objectId, String nm) {
        SecMenu m = new SecMenu();
        m.setMenuId(menuId);
        m.setMenuSeq("1");
        m.setFullSeq(menuId.equals("M_USER") ? "1010100" : "1010110");
        m.setParentMenuId(parent);
        m.setObjectId(objectId);
        m.setMenuNm(nm);
        m.setUseTp("Y");
        m.setMenuViewYn("Y");
        return m;
    }

    static SecObj obj(String objectId, String systemCode) {
        SecObj o = new SecObj();
        o.setObjectId(objectId);
        o.setObjectNm(objectId);
        o.setSystemCode(systemCode);
        o.setUseTp("Y");
        return o;
    }

    static final SelectCounter COUNTER = new SelectCounter();

    /** WHERE 없는 SEC_MENU·SEC_OBJ 전수 SELECT 만 센다. */
    static final class SelectCounter implements StatementInspector {
        private static final Pattern MENU = Pattern.compile(
                "(?is)^\\s*select\\b.*\\bfrom\\s+MCMAPUSER\\.TB_MCM_SEC_MENU\\s+\\w+\\s*$");
        private static final Pattern OBJ = Pattern.compile(
                "(?is)^\\s*select\\b.*\\bfrom\\s+MCMAPUSER\\.TB_MCM_SEC_OBJ\\s+\\w+\\s*$");
        final AtomicInteger menu = new AtomicInteger();
        final AtomicInteger obj = new AtomicInteger();

        @Override
        public String inspect(String sql) {
            if (MENU.matcher(sql).matches()) menu.incrementAndGet();
            if (OBJ.matcher(sql).matches()) obj.incrementAndGet();
            return sql;
        }

        void reset() {
            menu.set(0);
            obj.set(0);
        }
    }

    @Configuration
    @EnableTransactionManagement
    @EnableJpaRepositories(
            basePackageClasses = SecMenuRepository.class,
            includeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE,
                    classes = {SecMenuRepository.class, SecObjRepository.class}))
    static class Config {

        @Bean
        DataSource dataSource() {
            return McmCoreOraTestDb.appDataSource("menucatalog");
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
            em.setDataSource(dataSource);
            em.setManagedTypes(PersistenceManagedTypes.of(SecMenu.class.getName(), SecObj.class.getName()));
            em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            // 앱 EMF 와 같은 Oracle 설정(hbm2ddl none — 표는 기준선이 만든다) + 전수 SELECT 계수기.
            em.setJpaProperties(McmCoreOraTestDb.jpaProperties(Map.<String, Object>of(
                    "hibernate.session_factory.statement_inspector", COUNTER)));
            return em;
        }

        @Bean
        PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
            return new JpaTransactionManager(entityManagerFactory);
        }
    }
}
