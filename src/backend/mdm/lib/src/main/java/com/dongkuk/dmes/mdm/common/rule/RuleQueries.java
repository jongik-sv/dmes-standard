package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import jakarta.persistence.EntityManager;
import java.util.List;
import org.springframework.stereotype.Repository;

/**
 * 06 룰 조회 전용(TSK-08-02 design §2.1-C, D12). 06 리포지토리 6개는 메서드를 선언하지 않으므로(TSK-08-01 가드) 조회는 여기에
 * JPQL 로 모은다. JPQL 은 SQLite·MSSQL 에서 같은 코드로 돈다. 버전 비교는 정수 VER 라 SQL 에서 해도 된다.
 */
@Repository
public class RuleQueries {

    private final EntityManager entityManager;

    public RuleQueries(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    /** 다른 룰들의 최신 RELEASED 버전(VER 최대) 결과 변수 — 변수 타입 해석 갈래 5(design §6.4). */
    public List<MdmRuleVar> latestReleasedResultVarsExcept(String ruleId) {
        return entityManager.createQuery("""
                SELECT v FROM MdmRuleVar v, MdmRuleVer r
                WHERE r.maruRuleId = v.maruRuleId AND r.ver = v.ver AND r.status = 'RELEASED' AND v.varKind = 'RESULT'
                  AND v.maruRuleId <> :ruleId
                  AND r.ver = (SELECT MAX(r2.ver) FROM MdmRuleVer r2 WHERE r2.maruRuleId = r.maruRuleId AND r2.status = 'RELEASED')
                ORDER BY v.maruRuleId, v.seq, v.varId
                """, MdmRuleVar.class).setParameter("ruleId", ruleId).getResultList();
    }
}
