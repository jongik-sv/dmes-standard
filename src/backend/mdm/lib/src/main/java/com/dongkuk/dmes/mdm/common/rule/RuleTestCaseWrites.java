package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import jakarta.persistence.EntityManager;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Repository;

/**
 * TB_MDM_RULE_TEST_CASE 의 조건부 네이티브 UPDATE·DELETE(TSK-08-04 design §6.6). {@code ROW_VERSION} 은 {@code updatable=false} 라
 * 엔티티로 올리지 않고 여기서만 올린다. 감사 U_* 를 명시하고 감사 카운터 VER 를 올린다. 호출자 트랜잭션 안에서만 쓴다.
 * 돌려주는 값은 바뀐 행 수다(0 이면 케이스가 없거나 row_version 이 달랐다 — 호출자가 MDM001 로 바꾼다).
 */
@Repository
public class RuleTestCaseWrites {

    private final EntityManager entityManager;
    private final MdmNativeAuditSupport auditSupport;
    private final MdmTemporalBinder temporal;

    public RuleTestCaseWrites(EntityManager entityManager, MdmNativeAuditSupport auditSupport, MdmTemporalBinder temporal) {
        this.entityManager = entityManager;
        this.auditSupport = auditSupport;
        this.temporal = temporal;
    }

    /** 이름·입력·기대·설명을 통째로 바꾸고 row_version 을 1 올린다. */
    public int update(String ruleId, int caseId, long rowVersion, String caseName, String inputJson, String expectedJson, String description) {
        NativeQuery<?> q = audited("UPDATE TB_MDM_RULE_TEST_CASE SET CASE_NAME = :name, INPUT_JSON = :input, EXPECTED_JSON = :expected, "
                + "DESCRIPTION = :description, ROW_VERSION = ROW_VERSION + 1, " + AUDIT_SET + ", VER = COALESCE(VER, 0) + 1 "
                + "WHERE MARU_RULE_ID = :id AND CASE_ID = :caseId AND ROW_VERSION = :rowVersion")
                .setParameter("id", ruleId).setParameter("caseId", caseId).setParameter("rowVersion", rowVersion);
        q.setParameter("name", caseName, String.class);
        q.setParameter("input", inputJson, String.class);
        q.setParameter("expected", expectedJson, String.class);
        q.setParameter("description", description, String.class);
        return q.executeUpdate();
    }

    public int delete(String ruleId, int caseId, long rowVersion) {
        entityManager.flush();
        return entityManager.createNativeQuery("DELETE FROM TB_MDM_RULE_TEST_CASE WHERE MARU_RULE_ID = :id AND CASE_ID = :caseId "
                        + "AND ROW_VERSION = :rowVersion")
                .setParameter("id", ruleId).setParameter("caseId", caseId).setParameter("rowVersion", rowVersion).executeUpdate();
    }

    private static final String AUDIT_SET = "U_USR_ID = :uUsrId, U_AT = :uAt, U_SVC_ID = :uSvcId, U_PGM_ID = :uPgmId";

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
