package com.dongkuk.dmes.cactus.web.request;

import java.util.Map;

/**
 * DMES 표준 요청 포맷.
 *
 * <pre>
 * {
 *   "meta":   { "userId": "user01", "menuId": "SC001" },
 *   "params": { "plantCd": "P01", "fromDate": "2026-03-01" },
 *   "grids":  { "master": { "rows": [...] } }
 * }
 * </pre>
 *
 * <ul>
 *   <li>meta — 요청 메타 (MUST)</li>
 *   <li>params — 조회 조건, 단건 파라미터. flat key-value (MAY)</li>
 *   <li>grids — 그리드 데이터. key는 그리드 식별자 (MAY)</li>
 * </ul>
 */
public class CactusRequest {

    /** 요청 메타 정보 (사용자 ID, 메뉴 ID 등) */
    private RequestMeta meta;
    /** 조회 조건 또는 단건 파라미터 (flat key-value) */
    private Map<String, Object> params;
    /** 그리드 데이터 (키: 그리드 식별자) */
    private Map<String, GridData> grids;

    /** 기본 생성자. */
    public CactusRequest() {
    }

    /**
     * 전체 필드 생성자.
     *
     * @param meta   요청 메타 정보
     * @param params 조회 조건/단건 파라미터
     * @param grids  그리드 데이터
     */
    public CactusRequest(RequestMeta meta, Map<String, Object> params, Map<String, GridData> grids) {
        this.meta = meta;
        this.params = params;
        this.grids = grids;
    }

    /** 요청 메타 정보를 반환한다. */
    public RequestMeta getMeta() {
        return meta;
    }

    /** 요청 메타 정보를 설정한다. */
    public void setMeta(RequestMeta meta) {
        this.meta = meta;
    }

    /** 조회 조건/단건 파라미터를 반환한다. */
    public Map<String, Object> getParams() {
        return params;
    }

    /** 조회 조건/단건 파라미터를 설정한다. */
    public void setParams(Map<String, Object> params) {
        this.params = params;
    }

    /** 그리드 데이터를 반환한다. */
    public Map<String, GridData> getGrids() {
        return grids;
    }

    /** 그리드 데이터를 설정한다. */
    public void setGrids(Map<String, GridData> grids) {
        this.grids = grids;
    }
}
