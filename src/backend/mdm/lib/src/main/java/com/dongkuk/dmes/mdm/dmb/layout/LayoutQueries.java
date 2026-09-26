package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.entity.MdmEai;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import jakarta.persistence.EntityManager;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Component;

/**
 * 03 레이아웃 읽기 한 곳(TSK-05-02 design.md §2, F4 — 불변 I18). 쓰기는 하지 않는다({@link LayoutWriter}).
 *
 * <p>예약어 칼럼({@code OFFSET}·{@code LENGTH}·{@code VERSION})이 있는 테이블은 엔티티(JPQL)로만 읽는다 — 엔티티 매핑의 백틱
 * 인용이 방언별 인용으로 바뀐다(D-047). 네이티브 SQL 은 예약어가 없는 칼럼에만 쓰고, 행 수 제한은 {@code setMaxResults} 로 한다.
 * 널 파라미터 비교({@code :p IS NULL})는 Hibernate 가 타입을 추론하지 못해 방언에 따라 깨질 수 있어 쓰지 않는다.
 */
@Component
public class LayoutQueries {

    public static final int COLUMN_SEARCH_LIMIT = 100;

    private static final String COLUMN_SELECT = "SELECT c.PHYS_NAME, c.COLUMN_NAME, c.LABEL_LONG, c.DOMAIN_ID, d.DOMAIN_NAME "
            + "FROM TB_MDM_COLUMN c JOIN TB_MDM_DOMAIN d ON d.DOMAIN_ID = c.DOMAIN_ID ";

    /** 컬럼 사전 검색 — {@code :kw} 는 늘 문자열({@code %KW%}, 키워드가 없으면 {@code %}). */
    public static final String COLUMN_SEARCH_SQL = COLUMN_SELECT
            + "WHERE UPPER(c.PHYS_NAME) LIKE :kw OR UPPER(c.COLUMN_NAME) LIKE :kw OR UPPER(COALESCE(c.LABEL_LONG, '')) LIKE :kw "
            + "ORDER BY c.PHYS_NAME";

    /** 물리명 목록으로 컬럼 행 — 빈 목록이면 부르지 않는다(SQLite {@code IN ()} 문법 오류). */
    public static final String COLUMNS_BY_PHYS_SQL = COLUMN_SELECT + "WHERE c.PHYS_NAME IN (:names) ORDER BY c.PHYS_NAME";

    public static final String SYSTEMS_SQL = "SELECT SYSTEM_CODE, SYSTEM_NAME FROM TB_MDM_SYSTEM ORDER BY SYSTEM_CODE";

    public static final String UNITS_SQL = "SELECT UNIT_CODE, DIMENSION, BASE_UNIT FROM TB_MDM_UNIT ORDER BY UNIT_CODE";

    public static final List<String> ALL_NATIVE_SQL = List.of(COLUMN_SEARCH_SQL, COLUMNS_BY_PHYS_SQL, SYSTEMS_SQL, UNITS_SQL);

    private final EntityManager em;

    public LayoutQueries(EntityManager em) {
        this.em = em;
    }

    // ── JPQL(엔티티 경유) ──

    public List<MdmLayoutItem> itemsOf(Long layoutId) {
        return em.createQuery("SELECT i FROM MdmLayoutItem i WHERE i.layoutId = :id ORDER BY i.seq", MdmLayoutItem.class)
                .setParameter("id", layoutId).getResultList();
    }

    public List<MdmLayoutHeader> headersOf(Long messageId) {
        return em.createQuery("SELECT h FROM MdmLayoutHeader h WHERE h.layoutId = :id ORDER BY h.seq", MdmLayoutHeader.class)
                .setParameter("id", messageId).getResultList();
    }

    public List<MdmLayoutConst> constsOf(Long messageId) {
        return em.createQuery("SELECT c FROM MdmLayoutConst c WHERE c.layoutId = :id ORDER BY c.headerLayoutId, c.headerSeq",
                MdmLayoutConst.class).setParameter("id", messageId).getResultList();
    }

    /** 이 헤더의 항목을 재정의한 모든 전문의 행. */
    public List<MdmLayoutConst> constsOfHeader(Long headerLayoutId) {
        return em.createQuery("SELECT c FROM MdmLayoutConst c WHERE c.headerLayoutId = :id ORDER BY c.layoutId, c.headerSeq",
                MdmLayoutConst.class).setParameter("id", headerLayoutId).getResultList();
    }

    /** 이 헤더를 쌓은 전문의 적층 행. */
    public List<MdmLayoutHeader> stacksUsing(Long headerLayoutId) {
        return em.createQuery("SELECT h FROM MdmLayoutHeader h WHERE h.headerLayoutId = :id ORDER BY h.layoutId",
                MdmLayoutHeader.class).setParameter("id", headerLayoutId).getResultList();
    }

    public List<MdmLayoutHeader> allStacks() {
        return em.createQuery("SELECT h FROM MdmLayoutHeader h ORDER BY h.layoutId, h.seq", MdmLayoutHeader.class).getResultList();
    }

    public List<MdmLayout> layoutsOfKind(String kind) {
        return em.createQuery("SELECT l FROM MdmLayout l WHERE l.layoutKind = :kind ORDER BY l.layoutId", MdmLayout.class)
                .setParameter("kind", kind).getResultList();
    }

    /** 레이아웃별 항목 수 — {@code [layoutId, count]}. */
    public List<Object[]> itemCounts() {
        return em.createQuery("SELECT i.layoutId, COUNT(i) FROM MdmLayoutItem i GROUP BY i.layoutId", Object[].class)
                .getResultList();
    }

    /** 이 컬럼들을 쓰는 항목과 그 레이아웃 — {@code [MdmLayoutItem, MdmLayout]}(TSK-05-03 영향 목록). 빈 목록이면 부르지 않는다. */
    public List<Object[]> itemsUsingColumns(Collection<String> physNames) {
        if (physNames.isEmpty()) {
            return List.of();
        }
        return em.createQuery("SELECT i, l FROM MdmLayoutItem i, MdmLayout l WHERE l.layoutId = i.layoutId AND i.columnPhys IN :phys "
                + "ORDER BY l.layoutName, i.seq", Object[].class).setParameter("phys", physNames).getResultList();
    }

    /** 이 헤더를 쌓은 전문 수. */
    public long messagesStacking(Long headerLayoutId) {
        return em.createQuery("SELECT COUNT(h) FROM MdmLayoutHeader h WHERE h.headerLayoutId = :id", Long.class)
                .setParameter("id", headerLayoutId).getSingleResult();
    }

    public List<MdmEai> eaiOfHeader(Long headerLayoutId) {
        return em.createQuery("SELECT e FROM MdmEai e WHERE e.headerLayoutId = :id ORDER BY e.eaiCode", MdmEai.class)
                .setParameter("id", headerLayoutId).getResultList();
    }

    public List<MdmEai> allEais() {
        return em.createQuery("SELECT e FROM MdmEai e ORDER BY e.eaiCode", MdmEai.class).getResultList();
    }

    // ── 네이티브 SQL(예약어 없는 칼럼만) ──

    /** {@code [PHYS_NAME, COLUMN_NAME, LABEL_LONG, DOMAIN_ID, DOMAIN_NAME]}, 최대 {@value #COLUMN_SEARCH_LIMIT}행. */
    @SuppressWarnings("unchecked")
    public List<Object[]> searchColumns(String keyword) {
        String kw = keyword == null || keyword.isBlank() ? "%" : "%" + keyword.trim().toUpperCase(Locale.ROOT) + "%";
        return em.createNativeQuery(COLUMN_SEARCH_SQL).setParameter("kw", kw).setMaxResults(COLUMN_SEARCH_LIMIT).getResultList();
    }

    @SuppressWarnings("unchecked")
    public List<Object[]> columnsByPhys(Collection<String> physNames) {
        if (physNames.isEmpty()) {
            return List.of();
        }
        return em.createNativeQuery(COLUMNS_BY_PHYS_SQL).setParameter("names", physNames).getResultList();
    }

    /** {@code [SYSTEM_CODE, SYSTEM_NAME]}. */
    @SuppressWarnings("unchecked")
    public List<Object[]> systems() {
        return em.createNativeQuery(SYSTEMS_SQL).getResultList();
    }

    /** {@code [UNIT_CODE, DIMENSION, BASE_UNIT]}. */
    @SuppressWarnings("unchecked")
    public List<Object[]> units() {
        return em.createNativeQuery(UNITS_SQL).getResultList();
    }
}
