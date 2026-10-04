package com.dongkuk.dmes.mcm.menu;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.dongkuk.dmes.mcm.common.event.MenuChangedEvent;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.transaction.autoconfigure.TransactionAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.config.TransactionManagementConfigUtils;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 운영 경로 확인 — {@code @EnableTransactionManagement} 를 직접 쓰지 않고 Boot 자동 구성({@link TransactionAutoConfiguration})만
 * 걸었을 때 트랜잭션 이벤트 리스너 팩토리가 생겨 {@link MenuCatalog} 가 INFO '등록=true' 를 남기고, 실제로 커밋 뒤 한 번 더
 * 비우는지. 트랜잭션 매니저는 자원 없는 시험용이다(운영은 JPA 자동 구성의 매니저 — 팩토리를 만드는 쪽은 매니저 종류와 무관하게
 * TransactionAutoConfiguration 이다). JPA·OASIS 까지 포함한 실제 조립은 기동 로그 한 줄로 확인한다.
 */
class MenuCatalogBootTxAutoConfigTest {

    static final String REGISTERED = "[menuCatalog] 트랜잭션 끝 무효화 리스너: 트랜잭션 단계 등록=true";

    final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(TransactionAutoConfiguration.class))
            .withUserConfiguration(Config.class);

    ListAppender<ILoggingEvent> logs;
    Logger catalogLogger;

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
    }

    @Test
    @DisplayName("TransactionAutoConfiguration 만으로 팩토리가 생겨 INFO '등록=true' 이고 커밋 뒤 한 번 더 비운다")
    void bootAutoConfigRegistersTransactionalListener() {
        runner.run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx.containsLocalBean(
                    TransactionManagementConfigUtils.TRANSACTIONAL_EVENT_LISTENER_FACTORY_BEAN_NAME)).isTrue();
            List<ILoggingEvent> reports = logs.list.stream()
                    .filter(e -> e.getFormattedMessage().startsWith("[menuCatalog] 트랜잭션 끝 무효화 리스너"))
                    .toList();
            assertThat(reports).hasSize(1);
            assertThat(reports.get(0).getLevel()).isEqualTo(Level.INFO);
            assertThat(reports.get(0).getFormattedMessage()).isEqualTo(REGISTERED);

            int[] loads = {0};
            when(ctx.getBean(SecMenuRepository.class).findAll()).thenAnswer(inv -> {
                loads[0]++;
                return List.of(new SecMenu());
            });
            when(ctx.getBean(SecObjRepository.class).findAll()).thenReturn(List.of());
            MenuCatalog catalog = ctx.getBean(MenuCatalog.class);
            TransactionTemplate tx = new TransactionTemplate(ctx.getBean(PlatformTransactionManager.class));

            catalog.snapshot();                               // 1회 적재
            tx.executeWithoutResult(s -> {
                ctx.publishEvent(new MenuChangedEvent(MenuChangedEvent.MENU));
                catalog.snapshot();                           // 커밋 전 다시 채움 — 2회
            });
            catalog.snapshot();                               // 커밋 뒤 비워졌으니 다시 읽는다 — 3회
            assertThat(loads[0]).isEqualTo(3);
        });
    }

    @Configuration(proxyBeanMethods = false)
    static class Config {

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

        @Bean
        PlatformTransactionManager transactionManager() {
            return new ResourcelessTxManager();
        }
    }

    /** 자원 없이 트랜잭션 동기화만 여는 매니저. */
    static final class ResourcelessTxManager extends AbstractPlatformTransactionManager {
        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
        }
    }
}
