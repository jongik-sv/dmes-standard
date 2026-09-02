package com.dongkuk.caravan.core.container;

/**
 * Kafka Listener 컨테이너 상태
 *
 * <p>{@link ContainerController}에서 컨테이너 상태를 나타내는 열거형입니다.</p>
 *
 * <h3>상태 전이</h3>
 * <pre>
 *                    pause()
 *         ┌────────────────────────┐
 *         │                        ▼
 *     RUNNING ◀────────────── PAUSED
 *         │       resume()
 *         │ stop()
 *         ▼
 *     STOPPED
 *         │
 *         │ start()
 *         ▼
 *     RUNNING
 * </pre>
 *
 * @author Caravan
 * @version 1.0.0
 * @see ContainerController
 */
public enum ContainerStatus {

    /**
     * 실행 중
     *
     * <p>컨테이너가 정상적으로 실행 중이며 메시지를 수신하고 있습니다.</p>
     */
    RUNNING,

    /**
     * 일시정지
     *
     * <p>컨테이너가 일시정지 상태이며 메시지 수신이 중단되었습니다.
     * 브로커와의 연결은 유지되며, {@code resume()}으로 즉시 재개할 수 있습니다.</p>
     *
     * <p>최대 재시도 횟수 초과 시 자동으로 이 상태가 됩니다.</p>
     */
    PAUSED,

    /**
     * 정지됨
     *
     * <p>컨테이너가 완전히 정지되어 브로커와의 연결이 해제되었습니다.
     * 다시 시작하려면 {@code start()}를 호출해야 합니다.</p>
     */
    STOPPED,

    /**
     * 존재하지 않음
     *
     * <p>지정된 Listener ID에 해당하는 컨테이너가 존재하지 않습니다.</p>
     */
    NOT_EXISTS
}
