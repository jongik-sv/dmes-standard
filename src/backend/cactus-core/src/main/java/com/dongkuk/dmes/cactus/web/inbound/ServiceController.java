package com.dongkuk.dmes.cactus.web.inbound;

import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;

/**
 * OASIS 서비스 진입점 (no-action 패턴).
 *
 * <pre>
 * POST /service/{serviceId}              ← 트랜잭션 의도. ServiceContext "action"=execute.
 * POST /query/service/{serviceId}        ← 조회 의도. ServiceContext "action"=query.
 * POST /lov/service/{serviceId}          ← LoV 의도. ServiceContext "action"=lov (결과 중 "lov" 키를 화면이 쓴다).
 * </pre>
 *
 * <p>기존 {@code OasisController} ({@code /oasis/{serviceId}/{action}}) 가 BPMN 게이트웨이
 * 분기를 위해 path 의 두 번째 segment 를 action 으로 받는 데 비해, 본 컨트롤러는 dmes-film 의
 * {@code /service}/{@code /query/service} 컨벤션과 호환되도록 action 을 경로에서 분리한다.
 *
 * <p>등록 조건: {@code cactus.inbound.service-routes.enabled=true} 일 때만(기본 꺼짐, {@link InboundAutoConfiguration}).
 * 이 경로는 아무 BPMN 이나 고정 action 으로 실행하므로 권한 판정이 {@code /oasis} 와 같은 OBJECT 권한 키를 볼 수 있어야 한다.
 * 지금 BFF·mcm 권한 필터는 이 경로를 거부하고, mdm 등 권한 필터가 없는 모듈은 이 스위치가 유일한 방어다(2026-10-07).
 *
 * <p>두 엔드포인트의 차이는 의도(intent) 표시이며 실제 트랜잭션 경계는 BPMN 정의와
 * {@link com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration} 의
 * {@link com.dongkuk.oasis.service.ServiceStarter} 빈 종류(transactional vs non-transactional) 가 결정한다.
 *
 * <p>응답은 cactus 표준 {@link CactusResponse} (meta + data + grids + errors 구조) 를 그대로 사용한다.
 */
@ResponseBody
@RequestMapping
public class ServiceController {

    /** ServiceContext "action" 키에 들어가는 트랜잭션 인텐트 값. */
    private static final String ACTION_EXECUTE = "execute";
    /** ServiceContext "action" 키에 들어가는 조회 인텐트 값. */
    private static final String ACTION_QUERY = "query";
    /** ServiceContext "action" 키에 들어가는 LoV 인텐트 값. */
    private static final String ACTION_LOV = "lov";

    /** OASIS 서비스 실행기 */
    private final OasisServiceExecutor executor;

    public ServiceController(OasisServiceExecutor executor) {
        this.executor = executor;
    }

    /**
     * 트랜잭션 의도의 OASIS 서비스 실행.
     */
    @PostMapping("/service/{serviceId}")
    public CactusResponse service(
            @PathVariable("serviceId") String serviceId,
            @RequestBody CactusRequest request) {

        return executor.execute(serviceId, ACTION_EXECUTE, request);
    }

    /**
     * 조회 의도의 OASIS 서비스 실행.
     */
    @PostMapping("/query/service/{serviceId}")
    public CactusResponse queryService(
            @PathVariable("serviceId") String serviceId,
            @RequestBody CactusRequest request) {

        return executor.execute(serviceId, ACTION_QUERY, request);
    }

    /**
     * OASIS service 로 LoV 조회. ServiceContext "action"=lov 로 호출되며,
     * BPMN 결과 중 "lov" 키 (또는 전체 result) 가 화면에서 사용된다.
     */
    @PostMapping("/lov/service/{serviceId}")
    public CactusResponse lovService(
            @PathVariable("serviceId") String serviceId,
            @RequestBody CactusRequest request) {

        return executor.execute(serviceId, ACTION_LOV, request);
    }
}
