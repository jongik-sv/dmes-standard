package com.dongkuk.caravan.hub.inbound.db;

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
 * DB INBOUND 동적 라우트 관리자 (구 {@code DbPollingScheduler} 대체).
 *
 * <p>{@code TB_CARAVAN_HUB_CONFIG} 의 DB/INBOUND 설정을 읽어 토픽별 Camel timer 라우트
 * ({@code inbound-db-<topic>})를 CamelContext 에 동적 등록한다. 폴 로직은 {@link DbInboundHandler} 위임.</p>
 *
 * <ul>
 *   <li>기동: {@link ApplicationReadyEvent}(=CamelContext started 이후)에 초기 등록 + 60초 refresh 라우트 등록.</li>
 *   <li>주기: timer 는 단일 스레드(엔드포인트별)라 동일 토픽 폴이 겹치지 않는다(구 AtomicBoolean 가드 불필요).</li>
 *   <li>갱신: 60초마다 신규 토픽 추가 / 비활성 토픽 stop+remove (구 스케줄러와 동치; interval 변경은 미반영).</li>
 *   <li>{@code caravan-hub.inbound.db.enabled=false} 이면 미등록.</li>
 * </ul>
 *
 * <p>큐막기/소비제어는 {@link com.dongkuk.caravan.hub.camel.CamelRouteControlService} 로 라우트를
 * suspend/resume 하여 수행한다.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DbInboundRouteManager {

    /** DB 인바운드 설정 갱신 라우트 ID. */
    private static final String REFRESH_ROUTE_ID = "inbound-db-refresh";
    /** 설정 갱신 주기(ms). */
    private static final long REFRESH_PERIOD_MS = 60000L;
    /** POLLING_INTERVAL_MS 미지정 시 기본 폴 주기(ms). */
    private static final long DEFAULT_POLL_INTERVAL_MS = 1000L;

    private final CamelContext camelContext;
    private final CaravanHubConfigMapper configMapper;
    private final DbInboundHandler dbInboundHandler;
    private final CaravanHubProperties properties;

    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() throws Exception {
        if (!properties.getInbound().getDb().isEnabled()) {
            log.info("[DbInbound] caravan-hub.inbound.db.enabled=false → DB 인바운드 라우트 미등록");
            return;
        }
        refresh();
        registerRefreshRoute();
        log.info("[DbInbound] DB 인바운드 라우트 초기화 완료 - 등록 토픽 수: {}", countTopicRoutes());
    }

    /** 60초 주기 설정 갱신 timer 라우트 등록(1회). */
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
     * 설정을 재조회하여 신규 토픽 라우트 추가 / 비활성 토픽 라우트 제거.
     */
    public synchronized void refresh() throws Exception {
        List<Map<String, Object>> configs = configMapper.selectDbInboundConfigs();
        Set<String> desiredRouteIds = new HashSet<>();

        if (configs != null) {
            for (Map<String, Object> config : configs) {
                String topicId = (String) config.get("TOPIC_ID");
                if (topicId == null) {
                    continue;
                }

                // H-5: DB_SCHEMA/DB_TABLE_NAME 누락 시 "null.IF_..." 깨진 라우트를 만들지 않고,
                //      조용한 no-poll 대신 명시적 ERROR 로그 + 라우트 생략(fail-loud)한다.
                //      (저장 시 방지는 C-5 콘솔 검증에서 담당 — 여기선 시드/직접 INSERT 로 유입된 결함을 런타임 방어.)
                String schema = trimToNull(config.get("DB_SCHEMA"));
                String table = trimToNull(config.get("DB_TABLE_NAME"));
                if (schema == null || table == null) {
                    log.error("[DbInbound] 설정 오류 — DB_SCHEMA/DB_TABLE_NAME 누락으로 라우트 생략."
                                    + " topicId={}, DB_SCHEMA={}, DB_TABLE_NAME={} — 콘솔에서 스키마/테이블을 채워야 폴링됩니다.",
                            topicId, config.get("DB_SCHEMA"), config.get("DB_TABLE_NAME"));
                    continue;
                }

                String routeId = CamelRouteIds.inboundDb(topicId);
                desiredRouteIds.add(routeId);

                if (camelContext.getRoute(routeId) == null) {
                    String tableName = schema + "." + table;
                    long interval = pollInterval(config);
                    addTopicRoute(topicId, tableName, interval);
                }
            }
        }

        // 비활성/삭제된 토픽 라우트 제거 (stop 후 remove).
        // 주의: refresh 라우트(inbound-db-refresh)도 접두사에 걸리므로 반드시 제외한다.
        for (Route route : camelContext.getRoutes()) {
            String id = route.getRouteId();
            if (isTopicRoute(id) && !desiredRouteIds.contains(id)) {
                camelContext.getRouteController().stopRoute(id);
                camelContext.removeRoute(id);
                log.info("[DbInbound] 라우트 제거 - {}", id);
            }
        }
    }

    private void addTopicRoute(String topicId, String tableName, long interval) throws Exception {
        String routeId = CamelRouteIds.inboundDb(topicId);
        camelContext.addRoutes(new RouteBuilder() {
            @Override
            public void configure() {
                from("timer://" + routeId + "?period=" + interval + "&delay=0")
                        .routeId(routeId)
                        .process(ex -> dbInboundHandler.pollAndSend(topicId, tableName));
            }
        });
        log.info("[DbInbound] 라우트 등록 - Topic: {}, Table: {}, Interval: {}ms", topicId, tableName, interval);
    }

    private void refreshQuietly() {
        try {
            refresh();
        } catch (Exception e) {
            log.error("[DbInbound] 설정 갱신 실패", e);
        }
    }

    private long countTopicRoutes() {
        return camelContext.getRoutes().stream()
                .filter(r -> isTopicRoute(r.getRouteId()))
                .count();
    }

    /** 토픽 폴 라우트(inbound-db-&lt;topic&gt;) 여부. refresh 라우트(inbound-db-refresh)는 제외. */
    private boolean isTopicRoute(String routeId) {
        return routeId.startsWith(CamelRouteIds.INBOUND_DB_PREFIX) && !routeId.equals(REFRESH_ROUTE_ID);
    }

    private long pollInterval(Map<String, Object> config) {
        Object interval = config.get("POLLING_INTERVAL_MS");
        if (interval instanceof Number number) {
            return number.longValue();
        }
        return DEFAULT_POLL_INTERVAL_MS;
    }

    /** null/공백 방어 — 값이 없거나 trim 후 빈 문자열이면 null. (H-5 "null.IF_..." 결합 방지) */
    private static String trimToNull(Object v) {
        if (v == null) {
            return null;
        }
        String s = v.toString().trim();
        return s.isEmpty() ? null : s;
    }
}
