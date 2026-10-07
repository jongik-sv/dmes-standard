package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.MomFormatLayout;
import com.dongkuk.dmes.mcm.entity.MomFormatLayoutId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

/**
 * I/F Format Layout 관리 (cib/interfaceFormatLayout) — 항목 레이아웃 CUD Repository.
 *
 * <p>설계: `docs/mcm/design/interfaceFormatLayout/interfaceFormatLayout_BPMN설계서.md` §3.
 * 저장 = replaceAll (전체 DELETE + N건 INSERT). 단일 트랜잭션(OASIS process 단위 자동 wrap).
 *
 * <p>사용자 결정 (2026-06-02):
 * <ul>
 *   <li>DEC-01: 삭제 WHERE = FORMAT_ID 만 (As-Is 유지) — {@link #deleteByFormatId}.</li>
 *   <li>DEC-BACKUP: 삭제 전 MCM_BACKUP 으로 복사 — {@link #backupToMcmBackup} (변경이력 UNION 보존).</li>
 * </ul>
 */
public interface InterfaceFormatLayoutRepository extends JpaRepository<MomFormatLayout, MomFormatLayoutId> {

    /**
     * 항목 레이아웃 조회 (action=search) — (FORMAT_ID, FORMAT_VER) 의 항목을 ITEM_SEQ 오름차순.
     */
    @Query("SELECT l FROM MomFormatLayout l " +
           "WHERE l.id.formatId = :formatId AND l.id.formatVer = :formatVer " +
           "ORDER BY l.id.itemSeq ASC")
    List<MomFormatLayout> findByFormat(@Param("formatId") String formatId,
                                       @Param("formatVer") BigDecimal formatVer);

    /**
     * replaceAll DELETE (action=save 1단계) — DEC-01: FORMAT_ID 만 (As-Is 유지, 전 버전 삭제).
     */
    @Modifying(clearAutomatically = true)
    @Query("DELETE FROM MomFormatLayout l WHERE l.id.formatId = :formatId")
    int deleteByFormatId(@Param("formatId") String formatId);

    /**
     * DEC-BACKUP — replaceAll DELETE 직전 백업: MCMAPUSER → MCM_BACKUP 으로 해당 FORMAT_ID 의 모든 행 복사.
     *
     * <p>idempotent (PK NOT EXISTS) — 반복 저장 시 중복 INSERT(PK 충돌) 방지. 삭제될 버전이
     * interfaceFormatList 변경이력(UNION MCM_BACKUP)에 보존됨. native (cross-schema INSERT...SELECT).
     *
     * @return 백업된 행 수
     * @deprecated 표 없음, 호출 없음 — Oracle 기준선(oracle-1007)에 {@code MCM_BACKUP.TB_MCM_MOM_FORMAT_LAYOUT} 이 없고,
     *             {@code src/backend} 전체에 이 메서드를 부르는 곳이 없다(2026-10-07 c2 확인). 부르면 ORA-00942 가 난다.
     */
    @Deprecated
    @Modifying
    @Query(nativeQuery = true, value = """
            INSERT INTO MCM_BACKUP.TB_MCM_MOM_FORMAT_LAYOUT
                (FORMAT_ID, FORMAT_VER, ITEM_SEQ, ITEM_TP, ITEM_ID, ITEM_NM, DATA_TP, DATA_LEN, DATA_DECIMAL_PREC,
                 C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER)
            SELECT s.FORMAT_ID, s.FORMAT_VER, s.ITEM_SEQ, s.ITEM_TP, s.ITEM_ID, s.ITEM_NM, s.DATA_TP, s.DATA_LEN, s.DATA_DECIMAL_PREC,
                   s.C_USR_ID, s.C_AT, s.C_SVC_ID, s.C_PGM_ID, s.U_USR_ID, s.U_AT, s.U_SVC_ID, s.U_PGM_ID, s.VER
              FROM TB_MCM_MOM_FORMAT_LAYOUT s
             WHERE s.FORMAT_ID = :formatId
               AND NOT EXISTS (SELECT 1 FROM MCM_BACKUP.TB_MCM_MOM_FORMAT_LAYOUT b
                                WHERE b.FORMAT_ID = s.FORMAT_ID AND b.FORMAT_VER = s.FORMAT_VER AND b.ITEM_SEQ = s.ITEM_SEQ)
            """)
    int backupToMcmBackup(@Param("formatId") String formatId);

    /**
     * FORMAT 선택 팝업(P-001) 데이터 — TB_MCM_MOM_FORMAT_LIST 의 (FORMAT_ID, FORMAT_VER, FORMAT_NM) 목록.
     *
     * @return {@code Object[]{ FORMAT_ID, FORMAT_VER, FORMAT_NM }}
     */
    @Query("SELECT f.id.formatId, f.id.formatVer, f.formatNm FROM MomFormatList f ORDER BY f.id.formatId, f.id.formatVer")
    List<Object[]> findFormatList();
}
