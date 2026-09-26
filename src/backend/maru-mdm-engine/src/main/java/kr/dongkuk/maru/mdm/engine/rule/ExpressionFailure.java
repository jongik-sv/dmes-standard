package kr.dongkuk.maru.mdm.engine.rule;

/**
 * EvalEx 파싱·평가·런타임 예외를 한 타입으로 싣는다(TSK-03-03 design §2.1·§6.9). 메시지 = 원인 클래스 단순 이름 + {@code ": "} + 원인 메시지.
 *
 * <p>원인은 EvalEx·런타임 예외, 또는 타임아웃·인터럽트면 {@code expr.ExpressionFailure} 자신이다(§6.17).
 */
final class ExpressionFailure extends Exception {

    private static final long serialVersionUID = 1L;

    ExpressionFailure(Throwable cause) {
        super(cause.getClass().getSimpleName() + ": " + cause.getMessage(), cause);
    }
}
