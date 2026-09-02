/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecRoleGroupMapping (TB_MCM_SEC_ROLEGROUP_MAPPING) JPA Repository — commRoleGrpMng 화면 owner (W4)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecRoleGroupMapping;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

/**
 * {@code MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING} JPA Repository — Spring Data 표준 CRUD (commRoleGrpMng 화면 owner / W4).
 *
 * <p>Save / Delete / findById / existsById 표준만 제공. 복잡 native query (selectCommRoleGrpMap 2 테이블 JOIN,
 * selectCommRole NOT EXISTS, selectMenuObjTree 5 테이블 CTE) 는 {@link SecRoleGroupMappingNativeRepository}
 * 의 별도 어댑터 클래스에서 처리.
 *
 * <p>PK 복합 (ROLE_GROUP_ID, ROLE_ID) — {@link SecRoleGroupMapping.PK} {@code @IdClass} 정합.
 *
 * <p>본 화면은 As-Is updateCommRoleGrpMap 더미 DUAL (xml:113~116) → To-Be 폐기. save() 는 INSERT only.
 * saveCmRoleGrpMap action 의 INSERT/DELETE 분기는 Service for-loop 에서 명시
 * (status="inserted" → save / "deleted" → deleteById / W3 SecRoleMappingRepository 정본 패턴 동일).
 *
 * <p>RBAC chain 메서드 {@link #findRoleIdsByRoleGroupIdIn(Collection)} — UserPermCache /
 * McmAuthService 의 User → RoleGroup → Role chain 빌드 (Phase R1).
 */
public interface SecRoleGroupMappingRepository extends JpaRepository<SecRoleGroupMapping, SecRoleGroupMapping.PK> {

    /**
     * 사용자가 보유한 ROLE_GROUP_ID 들을 입력으로 매핑된 ROLE_ID 목록 조회 (RBAC chain step 2 — Phase R1).
     *
     * <p>{@link com.dongkuk.dmes.mcm.security.endpoint.UserPermCache#build(String) UserPermCache.build} 의
     * step 2: roleGroupIds → roleIds 빌드용.
     */
    @Query("SELECT m.roleId FROM SecRoleGroupMapping m WHERE m.roleGroupId IN :roleGroupIds")
    List<String> findRoleIdsByRoleGroupIdIn(@Param("roleGroupIds") Collection<String> roleGroupIds);

    /**
     * 역방향 전개 — ROLE_ID 가 속한 ROLE_GROUP_ID 목록 (포털 알림 ROLE 타겟 2-hop fan-out 의 1단계,
     * 설계 docs/framework/포털알림-WebSocket-Push-상세설계.md §3.3).
     */
    @Query("SELECT DISTINCT m.roleGroupId FROM SecRoleGroupMapping m WHERE m.roleId = :roleId")
    List<String> findRoleGroupIdsByRoleId(@Param("roleId") String roleId);
}
