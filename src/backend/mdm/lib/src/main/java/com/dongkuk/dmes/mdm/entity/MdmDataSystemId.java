package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * {@link MdmDataSystem} 복합 PK({@code MARU_DATA_ID, SYSTEM_CODE}) — {@code @IdClass} 대상.
 *
 * <p>필드명은 {@link MdmDataSystem} 의 {@code @Id} 필드명과 정확히 같아야 한다(JPA {@code @IdClass} 계약).
 */
public class MdmDataSystemId implements Serializable {

    private String maruDataId;
    private String systemCode;

    public MdmDataSystemId() {
        // JPA 기본 생성자
    }

    public MdmDataSystemId(String maruDataId, String systemCode) {
        this.maruDataId = maruDataId;
        this.systemCode = systemCode;
    }

    public String getMaruDataId() { return maruDataId; }
    public String getSystemCode() { return systemCode; }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmDataSystemId other)) {
            return false;
        }
        return Objects.equals(maruDataId, other.maruDataId) && Objects.equals(systemCode, other.systemCode);
    }

    @Override
    public int hashCode() {
        return Objects.hash(maruDataId, systemCode);
    }
}
