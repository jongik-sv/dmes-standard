package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link MdmErdCmdLog} 복합 PK(ERD_MODEL_ID, REV). */
public class MdmErdCmdLogId implements Serializable {

    private String erdModelId;
    private long rev;

    public MdmErdCmdLogId() {
    }

    public MdmErdCmdLogId(String erdModelId, long rev) {
        this.erdModelId = erdModelId;
        this.rev = rev;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof MdmErdCmdLogId other && Objects.equals(erdModelId, other.erdModelId) && rev == other.rev;
    }

    @Override
    public int hashCode() {
        return Objects.hash(erdModelId, rev);
    }
}
