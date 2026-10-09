package com.dongkuk.dmes.mcm.job.builtin;

import com.dongkuk.dmes.cactus.job.CollectedValue;
import com.dongkuk.dmes.cactus.job.JobRunScope;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfigs;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectException;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectItem;
import com.dongkuk.dmes.mcm.job.builtin.collect.HttpCollectSource;
import com.dongkuk.dmes.mcm.job.builtin.collect.JobCollectSql;
import com.dongkuk.dmes.mcm.job.builtin.collect.SqlCollectSource;
import com.dongkuk.oasis.exceptions.UserException;
import com.dongkuk.oasis.methodinvoker.annotations.OptionalParam;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 내장 서비스 {@code jobCollect}(설계 §5.1·§5.4) — 원천(sql·http)에서 값을 읽어 {@link JobRunScope} 에 담는다. 저장은 진입점이 결과 갱신과
 * 같은 트랜잭션에서 한다({@code save:false} 면 읽기만 — 외부 트리거용). 수집 실패 문구는 주소·DB 메시지를 담지 않게 만들어져 있어 {@link UserException}
 * 으로 바꿔 실행 기록 MSG 에 남긴다. SQL 쿼리 시간 초과 = min(10초, 남은 시간).
 * 서비스 입력 {@code source}·{@code save} 가 있으면 그것을, 없으면 실행 범위의 정의 설정(config)을 쓴다(설계 §5.1).
 * 입력이 없는 호출도 묶이려면 BPMN 서비스 태스크에 {@code opt} 속성으로 두 이름을 선택 파라미터로 알려야 한다.
 */
public class JobCollectService {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final SqlCollectSource sqlSource;
    private final HttpCollectSource httpSource;

    public JobCollectService(SqlCollectSource sqlSource, HttpCollectSource httpSource) {
        this.sqlSource = sqlSource;
        this.httpSource = httpSource;
    }

    public Map<String, Object> run(@OptionalParam Map<String, Object> source, @OptionalParam Boolean save) {
        JobRunScope scope = JobRunScope.require();
        Object rawSource = source != null ? source : scope.config().get("source");
        boolean doSave = !Boolean.FALSE.equals(save != null ? save : scope.config().get("save"));
        List<CollectItem> items;
        try {
            CollectConfig.Source parsed = CollectConfigs.parseSource(JSON.<JsonNode>valueToTree(rawSource));   // 실행 때 다시 검사
            LocalDate today = scope.schedAt().toLocalDate();
            items = switch (parsed) {
                case CollectConfig.SqlSource s -> sqlSource.collect(s, scope.schedAt(), scope.vars(), scope.varTypes(), scope.queryTimeoutSeconds());
                case CollectConfig.HttpSource h -> {
                    HttpCollectSource.Result r = httpSource.collectDetailed(h, today, scope.vars(), scope.deadline());
                    if (r.retryNote() != null) scope.note(r.retryNote());   // 일시 오류를 재시도해 성공 — 이력 MSG 에 남는다
                    yield r.items();
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
