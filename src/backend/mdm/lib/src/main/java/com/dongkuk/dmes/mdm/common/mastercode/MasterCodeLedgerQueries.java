package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSummary.VerRow;
import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 마루 코드 원장 조회 모델(TSK-06-02 design.md §6.4) — 04 표를 네이티브로 읽는 읽기 전용 부품. 06-03·06-04·06-05 가
 * 재사용한다.
 *
 * <p>규칙(VersionRowStore 와 같다, 규칙표 #17·#16):
 * <ul>
 *   <li>버전 칼럼은 {@code CAST(… AS VARCHAR(40))} 로 읽어 {@code new BigDecimal(s).setScale(3)} 한다(SQLite NUMERIC
 *       친화도는 1.000 을 INTEGER, 1.001 을 REAL 로 저장한다).</li>
 *   <li>버전 범위 비교·정렬은 Java 에서 한다(I20). SQL 은 등호 조건만 쓴다.</li>
 *   <li>일시는 {@link MdmTemporalBinder#fromDb} 로 읽는다.</li>
 *   <li>공통 서비스의 네이티브 UPDATE 뒤에도 최신 값을 보도록 트랜잭션 안이면 먼저 flush 한다(F11, I23). 엔진 조회
 *       ({@link MdmCodeLookup})는 트랜잭션 밖에서도 부르므로 트랜잭션이 없으면 flush 하지 않는다.</li>
 * </ul>
 */
@Component
public class MasterCodeLedgerQueries {

    private static final int SCALE = 3;
    private static final int ATTR_SLOTS = 10;
    private static final int LVL_SLOTS = 5;

    private final EntityManager entityManager;
    private final MdmTemporalBinder temporal;

    public MasterCodeLedgerQueries(EntityManager entityManager, MdmTemporalBinder temporal) {
        this.entityManager = entityManager;
        this.temporal = temporal;
    }

    /** TB_MDM_CODE 한 행. {@code attrNames} 는 ATTR01_NAME~ATTR10_NAME(길이 10). {@code auditVer} 는 감사 카운터 VER. */
    public record Header(String maruCodeId, String maruCodeName, String status, String sourceKind, String description,
                         int lvlCnt, List<String> attrNames, Long auditVer) {
    }

    /** keyword 가 비면 전체. ID 는 대소문자 무시, 이름은 부분 일치. ID 오름차순. */
    public List<Header> headers(String keyword) {
        String sql = headerSelect();
        boolean filtered = keyword != null && !keyword.isBlank();
        if (filtered) {
            sql += " WHERE UPPER(MARU_CODE_ID) LIKE :kw ESCAPE '\\' OR UPPER(MARU_CODE_NAME) LIKE :kw ESCAPE '\\'";
        }
        sql += " ORDER BY MARU_CODE_ID";
        NativeQuery<?> q = query(sql);
        if (filtered) {
            q.setParameter("kw", "%" + escapeLike(keyword.trim().toUpperCase(Locale.ROOT)) + "%");
        }
        List<Header> out = new ArrayList<>();
        for (Object row : q.getResultList()) {
            out.add(toHeader((Object[]) row));
        }
        return out;
    }

    public Optional<Header> header(String maruCodeId) {
        List<?> rows = query(headerSelect() + " WHERE MARU_CODE_ID = :id").setParameter("id", maruCodeId).getResultList();
        return rows.isEmpty() ? Optional.empty() : Optional.of(toHeader((Object[]) rows.get(0)));
    }

    /** 코드별 버전 행(ver 내림차순). ids 가 비면 쿼리하지 않는다. */
    public Map<String, List<VerRow>> versions(Collection<String> ids) {
        Map<String, List<VerRow>> out = new LinkedHashMap<>();
        if (ids.isEmpty()) {
            return out;
        }
        for (String id : ids) {
            out.put(id, new ArrayList<>());
        }
        List<String> all = List.copyOf(ids);
        for (int from = 0; from < all.size(); from += 1000) {
            List<String> chunk = all.subList(from, Math.min(all.size(), from + 1000));
            List<?> rows = query(versionSelect() + " WHERE MARU_CODE_ID IN (:ids)")
                    .setParameterList("ids", chunk).getResultList();
            for (Object row : rows) {
                Object[] r = (Object[]) row;
                out.computeIfAbsent((String) r[0], k -> new ArrayList<>()).add(toVerRow(r));
            }
        }
        out.values().forEach(list -> list.sort(Comparator.comparing(VerRow::ver).reversed()));
        return out;
    }

    public List<VerRow> versions(String maruCodeId) {
        return versions(List.of(maruCodeId)).getOrDefault(maruCodeId, List.of());
    }

    /**
     * {@code after} 보다 {@code TO_VER} 가 큰 코드 행(after 가 null 이면 모든 행) 중 값이 있는 가장 큰 LVL 칸 번호. 없으면 0.
     * 계층 칸 수 줄이기 검사의 기준이다(I19). 범위 비교는 Java 에서 한다(I20).
     */
    public int maxLvlInUse(String maruCodeId, BigDecimal after) {
        List<?> rows = query("SELECT CAST(TO_VER AS VARCHAR(40)), LVL1, LVL2, LVL3, LVL4, LVL5 FROM TB_MDM_CODE_ITEM"
                + " WHERE MARU_CODE_ID = :id").setParameter("id", maruCodeId).getResultList();
        int max = 0;
        for (Object row : rows) {
            Object[] r = (Object[]) row;
            BigDecimal toVer = ver(r[0]);
            if (after != null && toVer.compareTo(after) <= 0) {
                continue;
            }
            for (int slot = LVL_SLOTS; slot > max; slot--) {
                Object value = r[slot];
                if (value != null && !value.toString().isBlank()) {
                    max = slot;
                    break;
                }
            }
        }
        return max;
    }

    /** TB_MDM_CODE_ITEM 한 행. {@code lvl} 길이 5, {@code attrs} 길이 10(빈 칸 null). */
    public record ItemRow(String code, BigDecimal fromVer, BigDecimal toVer, String name, String alterName, Integer seq,
                          String description, List<String> lvl, List<String> attrs) {
    }

    /** TB_MDM_CODE_CATE 한 행. */
    public record CateRow(String cateId, BigDecimal fromVer, BigDecimal toVer, String cateName, String defKind,
                          String defExpr, String defTarget, String description) {
    }

    /** TB_MDM_CODE_CATE_ITEM 한 행. */
    public record CateItemRow(String cateId, String code, BigDecimal fromVer, BigDecimal toVer) {
    }

    /** 코드의 모든 코드 행(선분 전부, 코드·from 오름차순). 버전 선택은 호출자가 Java 에서 한다(I20). */
    public List<ItemRow> items(String maruCodeId) {
        StringBuilder sql = new StringBuilder("SELECT CODE, CAST(FROM_VER AS VARCHAR(40)), CAST(TO_VER AS VARCHAR(40)),"
                + " NAME, ALTER_NAME, SEQ, DESCRIPTION, LVL1, LVL2, LVL3, LVL4, LVL5");
        for (int i = 1; i <= ATTR_SLOTS; i++) {
            sql.append(", ATTR").append(i < 10 ? "0" : "").append(i);
        }
        sql.append(" FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = :id");
        List<ItemRow> out = new ArrayList<>();
        for (Object row : query(sql.toString()).setParameter("id", maruCodeId).getResultList()) {
            Object[] r = (Object[]) row;
            List<String> lvl = new ArrayList<>(LVL_SLOTS);
            for (int i = 0; i < LVL_SLOTS; i++) {
                lvl.add((String) r[7 + i]);
            }
            List<String> attrs = new ArrayList<>(ATTR_SLOTS);
            for (int i = 0; i < ATTR_SLOTS; i++) {
                attrs.add((String) r[7 + LVL_SLOTS + i]);
            }
            out.add(new ItemRow((String) r[0], ver(r[1]), ver(r[2]), (String) r[3], (String) r[4],
                    r[5] == null ? null : ((Number) r[5]).intValue(), (String) r[6],
                    Collections.unmodifiableList(lvl), Collections.unmodifiableList(attrs)));
        }
        out.sort(Comparator.comparing(ItemRow::code).thenComparing(ItemRow::fromVer));
        return out;
    }

    public List<CateRow> cates(String maruCodeId) {
        List<CateRow> out = new ArrayList<>();
        for (Object row : query("SELECT CATE_ID, CAST(FROM_VER AS VARCHAR(40)), CAST(TO_VER AS VARCHAR(40)), CATE_NAME,"
                + " DEF_KIND, DEF_EXPR, DEF_TARGET, DESCRIPTION FROM TB_MDM_CODE_CATE WHERE MARU_CODE_ID = :id")
                .setParameter("id", maruCodeId).getResultList()) {
            Object[] r = (Object[]) row;
            out.add(new CateRow((String) r[0], ver(r[1]), ver(r[2]), (String) r[3], (String) r[4], (String) r[5],
                    (String) r[6], (String) r[7]));
        }
        out.sort(Comparator.comparing(CateRow::cateId).thenComparing(CateRow::fromVer));
        return out;
    }

    public List<CateItemRow> cateItems(String maruCodeId) {
        List<CateItemRow> out = new ArrayList<>();
        for (Object row : query("SELECT CATE_ID, CODE, CAST(FROM_VER AS VARCHAR(40)), CAST(TO_VER AS VARCHAR(40))"
                + " FROM TB_MDM_CODE_CATE_ITEM WHERE MARU_CODE_ID = :id").setParameter("id", maruCodeId).getResultList()) {
            Object[] r = (Object[]) row;
            out.add(new CateItemRow((String) r[0], (String) r[1], ver(r[2]), ver(r[3])));
        }
        out.sort(Comparator.comparing(CateItemRow::cateId).thenComparing(CateItemRow::code)
                .thenComparing(CateItemRow::fromVer));
        return out;
    }

    // ── 공용 조각 ──

    NativeQuery<?> query(String sql) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            entityManager.flush();
        }
        return entityManager.createNativeQuery(sql).unwrap(NativeQuery.class);
    }

    static BigDecimal ver(Object value) {
        return value == null ? null : new BigDecimal(value.toString().trim()).setScale(SCALE);
    }

    private static String headerSelect() {
        StringBuilder sb = new StringBuilder("SELECT MARU_CODE_ID, MARU_CODE_NAME, STATUS, SOURCE_KIND, DESCRIPTION, LVL_CNT");
        for (int i = 1; i <= ATTR_SLOTS; i++) {
            sb.append(", ATTR").append(i < 10 ? "0" : "").append(i).append("_NAME");
        }
        return sb.append(", VER FROM TB_MDM_CODE").toString();
    }

    private static String versionSelect() {
        return "SELECT MARU_CODE_ID, CAST(VER AS VARCHAR(40)), VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO,"
                + " RELEASED_AT, CAST(RESTORED_FROM AS VARCHAR(40)), ROW_VERSION, DESCRIPTION FROM TB_MDM_CODE_VER";
    }

    private static Header toHeader(Object[] r) {
        List<String> attrs = new ArrayList<>(ATTR_SLOTS);
        for (int i = 0; i < ATTR_SLOTS; i++) {
            attrs.add((String) r[6 + i]);
        }
        Object audit = r[6 + ATTR_SLOTS];
        return new Header((String) r[0], (String) r[1], (String) r[2], (String) r[3], (String) r[4],
                ((Number) r[5]).intValue(), Collections.unmodifiableList(attrs),
                audit == null ? null : ((Number) audit).longValue());
    }

    private VerRow toVerRow(Object[] r) {
        return new VerRow(ver(r[1]), (String) r[2], (String) r[3], (String) r[4],
                temporal.fromDb(r[5]), temporal.fromDb(r[6]), temporal.fromDb(r[7]), ver(r[8]),
                ((Number) r[9]).longValue(), (String) r[10]);
    }

    /** LIKE 패턴 문자({@code % _ [ \})를 {@code \} 로 가린다({@code ESCAPE '\'}). */
    private static String escapeLike(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        for (char c : s.toCharArray()) {
            if (c == '%' || c == '_' || c == '[' || c == '\\') {
                sb.append('\\');
            }
            sb.append(c);
        }
        return sb.toString();
    }
}
