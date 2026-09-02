package com.dongkuk.dmes.cactus.web.response;

/**
 * 그리드 개인화 컬럼 정보.
 * 사용자별 그리드 개인화(컬럼 너비, 순서, 숨김, 정렬) 시에만 사용한다.
 * 데이터 타입, 편집 가능 여부, 포맷 등은 프론트엔드 화면 정의(정적 설정)에서 관리한다.
 */
public class ColumnMeta {

    /** 필드명 (rows의 key와 일치) */
    private String name;
    /** 컬럼 너비 (px) */
    private Integer width;
    /** 숨김 여부 */
    private Boolean hidden;
    /** 정렬 방향 (left, center, right) */
    private String align;
    /** 컬럼 표시 순서 (0-based) */
    private Integer order;

    /** 기본 생성자. */
    public ColumnMeta() {
    }

    /**
     * 필드명으로 컬럼 메타를 생성한다.
     *
     * @param name 필드명 (rows의 key와 일치)
     */
    public ColumnMeta(String name) {
        this.name = name;
    }

    /** 필드명을 반환한다. */
    public String getName() { return name; }
    /** 필드명을 설정한다. */
    public void setName(String name) { this.name = name; }

    /** 컬럼 너비를 반환한다. */
    public Integer getWidth() { return width; }
    /** 컬럼 너비를 설정한다. */
    public void setWidth(Integer width) { this.width = width; }

    /** 숨김 여부를 반환한다. */
    public Boolean getHidden() { return hidden; }
    /** 숨김 여부를 설정한다. */
    public void setHidden(Boolean hidden) { this.hidden = hidden; }

    /** 정렬 방향을 반환한다. */
    public String getAlign() { return align; }
    /** 정렬 방향을 설정한다. */
    public void setAlign(String align) { this.align = align; }

    /** 컬럼 표시 순서를 반환한다. */
    public Integer getOrder() { return order; }
    /** 컬럼 표시 순서를 설정한다. */
    public void setOrder(Integer order) { this.order = order; }
}
