package com.dongkuk.caravan.hub.camel;

import java.util.List;

import org.apache.camel.CamelContext;
import org.apache.camel.Route;
import org.apache.camel.ServiceStatus;
import org.apache.camel.spi.RouteController;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Camel 라우트 생명주기 제어 서비스.
 *
 * <p>{@link CamelContext#getRouteController()} 를 감싸 라우트 start/stop/suspend/resume/status 를 노출한다.
 * P3/P4 의 <b>큐막기(전송 실패 시 컨테이너 pause)</b> 와 caravan-console 소비제어 연동의 단일 진입점이며,
 * D11 폴링주기 실시간 반영(해당 라우트만 재기동)도 이 서비스를 경유한다.</p>
 *
 * <p>P2 단계에서는 라우트가 없어 {@link #listRouteIds()} 가 빈 목록을 반환한다(골격 검증용).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CamelRouteControlService {

    private final CamelContext camelContext;

    /**
     * 현재 CamelContext 에 등록된 모든 라우트 ID.
     *
     * @return 라우트 ID 목록(없으면 빈 목록)
     */
    public List<String> listRouteIds() {
        return camelContext.getRoutes().stream()
                .map(Route::getRouteId)
                .toList();
    }

    /**
     * 라우트 존재 여부.
     *
     * @param routeId 라우트 ID
     * @return 존재하면 {@code true}
     */
    public boolean routeExists(String routeId) {
        return camelContext.getRoute(routeId) != null;
    }

    /**
     * 라우트 상태 조회.
     *
     * @param routeId 라우트 ID
     * @return {@link ServiceStatus} (미존재 시 {@code null})
     */
    public ServiceStatus getRouteStatus(String routeId) {
        return camelContext.getRouteController().getRouteStatus(routeId);
    }

    /**
     * 라우트 기동.
     *
     * @param routeId 라우트 ID
     */
    public void startRoute(String routeId) {
        run("startRoute", routeId, rc -> rc.startRoute(routeId));
    }

    /**
     * 라우트 정지.
     *
     * @param routeId 라우트 ID
     */
    public void stopRoute(String routeId) {
        run("stopRoute", routeId, rc -> rc.stopRoute(routeId));
    }

    /**
     * 라우트 일시중지(큐막기 — 소비 중단, 라우트는 유지).
     *
     * @param routeId 라우트 ID
     */
    public void suspendRoute(String routeId) {
        run("suspendRoute", routeId, rc -> rc.suspendRoute(routeId));
    }

    /**
     * 라우트 재개.
     *
     * @param routeId 라우트 ID
     */
    public void resumeRoute(String routeId) {
        run("resumeRoute", routeId, rc -> rc.resumeRoute(routeId));
    }

    private void run(String op, String routeId, RouteControllerAction action) {
        RouteController controller = camelContext.getRouteController();
        try {
            action.apply(controller);
            log.info("[CamelRouteControl] {} 성공 - routeId={}", op, routeId);
        } catch (Exception e) {
            log.error("[CamelRouteControl] {} 실패 - routeId={}", op, routeId, e);
            throw new IllegalStateException(
                    "Camel 라우트 제어 실패: op=" + op + ", routeId=" + routeId, e);
        }
    }

    @FunctionalInterface
    private interface RouteControllerAction {
        void apply(RouteController controller) throws Exception;
    }
}
