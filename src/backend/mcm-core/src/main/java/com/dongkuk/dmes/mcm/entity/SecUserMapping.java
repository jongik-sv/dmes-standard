/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecUserMapping 엔티티 — TB_MCM_SEC_USER_MAPPING (사용자-역할그룹 매핑) 복합 PK (commUserMng 화면 owner / W5)
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
 * 사용자-역할그룹 매핑 — {@code TB_MCM_SEC_USER_MAPPING} (As-Is) JPA Entity (commUserMng 화면 owner / W5).
 *
 * <p>스키마 = {@code MCMAPUSER} (csa 9 화면 공통 정책 — W1·W2·W3·W4 동일).
 *
 * <p>분석리포트 §9.1.2 (DMES 시트 19 컬럼) 중 본 화면 본 2 컬럼 + audit 9 (McmAuditEntity 흡수):
 * <ul>
 *   <li>PK 복합 = (USER_ID, ROLE_GROUP_ID) — xml:165~173 INSERT / xml:152~161 SELECT JOIN / xml:176~180 DELETE WHERE 정합</li>
 *   <li>본 2 컬럼: USER_ID(PK / FK to TB_MCM_SEC_USER.USER_ID) /
 *       ROLE_GROUP_ID(PK / FK to TB_MCM_SEC_ROLEGROUP.ROLE_GROUP_ID)</li>
 *   <li>audit 17 컬럼 → McmAuditEntity 9 컬럼 표준화</li>
 * </ul>
 *
 * <p>W4 (commRoleGrpMng) 가 stub (USER_ID/ROLE_GROUP_ID 2 컬럼 + PK 2 복합) 으로 등록 (DataInitializer
 * {@code createTbMcmSecUserMappingStubIfAbsent}) → 본 화면 (W5) 이 owner 로 PK 호환 (변경 ✗) +
 * audit 9 컬럼만 ALTER ADD (정책 #15 / W4 TB_MCM_SEC_ROLEGROUP_MAPPING 정본 패턴 동일).
 *
 * <p>본 entity 는 INSERT (역할 추가) + DELETE (역할 삭제) 만 사용 — UPDATE 분기 ✗. saveAll / deleteById 만.
 *
 * <p>인용:
 * <ul>
 *   <li>분석리포트 §9.1.2 (DMES SEC_USER_MAPPING 19 컬럼 카탈로그)</li>
 *   <li>분석리포트 §11.1 (To-Be Entity 명명 — SecUserMapping / 복합 PK @IdClass)</li>
 *   <li>As-Is Mapper {@code CommUserMngMapper.selectCommUserRoleGrp / insertCommUserRoleGrp /
 *       deleteCommUserRoleGrp / mergeCommonCopyRoleGrp}</li>
 * </ul>
 */
@Entity
@Table(name = "TB_MCM_SEC_USER_MAPPING", schema = "MCMAPUSER")
@IdClass(SecUserMapping.PK.class)
public class SecUserMapping extends McmAuditEntity {

    /** PK#1 — 사용자 ID (FK to TB_MCM_SEC_USER.USER_ID). VARCHAR(100) — stub DDL 정합. */
    @Id
    @Column(name = "USER_ID", length = 100, nullable = false)
    private String userId;

    /** PK#2 — 역할 그룹 ID (FK to TB_MCM_SEC_ROLEGROUP.ROLE_GROUP_ID). VARCHAR(30). */
    @Id
    @Column(name = "ROLE_GROUP_ID", length = 30, nullable = false)
    private String roleGroupId;

    public SecUserMapping() {}

    // ── getter / setter ──

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getRoleGroupId() { return roleGroupId; }
    public void setRoleGroupId(String roleGroupId) { this.roleGroupId = roleGroupId; }

    /**
     * 복합 PK class — {@link SecUserMapping#userId} + {@link SecUserMapping#roleGroupId}.
     * JPA {@code @IdClass} spec — 필드명 / 타입 1:1 일치.
     */
    public static class PK implements Serializable {
        private static final long serialVersionUID = 1L;

        private String userId;
        private String roleGroupId;

        public PK() {}

        public PK(String userId, String roleGroupId) {
            this.userId = userId;
            this.roleGroupId = roleGroupId;
        }

        public String getUserId() { return userId; }
        public void setUserId(String userId) { this.userId = userId; }

        public String getRoleGroupId() { return roleGroupId; }
        public void setRoleGroupId(String roleGroupId) { this.roleGroupId = roleGroupId; }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof PK)) return false;
            PK pk = (PK) o;
            return Objects.equals(userId, pk.userId)
                && Objects.equals(roleGroupId, pk.roleGroupId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, roleGroupId);
        }
    }
}
