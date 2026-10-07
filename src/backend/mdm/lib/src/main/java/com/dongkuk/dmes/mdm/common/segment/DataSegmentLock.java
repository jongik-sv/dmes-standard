package com.dongkuk.dmes.mdm.common.segment;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Component;

/**
 * 마루 데이터 행 잠금 — spec "TB_MDM_DATA 행 잠금으로 같은 마루 데이터의 동시 저장 직렬화"(L1~L3, D6).
 *
 * <p>잠금 문은 값을 바꾸지 않는 자기 대입 UPDATE 다(L2). 방언 중립 문안이고, Oracle 은 커밋까지 그 행에 쓰기 잠금을 쥐어
 * 같은 마루 데이터의 사건을 직렬화한다(SQLite 시절에는 DB 전체 쓰기 잠금으로 직렬화됐다). 배포 순번 발급(PRD §2 규칙 7 보류)이
 * 풀리면 이 문을 {@code LAST_CHG_SEQ + 1} 로 바꾸기만 하면 된다(05 「배포 순번」).
 *
 * <p>0행이면 없는 마루 데이터로 거부한다(L3). 잠금 뒤 같은 행을 네이티브로 다시 읽어 돌려준다 — 검사는 이 값으로 한다(L1).
 * 호출자 트랜잭션 안에서만 쓴다.
 */
@Component
public class DataSegmentLock {

    /** L2 — 쓰기 문이고 값을 바꾸지 않는다. */
    public static final String LOCK_SQL =
            "UPDATE TB_MDM_DATA SET LAST_CHG_SEQ = LAST_CHG_SEQ WHERE MARU_DATA_ID = :id";

    private static final String READ_SQL = "SELECT MARU_DATA_ID, STATUS, SOURCE_KIND, SOURCE_SYSTEM, CODE_PATTERN, LVL_CNT, "
            + "ATTR01_NAME, ATTR02_NAME, ATTR03_NAME, ATTR04_NAME, ATTR05_NAME, ATTR06_NAME, ATTR07_NAME, ATTR08_NAME, "
            + "ATTR09_NAME, ATTR10_NAME FROM TB_MDM_DATA WHERE MARU_DATA_ID = :id";

    private final EntityManager entityManager;

    public DataSegmentLock(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    public LockedMaruData lock(String maruDataId) {
        entityManager.flush();
        int locked = entityManager.createNativeQuery(LOCK_SQL).unwrap(NativeQuery.class)
                .setParameter("id", maruDataId, String.class)
                .executeUpdate();
        if (locked == 0) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, DataItemMessages.NO_MARU_DATA + ": " + maruDataId, List.of());
        }
        Object[] r = (Object[]) entityManager.createNativeQuery(READ_SQL).unwrap(NativeQuery.class)
                .setParameter("id", maruDataId, String.class)
                .getSingleResult();
        List<String> attrNames = new ArrayList<>(DataItemValue.ATTR_COUNT);
        for (int i = 0; i < DataItemValue.ATTR_COUNT; i++) {
            attrNames.add(DataItemValue.clean((String) r[6 + i]));
        }
        return new LockedMaruData((String) r[0], (String) r[1], (String) r[2], (String) r[3], (String) r[4],
                ((Number) r[5]).intValue(), Collections.unmodifiableList(attrNames));
    }
}
