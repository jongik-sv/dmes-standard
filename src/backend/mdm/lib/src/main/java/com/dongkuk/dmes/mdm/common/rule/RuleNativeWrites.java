package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Repository;

/**
 * 룰 테이블의 {@code updatable=false} 칼럼과 적중 정책·기본 집계를 바꾸는 네이티브 UPDATE(TSK-08-02 design I8·I9, TSK-08-01 D7). 감사 U_* 를
 * 명시하고 감사 카운터(TB_MDM_RULE 은 VER, TB_MDM_RULE_VER 은 AUD_VER)를 올린다. 호출자 트랜잭션 안에서만 쓴다.
 * OWNER_ID·ROW_VERSION·버전 STATUS 는 여기서 바꾸지 않는다(공통 버전 서비스 몫, I6).
 */
@Repository
public class RuleNativeWrites {

    private final EntityManager entityManager;
    private final MdmNativeAuditSupport auditSupport;
    private final MdmTemporalBinder temporal;

    public RuleNativeWrites(EntityManager entityManager, MdmNativeAuditSupport auditSupport, MdmTemporalBinder temporal) {
        this.entityManager = entityManager;
        this.auditSupport = auditSupport;
        this.temporal = temporal;
    }

    /** 폐기 — INUSE 인 룰만 DEPRECATED 로 바꾼다. 바뀐 행 수(0 이면 INUSE 가 아니었다). */
    public int deprecate(String ruleId) {
        return audited("UPDATE TB_MDM_RULE SET STATUS = 'DEPRECATED', " + AUDIT_SET + ", VER = COALESCE(VER, 0) + 1 "
                + "WHERE MARU_RULE_ID = :id AND STATUS = 'INUSE'")
                .setParameter("id", ruleId).executeUpdate();
    }

    /** 표 저장의 적중 정책(D-133 — 표 저장이 행과 같은 트랜잭션에서 쓴다. DERIVE 는 null). */
    public int updateHitPolicy(String ruleId, BigDecimal ver, String hitPolicy) {
        NativeQuery<?> q = audited("UPDATE TB_MDM_RULE_VER SET HIT_POLICY = :hit, " + AUDIT_SET + ", AUD_VER = COALESCE(AUD_VER, 0) + 1 "
                + "WHERE MARU_RULE_ID = :id AND VER = :ver")
                .setParameter("id", ruleId).setParameter("ver", VersionNumbers.scaled(ver));
        q.setParameter("hit", hitPolicy, String.class);
        return q.executeUpdate();
    }

    /**
     * 기본 집계({@code 'LIST'})를 비운다 — 적중 정책이 COLLECT 가 아니게 바뀐 표 저장(D-133). LIST 는 열 설정이 COLLECT 결과 열에 채우는
     * 기본값이자 DB 기본값이라 비워도 뜻이 같다(엔진은 집계가 비면 LIST 로 모은다). 남겨 두면 COLLECT 가 아닌 정책에서 열 설정 검사가
     * "집계는 COLLECT 적중 정책의 결과 열에만" 으로 막는다. LIST 가 아닌 집계는 여기서 지우지 않는다(호출자가 먼저 거부한다).
     */
    public int clearDefaultCollectAgg(String ruleId, BigDecimal ver) {
        return audited("UPDATE TB_MDM_RULE_VAR SET COLLECT_AGG = NULL, " + AUDIT_SET + ", AUD_VER = COALESCE(AUD_VER, 0) + 1 "
                + "WHERE MARU_RULE_ID = :id AND VER = :ver AND COLLECT_AGG = 'LIST'")
                .setParameter("id", ruleId).setParameter("ver", VersionNumbers.scaled(ver)).executeUpdate();
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
