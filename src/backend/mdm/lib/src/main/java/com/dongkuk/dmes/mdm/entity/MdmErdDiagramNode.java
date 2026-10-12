package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/** ERD 다이어그램 위의 표 — {@code TB_MDM_ERD_DIAGRAM_NODE}. TABLE_UUID 는 모델 JSON 의 표 키다. 감사 카운터는 {@code VER}. */
@Entity
@Table(name = "TB_MDM_ERD_DIAGRAM_NODE")
@IdClass(MdmErdDiagramNodeId.class)
public class MdmErdDiagramNode extends CactusAuditEntity {

    @Id @Column(name = "DIAGRAM_ID", length = 50) private String diagramId;
    @Id @Column(name = "TABLE_UUID", length = 50) private String tableUuid;
    @Column(name = "POS_X", nullable = false) private int posX;
    @Column(name = "POS_Y", nullable = false) private int posY;
    @Column(name = "FOLD_MODE", nullable = false) private String foldMode;
    /** 표 너비·높이(V8). NULL = 자동 크기. */
    @Column(name = "SIZE_W") private Integer sizeW;
    @Column(name = "SIZE_H") private Integer sizeH;

    protected MdmErdDiagramNode() {
        // JPA 기본 생성자
    }

    public MdmErdDiagramNode(String diagramId, String tableUuid, int posX, int posY, String foldMode) {
        this.diagramId = diagramId;
        this.tableUuid = tableUuid;
        this.posX = posX;
        this.posY = posY;
        this.foldMode = foldMode;
    }

    public String getDiagramId() { return diagramId; }
    public String getTableUuid() { return tableUuid; }
    public int getPosX() { return posX; }
    public void setPosX(int v) { this.posX = v; }
    public int getPosY() { return posY; }
    public void setPosY(int v) { this.posY = v; }
    public String getFoldMode() { return foldMode; }
    public void setFoldMode(String v) { this.foldMode = v; }
    public Integer getSizeW() { return sizeW; }
    public void setSizeW(Integer v) { this.sizeW = v; }
    public Integer getSizeH() { return sizeH; }
    public void setSizeH(Integer v) { this.sizeH = v; }
}
