package com.dongkuk.dmes.mcm.cma.masterCodeSelPop.service;

import com.dongkuk.dmes.mcm.cma.masterCodeSelPop.dto.MasterCodeSelPopSearchRequest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 마스터코드 선택 팝업 OASIS Service Bean — 조회 전용 LoV.
 *
 * <p>설계서 정본 — {@code docs/mcm/design/masterCodeSelPop/} 5종:
 * <ul>
 *   <li>분석리포트 §6 SQL ID 매트릭스 + §9.1 VI_MCM_CODE_ACCESS 뷰</li>
 *   <li>기능설계서 §3 조회 기능</li>
 *   <li>디자인설계서 §4 결과 그리드 (5 컬럼)</li>
 *   <li>BPMN설계서 §3.1 search flow + §6.1 식별자 매핑</li>
 *   <li>정합체크서 §C SQL ID 일치 + §F To-Be 변환점</li>
 * </ul>
 *
 * <p>As-Is mybatis Mapper.xml (1 SELECT) 의 의도를 등가 native query 로 보존한다.
 * mcm 모듈은 SqlSession 미등록 (OASIS BPMN 전용 — frontend CLAUDE.md MUST) 이므로 mybatis Mapper.xml 직접 사용 ✗.
 * As-Is Mapper.xml 본문은 {@code persistence/cma/MasterCodeSelPopMapper.xml.asis} 에 참고용으로 보존 (Runtime 미사용).
 *
 * <p>SQL 변환점 (정합체크서 §F.1 / 분석리포트 §11):
 * <ul>
 *   <li>C-001 (Oracle {@code ||} → MSSQL {@code +}) — 본 Service 에서는 JDBC parameter binding 으로 처리</li>
 *   <li>C-002 (UPPER — 양 DBMS 호환)</li>
 *   <li>C-003 (As-Is Oracle PUBLIC SYNONYM {@code VI_MCM_CODE_ACCESS} → MSSQL schema 명시 {@code MCMAPUSER.VI_MCM_CODE_ACCESS} — 본 화면은 운영 read view 사용 / 2026-05-29 정정)</li>
 *   <li>뷰 DDL 본문 = 사용자 제공 정본 (분석리포트 §11.2) → DataInitializer 에서 MSSQL 변환 적용</li>
 * </ul>
 *
 * <p>OASIS 매핑 — {@code services/cma/masterCodeSelPop.bpmn}:
 * <pre>
 *   serviceTask searchTask camunda:class="masterCodeSelPopService"
 *     method = search
 *     dto    = com.dongkuk.dmes.mcm.cma.masterCodeSelPop.dto.MasterCodeSelPopSearchRequest
 *     output = items
 * </pre>
 */
@Service("masterCodeSelPopService")
public class MasterCodeSelPopService {

    @PersistenceContext
    private EntityManager em;

    /**
     * As-Is {@code MasterCodeSelPopMapper.GetCodeDetailList} 의 등가 native SQL.
     *
     * <p>As-Is Mapper.xml 본문 (분석리포트 §6 인용):
     * <pre>
     *   SELECT
     *       --MASTER_CODE
     *       CODE_VAL,
     *       CODE_VAL_MEAN,
     *       CATEGORY_ID,
     *       CATEGORY_NM
     *   FROM VI_MCM_CODE_ACCESS  &#47;* As-Is Oracle PUBLIC SYNONYM → MSSQL {@code MCMAPUSER.VI_MCM_CODE_ACCESS} *&#47;
     *   &lt;where&gt;
     *     &lt;if test='pCodeId != null and pCodeId != ""'&gt;
     *       AND UPPER(CODE_ID) = UPPER(#{pCodeId})
     *     &lt;/if&gt;
     *     &lt;if test='pDiv.equals("CODE_VAL")'&gt;
     *       AND UPPER(CODE_VAL) LIKE UPPER('%' || #{pValue} || '%')
     *     &lt;/if&gt;
     *     &lt;if test='pDiv.equals("CODE_VAL_MEAN")'&gt;
     *       AND UPPER(CODE_VAL_MEAN) LIKE UPPER('%' || #{pValue} || '%')
     *     &lt;/if&gt;
     *   &lt;/where&gt;
     *   --ORDER BY MASTER_CODE
     *   ORDER BY CODE_VAL
     * </pre>
     *
     * <p>To-Be 등가 — MSSQL 친화 LIKE binding (분석리포트 §11.1 C-001 적용).
     * VI_MCM_CODE_ACCESS 뷰 DDL = 사용자 제공 정본 (분석 §11.2) — {@code DataInitializer} 가 MSSQL 변환 후 초기 적재.
     * FROM 절에는 {@code MCMAPUSER.VI_MCM_CODE_ACCESS} 로 schema 를 명시한다 (MSSQL 은 Oracle PUBLIC SYNONYM 미지원, 2026-05-29 결정 (a)안).
     *
     * @param req {@link MasterCodeSelPopSearchRequest} pCodeId / pDiv / pValue
     * @return Grid 행 List — {@code [{CATEGORY_ID, CATEGORY_NM, CODE_VAL, CODE_VAL_MEAN}, ...]}
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> search(MasterCodeSelPopSearchRequest req) {
        // ── As-Is Mapper.xml 의 동적 where 절을 native SQL string 으로 등가 조립 ──
        StringBuilder sql = new StringBuilder(256);
        sql.append("SELECT ")
           .append("CODE_VAL, ")
           .append("CODE_VAL_MEAN, ")
           .append("CATEGORY_ID, ")
           .append("CATEGORY_NM ")
           .append("FROM MCMAPUSER.VI_MCM_CODE_ACCESS ");  // As-Is Oracle PUBLIC SYNONYM → MSSQL schema 명시 (2026-05-29 결정 a안)

        List<String> where = new ArrayList<>(3);
        if (req != null && req.getPCodeId() != null && !req.getPCodeId().isEmpty()) {
            // As-Is Mapper:16 — AND UPPER(CODE_ID) = UPPER(#{pCodeId})
            where.add("UPPER(CODE_ID) = UPPER(:pCodeId)");
        }
        if (req != null && "CODE_VAL".equals(req.getPDiv())) {
            // As-Is Mapper:19 — AND UPPER(CODE_VAL) LIKE UPPER('%' || #{pValue} || '%')
            // To-Be MSSQL 친화 — '%' + :pValue + '%' 는 binding 으로 흡수 (named param 단일).
            where.add("UPPER(CODE_VAL) LIKE UPPER(:pValueLike)");
        }
        if (req != null && "CODE_VAL_MEAN".equals(req.getPDiv())) {
            // As-Is Mapper:22 — AND UPPER(CODE_VAL_MEAN) LIKE UPPER('%' || #{pValue} || '%')
            where.add("UPPER(CODE_VAL_MEAN) LIKE UPPER(:pValueLike)");
        }
        if (!where.isEmpty()) {
            sql.append("WHERE ").append(String.join(" AND ", where)).append(' ');
        }
        sql.append("ORDER BY CODE_VAL");  // As-Is Mapper:26 (Mapper:25 주석 --ORDER BY MASTER_CODE 보존)

        // SqlResultSetMapping 의존 없이 plain native + manual column mapping.
        Query query = em.createNativeQuery(sql.toString());
        if (req != null && req.getPCodeId() != null && !req.getPCodeId().isEmpty()) {
            query.setParameter("pCodeId", req.getPCodeId());
        }
        if (req != null && ("CODE_VAL".equals(req.getPDiv()) || "CODE_VAL_MEAN".equals(req.getPDiv()))) {
            String v = req.getPValue() == null ? "" : req.getPValue();
            query.setParameter("pValueLike", "%" + v + "%");
        }

        List<Object[]> rawRows = (List<Object[]>) query.getResultList();
        List<Map<String, Object>> result = new ArrayList<>(rawRows.size());
        for (Object[] r : rawRows) {
            Map<String, Object> row = new LinkedHashMap<>(4);
            row.put("CODE_VAL",      r.length > 0 ? r[0] : null);
            row.put("CODE_VAL_MEAN", r.length > 1 ? r[1] : null);
            row.put("CATEGORY_ID",   r.length > 2 ? r[2] : null);
            row.put("CATEGORY_NM",   r.length > 3 ? r[3] : null);
            result.add(row);
        }
        return result;
    }
}
