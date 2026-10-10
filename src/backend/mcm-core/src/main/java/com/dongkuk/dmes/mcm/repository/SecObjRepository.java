/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecObj (TB_MCM_SEC_OBJ) JPA Repository — commObjMng 화면 owner (search + save + delete 검증)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecObj;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * {@code MCMAPUSER.TB_MCM_SEC_OBJ} JPA Repository (commObjMng 화면 owner).
 *
 * <p>인용 SQL:
 * <ul>
 *   <li>{@link #searchByFilter(String, String)} = As-Is {@code selectCommObjMng} (xml:7~41)
 *       — UPPER(OBJECT_ID) OR UPPER(OBJECT_NM) LIKE + USE_TP 일치 + ORDER BY START_ACTIVE_DATE.
 *       MENU_ID scalar subquery + ID(SUBSTR/INSTR) 는 Service 레이어에서 native query 또는 row 후처리</li>
 *   <li>{@link #findOneMenuIdByObjectId(String)} = As-Is xml:22~25 의 scalar subquery
 *       — {@code SELECT MENU_ID FROM TB_MCM_SEC_MENU WHERE OBJECT_ID=? AND ROWNUM=1} 의
 *       MSSQL {@code TOP 1} 등가 (정합 §11 #3 — 정렬 정책 미명시 As-Is 보존)</li>
 *   <li>{@link #countMenuByObjectId(String)} = As-Is {@code deleteCommObjMng} EXISTS subquery #1
 *       (xml:103~106 — {@code TB_MCM_SEC_MENU.OBJECT_ID}) 의 inverse count</li>
 *   <li>{@link #countRoleMappingByObjectId(String)} = 동 EXISTS subquery #2
 *       (xml:107~110 — {@code TB_MCM_SEC_ROLE_MAPPING.OBJECT_ID})</li>
 * </ul>
 *
 * <p>To-Be 정책 #1 (BIZ_SYSTEM_CODE 폐기) 반영 — {@link #searchByFilter} 파라미터는 2 개 (As-Is 3 → To-Be 2).
 */
public interface SecObjRepository extends JpaRepository<SecObj, String> {

    /**
     * As-Is {@code selectCommObjMng} (xml:7~41) 의 본 SELECT (scalar subquery / ID 계산 제외) 변환.
     *
     * <p>As-Is WHERE: {@code <if pObjectId>: (UPPER(OBJECT_ID) LIKE UPPER('%'||#{}||'%')
     * OR UPPER(OBJECT_NM) LIKE UPPER('%'||#{}||'%'))} + {@code <if pUseTp>: AND USE_TP = #{}} +
     * ORDER BY START_ACTIVE_DATE. To-Be 정책 #1: BIZ_SYSTEM_CODE WHERE 분기 제거.
     *
     * <p>본 method 는 SecObj 본 컬럼 13 만 반환. MENU_ID / ID 는 Service 레이어에서
     * {@link #findOneMenuIdByObjectId(String)} 호출 / OBJECT_ID 후처리로 조립.
     */
    @Query("""
            SELECT o FROM SecObj o
            WHERE (:pObjectId IS NULL OR :pObjectId = ''
                   OR UPPER(o.objectId) LIKE UPPER(CONCAT('%', :pObjectId, '%'))
                   OR UPPER(o.objectNm) LIKE UPPER(CONCAT('%', :pObjectId, '%')))
              AND (:pUseTp IS NULL OR :pUseTp = '' OR o.useTp = :pUseTp)
            ORDER BY o.startActiveDate
            """)
    List<SecObj> searchByFilter(@Param("pObjectId") String pObjectId,
                                @Param("pUseTp") String pUseTp);

    /**
     * As-Is xml:22~25 scalar subquery
     * {@code (SELECT B.MENU_ID FROM TB_MCM_SEC_MENU B WHERE B.OBJECT_ID = A.OBJECT_ID AND ROWNUM=1) AS MENU_ID}
     * 변환. MSSQL native query 로 {@code TOP 1} 사용 (정합 §11 #3 — As-Is 임의 1행 보존).
     *
     * <p>2026-06-06 — 과거 MSSQL native {@code TOP 1} 이었으나 dialect 독립을 위해 JPQL + {@link Limit} 로 전환
     * (JPQL + Limit 이라 DB 문법에 묶이지 않는다). SecMenu entity 사용 → 행 제한은 Hibernate 가 dialect 에 맞게 생성한다.
     */
    @Query("SELECT m.menuId FROM SecMenu m WHERE m.objectId = :objectId")
    List<String> findMenuIdsByObjectId(@Param("objectId") String objectId, Limit limit);

    /** As-Is scalar subquery 의 String 단일 반환 시그니처 유지(호출처 무변경) — 첫 행 또는 없으면 null. */
    default String findOneMenuIdByObjectId(String objectId) {
        List<String> ids = findMenuIdsByObjectId(objectId, Limit.of(1));
        return ids.isEmpty() ? null : ids.get(0);
    }

    /**
     * 2026-06-03 — ToBe FORM_URL 라우팅 (`{group}/{OBJECT_ID}`) 의 group prefix 결정용.
     * SEC_MENU.PARENT_MENU_ID 가 그룹 폴더 ID (cma/csa/cme) 를 가리킴.
     * 2026-06-06 — native {@code TOP 1} → JPQL + {@link Limit} (dialect 독립).
     */
    @Query("SELECT m.parentMenuId FROM SecMenu m WHERE m.objectId = :objectId")
    List<String> findParentMenuIdsByObjectId(@Param("objectId") String objectId, Limit limit);

    /** As-Is scalar subquery 의 String 단일 반환 시그니처 유지(호출처 무변경) — 첫 행(값 null 가능) 또는 없으면 null. */
    default String findOneParentMenuIdByObjectId(String objectId) {
        List<String> ids = findParentMenuIdsByObjectId(objectId, Limit.of(1));
        return ids.isEmpty() ? null : ids.get(0);
    }

    /**
     * As-Is {@code deleteCommObjMng} (xml:101~110) 의 {@code NOT EXISTS} subquery #1 정합 검증용.
     * 본 method 는 {@code TB_MCM_SEC_MENU} 의 동일 OBJECT_ID row 카운트 (0 = 삭제 가능).
     */
    @Query(value = "SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_MENU WHERE OBJECT_ID = :objectId",
           nativeQuery = true)
    long countMenuByObjectId(@Param("objectId") String objectId);

    /**
     * As-Is {@code deleteCommObjMng} 의 {@code NOT EXISTS} subquery #2 정합 검증용.
     * 본 method 는 {@code TB_MCM_SEC_ROLE_MAPPING} 의 동일 OBJECT_ID row 카운트 (0 = 삭제 가능).
     */
    @Query(value = "SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING WHERE OBJECT_ID = :objectId",
           nativeQuery = true)
    long countRoleMappingByObjectId(@Param("objectId") String objectId);
}
