package com.dongkuk.dmes.mcm.menu;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * {@link MenuCatalog} 기동 로그 — 트랜잭션 끝 무효화 리스너가 트랜잭션 단계 리스너로 등록됐는지(트랜잭션 이벤트 리스너 팩토리
 * 빈 유무) 컨텍스트 새로고침 뒤 한 번만 남기는지. 로그 캡처는 {@link MenuCatalogTest} 와 같은 방식.
 */
class MenuCatalogTxListenerReportTest {

    static final String PREFIX = "[menuCatalog] 트랜잭션 끝 무효화 리스너";
    static final String REGISTERED = "[menuCatalog] 트랜잭션 끝 무효화 리스너: 트랜잭션 단계 등록=true";
    static final String NOT_REGISTERED = "[menuCatalog] 트랜잭션 끝 무효화 리스너: 트랜잭션 단계 등록=false"
            + " — 발행 즉시 무효화로 동작하며 커밋 전 재적재는 TTL(5m) 뒤 반영";

    ListAppender<ILoggingEvent> logs;
    Logger catalogLogger;
    AnnotationConfigApplicationContext parent;
    AnnotationConfigApplicationContext child;

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
        if (child != null) child.close();
        if (parent != null) parent.close();
    }

    List<ILoggingEvent> reports() {
        return logs.list.stream().filter(e -> e.getFormattedMessage().startsWith(PREFIX)).toList();
    }

    @Test
    @DisplayName("트랜잭션 관리가 켜진 컨텍스트 — 팩토리 빈이 있어 INFO '등록=true' 한 줄")
    void withTransactionManagementLogsInfoTrue() {
        parent = new AnnotationConfigApplicationContext(TxConfig.class);

        assertThat(parent.containsBean(TransactionManagementConfigUtils.TRANSACTIONAL_EVENT_LISTENER_FACTORY_BEAN_NAME))
                .isTrue();
        List<ILoggingEvent> reports = reports();
        assertThat(reports).hasSize(1);
        assertThat(reports.get(0).getLevel()).isEqualTo(Level.INFO);
        assertThat(reports.get(0).getFormattedMessage()).isEqualTo(REGISTERED);
    }

    @Test
    @DisplayName("트랜잭션 관리가 없는 컨텍스트 — 팩토리 빈이 없어 WARN '등록=false — … TTL(5m) 뒤 반영' 한 줄")
    void withoutTransactionManagementLogsWarnFalse() {
        parent = new AnnotationConfigApplicationContext(PlainConfig.class);

        assertThat(parent.containsBean(TransactionManagementConfigUtils.TRANSACTIONAL_EVENT_LISTENER_FACTORY_BEAN_NAME))
                .isFalse();
        List<ILoggingEvent> reports = reports();
        assertThat(reports).hasSize(1);
        assertThat(reports.get(0).getLevel()).isEqualTo(Level.WARN);
        assertThat(reports.get(0).getFormattedMessage()).isEqualTo(NOT_REGISTERED);
    }

    @Test
    @DisplayName("새로고침이 두 번 와도(자식 컨텍스트 새로고침 전파·수동 재발행) 한 번만 남긴다")
    void logsOnlyOnceAcrossRefreshes() {
        parent = new AnnotationConfigApplicationContext(TxConfig.class);
        assertThat(reports()).hasSize(1);

        // 자식 컨텍스트의 ContextRefreshedEvent 는 부모의 리스너(카탈로그)에도 전달된다 — 두 번째 새로고침.
        child = new AnnotationConfigApplicationContext();
        child.setParent(parent);
        child.register(EmptyConfig.class);
        child.refresh();
        parent.publishEvent(new ContextRefreshedEvent(parent));

        List<ILoggingEvent> reports = reports();
        assertThat(reports).hasSize(1);
        assertThat(reports.get(0).getFormattedMessage()).isEqualTo(REGISTERED);
    }

    @Test
    @DisplayName("부모에 팩토리가 있으면 자식 컨텍스트 기준으로 판정해도 등록=true (containsBean 은 부모까지 본다)")
    void childContextSeesParentFactory() {
        parent = new AnnotationConfigApplicationContext(TxConfig.class);
        child = new AnnotationConfigApplicationContext();
        child.setParent(parent);
        child.register(EmptyConfig.class);
        child.refresh();
        logs.list.clear();

        new MenuCatalog(mock(SecMenuRepository.class), mock(SecObjRepository.class))
                .onContextRefreshed(new ContextRefreshedEvent(child));

        List<ILoggingEvent> reports = reports();
        assertThat(reports).hasSize(1);
        assertThat(reports.get(0).getLevel()).isEqualTo(Level.INFO);
        assertThat(reports.get(0).getFormattedMessage()).isEqualTo(REGISTERED);
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

    @Configuration
    static class PlainConfig extends CatalogBeans {
    }

    @Configuration
    static class EmptyConfig {
    }
}
