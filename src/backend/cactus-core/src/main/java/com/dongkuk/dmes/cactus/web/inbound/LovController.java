package com.dongkuk.dmes.cactus.web.inbound;

import com.dongkuk.dmes.cactus.common.ApiResponse;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import org.apache.ibatis.session.SqlSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 드롭다운/콤보용 LoV 전용 엔드포인트.
 *
 * <pre>
 * GET  /lov/master/{code}              ← MasterCodeProvider 가 등록된 경우만
 * GET  /lov/master/{code}/{group}      ← 그룹 분류 포함
 * POST /lov/query/{queryId}            ← MyBatis 쿼리로 LoV 조회
 * POST /lov/service/{serviceId}        ← OASIS service 결과 중 "lov" 키만 추출
 * </pre>
 *
 * <p>기존 {@code /query/*} / {@code /service/*} 와 분리한 이유는 LoV 호출이 드롭다운 초기화 시
 * 다수 동시 발생하는 패턴이라 캐시·로깅·메트릭 정책을 별도로 적용하기 위함. dmes-film 의
 * {@code LovController} 와 동일한 분리 의도.
 *
 * <p>응답:
 * <ul>
 *   <li>master / query: {@link ApiResponse}{@code <List<Lov>>}</li>
 *   <li>service: {@link CactusResponse} (data 의 {@code lov} 키만 의미 있음)</li>
 * </ul>
 */
@ResponseBody
@RequestMapping
public class LovController {

    private static final Logger log = LoggerFactory.getLogger(LovController.class);

    /** ServiceContext "action" 키에 들어가는 LoV 인텐트 값. */
    private static final String ACTION_LOV = "lov";

    private final SqlSession sqlSession;
    private final OasisServiceExecutor executor;
    private final ObjectProvider<MasterCodeProvider> masterCodeProvider;

    public LovController(SqlSession sqlSession,
                         OasisServiceExecutor executor,
                         ObjectProvider<MasterCodeProvider> masterCodeProvider) {
        this.sqlSession = sqlSession;
        this.executor = executor;
        this.masterCodeProvider = masterCodeProvider;
    }

    /**
     * 마스터 코드 LoV 조회 (그룹 미지정).
     */
    @GetMapping("/lov/master/{code}")
    public ApiResponse<List<Lov>> lovMasterRoot(@PathVariable("code") String code) {
        return lovMaster(code, "ROOT");
    }

    /**
     * 마스터 코드 LoV 조회.
     *
     * <p>{@link MasterCodeProvider} 빈이 컨텍스트에 없으면 {@link ErrorCode#UNKNOWN_ERROR} 로 응답한다.
     * (404 보다 상위 호환성 유지).
     */
    @GetMapping("/lov/master/{code}/{group}")
    public ApiResponse<List<Lov>> lovMaster(@PathVariable("code") String code,
                                            @PathVariable("group") String group) {
        MasterCodeProvider provider = masterCodeProvider.getIfAvailable();
        if (provider == null) {
            throw new BusinessException(ErrorCode.UNKNOWN_ERROR,
                    "MasterCodeProvider 가 등록되지 않았습니다");
        }
        List<Lov> rows = provider.findMasterCodeLov(code, group);
        if (rows == null) {
            rows = Collections.emptyList();
        }
        log.info("[lov.master] code={} group={} rows={}", code, group, rows.size());
        return ApiResponse.ok(rows, String.format("%d rows selected.", rows.size()));
    }

    /**
     * MyBatis 쿼리 ID 로 LoV 조회.
     */
    @PostMapping("/lov/query/{queryId}")
    public ApiResponse<List<Lov>> lovQuery(
            @PathVariable("queryId") String queryId,
            @RequestParam Map<String, String> queryParams,
            @RequestBody(required = false) Map<String, Object> body) {

        Map<String, Object> params = new HashMap<>();
        if (queryParams != null) {
            params.putAll(queryParams);
        }
        if (body != null) {
            params.putAll(body);
        }
        List<Lov> rows = sqlSession.selectList(queryId, params);
        log.info("[lov.query] {} rows={}", queryId, rows.size());
        return ApiResponse.ok(rows, String.format("%d rows selected.", rows.size()));
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
