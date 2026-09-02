package com.dongkuk.dmes.mpp.sample.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "sample_production_record")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class SampleProductionRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "work_order_no", nullable = false, length = 50)
    private String workOrderNo;

    @Column(name = "produced_qty", nullable = false, precision = 19, scale = 4)
    private BigDecimal producedQty;

    @Column(name = "defect_qty", nullable = false, precision = 19, scale = 4)
    private BigDecimal defectQty;

    @Column(name = "recorded_at", nullable = false)
    private LocalDateTime recordedAt;
}
