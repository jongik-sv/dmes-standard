package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.MomFormatList;
import com.dongkuk.dmes.mcm.entity.MomFormatListId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * I/F Format 조회 (cib/interfaceFormatList) — READ-only 조회 Repository.
 *
 * <p>설계: `docs/mcm/design/interfaceFormatList/interfaceFormatList_BPMN설계서.md` §2.2 / §2.3.
 * As-Is mui InterfaceFormatListMapper.xml (GetFormatList / GetFormatLayout) 의 ANSI 변환.
 *
 * <p>조회:
 * <ol>
 *   <li>{@link #searchMasters} — 좌측 FORMAT 마스터 (최신 FORMAT_VER + TC 수). JPQL (DB 무관).</li>
 *   <li>우측 변경이력(버전별 MAX 수정시각, MCMAPUSER UNION MCM_BACKUP, Q-400=A 2026-06-02)은
 *       JPQL 불가(2 스키마 UNION + FROM-서브쿼리) → {@code InterfaceFormatListMyBatisDao.searchVersions}
 *       (MyBatis, 하이브리드) 로 처리.</li>
 * </ol>
 */
public interface InterfaceFormatListRepository extends JpaRepository<MomFormatList, MomFormatListId> {

    /**
     * 좌측 FORMAT 마스터 조회 (API-001 search). As-Is GetFormatList 의 ANSI 변환.
     *
     * <p>최신 FORMAT_VER 행(상관 서브쿼리 MAX) + INTERFACES 존재(INNER JOIN 의미, EXISTS) +
     * TC 수(매칭 INTERFACES count). 3 조건(FORMAT_ID LIKE / SEND·RECV_MODULE_ID 정확) 동적 적용.
     *
     * @return {@code Object[]{ FORMAT_ID, FORMAT_NM, TC_CNT, C_AT, C_USR_ID }}
     */
    @Query("""
            SELECT f.id.formatId, f.formatNm,
                   (SELECT COUNT(i2) FROM MomInterface i2
                     WHERE i2.formatId = f.id.formatId
                       AND (:pSendModuleId IS NULL OR :pSendModuleId = '' OR i2.sendModuleId = :pSendModuleId)
                       AND (:pRecvModuleId IS NULL OR :pRecvModuleId = '' OR i2.recvModuleId = :pRecvModuleId)),
                   f.createdAt, f.createdBy
              FROM MomFormatList f
             WHERE f.id.formatVer = (SELECT MAX(f2.id.formatVer) FROM MomFormatList f2 WHERE f2.id.formatId = f.id.formatId)
               AND (:pFormatId IS NULL OR :pFormatId = '' OR f.id.formatId LIKE CONCAT('%', :pFormatId, '%'))
               AND EXISTS (SELECT 1 FROM MomInterface i
                            WHERE i.formatId = f.id.formatId
                              AND (:pSendModuleId IS NULL OR :pSendModuleId = '' OR i.sendModuleId = :pSendModuleId)
                              AND (:pRecvModuleId IS NULL OR :pRecvModuleId = '' OR i.recvModuleId = :pRecvModuleId))
             ORDER BY f.id.formatId
            """)
    List<Object[]> searchMasters(@Param("pFormatId") String pFormatId,
                                 @Param("pSendModuleId") String pSendModuleId,
                                 @Param("pRecvModuleId") String pRecvModuleId);

    // 우측 변경이력(searchVersions)은 JPQL 불가(2 스키마 UNION + FROM-서브쿼리)로
    // InterfaceFormatListMyBatisDao(MyBatis) 로 이관됨 (하이브리드). 본 인터페이스엔 JPQL 만 유지.
}
