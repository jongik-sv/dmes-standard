package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.contract.version.MaruObjectStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 마루 코드 — {@code TB_MDM_CODE}(TSK-06-01 design.md §6.0.1, ERD {@code 04-master-code.sql}).
 *
 * <p>배포 칸 {@code LAST_CHG_SEQ} 는 매핑하지 않는다(D2, D-019·ADR-0002 D7) — INSERT 가 DB 기본값 0 을 쓴다. 원천 시스템
 * {@code SOURCE_SYSTEM}({@code TB_MDM_SYSTEM} FK)은 연관관계 없이 원시 필드로만 둔다. 엔티티 경로의 기본값 정본은 필드
 * 초기값이다 — Hibernate 는 매핑한 칼럼에 null 을 명시해 DDL DEFAULT 를 무력화한다(F27 ①).
 */
@Entity
@Table(name = "TB_MDM_CODE")
public class MdmCode extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_CODE_ID", length = 50)
    private String maruCodeId;

    @Column(name = "MARU_CODE_NAME", nullable = false)
    private String maruCodeName;

    @Column(name = "STATUS", length = 20, nullable = false)
    private String status = MaruObjectStatus.CREATED.name();

    @Column(name = "SOURCE_KIND", length = 20, nullable = false)
    private String sourceKind;

    /** {@code TB_MDM_SYSTEM.SYSTEM_CODE} FK. 원시 필드로만 둔다. */
    @Column(name = "SOURCE_SYSTEM", length = 20)
    private String sourceSystem;

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
    private int lvlCnt = MasterCodeConventions.LVL_CNT_DEFAULT;

    protected MdmCode() {
        // JPA 기본 생성자
    }

    public MdmCode(String maruCodeId, String maruCodeName, String sourceKind) {
        this.maruCodeId = maruCodeId;
        this.maruCodeName = maruCodeName;
        this.sourceKind = sourceKind;
    }

    public String getMaruCodeId() { return maruCodeId; }
    public String getMaruCodeName() { return maruCodeName; }
    public String getStatus() { return status; }
    public String getSourceKind() { return sourceKind; }
    public String getSourceSystem() { return sourceSystem; }
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

    public void setMaruCodeName(String v) { this.maruCodeName = v; }
    public void setStatus(String v) { this.status = v; }
    public void setSourceKind(String v) { this.sourceKind = v; }
    public void setSourceSystem(String v) { this.sourceSystem = v; }
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
}
