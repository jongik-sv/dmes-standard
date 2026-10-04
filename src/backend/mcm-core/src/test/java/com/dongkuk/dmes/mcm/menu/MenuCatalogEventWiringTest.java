package com.dongkuk.dmes.mcm.menu;

import com.dongkuk.dmes.mcm.common.event.MenuChangedEvent;
import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 스프링 컨텍스트에서 {@link MenuCatalog} 의 두 리스너가 실제로 걸리는지 — 발행 즉시 한 번, 트랜잭션이 끝난 뒤(커밋·롤백) 한 번 더.
 * 트랜잭션은 자원 없는 시험용 매니저로 열어 동기화만 켠다(DB 를 쓰는 끝에서 끝 확인은 mcm/api 의 OASIS 통합 시험).
 */
class MenuCatalogEventWiringTest {

    AnnotationConfigApplicationContext ctx;
    SecMenuRepository menuRepo;
    MenuCatalog catalog;
    TransactionTemplate tx;
    int loads;

    @BeforeEach
    void setUp() {
        ctx = new AnnotationConfigApplicationContext(Config.class);
        menuRepo = ctx.getBean(SecMenuRepository.class);
        loads = 0;
        when(menuRepo.findAll()).thenAnswer(inv -> {
            loads++;
            return List.of(new SecMenu());
        });
        when(ctx.getBean(SecObjRepository.class).findAll()).thenReturn(List.of());
        catalog = ctx.getBean(MenuCatalog.class);
        tx = new TransactionTemplate(ctx.getBean(PlatformTransactionManager.class));
    }

    @AfterEach
    void tearDown() {
        ctx.close();
    }

    @Test
    @DisplayName("트랜잭션 밖 발행 — 즉시 비우고, 트랜잭션 끝 리스너도 fallback 으로 바로 돈다")
    void outsideTransaction() {
        catalog.snapshot();
        ctx.publishEvent(new MenuChangedEvent(MenuChangedEvent.MENU));
        catalog.snapshot();
        assertThat(loads).isEqualTo(2);

        ctx.publishEvent(new RoleChangedEvent(Set.of("SYSADMIN")));
        catalog.snapshot();
        assertThat(loads).isEqualTo(3);
    }

    @Test
    @DisplayName("트랜잭션 안 발행 — 즉시 비우고, 커밋 전에 다시 채워진 캐시를 커밋 뒤에 한 번 더 비운다")
    void insideTransactionClearsAgainAfterCommit() {
        catalog.snapshot();                     // 1회 적재
        tx.executeWithoutResult(s -> {
            ctx.publishEvent(new MenuChangedEvent(MenuChangedEvent.OBJECT));
            catalog.snapshot();                 // 커밋 전 다시 채움(다른 요청이 옛 데이터로 채우는 상황) — 2회
            catalog.snapshot();                 // 캐시 적중
            assertThat(loads).isEqualTo(2);
        });
        catalog.snapshot();                     // 커밋 뒤 비워졌으니 다시 읽는다 — 3회
        assertThat(loads).isEqualTo(3);
    }

    @Configuration
    @EnableTransactionManagement
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
