package com.dongkuk.dmes.mcm.csa.commObjMng.support;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * 권한 관리 옛 화면 4종 서비스 시험 공통 기반 — Oracle 시험 PDB 의 실제 저장소 + 컴포넌트 스캔한 서비스 빈.
 *
 * <p>시험은 공개 메서드 반환 Map 의 키·값과 DB 에 남은 결과·발행 이벤트만 본다.
 * 서비스 호출 하나는 {@link #inTx(Supplier)} 로 트랜잭션 하나 안에서 돌린다(운영의 BPMN 프로세스 단위 트랜잭션과 같다).
 * 확인은 저장소를 트랜잭션 밖에서 불러 새 영속성 컨텍스트로 다시 읽는다.
 */
@SpringJUnitConfig(CommSecMngJpaTestConfig.class)
public abstract class CommSecMngJpaTestBase {

    @Autowired protected CommSecMngFixtures fx;
    @Autowired protected SecEventCollector events;
    @Autowired protected TransactionTemplate tx;

    @BeforeEach
    void setUpBase() {
        fx.clearAll();
        events.clear();
    }

    /** 서비스 호출 하나 = 트랜잭션 하나. */
    protected <T> T inTx(Supplier<T> call) {
        return tx.execute(status -> call.get());
    }

    protected static Map<String, Object> row(Object... kv) {
        return CommSecMngFixtures.row(kv);
    }

    @SuppressWarnings("unchecked")
    protected static List<Map<String, Object>> grid(Map<String, Object> out, String key) {
        return (List<Map<String, Object>>) out.get(key);
    }
}
