package com.dongkuk.dmes.mqc.qcd.order.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mqc.qcd.order.dto.QcdOrderSearchRequest;
import com.dongkuk.dmes.mqc.qcd.order.dto.QcdOrderViewRequest;
import com.dongkuk.dmes.mqc.qcd.order.pipeline.DesignCatalog;
import com.dongkuk.dmes.mqc.qcd.order.repository.OrderLookup;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * 공용 주문 조회(OASIS qcdOrder) — OMS 에서 받은 주문 줄. 품질설계결과·시뮬레이션이 함께 쓴다.
 * 진입 빈이라 @Transactional 을 두지 않는다.
 */
@Service("qcdOrder")
public class QcdOrderService {

    private final OrderLookup orders;

    public QcdOrderService(OrderLookup orders) {
        this.orders = orders;
    }

    /** 주문 목록. 응답 rows[OrderRow], totalCount(거르기 뒤 전체 건수, limit 전). */
    public Map<String, Object> search(QcdOrderSearchRequest req) {
        int limit = parseLimit(req.getLimit());
        List<Map<String, Object>> rows = new ArrayList<>();
        int total = 0;
        for (Map<String, String> o : orders.all()) {
            if (req.getPrdNmCd() != null && !req.getPrdNmCd().isBlank() && !req.getPrdNmCd().trim().equals(o.get("PRD_NM_CD"))) continue;
            if (!OrderViews.matches(o, req.getKeyword())) continue;
            total++;
            if (rows.size() < limit) rows.add(OrderViews.row(o));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rows", rows);
        out.put("totalCount", total);
        return out;
    }

    /** 주문 한 줄 — order(OrderRow), fields(정본 주문 항목), labels, coreFields, requiredFields. */
    public Map<String, Object> view(QcdOrderViewRequest req) {
        Map<String, String> o = load(req.getOrderKey());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("order", OrderViews.row(o));
        out.put("fields", OrderViews.fields(o));
        out.put("labels", OrderViews.labels());
        out.put("coreFields", DesignCatalog.CORE_FIELDS);
        out.put("requiredFields", DesignCatalog.REQUIRED_FIELDS);
        return out;
    }

    /** 주문 키로 한 줄(없으면 업무 오류). */
    public Map<String, String> load(String orderKey) {
        String[] k = OrderViews.splitKey(orderKey);
        return orders.one(k[0], k[1]).orElseThrow(() -> new BusinessException(ErrorCode.BUSINESS_ERROR, "주문을 찾을 수 없습니다: " + orderKey));
    }

    private static int parseLimit(String s) {
        if (s == null || s.isBlank()) return 1000;
        try {
            int n = Integer.parseInt(s.trim());
            return n <= 0 ? 1000 : Math.min(n, 1000);
        } catch (NumberFormatException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "limit 은 숫자입니다: " + s);
        }
    }
}
