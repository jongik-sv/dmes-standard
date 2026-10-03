package com.dongkuk.dmes.cactus.mdm;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 버전 키 규칙 한 곳(D-154, 스펙 2026-10-03-mdm-meta-cache-per-version §3.1). 본문 키 ver 는 늘 scale 3 plain 문자열이다 — SQLite 는 1.000 을
 * INTEGER, 1.001 을 REAL 로 저장하므로 BigDecimal 을 그대로 문자열로 만들면 같은 버전이 두 키가 된다. 논리 키 {@code 정의키@ver} 는 마지막
 * {@code @} 뒤가 scale 3 숫자일 때만 본문 키로 본다(정의 ID 에 {@code @} 가 있어도 깨지지 않는다).
 */
public final class MdmVersions {

    private static final Pattern LOGICAL = Pattern.compile("^(.+)@(\\d{1,4}\\.\\d{3})$");

    private MdmVersions() {
    }

    /** @throws IllegalArgumentException 소수 넷째 자리 이상이 0 이 아니거나 숫자가 아니면 */
    public static String key(BigDecimal ver) {
        try {
            return ver.setScale(3, RoundingMode.UNNECESSARY).toPlainString();
        } catch (ArithmeticException e) {
            throw new IllegalArgumentException("버전은 소수 셋째 자리까지다: " + ver, e);
        }
    }

    public static String key(String text) {
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("버전이 비었다");
        }
        return key(new BigDecimal(text.trim()));
    }

    /** {@code ver} 가 null 이면 정의 키(목차·값), 아니면 본문 키. */
    public record LogicalKey(String key, String ver) {
        public boolean isBody() {
            return ver != null;
        }
    }

    public static LogicalKey parse(String logical) {
        Matcher m = LOGICAL.matcher(logical);
        return m.matches() ? new LogicalKey(m.group(1), m.group(2)) : new LogicalKey(logical, null);
    }

    public static String logical(String key, String ver) {
        return ver == null ? key : key + '@' + ver;
    }

    /** 버전이 있는 대상 — 목차·본문으로 나눈다. COLUMN·DOMAIN 은 지금처럼 값 하나다. */
    public static boolean isVersioned(MdmTargetType type) {
        return type == MdmTargetType.RULE || type == MdmTargetType.RULE_SET || type == MdmTargetType.CODE || type == MdmTargetType.LAYOUT;
    }
}
