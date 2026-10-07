package com.dongkuk.dmes.mcm.widget.layout;

import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.zaxxer.hikari.HikariDataSource;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.widget.chat.entity.WidgetChatMessage;
import com.dongkuk.dmes.mcm.widget.chat.repository.WidgetChatMessageRepository;
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
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetFixedTabs;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import java.util.Optional;
import org.mockito.Mockito;
import com.dongkuk.dmes.mcm.widget.memo.entity.WidgetMemo;
import com.dongkuk.dmes.mcm.widget.memo.repository.WidgetMemoRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import com.dongkuk.dmes.mcm.widget.repository.WidgetUserLookupRepository;
import com.dongkuk.dmes.mcm.widget.service.SecWidgetInstSplitWriter;
import com.dongkuk.dmes.mcm.widget.service.SecWidgetTabWriter;
import jakarta.persistence.EntityManagerFactory;
import java.util.List;
import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.persistenceunit.PersistenceManagedTypes;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * 기본 탭·공유·instId 분리 시험용 최소 JPA 구성(Oracle 시험 PDB, 기준선 V1 — {@link McmCoreOraTestDb}) — {@code WidgetJpaTestConfig} 방식.
 * 컨텍스트가 뜰 때 네 스키마의 행을 지운다(빈 표에서 시작).
 * 사용자 찾기 쿼리를 확인하려고 사용자·부서 엔티티 둘만 더 올린다(공통 엔티티 패키지 전체는 올리지 않는다).
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(basePackageClasses = {WidgetDefaultLayoutRepository.class, SecUserWidgetRepository.class,
        WidgetMemoRepository.class, WidgetChatMessageRepository.class})
public class WidgetTabsJpaTestConfig {

    /**
     * 풀 상한 3(앱 로컬과 같다). WidgetDefaultTabJpaTest 의 「바깥 트랜잭션 안에서 search → 옛 배치 이전은 자기 트랜잭션」 시험은
     * 바깥이 쥔 연결(서비스 읽기도 여기에 합류한다) + 이전 트랜잭션(NOT_SUPPORTED 안의 writer)의 연결, 곧 2개를 함께 쓴다(oracle-1007 ③c 이후).
     * 이전(H2 DriverManagerDataSource)에는 연결 수 제한이 없어 드러나지 않았다. 부족하면 getConnection 이 30초 기다린 뒤 실패하고 이전이 건너뛰어진다.
     */
    @Bean
    public DataSource dataSource() {
        HikariDataSource ds = McmCoreOraTestDb.appDataSource("widget-tabs");
        ds.setMaximumPoolSize(3); // 풀은 첫 getConnection 때 시작하므로 그 전에 바꾼다
        return ds;
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
        // 엔티티는 아래 목록으로만 올린다 — 패키지 스캔은 비워 두고 managedTypes 가 우선한다(공통 엔티티 패키지 전체를 올리지 않는다).
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
    public WidgetDefaultTabs widgetDefaultTabs(WidgetDefaultTabRepository tabRepository,
                                               WidgetDefaultTabItemRepository itemRepository) {
        return new WidgetDefaultTabs(tabRepository, itemRepository);
    }

    /** 고정 탭 해석 — 부서 저장소는 시험 패키지 밖이라 이름만 돌려주는 대역을 쓴다(D100 = 생산1팀, 그 밖은 없음). */
    @Bean
    public WidgetFixedTabs widgetFixedTabs(WidgetDefaultTabRepository tabRepository, WidgetDefaultTabs defaultTabs,
                                           WidgetDefaultLayoutRepository layoutRepository) {
        DeptInfoRepository depts = Mockito.mock(DeptInfoRepository.class);
        DeptInfo d100 = new DeptInfo();
        d100.setDeptCd("D100");
        d100.setDeptNm("생산1팀");
        Mockito.when(depts.findById(Mockito.anyString()))
                .thenAnswer(inv -> "D100".equals(inv.getArgument(0)) ? Optional.of(d100) : Optional.empty());
        return new WidgetFixedTabs(tabRepository, defaultTabs, layoutRepository, depts);
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

    /** 고정 탭 위젯과 같은 instId 를 쓰는 개인 탭 위젯의 instId 분리·메모·대화 복사 트랜잭션. */
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
    public PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
        return new JpaTransactionManager(entityManagerFactory);
    }
}
