package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 컬럼-시스템 매핑(전문 물리명 등) — {@code TB_MDM_COLUMN_SYSTEM}(TSK-04-01 design.md §2,
 * ERD {@code 02-term-domain-column.sql}). 복합 PK 는 {@link MdmColumnSystemId} 로 표현한다.
 *
 * <p>{@code COLUMN_ID}({@code TB_MDM_COLUMN})·{@code SYSTEM_CODE}({@code TB_MDM_SYSTEM}) 모두 FK 이지만
 * 연관관계 매핑을 쓰지 않는다(불변 규칙 9) — 원시 ID 필드로만 둔다. {@code SYSTEM_CODE} 는 부모
 * {@code TB_MDM_SYSTEM.SYSTEM_CODE} 와 같은 콜레이션({@code Latin1_General_100_BIN2})을 유지해야
 * FK 비교가 어긋나지 않는다(불변 규칙 11, F17) — DDL 쪽 책임이고 엔티티는 문자열 그대로 다룬다.
 */
@Entity
@Table(name = "TB_MDM_COLUMN_SYSTEM")
@IdClass(MdmColumnSystemId.class)
public class MdmColumnSystem extends CactusAuditEntity {

    @Id
    @Column(name = "COLUMN_ID")
    private Long columnId;

    @Id
    @Column(name = "SYSTEM_CODE", length = 20)
    private String systemCode;

    @Id
    @Column(name = "PHYS_NAME", length = 50)
    private String physName;

    @Column(name = "TRANSFORM", length = 50)
    private String transform;

    @Column(name = "NOTE")
    private String note;

    protected MdmColumnSystem() {
        // JPA 기본 생성자
    }

    public MdmColumnSystem(Long columnId, String systemCode, String physName) {
        this.columnId = columnId;
        this.systemCode = systemCode;
        this.physName = physName;
    }

    public Long getColumnId() { return columnId; }
    public String getSystemCode() { return systemCode; }
    public String getPhysName() { return physName; }
    public String getTransform() { return transform; }
    public String getNote() { return note; }

    public void setTransform(String v) { this.transform = v; }
    public void setNote(String v) { this.note = v; }
}
