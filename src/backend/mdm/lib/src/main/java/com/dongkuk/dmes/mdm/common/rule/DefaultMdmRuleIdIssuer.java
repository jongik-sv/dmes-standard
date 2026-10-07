package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
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
 * 룰 안 식별자 발급(TSK-08-02 design §2.1-C, I11, 규칙표 #1). 한 트랜잭션 안에서 카운터를 {@code UPDATE … SET c = c + n} 으로
 * 올린 뒤 같은 행을 {@code SELECT c} 로 읽고, 올린 뒤 값 {@code last} 에서 {@code first = last - count + 1} 을 계산한다.
 *
 * <p>동시성 근거(SQLite 시절 {@code UPDATE … RETURNING} 한 문과 같은 의미): UPDATE 는 그 행에 쓰기 잠금을 잡고 트랜잭션이 끝날
 * 때까지 쥔다. 같은 룰을 동시에 발급하는 쪽은 그 잠금을 기다렸다가 커밋된 값 위에서 다시 더한다(Oracle 은 갱신 대상 행을 현재
 * 값으로 다시 읽는다). 뒤따르는 SELECT 는 같은 트랜잭션이라 자기가 쓴 값을 보고, 잠금 때문에 다른 쪽 쓰기가 끼어들 수 없다.
 * 그래서 읽기를 UPDATE 보다 먼저 두지 않는다(먼저 읽으면 두 쪽이 같은 값을 보고 같은 번호를 낸다).
 *
 * <p>감사 U_* 와 감사 카운터 {@code VER}(TB_MDM_RULE 은 VER, D-034)를 함께 쓴다. 호출자 트랜잭션에 합류하고 없으면 새로 연다.
 */
@Component
public class DefaultMdmRuleIdIssuer implements MdmRuleIdIssuer {

    private final EntityManager entityManager;
    private final MdmNativeAuditSupport auditSupport;
    private final MdmTemporalBinder temporal;
    private final TransactionTemplate tx;

    public DefaultMdmRuleIdIssuer(EntityManager entityManager, MdmNativeAuditSupport auditSupport,
                                  MdmTemporalBinder temporal, PlatformTransactionManager transactionManager) {
        this.entityManager = entityManager;
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
        String update = "UPDATE TB_MDM_RULE SET " + counter + " = " + counter + " + :n, U_USR_ID = :uUsrId, U_AT = :uAt, "
                + "U_SVC_ID = :uSvcId, U_PGM_ID = :uPgmId, VER = COALESCE(VER, 0) + 1 WHERE MARU_RULE_ID = :id";
        entityManager.flush();
        AuditStamp stamp = auditSupport.currentStamp();
        NativeQuery<?> q = entityManager.createNativeQuery(update).unwrap(NativeQuery.class)
                .setParameter("n", count)
                .setParameter("id", maruRuleId)
                .setParameter("uAt", temporal.toDb(stamp.at()));
        q.setParameter("uUsrId", stamp.userId(), String.class);
        q.setParameter("uSvcId", stamp.serviceId(), String.class);
        q.setParameter("uPgmId", stamp.programId(), String.class);
        if (q.executeUpdate() == 0) {
            return null;
        }
        // 위 UPDATE 가 잡은 행 잠금 안에서 읽는다 — 같은 트랜잭션이라 방금 올린 값이다.
        List<?> rows = entityManager.createNativeQuery("SELECT " + counter + " FROM TB_MDM_RULE WHERE MARU_RULE_ID = :id")
                .setParameter("id", maruRuleId)
                .getResultList();
        return rows.isEmpty() ? null : ((Number) rows.get(0)).intValue();
    }
}
