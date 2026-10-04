package com.dongkuk.dmes.cactus.tx;

import com.dongkuk.dmes.cactus.datasource.CactusDataSourceProperties;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationContext;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * {@link CactusTxConfigValidator} 특성 테스트 — 부팅 시 fail-fast 검증 순서와 예외 문구를 고정한다.
 *
 * <p>스프링 컨텍스트 없이 생성자로 직접 만들고 {@link ApplicationContext} 는 mock 으로 둔다.
 */
class CactusTxConfigValidatorTest {

    private CactusTxProperties txProps;
    private OasisProperties oasisProps;
    private CactusDataSourceProperties dsProps;
    private ApplicationContext appContext;

    @BeforeEach
    void setUp() {
        txProps = new CactusTxProperties();
        oasisProps = new OasisProperties();
        dsProps = new CactusDataSourceProperties();
        appContext = mock(ApplicationContext.class);
        // 기본은 모든 빈이 있다고 본다 — 각 시험이 필요한 것만 false 로 바꾼다.
        when(appContext.containsBean(anyString())).thenReturn(true);
    }

    private CactusTxConfigValidator validator() {
        return new CactusTxConfigValidator(txProps, oasisProps, dsProps, appContext);
    }

    private void manager(String alias, String dataSource) {
        CactusTxProperties.TxMgrConfig cfg = new CactusTxProperties.TxMgrConfig();
        cfg.setDataSource(dataSource);
        txProps.getManagers().put(alias, cfg);
    }

    private void extra(String name) {
        dsProps.getExtras().put(name, new CactusDataSourceProperties.DataSourceProps());
    }

    /** 표준 3개 (txBiz/txCmn/txIF) 를 biz·cmn·if 로 매핑한 정상 설정. */
    private void standardConfig() {
        dsProps.setPrimaryAlias("biz");
        extra("cmn");
        extra("if");
        manager("txBiz", "biz");
        manager("txCmn", "cmn");
        manager("txIF", "if");
        txProps.setDefaultManager("txBiz");
        oasisProps.setTransactional(true);
    }

    // ── 검증 1-quater: extras key 충돌 (managers 유무와 무관) ──

    @Test
    void extras_key가_primary_alias와_같으면_managers가_비어도_실패한다() {
        dsProps.setPrimaryAlias("biz");
        extra("biz");

        assertThatThrownBy(() -> validator().validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cactus.datasource.extras.biz")
                .hasMessageContaining("[cactus.datasource.primary-alias]");
    }

    @Test
    void extras_key가_스프링_표준_빈_이름이면_실패한다() {
        extra("dataSource");

        assertThatThrownBy(() -> validator().validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("[Spring Boot 표준 빈 이름]");
    }

    @Test
    void extras_key가_cactus_로_시작하면_실패한다() {
        extra("cactusCmn");

        assertThatThrownBy(() -> validator().validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("[cactus 자체 빈 prefix]");
    }

    @Test
    void 충돌이_여러_개면_모두_한_메시지에_나열한다() {
        // "cactus" prefix 이면서 primary-alias 와도 같은 key
        dsProps.setPrimaryAlias("cactusX");
        extra("cactusX");

        assertThatThrownBy(() -> validator().validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("[cactus.datasource.primary-alias, cactus 자체 빈 prefix]");
    }

    // ── 검증 1: managers 비어있음 ──

    @Test
    void managers가_비면_transactional_true여도_예외없이_통과한다() {
        oasisProps.setTransactional(true);

        assertThatCode(() -> validator().validate()).doesNotThrowAnyException();
    }

    @Test
    void managers가_비고_transactional_false면_통과한다() {
        assertThatCode(() -> validator().validate()).doesNotThrowAnyException();
    }

    // ── 검증 1-bis: 표준 3개 ──

    @Test
    void transactional_true면_표준_3개_중_누락을_정렬된_목록으로_알린다() {
        dsProps.setPrimaryAlias("biz");
        manager("txBiz", "biz");
        txProps.setDefaultManager("txBiz");
        oasisProps.setTransactional(true);

        assertThatThrownBy(() -> validator().validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("표준 3개 중 누락: [txCmn, txIF]");
    }

    @Test
    void transactional_false면_표준_3개가_없어도_통과한다() {
        dsProps.setPrimaryAlias("biz");
        manager("txMain", "biz");
        txProps.setDefaultManager("txMain");

        assertThatCode(() -> validator().validate()).doesNotThrowAnyException();
    }

    // ── 검증 2: default ──

    @Test
    void default_manager가_없으면_실패한다() {
        standardConfig();
        txProps.setDefaultManager(null);

        assertThatThrownBy(() -> validator().validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cactus.tx.default 키 필수");
    }

    @Test
    void default_manager가_공백이어도_실패한다() {
        standardConfig();
        txProps.setDefaultManager("  ");

        assertThatThrownBy(() -> validator().validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cactus.tx.default 키 필수");
    }

    @Test
    void default_manager가_managers에_없으면_실패한다() {
        standardConfig();
        txProps.setDefaultManager("txNone");

        assertThatThrownBy(() -> validator().validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cactus.tx.default='txNone' 이 cactus.tx.managers 에 없습니다")
                .hasMessageContaining("[txBiz, txCmn, txIF]");
    }

    @Test
    void 표준_누락_검사가_default_검사보다_먼저다() {
        dsProps.setPrimaryAlias("biz");
        manager("txBiz", "biz");
        oasisProps.setTransactional(true);
        // default 도 없지만 표준 누락이 먼저 걸린다

        assertThatThrownBy(() -> validator().validate())
                .hasMessageContaining("표준 3개 중 누락");
    }

    // ── 검증 3: data-source 정의 ──

    @Test
    void data_source가_primary_alias도_extras도_아니면_사용_가능_목록과_함께_실패한다() {
        standardConfig();
        manager("txIF", "unknown");

        assertThatThrownBy(() -> validator().validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("TxMgr 'txIF' 의 data-source='unknown'")
                .hasMessageContaining("사용 가능: [biz, cmn, if]");
    }

    @Test
    void primary_alias가_없으면_사용_가능_목록은_extras만_보인다() {
        extra("cmn");
        manager("txMain", "biz");
        txProps.setDefaultManager("txMain");

        assertThatThrownBy(() -> validator().validate())
                .hasMessageContaining("사용 가능: [cmn]");
    }

    @Test
    void data_source가_공백이면_키_필수로_실패한다() {
        standardConfig();
        manager("txIF", " ");

        assertThatThrownBy(() -> validator().validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cactus.tx.managers.txIF.data-source 키 필수");
    }

    /**
     * 현재 동작 고정 — data-source 가 null 이면 검증 1-ter 의 groupingBy 가 null key 로
     * {@link NullPointerException} 을 먼저 던져, 검증 3 의 "data-source 키 필수" 문구까지 가지 못한다.
     * (결함 후보: 실제 부팅에서는 CactusMultiTransactionManagerAutoConfiguration 이 먼저 같은 문구로 막는다.)
     */
    @Test
    void data_source가_null이면_현재는_NPE가_난다() {
        standardConfig();
        manager("txIF", null);

        assertThatThrownBy(() -> validator().validate())
                .isInstanceOf(NullPointerException.class);
    }

    // ── 검증 3-bis: primary-alias 의 dataSource 빈 ──

    @Test
    void primary_alias가_있는데_dataSource_빈이_없으면_실패한다() {
        standardConfig();
        when(appContext.containsBean("dataSource")).thenReturn(false);

        assertThatThrownBy(() -> validator().validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("primary-alias='biz' 명시했지만 Spring Boot 의 dataSource 빈이");
    }

    // ── 검증 4: alias 대상 빈 ──

    @Test
    void alias_대상_빈이_컨텍스트에_없으면_실패한다() {
        standardConfig();
        when(appContext.containsBean("txCmn")).thenReturn(false);

        assertThatThrownBy(() -> validator().validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("TxMgr alias 'txCmn' 의 대상 빈이 ApplicationContext 에 없음");
    }

    // ── 정상 ──

    @Test
    void 표준_설정이면_통과한다() {
        standardConfig();

        assertThatCode(() -> validator().validate()).doesNotThrowAnyException();
    }

    @Test
    void 같은_DS에_여러_alias를_매핑해도_경고만_하고_통과한다() {
        dsProps.setPrimaryAlias("biz");
        manager("txBiz", "biz");
        manager("txCmn", "biz");
        manager("txIF", "biz");
        txProps.setDefaultManager("txBiz");
        oasisProps.setTransactional(true);

        assertThatCode(() -> validator().validate()).doesNotThrowAnyException();
    }
}
