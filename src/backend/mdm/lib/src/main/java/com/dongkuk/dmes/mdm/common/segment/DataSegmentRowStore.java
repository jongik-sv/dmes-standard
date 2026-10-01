package com.dongkuk.dmes.mdm.common.segment;

import static com.dongkuk.dmes.mdm.contract.common.MdmAuditColumns.NATIVE_COLUMN_LIST;

import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentRules;
import jakarta.persistence.EntityManager;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Repository;

/**
 * 05 선분 세 테이블의 네이티브 SQL 전용 저장소(design.md §2, {@code VersionRowStore} 패턴).
 *
 * <p>규칙:
 * <ul>
 *   <li>잠금 뒤 판정은 이 저장소의 네이티브 읽기로만 한다(L1). 영속성 컨텍스트의 엔티티를 쓰지 않는다.</li>
 *   <li>일시는 {@link MdmTemporalBinder} 를 거친다. DB 시각 함수를 쓰지 않는다. 새 열린 행은 {@code OPEN_END} 를 명시한다(S10).</li>
 *   <li>INSERT 는 감사 9칼럼(C_*·U_* = 요청 감사 값, VER = 0)과 {@code CHG_SEQ = 0} 을 명시한다(S12·S13).
 *       UPDATE 는 U_* 와 {@code VER = COALESCE(VER,0)+1} 을 쓴다(S13).</li>
 *   <li>문자열 null 은 문자열 타입으로 바인딩한다(드라이버가 타입 없는 null 을 다른 타입으로 추론하지 않게 한다).</li>
 *   <li>호출자 트랜잭션 안에서만 쓴다. native 쿼리 전에 flush 한다.</li>
 * </ul>
 */
@Repository
public class DataSegmentRowStore {

    public static final String ITEM_COLUMNS = "MARU_DATA_ID, CODE, VALID_FROM, VALID_TO, NAME, ALTER_NAME, SEQ, DESCRIPTION, "
            + "LVL1, LVL2, LVL3, LVL4, LVL5, ATTR01, ATTR02, ATTR03, ATTR04, ATTR05, ATTR06, ATTR07, ATTR08, ATTR09, "
            + "ATTR10, ROW_VERSION, CHG_SEQ";
    static final String CATE_COLUMNS = "MARU_DATA_ID, CATE_ID, VALID_FROM, VALID_TO, CATE_NAME, DEF_KIND, DEF_EXPR, "
            + "DEF_TARGET, DESCRIPTION, CHG_SEQ";
    static final String CATE_ITEM_COLUMNS = "MARU_DATA_ID, CATE_ID, CODE, VALID_FROM, VALID_TO, CHG_SEQ";

    /** IN 목록 한 번에 묶는 값 수 — SQLite 옛 바인딩 한도(999)·다른 방언 한도(2100 등)보다 작게 둔다. */
    static final int IN_CHUNK = 500;

    private static final String AUDIT_SET = ", U_USR_ID = :uUsrId, U_AT = :uAt, U_SVC_ID = :uSvcId, U_PGM_ID = :uPgmId, "
            + "VER = COALESCE(VER, 0) + 1";
    private static final String AUDIT_VALUES = ":cUsrId, :cAt, :cSvcId, :cPgmId, :cUsrId, :cAt, :cSvcId, :cPgmId, 0";

    private final EntityManager entityManager;
    private final MdmTemporalBinder temporal;

    public DataSegmentRowStore(EntityManager entityManager, MdmTemporalBinder temporal) {
        this.entityManager = entityManager;
        this.temporal = temporal;
    }

    // ── 항목 ────────────────────────────────────────────────────────────────

    /** 한 키의 항목 선분 행 전부, valid_from 오름차순. */
    public List<ItemSegmentRow> itemRows(String maruDataId, String code) {
        String sql = "SELECT " + ITEM_COLUMNS + " FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = :md AND CODE = :code "
                + "ORDER BY VALID_FROM";
        NativeQuery<?> q = query(sql);
        bindString(q, "md", maruDataId);
        bindString(q, "code", code);
        return itemList(q.getResultList());
    }

    /**
     * 여러 키의 항목 선분 행 — CODE 별 목록(각각 valid_from 오름차순, {@link #itemRows} 와 같은 순서). 행이 없는 CODE 는 맵에
     * 없다. IN 목록은 {@link #IN_CHUNK} 개씩 나눠 읽는다(바인딩 한도).
     */
    public Map<String, List<ItemSegmentRow>> itemRowsByCodes(String maruDataId, Collection<String> codes) {
        Map<String, List<ItemSegmentRow>> out = new LinkedHashMap<>();
        for (List<String> chunk : chunks(codes)) {
            String sql = "SELECT " + ITEM_COLUMNS + " FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = :md AND CODE IN (:codes) "
                    + "ORDER BY CODE, VALID_FROM";
            NativeQuery<?> q = query(sql);
            bindString(q, "md", maruDataId);
            q.setParameterList("codes", chunk, String.class);
            for (ItemSegmentRow row : itemList(q.getResultList())) {
                out.computeIfAbsent(row.key().code(), k -> new ArrayList<>()).add(row);
            }
        }
        return out;
    }

    /** 마루 데이터 안 키별 마지막 행(닫힌 키 포함) — 검사 5-1·일괄 upsert 판정용. 키 오름차순. */
    public List<ItemSegmentRow> latestItemRows(String maruDataId) {
        String sql = "SELECT " + prefixed("i", ITEM_COLUMNS) + " FROM TB_MDM_DATA_ITEM i WHERE i.MARU_DATA_ID = :md "
                + "AND NOT EXISTS (SELECT 1 FROM TB_MDM_DATA_ITEM x WHERE x.MARU_DATA_ID = i.MARU_DATA_ID "
                + "AND x.CODE = i.CODE AND x.VALID_FROM > i.VALID_FROM) ORDER BY i.CODE";
        NativeQuery<?> q = query(sql);
        bindString(q, "md", maruDataId);
        return itemList(q.getResultList());
    }

    /** 마루 데이터 안 지금 열려 있는 항목(키) 건수 — 키당 열린 행은 하나뿐이라(S11) 열린 끝 행 수와 같다. */
    public int countOpenItems(String maruDataId) {
        NativeQuery<?> q = query("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = :md AND VALID_TO = :openEnd");
        bindString(q, "md", maruDataId);
        q.setParameter("openEnd", temporal.toDb(MdmTemporalSegmentRules.OPEN_END));
        return ((Number) q.getSingleResult()).intValue();
    }

    public void insertItem(ItemSegmentRow row, AuditStamp stamp) {
        String sql = "INSERT INTO TB_MDM_DATA_ITEM (" + ITEM_COLUMNS + ", " + NATIVE_COLUMN_LIST + ") VALUES ("
                + ":md, :code, :vf, :vt, :name, :alterName, :seq, :description, :lvl1, :lvl2, :lvl3, :lvl4, :lvl5, "
                + ":attr01, :attr02, :attr03, :attr04, :attr05, :attr06, :attr07, :attr08, :attr09, :attr10, "
                + ":rowVersion, 0, " + AUDIT_VALUES + ")";
        NativeQuery<?> q = query(sql);
        DataItemValue v = row.value();
        bindString(q, "md", row.key().maruDataId());
        bindString(q, "code", row.key().code());
        q.setParameter("vf", temporal.toDb(row.validFrom()));
        q.setParameter("vt", temporal.toDb(row.validTo()));
        bindString(q, "name", v.name());
        bindString(q, "alterName", v.alterName());
        q.setParameter("seq", v.seq(), Integer.class);
        bindString(q, "description", v.description());
        for (int i = 1; i <= DataItemValue.LVL_COUNT; i++) {
            bindString(q, "lvl" + i, v.lvl(i));
        }
        for (int i = 1; i <= DataItemValue.ATTR_COUNT; i++) {
            bindString(q, String.format("attr%02d", i), v.attr(i));
        }
        q.setParameter("rowVersion", row.rowVersion());
        bindInsertAudit(q, stamp).executeUpdate();
    }

    /**
     * 열린 행 하나의 valid_to 를 at 으로 적는다. 조건은 {@code VALID_TO = OPEN_END} 이고, {@code expectedRowVersion} 이
     * 있으면 {@code ROW_VERSION = :expected} 도 붙인 CAS 다(S4). 갱신 행 수를 돌려준다.
     */
    public int closeItem(String maruDataId, String code, LocalDateTime validFrom, LocalDateTime at,
                         Integer expectedRowVersion, boolean bumpRowVersion, AuditStamp stamp) {
        String sql = "UPDATE TB_MDM_DATA_ITEM SET VALID_TO = :at"
                + (bumpRowVersion ? ", ROW_VERSION = ROW_VERSION + 1" : "") + AUDIT_SET
                + " WHERE MARU_DATA_ID = :md AND CODE = :code AND VALID_FROM = :vf AND VALID_TO = :openEnd"
                + (expectedRowVersion != null ? " AND ROW_VERSION = :expected" : "");
        NativeQuery<?> q = query(sql);
        bindString(q, "md", maruDataId);
        bindString(q, "code", code);
        q.setParameter("vf", temporal.toDb(validFrom));
        q.setParameter("at", temporal.toDb(at));
        q.setParameter("openEnd", temporal.toDb(MdmTemporalSegmentRules.OPEN_END));
        if (expectedRowVersion != null) {
            q.setParameter("expected", expectedRowVersion);
        }
        return bindUpdateAudit(q, stamp).executeUpdate();
    }

    // ── 카테고리 ────────────────────────────────────────────────────────────

    /** 한 카테고리의 선분 행 전부, valid_from 오름차순. */
    public List<CateSegmentRow> cateRows(String maruDataId, String cateId) {
        String sql = "SELECT " + CATE_COLUMNS + " FROM TB_MDM_DATA_CATE WHERE MARU_DATA_ID = :md AND CATE_ID = :cateId "
                + "ORDER BY VALID_FROM";
        NativeQuery<?> q = query(sql);
        bindString(q, "md", maruDataId);
        bindString(q, "cateId", cateId);
        List<CateSegmentRow> out = new ArrayList<>();
        for (Object o : q.getResultList()) {
            out.add(toCate((Object[]) o));
        }
        return out;
    }

    /** 마루 데이터의 열린 카테고리 행 전부, CATE_ID 오름차순. */
    public List<CateSegmentRow> openCateRows(String maruDataId) {
        String sql = "SELECT " + CATE_COLUMNS + " FROM TB_MDM_DATA_CATE WHERE MARU_DATA_ID = :md AND VALID_TO = :openEnd "
                + "ORDER BY CATE_ID";
        NativeQuery<?> q = query(sql);
        bindString(q, "md", maruDataId);
        q.setParameter("openEnd", temporal.toDb(MdmTemporalSegmentRules.OPEN_END));
        List<CateSegmentRow> out = new ArrayList<>();
        for (Object o : q.getResultList()) {
            out.add(toCate((Object[]) o));
        }
        return out;
    }

    /** 마루 데이터 안 카테고리별 마지막 행(닫힌 카테고리 포함, F12) — dataMng·dataEdit 의 BASE 값·카드 조회용. CATE_ID 오름차순. */
    public List<CateSegmentRow> latestCateRows(String maruDataId) {
        String sql = "SELECT " + prefixed("c", CATE_COLUMNS) + " FROM TB_MDM_DATA_CATE c WHERE c.MARU_DATA_ID = :md "
                + "AND NOT EXISTS (SELECT 1 FROM TB_MDM_DATA_CATE x WHERE x.MARU_DATA_ID = c.MARU_DATA_ID "
                + "AND x.CATE_ID = c.CATE_ID AND x.VALID_FROM > c.VALID_FROM) ORDER BY c.CATE_ID";
        NativeQuery<?> q = query(sql);
        bindString(q, "md", maruDataId);
        List<CateSegmentRow> out = new ArrayList<>();
        for (Object o : q.getResultList()) {
            out.add(toCate((Object[]) o));
        }
        return out;
    }

    /** TABLE 카테고리 하나에 지금 열려 있는 소속 CODE 목록(F12, 건수·미리보기용). CODE 오름차순. */
    public List<String> openMemberCodes(String maruDataId, String cateId) {
        String sql = "SELECT CODE FROM TB_MDM_DATA_CATE_ITEM WHERE MARU_DATA_ID = :md AND CATE_ID = :cateId "
                + "AND VALID_TO = :openEnd ORDER BY CODE";
        NativeQuery<?> q = query(sql);
        bindString(q, "md", maruDataId);
        bindString(q, "cateId", cateId);
        q.setParameter("openEnd", temporal.toDb(MdmTemporalSegmentRules.OPEN_END));
        List<String> out = new ArrayList<>();
        for (Object o : q.getResultList()) {
            out.add((String) o);
        }
        return out;
    }

    public void insertCate(CateSegmentRow row, AuditStamp stamp) {
        String sql = "INSERT INTO TB_MDM_DATA_CATE (" + CATE_COLUMNS + ", " + NATIVE_COLUMN_LIST + ") VALUES ("
                + ":md, :cateId, :vf, :vt, :cateName, :defKind, :defExpr, :defTarget, :description, 0, "
                + AUDIT_VALUES + ")";
        NativeQuery<?> q = query(sql);
        DataCateValue v = row.value();
        bindString(q, "md", row.key().maruDataId());
        bindString(q, "cateId", row.key().cateId());
        q.setParameter("vf", temporal.toDb(row.validFrom()));
        q.setParameter("vt", temporal.toDb(row.validTo()));
        bindString(q, "cateName", v.cateName());
        bindString(q, "defKind", v.defKind());
        bindString(q, "defExpr", v.defExpr());
        bindString(q, "defTarget", v.defTarget());
        bindString(q, "description", v.description());
        bindInsertAudit(q, stamp).executeUpdate();
    }

    public int closeCate(String maruDataId, String cateId, LocalDateTime validFrom, LocalDateTime at, AuditStamp stamp) {
        String sql = "UPDATE TB_MDM_DATA_CATE SET VALID_TO = :at" + AUDIT_SET
                + " WHERE MARU_DATA_ID = :md AND CATE_ID = :cateId AND VALID_FROM = :vf AND VALID_TO = :openEnd";
        NativeQuery<?> q = query(sql);
        bindString(q, "md", maruDataId);
        bindString(q, "cateId", cateId);
        q.setParameter("vf", temporal.toDb(validFrom));
        q.setParameter("at", temporal.toDb(at));
        q.setParameter("openEnd", temporal.toDb(MdmTemporalSegmentRules.OPEN_END));
        return bindUpdateAudit(q, stamp).executeUpdate();
    }

    // ── 소속 ────────────────────────────────────────────────────────────────

    /** 한 소속 키의 선분 행 전부, valid_from 오름차순. */
    public List<CateItemSegmentRow> cateItemRows(String maruDataId, String cateId, String code) {
        String sql = "SELECT " + CATE_ITEM_COLUMNS + " FROM TB_MDM_DATA_CATE_ITEM WHERE MARU_DATA_ID = :md "
                + "AND CATE_ID = :cateId AND CODE = :code ORDER BY VALID_FROM";
        NativeQuery<?> q = query(sql);
        bindString(q, "md", maruDataId);
        bindString(q, "cateId", cateId);
        bindString(q, "code", code);
        List<CateItemSegmentRow> out = new ArrayList<>();
        for (Object o : q.getResultList()) {
            Object[] r = (Object[]) o;
            out.add(new CateItemSegmentRow(new DataCateItemKey((String) r[0], (String) r[1], (String) r[2]),
                    temporal.fromDb(r[3]), temporal.fromDb(r[4]), ((Number) r[5]).longValue()));
        }
        return out;
    }

    /**
     * 여러 소속 키({@code cateId} 하나·CODE 여럿)의 선분 행 — CODE 별 목록(각각 valid_from 오름차순, {@link #cateItemRows} 와
     * 같은 순서). 행이 없는 CODE 는 맵에 없다. IN 목록은 {@link #IN_CHUNK} 개씩 나눠 읽는다(바인딩 한도).
     */
    public Map<String, List<CateItemSegmentRow>> cateItemRowsByCodes(String maruDataId, String cateId,
                                                                    Collection<String> codes) {
        Map<String, List<CateItemSegmentRow>> out = new LinkedHashMap<>();
        for (List<String> chunk : chunks(codes)) {
            String sql = "SELECT " + CATE_ITEM_COLUMNS + " FROM TB_MDM_DATA_CATE_ITEM WHERE MARU_DATA_ID = :md "
                    + "AND CATE_ID = :cateId AND CODE IN (:codes) ORDER BY CODE, VALID_FROM";
            NativeQuery<?> q = query(sql);
            bindString(q, "md", maruDataId);
            bindString(q, "cateId", cateId);
            q.setParameterList("codes", chunk, String.class);
            for (Object o : q.getResultList()) {
                Object[] r = (Object[]) o;
                CateItemSegmentRow row = new CateItemSegmentRow(new DataCateItemKey((String) r[0], (String) r[1],
                        (String) r[2]), temporal.fromDb(r[3]), temporal.fromDb(r[4]), ((Number) r[5]).longValue());
                out.computeIfAbsent(row.key().code(), k -> new ArrayList<>()).add(row);
            }
        }
        return out;
    }

    public void insertCateItem(CateItemSegmentRow row, AuditStamp stamp) {
        String sql = "INSERT INTO TB_MDM_DATA_CATE_ITEM (" + CATE_ITEM_COLUMNS + ", " + NATIVE_COLUMN_LIST + ") VALUES ("
                + ":md, :cateId, :code, :vf, :vt, 0, " + AUDIT_VALUES + ")";
        NativeQuery<?> q = query(sql);
        bindString(q, "md", row.key().maruDataId());
        bindString(q, "cateId", row.key().cateId());
        bindString(q, "code", row.key().code());
        q.setParameter("vf", temporal.toDb(row.validFrom()));
        q.setParameter("vt", temporal.toDb(row.validTo()));
        bindInsertAudit(q, stamp).executeUpdate();
    }

    public int closeCateItem(String maruDataId, String cateId, String code, LocalDateTime validFrom, LocalDateTime at,
                             AuditStamp stamp) {
        String sql = "UPDATE TB_MDM_DATA_CATE_ITEM SET VALID_TO = :at" + AUDIT_SET
                + " WHERE MARU_DATA_ID = :md AND CATE_ID = :cateId AND CODE = :code AND VALID_FROM = :vf "
                + "AND VALID_TO = :openEnd";
        NativeQuery<?> q = query(sql);
        bindString(q, "md", maruDataId);
        bindString(q, "cateId", cateId);
        bindString(q, "code", code);
        q.setParameter("vf", temporal.toDb(validFrom));
        q.setParameter("at", temporal.toDb(at));
        q.setParameter("openEnd", temporal.toDb(MdmTemporalSegmentRules.OPEN_END));
        return bindUpdateAudit(q, stamp).executeUpdate();
    }

    // ── 읽기 변환 ──────────────────────────────────────────────────────────

    private List<ItemSegmentRow> itemList(List<?> rows) {
        List<ItemSegmentRow> out = new ArrayList<>(rows.size());
        for (Object o : rows) {
            out.add(toItem((Object[]) o));
        }
        return out;
    }

    /** {@link #ITEM_COLUMNS} 순서의 네이티브 행을 선분 행으로 바꾼다(목록 쿼리도 같은 변환을 쓴다). */
    public ItemSegmentRow toItem(Object[] r) {
        List<String> lvl = new ArrayList<>(DataItemValue.LVL_COUNT);
        for (int i = 0; i < DataItemValue.LVL_COUNT; i++) {
            lvl.add((String) r[8 + i]);
        }
        List<String> attr = new ArrayList<>(DataItemValue.ATTR_COUNT);
        for (int i = 0; i < DataItemValue.ATTR_COUNT; i++) {
            attr.add((String) r[13 + i]);
        }
        Integer seq = r[6] == null ? null : ((Number) r[6]).intValue();
        DataItemValue value = new DataItemValue((String) r[4], (String) r[5], seq, (String) r[7], lvl, attr);
        return new ItemSegmentRow(new DataItemKey((String) r[0], (String) r[1]), temporal.fromDb(r[2]),
                temporal.fromDb(r[3]), value, ((Number) r[23]).intValue(), ((Number) r[24]).longValue());
    }

    private CateSegmentRow toCate(Object[] r) {
        DataCateValue value = new DataCateValue((String) r[4], (String) r[5], (String) r[6], (String) r[7], (String) r[8]);
        return new CateSegmentRow(new DataCateKey((String) r[0], (String) r[1]), temporal.fromDb(r[2]),
                temporal.fromDb(r[3]), value, ((Number) r[9]).longValue());
    }

    /** 중복을 뺀(처음 순서 유지) 값을 {@link #IN_CHUNK} 개씩 나눈다. */
    private static List<List<String>> chunks(Collection<String> values) {
        List<String> distinct = new ArrayList<>(new LinkedHashSet<>(values));
        List<List<String>> out = new ArrayList<>();
        for (int i = 0; i < distinct.size(); i += IN_CHUNK) {
            out.add(distinct.subList(i, Math.min(distinct.size(), i + IN_CHUNK)));
        }
        return out;
    }

    private static String prefixed(String alias, String columns) {
        StringBuilder sb = new StringBuilder();
        for (String c : columns.split(", ")) {
            if (sb.length() > 0) {
                sb.append(", ");
            }
            sb.append(alias).append('.').append(c);
        }
        return sb.toString();
    }

    // ── 바인딩 ──────────────────────────────────────────────────────────────

    private NativeQuery<?> query(String sql) {
        entityManager.flush();
        return entityManager.createNativeQuery(sql).unwrap(NativeQuery.class);
    }

    private NativeQuery<?> bindInsertAudit(NativeQuery<?> q, AuditStamp stamp) {
        q.setParameter("cAt", temporal.toDb(stamp.at()));
        bindString(q, "cUsrId", stamp.userId());
        bindString(q, "cSvcId", stamp.serviceId());
        bindString(q, "cPgmId", stamp.programId());
        return q;
    }

    private NativeQuery<?> bindUpdateAudit(NativeQuery<?> q, AuditStamp stamp) {
        q.setParameter("uAt", temporal.toDb(stamp.at()));
        bindString(q, "uUsrId", stamp.userId());
        bindString(q, "uSvcId", stamp.serviceId());
        bindString(q, "uPgmId", stamp.programId());
        return q;
    }

    private static void bindString(NativeQuery<?> q, String name, String value) {
        q.setParameter(name, value, String.class);
    }
}
