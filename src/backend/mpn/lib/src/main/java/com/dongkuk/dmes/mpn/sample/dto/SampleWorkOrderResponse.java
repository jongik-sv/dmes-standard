package com.dongkuk.dmes.mpn.sample.dto;

import com.dongkuk.dmes.mpn.sample.domain.SampleWorkOrder;
import com.dongkuk.dmes.mpn.sample.domain.WorkOrderStatus;
import java.math.BigDecimal;
import java.time.LocalDate;

public record SampleWorkOrderResponse(
        Long id,
        String orderNo,
        String itemCode,
        BigDecimal plannedQty,
        LocalDate dueDate,
        WorkOrderStatus status
) {

    public static SampleWorkOrderResponse from(SampleWorkOrder entity) {
        return new SampleWorkOrderResponse(
                entity.getId(),
                entity.getOrderNo(),
                entity.getItemCode(),
                entity.getPlannedQty(),
                entity.getDueDate(),
                entity.getStatus()
        );
    }
}
