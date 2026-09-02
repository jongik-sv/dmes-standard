package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * Master Code 관리 — TB_MCM_CODE_MASTER (As-Is) JPA Entity.
 *
 * <p>분석리포트 §9.1 본 컬럼 16 + mcm-core audit 9 (McmAuditEntity 상속).
 * 스키마 = 원장 schema {@code MCM_SOURCE} (사용자 결정 2026-05-29 정정).
 * {@code MCMAPUSER} 는 운영 read 동기화본 / {@code MCM_BACKUP} 은 백업본 — 동기화 화면이 적재 책임 (별도 사이클).
 * 테이블명 대문자 prefix 유지.
 *
 * <p>As-Is `ref_Audit` fragment (CREATION_TIMESTAMP / CREATED_OBJECT_ID 등 17 컬럼) 폐기 →
 * mcm-core {@link McmAuditEntity} 의 C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID /
 * U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER 9 컬럼 + JPA {@code @PrePersist} / {@code @PreUpdate}
 * 자동 채움 (mcm-core 결정 누적표 §12).
 *
 * <p>인용:
 * <ul>
 *   <li>분석리포트 §9.1 컬럼 카탈로그</li>
 *   <li>As-Is Mapper.xml {@code MergeTbMcmCodeMaster} (xml:46~104)</li>
 *   <li>As-Is xfdl ds_grdMain (xfdl:179~198, 16 컬럼)</li>
 * </ul>
 */
@Entity
@Table(name = "TB_MCM_CODE_MASTER", schema = "MCM_SOURCE")
public class MasterCode extends McmAuditEntity {

    /** PK — 코드 ID (xfdl G-002 / 분석 §9.1 #1). VARCHAR(50). */
    @Id
    @Column(name = "CODE_ID", length = 50, nullable = false)
    private String codeId;

    /** 코드명 (xfdl G-003). VARCHAR(180). */
    @Column(name = "CODE_NM", length = 180)
    private String codeNm;

    /** 설명 (xfdl G-005). VARCHAR(300). */
    @Column(name = "CODE_DESC", length = 300)
    private String codeDesc;

    /** 코드 버전 — 행추가 시 "1" 하드코딩 (xfdl:618 / 685 / xml:57 / 91). */
    @Column(name = "CODE_VER", length = 50)
    private String codeVer;

    /**
     * 마스터 대표 코드 (xfdl G-004) — Detail 의 외래키 대상.
     * 분석 §9.1 #11 / xml:18 / 59 / 129.
     */
    @Column(name = "MASTER_CODE", length = 50)
    private String masterCode;

    /** 참조1 (xfdl G-006 / 분석 §9.1 #12). */
    @Column(name = "MASTER_CODE_REF1", length = 300)
    private String masterCodeRef1;

    /** 참조2 (G-007). */
    @Column(name = "MASTER_CODE_REF2", length = 300)
    private String masterCodeRef2;

    /** 참조3 (G-008). */
    @Column(name = "MASTER_CODE_REF3", length = 300)
    private String masterCodeRef3;

    /** 참조4 (G-009). */
    @Column(name = "MASTER_CODE_REF4", length = 300)
    private String masterCodeRef4;

    /** 참조5 (G-010). */
    @Column(name = "MASTER_CODE_REF5", length = 300)
    private String masterCodeRef5;

    /** 사용여부 (xfdl G-011 / Y/N). char(1). */
    @Column(name = "USE_TP", length = 1)
    private String useTp;

    /**
     * 시작 유효일 — INSERT 시 As-Is {@code SYSDATE} (xml:93). To-Be Service 레이어에서
     * {@code LocalDateTime.now()} 명시 세트.
     */
    @Column(name = "START_ACTIVE_DATE")
    private LocalDateTime startActiveDate;

    /**
     * 종료 유효일 — INSERT 시 As-Is {@code TO_DATE('99991231115959','YYYYMMDDHH24MISS')}
     * (xml:94, 11:59:59 오타). To-Be 정정 = {@code 9999-12-31 23:59:59} (사용자 결정 §11 #4).
     */
    @Column(name = "END_ACTIVE_DATE")
    private LocalDateTime endActiveDate;

    /** 코드 소유 부서명 — java:39 param put (xml UPDATE 절은 사용 ✗ — As-Is 보존). */
    @Column(name = "CODE_OWNER_DEPT_NM", length = 200)
    private String codeOwnerDeptNm;

    /** 코드 소유 사원번호. */
    @Column(name = "CODE_OWNER_EMP_NO", length = 50)
    private String codeOwnerEmpNo;

    /** 코드 캐릭터. */
    @Column(name = "CODE_CHARACTER", length = 200)
    private String codeCharacter;

    // ── getter / setter ──

    public String getCodeId() { return codeId; }
    public void setCodeId(String codeId) { this.codeId = codeId; }

    public String getCodeNm() { return codeNm; }
    public void setCodeNm(String codeNm) { this.codeNm = codeNm; }

    public String getCodeDesc() { return codeDesc; }
    public void setCodeDesc(String codeDesc) { this.codeDesc = codeDesc; }

    public String getCodeVer() { return codeVer; }
    public void setCodeVer(String codeVer) { this.codeVer = codeVer; }

    public String getMasterCode() { return masterCode; }
    public void setMasterCode(String masterCode) { this.masterCode = masterCode; }

    public String getMasterCodeRef1() { return masterCodeRef1; }
    public void setMasterCodeRef1(String masterCodeRef1) { this.masterCodeRef1 = masterCodeRef1; }

    public String getMasterCodeRef2() { return masterCodeRef2; }
    public void setMasterCodeRef2(String masterCodeRef2) { this.masterCodeRef2 = masterCodeRef2; }

    public String getMasterCodeRef3() { return masterCodeRef3; }
    public void setMasterCodeRef3(String masterCodeRef3) { this.masterCodeRef3 = masterCodeRef3; }

    public String getMasterCodeRef4() { return masterCodeRef4; }
    public void setMasterCodeRef4(String masterCodeRef4) { this.masterCodeRef4 = masterCodeRef4; }

    public String getMasterCodeRef5() { return masterCodeRef5; }
    public void setMasterCodeRef5(String masterCodeRef5) { this.masterCodeRef5 = masterCodeRef5; }

    public String getUseTp() { return useTp; }
    public void setUseTp(String useTp) { this.useTp = useTp; }

    public LocalDateTime getStartActiveDate() { return startActiveDate; }
    public void setStartActiveDate(LocalDateTime startActiveDate) { this.startActiveDate = startActiveDate; }

    public LocalDateTime getEndActiveDate() { return endActiveDate; }
    public void setEndActiveDate(LocalDateTime endActiveDate) { this.endActiveDate = endActiveDate; }

    public String getCodeOwnerDeptNm() { return codeOwnerDeptNm; }
    public void setCodeOwnerDeptNm(String codeOwnerDeptNm) { this.codeOwnerDeptNm = codeOwnerDeptNm; }

    public String getCodeOwnerEmpNo() { return codeOwnerEmpNo; }
    public void setCodeOwnerEmpNo(String codeOwnerEmpNo) { this.codeOwnerEmpNo = codeOwnerEmpNo; }

    public String getCodeCharacter() { return codeCharacter; }
    public void setCodeCharacter(String codeCharacter) { this.codeCharacter = codeCharacter; }
}
