package com.dongkuk.dmes.mqc.sample.domain;

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
import java.time.LocalDateTime;

@Entity
@Table(name = "sample_inspection_result")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class SampleInspectionResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "lot_no", nullable = false, length = 50)
    private String lotNo;

    @Column(name = "inspected_at", nullable = false)
    private LocalDateTime inspectedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "result", nullable = false, length = 10)
    private InspectionJudgement result;

    @Column(name = "remark", length = 500)
    private String remark;
}
