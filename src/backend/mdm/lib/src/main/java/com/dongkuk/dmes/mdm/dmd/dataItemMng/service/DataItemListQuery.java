package com.dongkuk.dmes.mdm.dmd.dataItemMng.service;

import com.dongkuk.dmes.mdm.common.segment.CateSegmentRow;
import com.dongkuk.dmes.mdm.common.segment.DataCategoryResolver;
import com.dongkuk.dmes.mdm.common.segment.DataCateValue;
import com.dongkuk.dmes.mdm.common.segment.DataSegmentRowStore;
import com.dongkuk.dmes.mdm.common.segment.ItemSegmentRow;
import com.dongkuk.dmes.mdm.common.segment.LockedMaruData;
import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.contract.category.CategoryConventions;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentRules;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.AttrLabel;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.CategoryOption;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemHeader;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.MaruDataOption;
import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Repository;

/**
 * 항목 관리 목록·머리 네이티브 쿼리(design.md §2, Q1~Q6). 읽기 전용이다.
 *
 * <ul>
 *   <li>Q1 — 목록 행은 키별 마지막 행(valid_from 최대)이다. {@code showClosed} 가 아니면 열린 키만.</li>
 *   <li>Q2 — 정렬은 seq(NULL 뒤) → code. MSSQL 페이징은 ORDER BY 가 있어야 하므로 늘 정렬한다.</li>
 *   <li>Q3 — 키는 대소문자 무시 부분 일치, 이름은 부분 일치. {@code %}·{@code _}·{@code \}·{@code [} 는 이스케이프한다
 *       ({@code [} 는 MSSQL LIKE 문자 집합). totalCount 는 모든 필터 뒤 수.</li>
 *   <li>Q4 — BASE 는 전체, TABLE 은 열린 소속 행, REGEX 는 서버 Java {@code Pattern.matches}(대상 칸 NULL 은 불일치, SQL 에
 *       정규식을 쓰지 않는다 — 05 「카테고리 정의 방식」). 닫힌 키는 카테고리 필터를 거치지 않는다(시안 renderItems).</li>
 * </ul>
 */
@Repository
public class DataItemListQuery {

    /** 한 쪽의 행과 모든 필터 뒤 총 건수. */
    public record Page(List<ItemSegmentRow> rows, long total) {
    }

    private static final String LATEST = " FROM TB_MDM_DATA_ITEM i WHERE i.MARU_DATA_ID = :md AND NOT EXISTS ("
            + "SELECT 1 FROM TB_MDM_DATA_ITEM x WHERE x.MARU_DATA_ID = i.MARU_DATA_ID AND x.CODE = i.CODE "
            + "AND x.VALID_FROM > i.VALID_FROM)";
    private static final String ORDER = " ORDER BY CASE WHEN i.SEQ IS NULL THEN 1 ELSE 0 END, i.SEQ, i.CODE";

    private final EntityManager entityManager;
    private final MdmTemporalBinder temporal;
    private final DataSegmentRowStore rowStore;

    public DataItemListQuery(EntityManager entityManager, MdmTemporalBinder temporal, DataSegmentRowStore rowStore) {
        this.entityManager = entityManager;
        this.temporal = temporal;
        this.rowStore = rowStore;
    }

    public List<MaruDataOption> maruDataOptions() {
        List<MaruDataOption> out = new ArrayList<>();
        for (Object o : entityManager.createNativeQuery("SELECT MARU_DATA_ID, MARU_DATA_NAME, STATUS, SOURCE_KIND "
                + "FROM TB_MDM_DATA ORDER BY MARU_DATA_ID").getResultList()) {
            Object[] r = (Object[]) o;
            out.add(new MaruDataOption((String) r[0], (String) r[1], (String) r[2], (String) r[3]));
        }
        return out;
    }

    /** 머리 — 없는 마루 데이터면 null. */
    public DataItemHeader header(String maruDataId) {
        List<?> found = entityManager.createNativeQuery("SELECT MARU_DATA_ID, MARU_DATA_NAME, STATUS, SOURCE_KIND, "
                        + "SOURCE_SYSTEM, LVL_CNT, ATTR01_NAME, ATTR02_NAME, ATTR03_NAME, ATTR04_NAME, ATTR05_NAME, "
                        + "ATTR06_NAME, ATTR07_NAME, ATTR08_NAME, ATTR09_NAME, ATTR10_NAME FROM TB_MDM_DATA "
                        + "WHERE MARU_DATA_ID = :md").unwrap(NativeQuery.class)
                .setParameter("md", maruDataId, String.class)
                .getResultList();
        if (found.isEmpty()) {
            return null;
        }
        Object[] r = (Object[]) found.get(0);
        List<AttrLabel> labels = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            String label = (String) r[6 + i];
            if (label != null && !label.isBlank()) {
                labels.add(new AttrLabel(String.format("attr%02d", i + 1), label.trim()));
            }
        }
        List<CategoryOption> categories = new ArrayList<>();
        for (CateSegmentRow cate : rowStore.openCateRows(maruDataId)) {
            CategoryOption option = new CategoryOption(cate.key().cateId(), cate.value().cateName(), cate.value().defKind());
            if (CategoryConventions.BASE_CATE_ID.equals(cate.key().cateId())) {
                categories.add(0, option);
            } else {
                categories.add(option);
            }
        }
        String status = (String) r[2];
        String sourceKind = (String) r[3];
        boolean editable = LockedMaruData.MDM.equals(sourceKind) && LockedMaruData.INUSE.equals(status);
        return new DataItemHeader((String) r[0], (String) r[1], status, sourceKind, (String) r[4],
                ((Number) r[5]).intValue(), labels, editable, categories);
    }

    /** 열린 카테고리 행 — 없으면 null. */
    public CateSegmentRow openCate(String maruDataId, String cateId) {
        return rowStore.cateRows(maruDataId, cateId).stream().filter(CateSegmentRow::isOpen).findFirst().orElse(null);
    }

    public Page page(String maruDataId, String code, String name, String nodeFilter, CateSegmentRow cate,
                     boolean showClosed, int page, int size) {
        StringBuilder where = new StringBuilder(LATEST);
        if (!showClosed) {
            where.append(" AND i.VALID_TO = :openEnd");
        }
        if (code != null) {
            where.append(" AND UPPER(i.CODE) LIKE :code ESCAPE '\\'");
        }
        if (name != null) {
            where.append(" AND i.NAME LIKE :name ESCAPE '\\'");
        }
        if (nodeFilter != null) {
            where.append(" AND (i.CODE = :node OR i.LVL1 = :node OR i.LVL2 = :node OR i.LVL3 = :node "
                    + "OR i.LVL4 = :node OR i.LVL5 = :node)");
        }
        String cateId = cate == null ? null : cate.key().cateId();
        boolean base = cate == null || CategoryConventions.BASE_CATE_ID.equals(cateId);
        boolean table = !base && DataCateValue.TABLE.equals(cate.value().defKind());
        if (table) {
            where.append(" AND (i.VALID_TO <> :openEnd OR EXISTS (SELECT 1 FROM TB_MDM_DATA_CATE_ITEM ci "
                    + "WHERE ci.MARU_DATA_ID = i.MARU_DATA_ID AND ci.CATE_ID = :cateId AND ci.CODE = i.CODE "
                    + "AND ci.VALID_TO = :openEnd))");
        }
        boolean needsOpenEnd = !showClosed || table;

        if (!base && !table) {
            // REGEX — 후보를 모두 읽어 Java 로 거른 뒤 메모리에서 쪽을 자른다(Q4).
            Pattern pattern = Pattern.compile(cate.value().defExpr());
            String target = cate.value().defTarget();
            List<ItemSegmentRow> all = rows(bind(query("SELECT " + prefixed() + where + ORDER), maruDataId, code, name,
                    nodeFilter, null, needsOpenEnd));
            List<ItemSegmentRow> kept = all.stream()
                    .filter(row -> !row.isOpen() || DataCategoryResolver.matches(pattern,
                            DataCategoryResolver.targetValue(row, target)))
                    .toList();
            int from = Math.min(page * size, kept.size());
            return new Page(kept.subList(from, Math.min(from + size, kept.size())), kept.size());
        }

        long total = ((Number) bind(query("SELECT COUNT(*)" + where), maruDataId, code, name, nodeFilter, cateId,
                needsOpenEnd).getSingleResult()).longValue();
        NativeQuery<?> q = bind(query("SELECT " + prefixed() + where + ORDER), maruDataId, code, name, nodeFilter,
                cateId, needsOpenEnd);
        q.setFirstResult(page * size);
        q.setMaxResults(size);
        return new Page(rows(q), total);
    }

    /** 트리 전용(비페이징) — 열린 행만, {@link #ORDER} 그대로, 최대 {@code max}건(I6). */
    public List<ItemSegmentRow> treeRows(String maruDataId, int max) {
        NativeQuery<?> q = query("SELECT " + prefixed() + LATEST + " AND i.VALID_TO = :openEnd" + ORDER);
        q.setParameter("md", maruDataId, String.class);
        q.setParameter("openEnd", temporal.toDb(MdmTemporalSegmentRules.OPEN_END));
        q.setMaxResults(max);
        return rows(q);
    }

    private NativeQuery<?> query(String sql) {
        return entityManager.createNativeQuery(sql).unwrap(NativeQuery.class);
    }

    private NativeQuery<?> bind(NativeQuery<?> q, String maruDataId, String code, String name, String nodeFilter,
                                String cateId, boolean openEnd) {
        q.setParameter("md", maruDataId, String.class);
        if (openEnd) {
            q.setParameter("openEnd", temporal.toDb(MdmTemporalSegmentRules.OPEN_END));
        }
        if (code != null) {
            q.setParameter("code", "%" + escapeLike(code.toUpperCase(Locale.ROOT)) + "%", String.class);
        }
        if (name != null) {
            q.setParameter("name", "%" + escapeLike(name) + "%", String.class);
        }
        if (nodeFilter != null) {
            q.setParameter("node", nodeFilter, String.class);
        }
        if (cateId != null && !CategoryConventions.BASE_CATE_ID.equals(cateId)) {
            q.setParameter("cateId", cateId, String.class);
        }
        return q;
    }

    private List<ItemSegmentRow> rows(NativeQuery<?> q) {
        List<ItemSegmentRow> out = new ArrayList<>();
        for (Object o : q.getResultList()) {
            out.add(rowStore.toItem((Object[]) o));
        }
        return out;
    }

    static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_").replace("[", "\\[");
    }

    private static String prefixed() {
        StringBuilder sb = new StringBuilder();
        for (String c : DataSegmentRowStore.ITEM_COLUMNS.split(", ")) {
            if (sb.length() > 0) {
                sb.append(", ");
            }
            sb.append("i.").append(c);
        }
        return sb.toString();
    }
}
