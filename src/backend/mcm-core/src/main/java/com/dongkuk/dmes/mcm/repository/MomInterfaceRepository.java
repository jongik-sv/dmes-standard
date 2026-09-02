package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.MomInterface;
import com.dongkuk.dmes.mcm.entity.MomInterfaceId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * TB_MCM_MOM_INTERFACES JPA Repository.
 *
 * <p>설계: `docs/mcm/design/interfaceList/interfaceList_분석리포트.md` §11 C1~C6 / BPMN §4.2 / 기능 §3.
 * As-Is: `mui/src/main/resources/persistence/mappers-cia/InterfaceListMapper.xml` Line 7-51
 * (GetMomInterfaceList — 7 LIKE 조건, MSSQL ANSI 변환 필요).
 *
 * <p>To-Be 변환:
 * <ul>
 *   <li>Oracle {@code KEEP(DENSE_RANK FIRST ORDER BY FORMAT_VER DESC)} → ANSI 상관 서브쿼리 +
 *       Service 단에서 FormatRepository 조회 (분리)</li>
 *   <li>Oracle {@code '%'||#{p}||'%'} → JPQL {@code CONCAT('%', :p, '%')}</li>
 *   <li>Q-007 (송수신지역 화면 미노출) — pSendWorksCd / pRecvWorksCd 파라미터 제거 (DB 컬럼은 유지)</li>
 *   <li>Q-006 (송수신모듈 Edit) — pSendModuleId / pRecvModuleId 는 정확 매칭 (LIKE ✗)</li>
 * </ul>
 *
 * <p>5 LIKE 조건 (Q-007 후 — 송수신지역 2개 제거):
 * <ol>
 *   <li>pSendModuleId — 정확 매칭 (Q-006 Edit 박스)</li>
 *   <li>pRecvModuleId — 정확 매칭 (Q-006)</li>
 *   <li>pInterfaceId — LIKE %v%</li>
 *   <li>pTransactionCode — LIKE %v%</li>
 *   <li>pFormatId — LIKE %v%</li>
 * </ol>
 */
public interface MomInterfaceRepository extends JpaRepository<MomInterface, MomInterfaceId> {

    /**
     * As-Is {@code GetMomInterfaceList} 의 ANSI 변환.
     *
     * <p>TC_NM / FORMAT_NM 조인 컬럼은 Service 단에서 별도 조회 + Map 조립 (cma 패턴 정합).
     * 본 Repository 는 INTERFACES Entity 만 반환 — Service 단에서 enrichment.
     */
    @Query("""
            SELECT m FROM MomInterface m
            WHERE (:pSendModuleId IS NULL OR :pSendModuleId = ''
                   OR m.sendModuleId = :pSendModuleId)
              AND (:pRecvModuleId IS NULL OR :pRecvModuleId = ''
                   OR m.recvModuleId = :pRecvModuleId)
              AND (:pInterfaceId IS NULL OR :pInterfaceId = ''
                   OR m.id.interfaceId LIKE CONCAT('%', :pInterfaceId, '%'))
              AND (:pTransactionCode IS NULL OR :pTransactionCode = ''
                   OR m.id.transactionCode LIKE CONCAT('%', :pTransactionCode, '%'))
              AND (:pFormatId IS NULL OR :pFormatId = ''
                   OR m.formatId LIKE CONCAT('%', :pFormatId, '%'))
            ORDER BY m.id.transactionCode
            """)
    List<MomInterface> findByFilter(@Param("pSendModuleId") String pSendModuleId,
                                    @Param("pRecvModuleId") String pRecvModuleId,
                                    @Param("pInterfaceId") String pInterfaceId,
                                    @Param("pTransactionCode") String pTransactionCode,
                                    @Param("pFormatId") String pFormatId);

    /**
     * messageSender INTERFACE LoV (P-001, M-7+M-10) — DISTINCT INTERFACE_ID 목록.
     *
     * <p>한 INTERFACE_ID 가 여러 (INTERFACE_ID, TC) 행을 가지므로 DISTINCT 로 묶는다.
     * 화면 표시명(INTERFACE_DESC)은 Service 단에서 대표 1건으로 enrichment.
     */
    @Query("SELECT DISTINCT m.id.interfaceId FROM MomInterface m ORDER BY m.id.interfaceId")
    List<String> findDistinctInterfaceIds();

    /**
     * messageSender TC LoV (P-002, M-7+M-10) — 선택 INTERFACE 종속 TC 목록.
     *
     * <p>As-Is `WHERE INTERFACE_ID = :ifid` 필터 (TC LoV 는 선택 INTERFACE 에 종속).
     *
     * @param interfaceId 선택된 인터페이스 ID
     * @return 해당 인터페이스의 (INTERFACE_ID, TC) 행 목록 (TRANSACTION_CODE 오름차순)
     */
    @Query("SELECT m FROM MomInterface m WHERE m.id.interfaceId = :interfaceId ORDER BY m.id.transactionCode")
    List<MomInterface> findByInterfaceId(@Param("interfaceId") String interfaceId);
}
