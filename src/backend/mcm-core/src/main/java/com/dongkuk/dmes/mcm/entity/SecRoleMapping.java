/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecRoleMapping 엔티티 — TB_MCM_SEC_ROLE_MAPPING (역할-권한 매핑) 복합 PK 정의 (commRoleMng 화면 owner / W3)
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
 * 역할-권한 매핑 — {@code TB_MCM_SEC_ROLE_MAPPING} (As-Is) JPA Entity (commRoleMng 화면 owner / W3).
 *
 * <p>스키마 = {@code MCMAPUSER} (csa 9 화면 공통 정책 — W1·W2 동일).
 *
 * <p>분석리포트 §9.4.2 (As-Is DMES 시트 20 컬럼) 중 본 화면 본 3 컬럼 + audit 9:
 * <ul>
 *   <li>PK 복합 = (ROLE_ID, OBJECT_ID, PERMISSION_ID) — xml:114/134~136 의 INSERT/DELETE 키 정합</li>
 *   <li>본 3 컬럼: ROLE_ID(PK) / OBJECT_ID(PK) / PERMISSION_ID(PK)</li>
 *   <li>audit 17 컬럼 (DMES 카탈로그) 폐기 → McmAuditEntity 9 컬럼 표준화</li>
 * </ul>
 *
 * <p>본 entity 는 read-only EXISTS 검증 + INSERT + DELETE 만 사용 (As-Is updateCommRoleMap 은 no-op 폐기 / Q-011 closed).
 * UPDATE 분기 자체 ✗ — saveAll INSERT + deleteById DELETE 만.
 *
 * <p>인용:
 * <ul>
 *   <li>분석리포트 §9.1 #2 / §9.4.2 (As-Is 컬럼 카탈로그 20 — 본 3 + audit 17)</li>
 *   <li>분석리포트 §11.1 / §11 #12 #19 (To-Be 명명 안 — Entity = SecRoleMapping / Repository = SecRoleMappingRepository / 복합 PK @IdClass)</li>
 *   <li>As-Is Mapper {@code CommRoleMngMapper.selectCommRoleMapList / insertCommRoleMap / deleteCommRoleMap}</li>
 * </ul>
 */
@Entity
@Table(name = "TB_MCM_SEC_ROLE_MAPPING", schema = "MCMAPUSER")
@IdClass(SecRoleMapping.PK.class)
public class SecRoleMapping extends McmAuditEntity {

    /** PK#1 — 역할 ID (xfdl GE-011 / 분석 §9.4.2 #1 — FK to TB_MCM_SEC_ROLE.ROLE_ID). VARCHAR(30). */
    @Id
    @Column(name = "ROLE_ID", length = 30, nullable = false)
    private String roleId;

    /** PK#2 — Object ID (xfdl GE-003 / 분석 §9.4.2 #2 — FK to TB_MCM_SEC_OBJ.OBJECT_ID). VARCHAR(50). */
    @Id
    @Column(name = "OBJECT_ID", length = 50, nullable = false)
    private String objectId;

    /** PK#3 — 퍼미션 ID (xfdl GE-002 / 분석 §9.4.2 #3 — FK to TB_MCM_SEC_PERM.PERMISSION_ID). VARCHAR(100). */
    @Id
    @Column(name = "PERMISSION_ID", length = 100, nullable = false)
    private String permissionId;

    public SecRoleMapping() {}

    // ── getter / setter ──

    public String getRoleId() { return roleId; }
    public void setRoleId(String roleId) { this.roleId = roleId; }

    public String getObjectId() { return objectId; }
    public void setObjectId(String objectId) { this.objectId = objectId; }

    public String getPermissionId() { return permissionId; }
    public void setPermissionId(String permissionId) { this.permissionId = permissionId; }

    /**
     * 복합 PK class — {@link SecRoleMapping#roleId} + {@link SecRoleMapping#objectId} + {@link SecRoleMapping#permissionId}.
     * JPA {@code @IdClass} spec — 필드명 / 타입 1:1 일치.
     */
    public static class PK implements Serializable {
        private static final long serialVersionUID = 1L;

        private String roleId;
        private String objectId;
        private String permissionId;

        public PK() {}

        public PK(String roleId, String objectId, String permissionId) {
            this.roleId = roleId;
            this.objectId = objectId;
            this.permissionId = permissionId;
        }

        public String getRoleId() { return roleId; }
        public void setRoleId(String roleId) { this.roleId = roleId; }

        public String getObjectId() { return objectId; }
        public void setObjectId(String objectId) { this.objectId = objectId; }

        public String getPermissionId() { return permissionId; }
        public void setPermissionId(String permissionId) { this.permissionId = permissionId; }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof PK)) return false;
            PK pk = (PK) o;
            return Objects.equals(roleId, pk.roleId)
                && Objects.equals(objectId, pk.objectId)
                && Objects.equals(permissionId, pk.permissionId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(roleId, objectId, permissionId);
        }
    }
}
