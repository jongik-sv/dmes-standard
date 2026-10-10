package com.dongkuk.dmes.mcm.widget.query;

/**
 * 정의 없는 저수준 실행({@link WidgetQueryRunner#run})의 SQL·입력 정의·DB 실행 오류 — 스펙 2026-10-10-user-query-program-design §5·§6·§7.
 * 호출자(공용 쿼리 서비스)가 문구를 정해 로그에 남긴다.
 *
 * <p>{@link #getMessage()} 는 사용자에게 그대로 보여도 되는 고정 안전 문구뿐이다 — 원인(ojdbc 오류는 SQL 전문을,
 * SqlGuard 오류는 SQL 조각을 담는다)이 응답으로 새는 일(§7 SQL·스키마 노출)이 없게. 원인은 {@link #getCause()} 와
 * {@link #detail()}(로그용 한 줄 요약)로만 읽는다. 사용자 입력 값 오류는 이 예외가 아니라
 * {@code BusinessException}(INVALID_VALUE·REQUIRED_VALUE)로 나간다.
 */
public class WidgetQueryRunException extends RuntimeException {

    /** 오류 종류 — 호출자가 보여 줄 문구(스펙 §6)를 고르는 키. */
    public enum Kind {
        /** SQL·입력 정의 오류 — 「쿼리 정의에 오류가 있습니다. 관리자에게 문의하세요」 계열. */
        DEFINITION,
        /** DB 실행·연결·방언 정책·인증 컨텍스트 오류 — 「조회하지 못했습니다. 관리자에게 문의하세요」 계열. */
        EXECUTION
    }

    private static final String MSG_DEFINITION = "쿼리 정의에 오류가 있습니다. 관리자에게 문의하세요";
    private static final String MSG_EXECUTION = "조회하지 못했습니다. 관리자에게 문의하세요";

    private final Kind kind;

    public WidgetQueryRunException(Kind kind, Throwable cause) {
        super(safeMessage(kind), cause);
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }

    /** 로그용 원인 요약 — 원인 사슬의 가장 깊은 곳 문구. 사용자에게 보내지 않는다. */
    public String detail() {
        Throwable root = this;
        while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        String message = root.getMessage();
        return message == null || message.isBlank() ? root.getClass().getSimpleName() : message.strip();
    }

    /** Kind 의 안전 문구(스펙 §6) — 호출자가 응답 문구를 만들 때 쓴다. 원인은 담지 않는다. */
    public static String safeMessage(Kind kind) {
        return kind == Kind.DEFINITION ? MSG_DEFINITION : MSG_EXECUTION;
    }
}
