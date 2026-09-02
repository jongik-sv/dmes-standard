/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecPerm (TB_MCM_SEC_PERM) JPA Repository — commPermMng 화면 owner (search + save + delete 검증)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecPerm;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * {@code MCMAPUSER.TB_MCM_SEC_PERM} JPA Repository (commPermMng 화면 owner / W6).
 *
 * <p>인용 SQL (As-Is {@code CommPermMngMapper.xml}):
 * <ul>
 *   <li>{@link #searchByFilter(String, String, String)} = As-Is {@code selectCommPermMng} (xml:7~40)
 *       — UPPER(PERMISSION_ID) LIKE + UPPER(PERMISSION_NM) LIKE + USE_TP 일치 + ORDER BY START_ACTIVE_DATE.
 *       To-Be 정책 #1: BIZ_SYSTEM_CODE WHERE 분기 제거 (4 → 3 if 절).
 *       ROLE_ID scalar subquery (xml:19~22) 는 Service 레이어에서
 *       {@link #findOneRoleIdByPermissionId(String)} 호출로 분리</li>
 *   <li>{@link #findOneRoleIdByPermissionId(String)} = As-Is xml:19~22 scalar subquery
 *       — {@code SELECT ROLE_ID FROM TB_MCM_SEC_ROLE_MAPPING WHERE PERMISSION_ID=? AND ROWNUM=1}
 *       MSSQL {@code TOP 1} 등가 (As-Is 임의 1행 보존 — fn_rowDelete 의 차단 검증용)</li>
 *   <li>{@link #countRoleMappingByPermissionId(String)} = As-Is {@code deleteCommPermMng}
 *       {@code NOT EXISTS} subquery (xml:92~95) 의 inverse count — 0 이면 삭제 가능</li>
 * </ul>
 *
 * <p>To-Be 정책 #1 (BIZ_SYSTEM_CODE 폐기) 반영 — {@link #searchByFilter} 파라미터는 3 개 (As-Is 4 → To-Be 3).
 */
public interface SecPermRepository extends JpaRepository<SecPerm, String> {

    /**
     * As-Is {@code selectCommPermMng} (xml:7~40) 의 본 SELECT (scalar subquery 제외) 변환.
     *
     * <p>As-Is WHERE: {@code <if pPermissionId>: UPPER(PERMISSION_ID) LIKE UPPER('%'||#{}||'%')}
     * + {@code <if pPermissionNm>: UPPER(PERMISSION_NM) LIKE UPPER('%'||#{}||'%')}
     * + {@code <if pUseTp>: AND USE_TP = #{}} + ORDER BY START_ACTIVE_DATE.
     * To-Be 정책 #1: BIZ_SYSTEM_CODE WHERE 분기 (xml:36) 제거.
     *
     * <p>본 method 는 SecPerm 본 컬럼 10 만 반환. ROLE_ID 는 Service 레이어에서
     * {@link #findOneRoleIdByPermissionId(String)} 호출로 부착 (As-Is scalar subquery 분리).
     */
    @Query("""
            SELECT p FROM SecPerm p
            WHERE (:pPermissionId IS NULL OR :pPermissionId = ''
                   OR UPPER(p.permissionId) LIKE UPPER(CONCAT('%', :pPermissionId, '%')))
              AND (:pPermissionNm IS NULL OR :pPermissionNm = ''
                   OR UPPER(p.permissionNm) LIKE UPPER(CONCAT('%', :pPermissionNm, '%')))
              AND (:pUseTp IS NULL OR :pUseTp = '' OR p.useTp = :pUseTp)
            ORDER BY p.startActiveDate
            """)
    List<SecPerm> searchByFilter(@Param("pPermissionId") String pPermissionId,
                                 @Param("pPermissionNm") String pPermissionNm,
                                 @Param("pUseTp") String pUseTp);

    /**
     * As-Is xml:19~22 scalar subquery
     * {@code (SELECT B.ROLE_ID FROM TB_MCM_SEC_ROLE_MAPPING B WHERE B.PERMISSION_ID = A.PERMISSION_ID AND ROWNUM=1) AS ROLE_ID}
     * 변환. MSSQL native query 로 {@code TOP 1} 사용 (As-Is 임의 1 행 보존).
     *
     * <p>본 method 결과는 fn_rowDelete (xfdl:407) 클라이언트 검증용으로 사용된다 — null 이 아니면
     * "연결된 역할이 존재합니다. 제외 후 삭제 하세요?" 경고 후 삭제 차단.
     *
     * <p>2026-06-06 — 과거 MSSQL native {@code TOP 1} 이었으나 dialect 독립을 위해 JPQL + {@link Limit} 로 전환
     * (SQLite local 단독 부팅 호환). SecRoleMapping entity 사용 → TOP/LIMIT 은 Hibernate 가 dialect 별로 생성.
     */
    @Query("SELECT m.roleId FROM SecRoleMapping m WHERE m.permissionId = :permissionId")
    List<String> findRoleIdsByPermissionId(@Param("permissionId") String permissionId, Limit limit);

    /** As-Is scalar subquery 의 String 단일 반환 시그니처 유지(호출처 무변경) — 첫 행 또는 없으면 null. */
    default String findOneRoleIdByPermissionId(String permissionId) {
        List<String> ids = findRoleIdsByPermissionId(permissionId, Limit.of(1));
        return ids.isEmpty() ? null : ids.get(0);
    }

    /**
     * As-Is {@code deleteCommPermMng} (xml:91~95) 의 {@code NOT EXISTS} subquery 정합 검증용.
     * 본 method 는 {@code TB_MCM_SEC_ROLE_MAPPING} 의 동일 PERMISSION_ID row 카운트 (0 = 삭제 가능).
     *
     * <p>As-Is 동작: NOT EXISTS 위반 시 SQL 자체가 silent skip (rowcount = 0) — To-Be 도 동일 보존.
     */
    @Query(value = "SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING WHERE PERMISSION_ID = :permissionId",
           nativeQuery = true)
    long countRoleMappingByPermissionId(@Param("permissionId") String permissionId);
}
