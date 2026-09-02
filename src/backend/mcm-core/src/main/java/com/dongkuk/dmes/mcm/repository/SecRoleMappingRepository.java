/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecRoleMapping (TB_MCM_SEC_ROLE_MAPPING) JPA Repository — commRoleMng 화면 owner (복합 PK INSERT/DELETE)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecRoleMapping;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

/**
 * {@code MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING} JPA Repository — Spring Data 표준 CRUD (commRoleMng 화면 owner / W3).
 *
 * <p>Save / Delete / findById / existsById 표준만 제공. 복잡 native query (selectCommRoleMapList 3 테이블 JOIN,
 * selectCommPerm NOT EXISTS) 는 {@link SecRoleMappingNativeRepository} 의 별도 어댑터 클래스에서 처리.
 *
 * <p>PK 복합 (ROLE_ID, OBJECT_ID, PERMISSION_ID) — {@link SecRoleMapping.PK} {@code @IdClass} 정합.
 *
 * <p>본 화면은 As-Is UPDATE 분기 ✗ (updateCommRoleMap no-op 폐기 / Q-011 closed) → save() 는 INSERT only.
 * saveCmRoleMap action 의 INSERT/DELETE 분기는 Service for-loop 에서 명시 (status="inserted" → save / "deleted" → deleteById).
 *
 * <p>RBAC chain 메서드 {@link #findByRoleIdIn(Collection)} — UserPermCache 의
 * Role → (OBJECT_ID, PERMISSION_ID) chain 빌드 (Phase R1).
 */
public interface SecRoleMappingRepository extends JpaRepository<SecRoleMapping, SecRoleMapping.PK> {

    /**
     * 주어진 ROLE_ID 집합의 모든 매핑 row 를 한 번에 조회 (RBAC chain step 3 — Phase R1).
     *
     * <p>{@link com.dongkuk.dmes.mcm.security.endpoint.UserPermCache#build(String) UserPermCache.build} 의
     * step 3: roleIds → (objectId, permissionId) 추출용. N+1 회피를 위해 한 번에 in-clause 로 조회.
     */
    List<SecRoleMapping> findByRoleIdIn(Collection<String> roleIds);

    /**
     * OBJECT_ID 의 모든 매핑 row 조회 — commObjMng obj 삭제 시 비-SYSADMIN 매핑 차단 판정
     * 및 SYSADMIN 자동 매핑 동반 삭제용 (2026-07-30 순수 RBAC 전환 설계 D4).
     */
    List<SecRoleMapping> findByObjectId(String objectId);
}
