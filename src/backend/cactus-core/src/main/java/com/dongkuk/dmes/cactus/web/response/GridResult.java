package com.dongkuk.dmes.cactus.web.response;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * 그리드 응답 결과.
 * rows는 반드시 배열이며 데이터가 없으면 빈 배열을 사용한다.
 * columns는 사용자별 그리드 개인화(너비, 순서, 숨김, 정렬) 시에만 사용한다.
 */
public class GridResult {

    /** 컬럼 개인화 정보 (사용자별 그리드 개인화 시에만 사용) */
    private List<ColumnMeta> columns;
    /** 행 데이터 목록 */
    private List<Map<String, Object>> rows;

    /** 기본 생성자. 빈 행 목록으로 초기화한다. */
    public GridResult() {
        this.rows = Collections.emptyList();
    }

    /**
     * 행 데이터를 지정하여 생성한다.
     *
     * @param rows 행 데이터 목록 (null이면 빈 목록으로 대체)
     */
    public GridResult(List<Map<String, Object>> rows) {
        this.rows = rows != null ? rows : Collections.emptyList();
    }

    /**
     * 컬럼 메타와 행 데이터를 지정하여 생성한다.
     *
     * @param columns 컬럼 메타 목록
     * @param rows    행 데이터 목록 (null이면 빈 목록으로 대체)
     */
    public GridResult(List<ColumnMeta> columns, List<Map<String, Object>> rows) {
        this.columns = columns;
        this.rows = rows != null ? rows : Collections.emptyList();
    }

    /** 컬럼 메타 목록을 반환한다. */
    public List<ColumnMeta> getColumns() { return columns; }
    /** 컬럼 메타 목록을 설정한다. */
    public void setColumns(List<ColumnMeta> columns) { this.columns = columns; }

    /** 행 데이터 목록을 반환한다. */
    public List<Map<String, Object>> getRows() { return rows; }
    /** 행 데이터 목록을 설정한다. null이면 빈 목록으로 대체한다. */
    public void setRows(List<Map<String, Object>> rows) { this.rows = rows != null ? rows : Collections.emptyList(); }

    /** 행 데이터가 비어있는지 확인한다. */
    public boolean isEmpty() { return rows.isEmpty(); }
    /** 행 데이터 건수를 반환한다. */
    public int size() { return rows.size(); }
}
