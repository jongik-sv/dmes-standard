package com.dongkuk.caravan.console.topic;

import com.dongkuk.caravan.console.audit.ConsoleAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * caravan 의 {@code TB_CARAVAN_TOPICS} 와 <b>같은 테이블 read-only 매핑</b>.
 *
 * <p>v3 재플랜 — caravan-console 가 caravan 의 {@code com.dongkuk.caravan.entity.TopicInfoEntity} 클래스 import 0
 * (caravan internal 결합 제거) 을 유지하면서, 토픽 메타 SoT 인 동일 테이블을 caravan-console 자체 entity 로 매핑.
 * 데이터는 1 SoT (caravan 책임), 코드는 1 entity (caravan-console 자체).</p>
 *
 * <p><b>EMF wiring</b>: 본 entity 는 caravan EMF ({@code caravanEntityManagerFactory}) 통해 read 해야 한다
 * (RE-Phase 11 에서 wiring 결정). default EMF (mcm.db) 에 잘못 등록되면 빈 테이블 read 위험.</p>
 *
 * <p><b>Write 정책</b>: 토픽 CRUD 는 caravan API ({@code POST/DELETE /kafkaApi/topics}) 호출만.
 * caravan-console 자체 INSERT/UPDATE/DELETE 없음. 본 entity 는 read-only — setter 노출 안 함.</p>
 */
@Entity
@Table(name = "TB_CARAVAN_TOPICS")
@IdClass(ConsoleTopicInfoId.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ConsoleTopicInfoEntity extends ConsoleAuditEntity {

    @Id
    @Column(name = "TOPIC_ID")
    private String topicId;

    @Id
    @Column(name = "BIZ_SYSTEM")
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

    /** caravan 운영 메타 — RUNNING/PAUSED/STOPPED/ERROR. caravan-console 는 read-only. */
    @Column(name = "STATUS")
    private String status;

    @Column(name = "ERROR_AT")
    private LocalDateTime errorAt;

    @Column(name = "ERROR_OFFSET")
    private Long errorOffset;

    @Column(name = "LAST_ERROR_CODE", length = 100)
    private String lastErrorCode;

    @Column(name = "LAST_ERROR_MSG", length = 1000)
    private String lastErrorMsg;
}
