package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * {@link MdmLayoutVer} 복합 PK({@code LAYOUT_ID, LAYOUT_VERSION}) — {@code @IdClass} 대상(TSK-05-03).
 *
 * <p>필드명은 {@link MdmLayoutVer} 의 {@code @Id} 필드명과 정확히 같아야 한다(JPA {@code @IdClass} 계약).
 */
public class MdmLayoutVerId implements Serializable {

    private Long layoutId;
    private Long layoutVersion;

    public MdmLayoutVerId() {
        // JPA 기본 생성자
    }

    public MdmLayoutVerId(Long layoutId, Long layoutVersion) {
        this.layoutId = layoutId;
        this.layoutVersion = layoutVersion;
    }

    public Long getLayoutId() { return layoutId; }
    public Long getLayoutVersion() { return layoutVersion; }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmLayoutVerId other)) {
            return false;
        }
        return Objects.equals(layoutId, other.layoutId) && Objects.equals(layoutVersion, other.layoutVersion);
    }

    @Override
    public int hashCode() {
        return Objects.hash(layoutId, layoutVersion);
    }
}
