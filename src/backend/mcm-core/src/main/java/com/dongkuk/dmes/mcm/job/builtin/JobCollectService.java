package com.dongkuk.dmes.mcm.job.builtin;

import com.dongkuk.dmes.cactus.job.CollectedValue;
import com.dongkuk.dmes.cactus.job.JobRunScope;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfigs;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectException;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectItem;
import com.dongkuk.dmes.mcm.job.builtin.collect.ExchangeCollectSource;
import com.dongkuk.dmes.mcm.job.builtin.collect.HttpCollectSource;
import com.dongkuk.dmes.mcm.job.builtin.collect.JobCollectSql;
import com.dongkuk.dmes.mcm.job.builtin.collect.SqlCollectSource;
import com.dongkuk.oasis.exceptions.UserException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * 내장 서비스 {@code jobCollect}(설계 §5.1·§5.4) — 원천(sql·http·exchange)에서 값을 읽어 {@link JobRunScope} 에 담는다. 저장은 진입점이 결과 갱신과
 * 같은 트랜잭션에서 한다({@code save:false} 면 읽기만 — 외부 트리거용). 수집 실패 문구는 주소·DB 메시지를 담지 않게 만들어져 있어 {@link UserException}
 * 으로 바꿔 실행 기록 MSG 에 남긴다. SQL 쿼리 시간 초과 = min(10초, 남은 시간). 환율은 MCM 모듈 작업만(그 빈이 있는 앱).
 * 입력 파라미터를 받지 않는다(바인더가 없는 파라미터를 묶지 못한다 — 계획 「설계와 다름」). 원천·save 는 진입점이 config 에 실은 정의 값으로 읽는다.
 */
public class JobCollectService {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final SqlCollectSource sqlSource;
    private final HttpCollectSource httpSource;
    private final Supplier<ExchangeCollectSource> exchangeSource;

    public JobCollectService(SqlCollectSource sqlSource, HttpCollectSource httpSource, Supplier<ExchangeCollectSource> exchangeSource) {
        this.sqlSource = sqlSource;
        this.httpSource = httpSource;
        this.exchangeSource = exchangeSource;
    }

    public Map<String, Object> run() {
        JobRunScope scope = JobRunScope.require();
        Object rawSource = scope.config().get("source");
        boolean doSave = !Boolean.FALSE.equals(scope.config().get("save"));
        List<CollectItem> items;
        try {
            CollectConfig.Source parsed = CollectConfigs.parseSource(JSON.<JsonNode>valueToTree(rawSource));   // 실행 때 다시 검사
            LocalDate today = scope.schedAt().toLocalDate();
            items = switch (parsed) {
                case CollectConfig.SqlSource s -> sqlSource.collect(s, today, scope.vars(), scope.varTypes(), scope.queryTimeoutSeconds());
                case CollectConfig.HttpSource h -> httpSource.collect(h, today);
                case CollectConfig.ExchangeSource e -> {
                    ExchangeCollectSource ex = exchangeSource.get();
                    if (ex == null) throw new CollectException("이 모듈에서는 환율 수집을 쓸 수 없습니다(MCM 모듈 전용).");
                    yield ex.collect(e, today);
                }
            };
            if (items.isEmpty()) throw new CollectException("수집된 값이 없습니다.");
        } catch (CollectException | com.dongkuk.dmes.mcm.common.exception.BusinessException e) {
            throw new UserException(e.getMessage());
        }
        scope.addItems(items.size());
        if (doSave) {
            for (CollectItem item : items) scope.collect(new CollectedValue(item.key(), item.num(), item.txt()));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("itemCnt", items.size());
        return out;
    }
}
