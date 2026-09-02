package com.dongkuk.caravan.core.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.ToString;

/**
 * caravan.control 토픽으로 흐르는 명령 메시지.
 *
 * <p>JSON 포맷 예시:</p>
 * <pre>{@code
 * {
 *   "action":     "PAUSE",
 *   "topicId":    "MMPPMERPTT01",
 *   "bizSystem":  "caravan-hub",
 *   "timestamp":  "2026-04-30T13:55:12.123"
 * }
 * }</pre>
 *
 * <p>{@code SKIP} action 은 enum 에 포함하지 않음 — skipOffset (Phase 8) 은 STOP/RESUME publish
 * 절차로 처리하며 control topic 에는 STOP/RESUME 만 흐른다.</p>
 */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString
public class ControlCommand {

    private Action action;
    private String topicId;
    private String bizSystem;
    private LocalDateTime timestamp;

    /** 명령 종류.
     *  START — DB STATUS='RUNNING' UPDATE + 모든 인스턴스에 ensureStarted 브로드캐스트.
     *  RESUME 과 달리 컨테이너가 없으면 createConsumer 로 신규 등록(runtime 토픽 동적 등록).
     */
    public enum Action {
        PAUSE, RESUME, STOP, ERROR, START
    }

    @JsonCreator
    public static ControlCommand of(
            @JsonProperty("action") Action action,
            @JsonProperty("topicId") String topicId,
            @JsonProperty("bizSystem") String bizSystem,
            @JsonProperty("timestamp") LocalDateTime timestamp) {
        return ControlCommand.builder()
                .action(action)
                .topicId(topicId)
                .bizSystem(bizSystem)
                .timestamp(timestamp == null ? LocalDateTime.now() : timestamp)
                .build();
    }

    public static ControlCommand pause(String topicId, String bizSystem) {
        return of(Action.PAUSE, topicId, bizSystem, LocalDateTime.now());
    }

    public static ControlCommand resume(String topicId, String bizSystem) {
        return of(Action.RESUME, topicId, bizSystem, LocalDateTime.now());
    }

    public static ControlCommand stop(String topicId, String bizSystem) {
        return of(Action.STOP, topicId, bizSystem, LocalDateTime.now());
    }

    public static ControlCommand error(String topicId, String bizSystem) {
        return of(Action.ERROR, topicId, bizSystem, LocalDateTime.now());
    }

    public static ControlCommand start(String topicId, String bizSystem) {
        return of(Action.START, topicId, bizSystem, LocalDateTime.now());
    }
}
