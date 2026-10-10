/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecRoleGroup (TB_MCM_SEC_ROLEGROUP) JPA Repository — commRoleGrpMng 화면 owner (W4)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecRoleGroup;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * {@code MCMAPUSER.TB_MCM_SEC_ROLEGROUP} JPA Repository (commRoleGrpMng 화면 owner / W4).
 *
 * <p>인용 SQL (분석리포트 §6):
 * <ul>
 *   <li>{@link #searchByFilter(String, String, String)} = As-Is {@code selectCommRoleGrp} (xml:7~35)
 *       — UPPER(ROLE_GROUP_ID) LIKE + UPPER(ROLE_GROUP_NM) LIKE + USE_TP 일치. ORDER BY START_ACTIVE_DATE.
 *       To-Be 정책 #1: cbo_bizSystemCode WHERE 분기 제거. USER_ID scalar subquery 는 Service 레이어에서 후처리.</li>
 *   <li>{@link #findOneUserIdByRoleGroupId(String)} = As-Is xml:14~18 의 scalar subquery
 *       — {@code SELECT B.USER_ID FROM TB_MCM_SEC_USER_MAPPING B WHERE B.ROLE_GROUP_ID = A.ROLE_GROUP_ID AND ROWNUM=1}
 *       의 MSSQL TOP 1 등가 (정합 §11.1 #1 / W3 SecRoleRepository 정본 패턴 동일).
 *       FE V-101 행삭제 차단 검증용 (xfdl:739~743).</li>
 *   <li>{@link #countUserMappingByRoleGroupId(String)} = As-Is {@code deleteCommRoleGrp} NOT EXISTS #1
 *       (xml:77~80 — TB_MCM_SEC_USER_MAPPING.ROLE_GROUP_ID) 의 inverse count (서버 재검증)</li>
 *   <li>{@link #countRoleGroupMappingByRoleGroupId(String)} = As-Is {@code deleteCommRoleGrp} NOT EXISTS #2
 *       (xml:80~82 — TB_MCM_SEC_ROLEGROUP_MAPPING.ROLE_GROUP_ID) 의 inverse count (서버 재검증)</li>
 * </ul>
 *
 * <p>To-Be 정책 #1 (BIZ_SYSTEM_CODE 폐기) 반영 — {@link #searchByFilter} 파라미터는 3 (As-Is 4 → To-Be 3).
 */
public interface SecRoleGroupRepository extends JpaRepository<SecRoleGroup, String> {

    /**
     * As-Is {@code selectCommRoleGrp} (xml:7~35) MSSQL 변환.
     *
     * <p>As-Is WHERE 분기 (3 if + 1 To-Be 폐기):
     * <ul>
     *   <li>{@code edt_ROLE_GROUP_ID} → {@code UPPER(A.ROLE_GROUP_ID) LIKE UPPER('%' || #{} || '%')} (xml:22)</li>
     *   <li>{@code edt_ROLE_GROUP_NM} → {@code UPPER(A.ROLE_GROUP_NM) LIKE UPPER('%' || #{} || '%')} (xml:25)</li>
     *   <li>{@code cbo_USE_TP} → {@code A.USE_TP = #{}} (xml:28)</li>
     *   <li>~~{@code cbo_bizSystemCode} → {@code A.BIZ_SYSTEM_CODE = #{}}~~ — To-Be 폐기 (정책 #1)</li>
     * </ul>
     *
     * <p>ORDER BY A.START_ACTIVE_DATE (As-Is xml:34 보존).
     */
    @Query("""
            SELECT g FROM SecRoleGroup g
            WHERE (:pRoleGroupId IS NULL OR :pRoleGroupId = ''
                   OR UPPER(g.roleGroupId) LIKE UPPER(CONCAT('%', :pRoleGroupId, '%')))
              AND (:pRoleGroupNm IS NULL OR :pRoleGroupNm = ''
                   OR UPPER(g.roleGroupNm) LIKE UPPER(CONCAT('%', :pRoleGroupNm, '%')))
              AND (:pUseTp IS NULL OR :pUseTp = '' OR g.useTp = :pUseTp)
            ORDER BY g.startActiveDate
            """)
    List<SecRoleGroup> searchByFilter(@Param("pRoleGroupId") String pRoleGroupId,
                                      @Param("pRoleGroupNm") String pRoleGroupNm,
                                      @Param("pUseTp") String pUseTp);

    /**
     * As-Is xml:14~18 scalar subquery
     * {@code (SELECT B.USER_ID FROM TB_MCM_SEC_USER_MAPPING B WHERE B.ROLE_GROUP_ID = A.ROLE_GROUP_ID AND ROWNUM=1)}
     * 변환. MSSQL native query 로 {@code TOP 1} 사용 (W3 SecRoleRepository.findOneRoleGroupIdByRoleId 정본 패턴).
     *
     * <p>2026-06-06 — 과거 MSSQL native {@code TOP 1} 이었으나 dialect 독립을 위해 JPQL + {@link Limit} 로 전환
     * (JPQL + Limit 이라 DB 문법에 묶이지 않는다). SecUserMapping entity 사용 → 행 제한은 Hibernate 가 dialect 에 맞게 생성한다.
     */
    @Query("SELECT m.userId FROM SecUserMapping m WHERE m.roleGroupId = :roleGroupId")
    List<String> findUserIdsByRoleGroupId(@Param("roleGroupId") String roleGroupId, Limit limit);

    /** As-Is scalar subquery 의 String 단일 반환 시그니처 유지(호출처 무변경) — 첫 행 또는 없으면 null. */
    default String findOneUserIdByRoleGroupId(String roleGroupId) {
        List<String> ids = findUserIdsByRoleGroupId(roleGroupId, Limit.of(1));
        return ids.isEmpty() ? null : ids.get(0);
    }

    /**
     * As-Is {@code deleteCommRoleGrp} (xml:77~80) NOT EXISTS subquery #1 정합 검증용 (서버 재검증).
     * 본 method 는 TB_MCM_SEC_USER_MAPPING 의 동일 ROLE_GROUP_ID row 카운트 (0 = 삭제 가능).
     */
    @Query(value = "SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_USER_MAPPING WHERE ROLE_GROUP_ID = :roleGroupId",
           nativeQuery = true)
    long countUserMappingByRoleGroupId(@Param("roleGroupId") String roleGroupId);

    /**
     * As-Is {@code deleteCommRoleGrp} (xml:80~82) NOT EXISTS subquery #2 정합 검증용 (서버 재검증).
     * 본 method 는 TB_MCM_SEC_ROLEGROUP_MAPPING 의 동일 ROLE_GROUP_ID row 카운트 (0 = 삭제 가능).
     */
    @Query(value = "SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING WHERE ROLE_GROUP_ID = :roleGroupId",
           nativeQuery = true)
    long countRoleGroupMappingByRoleGroupId(@Param("roleGroupId") String roleGroupId);
}
