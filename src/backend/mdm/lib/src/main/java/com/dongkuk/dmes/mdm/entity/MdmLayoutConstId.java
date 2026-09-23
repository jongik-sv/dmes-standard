package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * {@link MdmLayoutConst} 복합 PK({@code LAYOUT_ID, HEADER_LAYOUT_ID, HEADER_SEQ}) — {@code @IdClass} 대상.
 *
 * <p>필드명은 {@link MdmLayoutConst} 의 {@code @Id} 필드명과 정확히 같아야 한다(JPA {@code @IdClass} 계약).
 */
public class MdmLayoutConstId implements Serializable {

    private Long layoutId;
    private Long headerLayoutId;
    private Integer headerSeq;

    public MdmLayoutConstId() {
        // JPA 기본 생성자
    }

    public MdmLayoutConstId(Long layoutId, Long headerLayoutId, Integer headerSeq) {
        this.layoutId = layoutId;
        this.headerLayoutId = headerLayoutId;
        this.headerSeq = headerSeq;
    }

    public Long getLayoutId() { return layoutId; }
    public Long getHeaderLayoutId() { return headerLayoutId; }
    public Integer getHeaderSeq() { return headerSeq; }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmLayoutConstId other)) {
            return false;
        }
        return Objects.equals(layoutId, other.layoutId)
                && Objects.equals(headerLayoutId, other.headerLayoutId)
                && Objects.equals(headerSeq, other.headerSeq);
    }

    @Override
    public int hashCode() {
        return Objects.hash(layoutId, headerLayoutId, headerSeq);
    }
}
