package com.dongkuk.dmes.mdm.common.segment;

import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.hibernate.query.NativeQuery;

/**
 * {@code TB_MDM_DATA} 머리 한 행을 네이티브로 읽는 한 곳(BE 리팩토링 2회차 C7). 잠금 뒤 재조회({@link DataSegmentLock})와 항목
 * 관리·카테고리 편집 화면의 머리 조회가 같이 쓴다.
 *
 * <p>라벨({@code ATTRnn_NAME})은 DB 값 그대로 돌려준다. 다듬는 방식은 호출자마다 달라 호출자가 정한다. 문 하나(SELECT)만 내고
 * 직접 flush 하지 않는다. 잠금도 걸지 않는다.
 */
public final class MaruDataHeaderReads {

    private static final String SQL = "SELECT MARU_DATA_ID, MARU_DATA_NAME, STATUS, SOURCE_KIND, SOURCE_SYSTEM, CODE_PATTERN, "
            + "LVL_CNT, ATTR01_NAME, ATTR02_NAME, ATTR03_NAME, ATTR04_NAME, ATTR05_NAME, ATTR06_NAME, ATTR07_NAME, "
            + "ATTR08_NAME, ATTR09_NAME, ATTR10_NAME FROM TB_MDM_DATA WHERE MARU_DATA_ID = :md";

    /**
     * 머리 한 행. {@code attrNames} 는 번호 순 10개이고 DB 값 그대로다(없으면 null, 공백도 그대로). 목록은 바꿀 수 없다.
     */
    public record Header(String maruDataId, String maruDataName, String status, String sourceKind, String sourceSystem,
                         String codePattern, int lvlCnt, List<String> attrNames) {
    }

    private MaruDataHeaderReads() {
    }

    /** 없는 마루 데이터면 null. */
    public static Header find(EntityManager entityManager, String maruDataId) {
        List<?> found = entityManager.createNativeQuery(SQL).unwrap(NativeQuery.class)
                .setParameter("md", maruDataId, String.class)
                .getResultList();
        if (found.isEmpty()) {
            return null;
        }
        Object[] r = (Object[]) found.get(0);
        List<String> attrNames = new ArrayList<>(DataItemValue.ATTR_COUNT);
        for (int i = 0; i < DataItemValue.ATTR_COUNT; i++) {
            attrNames.add((String) r[7 + i]);
        }
        return new Header((String) r[0], (String) r[1], (String) r[2], (String) r[3], (String) r[4], (String) r[5],
                ((Number) r[6]).intValue(), Collections.unmodifiableList(attrNames));
    }
}
