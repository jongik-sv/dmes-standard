/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: DeptInfo 엔티티 — TB_MCM_DEPT_INFO (DMES 자체 부서 마스터) 신규 (commUserMng 화면 owner / W5)
 *       정책 #2 / Q-002 해소 — As-Is EAIUSER.IF_DSHRMMCMHD02 외부 EAI 폐기, DMES 자체 부서 마스터 신설
 */
package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * DMES 자체 부서 마스터 — {@code TB_MCM_DEPT_INFO} JPA Entity (신규 / commUserMng 화면 owner / W5).
 *
 * <p>스키마 = {@code MCMAPUSER}. 정책 #2 / Q-002 해소 — As-Is 외부 EAI 인터페이스 테이블
 * {@code EAIUSER.IF_DSHRMMCMHD02} (CD_V → DEPT_CD, CD_V_MEANING → DEPT_NM) 폐기 결정에 따른
 * DMES 내부 부서 마스터 신설.
 *
 * <p>분석리포트 §9.1.7 (신규 등재 2026-05-31) — 본 7 컬럼 + audit 9:
 * <ul>
 *   <li>PK 단일 = DEPT_CD (VARCHAR 10)</li>
 *   <li>본 7 컬럼: DEPT_CD(PK) / DEPT_NM / DEPT_NM_EN / UPPER_DEPT_CD / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE</li>
 *   <li>audit 9 = McmAuditEntity</li>
 * </ul>
 *
 * <p>사용 위치 (As-Is EAI 직접 참조 → To-Be 본 Entity / Repository 로 전환):
 * <ul>
 *   <li>{@code selectCommUser} 의 DEPT_NM scalar subquery → LEFT JOIN TB_MCM_DEPT_INFO (T-008)</li>
 *   <li>{@code selectCommDept} 의 단독 조회 → 본 테이블 단독 조회 (commonUserDept action / LV-005 / D-007 부서 팝업)</li>
 * </ul>
 *
 * <p>테이블 운영 책임 — 별도 부서관리 화면 (본 화면 범위 ✗ — 별도 결정 사항).
 * 초기 데이터 = DataInitializer 또는 EAI 일회성 마이그레이션 적재 (현 사이클 빈 테이블 + 멱등 DDL 만).
 *
 * <p>인용:
 * <ul>
 *   <li>분석리포트 §9.1.7 (신규 11 컬럼 카탈로그)</li>
 *   <li>분석리포트 §11.1 (To-Be Entity 명명 — DeptInfo)</li>
 * </ul>
 */
@Entity
@Table(name = "TB_MCM_DEPT_INFO", schema = "MCMAPUSER")
public class DeptInfo extends McmAuditEntity {

    /** PK — 부서 코드 (LV-005 / D-007 / G-008 — As-Is EAI CD_V 대체 / 분석 §9.1.7 #1). VARCHAR(10). */
    @Id
    @Column(name = "DEPT_CD", length = 10, nullable = false)
    private String deptCd;

    /** 부서명 (LV-005 / G-008 표시명 — As-Is EAI CD_V_MEANING 대체 / 분석 §9.1.7 #2). VARCHAR(100). */
    @Column(name = "DEPT_NM", length = 100)
    private String deptNm;

    /** 부서 영문명 (선택 / 분석 §9.1.7 #3). VARCHAR(100). */
    @Column(name = "DEPT_NM_EN", length = 100)
    private String deptNmEn;

    /** 상위 부서 코드 (선택 — 부서 계층 / 분석 §9.1.7 #4). VARCHAR(10). */
    @Column(name = "UPPER_DEPT_CD", length = 10)
    private String upperDeptCd;

    /** 사용 구분 — "Y"/"N" — LV-005 활성 필터 (selectCommDept WHERE USE_TP='Y' / 분석 §9.1.7 #5). VARCHAR(1). */
    @Column(name = "USE_TP", length = 1)
    private String useTp;

    /** 유효 개시일 (분석 §9.1.7 #6). */
    @Column(name = "START_ACTIVE_DATE")
    private LocalDateTime startActiveDate;

    /** 유효 기한일 (분석 §9.1.7 #7). */
    @Column(name = "END_ACTIVE_DATE")
    private LocalDateTime endActiveDate;

    public DeptInfo() {}

    // ── getter / setter ──

    public String getDeptCd() { return deptCd; }
    public void setDeptCd(String deptCd) { this.deptCd = deptCd; }

    public String getDeptNm() { return deptNm; }
    public void setDeptNm(String deptNm) { this.deptNm = deptNm; }

    public String getDeptNmEn() { return deptNmEn; }
    public void setDeptNmEn(String deptNmEn) { this.deptNmEn = deptNmEn; }

    public String getUpperDeptCd() { return upperDeptCd; }
    public void setUpperDeptCd(String upperDeptCd) { this.upperDeptCd = upperDeptCd; }

    public String getUseTp() { return useTp; }
    public void setUseTp(String useTp) { this.useTp = useTp; }

    public LocalDateTime getStartActiveDate() { return startActiveDate; }
    public void setStartActiveDate(LocalDateTime startActiveDate) { this.startActiveDate = startActiveDate; }

    public LocalDateTime getEndActiveDate() { return endActiveDate; }
    public void setEndActiveDate(LocalDateTime endActiveDate) { this.endActiveDate = endActiveDate; }
}
