package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** ERD 다이어그램 — {@code TB_MDM_ERD_DIAGRAM}(버전 밖, 스펙 D6). 감사 카운터는 {@code VER}. */
@Entity
@Table(name = "TB_MDM_ERD_DIAGRAM")
public class MdmErdDiagram extends CactusAuditEntity {

    @Id @Column(name = "DIAGRAM_ID", length = 50) private String diagramId;
    @Column(name = "ERD_MODEL_ID", nullable = false) private String erdModelId;
    @Column(name = "AREA_NAME", nullable = false) private String areaName;
    @Column(name = "DIAGRAM_NAME", nullable = false) private String diagramName;
    @Column(name = "SORT_SEQ", nullable = false) private int sortSeq;

    protected MdmErdDiagram() {
        // JPA 기본 생성자
    }

    public MdmErdDiagram(String diagramId, String erdModelId, String areaName, String diagramName, int sortSeq) {
        this.diagramId = diagramId;
        this.erdModelId = erdModelId;
        this.areaName = areaName;
        this.diagramName = diagramName;
        this.sortSeq = sortSeq;
    }

    public String getDiagramId() { return diagramId; }
    public String getErdModelId() { return erdModelId; }
    public String getAreaName() { return areaName; }
    public void setAreaName(String v) { this.areaName = v; }
    public String getDiagramName() { return diagramName; }
    public void setDiagramName(String v) { this.diagramName = v; }
    public int getSortSeq() { return sortSeq; }
    public void setSortSeq(int v) { this.sortSeq = v; }
}
