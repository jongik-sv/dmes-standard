/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecUserPwd 엔티티 — TB_MCM_SEC_USER_PWD (사용자 비밀번호) 본 컬럼 정의 (commUserMng 화면 owner / W5)
 */
package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 사용자 비밀번호 — {@code TB_MCM_SEC_USER_PWD} (As-Is) JPA Entity (commUserMng 화면 owner / W5).
 *
 * <p>스키마 = {@code MCMAPUSER} (csa 9 화면 공통 정책 — W1·W2·W3·W4 동일).
 *
 * <p>분석리포트 §9.1.3 (DMES 시트 24 컬럼) 중 본 화면 본 7 컬럼 + audit 9:
 * <ul>
 *   <li>PK 단일 = USER_ID (FK to TB_MCM_SEC_USER.USER_ID)</li>
 *   <li>본 7 컬럼: USER_ID(PK) / USER_ENC_PWD / SALT / LAST_PWD_CHNG_DATE /
 *       USER_SSO_PWD / USER_ENC_TEMP_PWD / TEMP_PWD_EXPIRATION_DATE</li>
 *   <li>audit 17 컬럼 → McmAuditEntity 9 컬럼 표준화</li>
 * </ul>
 *
 * <p>본 entity 는 mergeCommonPwdInit (Oracle MERGE → MSSQL upsert) + updateCommonSSOPwdInit (SSO 일괄 초기화) 사용.
 * To-Be JPA save() 는 PK 존재 시 UPDATE, 미존재 시 INSERT (Oracle MERGE 동등).
 *
 * <p>인용:
 * <ul>
 *   <li>분석리포트 §9.1.3 (DMES SEC_USER_PWD 24 컬럼 카탈로그)</li>
 *   <li>분석리포트 §11.1 (To-Be Entity 명명 — SecUserPwd)</li>
 *   <li>As-Is Mapper {@code CommUserMngMapper.mergeCommonPwdInit / updateCommonSSOPwdInit}</li>
 * </ul>
 */
@Entity
@Table(name = "TB_MCM_SEC_USER_PWD", schema = "MCMAPUSER")
public class SecUserPwd extends McmAuditEntity {

    /** PK — 사용자 ID (FK to TB_MCM_SEC_USER.USER_ID / 분석 §9.1.3 #1). VARCHAR(30). */
    @Id
    @Column(name = "USER_ID", length = 30, nullable = false)
    private String userId;

    /** 비밀번호 (BCrypt) — RegCommUserMng:50 / PasswordInit:49 / ReRegCommUserMng:53 / 분석 §9.1.3 #2. VARCHAR(100). */
    @Column(name = "USER_ENC_PWD", length = 100)
    private String userEncPwd;

    /** SALT (Java 본문 미사용 — BCrypt 내장 salt / 분석 §9.1.3 #3). VARCHAR(100). */
    @Column(name = "SALT", length = 100)
    private String salt;

    /** 최종 비밀번호 변경일 (Java 본문 미사용 — DB 보존 / 분석 §9.1.3 #4). DATE 8자 → LocalDateTime. */
    @Column(name = "LAST_PWD_CHNG_DATE")
    private LocalDateTime lastPwdChngDate;

    /** SSO 비밀번호 (BCrypt) — PasswordInit:54 SSO 초기화 / 분석 §9.1.3 #22. VARCHAR(100). */
    @Column(name = "USER_SSO_PWD", length = 100)
    private String userSsoPwd;

    /** 임시 비밀번호 — wb_pwdChg_init_onusernotify (pwdtmp transaction) / 분석 §9.1.3 #23. VARCHAR(100). */
    @Column(name = "USER_ENC_TEMP_PWD", length = 100)
    private String userEncTempPwd;

    /** 임시 비밀번호 만료일 (As-Is xfdl 본문 미사용 — DB 보존 / 분석 §9.1.3 #24). TIMESTAMP(6) → LocalDateTime. */
    @Column(name = "TEMP_PWD_EXPIRATION_DATE")
    private LocalDateTime tempPwdExpirationDate;

    public SecUserPwd() {}

    // ── getter / setter ──

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getUserEncPwd() { return userEncPwd; }
    public void setUserEncPwd(String userEncPwd) { this.userEncPwd = userEncPwd; }

    public String getSalt() { return salt; }
    public void setSalt(String salt) { this.salt = salt; }

    public LocalDateTime getLastPwdChngDate() { return lastPwdChngDate; }
    public void setLastPwdChngDate(LocalDateTime lastPwdChngDate) { this.lastPwdChngDate = lastPwdChngDate; }

    public String getUserSsoPwd() { return userSsoPwd; }
    public void setUserSsoPwd(String userSsoPwd) { this.userSsoPwd = userSsoPwd; }

    public String getUserEncTempPwd() { return userEncTempPwd; }
    public void setUserEncTempPwd(String userEncTempPwd) { this.userEncTempPwd = userEncTempPwd; }

    public LocalDateTime getTempPwdExpirationDate() { return tempPwdExpirationDate; }
    public void setTempPwdExpirationDate(LocalDateTime tempPwdExpirationDate) { this.tempPwdExpirationDate = tempPwdExpirationDate; }
}
