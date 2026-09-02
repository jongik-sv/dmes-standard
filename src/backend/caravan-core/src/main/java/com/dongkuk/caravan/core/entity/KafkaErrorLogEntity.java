package com.dongkuk.caravan.core.entity;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/**
 * TB_CARAVAN_TC_ERROR JPA Entity.
 *
 * <p>v4 §결정 #13 (2026-05-13) — Audit 컬럼을 cactus 표준 9컬럼으로 통일.
 * 기존 4컬럼 ({@code CREATED_AT/CREATED_BY/UPDATED_AT/UPDATED_BY}, {CLIENT} 컨벤션) 폐기.
 * {@link CaravanAuditBase} 상속으로 {@code C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID / U_USR_ID /
 * U_AT / U_SVC_ID / U_PGM_ID / VER} 매핑.
 *
 * <p>사용자 ID 는 {@code "SYSTEM"} 고정 (v4 §결정 #17 옵션 B) — caravan 라이브러리의 자동 에러 적재
 * 시점이라 RequestContext 의존 X.
 */
@Entity
@Table(name = "TB_CARAVAN_TC_ERROR")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@SuperBuilder
public class KafkaErrorLogEntity extends CaravanAuditBase {

    /**
     * PK. {@code yyyyMMddHHmmssSSS-xxx} (xxx = UUID 첫 3자) 형식의 고유 문자열.
     * DB 벤더(시퀀스/IDENTITY) 의존 제거를 위해 애플리케이션이 채번한다.
     */
    @Id
    @Column(name = "SQ_VAL", length = 32)
    private String sqVal;

    @Column(name = "INTERFACE_PROTOCOL")
    private String interfaceProtocol;

    @Column(name = "TRANSACTION_CODE")
    private String transactionCode;

    @Column(name = "INTERFACE_ID")
    private String interfaceId;

    @Column(name = "INTERFACE_MSG", length = 65000)
    private String interfaceMsg;

    @Column(name = "ERROR_TYPE")
    private String errorType;

    @Column(name = "ERROR_CODE", length = 100)
    private String errorCode;

    @Column(name = "ERROR_MSG", length = 1000)
    private String errorMsg;

    @Column(name = "ERROR_STATUS_CODE")
    private String errorStatusCode;

    private static final DateTimeFormatter SQ_VAL_TS = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    @PrePersist
    public void prePersist() {
        if (this.sqVal == null) {
            this.sqVal = LocalDateTime.now().format(SQ_VAL_TS) + "-"
                    + UUID.randomUUID().toString().substring(0, 3);
        }
        if (this.errorStatusCode == null) {
            this.errorStatusCode = "N";
        }
        // audit 컬럼 (CaravanAuditBase) 의 PrePersist 는 CaravanAuditListener 가 별도 호출 (JPA 표준).
    }
}
