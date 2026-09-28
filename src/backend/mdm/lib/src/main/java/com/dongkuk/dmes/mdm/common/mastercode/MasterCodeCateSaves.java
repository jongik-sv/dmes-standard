package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.contract.category.CategoryConventions;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.category.CategoryKind;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentService;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 카테고리·TABLE 소속 두 그리드의 저장 판정과 쓰기(TSK-06-04 design.md §1.4 를 {@code CodeCateEditService} 에서 뽑았다).
 * 카테고리 편집({@code codeCateEdit.save})과 코드 편집 합친 저장({@code codeItemEdit.save}, 2026-09-28 화면 합치기)이 같은
 * 코드를 쓴다.
 *
 * <p>{@link #project} 는 순수 규칙이다 — V 모습의 카테고리 정의와 "유효 코드" 집합을 호출자가 준다. 합친 저장은 코드 행
 * 변경을 먼저 적용한 V 모습의 코드 집합을 넘겨, 같은 요청에서 새로 넣은 코드는 소속으로 받고 지운 코드는 거부한다.
 * {@link #apply} 는 가드 없이 쓴다 — 호출자가 같은 트랜잭션에서 먼저 {@code VersionWriteGuard.beginDraftWrite} 를 한 번
 * 부른다(ROW_VERSION 은 호출자 몫, 불변 규칙 8).
 */
public final class MasterCodeCateSaves {

    /** 두 그리드의 판정 결과 — 이슈가 없을 때만 {@link #apply} 한다. */
    public record Plan(List<MdmCheckIssue> issues, List<MasterCodeCateProjection.Change> categoryChanges,
                       List<MasterCodeCateMemberProjection.Change> memberChanges) {

        /** BASE 는 그리드에 섞여 와도 쓰기 전에 거른다(MDM012, 불변 규칙 2). */
        public boolean touchesBase() {
            return categoryChanges.stream().anyMatch(c -> CategoryConventions.BASE_CATE_ID.equals(c.cateId()))
                    || memberChanges.stream().anyMatch(c -> CategoryConventions.BASE_CATE_ID.equals(c.cateId()));
        }
    }

    private MasterCodeCateSaves() {
    }

    /**
     * V 모습에 두 그리드를 메모리로 적용하고 touched 카테고리·소속 행을 검사한다.
     *
     * @param cateDefs   V 에 유효한 카테고리 정의
     * @param validCodes 소속으로 넣을 수 있는 코드(V 에 유효한 코드 — 합친 저장이면 코드 행 변경을 적용한 뒤 모습)
     */
    public static Plan project(List<CategoryDefinition> cateDefs, Set<String> validCodes,
                               List<Map<String, Object>> categoryRows, List<Map<String, Object>> memberRows) {
        MasterCodeCateProjection.Result catResult = MasterCodeCateProjection.apply(cateDefs, categoryRows);
        List<MdmCheckIssue> issues = new ArrayList<>(catResult.issues());
        for (CategoryDefinition def : catResult.viewAfter()) {
            if (catResult.touched().contains(def.cateId())) {
                issues.addAll(MasterCodeCateChecks.checkDefinition(def));
            }
        }

        Map<String, CategoryDefinition> catAfterById = new LinkedHashMap<>();
        for (CategoryDefinition def : catResult.viewAfter()) {
            catAfterById.put(def.cateId(), def);
        }

        List<MasterCodeCateMemberProjection.Change> memberChanges = MasterCodeCateMemberProjection.parse(memberRows);
        for (MasterCodeCateMemberProjection.Change c : memberChanges) {
            CategoryDefinition target = catAfterById.get(c.cateId());
            if (target == null) {
                issues.add(new MdmCheckIssue(MasterCodeCateIssueCode.CATE_NOT_FOUND.name(), "이 버전에 없는 카테고리다",
                        "cateId", c.cateId()));
                continue;
            }
            if (target.defKind() != CategoryKind.TABLE) {
                issues.add(new MdmCheckIssue(MasterCodeCateIssueCode.DEF_KIND_IMMUTABLE.name(), "TABLE 카테고리가 아니다",
                        "cateId", c.cateId()));
                continue;
            }
            if (c.status() == MasterCodeCateMemberProjection.RowStatus.ADDED && !validCodes.contains(c.code())) {
                issues.add(new MdmCheckIssue(MasterCodeCateIssueCode.MEMBER_CODE_NOT_FOUND.name(), "이 버전에 없는 코드다",
                        "code", c.code()));
            }
        }
        return new Plan(List.copyOf(issues), catResult.changes(), memberChanges);
    }

    /** 카테고리 → 소속(빼기 → 넣기) 순으로 쓴다. 가드·ROW_VERSION 은 호출자 몫이다. */
    public static void apply(MasterCodeSegmentService segments, VersionRef ref, Plan plan) {
        for (MasterCodeCateProjection.Change c : plan.categoryChanges()) {
            switch (c.status()) {
                case DELETED -> segments.closeCategory(ref, c.cateId());
                case CHANGED -> segments.changeCategory(ref, c.definition());
                case ADDED -> segments.addCategory(ref, c.definition());
            }
        }
        Map<String, Set<String>> toRemove = new LinkedHashMap<>();
        Map<String, Set<String>> toAdd = new LinkedHashMap<>();
        for (MasterCodeCateMemberProjection.Change c : plan.memberChanges()) {
            Map<String, Set<String>> bucket = c.status() == MasterCodeCateMemberProjection.RowStatus.DELETED
                    ? toRemove : toAdd;
            bucket.computeIfAbsent(c.cateId(), k -> new LinkedHashSet<>()).add(c.code());
        }
        toRemove.forEach((cateId, codes) -> segments.removeCategoryMembers(ref, cateId, codes));
        toAdd.forEach((cateId, codes) -> segments.addCategoryMembers(ref, cateId, codes));
    }
}
