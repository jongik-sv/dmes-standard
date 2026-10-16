package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import java.util.Set;

/**
 * ERD 요청·기록의 출처(source) 값 한 곳. 값만 둔다 — 검사 규칙은 쓰는 클래스가 정한다.
 * <ul>
 *   <li>{@code ErdCommandService}: 명령 출처는 {@link #COMMAND} 와 글자 그대로 같아야 한다.</li>
 *   <li>{@code ErdEditService}: OASIS 요청은 다듬고 대문자로 바꾼 뒤 {@link #COMMAND} 와 비교한다(빈 값은 {@link #UI}).
 *       모르는 값은 쓰기면 입력 오류(MDM021), 읽기면 접속자 표시용 출처 null 이다.</li>
 *   <li>{@link ErdEventHub#isTimedSource}: 시한 접속자는 {@link #MCP}·{@link #CLI} 뿐이다.</li>
 *   <li>{@link ErdStreamController}: 검사하지 않고 그대로 넘긴다(기본값 {@link #UI}).</li>
 * </ul>
 * 문자열 상수는 컴파일 시간 상수다(컨트롤러 annotation 기본값에 쓴다). {@code stream} 이 쓰므로 {@code service} 에 두지 않는다.
 */
public final class ErdSources {

    public static final String UI = "UI";
    public static final String MCP = "MCP";
    public static final String CLI = "CLI";

    /**
     * 명령 출처로 받는 값(읽기의 접속자 표시도 이 값만 쓴다). {@link #MARKER_SOURCE} 는 표시 행(ErdReloadMarker) 전용이라 뺀다 —
     * SOURCE=SYSTEM 이면 언제나 표시 행이다. null 을 넣어 묻지 않는다(Set.of 는 NullPointerException).
     */
    public static final Set<String> COMMAND = Set.of(UI, MCP, CLI);

    /** 표시 행({@link ErdDelta#isMarker})의 출처. 명령은 이 출처로 보낼 수 없다(ErdCommandService). */
    public static final String MARKER_SOURCE = "SYSTEM";

    /** 표시 행의 세션 이름. */
    public static final String MARKER_SESSION = "system";

    private ErdSources() {
    }
}
