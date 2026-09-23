package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * {@link MdmColumnSystem} 복합 PK({@code COLUMN_ID, SYSTEM_CODE, PHYS_NAME}) — {@code @IdClass} 대상.
 *
 * <p>필드명은 {@link MdmColumnSystem} 의 {@code @Id} 필드명과 정확히 같아야 한다(JPA {@code @IdClass} 계약).
 */
public class MdmColumnSystemId implements Serializable {

    private Long columnId;
    private String systemCode;
    private String physName;

    public MdmColumnSystemId() {
        // JPA 기본 생성자
    }

    public MdmColumnSystemId(Long columnId, String systemCode, String physName) {
        this.columnId = columnId;
        this.systemCode = systemCode;
        this.physName = physName;
    }

    public Long getColumnId() { return columnId; }
    public String getSystemCode() { return systemCode; }
    public String getPhysName() { return physName; }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmColumnSystemId other)) {
            return false;
        }
        return Objects.equals(columnId, other.columnId)
                && Objects.equals(systemCode, other.systemCode)
                && Objects.equals(physName, other.physName);
    }

    @Override
    public int hashCode() {
        return Objects.hash(columnId, systemCode, physName);
    }
}
