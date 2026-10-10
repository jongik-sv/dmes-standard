package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdDelta;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** TB_MDM_ERD_CMD_LOG 쓰기·읽기. 감사 칼럼은 네이티브 SQL 에 직접 쓴다(ADR-0001). 호출자의 트랜잭션에 합류한다. */
@Component
public class ErdCommandLogStore {

    static final int MAX_REPLAY = 500;

    private final EntityManager em;

    public ErdCommandLogStore(EntityManager em) {
        this.em = em;
    }

    public void insert(String modelId, long rev, BigDecimal modelVer, String userId, String session, String source,
                       String cmdJson, String inverseJson, List<ErdChange> changes) {
        NativeQuery<?> q = em.createNativeQuery("""
                INSERT INTO TB_MDM_ERD_CMD_LOG (ERD_MODEL_ID, REV, MODEL_VER, USER_ID, SESSION_NM, SOURCE,
                  CMD_JSON, INVERSE_JSON, CHANGES_JSON, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER)
                VALUES (:modelId, :rev, :modelVer, :userId, :session, :source, :cmd, :inv, :chg, :cUsr, SYSTIMESTAMP,
                  'erdEdit', 'erdEdit', :uUsr, SYSTIMESTAMP, 'erdEdit', 'erdEdit', 0)""").unwrap(NativeQuery.class);
        q.setParameter("modelId", modelId, String.class);
        q.setParameter("rev", rev, Long.class);
        q.setParameter("modelVer", modelVer, BigDecimal.class);
        q.setParameter("userId", userId, String.class);
        q.setParameter("session", session, String.class);
        q.setParameter("source", source, String.class);
        q.setParameter("cmd", cmdJson, String.class);
        q.setParameter("inv", inverseJson, String.class);
        q.setParameter("chg", write(changes), String.class);
        q.setParameter("cUsr", userId, String.class);
        q.setParameter("uUsr", userId, String.class);
        q.executeUpdate();
    }

    /**
     * 표시 행(SOURCE=SYSTEM). DRAFT 삭제·새 DRAFT 처럼 모델 JSON 이 명령 없이 통째로 바뀐 자리에 rev 하나를 쓴다 — 델타로는 그 변화를
     * 전할 수 없으므로 읽는 쪽이 reload 로 바꾼다. 역명령은 빈 배열이라 되돌릴 수 없다.
     *
     * @param reason DRAFT_DELETED | DRAFT_CREATED
     */
    public void insertMarker(String modelId, long rev, BigDecimal modelVer, String userId, String reason) {
        String cmd = write(List.of(java.util.Map.of("op", "marker", "reason", reason,
                "ver", modelVer == null ? "" : VersionNumbers.plain(modelVer))));
        insert(modelId, rev, modelVer, userId, ErdDelta.MARKER_SESSION, ErdDelta.MARKER_SOURCE, cmd, "[]", List.of());
    }

    // CLOB 은 읽는 동안 연결이 살아 있어야 하므로 읽기 메서드는 읽기 전용 트랜잭션 안에서 문자열로 바꾼다.
    /** sinceRev 다음부터. 개수가 MAX_REPLAY 를 넘거나 사이에 표시 행이 있으면 empty(호출자가 reload 로 바꾼다). */
    @Transactional(readOnly = true)
    public Optional<List<ErdDelta>> since(String modelId, long sinceRev, long currentRev) {
        if (currentRev - sinceRev > MAX_REPLAY) return Optional.empty();
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                SELECT REV, USER_ID, SESSION_NM, SOURCE, CHANGES_JSON FROM TB_MDM_ERD_CMD_LOG
                 WHERE ERD_MODEL_ID = ? AND REV > ? AND REV <= ? ORDER BY REV""")
                .setParameter(1, modelId).setParameter(2, sinceRev).setParameter(3, currentRev).getResultList();
        List<ErdDelta> out = new ArrayList<>();
        for (Object[] r : rows) {
            if (ErdDelta.MARKER_SOURCE.equals(r[3])) return Optional.empty();
            out.add(new ErdDelta(modelId, ((Number) r[0]).longValue(), (String) r[1], (String) r[2], (String) r[3],
                    read(clob(r[4]))));
        }
        return Optional.of(out);
    }

    /** afterRev 뒤 currentRev 까지 사이에 표시 행이 있는가(되돌리기 판정 — 지운 DRAFT 의 명령을 다음 DRAFT 로 되돌리지 않는다). */
    public boolean markerBetween(String modelId, long afterRev, long currentRev) {
        Number n = (Number) em.createNativeQuery("""
                SELECT COUNT(*) FROM TB_MDM_ERD_CMD_LOG
                 WHERE ERD_MODEL_ID = ? AND REV > ? AND REV <= ? AND SOURCE = ?""")
                .setParameter(1, modelId).setParameter(2, afterRev).setParameter(3, currentRev)
                .setParameter(4, ErdDelta.MARKER_SOURCE).getSingleResult();
        return n.longValue() > 0;
    }

    /** 되돌리기 재료: [inverseJson, session]. */
    @Transactional(readOnly = true)
    public Optional<String[]> inverse(String modelId, long rev) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                        "SELECT INVERSE_JSON, SESSION_NM FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = ? AND REV = ?")
                .setParameter(1, modelId).setParameter(2, rev).getResultList();
        return rows.stream().findFirst().map(r -> new String[]{clob(r[0]), (String) r[1]});
    }

    /** 그 rev 가 남긴 델타(변경 후 값). 없는 rev 면 empty. */
    @Transactional(readOnly = true)
    public Optional<List<ErdChange>> changes(String modelId, long rev) {
        @SuppressWarnings("unchecked")
        List<Object> rows = em.createNativeQuery("SELECT CHANGES_JSON FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = ? AND REV = ?")
                .setParameter(1, modelId).setParameter(2, rev).getResultList();
        return rows.stream().findFirst().map(r -> read(clob(r)));
    }

    static String clob(Object o) {
        try {
            return o instanceof java.sql.Clob c ? c.getSubString(1, (int) c.length()) : (String) o;
        } catch (java.sql.SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    static String write(Object o) {
        try {
            return ErdModelCodec.MAPPER.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    static List<ErdChange> read(String json) {
        try {
            return ErdModelCodec.MAPPER.readValue(json, new TypeReference<List<ErdChange>>() {});
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
