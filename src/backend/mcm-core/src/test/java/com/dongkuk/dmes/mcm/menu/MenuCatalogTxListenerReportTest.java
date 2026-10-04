package com.dongkuk.dmes.mcm.menu;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.dongkuk.dmes.mcm.common.event.MenuChangedEvent;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.config.TransactionManagementConfigUtils;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * {@link MenuCatalog} 기동 로그 — 트랜잭션 끝 무효화 리스너가 트랜잭션 단계 리스너로 등록됐는지(자기 컨텍스트의 트랜잭션 이벤트
 * 리스너 팩토리 빈 유무) 자기 컨텍스트 새로고침 뒤 한 번만 남기는지. 로그 캡처는 {@link MenuCatalogTest} 와 같은 방식.
 */
class MenuCatalogTxListenerReportTest {

    static final String PREFIX = "[menuCatalog] 트랜잭션 끝 무효화 리스너";
    static final String REGISTERED = "[menuCatalog] 트랜잭션 끝 무효화 리스너: 트랜잭션 단계 등록=true";
    static final String NOT_REGISTERED = "[menuCatalog] 트랜잭션 끝 무효화 리스너: 트랜잭션 단계 등록=false"
            + " — 발행 즉시 무효화로 동작하며 커밋 전 재적재는 TTL(5m) 뒤 반영";

    ListAppender<ILoggingEvent> logs;
    Logger catalogLogger;
    final List<AnnotationConfigApplicationContext> contexts = new ArrayList<>();

    @BeforeEach
    void setUp() {
        // 로그는 새로고침 중에 나가므로 컨텍스트를 만들기 전에 붙인다.
        catalogLogger = (Logger) LoggerFactory.getLogger(MenuCatalog.class);
        logs = new ListAppender<>();
        logs.start();
        catalogLogger.addAppender(logs);
    }

    @AfterEach
    void tearDown() {
        catalogLogger.detachAppender(logs);
        // 자식부터 닫는다.
        for (int i = contexts.size() - 1; i >= 0; i--) contexts.get(i).close();
    }

    AnnotationConfigApplicationContext context(Class<?> config) {
        AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext(config);
        contexts.add(ctx);
        return ctx;
    }

    AnnotationConfigApplicationContext childOf(AnnotationConfigApplicationContext parent, Class<?> config) {
        AnnotationConfigApplicationContext child = new AnnotationConfigApplicationContext();
        child.setParent(parent);
        child.register(config);
        contexts.add(child);
        child.refresh();
        return child;
    }

    List<ILoggingEvent> reports() {
        return logs.list.stream().filter(e -> e.getFormattedMessage().startsWith(PREFIX)).toList();
    }

    @Test
    @DisplayName("트랜잭션 관리가 켜진 컨텍스트 — 팩토리 빈이 있어 INFO '등록=true' 한 줄")
    void withTransactionManagementLogsInfoTrue() {
        AnnotationConfigApplicationContext ctx = context(TxConfig.class);

        assertThat(ctx.containsBean(TransactionManagementConfigUtils.TRANSACTIONAL_EVENT_LISTENER_FACTORY_BEAN_NAME))
                .isTrue();
        List<ILoggingEvent> reports = reports();
        assertThat(reports).hasSize(1);
        assertThat(reports.get(0).getLevel()).isEqualTo(Level.INFO);
        assertThat(reports.get(0).getFormattedMessage()).isEqualTo(REGISTERED);
    }

    @Test
    @DisplayName("트랜잭션 관리가 없는 컨텍스트 — 팩토리 빈이 없어 WARN '등록=false — … TTL(5m) 뒤 반영' 한 줄")
    void withoutTransactionManagementLogsWarnFalse() {
        AnnotationConfigApplicationContext ctx = context(PlainConfig.class);

        assertThat(ctx.containsBean(TransactionManagementConfigUtils.TRANSACTIONAL_EVENT_LISTENER_FACTORY_BEAN_NAME))
                .isFalse();
        List<ILoggingEvent> reports = reports();
        assertThat(reports).hasSize(1);
        assertThat(reports.get(0).getLevel()).isEqualTo(Level.WARN);
        assertThat(reports.get(0).getFormattedMessage()).isEqualTo(NOT_REGISTERED);
    }

    @Test
    @DisplayName("자기 컨텍스트가 다시 새로고침돼도, 자식 컨텍스트 새로고침이 부모로 올라와도 한 번만 남긴다")
    void logsOnlyOnceAcrossRefreshes() {
        AnnotationConfigApplicationContext parent = context(TxConfig.class);
        assertThat(reports()).hasSize(1);

        // 자식 컨텍스트의 ContextRefreshedEvent 는 부모의 리스너(카탈로그)에도 전달된다 — 남의 컨텍스트라 판정하지 않는다.
        childOf(parent, EmptyConfig.class);
        // 자기 컨텍스트의 새로고침 재발행 — 이미 남겼으므로 다시 남기지 않는다.
        parent.publishEvent(new ContextRefreshedEvent(parent));

        List<ILoggingEvent> reports = reports();
        assertThat(reports).hasSize(1);
        assertThat(reports.get(0).getFormattedMessage()).isEqualTo(REGISTERED);
    }

    @Test
    @DisplayName("팩토리가 부모에만 있고 카탈로그는 자식에 있으면 WARN '등록=false' — 실제로도 트랜잭션 끝 리스너가 발행 즉시 돈다")
    void factoryOnlyInParentLogsWarnFalse() {
        AnnotationConfigApplicationContext parent = context(TxOnlyConfig.class);
        AnnotationConfigApplicationContext child = childOf(parent, PlainConfig.class);

        // 부모를 보는 containsBean 으로는 보이지만 자식 자신에는 없다.
        assertThat(child.containsBean(TransactionManagementConfigUtils.TRANSACTIONAL_EVENT_LISTENER_FACTORY_BEAN_NAME))
                .isTrue();
        assertThat(child.containsLocalBean(TransactionManagementConfigUtils.TRANSACTIONAL_EVENT_LISTENER_FACTORY_BEAN_NAME))
                .isFalse();
        List<ILoggingEvent> reports = reports();
        assertThat(reports).hasSize(1);
        assertThat(reports.get(0).getLevel()).isEqualTo(Level.WARN);
        assertThat(reports.get(0).getFormattedMessage()).isEqualTo(NOT_REGISTERED);

        // 로그가 맞는지 동작으로 확인 — 트랜잭션 단계 리스너가 아니므로 커밋 뒤 한 번 더 비우기가 없다.
        int[] loads = {0};
        when(child.getBean(SecMenuRepository.class).findAll()).thenAnswer(inv -> {
            loads[0]++;
            return List.of(new SecMenu());
        });
        when(child.getBean(SecObjRepository.class).findAll()).thenReturn(List.of());
        MenuCatalog catalog = child.getBean(MenuCatalog.class);
        TransactionTemplate tx = new TransactionTemplate(parent.getBean(PlatformTransactionManager.class));

        catalog.snapshot();                                   // 1회 적재
        tx.executeWithoutResult(s -> {
            child.publishEvent(new MenuChangedEvent(MenuChangedEvent.MENU));
            catalog.snapshot();                               // 커밋 전 다시 채움 — 2회
        });
        catalog.snapshot();                                   // 커밋 뒤 비우기가 없어 캐시 적중
        assertThat(loads[0]).isEqualTo(2);
    }

    @Test
    @DisplayName("다른 컨텍스트의 새로고침 이벤트는 판정하지 않고 한 번만 표시도 잠그지 않는다")
    void ignoresOtherContextRefreshWithoutLockingFlag() {
        AnnotationConfigApplicationContext own = context(EmptyConfig.class);   // 팩토리 없음 → 판정하면 false
        AnnotationConfigApplicationContext other = context(TxOnlyConfig.class); // 팩토리 있음 → 판정하면 true
        logs.list.clear();
        MenuCatalog catalog = new MenuCatalog(mock(SecMenuRepository.class), mock(SecObjRepository.class));
        catalog.setApplicationContext(own);

        catalog.onContextRefreshed(new ContextRefreshedEvent(other));
        assertThat(reports()).isEmpty();

        catalog.onContextRefreshed(new ContextRefreshedEvent(own));
        List<ILoggingEvent> reports = reports();
        assertThat(reports).hasSize(1);
        assertThat(reports.get(0).getLevel()).isEqualTo(Level.WARN);
        assertThat(reports.get(0).getFormattedMessage()).isEqualTo(NOT_REGISTERED);
    }

    @Test
    @DisplayName("컨텍스트에 속하지 않은 카탈로그(빈이 아님)는 새로고침 이벤트를 받아도 남기지 않는다")
    void notABeanLogsNothing() {
        AnnotationConfigApplicationContext ctx = context(TxOnlyConfig.class);
        logs.list.clear();

        new MenuCatalog(mock(SecMenuRepository.class), mock(SecObjRepository.class))
                .onContextRefreshed(new ContextRefreshedEvent(ctx));

        assertThat(reports()).isEmpty();
    }

    @Configuration
    static class CatalogBeans {

        @Bean
        SecMenuRepository secMenuRepository() {
            return mock(SecMenuRepository.class);
        }

        @Bean
        SecObjRepository secObjRepository() {
            return mock(SecObjRepository.class);
        }

        @Bean
        MenuCatalog menuCatalog(SecMenuRepository menuRepo, SecObjRepository objRepo) {
            return new MenuCatalog(menuRepo, objRepo);
        }
    }

    @Configuration
    @EnableTransactionManagement
    static class TxConfig extends CatalogBeans {

        @Bean
        PlatformTransactionManager transactionManager() {
            return new MenuCatalogEventWiringTest.ResourcelessTxManager();
        }
    }

    /** 트랜잭션 관리만 — 카탈로그 없음(부모 컨텍스트·비교용). */
    @Configuration
    @EnableTransactionManagement
    static class TxOnlyConfig {

        @Bean
        PlatformTransactionManager transactionManager() {
            return new MenuCatalogEventWiringTest.ResourcelessTxManager();
        }
    }

    @Configuration
    static class PlainConfig extends CatalogBeans {
    }

    @Configuration
    static class EmptyConfig {
    }
}
