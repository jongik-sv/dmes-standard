package com.dongkuk.dmes.mdm.common.dictionary;

import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * 도메인 영향도·컬럼 사전 네이티브 조회(TSK-04-03 design.md §3.6). 모두 {@code EntityManager.createNativeQuery} 로
 * 요청 트랜잭션의 커넥션에서 읽는다(불변 I11). 재귀 CTE 는 두 방언 공통 문안이다 — {@code RECURSIVE} 키워드 없음, 앵커와
 * 재귀부 칼럼 타입 동일, 깊이 가드 50(MSSQL 기본 MAXRECURSION 100 보다 작다, 불변 I13).
 *
 * <p>02 자신의 테이블({@code TB_MDM_DOMAIN}·{@code TB_MDM_COLUMN})만 읽는다. 03·06 참조는
 * {@code MdmDomainReferenceSpi} 로만 받는다(불변 I12, D1).
 */
@Component
public class DomainImpactQueries {

    /** 하위 트리(자기 포함) + 참조 컬럼. */
    public static final String SUBTREE_SQL = """
            WITH SUBTREE (DOMAIN_ID, DEPTH) AS (
                SELECT DOMAIN_ID, 0 FROM TB_MDM_DOMAIN WHERE DOMAIN_ID = :domainId
                UNION ALL
                SELECT d.DOMAIN_ID, s.DEPTH + 1 FROM TB_MDM_DOMAIN d JOIN SUBTREE s ON d.PARENT_DOMAIN_ID = s.DOMAIN_ID
                WHERE s.DEPTH < 50
            )
            SELECT s.DOMAIN_ID, s.DEPTH, c.COLUMN_ID, c.COLUMN_NAME, c.PHYS_NAME
            FROM SUBTREE s LEFT JOIN TB_MDM_COLUMN c ON c.DOMAIN_ID = s.DOMAIN_ID
            ORDER BY s.DEPTH, s.DOMAIN_ID, c.COLUMN_ID
            """;

    /** 조상 체인(자기 포함) — 위로 올라간다. 깊이 50 행이 나오면 순환 데이터다. */
    public static final String ANCESTORS_SQL = """
            WITH ANCESTORS (DOMAIN_ID, PARENT_DOMAIN_ID, DEPTH) AS (
                SELECT DOMAIN_ID, PARENT_DOMAIN_ID, 0 FROM TB_MDM_DOMAIN WHERE DOMAIN_ID = :domainId
                UNION ALL
                SELECT d.DOMAIN_ID, d.PARENT_DOMAIN_ID, a.DEPTH + 1 FROM TB_MDM_DOMAIN d JOIN ANCESTORS a ON d.DOMAIN_ID = a.PARENT_DOMAIN_ID
                WHERE a.DEPTH < 50
            )
            SELECT DOMAIN_ID, DEPTH FROM ANCESTORS ORDER BY DEPTH
            """;

    /** 컬럼 사전 물리명 → 논리명(대소문자 무시, R05·요구 변수 표). */
    public static final String COLUMNS_BY_PHYS_SQL =
            "SELECT PHYS_NAME, COLUMN_NAME FROM TB_MDM_COLUMN WHERE UPPER(PHYS_NAME) IN (:names)";

    public static final List<String> ALL_SQL = List.of(SUBTREE_SQL, ANCESTORS_SQL, COLUMNS_BY_PHYS_SQL);

    private final EntityManager entityManager;

    public DomainImpactQueries(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    public List<SubtreeRow> subtree(Long domainId) {
        List<SubtreeRow> out = new ArrayList<>();
        for (Object[] r : rows(entityManager.createNativeQuery(SUBTREE_SQL).setParameter("domainId", domainId).getResultList())) {
            out.add(new SubtreeRow(toLong(r[0]), toLong(r[1]).intValue(), toLong(r[2]), (String) r[3], (String) r[4]));
        }
        return out;
    }

    public List<AncestorRow> ancestors(Long domainId) {
        List<AncestorRow> out = new ArrayList<>();
        for (Object[] r : rows(entityManager.createNativeQuery(ANCESTORS_SQL).setParameter("domainId", domainId).getResultList())) {
            out.add(new AncestorRow(toLong(r[0]), toLong(r[1]).intValue()));
        }
        return out;
    }

    /** 키 = 대문자 물리명, 값 = 논리명(컬럼명). 없는 이름은 빠진다. */
    public Map<String, String> columnNamesByPhysName(Collection<String> physNames) {
        Map<String, String> out = new LinkedHashMap<>();
        List<String> upper = physNames.stream().filter(n -> n != null && !n.isBlank())
                .map(n -> n.toUpperCase(Locale.ROOT)).distinct().toList();
        if (upper.isEmpty()) {
            return out;
        }
        for (Object[] r : rows(entityManager.createNativeQuery(COLUMNS_BY_PHYS_SQL).setParameter("names", upper).getResultList())) {
            out.put(((String) r[0]).toUpperCase(Locale.ROOT), (String) r[1]);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private static List<Object[]> rows(List<?> raw) {
        return (List<Object[]>) raw;
    }

    private static Long toLong(Object o) {
        return o == null ? null : ((Number) o).longValue();
    }

    public record SubtreeRow(Long domainId, int depth, Long columnId, String columnName, String physName) {}

    public record AncestorRow(Long domainId, int depth) {}
}
