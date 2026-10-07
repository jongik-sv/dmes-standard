package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Objects;

/**
 * {@link MdmDataCateItem} 복합 PK({@code MARU_DATA_ID, CATE_ID, CODE, VALID_FROM}) — {@code @IdClass}
 * 대상. 필드명은 {@link MdmDataCateItem} 의 {@code @Id} 필드명과 정확히 같아야 한다(JPA 계약).
 */
public class MdmDataCateItemId implements Serializable {

    private String maruDataId;
    private String cateId;
    private String code;
    private LocalDateTime validFrom;

    public MdmDataCateItemId() {
        // JPA 기본 생성자
    }

    public MdmDataCateItemId(String maruDataId, String cateId, String code, LocalDateTime validFrom) {
        this.maruDataId = maruDataId;
        this.cateId = cateId;
        this.code = code;
        this.validFrom = MdmEntityTimes.seconds(validFrom);
    }

    public String getMaruDataId() { return maruDataId; }
    public String getCateId() { return cateId; }
    public String getCode() { return code; }
    public LocalDateTime getValidFrom() { return validFrom; }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmDataCateItemId other)) {
            return false;
        }
        return Objects.equals(maruDataId, other.maruDataId)
                && Objects.equals(cateId, other.cateId)
                && Objects.equals(code, other.code)
                && Objects.equals(validFrom, other.validFrom);
    }

    @Override
    public int hashCode() {
        return Objects.hash(maruDataId, cateId, code, validFrom);
    }
}
