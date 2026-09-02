package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.MasterCode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * TB_MCM_CODE_MASTER JPA Repository.
 *
 * <p>인용 SQL:
 * <ul>
 *   <li>{@link #findByFilter(String, String)} = As-Is {@code GetCodeMasterList} (xml:7~34)
 *       — CODE_ID OR MASTER_CODE LIKE + UPPER(CODE_NM) LIKE</li>
 *   <li>{@link #findAllForLov()} = As-Is {@code GetCodeMasterAllList} (xml:36~39)</li>
 * </ul>
 */
public interface MasterCodeRepository extends JpaRepository<MasterCode, String> {

    /**
     * As-Is {@code GetCodeMasterList} (xml:7~34) 변환.
     *
     * <p>As-Is WHERE: {@code CODE_ID LIKE '%'||#{pCodeId}||'%' OR MASTER_CODE LIKE '%'||#{pCodeId}||'%'}
     * + {@code UPPER(CODE_NM) LIKE UPPER('%'||#{pCodeNm}||'%')} + ORDER BY CODE_ID.
     * To-Be MSSQL: {@code +} 결합 (또는 JPQL CONCAT). null/blank 파라미터는 매처 ✗ (전체 반환).
     */
    @Query("""
            SELECT m FROM MasterCode m
            WHERE (:pCodeId IS NULL OR :pCodeId = ''
                   OR m.codeId LIKE CONCAT('%', :pCodeId, '%')
                   OR m.masterCode LIKE CONCAT('%', :pCodeId, '%'))
              AND (:pCodeNm IS NULL OR :pCodeNm = ''
                   OR UPPER(m.codeNm) LIKE UPPER(CONCAT('%', :pCodeNm, '%')))
            ORDER BY m.codeId
            """)
    List<MasterCode> findByFilter(@Param("pCodeId") String pCodeId,
                                  @Param("pCodeNm") String pCodeNm);

    /**
     * As-Is {@code GetCodeMasterAllList} (xml:36~39) — Master 전체 (CODE_ID, CODE_NM) LoV.
     * To-Be JPA: 전체 select 후 service 단에서 (CODE_ID, CODE_NM) projection.
     */
    @Query("SELECT m FROM MasterCode m ORDER BY m.codeId")
    List<MasterCode> findAllForLov();
}
