/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecUserMapping (TB_MCM_SEC_USER_MAPPING) JPA Repository — commUserMng 화면 owner (W5)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecUserMapping;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

/**
 * {@code MCMAPUSER.TB_MCM_SEC_USER_MAPPING} JPA Repository (commUserMng 화면 owner / W5).
 *
 * <p>PK 복합 (USER_ID, ROLE_GROUP_ID) — W4 stub 과 호환 (변경 ✗).
 *
 * <p>본 화면 INSERT (역할 추가) + DELETE (역할 삭제) — UPDATE 분기 ✗. saveAll / deleteById 만.
 *
 * <p>인용 SQL:
 * <ul>
 *   <li>표준 save() = As-Is {@code insertCommUserRoleGrp} (xml:163~174) — saveAll INSERT</li>
 *   <li>표준 deleteById() = As-Is {@code deleteCommUserRoleGrp} (xml:176~180)</li>
 *   <li>{@link #findRoleGroupIdsByUserId(String)} = As-Is mergeCommonCopyRoleGrp 의 NOT MATCHED 검증 보조 +
 *       SaveRoleGroupCopyHis.java:45 의 selectRoleMergeObject (USER_ID 기준 ROLE_GROUP_ID 보유 목록) 등가</li>
 * </ul>
 */
public interface SecUserMappingRepository extends JpaRepository<SecUserMapping, SecUserMapping.PK> {

    /**
     * 특정 USER_ID 의 보유 ROLE_GROUP_ID 전체 — mergeCommonCopyRoleGrp 의 보조 검증용.
     * As-Is xml:233~236 NOT IN subquery (USER_ID 기준 보유 ROLE_GROUP_ID) 등가.
     */
    @Query("SELECT m.roleGroupId FROM SecUserMapping m WHERE m.userId = :userId")
    List<String> findRoleGroupIdsByUserId(@Param("userId") String userId);

    /**
     * USER_ID_COPY 의 ROLE_GROUP 중 USER_ID 에 없는 것만 — As-Is selectRoleMergeObject (xml:265~276) 등가.
     * SaveRoleGroupCopyHis.java:45 / mergeCommonCopyRoleGrp 양쪽에서 사용.
     *
     * <p>구현 — JPQL NOT IN 으로 단순화:
     */
    @Query("""
            SELECT m.roleGroupId FROM SecUserMapping m
            WHERE m.userId = :userIdCopy
              AND m.roleGroupId NOT IN (
                  SELECT m2.roleGroupId FROM SecUserMapping m2 WHERE m2.userId = :userId
              )
            """)
    List<String> findRoleGroupIdsToCopy(@Param("userId") String userId,
                                        @Param("userIdCopy") String userIdCopy);

    /**
     * 역방향 전개 — ROLE_GROUP_ID 보유 사용자 목록 (포털 알림 ROLE_GROUP 타겟 fan-out,
     * 설계 docs/framework/포털알림-WebSocket-Push-상세설계.md §3.3).
     */
    @Query("SELECT DISTINCT m.userId FROM SecUserMapping m WHERE m.roleGroupId IN :roleGroupIds")
    List<String> findUserIdsByRoleGroupIdIn(@Param("roleGroupIds") Collection<String> roleGroupIds);

    /**
     * 한 사용자의 역할그룹 매핑 전체를 DELETE 한 번으로 지운다 — 사용자 삭제(SecUserService 'D' 분기) 용.
     *
     * <p>JPQL 벌크 DELETE 라 엔티티를 읽지 않고 영속성 컨텍스트·엔티티 콜백을 거치지 않는다.
     * {@link SecUserMapping} 에는 {@code @PreRemove}·cascade·연관이 없고 감사 리스너는 PrePersist·PreUpdate 만 다루므로
     * 건별 {@code deleteById} 와 DB 결과가 같다. (파생 {@code deleteBy…} 는 행마다 읽고 지우므로 쓰지 않는다.)
     *
     * <ul>
     *   <li>{@code flushAutomatically} 는 쓰지 않는다 — Hibernate 가 벌크 DELETE 실행 직전에 영향 표(매핑 표)에 미뤄 둔
     *       변경이 있으면 스스로 auto-flush 하므로({@code StandardJdbcMutationExecutor} 의 {@code autoFlushIfRequired})
     *       같은 트랜잭션에서 앞서 저장한 매핑의 INSERT → 이 DELETE 순서가 지켜진다(SecUserServiceDeleteAutoFlushTest).
     *       'D' 행이 하나인 요청은 옛 경로(매핑 ID SELECT 뒤 건별 {@code deleteById})와 flush 시점·결과가 같다.
     *       'D' 행이 둘 이상이고 앞 'D' 사용자에게 매핑이 있었으면 달라진다 — 옛 경로는 {@code deleteById} 가 남긴
     *       매핑 DELETE(미뤄 둔 {@code em.remove}) 때문에 다음 'D' 행의 JPQL SELECT 에서 Hibernate 가 계정까지 전체 flush 했고,
     *       지금은 벌크 DELETE 가 바로 실행돼 매핑 표에 미뤄 둔 것이 없으므로 사용자 계정 변경이 커밋 때 나간다.
     *       그래서 같은 요청에서 고친('U') 계정의 VER 이 옛 경로의 +2 대신 ('D' 행 수 + 1) 만큼 오르고 U_AT 도 다르며
     *       (Hibernate 는 '필요 없음' 으로 끝나는 auto-flush 검사에서도 dirty 엔티티의 {@code @PreUpdate} 를 부른다),
     *       계정 UPDATE·DELETE 의 DB 오류는 {@code saveUsers} 안이 아니라 커밋 때 난다.
     *       이 save 를 부르는 화면이 아직 없어 그대로 두며, 차이 설명은 docs/refactor-2026-10/perf-mcm.md P2 에 있다.</li>
     *   <li>{@code clearAutomatically} 는 쓰지 않는다 — 호출하는 {@code saveUsers}(secUser.bpmn saveTask) 는 이 삭제 뒤
     *       같은 트랜잭션에서 매핑을 다시 읽지 않고, 비우면 같은 영속성 단위의 다른 관리 엔티티(사이트 어댑터의 사용자 등)까지
     *       분리돼 버린다. 이 메서드를 새로 쓰는 곳이 삭제 뒤 매핑 엔티티를 다시 읽는다면 그쪽에서 판단한다.
     *       특히 같은 트랜잭션에서 이 사용자의 매핑을 미리 읽어 두었다면, 벌크 삭제 뒤 같은 PK 로 다시 저장할 때 지워진 행에
     *       UPDATE 가 나가 {@code StaleStateException} 으로 실패하므로 그 호출부에서 {@code em.clear}·{@code detach} 를 판단한다.</li>
     * </ul>
     *
     * @return 지운 행 수
     */
    @Modifying
    @Query("DELETE FROM SecUserMapping m WHERE m.userId = :userId")
    int bulkDeleteByUserId(@Param("userId") String userId);
}
