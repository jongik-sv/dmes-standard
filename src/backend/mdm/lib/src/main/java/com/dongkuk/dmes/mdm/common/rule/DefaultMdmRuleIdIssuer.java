package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.contract.common.MdmDialect;
import com.dongkuk.dmes.mdm.contract.common.MdmDialectResolver;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdIssuer;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdKind;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdRange;
import jakarta.persistence.EntityManager;
import java.util.List;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 룰 안 식별자 발급(TSK-08-02 design §2.1-C, I11, 규칙표 #1). 카운터를 결과 집합을 돌려주는 <b>단일 UPDATE 한 문</b>으로 올리고
 * 올린 뒤 값 {@code last} 에서 {@code first = last - count + 1} 을 계산한다. 읽고 쓰는 두 문으로 나누지 않는다.
 *
 * <ul>
 *   <li>SQLite: {@code UPDATE … RETURNING <카운터>}(3.35 이상). JPA 네이티브 {@code getResultList()} 가 {@code executeQuery} 로 실행해
 *       한 행을 돌려준다(DefaultMdmRuleIdIssuerSqliteTest 실측).</li>
 *   <li>MSSQL: {@code UPDATE … OUTPUT inserted.<카운터> WHERE …}.</li>
 * </ul>
 * 감사 U_* 와 감사 카운터 {@code VER}(TB_MDM_RULE 은 VER, D-034)를 함께 쓴다. 호출자 트랜잭션에 합류하고 없으면 새로 연다.
 */
@Component
public class DefaultMdmRuleIdIssuer implements MdmRuleIdIssuer {

    private final EntityManager entityManager;
    private final MdmDialectResolver dialectResolver;
    private final MdmNativeAuditSupport auditSupport;
    private final MdmTemporalBinder temporal;
    private final TransactionTemplate tx;

    public DefaultMdmRuleIdIssuer(EntityManager entityManager, MdmDialectResolver dialectResolver, MdmNativeAuditSupport auditSupport,
                                  MdmTemporalBinder temporal, PlatformTransactionManager transactionManager) {
        this.entityManager = entityManager;
        this.dialectResolver = dialectResolver;
        this.auditSupport = auditSupport;
        this.temporal = temporal;
        this.tx = new TransactionTemplate(transactionManager);
    }

    @Override
    public MdmRuleIdRange issue(String maruRuleId, MdmRuleIdKind kind, int count) {
        if (count < 1) {
            throw new IllegalArgumentException("발급 개수는 1 이상이어야 한다: " + count);
        }
        Integer last = tx.execute(status -> bump(maruRuleId, kind, count));
        if (last == null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "룰을 찾을 수 없습니다: " + maruRuleId);
        }
        return new MdmRuleIdRange(maruRuleId, kind, last - count + 1, last);
    }

    private Integer bump(String maruRuleId, MdmRuleIdKind kind, int count) {
        String counter = kind.counterColumn();
        String set = "SET " + counter + " = " + counter + " + :n, U_USR_ID = :uUsrId, U_AT = :uAt, U_SVC_ID = :uSvcId, "
                + "U_PGM_ID = :uPgmId, VER = COALESCE(VER, 0) + 1";
        String sql = dialectResolver.current() == MdmDialect.MSSQL
                ? "UPDATE TB_MDM_RULE " + set + " OUTPUT inserted." + counter + " WHERE MARU_RULE_ID = :id"
                : "UPDATE TB_MDM_RULE " + set + " WHERE MARU_RULE_ID = :id RETURNING " + counter;
        entityManager.flush();
        AuditStamp stamp = auditSupport.currentStamp();
        NativeQuery<?> q = entityManager.createNativeQuery(sql).unwrap(NativeQuery.class)
                .setParameter("n", count)
                .setParameter("id", maruRuleId)
                .setParameter("uAt", temporal.toDb(stamp.at()));
        q.setParameter("uUsrId", stamp.userId(), String.class);
        q.setParameter("uSvcId", stamp.serviceId(), String.class);
        q.setParameter("uPgmId", stamp.programId(), String.class);
        List<?> rows = q.getResultList();
        return rows.isEmpty() ? null : ((Number) rows.get(0)).intValue();
    }
}
