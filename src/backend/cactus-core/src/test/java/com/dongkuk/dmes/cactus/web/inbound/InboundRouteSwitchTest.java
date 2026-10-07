package com.dongkuk.dmes.cactus.web.inbound;

import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import org.apache.ibatis.session.SqlSession;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * 직접 실행 경로({@code /service}·{@code /query/service}·{@code /lov/service}·{@code /query/{id}}·{@code /lov/query/{id}}) 스위치.
 *
 * <p>2026-10-07 보안 지적(notice-fill2 route-guard): 이 경로들은 아무 BPMN·매퍼 statement 를 고정 action 으로 실행하는데
 * BFF·BE 권한 판정이 권한 키를 만들지 못해 로그인만 한 사용자에게 열려 있었다. 화면 사용처가 없어 기본은 끈다.
 * {@code /oasis/{serviceId}/{action}} 과 {@code /lov/master} 는 그대로 켜져 있어야 한다.
 */
class InboundRouteSwitchTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withBean(SqlSession.class, () -> mock(SqlSession.class))
            .withBean(OasisServiceExecutor.class, () -> mock(OasisServiceExecutor.class))
            .withConfiguration(AutoConfigurations.of(InboundAutoConfiguration.class));

    @Test
    @DisplayName("기본 설정 — service·query 직접 경로 컨트롤러는 없고 /oasis·/lov/master 는 있다")
    void defaultsOff() {
        runner.run(ctx -> {
            assertThat(ctx).doesNotHaveBean(ServiceController.class);
            assertThat(ctx).doesNotHaveBean(QueryController.class);
            assertThat(ctx).hasSingleBean(OasisController.class);
            assertThat(ctx).hasSingleBean(LovController.class);
        });
    }

    @Test
    @DisplayName("service-routes 만 켜면 ServiceController 만 생긴다")
    void serviceRoutesOn() {
        runner.withPropertyValues("cactus.inbound.service-routes.enabled=true").run(ctx -> {
            assertThat(ctx).hasSingleBean(ServiceController.class);
            assertThat(ctx).doesNotHaveBean(QueryController.class);
        });
    }

    @Test
    @DisplayName("query-routes 만 켜면 QueryController 만 생긴다")
    void queryRoutesOn() {
        runner.withPropertyValues("cactus.inbound.query-routes.enabled=true").run(ctx -> {
            assertThat(ctx).hasSingleBean(QueryController.class);
            assertThat(ctx).doesNotHaveBean(ServiceController.class);
        });
    }
}
