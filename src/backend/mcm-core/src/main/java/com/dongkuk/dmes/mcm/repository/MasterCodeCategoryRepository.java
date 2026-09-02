package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.MasterCodeCategory;
import com.dongkuk.dmes.mcm.entity.MasterCodeCategoryId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * 카테고리 관리 JPA Repository.
 *
 * <p>As-Is Mapper.xml 의 5 SQL 중 SELECT 2종 (GetCodeCategoryList / GetCodeCategoryAllList)
 * 을 JPQL 로 1:1 직역. INSERT / UPDATE / DELETE 는 JpaRepository 기본 메서드 +
 * {@code McmAuditEntity} 의 PrePersist/PreUpdate listener 가 audit 컬럼 자동 처리.
 *
 * <p>orphan SQL ({@code MergeTbCodeCategory}) 는 To-Be 제거 (사용자 결정 — 분석리포트 §6, §12).
 *
 * <p>JOIN 키: {@code TMCCTEGORY.MASTER_CODE = CMASTER.CODE_ID} (Mapper.xml:15) —
 * MasterCodeCategory.id.masterCode = MasterCode.codeId.
 *
 * <p>인용:
 * <ul>
 *   <li>Mapper.xml:7~29 ({@code GetCodeCategoryList}) → {@link #searchList}</li>
 *   <li>Mapper.xml:31~37 ({@code GetCodeCategoryAllList}) → {@link #searchAllList}</li>
 * </ul>
 */
public interface MasterCodeCategoryRepository extends JpaRepository<MasterCodeCategory, MasterCodeCategoryId> {

    /**
     * GetCodeCategoryList — TB_MCM_CODE_CATEGORY × TB_MCM_CODE_MASTER 결합 SELECT (그리드 ds_grdMain).
     *
     * <p>As-Is Mapper.xml:7~29 — JOIN 키 TMCCTEGORY.MASTER_CODE = CMASTER.CODE_ID,
     * SELECT 5 컬럼 (MASTER_CODE, CODE_NM, CATEGORY_ID, CATEGORY_NM, SORT_SEQ), 4 동적 LIKE WHERE,
     * ORDER BY MASTER_CODE.
     *
     * <p>JPQL CONCAT 으로 DB 비종속 LIKE 패턴. null/blank 파라미터는 가드 skip → 전체 반환.
     *
     * @return Object[] {MasterCodeCategory entity, MasterCode entity}
     */
    @Query("""
            SELECT c, m
              FROM MasterCodeCategory c, MasterCode m
             WHERE c.id.masterCode = m.codeId
               AND (:pCodeId IS NULL OR :pCodeId = ''
                    OR m.codeId LIKE CONCAT('%', :pCodeId, '%'))
               AND (:pCodeNm IS NULL OR :pCodeNm = ''
                    OR m.codeNm LIKE CONCAT('%', :pCodeNm, '%'))
               AND (:pCategoryId IS NULL OR :pCategoryId = ''
                    OR c.id.categoryId LIKE CONCAT('%', :pCategoryId, '%'))
               AND (:pCategoryNm IS NULL OR :pCategoryNm = ''
                    OR c.categoryNm LIKE CONCAT('%', :pCategoryNm, '%'))
             ORDER BY c.id.masterCode
            """)
    List<Object[]> searchList(@Param("pCodeId") String pCodeId,
                              @Param("pCodeNm") String pCodeNm,
                              @Param("pCategoryId") String pCategoryId,
                              @Param("pCategoryNm") String pCategoryNm);

    /**
     * GetCodeCategoryAllList — TB_MCM_CODE_CATEGORY × TB_MCM_CODE_MASTER 결합 전체 키 (중복체크용).
     *
     * <p>As-Is Mapper.xml:31~37 — JOIN 키 동일, SELECT 2 컬럼 (MASTER_CODE, CATEGORY_ID),
     * WHERE 동적 ✗ / ORDER BY ✗. 클라이언트 사이드 ds_grdMainAll 적재용 (xfdl:199~206 중복체크).
     *
     * @return Object[] {MASTER_CODE, CATEGORY_ID}
     */
    @Query("""
            SELECT c.id.masterCode, c.id.categoryId
              FROM MasterCodeCategory c, MasterCode m
             WHERE c.id.masterCode = m.codeId
            """)
    List<Object[]> searchAllList();

    /**
     * masterCodeMng 화면 — As-Is {@code GetTbMcmCodeCategoryList} (Mapper.xml:179~184) 1:1 직역.
     *
     * <pre>
     *   SELECT CATEGORY_ID, CATEGORY_NM
     *     FROM MCM_SOURCE.TB_MCM_CODE_CATEGORY
     *    WHERE MASTER_CODE = #{pCodeId}
     * </pre>
     *
     * <p>본 메서드는 Entity 전체 반환 — service 측에서 CATEGORY_ID / CATEGORY_NM 만 추출.
     */
    @Query("""
            SELECT c FROM MasterCodeCategory c
            WHERE c.id.masterCode = :pCodeId
            ORDER BY c.id.categoryId
            """)
    List<MasterCodeCategory> findByMasterCode(@Param("pCodeId") String pCodeId);
}
