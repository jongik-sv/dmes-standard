package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * 마스터데이터 원장 — {@code TB_MDM_DATA}(TSK-07-01 design.md §2·§6.0, ERD {@code 05-master-data.sql}).
 * PK 는 서버·화면이 정하는 코드값({@code MARU_DATA_ID})이라 채번 전략이 없다({@code MdmUnit} 과 같은 모양).
 *
 * <p>{@code SOURCE_SYSTEM}({@code TB_MDM_SYSTEM}) 은 FK 이지만 연관관계 매핑을 쓰지 않는다(불변 규칙 9)
 * — 원시 필드로만 둔다.
 */
@Entity
@Table(name = "TB_MDM_DATA")
public class MdmData extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_DATA_ID", length = 50)
    private String maruDataId;

    @Column(name = "MARU_DATA_NAME", nullable = false)
    private String maruDataName;

    @Column(name = "STATUS", length = 20, nullable = false)
    private String status;

    @Column(name = "SOURCE_KIND", length = 20, nullable = false)
    private String sourceKind;

    /** {@code TB_MDM_SYSTEM.SYSTEM_CODE} 를 가리키는 FK. 원시 필드로만 둔다(불변 규칙 9). */
    @Column(name = "SOURCE_SYSTEM", length = 20)
    private String sourceSystem;

    @Column(name = "CODE_PATTERN", nullable = false)
    private String codePattern;

    @Column(name = "DESCRIPTION")
    private String description;

    @Column(name = "ATTR01_NAME")
    private String attr01Name;
    @Column(name = "ATTR02_NAME")
    private String attr02Name;
    @Column(name = "ATTR03_NAME")
    private String attr03Name;
    @Column(name = "ATTR04_NAME")
    private String attr04Name;
    @Column(name = "ATTR05_NAME")
    private String attr05Name;
    @Column(name = "ATTR06_NAME")
    private String attr06Name;
    @Column(name = "ATTR07_NAME")
    private String attr07Name;
    @Column(name = "ATTR08_NAME")
    private String attr08Name;
    @Column(name = "ATTR09_NAME")
    private String attr09Name;
    @Column(name = "ATTR10_NAME")
    private String attr10Name;

    @Column(name = "LVL_CNT", nullable = false)
    private int lvlCnt;

    @Column(name = "CLOSED_AT")
    private LocalDateTime closedAt;

    /** 원시 long — Hibernate INSERT 는 매핑 칼럼을 전부 명시하므로 DB DEFAULT(0)에 기대지 않는다. */
    @Column(name = "LAST_CHG_SEQ", nullable = false)
    private long lastChgSeq;

    @Column(name = "CHG_SEQ", nullable = false)
    private long chgSeq;

    protected MdmData() {
        // JPA 기본 생성자
    }

    public MdmData(String maruDataId, String maruDataName, String status, String sourceKind, String codePattern) {
        this.maruDataId = maruDataId;
        this.maruDataName = maruDataName;
        this.status = status;
        this.sourceKind = sourceKind;
        this.codePattern = codePattern;
    }

    public String getMaruDataId() { return maruDataId; }
    public String getMaruDataName() { return maruDataName; }
    public String getStatus() { return status; }
    public String getSourceKind() { return sourceKind; }
    public String getSourceSystem() { return sourceSystem; }
    public String getCodePattern() { return codePattern; }
    public String getDescription() { return description; }
    public String getAttr01Name() { return attr01Name; }
    public String getAttr02Name() { return attr02Name; }
    public String getAttr03Name() { return attr03Name; }
    public String getAttr04Name() { return attr04Name; }
    public String getAttr05Name() { return attr05Name; }
    public String getAttr06Name() { return attr06Name; }
    public String getAttr07Name() { return attr07Name; }
    public String getAttr08Name() { return attr08Name; }
    public String getAttr09Name() { return attr09Name; }
    public String getAttr10Name() { return attr10Name; }
    public int getLvlCnt() { return lvlCnt; }
    public LocalDateTime getClosedAt() { return closedAt; }
    public long getLastChgSeq() { return lastChgSeq; }
    public long getChgSeq() { return chgSeq; }

    public void setMaruDataName(String v) { this.maruDataName = v; }
    public void setStatus(String v) { this.status = v; }
    public void setSourceKind(String v) { this.sourceKind = v; }
    public void setSourceSystem(String v) { this.sourceSystem = v; }
    public void setCodePattern(String v) { this.codePattern = v; }
    public void setDescription(String v) { this.description = v; }
    public void setAttr01Name(String v) { this.attr01Name = v; }
    public void setAttr02Name(String v) { this.attr02Name = v; }
    public void setAttr03Name(String v) { this.attr03Name = v; }
    public void setAttr04Name(String v) { this.attr04Name = v; }
    public void setAttr05Name(String v) { this.attr05Name = v; }
    public void setAttr06Name(String v) { this.attr06Name = v; }
    public void setAttr07Name(String v) { this.attr07Name = v; }
    public void setAttr08Name(String v) { this.attr08Name = v; }
    public void setAttr09Name(String v) { this.attr09Name = v; }
    public void setAttr10Name(String v) { this.attr10Name = v; }
    public void setLvlCnt(int v) { this.lvlCnt = v; }
    public void setClosedAt(LocalDateTime v) { this.closedAt = MdmEntityTimes.seconds(v); }
    public void setLastChgSeq(long v) { this.lastChgSeq = v; }
    public void setChgSeq(long v) { this.chgSeq = v; }
}
