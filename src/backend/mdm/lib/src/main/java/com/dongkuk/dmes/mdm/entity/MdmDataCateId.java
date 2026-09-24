package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Objects;

/**
 * {@link MdmDataCate} 복합 PK({@code MARU_DATA_ID, CATE_ID, VALID_FROM}) — {@code @IdClass} 대상.
 *
 * <p>필드명은 {@link MdmDataCate} 의 {@code @Id} 필드명과 정확히 같아야 한다(JPA {@code @IdClass} 계약).
 */
public class MdmDataCateId implements Serializable {

    private String maruDataId;
    private String cateId;
    private LocalDateTime validFrom;

    public MdmDataCateId() {
        // JPA 기본 생성자
    }

    public MdmDataCateId(String maruDataId, String cateId, LocalDateTime validFrom) {
        this.maruDataId = maruDataId;
        this.cateId = cateId;
        this.validFrom = validFrom;
    }

    public String getMaruDataId() { return maruDataId; }
    public String getCateId() { return cateId; }
    public LocalDateTime getValidFrom() { return validFrom; }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmDataCateId other)) {
            return false;
        }
        return Objects.equals(maruDataId, other.maruDataId)
                && Objects.equals(cateId, other.cateId)
                && Objects.equals(validFrom, other.validFrom);
    }

    @Override
    public int hashCode() {
        return Objects.hash(maruDataId, cateId, validFrom);
    }
}
