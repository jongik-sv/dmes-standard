package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetTestCase;
import jakarta.persistence.EntityManager;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Repository;

/**
 * TB_MDM_RULE_SET_TEST_CASE 쓰기 — 새 케이스 INSERT 와 조건부 네이티브 UPDATE·DELETE(흐름도 3단계 P7). {@code ROW_VERSION} 은 {@code updatable=false} 라
 * 엔티티로 올리지 않고 여기서만 올린다. 감사 U_* 를 명시하고 감사 카운터 VER 를 올린다. 호출자 트랜잭션 안에서만 쓴다.
 * 돌려주는 값은 바뀐 행 수다(0 이면 케이스가 없거나 row_version 이 달랐다 — 호출자가 MDM001 로 바꾼다).
 */
@Repository
public class RuleSetTestCaseWrites {

    private final EntityManager entityManager;
    private final MdmNativeAuditSupport auditSupport;
    private final MdmTemporalBinder temporal;

    public RuleSetTestCaseWrites(EntityManager entityManager, MdmNativeAuditSupport auditSupport, MdmTemporalBinder temporal) {
        this.entityManager = entityManager;
        this.auditSupport = auditSupport;
        this.temporal = temporal;
    }

    /**
     * 새 케이스 INSERT. 리포지토리 {@code save} 는 ID 를 직접 넣는 엔티티를 새것으로 보지 않아 {@code merge} 로 가므로, 발급 번호가 기존
     * case_id 와 겹치면 그 케이스를 조용히 덮어쓴다. {@code persist} 로 넣어 겹치면 PK 위반으로 실패하게 한다.
     */
    public void insert(MdmRuleSetTestCase testCase) {
        entityManager.persist(testCase);
        entityManager.flush();
    }

    /** 이름·입력·판정 시각·기대·설명을 통째로 바꾸고 row_version 을 1 올린다. */
    public int update(String setId, int caseId, long rowVersion, String caseName, String inputJson, String evalTs, String expectedJson, String description) {
        NativeQuery<?> q = audited("UPDATE TB_MDM_RULE_SET_TEST_CASE SET CASE_NAME = :name, INPUT_JSON = :input, EVAL_TS = :evalTs, EXPECTED_JSON = :expected, "
                + "DESCRIPTION = :description, ROW_VERSION = ROW_VERSION + 1, " + AUDIT_SET + ", VER = COALESCE(VER, 0) + 1 "
                + "WHERE MARU_RULE_SET_ID = :id AND CASE_ID = :caseId AND ROW_VERSION = :rowVersion")
                .setParameter("id", setId).setParameter("caseId", caseId).setParameter("rowVersion", rowVersion);
        q.setParameter("name", caseName, String.class);
        q.setParameter("input", inputJson, String.class);
        q.setParameter("evalTs", evalTs, String.class);
        q.setParameter("expected", expectedJson, String.class);
        q.setParameter("description", description, String.class);
        return q.executeUpdate();
    }

    public int delete(String setId, int caseId, long rowVersion) {
        entityManager.flush();
        return entityManager.createNativeQuery("DELETE FROM TB_MDM_RULE_SET_TEST_CASE WHERE MARU_RULE_SET_ID = :id AND CASE_ID = :caseId "
                        + "AND ROW_VERSION = :rowVersion")
                .setParameter("id", setId).setParameter("caseId", caseId).setParameter("rowVersion", rowVersion).executeUpdate();
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
