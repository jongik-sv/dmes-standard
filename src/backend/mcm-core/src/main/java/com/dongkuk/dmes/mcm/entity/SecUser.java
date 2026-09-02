/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecUser 엔티티 — TB_MCM_SEC_USER (사용자 마스터) 본 컬럼 1:1 정의 (commUserMng 화면 owner / W5)
 */
package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 사용자 마스터 — {@code TB_MCM_SEC_USER} (As-Is) JPA Entity (commUserMng 화면 owner / W5).
 *
 * <p>스키마 = {@code MCMAPUSER} (csa 9 화면 공통 정책 — W1·W2·W3·W4 동일). 테이블명 As-Is 대문자 보존.
 *
 * <p>분석리포트 §9.1.1 (DMES 시트 38 컬럼) 중 본 화면 본 18 컬럼 (To-Be 정책 #1 + Q-005 해소):
 * <ul>
 *   <li>PK 단일 = USER_ID (VARCHAR 30)</li>
 *   <li>본 18 컬럼: USER_ID(PK) / USER_EMP_NO / SSO_ID / USER_NM / START_ACTIVE_DATE / END_ACTIVE_DATE /
 *       DEPT_CD / USER_CATEGORY_CD / USE_TP / EMAIL / TEL_NO / MOBILE_TEL_NO / IN_OUT_EMP_TP /
 *       GROUP_ID1 / GROUP_ID2 / GROUP_ID3 (D-013~015 콤보 폐기 — DB 보존만 / 정책 #3 (D)) /
 *       THEME_TP / MENU_TP (UI 노출 ✗, DB default 'M' 보존) / BOTTOM_MSG_YN (default 'Y') /
 *       EXCEL_TP (default 'E') / PWD_FAIL_COUNT</li>
 *   <li>audit 17 컬럼 (DMES 카탈로그) 폐기 → McmAuditEntity 9 컬럼 표준화 (정책 #1 / T-009)</li>
 * </ul>
 *
 * <p>가이드 §3-1 / §6-A-1 / §7-1 (Entity 본 테이블 전체 컬럼 룰) 반영 — DMES 시트 38 컬럼 중
 * audit 17 만 McmAuditEntity 로 흡수하고 나머지 21 컬럼 모두 1:1 보유. UI 미사용 컬럼 (THEME_TP /
 * MENU_TP / BOTTOM_MSG_YN / EXCEL_TP / PWD_FAIL_COUNT) 도 향후 다른 화면 재사용성 보장 목적.
 *
 * <p>인용:
 * <ul>
 *   <li>분석리포트 §9.1.1 (DMES SEC_USER 38 컬럼 카탈로그)</li>
 *   <li>분석리포트 §11.1 (To-Be Entity 명명 — As-Is 직역 SecUser / 위치 mcm.entity / McmAuditEntity 상속)</li>
 *   <li>As-Is Mapper {@code CommUserMngMapper.selectCommUser / insertCommUser / updateCommUser /
 *       deleteCmUser / updateReRegUser}</li>
 * </ul>
 */
@Entity(name = "McmSecUser")
@Table(name = "TB_MCM_SEC_USER", schema = "MCMAPUSER")
public class SecUser extends McmAuditEntity {

    /** PK — 사용자 ID (D-001 / G-002 / V-003 / V-004 / 분석 §9.1.1 #1). VARCHAR(30). */
    @Id
    @Column(name = "USER_ID", length = 30, nullable = false)
    private String userId;

    /** 사번 (D-002 / G-003 / V-005 / V-006 / 분석 §9.1.1 #2). VARCHAR(10). */
    @Column(name = "USER_EMP_NO", length = 10)
    private String userEmpNo;

    /** SSO ID (D-003 / G-004 / 분석 §9.1.1 #3). VARCHAR(30). */
    @Column(name = "SSO_ID", length = 30)
    private String ssoId;

    /** 사용자명 (D-004 / G-005 / 분석 §9.1.1 #4). VARCHAR(30). */
    @Column(name = "USER_NM", length = 30)
    private String userNm;

    /**
     * 유효 개시일 (D-005 / G-006 / 분석 §9.1.1 #5 — As-Is rowAdd 기본값 = today, xfdl:862).
     * As-Is DATE 8자 → To-Be {@link LocalDateTime} (W1~W4 정본 패턴).
     */
    @Column(name = "START_ACTIVE_DATE")
    private LocalDateTime startActiveDate;

    /**
     * 유효 기한일 (D-006 / G-007 / 분석 §9.1.1 #6 — As-Is rowAdd 기본값 = "99991231", xfdl:863) — 논리삭제 마감일.
     * deleteCmUser action 이 본 컬럼 SET 으로 논리삭제 처리.
     */
    @Column(name = "END_ACTIVE_DATE")
    private LocalDateTime endActiveDate;

    /** 부서 코드 (D-007 / G-008 / 분석 §9.1.1 #7 — LV-005 commonUserDept / FK to TB_MCM_DEPT_INFO). VARCHAR(10). */
    @Column(name = "DEPT_CD", length = 10)
    private String deptCd;

    /** 사용자 분류 코드 (D-008 / G-009 / 분석 §9.1.1 #8). VARCHAR(10). */
    @Column(name = "USER_CATEGORY_CD", length = 10)
    private String userCategoryCd;

    /** 사용 구분 — "Y"/"N" (D-016 / G-010 / S-002 / 분석 §9.1.1 #9 — LV-001). VARCHAR(1). */
    @Column(name = "USE_TP", length = 1)
    private String useTp;

    /** 이메일 (D-009 / G-011 / V-305 / V-401 / 분석 §9.1.1 #10). VARCHAR(30). */
    @Column(name = "EMAIL", length = 30)
    private String email;

    /** 전화 번호 (D-010 / G-012 / 분석 §9.1.1 #11). VARCHAR(15). */
    @Column(name = "TEL_NO", length = 15)
    private String telNo;

    /** 모바일 번호 (D-011 / G-013 / 분석 §9.1.1 #12). VARCHAR(15). */
    @Column(name = "MOBILE_TEL_NO", length = 15)
    private String mobileTelNo;

    /** 내부 외부 구분 — "I"/"O" (D-012 / G-014 / S-003 / V-304 / 분석 §9.1.1 #13 — LV-002). VARCHAR(1). */
    @Column(name = "IN_OUT_EMP_TP", length = 1)
    private String inOutEmpTp;

    /**
     * 그룹 코드 1 (G-015 / D-013 — 분석 §9.1.1 #14).
     * To-Be D-013 콤보 자체 제거 (정책 #3 (D) / T-025) — DB 컬럼은 보존.
     */
    @Column(name = "GROUP_ID1", length = 50)
    private String groupId1;

    /** 그룹 코드 2 (G-016 / D-014 — 분석 §9.1.1 #15). To-Be UI 미반영, DB 보존. */
    @Column(name = "GROUP_ID2", length = 50)
    private String groupId2;

    /** 그룹 코드 3 (G-017 / D-015 — 분석 §9.1.1 #16). To-Be UI 미반영, DB 보존. */
    @Column(name = "GROUP_ID3", length = 50)
    private String groupId3;

    /** 테마 타입 (분석 §9.1.1 #17 — As-Is UI 노출 ✗, DB 보존만). VARCHAR(20). */
    @Column(name = "THEME_TP", length = 20)
    private String themeTp;

    /** 메뉴 상태 (분석 §9.1.1 #18 — DB Default 'M' / UI 노출 ✗). VARCHAR(1). */
    @Column(name = "MENU_TP", length = 1)
    private String menuTp;

    /** 하단 메시지 표시 여부 (분석 §9.1.1 #36 — DB Default 'Y' / UI 노출 ✗). VARCHAR(1). */
    @Column(name = "BOTTOM_MSG_YN", length = 1)
    private String bottomMsgYn;

    /** 엑셀 구분 (분석 §9.1.1 #37 — DB Default 'E' / UI 노출 ✗). VARCHAR(1). */
    @Column(name = "EXCEL_TP", length = 1)
    private String excelTp;

    /** 비밀번호 실패 횟수 (분석 §9.1.1 #38 — As-Is UI 노출 ✗, DB 보존). NUMBER(5). */
    @Column(name = "PWD_FAIL_COUNT")
    private Long pwdFailCount;

    public SecUser() {}

    // ── getter / setter ──

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getUserEmpNo() { return userEmpNo; }
    public void setUserEmpNo(String userEmpNo) { this.userEmpNo = userEmpNo; }

    public String getSsoId() { return ssoId; }
    public void setSsoId(String ssoId) { this.ssoId = ssoId; }

    public String getUserNm() { return userNm; }
    public void setUserNm(String userNm) { this.userNm = userNm; }

    public LocalDateTime getStartActiveDate() { return startActiveDate; }
    public void setStartActiveDate(LocalDateTime startActiveDate) { this.startActiveDate = startActiveDate; }

    public LocalDateTime getEndActiveDate() { return endActiveDate; }
    public void setEndActiveDate(LocalDateTime endActiveDate) { this.endActiveDate = endActiveDate; }

    public String getDeptCd() { return deptCd; }
    public void setDeptCd(String deptCd) { this.deptCd = deptCd; }

    public String getUserCategoryCd() { return userCategoryCd; }
    public void setUserCategoryCd(String userCategoryCd) { this.userCategoryCd = userCategoryCd; }

    public String getUseTp() { return useTp; }
    public void setUseTp(String useTp) { this.useTp = useTp; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getTelNo() { return telNo; }
    public void setTelNo(String telNo) { this.telNo = telNo; }

    public String getMobileTelNo() { return mobileTelNo; }
    public void setMobileTelNo(String mobileTelNo) { this.mobileTelNo = mobileTelNo; }

    public String getInOutEmpTp() { return inOutEmpTp; }
    public void setInOutEmpTp(String inOutEmpTp) { this.inOutEmpTp = inOutEmpTp; }

    public String getGroupId1() { return groupId1; }
    public void setGroupId1(String groupId1) { this.groupId1 = groupId1; }

    public String getGroupId2() { return groupId2; }
    public void setGroupId2(String groupId2) { this.groupId2 = groupId2; }

    public String getGroupId3() { return groupId3; }
    public void setGroupId3(String groupId3) { this.groupId3 = groupId3; }

    public String getThemeTp() { return themeTp; }
    public void setThemeTp(String themeTp) { this.themeTp = themeTp; }

    public String getMenuTp() { return menuTp; }
    public void setMenuTp(String menuTp) { this.menuTp = menuTp; }

    public String getBottomMsgYn() { return bottomMsgYn; }
    public void setBottomMsgYn(String bottomMsgYn) { this.bottomMsgYn = bottomMsgYn; }

    public String getExcelTp() { return excelTp; }
    public void setExcelTp(String excelTp) { this.excelTp = excelTp; }

    public Long getPwdFailCount() { return pwdFailCount; }
    public void setPwdFailCount(Long pwdFailCount) { this.pwdFailCount = pwdFailCount; }
}
