package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.MomTcSkip;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * 비정상 TC 등록 (cic/tcAbnormalData) Repository.
 *
 * <p>설계: `docs/mcm/design/tcAbnormalData/tcAbnormalData_BPMN설계서.md` §2.2 / §2.6.
 * As-Is mui TCAbnormalDataMapper(GetMomTcSkipList / SaveTbMcmMomTcSkip) 의 ANSI 변환.
 *
 * <p>UPSERT(save) 는 {@link JpaRepository#findById}/{@link JpaRepository#save} (PK=TRANSACTION_CODE)
 * 로 처리 — 매칭 시 UPDATE, 미매칭 시 INSERT.
 *
 * <p>조회는 {@link #searchTcSkip} — TC_LIST 정본 LEFT JOIN TC_SKIP (JPQL ad-hoc entity join, DB 무관).
 */
public interface MomTcSkipRepository extends JpaRepository<MomTcSkip, String> {

    /**
     * 조회 (API-001 search). As-Is GetMomTcSkipList 1:1.
     *
     * <p>TC_LIST 전수(좌측 정본) LEFT JOIN TC_SKIP. 3 조건 동적 필터:
     * <ul>
     *   <li>pTransactionCode — TRANSACTION_CODE LIKE prefix ({@code value%})</li>
     *   <li>pSkipLevel — SKIP_LEVEL 정확 (LEFT JOIN 이지만 값 지정 시 미존재 row 제외)</li>
     *   <li>pUseTp — USE_TP 정확</li>
     * </ul>
     *
     * @return {@code Object[]{ TRANSACTION_CODE, TRANSACTION_NM, U_AT, U_PGM_ID, U_USR_ID, SKIP_LEVEL, USE_TP }}
     */
    @Query("""
            SELECT l.transactionCode, l.transactionNm,
                   s.updatedAt, s.updatedPgmId, s.updatedBy,
                   s.skipLevel, s.useTp
              FROM MomTcList l
              LEFT JOIN MomTcSkip s ON s.transactionCode = l.transactionCode
             WHERE (:pTransactionCode IS NULL OR :pTransactionCode = '' OR l.transactionCode LIKE CONCAT(:pTransactionCode, '%'))
               AND (:pSkipLevel IS NULL OR :pSkipLevel = '' OR s.skipLevel = :pSkipLevel)
               AND (:pUseTp IS NULL OR :pUseTp = '' OR s.useTp = :pUseTp)
             ORDER BY l.transactionCode
            """)
    List<Object[]> searchTcSkip(@Param("pTransactionCode") String pTransactionCode,
                                @Param("pSkipLevel") String pSkipLevel,
                                @Param("pUseTp") String pUseTp);
}
