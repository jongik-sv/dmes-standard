package com.dongkuk.dmes.cactus.web.response;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

/**
 * DMES 표준 응답 포맷.
 *
 * <pre>
 * {
 *   "meta":   { "txId": "...", "success": true, "code": "0000" },
 *   "data":   { "totalCount": 150 },
 *   "grids":  { "master": { "rows": [...] } },
 *   "errors": [{ "code": "E001", "message": "..." }]
 * }
 * </pre>
 *
 * <ul>
 *   <li>meta — 응답 메타 (MUST)</li>
 *   <li>data — 단건 결과, 처리 건수 등 (MAY)</li>
 *   <li>grids — 그리드 결과 데이터 (MAY)</li>
 *   <li>errors — 에러 상세 목록 (MAY, meta.success=false 일 때)</li>
 * </ul>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CactusResponse {

    /** 응답 메타 정보 (트랜잭션 ID, 성공 여부, 결과 코드 등) */
    private final ResponseMeta meta;
    /** 단건 결과 또는 처리 건수 등의 데이터 */
    private final Map<String, Object> data;
    /** 그리드 결과 데이터 (키: 그리드 식별자) */
    private final Map<String, GridResult> grids;
    /** 에러 상세 목록 */
    private final List<ErrorDetail> errors;

    /** Builder를 사용하여 응답 객체를 생성한다. */
    private CactusResponse(Builder builder) {
        this.meta = builder.meta;
        this.data = builder.data;
        this.grids = builder.grids;
        this.errors = builder.errors;
    }

    /** 응답 메타 정보를 반환한다. */
    public ResponseMeta getMeta() { return meta; }
    /** 단건 결과 데이터를 반환한다. */
    public Map<String, Object> getData() { return data; }
    /** 그리드 결과 데이터를 반환한다. */
    public Map<String, GridResult> getGrids() { return grids; }
    /** 에러 상세 목록을 반환한다. */
    public List<ErrorDetail> getErrors() { return errors; }

    /** CactusResponse 빌더. */
    public static class Builder {
        /** 응답 메타 (필수) */
        private final ResponseMeta meta;
        private Map<String, Object> data;
        private Map<String, GridResult> grids;
        private List<ErrorDetail> errors;

        /**
         * 빌더를 생성한다.
         *
         * @param meta 응답 메타 정보 (필수)
         */
        public Builder(ResponseMeta meta) {
            this.meta = meta;
        }

        /** 단건 결과 데이터를 설정한다. */
        public Builder data(Map<String, Object> data) {
            this.data = data;
            return this;
        }

        /** 그리드 결과 데이터를 설정한다. */
        public Builder grids(Map<String, GridResult> grids) {
            this.grids = grids;
            return this;
        }

        /** 에러 상세 목록을 설정한다. */
        public Builder errors(List<ErrorDetail> errors) {
            this.errors = errors;
            return this;
        }

        /** CactusResponse 객체를 빌드한다. */
        public CactusResponse build() {
            return new CactusResponse(this);
        }
    }
}
