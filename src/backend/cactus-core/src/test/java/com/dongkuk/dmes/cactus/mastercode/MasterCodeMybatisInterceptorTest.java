package com.dongkuk.dmes.cactus.mastercode;

import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Invocation;
import org.apache.ibatis.plugin.Signature;
import org.apache.ibatis.session.ResultHandler;
import org.apache.ibatis.session.RowBounds;
import org.junit.jupiter.api.Test;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * {@link MasterCodeMybatisInterceptor} 특성 테스트 — SELECT 결과 Map 행의 LoV·코드명 컬럼 자동 채움 규칙.
 */
class MasterCodeMybatisInterceptorTest {

    private final MasterCodeDecoder decoder = mock(MasterCodeDecoder.class);
    private final MasterCodeMybatisInterceptor interceptor = new MasterCodeMybatisInterceptor(decoder);

    private static Invocation returning(Object result) throws Exception {
        Invocation invocation = mock(Invocation.class);
        when(invocation.proceed()).thenReturn(result);
        return invocation;
    }

    private static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    @Test
    void Executor_query_4인자_시그니처만_가로챈다() {
        Signature[] sigs = MasterCodeMybatisInterceptor.class.getAnnotation(Intercepts.class).value();

        assertThat(sigs).hasSize(1);
        assertThat(sigs[0].type()).isEqualTo(Executor.class);
        assertThat(sigs[0].method()).isEqualTo("query");
        assertThat(sigs[0].args()).containsExactly(
                MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class);
    }

    @Test
    void plugin은_Executor를_프록시로_감싸고_다른_대상은_그대로_둔다() {
        Object wrapped = interceptor.plugin(mock(Executor.class));
        assertThat(Proxy.isProxyClass(wrapped.getClass())).isTrue();
        assertThat(wrapped).isInstanceOf(Executor.class);

        Object other = new Object();
        assertThat(interceptor.plugin(other)).isSameAs(other);
    }

    @Test
    void 결과가_List가_아니면_그대로_돌려준다() throws Exception {
        Object result = 3;

        assertThat(interceptor.intercept(returning(result))).isSameAs(result);
        verifyNoInteractions(decoder);
    }

    @Test
    void 빈_List는_그대로_돌려준다() throws Exception {
        List<Object> result = new ArrayList<>();

        assertThat(interceptor.intercept(returning(result))).isSameAs(result);
        verifyNoInteractions(decoder);
    }

    @Test
    void Map이_아닌_행은_건드리지_않는다() throws Exception {
        List<Object> result = new ArrayList<>(List.of("문자열 행"));

        assertThat(interceptor.intercept(returning(result))).isSameAs(result);
        verifyNoInteractions(decoder);
    }

    @Test
    void proceed가_InvocationTargetException을_던지면_IllegalStateException으로_감싼다() throws Exception {
        Invocation invocation = mock(Invocation.class);
        InvocationTargetException cause = new InvocationTargetException(new RuntimeException("db"));
        when(invocation.proceed()).thenThrow(cause);

        assertThatThrownBy(() -> interceptor.intercept(invocation))
                .isInstanceOf(IllegalStateException.class)
                .hasCause(cause);
    }

    // ── LoV 표준 형식 ──

    @Test
    void LoV_행은_MASTER_CODE를_그룹으로_VALUE를_디코딩해_DISPLAY_VALUE를_채운다() throws Exception {
        when(decoder.isMasterCode("USE_YN")).thenReturn(true);
        when(decoder.decode("Y", "USE_YN")).thenReturn("사용");
        Map<String, Object> r = row("MASTER_CODE", "USE_YN", "VALUE", "Y", "DISPLAY_VALUE", null);

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r.get("DISPLAY_VALUE")).isEqualTo("사용");
    }

    @Test
    void DISPLAY_VALUE가_이미_있으면_덮어쓰지_않는다() throws Exception {
        when(decoder.isMasterCode("USE_YN")).thenReturn(true);
        Map<String, Object> r = row("MASTER_CODE", "USE_YN", "VALUE", "Y", "DISPLAY_VALUE", "기존");

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r.get("DISPLAY_VALUE")).isEqualTo("기존");
        verify(decoder, never()).decode(anyString(), anyString());
    }

    @Test
    void DISPLAY_VALUE_키가_없으면_LoV로_보지_않아_채우지_않는다() throws Exception {
        when(decoder.isMasterCode("USE_YN")).thenReturn(true);
        Map<String, Object> r = row("MASTER_CODE", "USE_YN", "VALUE", "Y");

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r).doesNotContainKey("DISPLAY_VALUE");
        verify(decoder, never()).decode(anyString(), anyString());
    }

    @Test
    void 알려진_마스터코드_그룹이_아니면_LoV로_채우지_않는다() throws Exception {
        when(decoder.isMasterCode("UNKNOWN")).thenReturn(false);
        Map<String, Object> r = row("MASTER_CODE", "UNKNOWN", "VALUE", "Y", "DISPLAY_VALUE", null);

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r.get("DISPLAY_VALUE")).isNull();
        verify(decoder, never()).decode(anyString(), anyString());
    }

    @Test
    void VALUE가_문자열이_아니면_LoV로_보지_않는다() throws Exception {
        when(decoder.isMasterCode("USE_YN")).thenReturn(true);
        Map<String, Object> r = row("MASTER_CODE", "USE_YN", "VALUE", 1, "DISPLAY_VALUE", null);

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r.get("DISPLAY_VALUE")).isNull();
    }

    @Test
    void MASTER_CODE가_빈_문자열이면_isMasterCode를_묻지_않는다() throws Exception {
        Map<String, Object> r = row("MASTER_CODE", "", "VALUE", "Y", "DISPLAY_VALUE", null);

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        verifyNoInteractions(decoder);
    }

    @Test
    void isMasterCode는_행마다_다시_묻는다() throws Exception {
        when(decoder.isMasterCode("USE_YN")).thenReturn(true);
        when(decoder.decode("Y", "USE_YN")).thenReturn("사용");
        Map<String, Object> r1 = row("MASTER_CODE", "USE_YN", "VALUE", "Y", "DISPLAY_VALUE", null);
        Map<String, Object> r2 = row("MASTER_CODE", "USE_YN", "VALUE", "Y", "DISPLAY_VALUE", null);

        interceptor.intercept(returning(new ArrayList<>(List.of(r1, r2))));

        verify(decoder, org.mockito.Mockito.times(2)).isMasterCode("USE_YN");
    }

    // ── 네이밍 컨벤션 (_CD_NM / _STS_NM) ──

    @Test
    void CD_NM과_STS_NM이_null이면_같은_행의_코드_컬럼_이름을_그룹으로_디코딩한다() throws Exception {
        when(decoder.decode("A", "ITEM_CD")).thenReturn("품목A");
        when(decoder.decode("01", "ORDER_STS")).thenReturn("접수");
        Map<String, Object> r = row(
                "ITEM_CD", "A", "ITEM_CD_NM", null,
                "ORDER_STS", "01", "ORDER_STS_NM", null);

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r.get("ITEM_CD_NM")).isEqualTo("품목A");
        assertThat(r.get("ORDER_STS_NM")).isEqualTo("접수");
    }

    @Test
    void 이미_값이_있는_NM_컬럼은_건드리지_않는다() throws Exception {
        Map<String, Object> r = row("ITEM_CD", "A", "ITEM_CD_NM", "기존");

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r.get("ITEM_CD_NM")).isEqualTo("기존");
        verifyNoInteractions(decoder);
    }

    @Test
    void 코드_컬럼이_없거나_null이면_건너뛴다() throws Exception {
        Map<String, Object> r = row("ITEM_CD_NM", null, "ORDER_STS", null, "ORDER_STS_NM", null);

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r.get("ITEM_CD_NM")).isNull();
        assertThat(r.get("ORDER_STS_NM")).isNull();
        verifyNoInteractions(decoder);
    }

    @Test
    void 코드값이_문자열이_아니면_toString으로_디코딩한다() throws Exception {
        when(decoder.decode("7", "LINE_CD")).thenReturn("7라인");
        Map<String, Object> r = row("LINE_CD", 7, "LINE_CD_NM", null);

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r.get("LINE_CD_NM")).isEqualTo("7라인");
    }

    @Test
    void 다른_접미사의_NM_컬럼은_대상이_아니다() throws Exception {
        Map<String, Object> r = row("USER_ID", "u1", "USER_NM", null, "ITEM_CD", "A", "ITEM_NM", null);

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r.get("USER_NM")).isNull();
        assertThat(r.get("ITEM_NM")).isNull();
        verifyNoInteractions(decoder);
    }

    @Test
    void 대소문자를_구분해_소문자_컬럼은_대상이_아니다() throws Exception {
        Map<String, Object> r = row("item_cd", "A", "item_cd_nm", null);

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r.get("item_cd_nm")).isNull();
        verifyNoInteractions(decoder);
    }

    @Test
    void 디코더가_null을_주면_null을_넣는다() throws Exception {
        when(decoder.decode("A", "ITEM_CD")).thenReturn(null);
        Map<String, Object> r = row("ITEM_CD", "A", "ITEM_CD_NM", null);

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r).containsEntry("ITEM_CD_NM", null);
        verify(decoder).decode("A", "ITEM_CD");
    }

    /**
     * 그룹 키는 끝의 "_NM" 접미사만 떼어 정한다 — 이름 앞쪽의 "_NM" (예: ORDER_NMBR_CD_NM 의 ORDER) 에서 자르지 않는다.
     */
    @Test
    void 이름_중간에_NM이_있어도_첫_NM_앞부분_컬럼으로_디코딩하지_않는다() throws Exception {
        when(decoder.decode("X", "ORDER_NMBR_CD")).thenReturn("주문번호코드명");
        Map<String, Object> r = row("ORDER", "Z", "ORDER_NMBR_CD", "X", "ORDER_NMBR_CD_NM", null);

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r.get("ORDER_NMBR_CD_NM")).isEqualTo("주문번호코드명");
        verify(decoder, never()).decode("Z", "ORDER");
    }

    @Test
    void 이름_중간에_NM이_있고_앞부분_컬럼이_없어도_채운다() throws Exception {
        when(decoder.decode("X", "ORDER_NMBR_CD")).thenReturn("주문번호코드명");
        Map<String, Object> r = row("ORDER_NMBR_CD", "X", "ORDER_NMBR_CD_NM", null);

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r.get("ORDER_NMBR_CD_NM")).isEqualTo("주문번호코드명");
        verify(decoder).decode("X", "ORDER_NMBR_CD");
    }

    /** 결함 수정 — 그룹 키는 끝의 "_NM" 접미사만 떼어 정한다 (이름 앞쪽의 "_NM" 에서 자르지 않는다). */
    @Test
    void 이름_중간에_NM이_있어도_끝의_NM만_떼어_그룹_키로_쓴다() throws Exception {
        when(decoder.decode("X", "ORDER_NMBR_CD")).thenReturn("주문번호코드명");
        when(decoder.decode("10", "PROC_NM_STS")).thenReturn("진행");
        Map<String, Object> r = row(
                "ORDER", "Z", "ORDER_NMBR_CD", "X", "ORDER_NMBR_CD_NM", null,
                "PROC", "P", "PROC_NM_STS", "10", "PROC_NM_STS_NM", null);

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r.get("ORDER_NMBR_CD_NM")).isEqualTo("주문번호코드명");
        assertThat(r.get("PROC_NM_STS_NM")).isEqualTo("진행");
    }

    @Test
    void LoV가_아닌_행은_네이밍_규칙으로_간다() throws Exception {
        // DISPLAY_VALUE 가 이미 차 있어 LoV 가 아니면, 같은 행의 _CD_NM 을 채운다
        when(decoder.isMasterCode("USE_YN")).thenReturn(true);
        when(decoder.decode("A", "ITEM_CD")).thenReturn("품목A");
        Map<String, Object> r = row("MASTER_CODE", "USE_YN", "VALUE", "Y", "DISPLAY_VALUE", "사용",
                "ITEM_CD", "A", "ITEM_CD_NM", null);

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r.get("ITEM_CD_NM")).isEqualTo("품목A");
    }

    @Test
    void LoV_행이면_같은_행의_CD_NM은_채우지_않는다() throws Exception {
        when(decoder.isMasterCode("USE_YN")).thenReturn(true);
        when(decoder.decode("Y", "USE_YN")).thenReturn("사용");
        Map<String, Object> r = row("MASTER_CODE", "USE_YN", "VALUE", "Y", "DISPLAY_VALUE", null,
                "ITEM_CD", "A", "ITEM_CD_NM", null);

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r.get("DISPLAY_VALUE")).isEqualTo("사용");
        assertThat(r.get("ITEM_CD_NM")).isNull();
    }

    @Test
    void HashMap_행도_같은_규칙으로_채운다() throws Exception {
        when(decoder.decode("A", "ITEM_CD")).thenReturn("품목A");
        Map<String, Object> r = new HashMap<>();
        r.put("ITEM_CD", "A");
        r.put("ITEM_CD_NM", null);

        interceptor.intercept(returning(new ArrayList<>(List.of(r))));

        assertThat(r.get("ITEM_CD_NM")).isEqualTo("품목A");
    }
}
