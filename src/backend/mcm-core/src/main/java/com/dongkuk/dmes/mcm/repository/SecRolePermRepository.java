/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: SecRolePermRepository — TB_MCM_SEC_ROLE_PERM JPA 저장소 (퍼미션 모델 v2)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecRolePerm;
import com.dongkuk.dmes.mcm.entity.SecRolePermId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

/** 직무×오브젝트 퍼미션({@link SecRolePerm}) 저장소. */
public interface SecRolePermRepository extends JpaRepository<SecRolePerm, SecRolePermId> {

    /** 직무 한 개의 퍼미션 전부. */
    List<SecRolePerm> findByRoleId(String roleId);

    /** 여러 직무의 퍼미션(로그인 사용자 그래프 적재용). */
    List<SecRolePerm> findByRoleIdIn(Collection<String> roleIds);

    /** 오브젝트 한 개를 가리키는 퍼미션(오브젝트 삭제 검사·이 오브젝트의 퍼미션). */
    List<SecRolePerm> findByObjectId(String objectId);

    /** 직무를 쓰는 퍼미션 수(직무 삭제 검사). */
    long countByRoleId(String roleId);

    /** 오브젝트를 쓰는 퍼미션 수(오브젝트 삭제 검사). */
    long countByObjectId(String objectId);
}
