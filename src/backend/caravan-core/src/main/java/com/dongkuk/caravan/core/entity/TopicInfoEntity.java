package com.dongkuk.caravan.core.entity;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * TB_CARAVAN_TOPICS JPA Entity.
 *
 * <p>Mutable 필드 (운영 제어 / 자동 ERROR 진입 시 변경):
 * {@code status}, {@code errorAt}, {@code errorOffset}, {@code lastErrorCode}, {@code lastErrorMsg}.
 * PK(topicId/bizSystem) 는 immutable. 메타 5필드(topicDesc/groupId/sendModuleId/recvModuleId/useTp)는
 * 관리 화면 U 를 위해 {@link #updateMeta} 도메인 메서드로만 변경한다 (blanket setter 금지).</p>
 *
 * <p>v4 §결정 #13 (2026-05-13) — {@link CaravanAuditBase} 상속으로 audit 9컬럼
 * ({@code C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID / U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER}) 자동 매핑.
 * 사용자 ID 는 {@code "SYSTEM"} 고정 (v4 §결정 #17 옵션 B).</p>
 */
@Entity
@Table(name = "TB_CARAVAN_TOPICS")
@IdClass(TopicInfoId.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@SuperBuilder
public class TopicInfoEntity extends CaravanAuditBase {

    @Id
    @Column(name = "TOPIC_ID")
    private String topicId;

    @Id
    @Column(name = "BIZ_SYSTEM", length = 20)
    private String bizSystem;

    @Column(name = "TOPIC_DESC")
    private String topicDesc;

    @Column(name = "GROUP_ID")
    private String groupId;

    @Column(name = "SEND_MODULE_ID")
    private String sendModuleId;

    @Column(name = "RECV_MODULE_ID")
    private String recvModuleId;

    @Column(name = "USE_TP")
    private String useTp;

    /**
     * 운영 의도 + 자동 에러 표식. RUNNING / PAUSED / STOPPED / ERROR.
     * <p>USE_TP='Y' 일 때만 의미. 재기동 시 RUNNING 으로 reset (Phase 7).</p>
     */
    @Setter
    @Column(name = "STATUS")
    private String status;

    /** 자동 ERROR 진입 시각 (ERROR 일 때만). */
    @Setter
    @Column(name = "ERROR_AT")
    private LocalDateTime errorAt;

    /** 차단된 메시지 offset (ERROR 일 때만). */
    @Setter
    @Column(name = "ERROR_OFFSET")
    private Long errorOffset;

    /** 에러 코드 (ERROR 일 때만, 최대 100자). */
    @Setter
    @Column(name = "LAST_ERROR_CODE", length = 100)
    private String lastErrorCode;

    /** 에러 메시지 (ERROR 일 때만, 최대 1000자). */
    @Setter
    @Column(name = "LAST_ERROR_MSG", length = 1000)
    private String lastErrorMsg;

    /**
     * 토픽 메타 수정 (토픽 관리 화면 rowStatus=U) — PK 외 메타 5필드만 갱신.
     * <p>Kafka broker 토픽은 불변(토픽명=PK) — DB 메타만 변경된다. useTp 는 blank 면 기존값 유지.</p>
     */
    public void updateMeta(String topicDesc, String groupId, String sendModuleId,
                           String recvModuleId, String useTp) {
        this.topicDesc = topicDesc;
        // GROUP_ID 는 NOT NULL 이고 Oracle 은 빈 문자열을 NULL 로 저장하므로, 빈 값이 오면 기존 값을 유지한다.
        if (groupId != null && !groupId.isBlank()) {
            this.groupId = groupId;
        }
        this.sendModuleId = sendModuleId;
        this.recvModuleId = recvModuleId;
        if (useTp != null && !useTp.isBlank()) {
            this.useTp = useTp;
        }
    }
}
