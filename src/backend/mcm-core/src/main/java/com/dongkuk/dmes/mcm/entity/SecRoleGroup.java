/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecRoleGroup 엔티티 — TB_MCM_SEC_ROLEGROUP (역할 그룹 마스터) 본 컬럼 1:1 정의 (commRoleGrpMng 화면 owner / W4)
 */
package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 역할 그룹 마스터 — {@code TB_MCM_SEC_ROLEGROUP} (As-Is) JPA Entity (commRoleGrpMng 화면 owner / W4).
 *
 * <p>스키마 = {@code MCMAPUSER} (csa 9 화면 공통 정책 — 사용자 결정 2026-05-31 / W1·W2·W3 동일).
 * 테이블명 대문자 prefix 보존.
 *
 * <p>분석리포트 §9.9.1 (As-Is DMES 시트 24 컬럼 — TB_MCM_SEC_ROLEGROUP) 중 본 화면 본 6 컬럼 (To-Be 정책 #1 적용):
 * <ul>
 *   <li>PK 단일 = ROLE_GROUP_ID</li>
 *   <li>본 6 컬럼: ROLE_GROUP_ID(PK) / ROLE_GROUP_NM / ROLE_GROUP_DESC /
 *       BIZ_SYSTEM_CODE (To-Be 정책 #1 폐기 — Entity 미반영) /
 *       USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE</li>
 *   <li>audit 17 컬럼 (DMES 카탈로그) 폐기 → McmAuditEntity 9 컬럼 표준화</li>
 * </ul>
 *
 * <p>As-Is {@code ref_Audit} fragment (CREATED_OBJECT_* / LAST_UPDATED_* 호출) 폐기 →
 * mcm-core {@link McmAuditEntity} 의 C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID /
 * U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER 9 컬럼 + JPA {@code @PrePersist} / {@code @PreUpdate}
 * 자동 채움 (정책 #6 (A) — cma 정본 / W1·W2·W3 동일 패턴).
 *
 * <p>인용:
 * <ul>
 *   <li>분석리포트 §9.1 / §9.9.1 (As-Is 컬럼 카탈로그 24)</li>
 *   <li>분석리포트 §11.1 / §12 (To-Be 명명 안 — Entity = SecRoleGroup / Repository = SecRoleGroupRepository / 모듈 직속)</li>
 *   <li>As-Is Mapper {@code CommRoleGrpMngMapper.selectCommRoleGrp / insertCommRoleGrp / updateCommRoleGrp / deleteCommRoleGrp}</li>
 *   <li>기존 mcm-core legacy entity ({@code com.dongkuk.dmes.mcm.role.entity.*}) 와 별도 — 본 entity 는 csa commRoleGrpMng 화면 owner</li>
 * </ul>
 */
@Entity
@Table(name = "TB_MCM_SEC_ROLEGROUP", schema = "MCMAPUSER")
public class SecRoleGroup extends McmAuditEntity {

    /** PK — 역할 그룹 식별자 (xfdl G-002 / D-001 / 분석 §9.9.1 #1). VARCHAR(30). */
    @Id
    @Column(name = "ROLE_GROUP_ID", length = 30, nullable = false)
    private String roleGroupId;

    /** 역할 그룹명 (xfdl G-003 / D-003 / 분석 §9.9.1 #2). VARCHAR(100). */
    @Column(name = "ROLE_GROUP_NM", length = 100)
    private String roleGroupNm;

    /** 역할 그룹 설명 (xfdl G-004 / D-004 / 분석 §9.9.1 #3). VARCHAR(300). */
    @Column(name = "ROLE_GROUP_DESC", length = 300)
    private String roleGroupDesc;

    /**
     * 사용 여부 — "Y" / "N" (xfdl G-006 / S-004 / D-005 Radio / 분석 §9.9.1 #5).
     * 신규 행 default 'Y' (xfdl:716). VARCHAR(1).
     */
    @Column(name = "USE_TP", length = 1)
    private String useTp;

    /**
     * 유효 개시일 (xfdl G-007 / D-006 / 분석 §9.9.1 #6 — As-Is 신규 행 default {@code gfn_today()} 8자, xfdl:717).
     * As-Is DATE 타입 + 8자 format → To-Be {@link LocalDateTime} (cma 패턴 / W3 동일).
     */
    @Column(name = "START_ACTIVE_DATE")
    private LocalDateTime startActiveDate;

    /**
     * 유효 기한일 (xfdl G-008 / D-007 / 분석 §9.9.1 #7 — As-Is 신규 행 default "99991231" 8자, xfdl:718 / ST-002).
     * To-Be 정정 (cma 패턴 / W3 동일) = {@code 9999-12-31 23:59:59}.
     */
    @Column(name = "END_ACTIVE_DATE")
    private LocalDateTime endActiveDate;

    public SecRoleGroup() {}

    // ── getter / setter ──

    public String getRoleGroupId() { return roleGroupId; }
    public void setRoleGroupId(String roleGroupId) { this.roleGroupId = roleGroupId; }

    public String getRoleGroupNm() { return roleGroupNm; }
    public void setRoleGroupNm(String roleGroupNm) { this.roleGroupNm = roleGroupNm; }

    public String getRoleGroupDesc() { return roleGroupDesc; }
    public void setRoleGroupDesc(String roleGroupDesc) { this.roleGroupDesc = roleGroupDesc; }

    public String getUseTp() { return useTp; }
    public void setUseTp(String useTp) { this.useTp = useTp; }

    public LocalDateTime getStartActiveDate() { return startActiveDate; }
    public void setStartActiveDate(LocalDateTime startActiveDate) { this.startActiveDate = startActiveDate; }

    public LocalDateTime getEndActiveDate() { return endActiveDate; }
    public void setEndActiveDate(LocalDateTime endActiveDate) { this.endActiveDate = endActiveDate; }
}
