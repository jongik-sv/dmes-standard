package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.MasterCodeDetail;
import com.dongkuk.dmes.mcm.entity.MasterCodeDetailId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * TB_MCM_CODE_DETAIL JPA Repository.
 *
 * <p>인용 SQL (분석 §6):
 * <ul>
 *   <li>{@link #findByMasterCode(String)} = As-Is {@code GetCodeDetailList} (xml:106~132)
 *       (단, MASTER outer-join 컬럼 alias 19 컬럼은 service 측에서 추가 조립)</li>
 *   <li>{@link #findRefByMasterRefCodeId(String)} = As-Is {@code GetCodeDetailRef1~5List}
 *       (xml:134~177) — {@code CATEGORY_ID = 'SZ0000'} 하드코딩 (사용자 결정 보존)</li>
 * </ul>
 */
public interface MasterCodeDetailRepository extends JpaRepository<MasterCodeDetail, MasterCodeDetailId> {

    /**
     * As-Is {@code GetCodeDetailList} (xml:106~132) — Detail + scalar subquery CATEGORY_NM
     * + MASTER outer-join MASTER_CODE_REF1~5 alias.
     *
     * <p>JPA 변환: Detail 본 컬럼만 select. CATEGORY_NM 과 MASTER_CODE_REF1~5 alias 는
     * service 레이어에서 별도 fetch + merge (Category Repository + Master Repository).
     *
     * <p>ORDER BY SORT_SEQ — As-Is xml:131.
     */
    @Query("""
            SELECT d FROM MasterCodeDetail d
            WHERE d.id.masterCode = :pCodeId
            ORDER BY d.sortSeq
            """)
    List<MasterCodeDetail> findByMasterCode(@Param("pCodeId") String pCodeId);

    /**
     * As-Is {@code GetCodeDetailRef1~5List} (xml:134~177) 의 변환 — scalar subquery 패턴.
     *
     * <p>{@code WHERE MASTER_CODE = (SELECT MASTER_CODE FROM TB_MCM_CODE_MASTER WHERE CODE_ID = #{pMasterCodeRef})
     * AND CATEGORY_ID = 'SZ0000'} 의 JPQL 변환.
     *
     * <p>'SZ0000' 카테고리 하드코딩은 사용자 결정에 따라 As-Is 보존 (분석 §10 / §12).
     */
    @Query("""
            SELECT d FROM MasterCodeDetail d
            WHERE d.id.masterCode = (SELECT m.masterCode FROM MasterCode m WHERE m.codeId = :pMasterCodeRef)
              AND d.id.categoryId = 'SZ0000'
            ORDER BY d.sortSeq
            """)
    List<MasterCodeDetail> findRefByMasterRefCodeId(@Param("pMasterCodeRef") String pMasterCodeRef);

    /**
     * masterCodeUploadFilePopup 화면 — SQL #1 GetCodeUploadList 1:1.
     * As-Is {@code MasterCodeUploadFilePopupMapper.xml:7-19} 1:1 직역.
     *
     * <pre>
     *   SELECT MASTER_CODE, CATEGORY_ID, CODE_VAL, CODE_VAL_MEAN, CODE_VAL_DESC, CODE_VER, SORT_SEQ
     *     FROM MCM_SOURCE.TB_MCM_CODE_DETAIL CDETAIL
     *    WHERE MASTER_CODE = :pCodeId
     *    ORDER BY CATEGORY_ID, SORT_SEQ
     * </pre>
     *
     * 반환 컬럼 7 개 (Object[] 위치: 0=MASTER_CODE / 1=CATEGORY_ID / 2=CODE_VAL /
     * 3=CODE_VAL_MEAN / 4=CODE_VAL_DESC / 5=CODE_VER / 6=SORT_SEQ).
     */
    @Query(value = "SELECT MASTER_CODE   AS masterCode, " +
            "       CATEGORY_ID    AS categoryId, " +
            "       CODE_VAL       AS codeVal, " +
            "       CODE_VAL_MEAN  AS codeValMean, " +
            "       CODE_VAL_DESC  AS codeValDesc, " +
            "       CODE_VER       AS codeVer, " +
            "       SORT_SEQ       AS sortSeq " +
            "  FROM MCM_SOURCE.TB_MCM_CODE_DETAIL CDETAIL " +
            " WHERE MASTER_CODE = :pCodeId " +
            " ORDER BY CATEGORY_ID, SORT_SEQ",
            nativeQuery = true)
    List<Object[]> findCodeUploadListAsIs(@Param("pCodeId") String pCodeId);

    /**
     * masterCodeUploadFilePopup 화면 — SQL #2 DELETE 1:1.
     * As-Is {@code TB_MCM_CODE_DETAIL_Mapper.xml:17-21} + Java {@code SaveMasterCodeFileUpload.java:43}
     * 의 dynamic WHERE (= {@code MASTER_CODE = #{param_MasterCode}}) 1:1 직역.
     *
     * <pre>
     *   DELETE FROM MCM_SOURCE.TB_MCM_CODE_DETAIL WHERE MASTER_CODE = :masterCode
     * </pre>
     *
     * 호출자: {@code chk_regFlag=true} 일 때만 (= 선 삭제 후 재등록 시).
     */
    @Modifying
    @Query(value = "DELETE FROM MCM_SOURCE.TB_MCM_CODE_DETAIL WHERE MASTER_CODE = :masterCode",
            nativeQuery = true)
    int deleteByMasterCodeAsIs(@Param("masterCode") String masterCode);
}
