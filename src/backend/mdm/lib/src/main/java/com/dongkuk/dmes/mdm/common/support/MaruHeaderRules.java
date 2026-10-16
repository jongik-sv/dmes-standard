package com.dongkuk.dmes.mdm.common.support;

import static com.dongkuk.dmes.mdm.common.support.MdmErrors.invalid;
import static com.dongkuk.dmes.mdm.common.support.MdmStrings.trimToNull;

import com.dongkuk.dmes.mdm.common.naming.NamingRules;
import com.dongkuk.dmes.mdm.contract.category.MaruIdRules;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.util.Objects;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * 마루 코드({@code TB_MDM_CODE})·마루 데이터({@code TB_MDM_DATA}) 헤더 검사의 공용 정본. 코드 등록·헤더 저장과 데이터 등록·헤더
 * 저장이 따로 두던 사본을 모았다(BE 리팩토링 2회차 C7).
 *
 * <p>검사를 하나씩 둔다. 검사 순서는 호출자가 정한다. 코드 헤더 저장은 auditVer 를 이름보다 먼저 보고, 데이터 헤더 저장은 맨 끝에
 * 본다. 문구는 옛 사본과 글자까지 같다. 명사만 달랐던 ID 문구는 명사를 인자로 받는다({@link #CODE}·{@link #DATA}).
 *
 * <p>계층 칸 수 범위는 여기 두지 않는다. 코드는 {@code MasterCodeConventions} 상수로, 데이터는 0~5 로 각자 본다.
 */
public final class MaruHeaderRules {

    /** ID 문구의 명사 — 마루 코드. */
    public static final String CODE = "마루 코드";

    /** ID 문구의 명사 — 마루 데이터. */
    public static final String DATA = "마루 데이터";

    /** 마루 ID 글자 상한. */
    private static final int ID_MAX = 50;

    /** 이름 글자 상한. */
    private static final int NAME_MAX = 100;

    /** 추가 컬럼 라벨 글자 상한. */
    private static final int LABEL_MAX = 100;

    private static final Pattern FORBIDDEN = Pattern.compile(MaruIdRules.FORBIDDEN_CHAR_PATTERN);

    private MaruHeaderRules() {
    }

    /**
     * 마루 ID 규칙(I9·D8·F15). 1~50자, 마루 ID 금지 문자(점·콤마·공백) 없음, 컬럼 물리명 규칙(대문자 스네이크) 순서로 본다.
     * 다른 검사와 달리 자르지 않는다. 호출자가 자른 값(비면 null)을 넘긴다.
     *
     * @param id   호출자가 자른 마루 ID
     * @param noun 문구 앞의 명사({@link #CODE} 또는 {@link #DATA})
     */
    public static void requireValidId(String id, String noun) {
        if (id == null || id.length() > ID_MAX) {
            throw invalid(noun + " ID 는 1~" + ID_MAX + "자여야 합니다");
        }
        if (FORBIDDEN.matcher(id).find()) {
            throw invalid(noun + " ID 에 점·콤마·공백을 쓸 수 없습니다");
        }
        if (!NamingRules.STD_PHYS_NAME.matcher(id).matches()) {
            throw invalid(noun + " ID 는 영문 대문자로 시작하고 영문 대문자·숫자·_ 만 쓸 수 있습니다");
        }
    }

    /** 이름은 자른 값이 1~100자여야 한다. 자른 값을 돌려준다. */
    public static String requireName(String value) {
        String name = trimToNull(value);
        if (name == null || name.length() > NAME_MAX) {
            throw invalid("이름은 1~" + NAME_MAX + "자여야 합니다");
        }
        return name;
    }

    /** 설명은 자른 값이 4000바이트를 넘으면 안 된다. 자른 값(비면 null)을 돌려준다. */
    public static String requireDescription(String value) {
        String description = trimToNull(value);
        if (MdmTextLimits.overBytes(description)) {
            throw invalid("설명은 4000바이트(한글 약 1,333자)를 넘을 수 없습니다");
        }
        return description;
    }

    /**
     * 마루 데이터 키 패턴은 필수이고 자른 값이 4000바이트 이하여야 한다. 자른 값을 돌려준다. 정규식 문법은
     * {@link #requireCodePatternRegex} 가 본다.
     */
    public static String requireCodePattern(String value) {
        String codePattern = trimToNull(value);
        if (codePattern == null) {
            throw invalid("키 패턴을 입력하세요");
        }
        if (MdmTextLimits.overBytes(codePattern)) {
            throw invalid("키 패턴은 4000바이트(한글 약 1,333자)를 넘을 수 없습니다");
        }
        return codePattern;
    }

    /** 키 패턴이 Java 정규식으로 컴파일되어야 한다. */
    public static void requireCodePatternRegex(String codePattern) {
        try {
            Pattern.compile(codePattern);
        } catch (PatternSyntaxException e) {
            throw invalid("키 패턴 정규식이 올바르지 않습니다: " + codePattern);
        }
    }

    /**
     * 추가 컬럼 라벨 attr01~attr10. 번호 순서로 보고, 자른 값(비면 null)을 같은 순서로 돌려준다.
     *
     * @param values attr01 부터 순서대로의 요청 값
     */
    public static String[] labels(String... values) {
        String[] out = new String[values.length];
        for (int i = 0; i < values.length; i++) {
            out[i] = label(values[i], i + 1);
        }
        return out;
    }

    /** 라벨 하나는 자른 값이 100자 이내여야 한다. 자른 값(비면 null)을 돌려준다. */
    private static String label(String value, int slot) {
        String v = trimToNull(value);
        if (v != null && v.length() > LABEL_MAX) {
            throw invalid("라벨 attr" + (slot < 10 ? "0" : "") + slot + " 은 " + LABEL_MAX + "자 이내여야 합니다");
        }
        return v;
    }

    /**
     * 헤더 낙관적 잠금(I19·F9). 요청 auditVer 가 없거나 행의 감사 카운터와 다르면 MDM001 이다.
     *
     * @param current  행의 감사 카운터({@code VER})
     * @param expected 요청 auditVer
     */
    public static void requireAuditVer(Long current, Long expected) {
        if (expected == null || !Objects.equals(expected, current)) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
        }
    }
}
