package com.dongkuk.dmes.mcm.cmb.masterRuleDataList.service;

import com.dongkuk.dmes.mcm.cmb.masterRuleDataList.dto.MasterRuleDataListSearchRequest;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.repository.MasterRuleColListRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import jakarta.persistence.Tuple;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOfTrim;
import static com.dongkuk.dmes.mcm.common.util.McmValues.blankToNull;

/**
 * 업무기준 상세조회 — cmb/masterRuleDataList OASIS 서비스 (Spring bean = {@code masterRuleDataListService}).
 *
 * <p>★ <b>형제 화면 masterRuleData 의 조회 전용(read-only) 서브셋</b> (분석 §0) — 동적 테이블
 * {@code MCAAPUSER.TB_MCA_<업무기준ID>}(DDL on-demand — Q-001b)/동적 컬럼(컬럼정의 기반) 화면이나,
 * 저장 트랜잭션·채번·긴급적용·orphan SQL 이 전부 없다. action = search/lov/searchExport 3종.
 *
 * <p><b>동적 SQL 안전화 (Q-007 확정)</b> — masterRuleData 와 동일 패턴:
 * <ul>
 *   <li>테이블명 — pRuleId 형식 검증({@code ^[A-Za-z0-9_]{1,10}$}) 후 서버 재조립. pTable 은 대조만</li>
 *   <li>조건 컬럼(pWhereN) — 컬럼정의 메타 화이트리스트(COL_ID 집합 + RULE_VER/RULE_SEQ).
 *       COL_ID 자체도 식별자 형식 강제 (2차 stored injection 차단 — 형제 R0-3 리뷰 반영 동일)</li>
 *   <li>연산자(pOperatorN) — {@code LIKE / = / <= / >=} 화이트리스트 (As-Is 콤보 LoV 1:1)</li>
 *   <li>값(pValN) — 전부 파라미터 바인딩 (As-Is {@code UPPER('pValN')} 문자열 치환 제거)</li>
 * </ul>
 *
 * <p>Q-009 확정 (사용자 2026-06-05): As-Is Java 의 {@code pTable = context.get("pRuleId")}
 * 변수명 혼동은 To-Be 에서 의미대로 정정 — 본 서비스는 ruleId/table 을 분리 사용.
 *
 * <p>BPMN 3 action: search(5조건+페이징 — CTE+ROW_NUMBER, As-Is Mapper #2) /
 * lov(컬럼정의+PK판정 — As-Is Mapper #1, PK_YN 은 본 화면 그리드 빌드 미사용이나 As-Is SELECT 1:1 보존) /
 * searchExport(전건 — As-Is Mapper #3). VARCHAR2 조건은 {@code UPPER(col) op UPPER(:v)}
 * (BR-007 — As-Is java:54~82 대소문자 무시 검색).
 *
 * <p>가이드 §6-B-1: {@code @Transactional} 미사용 — OASIS process wrap (전 액션 읽기 전용).
 */
@Service("masterRuleDataListService")
public class MasterRuleDataListService {

    private static final String SCHEMA = "MCAAPUSER";
    private static final Pattern RULE_ID_PATTERN = Pattern.compile("^[A-Za-z0-9_]{1,10}$");
    /** Q-007 2차 방어 — 화이트리스트 원천(사용자 편집 가능한 컬럼정의)의 COL_ID 도 식별자 형식 강제. */
    private static final Pattern COL_ID_PATTERN = Pattern.compile("^[A-Z0-9_]{1,30}$");
    private static final Set<String> OPERATOR_WHITELIST = Set.of("LIKE", "=", "<=", ">=");
    /** 동적 테이블 고정 키 컬럼 (형제 masterRuleData pkColSet 동일). */
    private static final Set<String> PK_COL_SET = Set.of("RULE_VER", "RULE_SEQ");

    @PersistenceContext
    private EntityManager em;

    private final MasterRuleColListRepository colListRepository;

    public MasterRuleDataListService(MasterRuleColListRepository colListRepository) {
        this.colListRepository = colListRepository;
    }

    // ────────────────────────────── lov ──────────────────────────────

    /**
     * action=lov — 컬럼정의 + PK 판정 (As-Is GetRuleColList 1:1, 분석 §6.1 #1 — JOIN RULE_MASTER +
     * MASTER_CODE_DIV AS CODE_YN). 형제 masterRuleData 와 동일 SQL —
     * {@link MasterRuleColListRepository#searchRuleColDefsWithPk} 재사용.
     * 응답 = {@code { ds_GetRuleColList: [11키 대문자 rows], cnt }} (As-Is resultKey 보존).
     * CODE_YN 은 FE 마스터코드 셀(파란 밑줄·P-002 호출) 활성 판정에 사용 (BR-008).
     */
    public Map<String, Object> lov(MasterRuleDataListSearchRequest request) {
        String ruleId = requireRuleId(request);

        List<Object[]> raw = colListRepository.searchRuleColDefsWithPk(ruleId);
        String[] keys = {"RULE_ID", "COL_SEQ", "COL_ID", "COL_NM", "COL_LEN", "COL_PREC_LEN",
                "MES_COL_ID", "CODE_YN", "PK_YN", "COL_TYPE", "IO_FLAG"};
        List<Map<String, Object>> list = new ArrayList<>(raw.size());
        for (Object[] r : raw) {
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 0; i < keys.length; i++) row.put(keys[i], r[i]);
            list.add(row);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_GetRuleColList", list);
        out.put("cnt", list.size());
        return out;
    }

    // ────────────────────────────── search ──────────────────────────────

    /**
     * action=search — 동적 테이블 페이징 조회 (As-Is GetMasterRuleDataList.run() + Mapper #2).
     *
     * <p>CTE + ROW_NUMBER(ORDER BY RULE_SEQ) + BETWEEN 페이징 (As-Is 구조 보존 — Oracle·ANSI 공통, BR-009).
     * 5조건 동적 WHERE 는 화이트리스트 컬럼/연산자 + 바인딩 값 (Q-007). VARCHAR2 컬럼이면
     * {@code UPPER(col) op UPPER(:v)} (BR-007 — As-Is java:54~82).
     * 응답 = {@code { ds_GetMasterRuleDataList: [rows — 대문자 키 + SEQ/TOTALCOUNT], cnt, totalCount }}.
     */
    public Map<String, Object> search(MasterRuleDataListSearchRequest request) {
        String ruleId = requireRuleId(request);
        String table = qualifiedTable(ruleId);
        Map<String, String> typeMap = colTypeMap(ruleId);

        StringBuilder where = new StringBuilder();
        Map<String, String> binds = new LinkedHashMap<>();
        for (int n = 1; n <= 5; n++) {
            String col = blankToNull(request.where(n));
            if (col == null) continue;   // 미입력 조건 skip (As-Is if)
            col = col.trim().toUpperCase(Locale.ROOT);
            if (!typeMap.containsKey(col) && !PK_COL_SET.contains(col)) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "[" + col + "] 허용되지 않은 조건 컬럼입니다.");   // Q-007
            }
            String op = blankToNull(request.operator(n));
            op = op == null ? "LIKE" : op.trim().toUpperCase(Locale.ROOT);
            if (!OPERATOR_WHITELIST.contains(op)) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "[" + op + "] 허용되지 않은 연산자입니다.");     // Q-007
            }
            String bind = "v" + n;
            if ("VARCHAR2".equals(typeMap.get(col))) {
                where.append(" AND UPPER(").append(col).append(") ").append(op).append(" UPPER(:").append(bind).append(")");   // BR-007
            } else {
                where.append(" AND ").append(col).append(" ").append(op).append(" :").append(bind);
            }
            binds.put(bind, nvl(request.val(n)));
        }

        int pageRow = request.getCountPerPage() == null || request.getCountPerPage() <= 0 ? 30 : request.getCountPerPage();
        int pageNum = request.getCurrentPage() == null || request.getCurrentPage() <= 0 ? 1 : request.getCurrentPage();

        String sql = "WITH TB1 AS (SELECT ROW_NUMBER() OVER(ORDER BY RULE_SEQ) AS SEQ, T.* FROM " + table + " T WHERE 1=1" + where + ") "
                + "SELECT (SELECT COUNT(*) FROM TB1) AS TOTALCOUNT, TB1.* FROM TB1 "
                + "WHERE SEQ BETWEEN ((:pageNum-1)*:pageRow)+1 AND (:pageNum*:pageRow) ORDER BY SEQ";
        Query q = em.createNativeQuery(sql, Tuple.class);
        binds.forEach(q::setParameter);
        q.setParameter("pageNum", pageNum);
        q.setParameter("pageRow", pageRow);

        List<Map<String, Object>> list = toRows(q);
        long totalCount;
        if (!list.isEmpty()) {
            totalCount = ((Number) list.get(0).get("TOTALCOUNT")).longValue();
        } else if (pageNum > 1) {
            // 범위 밖 페이지 — 빈 결과여도 실제 건수로 보정 (형제 R0-3 리뷰 반영 동일)
            Query cq = em.createNativeQuery("SELECT COUNT(*) FROM " + table + " T WHERE 1=1" + where);
            binds.forEach(cq::setParameter);
            totalCount = ((Number) cq.getSingleResult()).longValue();
        } else {
            totalCount = 0L;
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_GetMasterRuleDataList", list);
        out.put("cnt", list.size());
        out.put("totalCount", totalCount);
        return out;
    }

    // ────────────────────────────── search_export ──────────────────────────────

    /**
     * action=searchExport — 전건 조회 (As-Is GetMasterRuleDataListExport #3 — 페이징 없음, ORDER BY RULE_SEQ).
     * 응답 = {@code { ds_GetMasterRuleDataListExport: [...], cnt }} (As-Is resultKey 보존).
     */
    public Map<String, Object> searchExport(MasterRuleDataListSearchRequest request) {
        String ruleId = requireRuleId(request);
        String table = qualifiedTable(ruleId);

        Query q = em.createNativeQuery("SELECT * FROM " + table + " ORDER BY RULE_SEQ", Tuple.class);
        List<Map<String, Object>> list = toRows(q);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_GetMasterRuleDataListExport", list);
        out.put("cnt", list.size());
        return out;
    }

    // ────────────────────────────── helpers ──────────────────────────────

    /** ruleId 필수(BR-001 서버 가드) + 형식 검증(Q-007 — 테이블명 조립 안전) + pTable 대조. Q-009 — 의미대로 분리. */
    private String requireRuleId(MasterRuleDataListSearchRequest request) {
        String ruleId = request == null ? null : blankToNull(request.getPRuleId());
        if (ruleId == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "업무기준 ID는 필수입니다.");   // MSG-001
        }
        ruleId = ruleId.trim().toUpperCase(Locale.ROOT);
        if (!RULE_ID_PATTERN.matcher(ruleId).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "[" + ruleId + "] 업무기준 ID 형식이 올바르지 않습니다.");
        }
        String pTable = request == null ? null : blankToNull(request.getPTable());
        if (pTable != null && !pTable.trim().equalsIgnoreCase("TB_MCA_" + ruleId)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "[" + pTable + "] 대상 테이블이 업무기준과 일치하지 않습니다.");   // Q-007
        }
        return ruleId;
    }

    /** 검증된 ruleId 로 서버가 직접 조립한 정규화 테이블명 (Q-007). */
    private String qualifiedTable(String ruleId) {
        return SCHEMA + ".TB_MCA_" + ruleId;
    }

    /** 컬럼정의 메타 — COL_ID(대문자, 식별자 형식 강제) → COL_TYPE. 비어 있으면 컬럼정의 미등록 (BUSINESS_ERROR). */
    private Map<String, String> colTypeMap(String ruleId) {
        List<Object[]> defs = colListRepository.searchRuleColDefsWithPk(ruleId);
        if (defs.isEmpty()) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                    "[" + ruleId + "] 업무기준의 컬럼정의(TB_MCA_RULE_COL_LIST)가 없습니다.");
        }
        Map<String, String> map = new LinkedHashMap<>();
        for (Object[] d : defs) {
            String colId = String.valueOf(d[2]).toUpperCase(Locale.ROOT);
            if (!COL_ID_PATTERN.matcher(colId).matches()) {
                // Q-007 2차 방어 — 컬럼정의는 화면(masterRuleFrame)에서 편집 가능하므로
                // COL_ID 자체를 식별자 형식으로 강제해야 WHERE 조립이 안전하다.
                throw new BusinessException(ErrorCode.INVALID_VALUE,
                        "[" + colId + "] 컬럼정의 COL_ID 가 식별자 형식이 아닙니다.");
            }
            map.put(colId, strOfTrim(d[9]));   // COL_ID → COL_TYPE
        }
        return map;
    }

    /** Tuple 결과 → 대문자 컬럼 키 유지 Map rows (동적 컬럼 — camelCase 변환 ✗). */
    private static List<Map<String, Object>> toRows(Query q) {
        @SuppressWarnings("unchecked")
        List<Tuple> tuples = q.getResultList();
        List<Map<String, Object>> list = new ArrayList<>(tuples.size());
        for (Tuple t : tuples) {
            Map<String, Object> row = new LinkedHashMap<>();
            t.getElements().forEach(el -> row.put(el.getAlias().toUpperCase(Locale.ROOT), t.get(el)));
            list.add(row);
        }
        return list;
    }

    private static String nvl(String s) {
        return s == null ? "" : s.trim();
    }

}
