package com.dongkuk.dmes.mdm.common.mastercode;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeSegments.same;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeSegments.valid;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.category.CategoryConventions;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.entity.MdmCodeCate;
import com.dongkuk.dmes.mdm.entity.MdmCodeCateItem;
import com.dongkuk.dmes.mdm.entity.MdmCodeItem;
import com.dongkuk.dmes.mdm.entity.MdmCodeVer;
import com.dongkuk.dmes.mdm.repository.MdmCodeCateItemRepository;
import com.dongkuk.dmes.mdm.repository.MdmCodeCateRepository;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * 선분 조작 본체 — 계약 {@code MasterCodeSegmentService} 의 TSK-06-04 몫(카테고리·TABLE 소속 추가·수정·닫기·되돌리기,
 * design.md §1 갈래 1). {@link MasterCodeItemSegmentOps}(TSK-06-03) 자매이며, 그 클래스는 손대지 않는다("CATE 는 호출자가
 * 거른다"). 원천 04:95(BASE 생성)·1027(예약)·489-504(카테고리 연쇄).
 *
 * <p>쓰기는 DRAFT V 에서만 한다(아니면 MDM002). ROW_VERSION 은 받지도 올리지도 않는다 — 호출자가 같은 트랜잭션에서 먼저
 * {@code VersionWriteGuard.beginDraftWrite} 를 부른다(불변 규칙 8). BASE(cate_id="BASE")는 모든 조작에서 MDM012 다(불변
 * 규칙 2).
 */
@Component
public class MasterCodeCateSegmentOps {

    private static final BigDecimal OPEN = MasterCodeConventions.OPEN_TO_VER;

    private final MasterCodeRows rows;
    private final MdmCodeCateRepository cateRepository;
    private final MdmCodeCateItemRepository cateItemRepository;

    public MasterCodeCateSegmentOps(MasterCodeRows rows, MdmCodeCateRepository cateRepository,
                                    MdmCodeCateItemRepository cateItemRepository) {
        this.rows = rows;
        this.cateRepository = cateRepository;
        this.cateItemRepository = cateItemRepository;
    }

    // ── 쓰기: 카테고리 ──────────────────────────────────────────────────

    public void addCategory(VersionRef draft, CategoryDefinition definition) {
        requireDraft(draft);
        requireNotBase(definition.cateId());
        requireValidDefinition(definition);
        if (validAt(draft, definition.cateId()).isPresent()) {
            throw rejected(MasterCodeCateIssueCode.CATE_ID_OVERLAP, definition.cateId(), "cateId", "이 버전에 이미 있는 카테고리다");
        }
        MdmCodeCate cate = new MdmCodeCate(draft.objectId(), definition.cateId(), draft.ver(), definition.defKind().name());
        write(cate, definition);
        cate.setToVer(OPEN);
        cateRepository.saveAndFlush(cate);
    }

    public void changeCategory(VersionRef draft, CategoryDefinition definition) {
        requireDraft(draft);
        requireNotBase(definition.cateId());
        BigDecimal v = draft.ver();
        MdmCodeCate r = validAt(draft, definition.cateId())
                .orElseThrow(() -> rejected(MasterCodeCateIssueCode.CATE_NOT_FOUND, definition.cateId(), "cateId",
                        "이 버전에 없는 카테고리다"));
        if (!r.getDefKind().equals(definition.defKind().name())) {
            throw rejected(MasterCodeCateIssueCode.DEF_KIND_IMMUTABLE, definition.cateId(), "defKind", "정의 종류는 바꿀 수 없다");
        }
        requireValidDefinition(definition);
        if (same(r.getFromVer(), v)) {
            Optional<MdmCodeCate> o = closedAt(draft, definition.cateId());
            if (o.isPresent() && MasterCodeItemSegmentOps.definition(o.get()).equals(definition)) {
                deleteCate(r);
                reopen(o.get());
                return;
            }
            write(r, definition);
            cateRepository.saveAndFlush(r);
            return;
        }
        if (MasterCodeItemSegmentOps.definition(r).equals(definition)) {
            return;
        }
        r.setToVer(v);
        cateRepository.saveAndFlush(r);
        MdmCodeCate n = new MdmCodeCate(draft.objectId(), definition.cateId(), v, definition.defKind().name());
        write(n, definition);
        n.setToVer(OPEN);
        cateRepository.saveAndFlush(n);
    }

    /** TABLE 이면 그 카테고리의 열린 소속을 모두 같은 V 로 닫는다(불변 규칙 12, 04:504). */
    public void closeCategory(VersionRef draft, String cateId) {
        requireDraft(draft);
        requireNotBase(cateId);
        BigDecimal v = draft.ver();
        MdmCodeCate r = validAt(draft, cateId)
                .orElseThrow(() -> rejected(MasterCodeCateIssueCode.CATE_NOT_FOUND, cateId, "cateId", "이 버전에 없는 카테고리다"));
        if (same(r.getFromVer(), v)) {
            deleteCate(r);
        } else {
            r.setToVer(v);
            cateRepository.saveAndFlush(r);
        }
        for (MdmCodeCateItem ci : rows.cateItems(draft.objectId())) {
            if (!cateId.equals(ci.getCateId()) || !valid(ci.getFromVer(), ci.getToVer(), v)) {
                continue;
            }
            if (same(ci.getFromVer(), v)) {
                deleteCateItem(ci);
            } else {
                ci.setToVer(v);
                cateItemRepository.saveAndFlush(ci);
            }
        }
    }

    // ── 쓰기: TABLE 소속 ────────────────────────────────────────────────

    /**
     * 넣는 코드는 그 버전에 유효해야 한다(불변 규칙 5) — 하나라도 없으면 전체 거부, Set 조회 한 번으로 판정(성능, 불변
     * 규칙 17). 1,000건 규모에서도 행마다 flush 하지 않는다(함정 4) — 배치를 모아 한 번만 저장·flush 한다.
     */
    public void addCategoryMembers(VersionRef draft, String cateId, Set<String> codes) {
        requireDraft(draft);
        requireNotBase(cateId);
        if (codes == null || codes.isEmpty()) {
            return;
        }
        BigDecimal v = draft.ver();
        Set<String> validCodes = rows.items(draft.objectId()).stream()
                .filter(e -> valid(e.getFromVer(), e.getToVer(), v))
                .map(MdmCodeItem::getCode)
                .collect(Collectors.toSet());
        List<String> missing = codes.stream().filter(c -> !validCodes.contains(c)).sorted().toList();
        if (!missing.isEmpty()) {
            List<MdmCheckIssue> issues = missing.stream()
                    .map(c -> MasterCodeCateChecks.issue(MasterCodeCateIssueCode.MEMBER_CODE_NOT_FOUND, c, "code",
                            "이 버전에 없는 코드다"))
                    .toList();
            throw MasterCodeRejections.saveRejected(issues);
        }
        Set<String> existing = rows.cateItems(draft.objectId()).stream()
                .filter(ci -> cateId.equals(ci.getCateId()) && valid(ci.getFromVer(), ci.getToVer(), v))
                .map(MdmCodeCateItem::getCode)
                .collect(Collectors.toSet());
        List<MdmCodeCateItem> toSave = new ArrayList<>();
        for (String code : new TreeSet<>(codes)) {
            if (existing.contains(code)) {
                continue;
            }
            MdmCodeCateItem ci = new MdmCodeCateItem(draft.objectId(), cateId, code, v);
            ci.setToVer(OPEN);
            toSave.add(ci);
        }
        if (!toSave.isEmpty()) {
            cateItemRepository.saveAll(toSave);
            cateItemRepository.flush();
        }
    }

    /**
     * 뺄 때는 유효성 검사를 하지 않는다(고아 소속 정리 허용, 불변 규칙 5). 1,000건 규모에서도 행마다 flush 하지 않는다
     * (함정 4) — 삭제 배치·닫기 배치를 모아 각각 한 번만 처리한다.
     */
    public void removeCategoryMembers(VersionRef draft, String cateId, Set<String> codes) {
        requireDraft(draft);
        requireNotBase(cateId);
        if (codes == null || codes.isEmpty()) {
            return;
        }
        BigDecimal v = draft.ver();
        Map<String, MdmCodeCateItem> byCode = rows.cateItems(draft.objectId()).stream()
                .filter(ci -> cateId.equals(ci.getCateId()) && codes.contains(ci.getCode())
                        && valid(ci.getFromVer(), ci.getToVer(), v))
                .collect(Collectors.toMap(MdmCodeCateItem::getCode, e -> e, (a, b) -> a));
        List<MdmCodeCateItem> toDelete = new ArrayList<>();
        List<MdmCodeCateItem> toClose = new ArrayList<>();
        for (String code : new TreeSet<>(codes)) {
            MdmCodeCateItem e = byCode.get(code);
            if (e == null) {
                continue;
            }
            if (same(e.getFromVer(), v)) {
                toDelete.add(e);
            } else {
                e.setToVer(v);
                toClose.add(e);
            }
        }
        if (!toDelete.isEmpty()) {
            cateItemRepository.deleteAll(toDelete);
        }
        if (!toClose.isEmpty()) {
            cateItemRepository.saveAll(toClose);
        }
        if (!toDelete.isEmpty() || !toClose.isEmpty()) {
            cateItemRepository.flush();
        }
    }

    // ── 되돌리기 ────────────────────────────────────────────────────────

    /** CATE 되돌리기(04:50-57). closeCategory 의 연쇄로 닫혔던 소속을 대칭으로 다시 연다(불변 규칙 13, reopenCascade 대칭). */
    public void revertCate(VersionRef draft, String cateId) {
        requireDraft(draft);
        requireNotBase(cateId);
        BigDecimal v = draft.ver();
        List<MdmCodeCate> mine = rows.cates(draft.objectId()).stream().filter(e -> cateId.equals(e.getCateId())).toList();
        Optional<MdmCodeCate> n = mine.stream().filter(e -> same(e.getFromVer(), v)).findFirst();
        Optional<MdmCodeCate> o = mine.stream().filter(e -> same(e.getToVer(), v)).findFirst();
        if (n.isEmpty() && o.isEmpty()) {
            throw nothingToRevert(cateId);
        }
        n.ifPresent(this::deleteCate);
        if (o.isEmpty()) {
            return;
        }
        reopen(o.get());
        if (n.isEmpty()) {
            reopenMembersCascade(draft, cateId);
        }
    }

    private void reopenMembersCascade(VersionRef draft, String cateId) {
        BigDecimal v = draft.ver();
        for (MdmCodeCateItem ci : rows.cateItems(draft.objectId())) {
            if (!cateId.equals(ci.getCateId()) || !same(ci.getToVer(), v)) {
                continue;
            }
            ci.setToVer(OPEN);
            cateItemRepository.saveAndFlush(ci);
        }
    }

    // ── 공통 ────────────────────────────────────────────────────────────

    private void requireDraft(VersionRef ref) {
        MdmCodeVer ver = rows.versions(ref.objectId()).stream().filter(e -> same(e.getVer(), ref.ver())).findFirst()
                .orElseThrow(() -> MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT));
        if (!VersionStatus.DRAFT.name().equals(ver.getStatus())) {
            throw MdmErrors.of(MdmErrorCode.NOT_DRAFT);
        }
    }

    private static void requireNotBase(String cateId) {
        if (CategoryConventions.BASE_CATE_ID.equals(cateId)) {
            throw MdmErrors.of(MdmErrorCode.RESERVED_CATEGORY);
        }
    }

    private static void requireValidDefinition(CategoryDefinition definition) {
        List<MdmCheckIssue> issues = MasterCodeCateChecks.checkDefinition(definition);
        if (!issues.isEmpty()) {
            throw MasterCodeRejections.saveRejected(issues);
        }
    }

    private Optional<MdmCodeCate> validAt(VersionRef ref, String cateId) {
        return rows.cates(ref.objectId()).stream()
                .filter(e -> cateId.equals(e.getCateId()) && valid(e.getFromVer(), e.getToVer(), ref.ver())).findFirst();
    }

    private Optional<MdmCodeCate> closedAt(VersionRef ref, String cateId) {
        return rows.cates(ref.objectId()).stream()
                .filter(e -> cateId.equals(e.getCateId()) && same(e.getToVer(), ref.ver())).findFirst();
    }

    private void reopen(MdmCodeCate o) {
        o.setToVer(OPEN);
        cateRepository.saveAndFlush(o);
    }

    private void deleteCate(MdmCodeCate cate) {
        cateRepository.delete(cate);
        cateRepository.flush();
    }

    private void deleteCateItem(MdmCodeCateItem item) {
        cateItemRepository.delete(item);
        cateItemRepository.flush();
    }

    private static RuntimeException nothingToRevert(String cateId) {
        return MdmErrors.of(MdmErrorCode.INVALID_INPUT, "되돌릴 변경이 없습니다: " + cateId, List.of());
    }

    static RuntimeException rejected(MasterCodeCateIssueCode code, String itemKey, String field, String message) {
        MdmCheckIssue issue = MasterCodeCateChecks.issue(code, itemKey, field, message);
        return MasterCodeRejections.saveRejected(List.of(issue));
    }

    private static void write(MdmCodeCate e, CategoryDefinition def) {
        e.setCateName(def.cateName());
        e.setDefKind(def.defKind().name());
        e.setDefExpr(def.defExpr());
        e.setDefTarget(def.defTarget() == null ? null : def.defTarget().name());
        e.setDescription(def.description());
    }
}
