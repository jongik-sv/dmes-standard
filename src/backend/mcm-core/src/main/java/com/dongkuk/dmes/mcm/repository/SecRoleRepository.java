/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecRole (TB_MCM_SEC_ROLE) JPA Repository — commRoleMng 화면 owner (search + save + delete 검증)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecRole;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * {@code MCMAPUSER.TB_MCM_SEC_ROLE} JPA Repository (commRoleMng 화면 owner / W3).
 *
 * <p>인용 SQL (분석리포트 §6):
 * <ul>
 *   <li>{@link #searchByFilter(String, String, String)} = As-Is {@code selectCommRole} (xml:7~37)
 *       — UPPER(ROLE_ID) LIKE + UPPER(ROLE_NM) LIKE + USE_TP 일치. ORDER BY START_ACTIVE_DATE.
 *       To-Be 정책 #1: cbo_bizSystemCode WHERE 분기 제거. ROLE_GROUP_ID scalar subquery / ID(SUBSTR/INSTR) 는
 *       Service 레이어에서 후처리.</li>
 *   <li>{@link #findOneRoleGroupIdByRoleId(String)} = As-Is xml:14~18 의 scalar subquery
 *       — {@code SELECT B.ROLE_GROUP_ID FROM TB_MCM_SEC_ROLEGROUP_MAPPING B WHERE B.ROLE_ID = A.ROLE_ID AND ROWNUM=1}
 *       의 MSSQL TOP 1 등가 (정합 §11 #4)</li>
 *   <li>{@link #countRoleGroupMappingByRoleId(String)} = As-Is {@code deleteCommRole} NOT EXISTS #1
 *       (xml:80~82 — TB_MCM_SEC_ROLEGROUP_MAPPING.ROLE_ID) 의 inverse count (V-003 서버 재검증)</li>
 *   <li>{@link #countRoleMappingByRoleId(String)} = As-Is {@code deleteCommRole} NOT EXISTS #2
 *       (xml:83~86 — TB_MCM_SEC_ROLE_MAPPING.ROLE_ID) 의 inverse count (V-004 서버 재검증)</li>
 * </ul>
 *
 * <p>To-Be 정책 #1 (BIZ_SYSTEM_CODE 폐기) 반영 — {@link #searchByFilter} 파라미터는 3 (As-Is 4 → To-Be 3).
 */
public interface SecRoleRepository extends JpaRepository<SecRole, String> {

    /**
     * As-Is {@code selectCommRole} (xml:7~37) MSSQL 변환.
     *
     * <p>As-Is WHERE 분기 (3 if + 1 To-Be 폐기):
     * <ul>
     *   <li>{@code edt_ROLE_ID} → {@code UPPER(A.ROLE_ID) LIKE UPPER('%' || #{} || '%')} (xml:24)</li>
     *   <li>{@code edt_ROLE_NM} → {@code UPPER(A.ROLE_NM) LIKE UPPER('%' || #{} || '%')} (xml:28)</li>
     *   <li>{@code cbo_USE_TP} → {@code A.USE_TP = #{}} (xml:32)</li>
     *   <li>~~{@code cbo_bizSystemCode} → {@code A.BIZ_SYSTEM_CODE = #{}}~~ — To-Be 폐기 (정책 #1)</li>
     * </ul>
     *
     * <p>ORDER BY A.START_ACTIVE_DATE (As-Is xml:36 보존).
     */
    @Query("""
            SELECT r FROM SecRole r
            WHERE (:pRoleId IS NULL OR :pRoleId = ''
                   OR UPPER(r.roleId) LIKE UPPER(CONCAT('%', :pRoleId, '%')))
              AND (:pRoleNm IS NULL OR :pRoleNm = ''
                   OR UPPER(r.roleNm) LIKE UPPER(CONCAT('%', :pRoleNm, '%')))
              AND (:pUseTp IS NULL OR :pUseTp = '' OR r.useTp = :pUseTp)
            ORDER BY r.startActiveDate
            """)
    List<SecRole> searchByFilter(@Param("pRoleId") String pRoleId,
                                 @Param("pRoleNm") String pRoleNm,
                                 @Param("pUseTp") String pUseTp);

    /**
     * As-Is xml:14~18 scalar subquery
     * {@code (SELECT B.ROLE_GROUP_ID FROM TB_MCM_SEC_ROLEGROUP_MAPPING B WHERE B.ROLE_ID = A.ROLE_ID AND ROWNUM=1)}
     * 변환. MSSQL native query 로 {@code TOP 1} 사용.
     *
     * <p>2026-06-06 — 과거 MSSQL native {@code TOP 1} 이었으나 dialect 독립을 위해 JPQL + {@link Limit} 로 전환
     * (SQLite local 단독 부팅 호환). SecRoleGroupMapping entity 사용 → TOP/LIMIT 은 Hibernate 가 dialect 별로 생성.
     */
    @Query("SELECT m.roleGroupId FROM SecRoleGroupMapping m WHERE m.roleId = :roleId")
    List<String> findRoleGroupIdsByRoleId(@Param("roleId") String roleId, Limit limit);

    /** As-Is scalar subquery 의 String 단일 반환 시그니처 유지(호출처 무변경) — 첫 행 또는 없으면 null. */
    default String findOneRoleGroupIdByRoleId(String roleId) {
        List<String> ids = findRoleGroupIdsByRoleId(roleId, Limit.of(1));
        return ids.isEmpty() ? null : ids.get(0);
    }

    /**
     * As-Is {@code deleteCommRole} (xml:80~82) NOT EXISTS subquery #1 정합 검증용 (V-003 서버 재검증).
     * 본 method 는 TB_MCM_SEC_ROLEGROUP_MAPPING 의 동일 ROLE_ID row 카운트 (0 = 삭제 가능).
     */
    @Query(value = "SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING WHERE ROLE_ID = :roleId",
           nativeQuery = true)
    long countRoleGroupMappingByRoleId(@Param("roleId") String roleId);

    /**
     * As-Is {@code deleteCommRole} (xml:83~86) NOT EXISTS subquery #2 정합 검증용 (V-004 서버 재검증).
     * 본 method 는 TB_MCM_SEC_ROLE_MAPPING 의 동일 ROLE_ID row 카운트 (0 = 삭제 가능).
     */
    @Query(value = "SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING WHERE ROLE_ID = :roleId",
           nativeQuery = true)
    long countRoleMappingByRoleId(@Param("roleId") String roleId);
}
