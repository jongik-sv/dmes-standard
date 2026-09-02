/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecRole 엔티티 — TB_MCM_SEC_ROLE (역할 마스터) 본 컬럼 1:1 정의 (commRoleMng 화면 owner / W3)
 */
package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 역할 마스터 — {@code TB_MCM_SEC_ROLE} (As-Is) JPA Entity (commRoleMng 화면 owner / W3).
 *
 * <p>스키마 = {@code MCMAPUSER} (csa 9 화면 공통 정책 — 사용자 결정 2026-05-31 / W1·W2 동일).
 * 테이블명 대문자 prefix 보존.
 *
 * <p>분석리포트 §9.4.1 (As-Is DMES 시트 26 컬럼 — TB_MCM_SEC_ROLE) 중 본 화면 본 9 컬럼 (To-Be 정책 #1 적용):
 * <ul>
 *   <li>PK 단일 = ROLE_ID</li>
 *   <li>본 9 컬럼: ROLE_ID(PK) / ROLE_NM / ROLE_DESC / PARENT_ROLE_ID / MENU_ID /
 *       BIZ_SYSTEM_CODE (To-Be 정책 #1 폐기 — Entity 미반영) /
 *       USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE</li>
 *   <li>audit 17 컬럼 (DMES 카탈로그) 폐기 → McmAuditEntity 9 컬럼 표준화</li>
 * </ul>
 *
 * <p>As-Is {@code ref_Audit} fragment (CREATED_OBJECT_* / LAST_UPDATED_* 6 회 호출) 폐기 →
 * mcm-core {@link McmAuditEntity} 의 C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID /
 * U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER 9 컬럼 + JPA {@code @PrePersist} / {@code @PreUpdate}
 * 자동 채움 (정책 #6 (A) — cma 정본 / W1·W2 동일 패턴).
 *
 * <p>인용:
 * <ul>
 *   <li>분석리포트 §9.1 / §9.4.1 (As-Is 컬럼 카탈로그 26)</li>
 *   <li>분석리포트 §11.1 / §11 #19 (To-Be 명명 안 — Entity = SecRole / Repository = SecRoleRepository / 모듈 직속)</li>
 *   <li>As-Is Mapper {@code CommRoleMngMapper.selectCommRole / insertCommRole / updateCommRole / deleteCommRole}</li>
 *   <li>기존 mcm-core legacy entity ({@code com.dongkuk.dmes.mcm.role.entity.*}) 와 별도 — 본 entity 는 csa commRoleMng 화면 owner</li>
 * </ul>
 */
@Entity
@Table(name = "TB_MCM_SEC_ROLE", schema = "MCMAPUSER")
public class SecRole extends McmAuditEntity {

    /** PK — 역할 식별자 (xfdl G-002 / D-002 / 분석 §9.4.1 #1). VARCHAR(30). */
    @Id
    @Column(name = "ROLE_ID", length = 30, nullable = false)
    private String roleId;

    /** 역할 명 (xfdl G-003 / D-005 / 분석 §9.4.1 #2 — V-006 필수 검증). VARCHAR(100). */
    @Column(name = "ROLE_NM", length = 100)
    private String roleNm;

    /** 역할 설명 (xfdl G-004 / D-006 / 분석 §9.4.1 #3). VARCHAR(300). */
    @Column(name = "ROLE_DESC", length = 300)
    private String roleDesc;

    /**
     * 부모 역할 식별자 (xfdl 본 화면 미사용 — 부모역할 부여 화면 정본 / 분석 §9.4.1 #4).
     * 본 화면 BPMN searchCmRoleMapPnt / pntRoleIdPop action 모두 As-Is 미호출 → To-Be 제거.
     * 단 컬럼 자체는 DDL 보존 (다른 화면 사용 가능성). VARCHAR(30).
     */
    @Column(name = "PARENT_ROLE_ID", length = 30)
    private String parentRoleId;

    /** 메뉴 ID — FK to TB_MCM_SEC_MENU_FLD (xfdl G-005 / D-003 / 분석 §9.4.1 #5). VARCHAR(30). */
    @Column(name = "MENU_ID", length = 30)
    private String menuId;

    /**
     * 사용 여부 — "Y" / "N" (xfdl G-007 / S-004 / D-007 RadioGroup / 분석 §9.4.1 #7).
     * 신규 행 default 'Y' (xfdl:692/722). VARCHAR(1).
     */
    @Column(name = "USE_TP", length = 1)
    private String useTp;

    /**
     * 유효 개시일 (xfdl G-008 / D-008 / 분석 §9.4.1 #8 — As-Is 신규 행 default {@code gfn_today()} 8자, xfdl:694).
     * As-Is DATE 타입 + 8자 format → To-Be {@link LocalDateTime} (cma 패턴).
     */
    @Column(name = "START_ACTIVE_DATE")
    private LocalDateTime startActiveDate;

    /**
     * 유효 기한일 (xfdl G-009 / D-009 / 분석 §9.4.1 #9 — As-Is 신규 행 default "99991231" 8자, xfdl:695).
     * To-Be 정정 (cma 패턴) = {@code 9999-12-31 23:59:59}.
     */
    @Column(name = "END_ACTIVE_DATE")
    private LocalDateTime endActiveDate;

    public SecRole() {}

    // ── getter / setter ──

    public String getRoleId() { return roleId; }
    public void setRoleId(String roleId) { this.roleId = roleId; }

    public String getRoleNm() { return roleNm; }
    public void setRoleNm(String roleNm) { this.roleNm = roleNm; }

    public String getRoleDesc() { return roleDesc; }
    public void setRoleDesc(String roleDesc) { this.roleDesc = roleDesc; }

    public String getParentRoleId() { return parentRoleId; }
    public void setParentRoleId(String parentRoleId) { this.parentRoleId = parentRoleId; }

    public String getMenuId() { return menuId; }
    public void setMenuId(String menuId) { this.menuId = menuId; }

    public String getUseTp() { return useTp; }
    public void setUseTp(String useTp) { this.useTp = useTp; }

    public LocalDateTime getStartActiveDate() { return startActiveDate; }
    public void setStartActiveDate(LocalDateTime startActiveDate) { this.startActiveDate = startActiveDate; }

    public LocalDateTime getEndActiveDate() { return endActiveDate; }
    public void setEndActiveDate(LocalDateTime endActiveDate) { this.endActiveDate = endActiveDate; }
}
