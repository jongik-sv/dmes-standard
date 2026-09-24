package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 마스터데이터 배포 대상 시스템 — {@code TB_MDM_DATA_SYSTEM}(TSK-07-01 design.md §2·§6.0, ERD {@code
 * 05-master-data.sql}). 보류 테이블(F3·F4·D2) — DDL·엔티티는 만들되 서비스·화면·리포지토리는 없다
 * (D-019 원칙, 배포 로직은 이 Task 밖). 복합 PK 는 {@link MdmDataSystemId} 로 표현한다.
 *
 * <p>{@code MARU_DATA_ID}({@code TB_MDM_DATA})·{@code SYSTEM_CODE}({@code TB_MDM_SYSTEM}) 모두 FK 이지만
 * 연관관계 매핑을 쓰지 않는다(불변 규칙 9) — 원시 필드로만 둔다.
 */
@Entity
@Table(name = "TB_MDM_DATA_SYSTEM")
@IdClass(MdmDataSystemId.class)
public class MdmDataSystem extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_DATA_ID", length = 50)
    private String maruDataId;

    @Id
    @Column(name = "SYSTEM_CODE", length = 20)
    private String systemCode;

    @Column(name = "DESCRIPTION")
    private String description;

    protected MdmDataSystem() {
        // JPA 기본 생성자
    }

    public MdmDataSystem(String maruDataId, String systemCode) {
        this.maruDataId = maruDataId;
        this.systemCode = systemCode;
    }

    public String getMaruDataId() { return maruDataId; }
    public String getSystemCode() { return systemCode; }
    public String getDescription() { return description; }

    public void setDescription(String v) { this.description = v; }
}
