package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.category.CategoryKind;
import com.dongkuk.dmes.mdm.contract.category.CategoryOwner;
import com.dongkuk.dmes.mdm.contract.category.MaruIdRules;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * 카테고리 정의 저장 검사(TSK-06-04 design.md §2) — 순수 규칙(Spring·DB 없음). cate_id 형식({@link MaruIdRules})·필수값·
 * defTarget 허용 목록({@link CategoryOwner#allowedDefTargets()})·defExpr 문법({@link Pattern#compile}) 을 본다. 한 정의에
 * 첫 위반 하나만 낸다(계층 검사 {@code MasterCodeItemChecks} 와 같은 관례).
 *
 * <p>{@link MasterCodeCateSegmentOps}(단건 add·change 직접 방어)와 {@code CodeCateEditService}(그리드 검사, D2 §1.4 ①)가
 * 모두 이 클래스를 쓴다 — 새 판정 엔진을 두 번 만들지 않는다.
 */
public final class MasterCodeCateChecks {

    private static final Pattern FORBIDDEN = Pattern.compile(MaruIdRules.FORBIDDEN_CHAR_PATTERN);

    private MasterCodeCateChecks() {
    }

    /** 카테고리 정의 하나의 저장 검사. 위반이 없으면 빈 목록. */
    public static List<MdmCheckIssue> checkDefinition(CategoryDefinition def) {
        List<MdmCheckIssue> issues = new ArrayList<>();
        String cateId = def.cateId();
        if (cateId == null || cateId.isEmpty()) {
            issues.add(issue(MasterCodeCateIssueCode.CATE_ID_REQUIRED, cateId, "cateId", "카테고리 ID를 넣으세요"));
        } else if (FORBIDDEN.matcher(cateId).find()) {
            issues.add(issue(MasterCodeCateIssueCode.CATE_ID_FORBIDDEN_CHAR, cateId, "cateId",
                    "카테고리 ID에 점·콤마·공백을 쓸 수 없다"));
        }
        if (def.cateName() == null || def.cateName().isEmpty()) {
            issues.add(issue(MasterCodeCateIssueCode.CATE_NAME_REQUIRED, cateId, "cateName", "카테고리 이름을 넣으세요"));
        }
        if (def.defKind() == CategoryKind.REGEX) {
            if (def.defTarget() == null || !CategoryOwner.MASTER_CODE.allowedDefTargets().contains(def.defTarget())) {
                issues.add(issue(MasterCodeCateIssueCode.DEF_TARGET_NOT_ALLOWED, cateId, "defTarget",
                        "허용되지 않는 대상 칸이다: " + def.defTarget()));
            }
            if (!validRegex(def.defExpr())) {
                issues.add(issue(MasterCodeCateIssueCode.INVALID_REGEX, cateId, "defExpr",
                        "정규식 문법이 올바르지 않다: " + def.defExpr()));
            }
        }
        return issues;
    }

    /** {@link MasterCodeCategoryResolver} 와 같은 기준(불변 규칙 4·6) — null·컴파일 실패는 false. */
    public static boolean validRegex(String expr) {
        if (expr == null) {
            return false;
        }
        try {
            Pattern.compile(expr);
            return true;
        } catch (PatternSyntaxException e) {
            return false;
        }
    }

    static MdmCheckIssue issue(MasterCodeCateIssueCode code, String itemKey, String field, String message) {
        return new MdmCheckIssue(code.name(), message, field, itemKey);
    }
}
