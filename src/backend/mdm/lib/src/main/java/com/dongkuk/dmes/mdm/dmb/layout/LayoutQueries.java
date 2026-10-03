package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.entity.MdmEai;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
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

    /** IN 목록 한 번에 넣는 최대 수. */
    public static final int IN_CHUNK = 500;

    private static final String COLUMN_SELECT = "SELECT c.PHYS_NAME, c.COLUMN_NAME, c.LABEL_LONG, c.DOMAIN_ID, d.DOMAIN_NAME "
            // 도메인 없는 컬럼(D-141)도 사전에 있는 컬럼이다 — LEFT JOIN 이라야 L01(사전 밖)로 빠지지 않는다. 파생값은 비고 L07 이 잡는다.
            + "FROM TB_MDM_COLUMN c LEFT JOIN TB_MDM_DOMAIN d ON d.DOMAIN_ID = c.DOMAIN_ID ";

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

    // ── JPQL(엔티티 경유) — 버전 키(D-144 3단계). 버전 바인딩은 VersionNumbers.scaled, 버전 비교·정렬은 Java ──

    public List<MdmLayoutItem> itemsOf(Long layoutId, BigDecimal ver) {
        return em.createQuery("SELECT i FROM MdmLayoutItem i WHERE i.layoutId = :id AND i.ver = :ver ORDER BY i.seq",
                        MdmLayoutItem.class)
                .setParameter("id", layoutId).setParameter("ver", VersionNumbers.scaled(ver)).getResultList();
    }

    /** 이 버전 항목의 물리명(중복 없음, 물리명 없는 항목은 뺀다) — 엔티티를 읽지 않는다(확정 고정 D-151, {@link LayoutColumnPins}). */
    public List<String> columnPhysOf(Long layoutId, BigDecimal ver) {
        return em.createQuery("SELECT DISTINCT i.columnPhys FROM MdmLayoutItem i WHERE i.layoutId = :id AND i.ver = :ver "
                        + "AND i.columnPhys IS NOT NULL", String.class)
                .setParameter("id", layoutId).setParameter("ver", VersionNumbers.scaled(ver)).getResultList();
    }

    /** 이 버전 항목 행 수(물리명 없는 행 포함) — 엔티티를 읽지 않는다(확정 고정 표시 행 수 확인 D-151, {@link LayoutColumnPins}). */
    public long itemCountOf(Long layoutId, BigDecimal ver) {
        return em.createQuery("SELECT COUNT(i) FROM MdmLayoutItem i WHERE i.layoutId = :id AND i.ver = :ver", Long.class)
                .setParameter("id", layoutId).setParameter("ver", VersionNumbers.scaled(ver)).getSingleResult();
    }

    public List<MdmLayoutHeader> headersOf(Long messageId, BigDecimal ver) {
        return em.createQuery("SELECT h FROM MdmLayoutHeader h WHERE h.layoutId = :id AND h.ver = :ver ORDER BY h.seq",
                        MdmLayoutHeader.class)
                .setParameter("id", messageId).setParameter("ver", VersionNumbers.scaled(ver)).getResultList();
    }

    public List<MdmLayoutConst> constsOf(Long messageId, BigDecimal ver) {
        return em.createQuery("SELECT c FROM MdmLayoutConst c WHERE c.layoutId = :id AND c.ver = :ver "
                        + "ORDER BY c.headerLayoutId, c.headerColumnPhys", MdmLayoutConst.class)
                .setParameter("id", messageId).setParameter("ver", VersionNumbers.scaled(ver)).getResultList();
    }

    /** 이 헤더를 쌓은 전문의 적층 행 — 모든 버전(호출자가 버전 상태로 거른다). */
    public List<MdmLayoutHeader> stacksUsing(Long headerLayoutId) {
        return em.createQuery("SELECT h FROM MdmLayoutHeader h WHERE h.headerLayoutId = :id ORDER BY h.layoutId",
                MdmLayoutHeader.class).setParameter("id", headerLayoutId).getResultList();
    }

    /**
     * 메타 변경 기록 키(spec 2026-10-02-mdm-meta-cache-design §3.3) — 이 레이아웃 + 이 레이아웃을 헤더로 쌓은 전문 전부(버전 무관, 중복 없음).
     * 헤더가 바뀌면 그 헤더를 쌓은 전문의 시각 T 합성(오프셋·길이·헤더 이름)도 바뀐다. 전문이면 쌓은 행이 없어 자기 하나다.
     */
    public List<Long> withStackingMessages(Long layoutId) {
        Set<Long> ids = new LinkedHashSet<>();
        ids.add(layoutId);
        for (MdmLayoutHeader stack : stacksUsing(layoutId)) {
            ids.add(stack.getLayoutId());
        }
        return List.copyOf(ids);
    }

    /** 확정 대기 — 모든 레이아웃(전문·헤더)의 DRAFT 버전 행과 부모 {@code [MdmLayoutVer, MdmLayout]}. 종류·이름 순(버전 정렬은 SQL 에서 하지 않는다). */
    public List<Object[]> drafts() {
        return em.createQuery("SELECT v, l FROM MdmLayoutVer v, MdmLayout l WHERE l.layoutId = v.layoutId AND v.status = 'DRAFT' "
                + "ORDER BY l.layoutKind, l.layoutName, l.layoutId", Object[].class).getResultList();
    }

    public List<MdmLayout> layoutsOfKind(String kind) {
        return em.createQuery("SELECT l FROM MdmLayout l WHERE l.layoutKind = :kind ORDER BY l.layoutId", MdmLayout.class)
                .setParameter("kind", kind).getResultList();
    }

    /**
     * 이 컬럼들을 쓰는 항목과 그 레이아웃·버전 행 — {@code [MdmLayoutItem, MdmLayout, MdmLayoutVer]}(TSK-05-03 영향 목록, D-144 3단계
     * 버전 상태 구분). 빈 목록이면 부르지 않는다.
     */
    public List<Object[]> itemsUsingColumns(Collection<String> physNames) {
        if (physNames.isEmpty()) {
            return List.of();
        }
        return em.createQuery("SELECT i, l, v FROM MdmLayoutItem i, MdmLayout l, MdmLayoutVer v WHERE l.layoutId = i.layoutId "
                        + "AND v.layoutId = i.layoutId AND v.ver = i.ver AND i.columnPhys IN :phys ORDER BY l.layoutName, i.layoutId, i.seq",
                Object[].class).setParameter("phys", physNames).getResultList();
    }

    public List<MdmEai> allEais() {
        return em.createQuery("SELECT e FROM MdmEai e ORDER BY e.eaiCode", MdmEai.class).getResultList();
    }

    // ── 여러 (레이아웃, 버전)을 한 번에 — 레이아웃 ID IN({@value #IN_CHUNK}개씩)으로 모든 버전 행을 읽고 Java 에서 키로 거른다
    //    (버전 IN 바인딩을 피한다). 키별 값은 위 단건 조회와 같은 순서다 ──

    /** (레이아웃, 버전) → 항목({@link #itemsOf(Long, BigDecimal)} 순서). 항목이 없는 키는 맵에 없다. */
    public Map<LayoutKey, List<MdmLayoutItem>> itemsOf(Collection<LayoutKey> keys) {
        Set<LayoutKey> wanted = new HashSet<>(keys);
        Map<LayoutKey, List<MdmLayoutItem>> out = new LinkedHashMap<>();
        for (List<Long> chunk : chunks(keys.stream().map(LayoutKey::layoutId).distinct().toList())) {
            for (MdmLayoutItem i : em.createQuery("SELECT i FROM MdmLayoutItem i WHERE i.layoutId IN :ids ORDER BY i.layoutId, i.seq",
                    MdmLayoutItem.class).setParameter("ids", chunk).getResultList()) {
                LayoutKey k = new LayoutKey(i.getLayoutId(), i.getVer());
                if (wanted.contains(k)) {
                    out.computeIfAbsent(k, x -> new ArrayList<>()).add(i);
                }
            }
        }
        return out;
    }

    /** (전문, 버전) → 헤더 적층({@link #headersOf(Long, BigDecimal)} 순서). 적층이 없는 키는 맵에 없다. */
    public Map<LayoutKey, List<MdmLayoutHeader>> headersOf(Collection<LayoutKey> keys) {
        Set<LayoutKey> wanted = new HashSet<>(keys);
        Map<LayoutKey, List<MdmLayoutHeader>> out = new LinkedHashMap<>();
        for (List<Long> chunk : chunks(keys.stream().map(LayoutKey::layoutId).distinct().toList())) {
            for (MdmLayoutHeader h : em.createQuery("SELECT h FROM MdmLayoutHeader h WHERE h.layoutId IN :ids ORDER BY h.layoutId, h.seq",
                    MdmLayoutHeader.class).setParameter("ids", chunk).getResultList()) {
                LayoutKey k = new LayoutKey(h.getLayoutId(), h.getVer());
                if (wanted.contains(k)) {
                    out.computeIfAbsent(k, x -> new ArrayList<>()).add(h);
                }
            }
        }
        return out;
    }

    /** 중복·null 을 뺀 목록을 {@value #IN_CHUNK}개씩 자른다. 비면 빈 목록(SQLite {@code IN ()} 문법 오류를 피한다). */
    public static <T> List<List<T>> chunks(Collection<T> values) {
        List<T> all = new ArrayList<>(new LinkedHashSet<>(values));
        all.remove(null);
        List<List<T>> out = new ArrayList<>();
        for (int from = 0; from < all.size(); from += IN_CHUNK) {
            out.add(all.subList(from, Math.min(all.size(), from + IN_CHUNK)));
        }
        return out;
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
