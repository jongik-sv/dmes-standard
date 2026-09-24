package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Objects;

/**
 * {@link MdmDataItem} 복합 PK({@code MARU_DATA_ID, CODE, VALID_FROM}) — {@code @IdClass} 대상.
 *
 * <p>필드명은 {@link MdmDataItem} 의 {@code @Id} 필드명과 정확히 같아야 한다(JPA {@code @IdClass} 계약,
 * {@code MdmLayoutItemId} 선례와 동일). {@code validFrom} 이 PK 에 들어 있는 것 자체가 선분 모델의 증거다
 * (TSK-07-01 design.md F6, 불변 규칙 2).
 */
public class MdmDataItemId implements Serializable {

    private String maruDataId;
    private String code;
    private LocalDateTime validFrom;

    public MdmDataItemId() {
        // JPA 기본 생성자
    }

    public MdmDataItemId(String maruDataId, String code, LocalDateTime validFrom) {
        this.maruDataId = maruDataId;
        this.code = code;
        this.validFrom = validFrom;
    }

    public String getMaruDataId() { return maruDataId; }
    public String getCode() { return code; }
    public LocalDateTime getValidFrom() { return validFrom; }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmDataItemId other)) {
            return false;
        }
        return Objects.equals(maruDataId, other.maruDataId)
                && Objects.equals(code, other.code)
                && Objects.equals(validFrom, other.validFrom);
    }

    @Override
    public int hashCode() {
        return Objects.hash(maruDataId, code, validFrom);
    }
}
