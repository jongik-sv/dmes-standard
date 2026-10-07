package com.dongkuk.dmes.cactus.web.inbound;

import com.dongkuk.dmes.cactus.common.ApiResponse;
import com.dongkuk.dmes.cactus.web.inbound.QueryStatementGuard.Exposure;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * MyBatis 쿼리 ID 기반 단순 조회 엔드포인트.
 *
 * <pre>
 * POST /query/{queryId}       ← persistence/query/** 매퍼의 SELECT
 * POST /lov/query/{queryId}   ← persistence/lov/** 매퍼의 SELECT (LoV 행)
 *   - body : 검색 파라미터 JSON (선택)
 *   - query : 동일 키 query string (body 와 병합, body 우선)
 * </pre>
 *
 * <p>OASIS 서비스를 거치지 않는 read-only 경로다. 트랜잭션이나 비즈니스 로직 분기가 필요하면
 * {@code /oasis/{serviceId}/{action}} 을 사용한다.
 *
 * <p>등록 조건: 소비 모듈이 {@link org.apache.ibatis.session.SqlSession} 빈을 제공하고
 * {@code cactus.inbound.query-routes.enabled=true} 일 때만(기본 꺼짐, {@link InboundAutoConfiguration}).
 * 실행할 수 있는 statement 는 {@link QueryStatementGuard} 가 거른다.
 * dmes-film 의 {@code QueryController} 동선과 호환되며, 차이점은 응답을 cactus 표준
 * {@link ApiResponse} 로 통일한 것.
 */
@ResponseBody
@RequestMapping
public class QueryController {

    private static final Logger log = LoggerFactory.getLogger(QueryController.class);

    private final QueryStatementGuard guard;

    /**
     * QueryController 생성자.
     *
     * @param guard statement 노출·종류·행 상한 검사
     */
    public QueryController(QueryStatementGuard guard) {
        this.guard = guard;
    }

    /**
     * MyBatis 쿼리 ID 로 조회한다.
     *
     * @param queryId   {@code {objId}.{action}} — mapper namespace + statement id
     * @param queryParams query string 파라미터
     * @param body      JSON body (선택). body 의 키가 query string 과 충돌하면 body 우선.
     * @return 행 목록을 감싼 {@link ApiResponse}
     */
    @PostMapping(value = "/query/{queryId}",
            consumes = MediaType.ALL_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ApiResponse<List<Map<String, Object>>> query(
            @PathVariable("queryId") String queryId,
            @RequestParam Map<String, String> queryParams,
            @RequestBody(required = false) Map<String, Object> body) {

        Map<String, Object> params = mergeParams(queryParams, body);
        log.info("[query] {} params={}", queryId, params.keySet());
        List<Map<String, Object>> rows = guard.selectList(queryId, params, Exposure.QUERY);
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

        Map<String, Object> params = mergeParams(queryParams, body);
        List<Lov> rows = guard.selectList(queryId, params, Exposure.LOV);
        log.info("[lov.query] {} rows={}", queryId, rows.size());
        return ApiResponse.ok(rows, String.format("%d rows selected.", rows.size()));
    }

    /** query string + body 를 단일 Map 으로 병합한다 (body 우선). */
    private Map<String, Object> mergeParams(Map<String, String> queryParams,
                                            Map<String, Object> body) {
        Map<String, Object> merged = new HashMap<>();
        if (queryParams != null) {
            merged.putAll(queryParams);
        }
        if (body != null) {
            merged.putAll(body);
        }
        return merged;
    }
}
