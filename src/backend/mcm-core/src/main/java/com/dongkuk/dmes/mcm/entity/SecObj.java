/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecObj 엔티티 — TB_MCM_SEC_OBJ (OBJECT 마스터) 본 컬럼 1:1 정의 (commObjMng 화면 owner)
 */
package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * OBJECT 마스터 — {@code TB_MCM_SEC_OBJ} (As-Is) JPA Entity (commObjMng 화면 owner).
 *
 * <p>스키마 = {@code MCMAPUSER} (csa 9 화면 공통 정책 — 사용자 결정 2026-05-31).
 * 테이블명 대문자 prefix 보존.
 *
 * <p>분석리포트 §9.1 / §9.6.1 (TB_MCM_SEC_OBJ 31 컬럼 전수) 중 본 화면 본 컬럼 14 → To-Be 정책 #1 13 컬럼:
 * <ul>
 *   <li>본 14 컬럼: OBJECT_ID(PK) / OBJECT_NM / PROGRAM_DESC / SYSTEM_CODE /
 *       BIZ_SYSTEM_CODE (To-Be 정책 #1 폐기) / OBJECT_TYPE / SERVICE / USE_TP /
 *       ACCESS_TP / FORM_URL / OUT_ACCESS_IP / PARAM / START_ACTIVE_DATE / END_ACTIVE_DATE</li>
 *   <li>DATA_END_* (5) + ARCHIVE_* (4) 컬럼은 As-Is 미사용 (분석 §9.6.1 비고 "To-Be 제거 후보") → Entity 미반영</li>
 *   <li>BIZ_SYSTEM_CODE 는 분석리포트 §12 결정 누적 정책 #1 (APP_HOST/BIZ_SYSTEM_CODE 폐기) 으로 Entity 미반영</li>
 * </ul>
 *
 * <p>As-Is {@code ref_Audit} fragment (CREATED_OBJECT_* / LAST_UPDATED_* 8 컬럼) 폐기 →
 * mcm-core {@link McmAuditEntity} 의 C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID /
 * U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER 9 컬럼 + JPA {@code @PrePersist} / {@code @PreUpdate}
 * 자동 채움 (cma 정본 패턴 — 분석 §11 정책 #6 (A)).
 *
 * <p>인용:
 * <ul>
 *   <li>분석리포트 §9.1 / §9.6.1 (As-Is 컬럼 카탈로그)</li>
 *   <li>분석리포트 §11.1 (To-Be 명명 안)</li>
 *   <li>As-Is Mapper {@code CommObjMngMapper.selectCommObjMng} (xml:7~41)</li>
 *   <li>기존 mcm-core legacy entity ({@code com.dongkuk.dmes.mcm.security.entity.SecObj}) 와 별도 — 본 entity 는 csa commObjMng 화면 owner</li>
 * </ul>
 */
@Entity
@Table(name = "TB_MCM_SEC_OBJ", schema = "MCMAPUSER")
public class SecObj extends McmAuditEntity {

    /** PK — OBJECT 마스터 식별자 (xfdl G-002 / D-001 / 분석 §9.6.1 #1). VARCHAR(50). */
    @Id
    @Column(name = "OBJECT_ID", length = 50, nullable = false)
    private String objectId;

    /** OBJECT 명 (xfdl G-003 / D-006 / 분석 §9.6.1 #2). VARCHAR(100). */
    @Column(name = "OBJECT_NM", length = 100)
    private String objectNm;

    /** 프로그램 설명 (xfdl G-004 / D-007 / 분석 §9.6.1 #3). VARCHAR(300). */
    @Column(name = "PROGRAM_DESC", length = 300)
    private String programDesc;

    /** 시스템 코드 (xfdl G-005 / D-002 / 분석 §9.6.1 #4 — As-Is 행추가 default "MES"). VARCHAR(10). */
    @Column(name = "SYSTEM_CODE", length = 10)
    private String systemCode;

    /** OBJECT 타입 (xfdl G-007 / D-008 / 분석 §9.6.1 #6 — As-Is 행추가 default "web"). VARCHAR(10). */
    @Column(name = "OBJECT_TYPE", length = 10)
    private String objectType;

    /** 서비스명 (xfdl G-008 / D-009 / 분석 §9.6.1 #7). VARCHAR(100). */
    @Column(name = "SERVICE", length = 100)
    private String service;

    /** 사용 여부 — "Y" / "N" (xfdl G-009 / D-013 / S-003 / 분석 §9.6.1 #8 — 저장 필수 V-002). VARCHAR(1). */
    @Column(name = "USE_TP", length = 1)
    private String useTp;

    /**
     * 접속 경로 — "내부" / "외부" (To-Be 2 enum).
     * 2026-06-03 사용자 명시 변경 — As-Is "1"/"2"/"3" 3 enum ("1 내부 neXacro" / "2 외부 neXacro" / "3 외부 url")
     * → To-Be 2 enum 단순화. DB 잔존 값은 DataInitializer 멱등 UPDATE 가 "내부"/"외부" 로 정정.
     * VARCHAR(10) — 한글 다바이트 + 확장 margin.
     * (xfdl G-015 / D-010 / 분석 §9.6.1 #9 — 저장 필수 V-002 / D-010 핸들러 FORM_URL/OUT_ACCESS_IP enable 분기).
     */
    @Column(name = "ACCESS_TP", length = 10)
    private String accessTp;

    /**
     * 폼 URL (xfdl G-010 / D-011 / 분석 §9.6.1 #10 — As-Is ACCESS_TP=1 일 때
     * {@code {OBJECT_ID}.xfdl} 자동 세트). VARCHAR(100).
     */
    @Column(name = "FORM_URL", length = 100)
    private String formUrl;

    /**
     * 외부 접속 주소 (xfdl G-011 / D-012 / 분석 §9.6.1 #11 — ACCESS_TP=2/3 활성).
     * VARCHAR(150).
     */
    @Column(name = "OUT_ACCESS_IP", length = 150)
    private String outAccessIp;

    /** 파라미터 (xfdl G-012 / D-014 / 분석 §9.6.1 #12). VARCHAR(150). */
    @Column(name = "PARAM", length = 150)
    private String param;

    /**
     * 유효 개시일 (xfdl G-013 / D-015 / 분석 §9.6.1 #13 — As-Is 행추가 default {@code gfn_today()} 8자).
     * As-Is DATE 타입 + 8자 format → To-Be {@link LocalDateTime}.
     */
    @Column(name = "START_ACTIVE_DATE")
    private LocalDateTime startActiveDate;

    /**
     * 유효 기한일 (xfdl G-014 / D-016 / 분석 §9.6.1 #14 — As-Is 행추가 default "99991231" 8자).
     * To-Be 정정 (cma 패턴) = {@code 9999-12-31 23:59:59}.
     */
    @Column(name = "END_ACTIVE_DATE")
    private LocalDateTime endActiveDate;

    public SecObj() {}

    // ── getter / setter ──

    public String getObjectId() { return objectId; }
    public void setObjectId(String objectId) { this.objectId = objectId; }

    public String getObjectNm() { return objectNm; }
    public void setObjectNm(String objectNm) { this.objectNm = objectNm; }

    public String getProgramDesc() { return programDesc; }
    public void setProgramDesc(String programDesc) { this.programDesc = programDesc; }

    public String getSystemCode() { return systemCode; }
    public void setSystemCode(String systemCode) { this.systemCode = systemCode; }

    public String getObjectType() { return objectType; }
    public void setObjectType(String objectType) { this.objectType = objectType; }

    public String getService() { return service; }
    public void setService(String service) { this.service = service; }

    public String getUseTp() { return useTp; }
    public void setUseTp(String useTp) { this.useTp = useTp; }

    public String getAccessTp() { return accessTp; }
    public void setAccessTp(String accessTp) { this.accessTp = accessTp; }

    public String getFormUrl() { return formUrl; }
    public void setFormUrl(String formUrl) { this.formUrl = formUrl; }

    public String getOutAccessIp() { return outAccessIp; }
    public void setOutAccessIp(String outAccessIp) { this.outAccessIp = outAccessIp; }

    public String getParam() { return param; }
    public void setParam(String param) { this.param = param; }

    public LocalDateTime getStartActiveDate() { return startActiveDate; }
    public void setStartActiveDate(LocalDateTime startActiveDate) { this.startActiveDate = startActiveDate; }

    public LocalDateTime getEndActiveDate() { return endActiveDate; }
    public void setEndActiveDate(LocalDateTime endActiveDate) { this.endActiveDate = endActiveDate; }
}
