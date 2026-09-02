package com.dongkuk.dmes.cactus.web.inbound;

import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import org.springframework.web.bind.annotation.*;

/**
 * OASIS 공통 컨트롤러.
 * 모든 MES 화면 API를 단일 엔드포인트로 처리한다.
 *
 * <pre>
 * POST /oasis/{serviceId}/{action}
 * POST /{moduleId}/oasis/{serviceId}/{action}
 * POST /api/{moduleId}/oasis/{serviceId}/{action}
 *   - moduleId: 게이트웨이/BFF prefix. OASIS 실행에는 사용하지 않는다.
 *   - serviceId: BPMN 프로세스 ID와 매핑
 *   - action: ServiceContext에 전달 → BPMN 게이트웨이에서 분기
 * </pre>
 *
 * <p>{@code cactus.oasis.service-group} 프로퍼티는 path 에서 빠졌지만
 * BPMN 라우팅/로깅 식별 용도로
 * {@link com.dongkuk.dmes.cactus.oasis.OasisProperties} 에서 그대로 유지한다.
 *
 * <p>패키지 위치: dmes-film 의 {@code cmn.inbound} 컨벤션과 동일하게
 * {@code Query/Service/Lov/Oasis} 진입 컨트롤러를 한 패키지 ({@code web.inbound}) 에 모은다.
 */
@ResponseBody
@RequestMapping({"/oasis", "/{moduleId}/oasis", "/api/{moduleId}/oasis"})
public class OasisController {

    /** OASIS 서비스 실행기 */
    private final OasisServiceExecutor executor;

    /**
     * OasisController 생성자.
     * @param executor OASIS 서비스 실행기
     */
    public OasisController(OasisServiceExecutor executor) {
        this.executor = executor;
    }

    /**
     * 서비스 요청을 처리하는 단일 엔드포인트.
     * @param request    요청 본문
     * @param serviceId  BPMN 프로세스 ID
     * @param action     수행할 액션 (search, save 등)
     * @return 서비스 실행 결과 응답
     */
    @PostMapping("/{serviceId}/{action}")
    public CactusResponse handle(
            @RequestBody CactusRequest request,
            @PathVariable("serviceId") String serviceId,
            @PathVariable("action") String action) {

        return executor.execute(serviceId, action, request);
    }
}
