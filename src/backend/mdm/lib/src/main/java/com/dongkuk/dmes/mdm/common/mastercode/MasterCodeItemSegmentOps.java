package com.dongkuk.dmes.mdm.common.mastercode;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeSegments.same;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeSegments.valid;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.category.CategoryKind;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateItemRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemValues;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentKey;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeVersionView;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import com.dongkuk.dmes.mdm.entity.MdmCodeCate;
import com.dongkuk.dmes.mdm.entity.MdmCodeCateItem;
import com.dongkuk.dmes.mdm.entity.MdmCodeItem;
import com.dongkuk.dmes.mdm.entity.MdmCodeVer;
import com.dongkuk.dmes.mdm.repository.MdmCodeCateItemRepository;
import com.dongkuk.dmes.mdm.repository.MdmCodeItemRepository;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeSet;
import org.springframework.stereotype.Component;

/**
 * 선분 조작 본체 — 계약 {@code MasterCodeSegmentService} 의 TSK-06-03 몫(코드 행 추가·수정·삭제·되돌리기·버전 V 모습,
 * design.md §6.2). 원천 04:40-65(행 조작·되돌리기)·04:489-500(코드 삭제 연쇄).
 *
 * <p>쓰기는 DRAFT V 에서만 한다(아니면 MDM002, 불변 규칙 11). ROW_VERSION 은 받지도 올리지도 않는다 — 호출자가 같은
 * 트랜잭션에서 먼저 {@code VersionWriteGuard.beginDraftWrite} 를 부른다(불변 규칙 12). 그래서 이 클래스는 버전 가드를
 * 참조하지 않는다.
 *
 * <p>쓰기는 행마다 리포지토리 {@code saveAndFlush}·{@code delete}+{@code flush} 를 명시적으로 부른다. ① 트랜잭션 밖에서 읽은
 * 엔티티는 곧바로 detached 라 세터만으로는 반영되지 않는다(§6.2). ② Hibernate 는 flush 때 INSERT 를 DELETE 보다 먼저
 * 실행하므로, 한 트랜잭션에서 같은 PK 를 지운 뒤 다시 넣으면(예: V 에서 추가한 코드를 삭제 뒤 재추가) 즉시 flush 하지
 * 않으면 PK 위반이 난다. ③ DB 오류가 커밋 시점이 아니라 serviceTask 안에서 나야 OASIS 가 {@code meta.success=false}
 * 로 싣는다(O3).
 */
@Component
public class MasterCodeItemSegmentOps {

    private static final BigDecimal OPEN = MasterCodeConventions.OPEN_TO_VER;

    private final MasterCodeRows rows;
    private final MdmCodeItemRepository itemRepository;
    private final MdmCodeCateItemRepository cateItemRepository;

    public MasterCodeItemSegmentOps(MasterCodeRows rows, MdmCodeItemRepository itemRepository,
                                    MdmCodeCateItemRepository cateItemRepository) {
        this.rows = rows;
        this.itemRepository = itemRepository;
        this.cateItemRepository = cateItemRepository;
    }

    // ── 읽기 ────────────────────────────────────────────────────────────

    /** 버전 V 의 모습 = 세 표에서 {@code from <= V < to} 인 행. 버전 상태는 보지 않는다(RELEASED·CANCELLED 도 읽는다). */
    public MasterCodeVersionView viewAt(VersionRef version) {
        BigDecimal v = version.ver();
        String id = version.objectId();
        List<MasterCodeItemRow> items = rows.items(id).stream()
                .filter(e -> valid(e.getFromVer(), e.getToVer(), v))
                .map(MasterCodeItemSegmentOps::row)
                .sorted(MasterCodeCategoryResolver.ITEM_ORDER)
                .toList();
        List<MasterCodeCateRow> cates = rows.cates(id).stream()
                .filter(e -> valid(e.getFromVer(), e.getToVer(), v))
                .sorted((a, b) -> a.getCateId().compareTo(b.getCateId()))
                .map(e -> new MasterCodeCateRow(definition(e), e.getFromVer(), e.getToVer()))
                .toList();
        List<MasterCodeCateItemRow> cateItems = rows.cateItems(id).stream()
                .filter(e -> valid(e.getFromVer(), e.getToVer(), v))
                .map(e -> new MasterCodeCateItemRow(e.getCateId(), e.getCode(), e.getFromVer(), e.getToVer()))
                .toList();
        return new MasterCodeVersionView(version, items, cates, cateItems);
    }

    // ── 쓰기 ────────────────────────────────────────────────────────────

    public void addItem(VersionRef draft, String code, MasterCodeItemValues values) {
        requireLengths(values);
        requireDraft(draft);
        if (validAt(draft, code).isPresent()) {
            throw rejected(MasterCodeItemIssueCode.SEGMENT_OVERLAP, code, "이 버전에 이미 있는 코드다");
        }
        MdmCodeItem item = new MdmCodeItem(draft.objectId(), code, draft.ver());
        write(item, values);
        item.setToVer(OPEN);
        itemRepository.saveAndFlush(item);
    }

    public void changeItem(VersionRef draft, String code, MasterCodeItemValues values) {
        requireLengths(values);
        requireDraft(draft);
        BigDecimal v = draft.ver();
        MdmCodeItem r = validAt(draft, code)
                .orElseThrow(() -> rejected(MasterCodeItemIssueCode.CODE_NOT_FOUND, code, "이 버전에 없는 코드다"));
        if (same(r.getFromVer(), v)) {
            Optional<MdmCodeItem> o = closedAt(draft, code);
            if (o.isPresent() && valuesOf(o.get()).equals(values)) {
                deleteItem(r);
                reopen(o.get());
                return;
            }
            write(r, values);
            itemRepository.saveAndFlush(r);
            return;
        }
        if (valuesOf(r).equals(values)) {
            return;
        }
        r.setToVer(v);
        itemRepository.saveAndFlush(r);
        MdmCodeItem n = new MdmCodeItem(draft.objectId(), code, v);
        write(n, values);
        n.setToVer(OPEN);
        itemRepository.saveAndFlush(n);
    }

    /** 코드 삭제 + 그 코드의 V 에 유효한 CATE_ITEM 연쇄(from = V 면 지우고, 아니면 to = V). 영향 cate_id 를 정렬해 돌려준다. */
    public List<String> removeItem(VersionRef draft, String code) {
        requireDraft(draft);
        BigDecimal v = draft.ver();
        MdmCodeItem r = validAt(draft, code)
                .orElseThrow(() -> rejected(MasterCodeItemIssueCode.CODE_NOT_FOUND, code, "이 버전에 없는 코드다"));
        if (same(r.getFromVer(), v)) {
            deleteItem(r);
        } else {
            r.setToVer(v);
            itemRepository.saveAndFlush(r);
        }
        TreeSet<String> closed = new TreeSet<>();
        for (MdmCodeCateItem ci : rows.cateItems(draft.objectId())) {
            if (!code.equals(ci.getCode()) || !valid(ci.getFromVer(), ci.getToVer(), v)) {
                continue;
            }
            if (same(ci.getFromVer(), v)) {
                deleteCateItem(ci);
            } else {
                ci.setToVer(v);
                cateItemRepository.saveAndFlush(ci);
            }
            closed.add(ci.getCateId());
        }
        return List.copyOf(closed);
    }

    /**
     * 코드 행 변경 여러 건을 차례로 적용한다 — 같은 순서로 {@link #addItem}·{@link #changeItem}·{@link #removeItem} 을
     * 부른 것과 쓰기·오류·돌려주는 값이 같다(코드 편집 합친 저장, 2026-10-01 쿼리 낭비 정리).
     *
     * <p>단건 메서드는 행마다 버전 행을 다시 읽고(DRAFT 확인) 그 코드의 ITEM·CATE_ITEM 을 전부 다시 읽는다. 여기서는 DRAFT
     * 확인을 첫 행에서 한 번만 하고, ITEM 은 한 번·CATE_ITEM 은 첫 삭제 행에서 한 번 읽어 메모리 목록으로 판정한다. 메모리
     * 목록은 앞 행의 쓰기(닫기·지우기·새 구간·다시 열기)를 그대로 반영한다 — 저장한 뒤 돌려받은 엔티티로 바꿔 끼우므로 트랜잭션
     * 밖(detached, merge)에서도 다음 행이 최신 상태를 본다. 쓰기는 단건 메서드와 같은 {@code saveAndFlush}·
     * {@code delete}+{@code flush} 다(같은 PK 를 지운 뒤 다시 넣는 경우 때문에 행마다 flush 한다, 클래스 설명 ②).
     *
     * @return 삭제한 코드 → 그 코드 때문에 닫거나 지운 소속의 cate_id(정렬), 삭제 행 순서
     */
    public Map<String, List<String>> applyItems(VersionRef draft, List<MasterCodeItemProjection.Change> changes) {
        Map<String, List<String>> closedCategories = new LinkedHashMap<>();
        ItemWork work = new ItemWork(draft);
        for (MasterCodeItemProjection.Change c : changes) {
            switch (c.status()) {
                case DELETED -> closedCategories.put(c.code(), work.remove(c.code()));
                case CHANGED -> work.change(c.code(), c.values());
                case ADDED -> work.add(c.code(), c.values());
            }
        }
        return closedCategories;
    }

    /** {@link #applyItems} 한 번의 메모리 상태 — 단건 메서드와 같은 판정을 DB 재조회 대신 이 목록으로 한다. */
    private final class ItemWork {

        private final VersionRef draft;
        private final BigDecimal v;
        private List<MdmCodeItem> items;
        private List<MdmCodeCateItem> cateItems;

        ItemWork(VersionRef draft) {
            this.draft = draft;
            this.v = draft.ver();
        }

        /** 단건 메서드의 {@code requireDraft} 자리 — 첫 행에서만 버전을 읽는다(그 뒤 버전 상태는 이 저장 안에서 바뀌지 않는다). */
        private void requireDraftOnce() {
            if (items == null) {
                requireDraft(draft);
                items = new ArrayList<>(rows.items(draft.objectId()));
            }
        }

        void add(String code, MasterCodeItemValues values) {
            requireLengths(values);
            requireDraftOnce();
            if (validAt(code).isPresent()) {
                throw rejected(MasterCodeItemIssueCode.SEGMENT_OVERLAP, code, "이 버전에 이미 있는 코드다");
            }
            MdmCodeItem item = new MdmCodeItem(draft.objectId(), code, v);
            write(item, values);
            item.setToVer(OPEN);
            items.add(itemRepository.saveAndFlush(item));
        }

        void change(String code, MasterCodeItemValues values) {
            requireLengths(values);
            requireDraftOnce();
            MdmCodeItem r = validAt(code)
                    .orElseThrow(() -> rejected(MasterCodeItemIssueCode.CODE_NOT_FOUND, code, "이 버전에 없는 코드다"));
            if (same(r.getFromVer(), v)) {
                Optional<MdmCodeItem> o = closedAt(code);
                if (o.isPresent() && valuesOf(o.get()).equals(values)) {
                    deleteItem(r);
                    dropSame(items, r);
                    o.get().setToVer(OPEN);
                    swap(items, o.get(), itemRepository.saveAndFlush(o.get()));
                    return;
                }
                write(r, values);
                swap(items, r, itemRepository.saveAndFlush(r));
                return;
            }
            if (valuesOf(r).equals(values)) {
                return;
            }
            r.setToVer(v);
            swap(items, r, itemRepository.saveAndFlush(r));
            MdmCodeItem n = new MdmCodeItem(draft.objectId(), code, v);
            write(n, values);
            n.setToVer(OPEN);
            items.add(itemRepository.saveAndFlush(n));
        }

        List<String> remove(String code) {
            requireDraftOnce();
            MdmCodeItem r = validAt(code)
                    .orElseThrow(() -> rejected(MasterCodeItemIssueCode.CODE_NOT_FOUND, code, "이 버전에 없는 코드다"));
            if (same(r.getFromVer(), v)) {
                deleteItem(r);
                dropSame(items, r);
            } else {
                r.setToVer(v);
                swap(items, r, itemRepository.saveAndFlush(r));
            }
            if (cateItems == null) {
                cateItems = new ArrayList<>(rows.cateItems(draft.objectId()));
            }
            TreeSet<String> closed = new TreeSet<>();
            for (MdmCodeCateItem ci : List.copyOf(cateItems)) {
                if (!code.equals(ci.getCode()) || !valid(ci.getFromVer(), ci.getToVer(), v)) {
                    continue;
                }
                if (same(ci.getFromVer(), v)) {
                    deleteCateItem(ci);
                    dropSame(cateItems, ci);
                } else {
                    ci.setToVer(v);
                    swap(cateItems, ci, cateItemRepository.saveAndFlush(ci));
                }
                closed.add(ci.getCateId());
            }
            return List.copyOf(closed);
        }

        private Optional<MdmCodeItem> validAt(String code) {
            return items.stream().filter(e -> code.equals(e.getCode()) && valid(e.getFromVer(), e.getToVer(), v))
                    .findFirst();
        }

        private Optional<MdmCodeItem> closedAt(String code) {
            return items.stream().filter(e -> code.equals(e.getCode()) && same(e.getToVer(), v)).findFirst();
        }
    }

    /** 목록에서 그 엔티티(같은 인스턴스)를 뺀다. */
    private static <T> void dropSame(List<T> list, T e) {
        for (int i = 0; i < list.size(); i++) {
            if (list.get(i) == e) {
                list.remove(i);
                return;
            }
        }
    }

    /** 저장 전 엔티티 자리에 저장이 돌려준 엔티티를 넣는다(트랜잭션 안이면 같은 인스턴스, 밖이면 merge 사본). */
    private static <T> void swap(List<T> list, T before, T after) {
        for (int i = 0; i < list.size(); i++) {
            if (list.get(i) == before) {
                list.set(i, after);
                return;
            }
        }
    }

    /** ITEM·CATE_ITEM 되돌리기(04:50-57). CATE 는 호출자가 거른다(TSK-06-04 몫, D3). */
    public void revert(VersionRef draft, MasterCodeSegmentKey key) {
        switch (key.table()) {
            case ITEM -> revertItem(draft, key.code());
            case CATE_ITEM -> revertCateItem(draft, key.cateId(), key.code());
            case CATE -> throw new UnsupportedOperationException("TSK-06-04 가 구현한다: revert(CATE)");
        }
    }

    public void revertItem(VersionRef draft, String code) {
        requireDraft(draft);
        BigDecimal v = draft.ver();
        Optional<MdmCodeItem> n = rows.items(draft.objectId()).stream()
                .filter(e -> code.equals(e.getCode()) && same(e.getFromVer(), v)).findFirst();
        Optional<MdmCodeItem> o = closedAt(draft, code);
        if (n.isEmpty() && o.isEmpty()) {
            throw nothingToRevert(code);
        }
        n.ifPresent(this::deleteItem);
        if (o.isEmpty()) {
            return;
        }
        reopen(o.get());
        if (n.isEmpty()) {
            reopenCascade(draft, code);
        }
    }

    public void revertCateItem(VersionRef draft, String cateId, String code) {
        requireDraft(draft);
        BigDecimal v = draft.ver();
        List<MdmCodeCateItem> mine = rows.cateItems(draft.objectId()).stream()
                .filter(e -> cateId.equals(e.getCateId()) && code.equals(e.getCode())).toList();
        Optional<MdmCodeCateItem> n = mine.stream().filter(e -> same(e.getFromVer(), v)).findFirst();
        Optional<MdmCodeCateItem> o = mine.stream().filter(e -> same(e.getToVer(), v)).findFirst();
        if (n.isEmpty() && o.isEmpty()) {
            throw nothingToRevert(cateId + "/" + code);
        }
        n.ifPresent(this::deleteCateItem);
        o.ifPresent(e -> {
            e.setToVer(OPEN);
            cateItemRepository.saveAndFlush(e);
        });
    }

    /** 코드 삭제 되돌리기의 연쇄 — to = V 인 소속 중 카테고리가 V 에 유효한 것만 다시 연다(D4). */
    private void reopenCascade(VersionRef draft, String code) {
        BigDecimal v = draft.ver();
        List<MdmCodeCate> cates = rows.cates(draft.objectId());
        for (MdmCodeCateItem ci : rows.cateItems(draft.objectId())) {
            if (!code.equals(ci.getCode()) || !same(ci.getToVer(), v)) {
                continue;
            }
            boolean cateAlive = cates.stream().anyMatch(c -> c.getCateId().equals(ci.getCateId())
                    && valid(c.getFromVer(), c.getToVer(), v));
            if (cateAlive) {
                ci.setToVer(OPEN);
                cateItemRepository.saveAndFlush(ci);
            }
        }
    }

    // ── 공통 ────────────────────────────────────────────────────────────

    /** 쓰기 전제 — 버전 행이 없으면 MDM001, DRAFT 가 아니면 MDM002. */
    void requireDraft(VersionRef ref) {
        MdmCodeVer ver = rows.versions(ref.objectId()).stream().filter(e -> same(e.getVer(), ref.ver())).findFirst()
                .orElseThrow(() -> MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT));
        if (!VersionStatus.DRAFT.name().equals(ver.getStatus())) {
            throw MdmErrors.of(MdmErrorCode.NOT_DRAFT);
        }
    }

    private Optional<MdmCodeItem> validAt(VersionRef ref, String code) {
        return rows.items(ref.objectId()).stream()
                .filter(e -> code.equals(e.getCode()) && valid(e.getFromVer(), e.getToVer(), ref.ver())).findFirst();
    }

    private Optional<MdmCodeItem> closedAt(VersionRef ref, String code) {
        return rows.items(ref.objectId()).stream()
                .filter(e -> code.equals(e.getCode()) && same(e.getToVer(), ref.ver())).findFirst();
    }

    private void reopen(MdmCodeItem o) {
        o.setToVer(OPEN);
        itemRepository.saveAndFlush(o);
    }

    private void deleteItem(MdmCodeItem item) {
        itemRepository.delete(item);
        itemRepository.flush();
    }

    private void deleteCateItem(MdmCodeCateItem item) {
        cateItemRepository.delete(item);
        cateItemRepository.flush();
    }

    private static RuntimeException nothingToRevert(String key) {
        return MdmErrors.of(MdmErrorCode.INVALID_INPUT, "되돌릴 변경이 없습니다: " + key, List.of());
    }

    static RuntimeException rejected(MasterCodeItemIssueCode code, String itemKey, String message) {
        MdmCheckIssue issue = MasterCodeItemChecks.issue(code, itemKey, "code", message);
        return MasterCodeRejections.saveRejected(List.of(issue));
    }

    private static void requireLengths(MasterCodeItemValues values) {
        if (values.lvls() == null || values.lvls().size() != MasterCodeConventions.LVL_SLOTS
                || values.attrs() == null || values.attrs().size() != MasterCodeConventions.ATTR_SLOTS) {
            throw new IllegalArgumentException("lvls 는 " + MasterCodeConventions.LVL_SLOTS + "칸, attrs 는 "
                    + MasterCodeConventions.ATTR_SLOTS + "칸이다");
        }
    }

    // ── 엔티티 ↔ 값 ──────────────────────────────────────────────────────

    public static MasterCodeItemRow row(MdmCodeItem e) {
        return new MasterCodeItemRow(e.getCode(), e.getFromVer(), e.getToVer(), valuesOf(e));
    }

    public static MasterCodeItemValues valuesOf(MdmCodeItem e) {
        return new MasterCodeItemValues(e.getName(), e.getAlterName(), e.getSeq(), e.getDescription(),
                Arrays.asList(e.getLvl1(), e.getLvl2(), e.getLvl3(), e.getLvl4(), e.getLvl5()),
                Arrays.asList(e.getAttr01(), e.getAttr02(), e.getAttr03(), e.getAttr04(), e.getAttr05(),
                        e.getAttr06(), e.getAttr07(), e.getAttr08(), e.getAttr09(), e.getAttr10()));
    }

    static CategoryDefinition definition(MdmCodeCate e) {
        return new CategoryDefinition(e.getCateId(), e.getCateName(), CategoryKind.valueOf(e.getDefKind()),
                e.getDefExpr(), e.getDefTarget() == null ? null : CategoryDefTarget.valueOf(e.getDefTarget()),
                e.getDescription());
    }

    private static void write(MdmCodeItem e, MasterCodeItemValues v) {
        e.setName(v.name());
        e.setAlterName(v.alterName());
        e.setSeq(v.seq());
        e.setDescription(v.description());
        List<String> l = v.lvls();
        e.setLvl1(l.get(0));
        e.setLvl2(l.get(1));
        e.setLvl3(l.get(2));
        e.setLvl4(l.get(3));
        e.setLvl5(l.get(4));
        List<String> a = v.attrs();
        e.setAttr01(a.get(0));
        e.setAttr02(a.get(1));
        e.setAttr03(a.get(2));
        e.setAttr04(a.get(3));
        e.setAttr05(a.get(4));
        e.setAttr06(a.get(5));
        e.setAttr07(a.get(6));
        e.setAttr08(a.get(7));
        e.setAttr09(a.get(8));
        e.setAttr10(a.get(9));
    }
}
