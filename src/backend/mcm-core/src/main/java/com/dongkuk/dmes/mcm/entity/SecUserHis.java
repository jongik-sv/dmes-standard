/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecUserHis 엔티티 — TB_MCM_SEC_USER_HIS (계정생성/삭제 이력) 복합 PK (commUserMng 화면 owner / W5)
 *       정책 #3 (C) — As-Is 외부 namespace Mapper (TB_MCM_SEC_USER_HIS_Mapper.insert) → JPA Entity 흡수
 */
package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.util.Objects;

/**
 * 계정 생성/삭제/재생성 이력 — {@code TB_MCM_SEC_USER_HIS} (As-Is) JPA Entity (commUserMng 화면 owner / W5).
 *
 * <p>스키마 = {@code MCMAPUSER}. PROC_TYPE = C/D, PROC_CASE = M(Manual) 하드코딩.
 *
 * <p>분석리포트 §9.1.5 (DMES 시트 24 컬럼) 중 본 화면 본 7 컬럼 + audit 9:
 * <ul>
 *   <li>PK 복합 = (USER_ID, ACTIVE_DT) — DMES 시트 + As-Is Java DeleteCommUserMng/RegCommUserMng/ReRegCommUserMng 호출 정합</li>
 *   <li>본 7 컬럼: USER_ID(PK) / ACTIVE_DT(PK, YYYYMMDD VARCHAR(8)) / PROC_TYPE(C/D) /
 *       PROC_CASE(M Manual) / USER_NM / INF_REQ_NO / DESCRIPTION</li>
 *   <li>audit 17 컬럼 → McmAuditEntity 9 컬럼 표준화</li>
 * </ul>
 *
 * <p>정책 #3 (C) / Q-004 해소 — As-Is 외부 namespace {@code TB_MCM_SEC_USER_HIS_Mapper.insert} 호출 흡수.
 * 별도 Mapper.xml 신규 작성 ✗. Service 가 본 Entity 를 직접 save() 호출.
 *
 * <p>인용:
 * <ul>
 *   <li>분석리포트 §9.1.5 (DMES SEC_USER_HIS 24 컬럼 카탈로그)</li>
 *   <li>분석리포트 §6.1 X-1 / §11.1 (To-Be Entity 명명 — SecUserHis / 복합 PK @IdClass)</li>
 *   <li>As-Is Java {@code DeleteCommUserMng.java:64 / RegCommUserMng.java:70 / ReRegCommUserMng.java:78}</li>
 * </ul>
 */
@Entity
@Table(name = "TB_MCM_SEC_USER_HIS", schema = "MCMAPUSER")
@IdClass(SecUserHis.PK.class)
public class SecUserHis extends McmAuditEntity {

    /** PK#1 — 사용자 ID (FK to TB_MCM_SEC_USER.USER_ID / 분석 §9.1.5 #1). VARCHAR(30). */
    @Id
    @Column(name = "USER_ID", length = 30, nullable = false)
    private String userId;

    /** PK#2 — 기준 일자 (YYYYMMDD / 분석 §9.1.5 #2). VARCHAR(8). */
    @Id
    @Column(name = "ACTIVE_DT", length = 8, nullable = false)
    private String activeDt;

    /** 구분 — C=Create / D=Delete (RegCommUserMng:64 / DeleteCommUserMng:58 / ReRegCommUserMng:72). VARCHAR(1). */
    @Column(name = "PROC_TYPE", length = 1)
    private String procType;

    /** 처리 유형 — M=Manual (As-Is 모든 호출 'M' 하드코딩). VARCHAR(1). */
    @Column(name = "PROC_CASE", length = 1)
    private String procCase;

    /** 사용자명 (RegCommUserMng / DeleteCommUserMng / ReRegCommUserMng 모두 적재 / 분석 §9.1.5 #5). VARCHAR(30). */
    @Column(name = "USER_NM", length = 30)
    private String userNm;

    /** 정보처리의뢰서번호 (D-019 / 분석 §9.1.5 #6). VARCHAR(100). */
    @Column(name = "INF_REQ_NO", length = 100)
    private String infReqNo;

    /** 처리 사유 (D-020 / 분석 §9.1.5 #7). VARCHAR(300). */
    @Column(name = "DESCRIPTION", length = 300)
    private String description;

    public SecUserHis() {}

    // ── getter / setter ──

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getActiveDt() { return activeDt; }
    public void setActiveDt(String activeDt) { this.activeDt = activeDt; }

    public String getProcType() { return procType; }
    public void setProcType(String procType) { this.procType = procType; }

    public String getProcCase() { return procCase; }
    public void setProcCase(String procCase) { this.procCase = procCase; }

    public String getUserNm() { return userNm; }
    public void setUserNm(String userNm) { this.userNm = userNm; }

    public String getInfReqNo() { return infReqNo; }
    public void setInfReqNo(String infReqNo) { this.infReqNo = infReqNo; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    /**
     * 복합 PK class — {@link SecUserHis#userId} + {@link SecUserHis#activeDt}.
     */
    public static class PK implements Serializable {
        private static final long serialVersionUID = 1L;

        private String userId;
        private String activeDt;

        public PK() {}

        public PK(String userId, String activeDt) {
            this.userId = userId;
            this.activeDt = activeDt;
        }

        public String getUserId() { return userId; }
        public void setUserId(String userId) { this.userId = userId; }

        public String getActiveDt() { return activeDt; }
        public void setActiveDt(String activeDt) { this.activeDt = activeDt; }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof PK)) return false;
            PK pk = (PK) o;
            return Objects.equals(userId, pk.userId)
                && Objects.equals(activeDt, pk.activeDt);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, activeDt);
        }
    }
}
