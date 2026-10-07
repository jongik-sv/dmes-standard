package com.dongkuk.dmes.mdm.common.segment;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.support.MdmTextLimits;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget;
import com.dongkuk.dmes.mdm.contract.category.CategoryOwner;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * 05 「저장 경로와 검증」 검사 순서 1~7(C0~C7). 식 엔진을 쓰지 않는다(01 8절).
 *
 * <ul>
 *   <li>C0 경로별 집합 — SCREEN·CSV 는 1·2·3·4·5·5-1·5-2(·6·7), API 는 1·2 와 길이 검사({@link #lengthIssues})만
 *       ({@link #contentIssues} 가 API 면 길이 이슈만 돌려준다).</li>
 *   <li>1·2 는 즉시 거부한다({@link #requireActive}·{@link #requireSourcePath} 가 던진다).</li>
 *   <li>3~6 은 이슈를 모아 한 번에 거부한다({@link #rejected}). 이슈 코드는 {@code CHK3}~{@code CHK7}, {@code CHK5-1},
 *       {@code CHK5-2} 다.</li>
 * </ul>
 * <p>길이 검사(이슈 코드 {@code LEN})는 ORA-12899 예방이다 — 키·계층 칸은 50자(VARCHAR2(50 CHAR)), 이름·약칭·설명·추가 컬럼·
 * 카테고리 이름·식은 4000바이트(VARCHAR2(4000 BYTE))를 {@link MdmTextLimits} 로 잰다.
 *
 * 판정 값은 모두 잠금 뒤 네이티브로 읽은 값이다(L1).
 */
@Component
public class DataItemChecks {

    /** 길이 상한 위반 이슈 코드(검사 번호가 없는 별도 검사). */
    private static final String LEN = "LEN";

    private static final Pattern LVL_BAD_CHAR = Pattern.compile("[,\\s]");

    private final Map<String, Pattern> patterns = new ConcurrentHashMap<>();

    /** 검사 1 — DEPRECATED 면 모든 쓰기 거부. */
    public void requireActive(LockedMaruData data) {
        if (LockedMaruData.DEPRECATED.equals(data.status())) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, DataItemMessages.DEPRECATED + ": " + data.maruDataId(),
                    List.of(issue("CHK1", DataItemMessages.DEPRECATED, null, null)));
        }
    }

    /** 검사 2 — SCREEN·CSV 는 MDM 원천, API 는 EXTERNAL 이고 호출 시스템 = source_system. */
    public void requireSourcePath(DataSavePath path, LockedMaruData data, String callerSystem) {
        boolean ok = switch (path) {
            case SCREEN, CSV -> LockedMaruData.MDM.equals(data.sourceKind());
            case API -> LockedMaruData.EXTERNAL.equals(data.sourceKind()) && callerSystem != null
                    && callerSystem.equals(data.sourceSystem());
        };
        if (!ok) {
            String detail = DataItemMessages.SOURCE_MISMATCH + ": " + data.maruDataId() + " 원천 " + data.sourceKind()
                    + (data.sourceSystem() != null ? "(" + data.sourceSystem() + ")" : "") + ", 경로 " + path
                    + (callerSystem != null ? "(" + callerSystem + ")" : "");
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, detail,
                    List.of(issue("CHK2", DataItemMessages.SOURCE_MISMATCH, null, null)));
        }
    }

    /** C0 — 경로별 행 내용 검사(3·4·5·5-1·5-2). API 는 행 내용은 검사하지 않고 칸 길이(ORA-12899 예방)만 검사한다. */
    public List<MdmCheckIssue> contentIssues(DataSavePath path, LockedMaruData data, String code, DataItemValue value,
                                             boolean isNew, HierarchyIndex index) {
        if (path == DataSavePath.API) {
            return lengthIssues(code, value, isNew);
        }
        List<MdmCheckIssue> issues = new ArrayList<>(rowIssues(data, code, value, isNew));
        issues.addAll(hierarchyIssues(index, code, value));
        return issues;
    }

    /** 검사 3·4·5, 5-1 의 형식(중간 칸·콤마·공백), 5-2, 그리고 길이 검사({@link #lengthIssues}). */
    public List<MdmCheckIssue> rowIssues(LockedMaruData data, String code, DataItemValue value, boolean isNew) {
        List<MdmCheckIssue> issues = new ArrayList<>();
        if (isNew && LockedMaruData.MDM.equals(data.sourceKind())) {
            if (code == null || code.isEmpty()) {
                issues.add(issue("CHK3", DataItemMessages.KEY_REQUIRED, "code", code));
            } else if (!pattern(data.codePattern()).matcher(code).matches()) {
                issues.add(issue("CHK3", DataItemMessages.KEY_PATTERN + "(" + data.codePattern() + "): " + code, "code",
                        code));
            }
        }
        if (value.name() == null) {
            issues.add(issue("CHK4", DataItemMessages.NAME_REQUIRED, "name", code));
        }
        for (int i = 1; i <= DataItemValue.ATTR_COUNT; i++) {
            if (value.attr(i) != null && data.attrName(i) == null) {
                String field = String.format("attr%02d", i);
                issues.add(issue("CHK5", DataItemMessages.ATTR_NO_LABEL + ": " + field, field, code));
            }
        }
        for (int i = 2; i <= DataItemValue.LVL_COUNT; i++) {
            if (value.lvl(i) != null && value.lvl(i - 1) == null) {
                issues.add(issue("CHK5-1", DataItemMessages.LVL_GAP + ": lvl" + (i - 1), "lvl" + (i - 1), code));
                break;
            }
        }
        for (int i = 1; i <= DataItemValue.LVL_COUNT; i++) {
            String v = value.lvl(i);
            if (v != null && LVL_BAD_CHAR.matcher(v).find()) {
                issues.add(issue("CHK5-1", DataItemMessages.LVL_FORMAT + ": lvl" + i, "lvl" + i, code));
            }
        }
        for (int i = data.lvlCnt() + 1; i <= DataItemValue.LVL_COUNT; i++) {
            if (value.lvl(i) != null) {
                issues.add(issue("CHK5-2", DataItemMessages.LVL_OVER_COUNT + "(" + data.lvlCnt() + "): lvl" + i,
                        "lvl" + i, code));
                break;
            }
        }
        issues.addAll(lengthIssues(code, value, isNew));
        return issues;
    }

    /**
     * 칸 길이 검사(이슈 코드 {@code LEN}, ORA-12899 예방) — 경로와 원천에 상관없이 DB 에 쓰는 값이면 SCREEN·CSV·API 모두 돌린다.
     * 키는 신규일 때만(수정은 저장된 키를 그대로 쓴다). {@link #rowIssues} 가 이 결과를 이미 포함하므로 SCREEN·CSV 에서 따로 더하지 않는다.
     */
    public List<MdmCheckIssue> lengthIssues(String code, DataItemValue value, boolean isNew) {
        List<MdmCheckIssue> issues = new ArrayList<>();
        if (isNew && MdmTextLimits.overChars(code, MdmTextLimits.KEY_CHARS_MAX)) {
            issues.add(keyTooLong("키 값", "code", code));
        }
        addTextIssue(issues, "이름", "name", value.name(), code);
        addTextIssue(issues, "약칭", "alterName", value.alterName(), code);
        addTextIssue(issues, "설명", "description", value.description(), code);
        for (int i = 1; i <= DataItemValue.ATTR_COUNT; i++) {
            String field = String.format("attr%02d", i);
            addTextIssue(issues, "추가 컬럼 " + String.format("%02d", i) + " 값", field, value.attr(i), code);
        }
        for (int i = 1; i <= DataItemValue.LVL_COUNT; i++) {
            if (MdmTextLimits.overChars(value.lvl(i), MdmTextLimits.KEY_CHARS_MAX)) {
                issues.add(keyTooLong("계층 " + i + " 칸 값", "lvl" + i, code));
            }
        }
        return issues;
    }

    /** 검사 5-1 의 대조 — 같은 값(그룹·키)의 앞 칸이 다른 행이 있으면 거부(닫힌 키의 마지막 행 포함). */
    public List<MdmCheckIssue> hierarchyIssues(HierarchyIndex index, String code, DataItemValue value) {
        List<String> conflicts = index.conflicts(code, value.lvlChain());
        if (conflicts.isEmpty()) {
            return List.of();
        }
        return List.of(issue("CHK5-1", DataItemMessages.LVL_CONFLICT + ": " + String.join(", ", conflicts), "lvl", code));
    }

    /** 검사 7 — 소속(TABLE) 등록은 항목이 열려 있고 카테고리가 열려 있으며 TABLE 일 때만. */
    public List<MdmCheckIssue> membershipIssues(String code, List<ItemSegmentRow> itemRows,
                                                List<CateSegmentRow> cateRows) {
        List<MdmCheckIssue> issues = new ArrayList<>();
        if (itemRows.stream().noneMatch(ItemSegmentRow::isOpen)) {
            issues.add(issue("CHK7", DataItemMessages.MEMBER_NOT_ALLOWED + ": 열린 항목이 아닙니다", "code", code));
        }
        CateSegmentRow cate = cateRows.stream().filter(CateSegmentRow::isOpen).findFirst().orElse(null);
        if (cate == null) {
            issues.add(issue("CHK7", DataItemMessages.MEMBER_NOT_ALLOWED + ": 열린 카테고리가 아닙니다", "cateId", code));
        } else if (!DataCateValue.TABLE.equals(cate.value().defKind())) {
            issues.add(issue("CHK7", DataItemMessages.MEMBER_NOT_ALLOWED + ": TABLE 카테고리가 아닙니다", "cateId", code));
        }
        return issues;
    }

    /** 카테고리 정의 형식 — REGEX 는 식·대상(05 허용값)·문법, TABLE 은 식·대상 없음(V10 CK_TB_MDM_DATA_CATE_DEF). */
    public List<MdmCheckIssue> cateDefIssues(String cateId, DataCateValue value) {
        List<MdmCheckIssue> issues = new ArrayList<>();
        if (cateId == null || cateId.isBlank()) {
            issues.add(issue("CHK3", DataItemMessages.KEY_REQUIRED, "cateId", cateId));
        } else if (MdmTextLimits.overChars(cateId, MdmTextLimits.KEY_CHARS_MAX)) {
            issues.add(keyTooLong("카테고리 ID 값", "cateId", cateId));
        }
        addTextIssue(issues, "카테고리 이름", "cateName", value.cateName(), cateId);
        addTextIssue(issues, "정의 식", "defExpr", value.defExpr(), cateId);
        addTextIssue(issues, "설명", "description", value.description(), cateId);
        String kind = value.defKind();
        if (DataCateValue.REGEX.equals(kind)) {
            if (value.defExpr() == null || value.defTarget() == null) {
                issues.add(issue("CATE", DataItemMessages.CATE_DEF_INVALID + ": REGEX 는 식과 대상이 필요합니다",
                        "defExpr", cateId));
            } else {
                if (!allowedTarget(value.defTarget())) {
                    issues.add(issue("CATE", DataItemMessages.CATE_DEF_INVALID + ": 대상 " + value.defTarget(),
                            "defTarget", cateId));
                }
                try {
                    Pattern.compile(value.defExpr());
                } catch (PatternSyntaxException e) {
                    issues.add(issue("CATE", DataItemMessages.CATE_DEF_INVALID + ": 정규식 문법 " + e.getDescription(),
                            "defExpr", cateId));
                }
            }
        } else if (DataCateValue.TABLE.equals(kind)) {
            if (value.defExpr() != null || value.defTarget() != null) {
                issues.add(issue("CATE", DataItemMessages.CATE_DEF_INVALID + ": TABLE 은 식·대상을 두지 않습니다",
                        "defExpr", cateId));
            }
        } else {
            issues.add(issue("CATE", DataItemMessages.CATE_DEF_INVALID + ": 종류 " + kind, "defKind", cateId));
        }
        return issues;
    }

    /** 모은 이슈를 한 번에 거부한다. message 에 모든 이슈 문구가 들어간다. */
    public static BusinessException rejected(List<MdmCheckIssue> issues) {
        String detail = issues.stream().map(MdmCheckIssue::message).collect(Collectors.joining("; "));
        return MdmErrors.of(MdmErrorCode.INVALID_INPUT, detail, issues);
    }

    /** 4000바이트를 넘으면 이슈를 더한다. */
    private static void addTextIssue(List<MdmCheckIssue> issues, String label, String field, String value,
                                     String itemKey) {
        if (MdmTextLimits.overBytes(value)) {
            issues.add(issue(LEN, label + "은 " + MdmTextLimits.TEXT_BYTES_MAX + "바이트(한글 약 1,333자)를 넘을 수 없습니다",
                    field, itemKey));
        }
    }

    private static MdmCheckIssue keyTooLong(String label, String field, String itemKey) {
        return issue(LEN, label + "은 " + MdmTextLimits.KEY_CHARS_MAX + "자를 넘을 수 없습니다", field, itemKey);
    }

    static MdmCheckIssue issue(String code, String message, String field, String itemKey) {
        return new MdmCheckIssue(code, message, field, itemKey);
    }

    private static boolean allowedTarget(String target) {
        return CategoryOwner.MASTER_DATA.allowedDefTargets().stream()
                .map(CategoryDefTarget::name)
                .anyMatch(n -> Objects.equals(n, target));
    }

    private Pattern pattern(String codePattern) {
        return patterns.computeIfAbsent(codePattern, p -> {
            try {
                return Pattern.compile(p);
            } catch (PatternSyntaxException e) {
                throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "키 패턴 정규식이 올바르지 않습니다: " + p, List.of());
            }
        });
    }
}
