package com.dongkuk.caravan.hub.inbound.db;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.caravan.hub.camel.CamelRouteIds;
import com.dongkuk.caravan.hub.config.CaravanHubProperties;
import com.dongkuk.caravan.hub.mapper.CaravanHubConfigMapper;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.apache.camel.CamelContext;
import org.apache.camel.impl.DefaultCamelContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * DbInboundRouteManager — H-5: DB_SCHEMA/DB_TABLE_NAME 누락 설정은 "null.IF_..." 깨진 라우트를
 * 만들지 않고 생략(fail-loud)하는지 검증. 저장 시 방지(C-5)는
 * {@code ConsoleCaravanHubConfigCommandServiceTest.validate_rejects_db_without_schema} 가 담당.
 */
class DbInboundRouteManagerTest {

    private CamelContext camelContext;
    private CaravanHubConfigMapper configMapper;
    private DbInboundHandler dbInboundHandler;
    private DbInboundRouteManager manager;

    @BeforeEach
    void setUp() {
        camelContext = new DefaultCamelContext();
        camelContext.start();
        configMapper = mock(CaravanHubConfigMapper.class);
        dbInboundHandler = mock(DbInboundHandler.class);
        manager = new DbInboundRouteManager(camelContext, configMapper, dbInboundHandler,
                mock(CaravanHubProperties.class));
    }

    @AfterEach
    void tearDown() {
        camelContext.stop();
    }

    private static Map<String, Object> config(String topicId, Object schema, Object table) {
        Map<String, Object> m = new HashMap<>();
        m.put("TOPIC_ID", topicId);
        m.put("DB_SCHEMA", schema);
        m.put("DB_TABLE_NAME", table);
        m.put("POLLING_INTERVAL_MS", 3_600_000); // 테스트 중 폴 타이머가 사실상 안 뜨도록 크게
        return m;
    }

    @Test
    @DisplayName("DB_SCHEMA null 이면 라우트를 만들지 않고 생략(정상 설정은 등록)")
    void refresh_skips_route_when_schema_null() throws Exception {
        when(configMapper.selectDbInboundConfigs()).thenReturn(List.of(
                config("T_BAD", null, "IF_X"),
                config("T_OK", "EAIUSER", "IF_Y")));

        manager.refresh();

        assertThat(camelContext.getRoute(CamelRouteIds.inboundDb("T_BAD"))).isNull();
        assertThat(camelContext.getRoute(CamelRouteIds.inboundDb("T_OK"))).isNotNull();
    }

    @Test
    @DisplayName("DB_SCHEMA/DB_TABLE_NAME 공백이어도 생략")
    void refresh_skips_route_when_blank() throws Exception {
        when(configMapper.selectDbInboundConfigs()).thenReturn(List.of(
                config("T_BLANK_SCHEMA", "   ", "IF_X"),
                config("T_BLANK_TABLE", "EAIUSER", "  ")));

        manager.refresh();

        assertThat(camelContext.getRoute(CamelRouteIds.inboundDb("T_BLANK_SCHEMA"))).isNull();
        assertThat(camelContext.getRoute(CamelRouteIds.inboundDb("T_BLANK_TABLE"))).isNull();
    }
}
