package com.dongkuk.dmes.mcm.widget.service;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.dmes.mcm.widget.chat.entity.WidgetChatMessage;
import com.dongkuk.dmes.mcm.widget.chat.repository.WidgetChatMessageRepository;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTab;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTabItem;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabItemRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabRepository;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetDefaultTabs;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetFixedTabs;
import com.dongkuk.dmes.mcm.widget.memo.entity.WidgetMemo;
import com.dongkuk.dmes.mcm.widget.memo.repository.WidgetMemoRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import com.dongkuk.dmes.mcm.widget.repository.WidgetUserLookupRepository;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import org.mockito.Mockito;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.persistenceunit.PersistenceManagedTypes;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.annotation.Transactional;

/**
 * 연결 풀 고갈 재현 시험용 JPA 구성(oracle-1007 ③c) — {@code WidgetTabsJpaTestConfig} 와 같은 엔티티에, 앱처럼 풀 상한 3·쉬는 연결 0 과
 * 짧은 connectionTimeout({@value #CONNECTION_TIMEOUT_MS}ms)을 둔다. 부서 사슬·부서 이름은 대역이 아니라 실제 {@link DeptInfoRepository}
 * (Spring Data 기본 {@code findById} = readOnly 트랜잭션)로 읽어 운영의 연결 사용을 그대로 탄다. 사용자는 스레드마다 {@link #CURRENT_USER}.
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(basePackageClasses = {WidgetDefaultLayoutRepository.class, SecUserWidgetRepository.class,
        WidgetMemoRepository.class, WidgetChatMessageRepository.class})
@Import(SecWidgetPoolJpaTestConfig.DeptRepositoryConfig.class)
public class SecWidgetPoolJpaTestConfig {

    /** 앱 로컬 풀 상한(JpaConfig·application-local.yml)과 같다. */
    static final int POOL_SIZE = 3;
    static final long CONNECTION_TIMEOUT_MS = 4000;
    /** 요청 스레드의 사용자 — {@link SecurityIdentity} 대역이 읽는다. */
    static final ThreadLocal<String> CURRENT_USER = new ThreadLocal<>();
    /** 있으면 옛 행 이전 쓰기({@link SecWidgetTabWriter#moveTabs}) 트랜잭션 안에서 먼저 부른다 — 이전 순서를 시험이 정할 때만. */
    static final AtomicReference<Runnable> BEFORE_MOVE = new AtomicReference<>();

    /** {@link #BEFORE_MOVE} 를 부른 뒤 원래 이전을 한다. */
    static class GatedTabWriter extends SecWidgetTabWriter {
        GatedTabWriter(SecUserWidgetTabRepository tabRepository, SecUserWidgetRepository widgetRepository) {
            super(tabRepository, widgetRepository);
        }

        @Override
        @Transactional
        public int moveTabs(String userId, List<TabMove> moves) {
            Runnable hook = BEFORE_MOVE.get();
            if (hook != null) hook.run();
            return super.moveTabs(userId, moves);
        }
    }

    /** 공통 저장소 패키지에서는 부서 저장소만 올린다(그 패키지의 다른 엔티티는 이 EMF 에 없다). */
    @Configuration
    @EnableJpaRepositories(basePackageClasses = DeptInfoRepository.class,
            includeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = DeptInfoRepository.class))
    static class DeptRepositoryConfig {
    }

    @Bean(destroyMethod = "close")
    public HikariDataSource dataSource() {
        HikariDataSource ds = McmCoreOraTestDb.appDataSource("widget-pool");
        // 풀은 첫 getConnection 때 시작하므로 그 전에 바꾼다.
        ds.setMaximumPoolSize(POOL_SIZE);
        ds.setMinimumIdle(0);
        ds.setConnectionTimeout(CONNECTION_TIMEOUT_MS);
        ds.setIdleTimeout(10_000); // 쉬는 연결을 빨리 돌려준다(Hikari 최솟값)
        return ds;
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        LocalContainerEntityManagerFactoryBean em = McmCoreOraTestDb.entityManagerFactory(dataSource);
        em.setManagedTypes(PersistenceManagedTypes.of(List.of(
                WidgetDefaultLayout.class.getName(),
                WidgetDefaultTab.class.getName(),
                WidgetDefaultTabItem.class.getName(),
                SecUserWidgetTab.class.getName(),
                SecUserWidget.class.getName(),
                WidgetMemo.class.getName(),
                WidgetChatMessage.class.getName(),
                SecUser.class.getName(),
                DeptInfo.class.getName()), List.of()));
        return em;
    }

    @Bean
    public PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
        return new JpaTransactionManager(entityManagerFactory);
    }

    @Bean
    public SecurityIdentity securityIdentity() {
        SecurityIdentity identity = Mockito.mock(SecurityIdentity.class);
        Mockito.when(identity.currentUserId()).thenAnswer(inv -> CURRENT_USER.get());
        Mockito.when(identity.requireUserId()).thenAnswer(inv -> CURRENT_USER.get());
        return identity;
    }

    @Bean
    public WidgetUserContextResolver widgetUserContextResolver(SecurityIdentity securityIdentity, DeptInfoRepository deptRepository) {
        return new WidgetUserContextResolver(securityIdentity, Mockito.mock(SecUserRepository.class), deptRepository);
    }

    @Bean
    public WidgetDefaultTabs widgetDefaultTabs(WidgetDefaultTabRepository tabRepository,
                                               WidgetDefaultTabItemRepository itemRepository) {
        return new WidgetDefaultTabs(tabRepository, itemRepository);
    }

    @Bean
    public WidgetFixedTabs widgetFixedTabs(WidgetDefaultTabRepository tabRepository, WidgetDefaultTabs defaultTabs,
                                           WidgetDefaultLayoutRepository layoutRepository, DeptInfoRepository deptRepository) {
        return new WidgetFixedTabs(tabRepository, defaultTabs, layoutRepository, deptRepository);
    }

    @Bean
    public SecWidgetTabWriter secWidgetTabWriter(SecUserWidgetTabRepository tabRepository, SecUserWidgetRepository widgetRepository) {
        return new GatedTabWriter(tabRepository, widgetRepository);
    }

    @Bean
    public SecWidgetInstSplitWriter secWidgetInstSplitWriter(SecUserWidgetRepository widgetRepository,
                                                             WidgetMemoRepository memoRepository,
                                                             WidgetChatMessageRepository chatRepository) {
        return new SecWidgetInstSplitWriter(widgetRepository, memoRepository, chatRepository);
    }

    @Bean
    public WidgetUserLookupRepository widgetUserLookupRepository() {
        return new WidgetUserLookupRepository();
    }

    @Bean
    public SecWidgetService secWidgetService(SecUserWidgetTabRepository tabRepository, SecUserWidgetRepository widgetRepository,
                                             SecWidgetTabWriter writer, SecWidgetInstSplitWriter instSplitWriter,
                                             SecurityIdentity securityIdentity, WidgetFixedTabs fixedTabs,
                                             WidgetDefaultLayoutRepository layoutRepository,
                                             WidgetUserContextResolver userContextResolver, WidgetUserLookupRepository userLookup,
                                             PlatformTransactionManager transactionManager) {
        return new SecWidgetService(tabRepository, widgetRepository, writer, instSplitWriter, securityIdentity, fixedTabs,
                layoutRepository, userContextResolver, userLookup, transactionManager);
    }
}
