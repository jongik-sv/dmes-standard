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
     *   <li>{@code flushAutomatically = true} — 같은 트랜잭션에서 앞서 저장·변경한 행을 먼저 flush 해 실행 순서를 지킨다.</li>
     *   <li>{@code clearAutomatically} 는 쓰지 않는다 — 호출하는 {@code saveUsers}(secUser.bpmn saveTask) 는 이 삭제 뒤
     *       같은 트랜잭션에서 매핑을 다시 읽지 않고, 비우면 같은 영속성 단위의 다른 관리 엔티티(사이트 어댑터의 사용자 등)까지
     *       분리돼 버린다. 이 메서드를 새로 쓰는 곳이 삭제 뒤 매핑 엔티티를 다시 읽는다면 그쪽에서 판단한다.</li>
     * </ul>
     *
     * <p><b>알려진 차이(현재 호출 화면 없음).</b> {@code flushAutomatically} 때문에 같은 요청 앞 행에서 바뀐 사용자 계정(SecUser)이
     * 커밋 때 한 번이 아니라 첫 'D' 행에서 먼저 flush 된다. 업무 컬럼과 매핑 결과는 같지만 같은 계정이 그 flush 앞뒤로
     * 두 번 바뀌는 요청에서는 다음이 달라진다({@code CactusAuditListener} {@code @PreUpdate} 가 UPDATE 마다 VER+1·U_AT·U_USR_ID 를 채운다).
     * <ul>
     *   <li>{@code [C X, D Y, U X]} — 전: 최종 값으로 INSERT 1회. 지금: D 의 flush 에서 INSERT, 커밋 때 UPDATE → 같은 요청에서 만든 행이 VER=1.</li>
     *   <li>{@code [U X, D Y, U X]} — UPDATE 가 2회 나가 VER 이 +1 대신 +2(VER 은 {@code @Version} 이 아니라 잠금 충돌은 없다).</li>
     *   <li>앞 C·U 행에 DB 수준 오류(길이·제약)가 있고 다른 행에 검증 오류가 있으면 — 전: 행별 검증 {@code BusinessException} 후 롤백.
     *       지금: 첫 'D' 행의 flush 에서 DB 예외가 먼저 난다.</li>
     * </ul>
     * 지금은 src/frontend 에서 secUser 의 save 액션을 부르는 곳이 없어 이런 요청이 들어오지 않는다.
     * 부르는 화면이 생기면 실제 JPA 계정 저장소로 {@code [C X, D Y, U X]} 시험을 더한다(perf-mcm.md P2).
     *
     * @return 지운 행 수
     */
    @Modifying(flushAutomatically = true)
    @Query("DELETE FROM SecUserMapping m WHERE m.userId = :userId")
    int bulkDeleteByUserId(@Param("userId") String userId);
}
