package com.dongkuk.caravan.hub.inbound.file;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.camel.CamelContext;
import org.apache.camel.Route;
import org.apache.camel.builder.RouteBuilder;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import com.dongkuk.caravan.hub.camel.CamelRouteIds;
import com.dongkuk.caravan.hub.config.CaravanHubProperties;
import com.dongkuk.caravan.hub.mapper.CaravanHubConfigMapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * FILE(SFTP) INBOUND 동적 라우트 관리자 (구 {@code FilePollingScheduler} 대체).
 *
 * <p>{@code TB_CARAVAN_HUB_CONFIG} 의 FILE/INBOUND 설정을 읽어 토픽별 Camel timer 라우트
 * ({@code inbound-file-<topic>})를 CamelContext 에 동적 등록한다. 폴 로직은 {@link FileInboundHandler} 위임.
 * 구조/생명주기는 {@link com.dongkuk.caravan.hub.inbound.db.DbInboundRouteManager} 와 동일하다.</p>
 *
 * <p>{@code caravan-hub.inbound.file.enabled=false} 이면 미등록. 큐막기/소비제어는
 * {@link com.dongkuk.caravan.hub.camel.CamelRouteControlService} 로 수행한다.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FileInboundRouteManager {

    private static final String REFRESH_ROUTE_ID = "inbound-file-refresh";
    private static final long REFRESH_PERIOD_MS = 60000L;
    private static final long DEFAULT_POLL_INTERVAL_MS = 1000L;

    private final CamelContext camelContext;
    private final CaravanHubConfigMapper configMapper;
    private final FileInboundHandler fileInboundHandler;
    private final CaravanHubProperties properties;

    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() throws Exception {
        if (!properties.getInbound().getFile().isEnabled()) {
            log.info("[FileInbound] caravan-hub.inbound.file.enabled=false → FILE 인바운드 라우트 미등록");
            return;
        }
        refresh();
        registerRefreshRoute();
        log.info("[FileInbound] FILE 인바운드 라우트 초기화 완료 - 등록 토픽 수: {}", countTopicRoutes());
    }

    private void registerRefreshRoute() throws Exception {
        if (camelContext.getRoute(REFRESH_ROUTE_ID) != null) {
            return;
        }
        camelContext.addRoutes(new RouteBuilder() {
            @Override
            public void configure() {
                from("timer://" + REFRESH_ROUTE_ID + "?period=" + REFRESH_PERIOD_MS + "&delay=" + REFRESH_PERIOD_MS)
                        .routeId(REFRESH_ROUTE_ID)
                        .process(ex -> refreshQuietly());
            }
        });
    }

    /**
     * 설정 재조회 → 신규 토픽 라우트 추가 / 비활성 토픽 라우트 제거.
     */
    public synchronized void refresh() throws Exception {
        List<Map<String, Object>> configs = configMapper.selectFileInboundConfigs();
        Set<String> desiredRouteIds = new HashSet<>();

        if (configs != null) {
            for (Map<String, Object> config : configs) {
                String topicId = (String) config.get("TOPIC_ID");
                if (topicId == null) {
                    continue;
                }
                String routeId = CamelRouteIds.inboundFile(topicId);
                desiredRouteIds.add(routeId);

                if (camelContext.getRoute(routeId) == null) {
                    addTopicRoute(topicId, config);
                }
            }
        }

        for (Route route : camelContext.getRoutes()) {
            String id = route.getRouteId();
            if (isTopicRoute(id) && !desiredRouteIds.contains(id)) {
                camelContext.getRouteController().stopRoute(id);
                camelContext.removeRoute(id);
                log.info("[FileInbound] 라우트 제거 - {}", id);
            }
        }
    }

    private void addTopicRoute(String topicId, Map<String, Object> config) throws Exception {
        String routeId = CamelRouteIds.inboundFile(topicId);
        long interval = pollInterval(config);
        camelContext.addRoutes(new RouteBuilder() {
            @Override
            public void configure() {
                from("timer://" + routeId + "?period=" + interval + "&delay=0")
                        .routeId(routeId)
                        .process(ex -> fileInboundHandler.pollAndSend(config));
            }
        });
        log.info("[FileInbound] 라우트 등록 - Topic: {}, Path: {}, Interval: {}ms",
                topicId, config.get("FILE_PATH"), interval);
    }

    private void refreshQuietly() {
        try {
            refresh();
        } catch (Exception e) {
            log.error("[FileInbound] 설정 갱신 실패", e);
        }
    }

    private long countTopicRoutes() {
        return camelContext.getRoutes().stream()
                .filter(r -> isTopicRoute(r.getRouteId()))
                .count();
    }

    /** 토픽 폴 라우트(inbound-file-&lt;topic&gt;) 여부. refresh 라우트(inbound-file-refresh)는 제외. */
    private boolean isTopicRoute(String routeId) {
        return routeId.startsWith(CamelRouteIds.INBOUND_FILE_PREFIX) && !routeId.equals(REFRESH_ROUTE_ID);
    }

    private long pollInterval(Map<String, Object> config) {
        Object interval = config.get("POLLING_INTERVAL_MS");
        if (interval instanceof Number number) {
            return number.longValue();
        }
        return DEFAULT_POLL_INTERVAL_MS;
    }
}
