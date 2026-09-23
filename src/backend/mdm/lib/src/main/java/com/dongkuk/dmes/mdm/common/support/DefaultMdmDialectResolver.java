package com.dongkuk.dmes.mdm.common.support;

import com.dongkuk.dmes.mdm.contract.common.MdmDialect;
import com.dongkuk.dmes.mdm.contract.common.MdmDialectResolver;
import java.sql.Connection;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.springframework.stereotype.Component;

/**
 * 방언 판정의 유일한 자리(TSK-01-03 B2, 규칙표 §4). 생성 때 연결 메타데이터의 제품 이름으로 한 번 판정해 캐시한다.
 */
@Component
public class DefaultMdmDialectResolver implements MdmDialectResolver {

    private final MdmDialect dialect;

    public DefaultMdmDialectResolver(DataSource dataSource) {
        this.dialect = detect(dataSource);
    }

    @Override
    public MdmDialect current() {
        return dialect;
    }

    private static MdmDialect detect(DataSource dataSource) {
        String product;
        try (Connection connection = dataSource.getConnection()) {
            product = connection.getMetaData().getDatabaseProductName();
        } catch (SQLException e) {
            throw new IllegalStateException("mdm DB 방언을 판정하지 못했습니다", e);
        }
        return switch (product) {
            case "SQLite" -> MdmDialect.SQLITE;
            case "Microsoft SQL Server" -> MdmDialect.MSSQL;
            default -> throw new IllegalStateException("mdm 이 지원하지 않는 DB 입니다: " + product);
        };
    }
}
