package com.dongkuk.dmes.cactus.mastercode;

import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Invocation;
import org.apache.ibatis.plugin.Plugin;
import org.apache.ibatis.plugin.Signature;
import org.apache.ibatis.session.ResultHandler;
import org.apache.ibatis.session.RowBounds;

import java.lang.reflect.InvocationTargetException;
import java.util.List;
import java.util.Map;
import java.util.Properties;

/**
 * MyBatis SELECT 결과의 마스터 코드 컬럼을 자동 디코딩한다.
 * film {@code com.dongkuk.dmes.film.cmn.master.MasterCodeIntercept} 를 cactus 로 이식
 * (Phase 1, 2026-05-12).
 *
 * <p>처리 패턴:
 * <ul>
 *   <li><b>LoV 표준 형식 (Map 행)</b>: {@code MASTER_CODE}, {@code VALUE}, {@code DISPLAY_VALUE} 컬럼이
 *       있고 {@code DISPLAY_VALUE} 가 비어있으면, {@code MASTER_CODE} 를 그룹 코드로 보고
 *       {@code VALUE} 를 디코딩해 {@code DISPLAY_VALUE} 에 채움</li>
 *   <li><b>네이밍 컨벤션 (Map 행)</b>: {@code XXX_CD_NM} / {@code XXX_STS_NM} 컬럼이 비어 있고
 *       같은 행에 {@code XXX_CD} / {@code XXX_STS} 가 있으면 디코딩해서 채움</li>
 * </ul>
 *
 * <p>film 의 {@code Lov} 분기는 cactus 의 {@code Lov} 가 immutable 이라 *생략*. LoV 응답은
 * 보통 별도 controller 가 처리하므로 누락 영향 적음.
 *
 * <p>활성 조건: {@link MasterCodeMybatisAutoConfiguration} 가 SqlSessionFactory 존재 +
 * {@link MasterCodeDecoder} 빈 존재 시 자동 등록.
 */
@Intercepts({
        @Signature(type = Executor.class, method = "query",
                args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class})
})
public class MasterCodeMybatisInterceptor implements Interceptor {

    private static final String MASTER_CODE_FIELD = "MASTER_CODE";
    private static final String VALUE_FIELD = "VALUE";
    private static final String DISPLAY_VALUE_FIELD = "DISPLAY_VALUE";

    private static final String CD_NM_SUFFIX = "_CD_NM";
    private static final String STS_NM_SUFFIX = "_STS_NM";
    private static final String NM_SUFFIX = "_NM";

    private final MasterCodeDecoder decoder;

    public MasterCodeMybatisInterceptor(MasterCodeDecoder decoder) {
        this.decoder = decoder;
    }

    @Override
    public Object intercept(Invocation invocation) {
        Object proceed;
        try {
            proceed = invocation.proceed();
        } catch (InvocationTargetException | IllegalAccessException e) {
            throw new IllegalStateException(e);
        }

        if (!(proceed instanceof List<?> rows) || rows.isEmpty()) {
            return proceed;
        }

        for (Object row : rows) {
            if (row instanceof Map<?, ?> rawMap) {
                @SuppressWarnings("unchecked")
                Map<String, Object> rowMap = (Map<String, Object>) rawMap;
                if (isLovRow(rowMap)) {
                    fillLovDisplayValue(rowMap);
                } else {
                    fillCodeNameColumns(rowMap);
                }
            }
            // Lov 인스턴스 분기 생략 — cactus.web.inbound.Lov 가 immutable
        }
        return proceed;
    }

    /**
     * 행이 LoV 표준 형식 (MASTER_CODE/VALUE/DISPLAY_VALUE 셋이 있고 DISPLAY_VALUE 가 null) 인지 판단.
     */
    private boolean isLovRow(Map<String, Object> rowMap) {
        Object groupCd = rowMap.get(MASTER_CODE_FIELD);
        if (!(groupCd instanceof String groupCdStr) || groupCdStr.isEmpty()) {
            return false;
        }
        if (!decoder.isMasterCode(groupCdStr)) {
            return false;
        }
        if (!(rowMap.get(VALUE_FIELD) instanceof String)) {
            return false;
        }
        // DISPLAY_VALUE 키 자체는 있고 값은 null 인 경우만 채움
        return rowMap.containsKey(DISPLAY_VALUE_FIELD) && rowMap.get(DISPLAY_VALUE_FIELD) == null;
    }

    private void fillLovDisplayValue(Map<String, Object> rowMap) {
        String groupCd = (String) rowMap.get(MASTER_CODE_FIELD);
        String value = (String) rowMap.get(VALUE_FIELD);
        String decoded = decoder.decode(value, groupCd);
        rowMap.put(DISPLAY_VALUE_FIELD, decoded);
    }

    /**
     * {@code XXX_CD_NM} 또는 {@code XXX_STS_NM} 컬럼이 null 이면 같은 행의 {@code XXX_CD}/{@code XXX_STS}
     * 값을 디코딩해 채운다.
     */
    private void fillCodeNameColumns(Map<String, Object> rowMap) {
        for (Map.Entry<String, Object> entry : rowMap.entrySet()) {
            String key = entry.getKey();
            if (entry.getValue() != null) {
                continue;
            }
            if (!key.endsWith(CD_NM_SUFFIX) && !key.endsWith(STS_NM_SUFFIX)) {
                continue;
            }
            // "_NM" 잘라 그룹 코드 키 (예: "ORDER_STS_NM" → "ORDER_STS")
            String groupKey = key.substring(0, key.indexOf(NM_SUFFIX));
            Object codeValue = rowMap.get(groupKey);
            if (codeValue == null) {
                continue;
            }
            String decoded = decoder.decode(codeValue.toString(), groupKey);
            rowMap.put(key, decoded);
        }
    }

    @Override
    public Object plugin(Object target) {
        return Plugin.wrap(target, this);
    }

    @Override
    public void setProperties(Properties properties) {
        // no-op
    }
}
