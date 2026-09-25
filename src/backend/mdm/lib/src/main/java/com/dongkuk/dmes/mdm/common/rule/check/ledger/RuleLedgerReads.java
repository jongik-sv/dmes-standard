package com.dongkuk.dmes.mdm.common.rule.check.ledger;

import jakarta.persistence.EntityManager;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * MDM 참조 검사가 읽는 원장 — TB_MDM_CODE·TB_MDM_DATA 와 그 카테고리·추가 컬럼 라벨(06:339). 원장 조회는 검사 안에서만 한다(D7, D-077 —
 * {@code CodeLookup} 빈을 등록하지 않는다). 카테고리는 적용 구간과 무관하게 행이 있으면 있다고 본다.
 */
@Component
public class RuleLedgerReads {

    private final EntityManager entityManager;

    public RuleLedgerReads(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    public boolean codeExists(String maruCodeId) {
        return exists("SELECT COUNT(*) FROM TB_MDM_CODE WHERE MARU_CODE_ID = ?1", maruCodeId);
    }

    public boolean dataExists(String maruDataId) {
        return exists("SELECT COUNT(*) FROM TB_MDM_DATA WHERE MARU_DATA_ID = ?1", maruDataId);
    }

    public boolean codeCateExists(String maruCodeId, String cateId) {
        return exists("SELECT COUNT(*) FROM TB_MDM_CODE_CATE WHERE MARU_CODE_ID = ?1 AND CATE_ID = ?2", maruCodeId, cateId);
    }

    public boolean dataCateExists(String maruDataId, String cateId) {
        return exists("SELECT COUNT(*) FROM TB_MDM_DATA_CATE WHERE MARU_DATA_ID = ?1 AND CATE_ID = ?2", maruDataId, cateId);
    }

    /** 추가 컬럼 라벨({@code ATTRnn_NAME}). 없거나 비었으면 null. @param attrNo 1-10 */
    public String attrName(boolean code, String id, int attrNo) {
        if (attrNo < 1 || attrNo > 10) {
            throw new IllegalArgumentException("attr 번호는 1-10: " + attrNo);
        }
        String sql = code ? "SELECT ATTR%02d_NAME FROM TB_MDM_CODE WHERE MARU_CODE_ID = ?1" : "SELECT ATTR%02d_NAME FROM TB_MDM_DATA WHERE MARU_DATA_ID = ?1";
        List<?> rows = entityManager.createNativeQuery(String.format(sql, attrNo)).setParameter(1, id).getResultList();
        Object v = rows.isEmpty() ? null : rows.get(0);
        return v == null || String.valueOf(v).isBlank() ? null : String.valueOf(v);
    }

    private boolean exists(String sql, Object... args) {
        var q = entityManager.createNativeQuery(sql);
        for (int i = 0; i < args.length; i++) {
            q.setParameter(i + 1, args[i]);
        }
        return ((Number) q.getSingleResult()).longValue() > 0;
    }
}
