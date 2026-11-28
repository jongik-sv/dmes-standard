/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecObj (TB_MCM_SEC_OBJ) JPA Repository — commObjMng 화면 owner (search + save + delete 검증)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecObj;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * {@code MCMAPUSER.TB_MCM_SEC_OBJ} JPA Repository (commObjMng 화면 owner).
 *
 * <p>인용 SQL:
 * <ul>
 *   <li>{@link #searchByFilter(String, String, String, String, String)} = As-Is {@code selectCommObjMng} (xml:7~41)
 *       — UPPER(OBJECT_ID) OR UPPER(OBJECT_NM) LIKE + USE_TP 일치 + ORDER BY START_ACTIVE_DATE.
 *       ID(SUBSTR/INSTR) 는 Service 레이어 row 후처리. As-Is MENU_ID scalar subquery 는 2026-11-26 에 뺐다
 *       (OBJECT 는 메뉴 정보를 갖지 않는다 — 사용자 결정)</li>
 *   <li>{@link #countMenuByObjectId(String)} = As-Is {@code deleteCommObjMng} EXISTS subquery #1
 *       (xml:103~106 — {@code TB_MCM_SEC_MENU.OBJECT_ID}) 의 inverse count</li>
 *   <li>{@link #countRoleMappingByObjectId(String)} = 동 EXISTS subquery #2
 *       (xml:107~110 — {@code TB_MCM_SEC_ROLE_MAPPING.OBJECT_ID})</li>
 * </ul>
 *
 * <p>To-Be 정책 #1 (BIZ_SYSTEM_CODE 폐기) 반영 — As-Is 3 파라미터 → To-Be 2. 2026-11-26 SYSTEM / OBJECT TYPE / 접속 경로 3개 추가 → 5.
 */
public interface SecObjRepository extends JpaRepository<SecObj, String> {

    /**
     * As-Is {@code selectCommObjMng} (xml:7~41) 의 본 SELECT (scalar subquery / ID 계산 제외) 변환.
     *
     * <p>As-Is WHERE: {@code <if pObjectId>: (UPPER(OBJECT_ID) LIKE UPPER('%'||#{}||'%')
     * OR UPPER(OBJECT_NM) LIKE UPPER('%'||#{}||'%'))} + {@code <if pUseTp>: AND USE_TP = #{}} +
     * ORDER BY START_ACTIVE_DATE. To-Be 정책 #1: BIZ_SYSTEM_CODE WHERE 분기 제거.
     *
     * <p>2026-11-26 To-Be 추가 조건: SYSTEM_CODE 일치 / OBJECT_TYPE UPPER LIKE / ACCESS_TP 일치.
     * 빈 값은 조건을 끈다.
     *
     * <p>본 method 는 SecObj 본 컬럼 13 만 반환. ID 는 Service 레이어에서 OBJECT_ID 후처리로 조립.
     */
    @Query("""
            SELECT o FROM SecObj o
            WHERE (:pObjectId IS NULL OR :pObjectId = ''
                   OR UPPER(o.objectId) LIKE UPPER(CONCAT('%', :pObjectId, '%'))
                   OR UPPER(o.objectNm) LIKE UPPER(CONCAT('%', :pObjectId, '%')))
              AND (:pUseTp IS NULL OR :pUseTp = '' OR o.useTp = :pUseTp)
              AND (:pSystemCode IS NULL OR :pSystemCode = '' OR o.systemCode = :pSystemCode)
              AND (:pObjectType IS NULL OR :pObjectType = ''
                   OR UPPER(o.objectType) LIKE UPPER(CONCAT('%', :pObjectType, '%')))
              AND (:pAccessTp IS NULL OR :pAccessTp = '' OR o.accessTp = :pAccessTp)
            ORDER BY o.startActiveDate
            """)
    List<SecObj> searchByFilter(@Param("pObjectId") String pObjectId,
                                @Param("pUseTp") String pUseTp,
                                @Param("pSystemCode") String pSystemCode,
                                @Param("pObjectType") String pObjectType,
                                @Param("pAccessTp") String pAccessTp);

    /**
     * As-Is {@code deleteCommObjMng} (xml:101~110) 의 {@code NOT EXISTS} subquery #1 정합 검증용.
     * 본 method 는 {@code TB_MCM_SEC_MENU} 의 동일 OBJECT_ID row 카운트 (0 = 삭제 가능).
     */
    @Query(value = "SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_MENU WHERE OBJECT_ID = :objectId",
           nativeQuery = true)
    long countMenuByObjectId(@Param("objectId") String objectId);

    /**
     * As-Is {@code deleteCommObjMng} 의 {@code NOT EXISTS} subquery #2 정합 검증용.
     * 본 method 는 {@code TB_MCM_SEC_ROLE_PERM} (v2 퍼미션 모델) 의 동일 OBJECT_ID row 카운트 (역할×오브젝트 쌍 수) (0 = 삭제 가능).
     */
    @Query(value = "SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLE_PERM WHERE OBJECT_ID = :objectId",
           nativeQuery = true)
    long countRoleMappingByObjectId(@Param("objectId") String objectId);
}
