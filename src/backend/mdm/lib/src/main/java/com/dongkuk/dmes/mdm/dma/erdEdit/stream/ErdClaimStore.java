package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 작업 중 표시 표(TB_MDM_ERD_CLAIM)의 SQL(스펙 D17·S2-26). {@link ErdEventHub} 가 자기 {@link JdbcTemplate} 으로 만들어 쓴다 — 호출자
 * 트랜잭션(OASIS)이 있으면 그 연결로 쓰고 읽는다. 커밋 뒤 방송은 허브 몫이다. 시각 비교는 애플리케이션 시각으로 한다(쓰기와 같은 시계).
 */
final class ErdClaimStore {

    private final JdbcTemplate jdbc;

    ErdClaimStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 표시를 넣거나, 같은 세션의 것·만료된 것이면 덮는다. 바꾼 행 수를 돌려준다 — 0 이면 차지하지 못했다(다른 세션이 살아 있는 표시를 쥐고
     * 있다). 같은 표를 다른 세션이 동시에 처음 표시해 키가 겹치면 Oracle 은 상대 커밋까지 기다린 뒤 키 위반을 내고, 이때도 0 이다 — 그 뒤
     * 상대 표시가 만료·해제되어 쥔 세션이 이미 없을 수 있다.
     */
    int upsert(String modelId, String tableId, String session, String userId, Instant at, Instant until) {
        Timestamp now = Timestamp.from(at);
        Timestamp untilTs = Timestamp.from(until);
        try {
            return jdbc.update("""
                MERGE INTO TB_MDM_ERD_CLAIM T
                USING (
                       SELECT ? AS ERD_MODEL_ID
                            , ? AS TABLE_UUID
                         FROM DUAL
                      ) S
                   ON (T.ERD_MODEL_ID = S.ERD_MODEL_ID AND T.TABLE_UUID = S.TABLE_UUID)
                 WHEN MATCHED THEN UPDATE
                         SET T.SESSION_NM = ?
                           , T.USER_ID    = ?
                           , T.EXPIRES_AT = ?
                           , T.U_USR_ID   = ?
                           , T.U_AT       = ?
                       WHERE T.SESSION_NM = ?
                          OR T.EXPIRES_AT <= ?
                 WHEN NOT MATCHED THEN INSERT
                       (ERD_MODEL_ID, TABLE_UUID, SESSION_NM, USER_ID, EXPIRES_AT, C_USR_ID, C_AT, U_USR_ID, U_AT, VER)
                       VALUES (S.ERD_MODEL_ID, S.TABLE_UUID, ?, ?, ?, ?, ?, ?, ?, 0)
                """, modelId, tableId, session, userId, untilTs, userId, now, session, now,
                    session, userId, untilTs, userId, now, userId, now);
        } catch (DuplicateKeyException e) {
            return 0; // 같은 표를 다른 세션이 동시에 처음 표시했다 — 먼저 들어간 쪽이 이긴다
        } catch (DataIntegrityViolationException e) {
            // 모델 삭제(ERD 2차 §7.2)와 겹쳤다 — 부모 모델 행이 사라져 FK 위반(ORA-02291). 원시 오류(S001) 대신 ERD_MODEL_NOT_FOUND.
            // 이 경로는 저장 잠금(모델 행)을 기다리지 않는다 — 풀 연결을 아끼려고 잠그지 않고 FK 로 판정한다.
            if (!String.valueOf(e.getMostSpecificCause().getMessage()).contains("FK_TB_MDM_ERD_CLAIM_MODEL")) throw e;
            throw MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND);
        }
    }

    /** 지금 그 표를 쥔 살아 있는 표시. */
    Optional<ErdClaimView> holder(String modelId, String tableId) {
        return jdbc.query("""
                SELECT TABLE_UUID
                     , SESSION_NM
                     , USER_ID
                     , EXPIRES_AT
                  FROM TB_MDM_ERD_CLAIM
                 WHERE ERD_MODEL_ID = ?
                   AND TABLE_UUID = ?
                   AND EXPIRES_AT > ?
                """, (rs, i) -> new ErdClaimView(rs.getString(1), rs.getString(2), rs.getString(3),
                        rs.getTimestamp(4).toInstant().toString()), modelId, tableId, Timestamp.from(Instant.now()))
                .stream().findFirst();
    }

    /** 그 세션의 표시를 지운다. 지운 행 수를 돌려준다. */
    int delete(String modelId, String tableId, String session) {
        return jdbc.update("DELETE FROM TB_MDM_ERD_CLAIM WHERE ERD_MODEL_ID = ? AND TABLE_UUID = ? AND SESSION_NM = ?",
                modelId, tableId, session);
    }

    /** 만료가 지나지 않은 표시만, 표 id 순. */
    List<ErdClaimView> live(String modelId) {
        return jdbc.query("""
                SELECT TABLE_UUID
                     , SESSION_NM
                     , USER_ID
                     , EXPIRES_AT
                  FROM TB_MDM_ERD_CLAIM
                 WHERE ERD_MODEL_ID = ?
                   AND EXPIRES_AT > ?
                 ORDER BY TABLE_UUID
                """, (rs, i) -> new ErdClaimView(rs.getString(1), rs.getString(2), rs.getString(3), rs.getTimestamp(4).toInstant().toString()),
                modelId, Timestamp.from(Instant.now()));
    }
}
