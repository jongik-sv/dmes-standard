package com.dongkuk.dmes.mpn.sample.dto;

import com.dongkuk.dmes.mpn.sample.domain.SampleWorkOrder;
import com.dongkuk.dmes.mpn.sample.domain.WorkOrderStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;

public record SampleWorkOrderCreateRequest(
        @NotBlank String orderNo,
        @NotBlank String itemCode,
        @NotNull BigDecimal plannedQty,
        @NotNull LocalDate dueDate,
        @NotNull WorkOrderStatus status
) {

    public SampleWorkOrder toEntity() {
        return SampleWorkOrder.builder()
                .orderNo(orderNo)
                .itemCode(itemCode)
                .plannedQty(plannedQty)
                .dueDate(dueDate)
                .status(status)
                .build();
    }
}
