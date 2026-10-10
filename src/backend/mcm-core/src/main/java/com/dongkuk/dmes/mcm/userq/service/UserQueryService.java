package com.dongkuk.dmes.mcm.userq.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.userq.dto.UserQueryRequest;
import com.dongkuk.dmes.mcm.userq.entity.UserQueryDef;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryAssignRepository;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryDefRepository;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryStore;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserQuota;
import com.dongkuk.dmes.mcm.widget.query.QueryParam;
import com.dongkuk.dmes.mcm.widget.query.QueryParams;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryResult;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryRunner;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryRunException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 공용 쿼리 조회 OASIS 서비스 {@code userQuery}(스펙 2026-10-10-user-query-program-design §4.2·§6·§7). BPMN services/cmq/userQuery 가 부른다.
 * {@code @Transactional} 을 붙이지 않는다(BackEnd 표준 §6-B-1).
 * <ul>
 *   <li>사용자 ID 는 늘 {@link WidgetUserContextResolver}(인증 컨텍스트)에서 얻는다 — 요청에 사용자 칸이 있어도 읽지 않는다(IDOR).
 *       {@code getDef}·{@code run} 은 매번 DB 에서 (정의 있음, USE_YN='Y', 할당 행 있음)을 다시 확인하고, 하나라도 아니면
 *       같은 문구 「쿼리를 찾을 수 없습니다」로 거절한다(있는지 없는지를 알리지 않는다).</li>
 *   <li>응답에 SQL 을 싣지 않는다. 요청의 sql 칸은 아예 DTO 에 없다.</li>
 *   <li>오류 문구(§6): 값 오류는 WidgetQueryRunner 가 돌려준 BusinessException 문구 그대로. SQL·정의 오류·DB 오류는
 *       {@link WidgetQueryRunException} 의 안전 문구(Kind 구분 없이 getMessage() 그대로 사용자에게)로 바꾸고,
 *       서버 로그에 queryId·userId·원인을 남긴다.</li>
 *   <li>호출 빈도: 사용자마다 1분에 {@value #RUN_LIMIT_PER_MIN} 회({@link WidgetUserQuota}, 사용자 {@value #QUOTA_MAX_USERS}명까지).
 *       넘으면 「잠시 후 다시 조회하세요」.</li>
 * </ul>
 */
@Service("userQueryService")
public class UserQueryService {

    static final int RUN_LIMIT_PER_MIN = 20;
    static final int QUOTA_MAX_USERS = 5000;

    private static final Logger log = LoggerFactory.getLogger(UserQueryService.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final UserQueryDefRepository defRepository;
    private final UserQueryAssignRepository assignRepository;
    private final UserQueryStore store;
    private final WidgetQueryRunner queryRunner;
    private final WidgetUserContextResolver userResolver;
    private final WidgetUserQuota runQuota = new WidgetUserQuota(QUOTA_MAX_USERS);

    @Autowired
    public UserQueryService(UserQueryDefRepository defRepository, UserQueryAssignRepository assignRepository,
                            UserQueryStore store, WidgetQueryRunner queryRunner,
                            WidgetUserContextResolver userResolver) {
        this.defRepository = defRepository;
        this.assignRepository = assignRepository;
        this.store = store;
        this.queryRunner = queryRunner;
        this.userResolver = userResolver;
    }

    /** 내 쿼리 목록 — 자기에게 할당되고 사용 중인 정의만(§4.2 myList). */
    public Map<String, Object> myList(UserQueryRequest req) {
        String userId = currentUserId();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object[] r : store.myList(userId)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("queryId", r[0]);
            m.put("queryNm", r[1]);
            m.put("categoryCd", r[2]);
            m.put("queryDesc", r[3]);
            rows.add(m);
        }
        return Map.of("rows", rows);
    }

    /**
     * 실행 전 정의 — 조회조건·그리드 열을 그리는 데 필요한 것만. SQL 은 싣지 않는다.
     * params 는 위젯 입력 조건(QueryParam) 배열, columns 는 위젯 표 열(TableColumnConfig) 배열로 풀어 돌려준다.
     */
    public Map<String, Object> getDef(UserQueryRequest req) {
        UserQueryDef def = assignedDef(req.getQueryId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("queryId", def.getQueryId());
        out.put("queryNm", def.getQueryNm());
        out.put("categoryCd", def.getCategoryCd());
        out.put("queryDesc", def.getQueryDesc());
        out.put("params", paramsView(parseParams(def)));
        out.put("columns", parseColumns(def.getColumnsJson()));
        out.put("maxRowCnt", def.getMaxRowCnt());
        return out;
    }

    /**
     * 쿼리 실행 — queryId 와 값만 받는다. 행 상한은 정의의 MAX_ROW_CNT(상한+1 행을 읽고 넘으면 버린 뒤 truncated).
     * 시간 상한·읽기 전용 실행은 WidgetQueryRunner 가 정한다.
     */
    public Map<String, Object> run(UserQueryRequest req) {
        String userId = currentUserId();
        if (!runQuota.tryAcquire(userId, System.currentTimeMillis() / 60_000, RUN_LIMIT_PER_MIN)) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "잠시 후 다시 조회하세요");
        }
        UserQueryDef def = assignedDef(req.getQueryId());
        Map<String, String> values = QueryParams.parseValues(req.getParamsJson()); // 값 오류 문구는 그대로 사용자에게
        WidgetQueryResult result;
        try {
            result = queryRunner.run(def.getSqlText(), def.getParamsJson(), values, def.getMaxRowCnt());
        } catch (WidgetQueryRunException e) {
            // kind 로 스펙 §6 문구를 골라 응답에 실고, 원인(detail)은 서버 로그에만 남긴다(§7 — 응답에 detail·cause 문구 금지).
            log.warn("공용 쿼리 실행 실패 queryId={} userId={} kind={} 원인={}", def.getQueryId(), userId, e.kind(), e.detail());
            log.debug("공용 쿼리 실행 실패 상세 queryId={}", def.getQueryId(), e);
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, WidgetQueryRunException.safeMessage(e.kind()));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("columns", result.columns());
        out.put("rows", result.rows());
        out.put("truncated", result.truncated());
        out.put("maxRowCnt", def.getMaxRowCnt());
        return out;
    }

    // ── 도우미 ────────────────────────────────────────────────────────

    private String currentUserId() {
        return userResolver.current().userId();
    }

    /**
     * (정의 있음, USE_YN='Y', 나에게 할당됨) 확인 — 하나라도 아니면 같은 문구로 거절한다(§7 IDOR).
     */
    private UserQueryDef assignedDef(String raw) {
        String queryId = raw == null ? null : raw.strip();
        if (queryId == null || queryId.isEmpty()) throw notFound();
        UserQueryDef def = defRepository.findById(queryId).orElse(null);
        if (def == null || !def.isInUse() || !assignRepository.existsByQueryIdAndUserId(queryId, currentUserId())) {
            throw notFound();
        }
        return def;
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.INVALID_VALUE, "쿼리를 찾을 수 없습니다");
    }

    /**
     * 저장된 입력 정의(PARAMS_JSON)를 푼다. 깨진 정의의 검사 문구(예: 어느 칸이 틀렸는지)는 관리자용이라 사용자에게 보내지 않는다 —
     * 원인은 서버 로그에만 남기고 run 과 같은 DEFINITION 안전 문구(스펙 §6)로 다시 던진다.
     */
    private List<QueryParam> parseParams(UserQueryDef def) {
        try {
            return QueryParams.fromDefsJson(def.getParamsJson());
        } catch (BusinessException e) {
            log.warn("공용 쿼리 입력 정의 오류 queryId={} userId={} 원인={}", def.getQueryId(), currentUserId(), e.getMessage());
            throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                    WidgetQueryRunException.safeMessage(WidgetQueryRunException.Kind.DEFINITION));
        }
    }

    /**
     * 입력 정의 → 응답 모양. enum 을 그대로 직렬화하면 type 이 대문자(NUMBER)로 나가므로 FE 계약의 소문자
     * (text|number|date|select)로 직접 만든다.
     */
    private static List<Map<String, Object>> paramsView(List<QueryParam> params) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (QueryParam p : params) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", p.name());
            m.put("label", p.label());
            m.put("type", p.type().name().toLowerCase(Locale.ROOT));
            m.put("default", p.defaultValue()); // 스펙 §2.2·§4.2 입력 정의 키 — FE 공용 파서(paramsOf)가 default 만 읽는다
            m.put("required", p.required());
            List<Map<String, Object>> options = new ArrayList<>();
            for (QueryParam.Option o : p.options()) {
                Map<String, Object> om = new LinkedHashMap<>();
                om.put("value", o.value());
                om.put("label", o.label());
                options.add(om);
            }
            m.put("options", options);
            out.add(m);
        }
        return out;
    }

    /** columnsJson → 배열(없거나 비었으면 빈 배열). 저장 때 검사를 지났으니 여기서는 풀기만 한다. */
    private static List<Map<String, Object>> parseColumns(String columnsJson) {
        if (columnsJson == null || columnsJson.isBlank()) return List.of();
        try {
            return JSON.readValue(columnsJson, new TypeReference<>() {});
        } catch (Exception e) {
            return List.of();
        }
    }
}
