package com.dongkuk.dmes.mcm.widget.data;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryResult;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryRunner;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * 쿼리 위젯 데이터 — OASIS {@code widgetData}(스펙 2026-10-02-widget-admin-generic §5.1). 로그인만 되면 부를 수 있다(AUTH_ONLY).
 * <ul>
 *   <li>{@code defId} 만 읽는다. 요청 본문의 SQL 은 어떤 경우에도 실행하지 않는다(W-D23).</li>
 *   <li>정의 검사(사용 중·query-* 유형·mcm)·SQL 검사·시스템 변수(:userId 등, 인증 컨텍스트)·캐시는 {@link WidgetQueryRunner} 가 맡는다.</li>
 *   <li>{@code @Transactional} 을 붙이지 않는다 — 실행기가 별도 읽기 전용·늘 롤백 트랜잭션을 연다(BackEnd 표준 §6-B-1).</li>
 * </ul>
 */
@Service("widgetDataService")
public class WidgetDataService {

    /** 위젯 행 상한(§7.3). */
    static final int MAX_ROWS = 500;

    private final WidgetQueryRunner queryRunner;

    public WidgetDataService(WidgetQueryRunner queryRunner) {
        this.queryRunner = queryRunner;
    }

    /** {@code { columns: string[], rows: [{컬럼: 값}], truncated }}. */
    public Map<String, Object> run(WidgetDataRunRequest request) {
        String defId = request == null ? null : trim(request.getDefId());
        if (defId == null || defId.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "위젯 정의 ID 가 없습니다");
        }
        WidgetQueryResult data = queryRunner.runDefinition(defId, MAX_ROWS);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("columns", data.columns());
        result.put("rows", data.rows());
        result.put("truncated", data.truncated());
        return result;
    }

    private static String trim(String s) {
        return s == null || "null".equals(s.strip()) ? null : s.strip();
    }
}
