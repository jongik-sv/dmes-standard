package com.dongkuk.dmes.mdm.dme.ruleSetEdit.service;

import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Repository;

/**
 * 룰 세트 한 행의 조건부 네이티브 UPDATE(TSK-08-06 design §6.6-6, I12·I14·I15). {@code ROW_VERSION} 은 엔티티에서 {@code updatable=false} 라
 * 네이티브로만 올린다. 감사 U_* 와 감사 카운터 {@code VER} 는 {@code RuleNativeWrites} 와 같은 방식으로 쓴다. 호출자 트랜잭션 안에서만 쓴다.
 * 세트에는 버전·DRAFT·선점이 없고 {@code TB_MDM_RULE_SET} 밖의 테이블을 쓰지 않는다(I3·I23). 바뀐 행 수를 돌려준다(0 이면 호출자가
 * {@link #state} 로 다시 읽어 없음·상태·row_version 을 가른다).
 */
@Repository
public class RuleSetWrites {

    /** 0행 분류와 되살리기 검사에 쓰는 세트 한 행의 현재 값(네이티브 UPDATE 는 영속성 컨텍스트를 갱신하지 않으므로 DB 에서 읽는다). */
    public record SetState(String status, long rowVersion, String ruleIds) {
    }

    private final EntityManager entityManager;
    private final MdmNativeAuditSupport auditSupport;
    private final MdmTemporalBinder temporal;

    public RuleSetWrites(EntityManager entityManager, MdmNativeAuditSupport auditSupport, MdmTemporalBinder temporal) {
        this.entityManager = entityManager;
        this.auditSupport = auditSupport;
        this.temporal = temporal;
    }

    /** 저장 — INUSE 이고 row_version 이 같을 때만 세트명·룰 목록(JSON)·설명을 바꾸고 row_version 을 올린다. */
    public int update(String setId, String name, String ruleIdsJson, String description, long rowVersion) {
        NativeQuery<?> q = audited("UPDATE TB_MDM_RULE_SET SET MARU_RULE_SET_NAME = :name, RULE_IDS = :ids, DESCRIPTION = :desc, "
                + "ROW_VERSION = ROW_VERSION + 1, " + AUDIT_SET + " WHERE MARU_RULE_SET_ID = :id AND ROW_VERSION = :rv AND STATUS = 'INUSE'")
                .setParameter("id", setId).setParameter("rv", rowVersion).setParameter("name", name).setParameter("ids", ruleIdsJson);
        q.setParameter("desc", description, String.class);
        return q.executeUpdate();
    }

    /** 폐기 — INUSE → DEPRECATED. */
    public int deprecate(String setId, long rowVersion) {
        return audited("UPDATE TB_MDM_RULE_SET SET STATUS = 'DEPRECATED', ROW_VERSION = ROW_VERSION + 1, " + AUDIT_SET
                + " WHERE MARU_RULE_SET_ID = :id AND ROW_VERSION = :rv AND STATUS = 'INUSE'")
                .setParameter("id", setId).setParameter("rv", rowVersion).executeUpdate();
    }

    /** 되살리기 — DEPRECATED → INUSE. 검사는 호출자가 먼저 돌린다(I15). */
    public int restore(String setId, long rowVersion) {
        return audited("UPDATE TB_MDM_RULE_SET SET STATUS = 'INUSE', ROW_VERSION = ROW_VERSION + 1, " + AUDIT_SET
                + " WHERE MARU_RULE_SET_ID = :id AND ROW_VERSION = :rv AND STATUS = 'DEPRECATED'")
                .setParameter("id", setId).setParameter("rv", rowVersion).executeUpdate();
    }

    /** 세트 한 행의 상태·row_version·룰 목록 JSON. 없으면 빈 값. */
    public Optional<SetState> state(String setId) {
        List<?> rows = entityManager.createNativeQuery(
                        "SELECT STATUS, ROW_VERSION, RULE_IDS FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = :id")
                .setParameter("id", setId).getResultList();
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        Object[] r = (Object[]) rows.get(0);
        return Optional.of(new SetState((String) r[0], ((Number) r[1]).longValue(), r[2] == null ? null : r[2].toString()));
    }

    private static final String AUDIT_SET = "U_USR_ID = :uUsrId, U_AT = :uAt, U_SVC_ID = :uSvcId, U_PGM_ID = :uPgmId, VER = COALESCE(VER, 0) + 1";

    private NativeQuery<?> audited(String sql) {
        entityManager.flush();
        AuditStamp stamp = auditSupport.currentStamp();
        NativeQuery<?> q = entityManager.createNativeQuery(sql).unwrap(NativeQuery.class);
        q.setParameter("uAt", temporal.toDb(stamp.at()));
        q.setParameter("uUsrId", stamp.userId(), String.class);
        q.setParameter("uSvcId", stamp.serviceId(), String.class);
        q.setParameter("uPgmId", stamp.programId(), String.class);
        return q;
    }
}
