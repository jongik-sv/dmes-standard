package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.jdbc.ColumnConverter;
import com.dongkuk.oasis.utils.ObjectUtil;
import com.dongkuk.oasis.utils.SqlUtil;
import com.dongkuk.oasis.utils.StringUtil;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.rowset.SqlRowSet;
import org.springframework.jdbc.support.rowset.SqlRowSetMetaData;

import javax.sql.DataSource;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * @author Jeongjin Kim
 * @since 2022-03-08
 */
final class JdbcTemplateSqlRunner {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(JdbcTemplateSqlRunner.class);

    public TypedObject run(Map<String, Object> param,
                           DataSource dataSource,
                           ColumnConverter columnConverter,
                           String sql) {
        if (sql == null) {
            throw new UncategorizedSQLException("SQL Check", "", new SQLException("SQL cannot be null."));
        }

        String trimmedSql = SqlUtil.removeComments(sql).trim().toUpperCase();
        if (!trimmedSql.startsWith("SELECT") && !trimmedSql.startsWith("WITH")) {
            throw new UncategorizedSQLException(
                    "SQL Check",
                    sql,
                    new SQLException("Only SELECT or WITH statements are allowed."));
        }

        NamedParameterJdbcTemplate jdbcTemplate =
                new NamedParameterJdbcTemplate(dataSource);

        SqlRowSet sqlRowSet = jdbcTemplate.queryForRowSet(sql, param);
        SqlRowSetMetaData metaData = sqlRowSet.getMetaData();
        int rowCount = 0;

        boolean last = sqlRowSet.last();
        if (last) {
            rowCount = sqlRowSet.getRow();
            sqlRowSet.beforeFirst();
        }
        Class<?> dtoClass = null;
        if (sql.contains("resultType")) {
            String dtoClassName = extractDtoClassName(sql);
            if (dtoClassName != null && !isValidClassName(dtoClassName)) {
                throw new UncategorizedSQLException(
                        "SQL Check",
                        sql,
                        new SQLException("Invalid DTO class name: " + dtoClassName));
            }
            try {
                dtoClass = Class.forName(dtoClassName);
            } catch (ClassNotFoundException e) {
                throw new RuntimeException(e);
            }
        }

        TypedObject resultObject;

        if (dtoClass == null) {
            List<Map<String, Object>> maps = new ArrayList<>(rowCount);
            while (sqlRowSet.next()) {
                maps.add(convertRowToMap(columnConverter, sqlRowSet, metaData));
            }
            log.debug(maps.size() + " row(s) selected.");
            resultObject = new TypedObject(maps, new TypeReference<List<Map<String, Object>>>() {
            });
        } else {
            List<Object> maps = new ArrayList<>(rowCount);
            while (sqlRowSet.next()) {
                Map<String, Object> stringObjectMap = convertRowToMap(columnConverter, sqlRowSet, metaData);
                Object o = convertMapToObject(stringObjectMap, dtoClass);
                maps.add(o);
            }
            log.debug(maps.size() + " row(s) selected.");

            resultObject = new TypedObject(maps, new TypeReference<List<Object>>() {
            });
        }

        return resultObject;
    }

    private Object convertMapToObject(Map<?, ?> stringObjectMap, Class<?> dtoClass) {
        return ObjectUtil.convertMapToObject(stringObjectMap, dtoClass);
    }

    private Map<String, Object> convertRowToMap(ColumnConverter columnConverter,
                                                SqlRowSet sqlRowSet,
                                                SqlRowSetMetaData metaData) {
        int columnCount = metaData.getColumnCount();
        Map<String, Object> rowMap = new HashMap<>(columnCount);
        for (int j = 1; j <= columnCount; j++) {
            rowMap.put(
                    StringUtil.convertToCamelCase(metaData.getColumnName(j)),
                    columnConverter.convert(
                            metaData.getColumnType(j),
                            sqlRowSet.getObject(j)));
        }
        return rowMap;
    }

    private String extractDtoClassName(String sql) {
        String exp = "\\/\\*.*\\bresultType\\W*=\\W*([\\w.$]*)\\b";
        Pattern pattern = Pattern.compile(exp, Pattern.CASE_INSENSITIVE);
        Matcher matcher = pattern.matcher(sql);

        if (matcher.find()) {
            if (matcher.groupCount() == 1) {
                return matcher.group(1);
            } else
                return null;
        } else
            return null;

    }

    private boolean isValidClassName(String className) {
        // Simple regex to check for valid Java class name characters
        return className.matches("^[a-zA-Z_$][a-zA-Z\\d_$]*(\\.[a-zA-Z_$][a-zA-Z\\d_$]*)*$");
    }

}
