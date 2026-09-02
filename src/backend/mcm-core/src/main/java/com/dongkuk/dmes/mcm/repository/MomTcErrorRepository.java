package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.MomTcError;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

/**
 * TB_MCM_MOM_TC_ERROR 조회 Repository (tcErrorList — 조회 전용).
 *
 * <p>영속성 결정 DEC-03: JPA + {@code @Query(nativeQuery=true)} + ANSI. As-Is Mapper
 * {@code GetMomTcErrorList} 의 ANSI 변환 (분석 §11.1 / BPMN §2.2):
 * <ul>
 *   <li>C-008: CREATION_TIMESTAMP → AUDIT {@code C_AT} (DEC-04 승인)</li>
 *   <li>C-009: 묵시조인 → LEFT JOIN TC_LIST (TC_LIST 미존재 row 도 표시, DEC-04)</li>
 *   <li>C-007: Oracle {@code ||} → ANSI {@code CONCAT}</li>
 *   <li>C-002: RESEND_CNT = COUNT(TB_MCM_MOM_TC_SEND WHERE ERR_SQ_VAL = SQ_VAL) — Q-100(A) 재전송 이력형</li>
 *   <li>C-001(SNDR_INFORM_EDIT_DATE): DEC-Q-102(유효하지않음) → 미산출·컬럼 제거</li>
 * </ul>
 *
 * <p>날짜 조건(S-001/S-002)은 Service 에서 14자리(yyyyMMddHHmmss) → {@link Instant} 파싱 후
 * 타입 파라미터로 전달(빈값 → null). LIKE 5조건은 {@code IS NULL OR} 동적 패턴.
 *
 * <p>SELECT alias = camelCase ({@link TcErrorRowView} 매핑). ORDER BY C_AT DESC (As-Is 동일).
 */
public interface MomTcErrorRepository extends JpaRepository<MomTcError, Long> {

    @Query(nativeQuery = true, value = """
            SELECT CAST(e.SQ_VAL AS BIGINT)             AS sqVal,
                   e.TRANSACTION_CODE                   AS transactionCode,
                   t.TRANSACTION_NM                     AS transactionNm,
                   e.INTERFACE_ID                       AS interfaceId,
                   e.INTERFACE_MSG                      AS interfaceMsg,
                   e.ERROR_TYPE                         AS errorType,
                   e.ERROR_CODE                         AS errorCode,
                   e.ERROR_MSG                          AS errorMsg,
                   CONVERT(VARCHAR(19), e.C_AT, 120)    AS creationTimestamp,
                   CAST((SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_MOM_TC_SEND s
                          WHERE s.ERR_SQ_VAL = e.SQ_VAL) AS BIGINT) AS resendCnt
              FROM MCMAPUSER.TB_MCM_MOM_TC_ERROR e
              LEFT JOIN MCMAPUSER.TB_MCM_MOM_TC_LIST t
                     ON t.TRANSACTION_CODE = e.TRANSACTION_CODE
             WHERE (:pCreationTimestampFrom IS NULL OR e.C_AT >= :pCreationTimestampFrom)
               AND (:pCreationTimestampTo   IS NULL OR e.C_AT <= :pCreationTimestampTo)
               AND (:pErrorSystem     IS NULL OR e.INTERFACE_ID     LIKE CONCAT('%', :pErrorSystem,     '%'))
               AND (:pErrorCode       IS NULL OR e.ERROR_CODE       LIKE CONCAT('%', :pErrorCode,       '%'))
               AND (:pTransactionCode IS NULL OR e.TRANSACTION_CODE LIKE CONCAT('%', :pTransactionCode, '%'))
             ORDER BY e.C_AT DESC
            """)
    List<TcErrorRowView> search(@Param("pCreationTimestampFrom") Instant pCreationTimestampFrom,
                                @Param("pCreationTimestampTo") Instant pCreationTimestampTo,
                                @Param("pErrorSystem") String pErrorSystem,
                                @Param("pErrorCode") String pErrorCode,
                                @Param("pTransactionCode") String pTransactionCode);
}
