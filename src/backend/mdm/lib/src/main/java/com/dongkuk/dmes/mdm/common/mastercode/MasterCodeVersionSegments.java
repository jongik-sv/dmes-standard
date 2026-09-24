package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.category.CategoryConventions;
import com.dongkuk.dmes.mdm.contract.category.CategoryOwner;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import com.dongkuk.dmes.mdm.entity.MdmCodeCate;
import com.dongkuk.dmes.mdm.entity.MdmCodeCateItem;
import com.dongkuk.dmes.mdm.entity.MdmCodeItem;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeSet;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Component;

/**
 * 마루 코드 선분 조작 — 계약 {@code MasterCodeSegmentService} 의 {@code createBaseCategory}·{@code fillFrom} 의 06-02 구현
 * (TSK-06-02 design.md §6.5, D-078).
 *
 * <p>계약 인터페이스를 implements 하지 않는다 — 06-03 이 같은 인터페이스의 구현 클래스를 만들며, 그때 이 두 메서드를
 * 여기에 위임한다(형제 Task 와 add/add 충돌 회피, D6). 버전 번호의 범위 비교는 Java 에서 한다(I20).
 */
@Component
public class MasterCodeVersionSegments {

    /** BASE 카테고리 표시 이름. */
    static final String BASE_CATE_NAME = "전체";

    private final EntityManager entityManager;

    public MasterCodeVersionSegments(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    /** 한 버전 시점의 세 표 행. CATE_ITEM 키는 {@code cateId + "," + code}. */
    public record Rows(Map<String, MdmCodeItem> items, Map<String, MdmCodeCate> cates,
                       Map<String, MdmCodeCateItem> cateItems) {
    }

    /**
     * 첫 DRAFT(1.000)에 예약 카테고리 BASE(REGEX {@code .*}, 대상 CODE, from 1.000, to 9999)를 만든다(I4·I7).
     * 끝에서 flush 해 INSERT 실패가 이 호출(OASIS serviceTask) 안에서 드러나게 한다.
     */
    public void createBaseCategory(VersionRef firstDraft) {
        if (firstDraft.ver().compareTo(MasterCodeConventions.FIRST_VER) != 0) {
            throw new IllegalArgumentException("BASE 는 첫 버전(1.000)에만 만든다: " + firstDraft);
        }
        MdmCodeCate base = new MdmCodeCate(firstDraft.objectId(), CategoryConventions.BASE_CATE_ID,
                MasterCodeConventions.FIRST_VER, CategoryConventions.BASE_DEF_KIND.name());
        base.setDefExpr(CategoryConventions.BASE_DEF_EXPR);
        base.setDefTarget(CategoryOwner.MASTER_CODE.baseDefTarget().name());
        base.setCateName(BASE_CATE_NAME);
        entityManager.persist(base);
        entityManager.flush();
    }

    /** 버전 {@code v} 에 유효한({@code from ≤ v < to}) 세 표 행. 코드의 행을 전부 읽고 Java 에서 거른다(I20). */
    public Rows rowsAt(String maruCodeId, BigDecimal v) {
        Map<String, MdmCodeItem> items = new LinkedHashMap<>();
        for (MdmCodeItem e : entityManager.createQuery(
                "select e from MdmCodeItem e where e.maruCodeId = :id order by e.code", MdmCodeItem.class)
                .setParameter("id", maruCodeId).getResultList()) {
            if (covers(e.getFromVer(), e.getToVer(), v)) {
                items.put(e.getCode(), e);
            }
        }
        Map<String, MdmCodeCate> cates = new LinkedHashMap<>();
        for (MdmCodeCate e : entityManager.createQuery(
                "select e from MdmCodeCate e where e.maruCodeId = :id order by e.cateId", MdmCodeCate.class)
                .setParameter("id", maruCodeId).getResultList()) {
            if (covers(e.getFromVer(), e.getToVer(), v)) {
                cates.put(e.getCateId(), e);
            }
        }
        Map<String, MdmCodeCateItem> cateItems = new LinkedHashMap<>();
        for (MdmCodeCateItem e : entityManager.createQuery(
                "select e from MdmCodeCateItem e where e.maruCodeId = :id order by e.cateId, e.code", MdmCodeCateItem.class)
                .setParameter("id", maruCodeId).getResultList()) {
            if (covers(e.getFromVer(), e.getToVer(), v)) {
                cateItems.put(e.getCateId() + "," + e.getCode(), e);
            }
        }
        return new Rows(items, cates, cateItems);
    }

    /**
     * 복원: 원본 S(RELEASED, S &lt; V)의 모습을 DRAFT V 에 채운다(I15). 세 표 각각 키로 S 시점 행과 "현재"(열린 행,
     * {@code TO_VER = 9999} 이고 {@code FROM_VER &lt; V})를 비교해 S 에만 있으면 {@code FROM_VER = V} 로 추가, 현재에만 있으면
     * {@code TO_VER = V} 로 닫기, 값이 다르면 닫고 추가, 같으면 그대로 둔다. 결과 {@code rowsAt(V) ≡ rowsAt(S)}.
     * BASE 는 늘 같은 값이라 건드리지 않는다.
     */
    public void fillFrom(VersionRef draft, BigDecimal sourceVer) {
        String id = draft.objectId();
        BigDecimal v = draft.ver();
        requireReleasedSource(id, sourceVer, v);
        Rows src = rowsAt(id, sourceVer);
        Rows cur = openRows(id, v);

        for (String key : union(src.items().keySet(), cur.items().keySet())) {
            MdmCodeItem s = src.items().get(key);
            MdmCodeItem c = cur.items().get(key);
            if (c != null && (s == null || !sameItem(s, c))) {
                c.setToVer(v);
            }
            if (s != null && (c == null || !sameItem(s, c))) {
                entityManager.persist(copyItem(s, v));
            }
        }
        for (String key : union(src.cates().keySet(), cur.cates().keySet())) {
            MdmCodeCate s = src.cates().get(key);
            MdmCodeCate c = cur.cates().get(key);
            if (c != null && (s == null || !sameCate(s, c))) {
                c.setToVer(v);
            }
            if (s != null && (c == null || !sameCate(s, c))) {
                entityManager.persist(copyCate(s, v));
            }
        }
        for (String key : union(src.cateItems().keySet(), cur.cateItems().keySet())) {
            MdmCodeCateItem s = src.cateItems().get(key);
            MdmCodeCateItem c = cur.cateItems().get(key);
            if (c != null && s == null) {
                c.setToVer(v);
            }
            if (s != null && c == null) {
                entityManager.persist(new MdmCodeCateItem(id, s.getCateId(), s.getCode(), v));
            }
        }
        entityManager.flush();
    }

    /** 열린 행(TO_VER = 9999) 중 V 보다 앞에서 시작한 행. */
    private Rows openRows(String id, BigDecimal v) {
        Rows all = rowsAt(id, v);
        Map<String, MdmCodeItem> items = new LinkedHashMap<>();
        all.items().forEach((k, e) -> {
            if (isOpen(e.getToVer()) && e.getFromVer().compareTo(v) < 0) {
                items.put(k, e);
            }
        });
        Map<String, MdmCodeCate> cates = new LinkedHashMap<>();
        all.cates().forEach((k, e) -> {
            if (isOpen(e.getToVer()) && e.getFromVer().compareTo(v) < 0) {
                cates.put(k, e);
            }
        });
        Map<String, MdmCodeCateItem> cateItems = new LinkedHashMap<>();
        all.cateItems().forEach((k, e) -> {
            if (isOpen(e.getToVer()) && e.getFromVer().compareTo(v) < 0) {
                cateItems.put(k, e);
            }
        });
        return new Rows(items, cates, cateItems);
    }

    private void requireReleasedSource(String id, BigDecimal sourceVer, BigDecimal v) {
        if (sourceVer == null || sourceVer.compareTo(v) >= 0) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "복원 원본은 새 버전보다 작은 확정(RELEASED) 버전이어야 합니다", List.of());
        }
        entityManager.flush();
        List<?> status = entityManager.createNativeQuery(
                        "SELECT STATUS FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = :id AND VER = :ver")
                .unwrap(NativeQuery.class)
                .setParameter("id", id)
                .setParameter("ver", sourceVer.setScale(MasterCodeConventions.FIRST_VER.scale()))
                .getResultList();
        if (status.isEmpty() || !VersionStatus.RELEASED.name().equals(status.get(0))) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "복원 원본은 확정(RELEASED)된 버전이어야 합니다", List.of());
        }
    }

    private static boolean isOpen(BigDecimal toVer) {
        return toVer.compareTo(MasterCodeConventions.OPEN_TO_VER) == 0;
    }

    private static TreeSet<String> union(java.util.Set<String> a, java.util.Set<String> b) {
        TreeSet<String> keys = new TreeSet<>(a);
        keys.addAll(b);
        return keys;
    }

    private static boolean sameItem(MdmCodeItem a, MdmCodeItem b) {
        return Objects.equals(a.getName(), b.getName()) && Objects.equals(a.getAlterName(), b.getAlterName())
                && Objects.equals(a.getSeq(), b.getSeq()) && Objects.equals(a.getDescription(), b.getDescription())
                && Objects.equals(a.getLvl1(), b.getLvl1()) && Objects.equals(a.getLvl2(), b.getLvl2())
                && Objects.equals(a.getLvl3(), b.getLvl3()) && Objects.equals(a.getLvl4(), b.getLvl4())
                && Objects.equals(a.getLvl5(), b.getLvl5())
                && Objects.equals(a.getAttr01(), b.getAttr01()) && Objects.equals(a.getAttr02(), b.getAttr02())
                && Objects.equals(a.getAttr03(), b.getAttr03()) && Objects.equals(a.getAttr04(), b.getAttr04())
                && Objects.equals(a.getAttr05(), b.getAttr05()) && Objects.equals(a.getAttr06(), b.getAttr06())
                && Objects.equals(a.getAttr07(), b.getAttr07()) && Objects.equals(a.getAttr08(), b.getAttr08())
                && Objects.equals(a.getAttr09(), b.getAttr09()) && Objects.equals(a.getAttr10(), b.getAttr10());
    }

    private static boolean sameCate(MdmCodeCate a, MdmCodeCate b) {
        return Objects.equals(a.getCateName(), b.getCateName()) && Objects.equals(a.getDefKind(), b.getDefKind())
                && Objects.equals(a.getDefExpr(), b.getDefExpr()) && Objects.equals(a.getDefTarget(), b.getDefTarget())
                && Objects.equals(a.getDescription(), b.getDescription());
    }

    private static MdmCodeItem copyItem(MdmCodeItem s, BigDecimal v) {
        MdmCodeItem n = new MdmCodeItem(s.getMaruCodeId(), s.getCode(), v);
        n.setName(s.getName());
        n.setAlterName(s.getAlterName());
        n.setSeq(s.getSeq());
        n.setDescription(s.getDescription());
        n.setLvl1(s.getLvl1());
        n.setLvl2(s.getLvl2());
        n.setLvl3(s.getLvl3());
        n.setLvl4(s.getLvl4());
        n.setLvl5(s.getLvl5());
        n.setAttr01(s.getAttr01());
        n.setAttr02(s.getAttr02());
        n.setAttr03(s.getAttr03());
        n.setAttr04(s.getAttr04());
        n.setAttr05(s.getAttr05());
        n.setAttr06(s.getAttr06());
        n.setAttr07(s.getAttr07());
        n.setAttr08(s.getAttr08());
        n.setAttr09(s.getAttr09());
        n.setAttr10(s.getAttr10());
        return n;
    }

    private static MdmCodeCate copyCate(MdmCodeCate s, BigDecimal v) {
        MdmCodeCate n = new MdmCodeCate(s.getMaruCodeId(), s.getCateId(), v, s.getDefKind());
        n.setCateName(s.getCateName());
        n.setDefExpr(s.getDefExpr());
        n.setDefTarget(s.getDefTarget());
        n.setDescription(s.getDescription());
        return n;
    }

    static boolean covers(BigDecimal from, BigDecimal to, BigDecimal v) {
        return from.compareTo(v) <= 0 && v.compareTo(to) < 0;
    }
}
