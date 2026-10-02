package com.dongkuk.dmes.mdm.dme.ruleSetEdit.service;

import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Repository;

/**
 * 세트 부모·버전 행의 조건부 네이티브 UPDATE(D-144 2단계). 버전 행의 {@code ROW_VERSION} 은 엔티티에서 {@code updatable=false} 라 네이티브로만
 * 올린다. 감사 U_* 는 {@code RuleNativeWrites} 와 같은 방식으로 쓰고, 감사 카운터는 부모 {@code VER}·버전 행 {@code AUD_VER} 다(D-034).
 * 호출자 트랜잭션 안에서만 쓴다. 바뀐 행 수를 돌려준다(0 이면 호출자가 {@link #status} 로 다시 읽어 없음·상태를 가른다). 버전 행의 소유자·
 * row_version·DRAFT 검사와 row_version 올리기는 공통 {@code VersionWriteGuard.beginDraftWrite} 몫이다.
 */
@Repository
public class RuleSetWrites {

    private static final String AUDIT_SET = "U_USR_ID = :uUsrId, U_AT = :uAt, U_SVC_ID = :uSvcId, U_PGM_ID = :uPgmId";

    private final EntityManager entityManager;
    private final MdmNativeAuditSupport auditSupport;
    private final MdmTemporalBinder temporal;

    public RuleSetWrites(EntityManager entityManager, MdmNativeAuditSupport auditSupport, MdmTemporalBinder temporal) {
        this.entityManager = entityManager;
        this.auditSupport = auditSupport;
        this.temporal = temporal;
    }

    /** DRAFT 의 흐름·룰 목록. row_version 은 호출 직전 공통 가드({@code beginDraftWrite})가 올렸다. DRAFT 가 아니면 0행. */
    public int updateDraft(String setId, BigDecimal ver, String ruleIdsJson, String flowJson) {
        NativeQuery<?> q = audited("UPDATE TB_MDM_RULE_SET_VER SET RULE_IDS = :ids, FLOW_JSON = :flow, " + AUDIT_SET
                + ", AUD_VER = COALESCE(AUD_VER, 0) + 1 WHERE MARU_RULE_SET_ID = :id AND VER = :ver AND STATUS = 'DRAFT'")
                .setParameter("id", setId).setParameter("ver", VersionNumbers.scaled(ver)).setParameter("ids", ruleIdsJson);
        q.setParameter("flow", flowJson, String.class);
        return q.executeUpdate();
    }

    /** 세트명·설명 — 폐기하지 않은 부모만. 동시성은 DRAFT 쓰기 가드가 막는다(J1). */
    public int updateHeader(String setId, String name, String description) {
        NativeQuery<?> q = audited("UPDATE TB_MDM_RULE_SET SET MARU_RULE_SET_NAME = :name, DESCRIPTION = :desc, " + AUDIT_SET
                + ", VER = COALESCE(VER, 0) + 1 WHERE MARU_RULE_SET_ID = :id AND STATUS <> 'DEPRECATED'")
                .setParameter("id", setId).setParameter("name", name);
        q.setParameter("desc", description, String.class);
        return q.executeUpdate();
    }

    /** 폐기 — INUSE → DEPRECATED(J2). 호출자가 계산 상태 승격(CREATED→INUSE)을 먼저 한다. */
    public int deprecate(String setId) {
        return audited("UPDATE TB_MDM_RULE_SET SET STATUS = 'DEPRECATED', " + AUDIT_SET + ", VER = COALESCE(VER, 0) + 1 "
                + "WHERE MARU_RULE_SET_ID = :id AND STATUS = 'INUSE'").setParameter("id", setId).executeUpdate();
    }

    /** 되살리기 — DEPRECATED → INUSE. 검사는 호출자가 먼저 돌린다(I15). */
    public int restore(String setId) {
        return audited("UPDATE TB_MDM_RULE_SET SET STATUS = 'INUSE', " + AUDIT_SET + ", VER = COALESCE(VER, 0) + 1 "
                + "WHERE MARU_RULE_SET_ID = :id AND STATUS = 'DEPRECATED'").setParameter("id", setId).executeUpdate();
    }

    /** 부모 상태(저장값). 스칼라 JPQL 이라 영속성 컨텍스트의 낡은 값을 쓰지 않는다. 없으면 빈 값. */
    public Optional<String> status(String setId) {
        List<String> rows = entityManager.createQuery("SELECT s.status FROM MdmRuleSet s WHERE s.maruRuleSetId = :id", String.class)
                .setParameter("id", setId).getResultList();
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

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
