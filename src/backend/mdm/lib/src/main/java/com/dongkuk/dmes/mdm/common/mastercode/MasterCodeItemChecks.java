package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.common.support.MdmTextLimits;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemValues;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 코드 행 저장 검사(TSK-06-03 design.md §6.3) — 순수 규칙(Spring·DB 없음). 06-05 확정 검사가 같은 규칙을 다시 쓴다.
 *
 * <p>검사 대상은 touched 행(요청의 ADDED·CHANGED, 되돌린 코드)뿐이고(불변 규칙 21), 비교 기준은 호출자가 넘긴 버전 V
 * 적용 후 모습이다 — 닫힌 행은 넘기지 않는다(04:112, D10). 계층 검사는 시뮬레이터 {@code check()} 처럼 한 행에 첫 위반
 * 하나만 내고, 칸 형식(범위 밖·빈 칸)이 틀린 행은 앞 칸 대조를 하지 않는다.
 */
public final class MasterCodeItemChecks {

    private static final Pattern FORBIDDEN = Pattern.compile(MasterCodeConventions.CODE_FORBIDDEN_CHAR_PATTERN);

    /** lvlCnt 와 추가 컬럼 라벨 10칸(null = 라벨 없음). */
    public record Header(int lvlCnt, List<String> attrLabels) {
    }

    private MasterCodeItemChecks() {
    }

    public static List<MdmCheckIssue> check(Header header, List<MasterCodeItemEntry> viewAfter, Set<String> touched) {
        List<MdmCheckIssue> issues = new ArrayList<>();
        for (MasterCodeItemEntry row : viewAfter) {
            if (isTouched(touched, row.code())) {
                checkRow(header, row, viewAfter, issues);
            }
        }
        return issues;
    }

    /** 코드가 빈 새 행도 touched 로 받는다({@code Set.of} 는 null 조회에서 던지므로 스트림으로 본다). */
    private static boolean isTouched(Set<String> touched, String code) {
        return code == null ? touched.stream().anyMatch(Objects::isNull) : touched.contains(code);
    }

    private static void checkRow(Header header, MasterCodeItemEntry row, List<MasterCodeItemEntry> view,
                                 List<MdmCheckIssue> issues) {
        String code = row.code();
        List<String> lvls = row.values().lvls();
        int before = issues.size();

        if (code == null || code.isEmpty()) {
            issues.add(issue(MasterCodeItemIssueCode.CODE_REQUIRED, code, "code", "코드값을 넣으세요"));
        } else if (FORBIDDEN.matcher(code).find()) {
            issues.add(issue(MasterCodeItemIssueCode.CODE_FORBIDDEN_CHAR, code, "code", "코드값에 콤마·공백을 쓸 수 없다"));
        } else if (MdmTextLimits.overChars(code, MdmTextLimits.KEY_CHARS_MAX)) {
            issues.add(issue(MasterCodeItemIssueCode.KEY_TOO_LONG, code, "code", keyTooLong("코드값")));
        }
        for (int i = 0; i < lvls.size(); i++) {
            String v = lvls.get(i);
            if (v != null && FORBIDDEN.matcher(v).find()) {
                issues.add(issue(MasterCodeItemIssueCode.CODE_FORBIDDEN_CHAR, code, lvlField(i),
                        "계층 칸 값에 콤마·공백을 쓸 수 없다"));
            } else if (MdmTextLimits.overChars(v, MdmTextLimits.KEY_CHARS_MAX)) {
                issues.add(issue(MasterCodeItemIssueCode.KEY_TOO_LONG, code, lvlField(i),
                        keyTooLong("계층 " + (i + 1) + " 칸 값")));
            }
        }
        for (int i = header.lvlCnt(); i < lvls.size(); i++) {
            if (lvls.get(i) != null) {
                issues.add(issue(MasterCodeItemIssueCode.LVL_BEYOND_CNT, code, lvlField(i),
                        "계층 칸은 " + header.lvlCnt() + "개까지 쓴다"));
                break;
            }
        }
        int gap = firstGap(lvls);
        if (gap >= 0) {
            issues.add(issue(MasterCodeItemIssueCode.LVL_GAP, code, lvlField(gap), "중간 칸이 비었다"));
        }
        if (issues.size() == before) {
            MdmCheckIssue mismatch = parentMismatch(row, view);
            if (mismatch != null) {
                issues.add(mismatch);
            }
        }
        List<String> attrs = row.values().attrs();
        for (int i = 0; i < attrs.size(); i++) {
            if (attrs.get(i) != null && header.attrLabels().get(i) == null) {
                issues.add(issue(MasterCodeItemIssueCode.ATTR_WITHOUT_LABEL, code, attrField(i),
                        "라벨이 없는 추가 컬럼에는 값을 넣지 않는다"));
            }
            if (MdmTextLimits.overBytes(attrs.get(i))) {
                issues.add(issue(MasterCodeItemIssueCode.TEXT_TOO_LONG, code, attrField(i),
                        textTooLong("추가 컬럼 " + String.format("%02d", i + 1) + " 값")));
            }
        }
        MasterCodeItemValues values = row.values();
        checkText(code, "name", "이름", values.name(), issues);
        checkText(code, "alterName", "약칭", values.alterName(), issues);
        checkText(code, "description", "설명", values.description(), issues);
    }

    private static void checkText(String code, String field, String label, String value, List<MdmCheckIssue> issues) {
        if (MdmTextLimits.overBytes(value)) {
            issues.add(issue(MasterCodeItemIssueCode.TEXT_TOO_LONG, code, field, textTooLong(label)));
        }
    }

    /** 경미 수정(CodeItemEditService.patch)이 checkRow 를 거치지 않으므로 같은 상한·문구를 이 메서드로 함께 쓴다. */
    public static List<MdmCheckIssue> checkPatchText(String code, String name, String alterName, String description) {
        List<MdmCheckIssue> issues = new ArrayList<>();
        checkText(code, "name", "이름", name, issues);
        checkText(code, "alterName", "약칭", alterName, issues);
        checkText(code, "description", "설명", description, issues);
        return issues;
    }

    private static String keyTooLong(String label) {
        return label + "은 " + MdmTextLimits.KEY_CHARS_MAX + "자를 넘을 수 없다";
    }

    private static String textTooLong(String label) {
        return label + "은 " + MdmTextLimits.TEXT_BYTES_MAX + "바이트(한글 약 1,333자)를 넘을 수 없다";
    }

    /** 값이 있는 칸 앞의 첫 빈 칸(0 기준). 없으면 -1. */
    private static int firstGap(List<String> lvls) {
        int firstEmpty = -1;
        for (int i = 0; i < lvls.size(); i++) {
            if (lvls.get(i) == null) {
                if (firstEmpty < 0) {
                    firstEmpty = i;
                }
            } else if (firstEmpty >= 0) {
                return firstEmpty;
            }
        }
        return -1;
    }

    /**
     * 경로의 값 v(자리 n)와 코드 자신(자리 = 경로 길이)마다, 자기 행을 뺀 다른 행에서 v 가 나타난 자리의 앞 칸이 내 앞 칸
     * {@code path[0..n-1]} 과 같아야 한다 — lvl m 칸이면 그 행의 lvl[0..m-1], 코드값이면 그 행의 전체 경로.
     */
    private static MdmCheckIssue parentMismatch(MasterCodeItemEntry row, List<MasterCodeItemEntry> view) {
        List<String> path = path(row.values());
        List<String> values = new ArrayList<>(path);
        values.add(row.code());
        for (int n = 0; n < values.size(); n++) {
            String v = values.get(n);
            List<String> mine = path.subList(0, n);
            for (MasterCodeItemEntry other : view) {
                if (Objects.equals(other.code(), row.code())) {
                    continue;
                }
                List<String> found = positionOf(v, other);
                if (found != null && !found.equals(mine)) {
                    String under = found.isEmpty() ? "(뿌리)" : String.join(" > ", found);
                    String field = n < path.size() ? lvlField(n) : "code";
                    return issue(MasterCodeItemIssueCode.LVL_PARENT_MISMATCH, row.code(), field,
                            v + "는 이미 " + under + " 아래에 있다");
                }
            }
        }
        return null;
    }

    /** other 에서 v 가 나타난 자리의 앞 칸(비지 않은 값). 나타나지 않으면 null. */
    private static List<String> positionOf(String v, MasterCodeItemEntry other) {
        List<String> lvls = other.values().lvls();
        for (int m = 0; m < lvls.size(); m++) {
            if (v.equals(lvls.get(m))) {
                return nonNull(lvls.subList(0, m));
            }
        }
        if (v.equals(other.code())) {
            return path(other.values());
        }
        return null;
    }

    private static List<String> path(MasterCodeItemValues values) {
        return nonNull(values.lvls());
    }

    private static List<String> nonNull(List<String> list) {
        return list.stream().filter(Objects::nonNull).toList();
    }

    private static String lvlField(int index) {
        return "lvl" + (index + 1);
    }

    private static String attrField(int index) {
        return String.format("attr%02d", index + 1);
    }

    static MdmCheckIssue issue(MasterCodeItemIssueCode code, String itemKey, String field, String message) {
        return new MdmCheckIssue(code.name(), message, field, itemKey);
    }
}
