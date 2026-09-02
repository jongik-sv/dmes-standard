/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecRoleGroupMapping 엔티티 — TB_MCM_SEC_ROLEGROUP_MAPPING (역할 그룹-역할 매핑) 복합 PK (commRoleGrpMng 화면 owner / W4)
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
 * 역할 그룹-역할 매핑 — {@code TB_MCM_SEC_ROLEGROUP_MAPPING} (As-Is) JPA Entity (commRoleGrpMng 화면 owner / W4).
 *
 * <p>스키마 = {@code MCMAPUSER} (csa 9 화면 공통 정책 — W1·W2·W3 동일).
 *
 * <p>분석리포트 §9.9.2 (As-Is DMES 시트 19 컬럼) 중 본 화면 본 2 컬럼 + audit 9:
 * <ul>
 *   <li>PK 복합 = (ROLE_GROUP_ID, ROLE_ID) — xml:96 / 107~108 / 120~121 의 INSERT/SELECT/DELETE 키 정합</li>
 *   <li>본 2 컬럼: ROLE_GROUP_ID(PK / FK to TB_MCM_SEC_ROLEGROUP.ROLE_GROUP_ID) /
 *       ROLE_ID(PK / FK to TB_MCM_SEC_ROLE.ROLE_ID)</li>
 *   <li>audit 17 컬럼 (DMES 카탈로그) 폐기 → McmAuditEntity 9 컬럼 표준화</li>
 * </ul>
 *
 * <p>본 entity 는 INSERT + DELETE 만 사용 — As-Is updateCommRoleGrpMap (xml:113~116) 은 더미 SELECT 'X' FROM DUAL
 * (실 동작 ✗). UPDATE 분기 자체 ✗ — saveAll INSERT + deleteById DELETE 만 (W3 SecRoleMapping 정합).
 *
 * <p>W3 (commRoleMng) 가 stub (ROLE_GROUP_ID/ROLE_ID 2 컬럼 + PK 2 복합) 으로 등록 →
 * 본 화면 (W4) 이 owner 로 audit 9 컬럼만 ALTER ADD (DataInitializer 처리).
 *
 * <p>인용:
 * <ul>
 *   <li>분석리포트 §9.2 / §9.9.2 (As-Is 컬럼 카탈로그 19 — 본 2 + audit 17)</li>
 *   <li>분석리포트 §11.1 / §12 (To-Be 명명 안 — Entity = SecRoleGroupMapping / Repository = SecRoleGroupMappingRepository / 복합 PK @IdClass)</li>
 *   <li>As-Is Mapper {@code CommRoleGrpMngMapper.selectCommRoleGrpMap / insertCommRoleGrpMap / deleteCommRoleGrpMap}</li>
 * </ul>
 */
@Entity
@Table(name = "TB_MCM_SEC_ROLEGROUP_MAPPING", schema = "MCMAPUSER")
@IdClass(SecRoleGroupMapping.PK.class)
public class SecRoleGroupMapping extends McmAuditEntity {

    /** PK#1 — 역할 그룹 ID (xfdl GE1-008 / 분석 §9.9.2 #1 — FK to TB_MCM_SEC_ROLEGROUP.ROLE_GROUP_ID). VARCHAR(30). */
    @Id
    @Column(name = "ROLE_GROUP_ID", length = 30, nullable = false)
    private String roleGroupId;

    /** PK#2 — 역할 ID (xfdl GE1-002 / 분석 §9.9.2 #2 — FK to TB_MCM_SEC_ROLE.ROLE_ID). VARCHAR(30). */
    @Id
    @Column(name = "ROLE_ID", length = 30, nullable = false)
    private String roleId;

    public SecRoleGroupMapping() {}

    // ── getter / setter ──

    public String getRoleGroupId() { return roleGroupId; }
    public void setRoleGroupId(String roleGroupId) { this.roleGroupId = roleGroupId; }

    public String getRoleId() { return roleId; }
    public void setRoleId(String roleId) { this.roleId = roleId; }

    /**
     * 복합 PK class — {@link SecRoleGroupMapping#roleGroupId} + {@link SecRoleGroupMapping#roleId}.
     * JPA {@code @IdClass} spec — 필드명 / 타입 1:1 일치.
     */
    public static class PK implements Serializable {
        private static final long serialVersionUID = 1L;

        private String roleGroupId;
        private String roleId;

        public PK() {}

        public PK(String roleGroupId, String roleId) {
            this.roleGroupId = roleGroupId;
            this.roleId = roleId;
        }

        public String getRoleGroupId() { return roleGroupId; }
        public void setRoleGroupId(String roleGroupId) { this.roleGroupId = roleGroupId; }

        public String getRoleId() { return roleId; }
        public void setRoleId(String roleId) { this.roleId = roleId; }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof PK)) return false;
            PK pk = (PK) o;
            return Objects.equals(roleGroupId, pk.roleGroupId)
                && Objects.equals(roleId, pk.roleId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(roleGroupId, roleId);
        }
    }
}
