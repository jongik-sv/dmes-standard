package com.dongkuk.dmes.mcm.widget.collect;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryResult;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryRunner;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * SQL 원천 — 기존 읽기 전용 실행기를 재사용한다({@link WidgetQueryRunner#runCollect}, 행 상한 50·10초, 사용자 변수 없음).
 * keyField 가 있으면 행마다 항목 하나(키=그 열 값), 없으면 첫 행의 valueField 값 하나를 키 {@code VALUE} 로 저장한다.
 */
@Component
class SqlCollectSource implements CollectSource<CollectConfig.SqlSource> {

    static final int MAX_ITEMS = 50;
    static final String SINGLE_KEY = "VALUE";

    private final WidgetQueryRunner queryRunner;

    @Autowired
    SqlCollectSource(WidgetQueryRunner queryRunner) {
        this.queryRunner = queryRunner;
    }

    @Override
    public List<CollectItem> collect(CollectConfig.SqlSource source, LocalDate today) {
        WidgetQueryResult result;
        try {
            result = queryRunner.runCollect(source.sql(), MAX_ITEMS);
        } catch (BusinessException e) {
            throw new CollectException(e.getMessage()); // 실행기의 고정 문구·검사 문구 — DB 메시지가 아니다
        }
        String valueColumn = column(result.columns(), source.valueField());
        if (valueColumn == null) throw new CollectException("쿼리 결과에 값 열이 없습니다: " + shorten(source.valueField()));
        List<CollectItem> items = new ArrayList<>();
        if (source.keyField() == null) {
            if (result.rows().isEmpty()) return items;
            CollectItem item = CollectItem.of(SINGLE_KEY, result.rows().get(0).get(valueColumn));
            if (item != null) items.add(item);
            return items;
        }
        String keyColumn = column(result.columns(), source.keyField());
        if (keyColumn == null) throw new CollectException("쿼리 결과에 항목 열이 없습니다: " + shorten(source.keyField()));
        Set<String> seen = new HashSet<>();
        for (Map<String, Object> row : result.rows()) {
            if (items.size() >= MAX_ITEMS) break;
            Object key = row.get(keyColumn);
            if (key == null || key.toString().isBlank()) continue;
            String k = key.toString().strip();
            if (k.length() > CollectConfigs.KEY_MAX) k = k.substring(0, CollectConfigs.KEY_MAX);
            if (!seen.add(k)) continue; // 같은 키가 둘이면 앞의 것
            CollectItem item = CollectItem.of(k, row.get(valueColumn));
            if (item != null) items.add(item);
        }
        return items;
    }

    /** 결과 열 이름 찾기 — 정확히 같은 것 먼저, 없으면 대소문자 무시(Oracle 은 열 이름이 대문자로 온다). */
    private static String column(List<String> columns, String wanted) {
        for (String c : columns) if (c.equals(wanted)) return c;
        for (String c : columns) if (c.equalsIgnoreCase(wanted)) return c;
        return null;
    }

    private static String shorten(String s) {
        return s.length() <= 30 ? s : s.substring(0, 30) + "…";
    }
}
