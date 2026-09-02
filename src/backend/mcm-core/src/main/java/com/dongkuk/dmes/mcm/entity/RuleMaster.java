package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/**
 * 업무기준 마스터 — TB_MCA_RULE_MASTER (MCAAPUSER 스키마) JPA Entity.
 *
 * <p>설계서: `docs/mcm/design/masterRuleList/masterRuleList_분석리포트.md` §9.1. 화면 cmb/masterRuleList.
 *
 * <p>PK: (RULE_ID) — 단일 키 (NOT NULL). 형제 화면 masterRuleListPop / masterRuleFrame /
 * masterRuleData / masterRuleDataList 가 JOIN/조회로 공유.
 *
 * <p>업무 컬럼 9 (사용자 제공 테이블 명세서 2026-06-05 — As-Is 1:1):
 * RULE_VER NUMBER(8,2) / RULE_ID VARCHAR(50) NOT NULL / OLD_RULE_ID VARCHAR(50) /
 * RULE_NM VARCHAR(180) NOT NULL / RULE_DESC VARCHAR(300) / RULE_TP VARCHAR(1) /
 * RULE_OWNER_DEPT_NM VARCHAR(30) / RULE_OWNER_EMP_NO VARCHAR(20) / USE_TP VARCHAR(1).
 *
 * <p>RULE_VER 는 <b>업무 버전</b>(As-Is INSERT '1') — mcm-core {@link McmAuditEntity} 의 낙관락 VER 과
 * 별개 컬럼 (Q-011). NUMBER(8,2) → {@link BigDecimal}.
 *
 * <p>AUDIT: As-Is 17 audit 컬럼(CREATED_* · LAST_UPDATE_* · DATA_END_* · ARCHIVE_* 계열)은 To-Be 미매핑 —
 * cactus-core 표준 {@link McmAuditEntity} 9 컬럼(C_* 4 / U_* 4 / VER)으로 대체 (사용자 지시 2026-06-05).
 * 화면의 시작일자/최종수정자/최종수정일은 createdAt(C_AT)/updatedBy(U_USR_ID)/updatedAt(U_AT)로 매핑.
 */
@Entity
@Table(name = "TB_MCA_RULE_MASTER", schema = "MCAAPUSER")
public class RuleMaster extends McmAuditEntity {

    /** PK — 업무기준ID. VARCHAR(50) NOT NULL (명세서). */
    @Id
    @Column(name = "RULE_ID", length = 50, nullable = false)
    private String ruleId;

    /** 구 업무기준ID — 이력행 제외 필터(`RULE_ID != COALESCE(OLD_RULE_ID,'ZZZZ0000')`)용 (BR-002). VARCHAR(50). */
    @Column(name = "OLD_RULE_ID", length = 50)
    private String oldRuleId;

    /** 업무기준명. VARCHAR(180) NOT NULL (명세서). */
    @Column(name = "RULE_NM", length = 180, nullable = false)
    private String ruleNm;

    /** 업무기준 설명. VARCHAR(300). */
    @Column(name = "RULE_DESC", length = 300)
    private String ruleDesc;

    /** 업무기준 버전 — NUMBER(8,2), As-Is INSERT '1' (mcm-core VER 와 별개 — Q-011). */
    @Column(name = "RULE_VER", precision = 8, scale = 2)
    private BigDecimal ruleVer;

    /** 업무기준 유형 — VARCHAR(1). rowAdd 시 'A' (xfdl:229). */
    @Column(name = "RULE_TP", length = 1)
    private String ruleTp;

    /** 업무기준 Owner 부서명 — VARCHAR(30). SELECT 반환(그리드/INSERT 미사용). */
    @Column(name = "RULE_OWNER_DEPT_NM", length = 30)
    private String ruleOwnerDeptNm;

    /** 업무기준 Owner 직번 — VARCHAR(20). rowAdd 시 로그인 사용자(xfdl:232). */
    @Column(name = "RULE_OWNER_EMP_NO", length = 20)
    private String ruleOwnerEmpNo;

    /** 사용구분 — VARCHAR(1) Y/N. 'N'(미사용) 은 목록 제외(BR-003), 삭제 대신 논리삭제. */
    @Column(name = "USE_TP", length = 1)
    private String useTp;

    // ── getter / setter ──

    public String getRuleId() { return ruleId; }
    public void setRuleId(String ruleId) { this.ruleId = ruleId; }

    public String getOldRuleId() { return oldRuleId; }
    public void setOldRuleId(String oldRuleId) { this.oldRuleId = oldRuleId; }

    public String getRuleNm() { return ruleNm; }
    public void setRuleNm(String ruleNm) { this.ruleNm = ruleNm; }

    public String getRuleDesc() { return ruleDesc; }
    public void setRuleDesc(String ruleDesc) { this.ruleDesc = ruleDesc; }

    public BigDecimal getRuleVer() { return ruleVer; }
    public void setRuleVer(BigDecimal ruleVer) { this.ruleVer = ruleVer; }

    public String getRuleTp() { return ruleTp; }
    public void setRuleTp(String ruleTp) { this.ruleTp = ruleTp; }

    public String getRuleOwnerDeptNm() { return ruleOwnerDeptNm; }
    public void setRuleOwnerDeptNm(String ruleOwnerDeptNm) { this.ruleOwnerDeptNm = ruleOwnerDeptNm; }

    public String getRuleOwnerEmpNo() { return ruleOwnerEmpNo; }
    public void setRuleOwnerEmpNo(String ruleOwnerEmpNo) { this.ruleOwnerEmpNo = ruleOwnerEmpNo; }

    public String getUseTp() { return useTp; }
    public void setUseTp(String useTp) { this.useTp = useTp; }
}
