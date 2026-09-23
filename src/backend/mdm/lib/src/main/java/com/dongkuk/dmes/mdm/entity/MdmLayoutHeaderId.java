package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * {@link MdmLayoutHeader} 복합 PK({@code LAYOUT_ID, SEQ}) — {@code @IdClass} 대상.
 *
 * <p>필드명은 {@link MdmLayoutHeader} 의 {@code @Id} 필드명과 정확히 같아야 한다(JPA {@code @IdClass} 계약).
 */
public class MdmLayoutHeaderId implements Serializable {

    private Long layoutId;
    private Integer seq;

    public MdmLayoutHeaderId() {
        // JPA 기본 생성자
    }

    public MdmLayoutHeaderId(Long layoutId, Integer seq) {
        this.layoutId = layoutId;
        this.seq = seq;
    }

    public Long getLayoutId() { return layoutId; }
    public Integer getSeq() { return seq; }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmLayoutHeaderId other)) {
            return false;
        }
        return Objects.equals(layoutId, other.layoutId) && Objects.equals(seq, other.seq);
    }

    @Override
    public int hashCode() {
        return Objects.hash(layoutId, seq);
    }
}
