package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link MdmErdDiagramNode} 복합 PK(DIAGRAM_ID, TABLE_UUID). */
public class MdmErdDiagramNodeId implements Serializable {

    private String diagramId;
    private String tableUuid;

    public MdmErdDiagramNodeId() {
    }

    public MdmErdDiagramNodeId(String diagramId, String tableUuid) {
        this.diagramId = diagramId;
        this.tableUuid = tableUuid;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof MdmErdDiagramNodeId other && Objects.equals(diagramId, other.diagramId)
                && Objects.equals(tableUuid, other.tableUuid);
    }

    @Override
    public int hashCode() {
        return Objects.hash(diagramId, tableUuid);
    }
}
