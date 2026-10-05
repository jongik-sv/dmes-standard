package com.dongkuk.dmes.mcm.widget.layout;

import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTab;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTabItem;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabItemRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabRepository;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetDefaultTabWriter;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetDefaultTabs;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import com.dongkuk.dmes.mcm.widget.repository.WidgetUserLookupRepository;
import com.dongkuk.dmes.mcm.widget.service.SecWidgetTabWriter;
import jakarta.persistence.EntityManagerFactory;
import java.util.List;
import java.util.Properties;
import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.persistenceunit.PersistenceManagedTypes;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * 기본 탭·공유 시험용 최소 JPA 구성(H2 메모리, DB 이름 widgettabs) — {@code WidgetJpaTestConfig} 방식.
 * Hibernate SQLite 방언은 mcm-core 시험 클래스패스에 없어 다른 위젯 저장소 시험처럼 H2 를 쓴다.
 * 사용자 찾기 쿼리를 확인하려고 사용자·부서 엔티티 둘만 더 올린다(공통 엔티티 패키지 전체는 올리지 않는다).
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(basePackageClasses = {WidgetDefaultLayoutRepository.class, SecUserWidgetRepository.class})
public class WidgetTabsJpaTestConfig {

    @Bean
    public DataSource dataSource() {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.h2.Driver"); // testRuntimeOnly — 클래스 직접 참조 금지
        ds.setUrl("jdbc:h2:mem:widgettabs;DB_CLOSE_DELAY=-1;INIT=CREATE SCHEMA IF NOT EXISTS MCMAPUSER");
        ds.setUsername("sa");
        ds.setPassword("");
        return ds;
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setManagedTypes(PersistenceManagedTypes.of(List.of(
                WidgetDefaultLayout.class.getName(),
                WidgetDefaultTab.class.getName(),
                WidgetDefaultTabItem.class.getName(),
                SecUserWidgetTab.class.getName(),
                SecUserWidget.class.getName(),
                SecUser.class.getName(),
                DeptInfo.class.getName()), List.of()));
        em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        Properties props = new Properties();
        props.put("hibernate.hbm2ddl.auto", "create-drop");
        em.setJpaProperties(props);
        return em;
    }

    @Bean
    public WidgetDefaultTabs widgetDefaultTabs(WidgetDefaultTabRepository tabRepository,
                                               WidgetDefaultTabItemRepository itemRepository) {
        return new WidgetDefaultTabs(tabRepository, itemRepository);
    }

    /** 탭 단위 지우고 다시 넣기·채번 트랜잭션 — @Transactional 프록시가 걸리도록 빈으로 등록한다. */
    @Bean
    public WidgetDefaultTabWriter widgetDefaultTabWriter(WidgetDefaultTabRepository tabRepository,
                                                         WidgetDefaultTabItemRepository itemRepository,
                                                         WidgetDefaultLayoutRepository layoutRepository,
                                                         SecUserWidgetTabRepository userTabRepository) {
        return new WidgetDefaultTabWriter(tabRepository, itemRepository, layoutRepository, userTabRepository);
    }

    /** 공유 사본 쓰기 트랜잭션. */
    @Bean
    public SecWidgetTabWriter secWidgetTabWriter(SecUserWidgetTabRepository tabRepository, SecUserWidgetRepository widgetRepository) {
        return new SecWidgetTabWriter(tabRepository, widgetRepository);
    }

    @Bean
    public WidgetUserLookupRepository widgetUserLookupRepository() {
        return new WidgetUserLookupRepository();
    }

    @Bean
    public PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
        return new JpaTransactionManager(entityManagerFactory);
    }
}
