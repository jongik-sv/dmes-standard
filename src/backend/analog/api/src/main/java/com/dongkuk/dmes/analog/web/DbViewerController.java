package com.dongkuk.dmes.analog.web;

import com.dongkuk.dmes.analog.db.DbViewerException;
import com.dongkuk.dmes.analog.db.DbViewerService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 읽기전용 DB 뷰어 API (ADR-0002).
 *
 * <p>MES 업무 API가 아니라 관리자 도구(analog) 경로다. 인증은 기존 {@code X-Client-Key} 필터가
 * 전 경로에 적용된다. DB 미설정 시 503 + 안내를 반환한다 (D5).
 *
 * <p>BFF 컨벤션: FE는 BFF(be-proxy) 경유이며 BE 매핑은 원본 그대로 유지한다 (LogSearchController 관례).
 */
@RestController
@RequestMapping("/db")
public class DbViewerController {

    private final ObjectProvider<DbViewerService> serviceProvider;

    public DbViewerController(ObjectProvider<DbViewerService> serviceProvider) {
        this.serviceProvider = serviceProvider;
    }

    private DbViewerService service() {
        DbViewerService service = serviceProvider.getIfAvailable();
        if (service == null) {
            throw new DbViewerException(503, "DB 뷰어가 설정되지 않았습니다. analog.db.url을 확인해 주세요.");
        }
        return service;
    }

    /** 허용 스키마의 테이블 목록. */
    @GetMapping("/tables")
    public List<String> tables(@RequestParam String schema) {
        return service().listTables(schema);
    }

    /** 테이블 컬럼 목록 (속성 패널용). */
    @GetMapping("/columns")
    public List<Map<String, Object>> columns(@RequestParam String schema, @RequestParam String table) {
        return service().listColumns(schema, table);
    }

    /** 자유 SQL 실행 — SELECT 단문만, 서버가 재조립 후 실행한다. */
    @PostMapping("/query")
    public DbViewerService.QueryResult query(@RequestBody QueryRequest request) {
        if (request.sql() != null && !request.sql().isBlank()) {
            return service().query(request.sql());
        }
        if (request.table() != null && !request.table().isBlank()) {
            return service().queryStructured(request.schema(), request.table(), request.columns(),
                    request.limit());
        }
        throw new DbViewerException(400, "sql 또는 schema/table을 지정해 주세요.");
    }

    /**
     * 조회 요청 — {@code limit} 은 Jackson 3 엄격 바인딩 대응을 위해 {@code Integer} 로 받는다
     * (미지정 시 null → 서버 상한 적용).
     */
    public record QueryRequest(String sql, String schema, String table, List<String> columns, Integer limit) {
    }
}
