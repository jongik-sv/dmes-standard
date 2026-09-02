/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecUserRollHis 엔티티 — TB_MCM_SEC_USER_ROLL_HIS (일자별 권한변경 이력) 5 복합 PK (commUserMng 화면 owner / W5)
 *       정책 #3 (C) — As-Is 외부 namespace Mapper (TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK) → JPA Entity 흡수
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
 * 일자별 권한변경 이력 — {@code TB_MCM_SEC_USER_ROLL_HIS} (As-Is) JPA Entity (commUserMng 화면 owner / W5).
 *
 * <p>스키마 = {@code MCMAPUSER}. WORKS_CODE = P, RESP_GBN = A(추가) / D(삭제).
 *
 * <p>분석리포트 §9.1.6 (DMES 시트 25 컬럼) 중 본 화면 본 8 컬럼 + audit 9:
 * <ul>
 *   <li>PK 5 복합 = (OP_SUMUP_DT, WORKS_CODE, USER_ID, ROLE_GROUP_ID, RESP_GBN) — DMES 시트 명시 (5 PK)</li>
 *   <li>본 8 컬럼: OP_SUMUP_DT(PK YYYYMMDD VARCHAR 8) / WORKS_CODE(PK "P") / USER_ID(PK) /
 *       ROLE_GROUP_ID(PK) / RESP_GBN(PK A/D) / ROLE_GROUP_NM / INF_REQ_NO / DESCRIPTION</li>
 *   <li>audit 17 컬럼 → McmAuditEntity 9 컬럼 표준화</li>
 * </ul>
 *
 * <p>정책 #3 (C) / Q-004 해소 — As-Is 외부 namespace {@code TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK} 호출 흡수.
 * As-Is mergePK = 복합 PK 동일 시 upsert. To-Be JPA save() 가 동일 동작 (existsById → update / 아니면 insert).
 *
 * <p>인용:
 * <ul>
 *   <li>분석리포트 §9.1.6 (DMES SEC_USER_ROLL_HIS 25 컬럼 카탈로그)</li>
 *   <li>분석리포트 §6.1 X-2 / §11.1 (To-Be Entity 명명 — SecUserRollHis / 복합 PK @IdClass)</li>
 *   <li>As-Is Java {@code SaveRoleGroupHis.java:53/67 / SaveRoleGroupCopyHis.java:60}</li>
 * </ul>
 */
@Entity
@Table(name = "TB_MCM_SEC_USER_ROLL_HIS", schema = "MCMAPUSER")
@IdClass(SecUserRollHis.PK.class)
public class SecUserRollHis extends McmAuditEntity {

    /** PK#1 — 기준 일자 (YYYYMMDD CommonUtil.getCurrentDate / 분석 §9.1.6 #1). VARCHAR(8). */
    @Id
    @Column(name = "OP_SUMUP_DT", length = 8, nullable = false)
    private String opSumupDt;

    /** PK#2 — 사소 구분 (SaveRoleGroupHis/CopyHis 모두 "P" 하드코딩 / 분석 §9.1.6 #2). VARCHAR(1). */
    @Id
    @Column(name = "WORKS_CODE", length = 1, nullable = false)
    private String worksCode;

    /** PK#3 — 사용자 ID (FK to TB_MCM_SEC_USER.USER_ID / 분석 §9.1.6 #3). VARCHAR(30). */
    @Id
    @Column(name = "USER_ID", length = 30, nullable = false)
    private String userId;

    /** PK#4 — 역할 그룹 ID (FK to TB_MCM_SEC_ROLEGROUP.ROLE_GROUP_ID / 분석 §9.1.6 #4). VARCHAR(30). */
    @Id
    @Column(name = "ROLE_GROUP_ID", length = 30, nullable = false)
    private String roleGroupId;

    /** PK#5 — 구분 (A=추가 / D=삭제 / 분석 §9.1.6 #5). VARCHAR(1). */
    @Id
    @Column(name = "RESP_GBN", length = 1, nullable = false)
    private String respGbn;

    /** 역할 그룹명 (RoleGroup JOIN 적재 / 분석 §9.1.6 #6). VARCHAR(100). */
    @Column(name = "ROLE_GROUP_NM", length = 100)
    private String roleGroupNm;

    /** 정보처리의뢰서번호 (D-019 / 분석 §9.1.6 #7). VARCHAR(100). */
    @Column(name = "INF_REQ_NO", length = 100)
    private String infReqNo;

    /** 처리 사유 (D-020 / 분석 §9.1.6 #8). VARCHAR(300). */
    @Column(name = "DESCRIPTION", length = 300)
    private String description;

    public SecUserRollHis() {}

    // ── getter / setter ──

    public String getOpSumupDt() { return opSumupDt; }
    public void setOpSumupDt(String opSumupDt) { this.opSumupDt = opSumupDt; }

    public String getWorksCode() { return worksCode; }
    public void setWorksCode(String worksCode) { this.worksCode = worksCode; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getRoleGroupId() { return roleGroupId; }
    public void setRoleGroupId(String roleGroupId) { this.roleGroupId = roleGroupId; }

    public String getRespGbn() { return respGbn; }
    public void setRespGbn(String respGbn) { this.respGbn = respGbn; }

    public String getRoleGroupNm() { return roleGroupNm; }
    public void setRoleGroupNm(String roleGroupNm) { this.roleGroupNm = roleGroupNm; }

    public String getInfReqNo() { return infReqNo; }
    public void setInfReqNo(String infReqNo) { this.infReqNo = infReqNo; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    /**
     * 복합 PK class — 5 컬럼 (OP_SUMUP_DT + WORKS_CODE + USER_ID + ROLE_GROUP_ID + RESP_GBN).
     */
    public static class PK implements Serializable {
        private static final long serialVersionUID = 1L;

        private String opSumupDt;
        private String worksCode;
        private String userId;
        private String roleGroupId;
        private String respGbn;

        public PK() {}

        public PK(String opSumupDt, String worksCode, String userId, String roleGroupId, String respGbn) {
            this.opSumupDt = opSumupDt;
            this.worksCode = worksCode;
            this.userId = userId;
            this.roleGroupId = roleGroupId;
            this.respGbn = respGbn;
        }

        public String getOpSumupDt() { return opSumupDt; }
        public void setOpSumupDt(String opSumupDt) { this.opSumupDt = opSumupDt; }

        public String getWorksCode() { return worksCode; }
        public void setWorksCode(String worksCode) { this.worksCode = worksCode; }

        public String getUserId() { return userId; }
        public void setUserId(String userId) { this.userId = userId; }

        public String getRoleGroupId() { return roleGroupId; }
        public void setRoleGroupId(String roleGroupId) { this.roleGroupId = roleGroupId; }

        public String getRespGbn() { return respGbn; }
        public void setRespGbn(String respGbn) { this.respGbn = respGbn; }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof PK)) return false;
            PK pk = (PK) o;
            return Objects.equals(opSumupDt, pk.opSumupDt)
                && Objects.equals(worksCode, pk.worksCode)
                && Objects.equals(userId, pk.userId)
                && Objects.equals(roleGroupId, pk.roleGroupId)
                && Objects.equals(respGbn, pk.respGbn);
        }

        @Override
        public int hashCode() {
            return Objects.hash(opSumupDt, worksCode, userId, roleGroupId, respGbn);
        }
    }
}
