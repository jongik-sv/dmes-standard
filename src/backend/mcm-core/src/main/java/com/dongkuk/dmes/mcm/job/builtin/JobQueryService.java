package com.dongkuk.dmes.mcm.job.builtin;

import com.dongkuk.dmes.cactus.job.JobRunScope;
import com.dongkuk.oasis.exceptions.UserException;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/**
 * 내장 서비스 {@code jobQuery}(설계 §5.1·§4.4 D31) — 그 모듈 기본 DataSource 에서 DML 한 문장 또는 프로시저 호출 하나를 서비스 트랜잭션 안에서 실행한다.
 * <b>JDBC 문장마다 쿼리 시간 초과</b>: 이 시도의 마감까지 남은 초를 올림, 최소 1초({@link JobRunScope#queryTimeoutSeconds()}). 초과하면 Oracle 이 ORA-01013 을 던지고
 * 예외를 그대로 올려 서비스 트랜잭션이 롤백되며, 진입점이 TIMEOUT 으로 기록한다. 문장은 실행 때 다시 검사한다({@link QueryStatementGuard}).
 * 입력 파라미터를 받지 않는다(바인더가 없는 파라미터를 묶지 못한다 — 계획 「설계와 다름」). SQL·변수는 진입점이 config·inputs 에 실은 값으로 읽는다.
 */
public class JobQueryService {

    private final DataSource dataSource;

    public JobQueryService(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public Map<String, Object> run() {
        JobRunScope scope = JobRunScope.require();
        String text = scope.config().get("sql") == null ? null : String.valueOf(scope.config().get("sql"));
        QueryStatementGuard.Checked checked;
        try {
            checked = QueryStatementGuard.check(text);
        } catch (IllegalArgumentException e) {
            throw new UserException(e.getMessage());
        }
        MapSqlParameterSource params = new MapSqlParameterSource();
        for (String name : checked.variables()) {
            if (!scope.vars().containsKey(name)) throw new UserException("변수 :" + name + " 의 값이 없습니다");
            JobBind.Bound b = JobBind.of(scope.vars().get(name), scope.varTypes().get(name));
            params.addValue(name, b.value(), b.sqlType());
        }
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.setQueryTimeout(scope.queryTimeoutSeconds());
        int updated = new NamedParameterJdbcTemplate(jdbc).update(checked.sql(), params);
        int items = checked.procedure() ? 0 : updated;
        scope.addItems(items);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("itemCnt", items);
        return out;
    }
}
