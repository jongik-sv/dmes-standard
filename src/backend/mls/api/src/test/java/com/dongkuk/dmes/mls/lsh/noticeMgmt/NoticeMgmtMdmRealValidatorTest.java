package com.dongkuk.dmes.mls.lsh.noticeMgmt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.mdm.MdmChanges;
import com.dongkuk.dmes.cactus.mdm.MdmColumnMeta;
import com.dongkuk.dmes.cactus.mdm.MdmFetchResult;
import com.dongkuk.dmes.cactus.mdm.MdmMetaCache;
import com.dongkuk.dmes.cactus.mdm.MdmMetaFeed;
import com.dongkuk.dmes.cactus.mdm.MdmMetaService;
import com.dongkuk.dmes.cactus.mdm.MdmTargetType;
import com.dongkuk.dmes.cactus.mdm.MdmUnavailableException;
import com.dongkuk.dmes.cactus.mdm.MdmValidator;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mls.lsh.noticeMgmt.service.NoticeMgmtService;
import com.dongkuk.dmes.mls.repository.NoticeRepository;
import com.dongkuk.dmes.mls.repository.NoticeTargetRepository;
import com.dongkuk.dmes.mls.testdb.MlsTestDb;
import java.time.Clock;
import java.time.Duration;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.domain.DefaultDomainValidator;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.rule.MdmRuleEngine;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import kr.dongkuk.maru.mdm.engine.spi.MasterLookup;
import com.dongkuk.dmes.cactus.mdm.MdmCachedDefinitions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

/**
 * noticeMgmt save 에 진짜 {@link MdmValidator}(엔진 + 가짜 MDM 피드)를 끼운 시험 — TITLE 정의는 로컬 mdm.db 와 같다(STRING 1000·선택).
 * 가짜 검증기 시험({@link NoticeMgmtMdmSaveTest})이 못 보는 것: 요청 모양(grid·columns·행 자리)이 진짜 검증기에서 오류 위치·문구로 이어지는지.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@Transactional
class NoticeMgmtMdmRealValidatorTest extends MlsTestDb {

    @Autowired
    NoticeRepository repository;
    @Autowired
    NoticeTargetRepository targetRepository;

    private static final MdmColumnMeta TITLE = new MdmColumnMeta("TITLE", "제목", "제목", "제목", "제목", null, null, "STRING", 1000, null,
            false, null, null, null, null, new MdmColumnMeta.DomainRef("183", "설명", "TEXT"), null, null, List.of(), null);

    /** 피드가 TITLE 만 안다. {@code down} 이면 MDM 을 받을 수 없다. */
    private static MdmMetaFeed feed(boolean down) {
        return new MdmMetaFeed() {
            @Override
            public MdmChanges changes(long since, int limit) {
                throw new MdmUnavailableException("변경 응답 없음");
            }

            @Override
            public MdmFetchResult fetch(MdmTargetType type, Collection<String> keys) {
                if (down) {
                    throw new MdmUnavailableException("MDM 연결 실패");
                }
                Map<String, Object> found = new LinkedHashMap<>();
                if (type == MdmTargetType.COLUMN && keys.contains("TITLE")) {
                    found.put("TITLE", TITLE);
                }
                return new MdmFetchResult(found, Map.of());
            }
        };
    }

    private NoticeMgmtService serviceWith(boolean down) {
        Clock clock = Clock.systemUTC();
        MdmMetaCache cache = new MdmMetaCache(100, Duration.ofMinutes(60), clock);
        cache.clear(0);
        MdmMetaService meta = new MdmMetaService(feed(down), cache, clock);
        MdmCachedDefinitions cached = new MdmCachedDefinitions(meta);
        MdmEvaluator evaluator = new MdmEvaluator(
                new EngineLookups(cached, cached, CodeEffLookup.NONE, MasterLookup.NONE, FunctionProvider.NONE));
        MdmValidator validator = new MdmValidator(meta, evaluator, new DefaultDomainValidator(cached, evaluator),
                new MdmRuleEngine(evaluator, cached), MdmValidator.OnUnavailable.REJECT, clock);
        StaticListableBeanFactory beans = new StaticListableBeanFactory();
        beans.addBean("mdmValidator", validator);
        return new NoticeMgmtService(repository, targetRepository, beans.getBeanProvider(MdmValidator.class));
    }

    private static Map<String, Object> newRow(String title) {
        Map<String, Object> row = new HashMap<>();
        row.put("rowStatus", "C");
        row.put("rowKey", "r1");
        row.put("TITLE", title);
        row.put("CONTENT", "본문");
        row.put("NOTICE_STATUS", "DRAFT");
        return row;
    }

    @Test
    @DisplayName("MDM 정의 안의 값은 저장된다")
    void validTitleSaves() {
        long before = repository.count();

        Map<String, Object> out = serviceWith(false).save(List.of(newRow("정상 제목")));

        assertThat(out).containsEntry("cntMerge", 1);
        assertThat(repository.count()).isEqualTo(before + 1);
    }

    @Test
    @DisplayName("MDM 길이(1000자)를 넘으면 그 행·TITLE 칸에 MDM 문구 오류가 붙고 저장되지 않는다")
    void titleOverMdmLengthRejected() {
        long before = repository.count();

        BusinessException ex = assertThrows(BusinessException.class,
                () -> serviceWith(false).save(List.of(newRow("정상"), newRow("가".repeat(1001)))));

        List<ErrorDetail> mdm = ex.getErrors().stream().filter(e -> e.message().contains("1000")).toList();
        assertThat(mdm).hasSize(1);
        assertThat(mdm.get(0).grid()).isEqualTo("master");
        assertThat(mdm.get(0).rowIndex()).isEqualTo(1);
        assertThat(mdm.get(0).field()).isEqualTo("TITLE");
        assertThat(mdm.get(0).rowKey()).isEqualTo("r1");
        assertThat(mdm.get(0).code()).isEqualTo(ErrorCode.INVALID_VALUE.getCode());
        assertThat(repository.count()).isEqualTo(before);
    }

    @Test
    @DisplayName("MDM 정의를 받을 수 없으면 기본 정책(REJECT)대로 저장을 거부한다(MDM_UNAVAILABLE)")
    void mdmDownRejects() {
        long before = repository.count();

        BusinessException ex = assertThrows(BusinessException.class, () -> serviceWith(true).save(List.of(newRow("정상"))));

        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.BUSINESS_ERROR);
        assertThat(ex.getErrors()).extracting(ErrorDetail::code).contains(MdmValidator.UNAVAILABLE_CODE);
        assertThat(repository.count()).isEqualTo(before);
    }
}
