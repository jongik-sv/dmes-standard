package com.dongkuk.dmes.cactus.mdm;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 저장 검증 요청(하위 프로젝트 C spec §6.1) — 업무 서비스 {@code save()} 가 만들어 {@link MdmValidator#check} 에 넘긴다. 검사할 컬럼과 룰 세트를
 * 적는다(암묵 "맞는 키 전부" 없음, C4).
 *
 * @param grid     오류 {@code ErrorDetail.grid} 에 싣는 그리드 이름. 폼 하나면 null
 * @param rows     행(그리드 저장 목록 그대로 — {@code rowStatus}·{@code rowKey} 를 함께 둔다). 키는 화면 키(camelCase 도 된다)
 * @param columns  검사할 컬럼(화면 키 또는 물리명). 컬럼 사전에 없으면 {@code IllegalArgumentException}
 * @param ruleSets 행마다 판정할 룰 세트 ID
 * @param evalTs   판정 시각. null 이면 검증기의 시계로 채운다
 */
public record MdmValidationRequest(String grid, List<Map<String, Object>> rows, List<String> columns, List<String> ruleSets,
                                   Instant evalTs) {

    public MdmValidationRequest {
        rows = rows == null ? List.of() : Collections.unmodifiableList(new ArrayList<>(rows)); // 행 값에 null 이 있어 List.copyOf 를 쓰지 않는다
        columns = columns == null ? List.of() : List.copyOf(columns);
        ruleSets = ruleSets == null ? List.of() : List.copyOf(ruleSets);
    }

    /** 그리드 저장 목록. */
    public static Builder rows(String grid, List<Map<String, Object>> rows) {
        return new Builder(grid, Objects.requireNonNull(rows, "rows"));
    }

    /** 폼 하나 — grid null, rowIndex 0. */
    public static Builder record(Map<String, Object> record) {
        return new Builder(null, Collections.singletonList(Objects.requireNonNull(record, "record")));
    }

    public static final class Builder {

        private final String grid;
        private final List<Map<String, Object>> rows;
        private final List<String> columns = new ArrayList<>();
        private final List<String> ruleSets = new ArrayList<>();
        private Instant evalTs;

        private Builder(String grid, List<Map<String, Object>> rows) {
            this.grid = grid;
            this.rows = rows;
        }

        public Builder columns(String... names) {
            columns.addAll(Arrays.asList(names));
            return this;
        }

        public Builder ruleSet(String setId) {
            ruleSets.add(Objects.requireNonNull(setId, "setId"));
            return this;
        }

        public Builder evalTs(Instant ts) {
            this.evalTs = ts;
            return this;
        }

        public MdmValidationRequest build() {
            return new MdmValidationRequest(grid, rows, columns, ruleSets, evalTs);
        }
    }
}
