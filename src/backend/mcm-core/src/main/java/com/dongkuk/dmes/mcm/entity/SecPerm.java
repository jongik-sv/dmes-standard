/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecPerm 엔티티 — TB_MCM_SEC_PERM (PERMISSION 마스터) 본 컬럼 1:1 정의 (commPermMng 화면 owner / W6)
 */
package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * PERMISSION 마스터 — {@code TB_MCM_SEC_PERM} (As-Is) JPA Entity (commPermMng 화면 owner / W6).
 *
 * <p>스키마 = {@code MCMAPUSER} (csa 9 화면 공통 정책 — W1~W5 동일).
 * 테이블명 대문자 prefix 보존.
 *
 * <p>분석리포트 §9.3.1 (DMES SEC_PERM 시트 29 컬럼 전수) 중 본 화면 본 10 컬럼:
 * <ul>
 *   <li>PK = PERMISSION_ID (VARCHAR(100) NOT NULL)</li>
 *   <li>본 10 컬럼: PERMISSION_ID(PK) / PERMISSION_NM / PERMISSION_DESC /
 *       PERMISSION_COMMON / PERMISSION_CUSTOM / POPUP_BTN / PERMISSION_ACTION /
 *       USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE</li>
 *   <li>BIZ_SYSTEM_CODE (VARCHAR(10) NOT NULL) 는 cross-cutting 정책 #1 (2026-05-31) 폐기 →
 *       Entity 미반영. DDL 자체는 보존 (legacy 데이터).</li>
 *   <li>PERMISSION_GROUP (VARCHAR(100) NULL) 는 As-Is mui Mapper 미사용 → Entity 미반영.</li>
 *   <li>audit 17 컬럼 (CREATED_* / LAST_UPDATE* / DATA_END_* / ARCHIVE_*) 폐기 →
 *       McmAuditEntity 9 컬럼 표준화.</li>
 * </ul>
 *
 * <p>As-Is {@code ref_Audit} fragment (CREATED_OBJECT_* / LAST_UPDATED_* 8 컬럼) 폐기 →
 * mcm-core {@link McmAuditEntity} 의 C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID /
 * U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER 9 컬럼 + JPA {@code @PrePersist} / {@code @PreUpdate}
 * 자동 채움 (cma 정본 패턴 — 분석 §11 정책 #6 (A)).
 *
 * <p>인용:
 * <ul>
 *   <li>분석리포트 §9.1 / §9.3.1 (As-Is 컬럼 카탈로그 DMES 시트 29)</li>
 *   <li>분석리포트 §11.1 / §12 (To-Be 명명 안 cross-cutting 정책 #6 A안 — SecPerm 직역)</li>
 *   <li>As-Is Mapper {@code CommPermMngMapper.selectCommPermMng} (xml:7~40)</li>
 *   <li>기존 mcm-core legacy entity ({@code com.dongkuk.dmes.mcm.security.entity}) 와 별도 —
 *       본 entity 는 csa commPermMng 화면 owner</li>
 * </ul>
 */
@Entity
@Table(name = "TB_MCM_SEC_PERM", schema = "MCMAPUSER")
public class SecPerm extends McmAuditEntity {

    /** PK — PERMISSION 마스터 식별자 (xfdl G-002 / D-002 / 분석 §9.3.1 #1). VARCHAR(100). */
    @Id
    @Column(name = "PERMISSION_ID", length = 100, nullable = false)
    private String permissionId;

    /** PERMISSION 명 (xfdl G-003 / D-004 / 분석 §9.3.1 #2). VARCHAR(100). */
    @Column(name = "PERMISSION_NM", length = 100)
    private String permissionNm;

    /** PERMISSION 설명 (xfdl G-012 / D-006 / 분석 §9.3.1 #3). VARCHAR(300). */
    @Column(name = "PERMISSION_DESC", length = 300)
    private String permissionDesc;

    /** 공통 버튼 권한 (xfdl G-004 / D-016 TextArea / 분석 §9.3.1 #4). VARCHAR(500). */
    @Column(name = "PERMISSION_COMMON", length = 500)
    private String permissionCommon;

    /** CUSTOM 버튼 권한 (xfdl G-005 / D-019 TextArea / 분석 §9.3.1 #5). VARCHAR(500). */
    @Column(name = "PERMISSION_CUSTOM", length = 500)
    private String permissionCustom;

    /** POPUP 버튼 (xfdl G-006 / D-022 TextArea / 분석 §9.3.1 #6). VARCHAR(1000). */
    @Column(name = "POPUP_BTN", length = 1000)
    private String popupBtn;

    /**
     * ACTION 권한 (xfdl G-007 / D-024 TextArea / 분석 §9.3.1 #7). VARCHAR(2000).
     *
     * <p>원 설계는 VARCHAR(500) 이었으나 PERM_ALL(전체 권한) 한 행에 모든 모듈의 action 토큰이
     * 콤마로 누적된다. {@code DataInitializer.ensurePermAllActions} 가 기존값과 합집합을 만들어
     * 단조 증가시키므로 모듈이 늘 때마다 길이가 커진다 (mpp 지그금형CR 액션 추가 시점에 863자로 500 초과 →
     * 부팅 시 SQLServerException "문자열 또는 이진 데이터는 잘립니다" 로 mcm 기동 실패). 2000 으로 확장.
     * DDL 은 docs/mcm/alter_TB_MCM_SEC_PERM_action_2000.sql 참고 — MSSQL 은 flyway 미적용이라 직접 실행한다.
     */
    @Column(name = "PERMISSION_ACTION", length = 2000)
    private String permissionAction;

    /** 사용 여부 — "Y" / "N" (xfdl G-009 / D-010 Radio / S-004 / 분석 §9.3.1 #9 — 저장 필수). VARCHAR(1). */
    @Column(name = "USE_TP", length = 1)
    private String useTp;

    /**
     * 유효 개시일 (xfdl G-010 / D-012 / 분석 §9.3.1 #10 — As-Is 행추가 default {@code gfn_today()} 8자).
     * As-Is DATE 타입 + 8자 format → To-Be {@link LocalDateTime}.
     */
    @Column(name = "START_ACTIVE_DATE")
    private LocalDateTime startActiveDate;

    /**
     * 유효 기한일 (xfdl G-011 / D-014 / 분석 §9.3.1 #11 — As-Is 행추가 default "99991231" 8자).
     * To-Be 정정 (cma·W1~W5 패턴) = {@code 9999-12-31 23:59:59}.
     */
    @Column(name = "END_ACTIVE_DATE")
    private LocalDateTime endActiveDate;

    public SecPerm() {}

    // ── getter / setter ──

    public String getPermissionId() { return permissionId; }
    public void setPermissionId(String permissionId) { this.permissionId = permissionId; }

    public String getPermissionNm() { return permissionNm; }
    public void setPermissionNm(String permissionNm) { this.permissionNm = permissionNm; }

    public String getPermissionDesc() { return permissionDesc; }
    public void setPermissionDesc(String permissionDesc) { this.permissionDesc = permissionDesc; }

    public String getPermissionCommon() { return permissionCommon; }
    public void setPermissionCommon(String permissionCommon) { this.permissionCommon = permissionCommon; }

    public String getPermissionCustom() { return permissionCustom; }
    public void setPermissionCustom(String permissionCustom) { this.permissionCustom = permissionCustom; }

    public String getPopupBtn() { return popupBtn; }
    public void setPopupBtn(String popupBtn) { this.popupBtn = popupBtn; }

    public String getPermissionAction() { return permissionAction; }
    public void setPermissionAction(String permissionAction) { this.permissionAction = permissionAction; }

    public String getUseTp() { return useTp; }
    public void setUseTp(String useTp) { this.useTp = useTp; }

    public LocalDateTime getStartActiveDate() { return startActiveDate; }
    public void setStartActiveDate(LocalDateTime startActiveDate) { this.startActiveDate = startActiveDate; }

    public LocalDateTime getEndActiveDate() { return endActiveDate; }
    public void setEndActiveDate(LocalDateTime endActiveDate) { this.endActiveDate = endActiveDate; }
}
