package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Objects;

/**
 * {@link MdmLayoutItem} 복합 PK({@code LAYOUT_ID, VER, SEQ}) — {@code @IdClass} 대상.
 *
 * <p>필드명은 엔티티의 {@code @Id} 필드명과 정확히 같아야 한다(JPA {@code @IdClass} 계약). 버전은 {@code scale 3} 으로
 * 맞추고 {@code equals} 는 {@link VersionNumbers#same}, {@code hashCode} 는 {@code stripTrailingZeros} 로 본다.
 */
public class MdmLayoutItemId implements Serializable {

    private Long layoutId;
    private BigDecimal ver;
    private Integer seq;

    public MdmLayoutItemId() {
        // JPA 기본 생성자
    }

    public MdmLayoutItemId(Long layoutId, BigDecimal ver, Integer seq) {
        this.layoutId = layoutId;
        this.ver = VersionNumbers.scaled(ver);
        this.seq = seq;
    }

    public Long getLayoutId() { return layoutId; }
    public BigDecimal getVer() { return ver; }
    public Integer getSeq() { return seq; }

    @Override
    public boolean equals(Object o) {
        return o instanceof MdmLayoutItemId other && Objects.equals(layoutId, other.layoutId)
                && VersionNumbers.same(ver, other.ver) && Objects.equals(seq, other.seq);
    }

    @Override
    public int hashCode() {
        return Objects.hash(layoutId, ver == null ? null : ver.stripTrailingZeros(), seq);
    }
}
