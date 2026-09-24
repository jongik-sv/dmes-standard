package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.contract.category.CategoryConventions;
import com.dongkuk.dmes.mdm.contract.category.CategoryOwner;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.entity.MdmCodeCate;
import com.dongkuk.dmes.mdm.entity.MdmCodeCateItem;
import com.dongkuk.dmes.mdm.entity.MdmCodeItem;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * 마루 코드 선분 조작 — 계약 {@code MasterCodeSegmentService} 의 {@code createBaseCategory}·{@code fillFrom} 의 06-02 구현
 * (TSK-06-02 design.md §6.5, D-TSK-06-02-4).
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

    static boolean covers(BigDecimal from, BigDecimal to, BigDecimal v) {
        return from.compareTo(v) <= 0 && v.compareTo(to) < 0;
    }
}
