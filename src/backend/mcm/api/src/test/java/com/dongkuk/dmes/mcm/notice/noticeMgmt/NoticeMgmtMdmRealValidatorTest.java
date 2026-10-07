package com.dongkuk.dmes.mcm.notice.noticeMgmt;

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
import com.dongkuk.dmes.mcm.notice.noticeMgmt.service.NoticeMgmtService;
import com.dongkuk.dmes.mcm.notice.repository.NoticeRepository;
import com.dongkuk.dmes.mcm.notice.repository.NoticeTargetRepository;
import com.dongkuk.dmes.mcm.notice.McmNoticeTestDb;
import java.time.Clock;
import java.time.Duration;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.transaction.annotation.Transactional;

/**
 * noticeMgmt save 에 진짜 {@link MdmValidator}(엔진 + 가짜 MDM 피드)를 끼운 시험 — TITLE 정의는 로컬 mdm.db 와 같다(STRING 1000·선택).
 * 가짜 검증기 시험({@link NoticeMgmtMdmSaveTest})이 못 보는 것: 요청 모양(grid·columns·행 자리)이 진짜 검증기에서 오류 위치·문구로 이어지는지.
 */
@Transactional
class NoticeMgmtMdmRealValidatorTest extends McmNoticeTestDb {

    @Autowired
    NoticeRepository repository;
    @Autowired
    NoticeTargetRepository targetRepository;

    private static MdmColumnMeta title(int length, boolean required) {
        return new MdmColumnMeta("TITLE", "제목", "제목", "제목", "제목", null, null, "STRING", length, null,
                required, null, null, null, null, new MdmColumnMeta.DomainRef("183", "설명", "TEXT"), null, null, List.of(), null, null, null, null);
    }

    /** 피드가 TITLE 만 안다({@code knowsTitle} 이 거짓이면 TITLE 도 모른다 — 관리자가 컬럼을 지운 상태). {@code down} 이면 MDM 을 받을 수 없다. */
    private static MdmMetaFeed feed(boolean down, int titleLength, boolean knowsTitle, boolean titleRequired) {
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
                if (knowsTitle && type == MdmTargetType.COLUMN && keys.contains("TITLE")) {
                    found.put("TITLE", title(titleLength, titleRequired));
                }
                return new MdmFetchResult(found, Map.of());
            }
        };
    }

    private NoticeMgmtService serviceWith(boolean down) {
        return serviceWith(down, 1000);
    }

    private NoticeMgmtService serviceWith(boolean down, int titleLength) {
        return serviceWith(feed(down, titleLength, true, false));
    }

    private NoticeMgmtService serviceWith(MdmMetaFeed feed) {
        Clock clock = Clock.systemUTC();
        MdmMetaCache cache = new MdmMetaCache(100, Duration.ofMinutes(60), clock);
        cache.clear(0);
        MdmMetaService meta = new MdmMetaService(feed, cache, clock);
        MdmValidator validator = new MdmValidator(meta, FunctionProvider.NONE, MdmValidator.OnUnavailable.REJECT, clock);
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
    @DisplayName("MDM 길이(1000자)를 넘으면 그 행·TITLE 칸에 오류가 붙고 저장되지 않는다 — 같은 칸의 수작업(200자) 오류와 겹치면 하나만 남는다")
    void titleOverMdmLengthRejected() {
        long before = repository.count();

        BusinessException ex = assertThrows(BusinessException.class,
                () -> serviceWith(false).save(List.of(newRow("정상"), newRow("가".repeat(1001)))));

        List<ErrorDetail> titleErrors = ex.getErrors().stream().filter(e -> "TITLE".equals(e.field())).toList();
        assertThat(titleErrors).hasSize(1); // 한 칸 한 오류 — 1000자로 줄여도 200자 오류가 남는 어긋남이 없다
        assertThat(titleErrors.get(0).rowIndex()).isEqualTo(1);
        assertThat(titleErrors.get(0).message()).contains("200자"); // 더 엄격한 DB 한도(수작업)가 남는다
        assertThat(repository.count()).isEqualTo(before);
    }

    @Test
    @DisplayName("MDM 오류는 수작업 검증이 못 보는 칸에서 그대로 내려간다(grid·rowIndex·field·rowKey·code)")
    void mdmErrorShape() {
        // 가짜 MDM 정의를 20자로 좁혀 수작업(200자)이 못 보는 위반을 만든다 — 길이 문구·위치는 진짜 검증기가 만든다.
        BusinessException ex = assertThrows(BusinessException.class,
                () -> serviceWith(false, 20).save(List.of(newRow("정상"), newRow("가".repeat(21)))));

        assertThat(ex.getErrors()).hasSize(1);
        ErrorDetail e = ex.getErrors().get(0);
        assertThat(e.grid()).isEqualTo("master");
        assertThat(e.rowIndex()).isEqualTo(1);
        assertThat(e.field()).isEqualTo("TITLE");
        assertThat(e.rowKey()).isEqualTo("r1");
        assertThat(e.code()).isEqualTo(ErrorCode.INVALID_VALUE.getCode());
        assertThat(e.message()).contains("20");
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

    @Test
    @DisplayName("MDM 컬럼 사전에서 TITLE 이 지워지거나 이름이 바뀌어도 저장은 막히지 않는다(검증기가 그 칸을 건너뛴다)")
    void titleMissingFromMdmDoesNotBlockSave() {
        long before = repository.count();

        Map<String, Object> out = serviceWith(feed(false, 1000, false, false)).save(List.of(newRow("정상 제목")));

        assertThat(out).containsEntry("cntMerge", 1);
        assertThat(repository.count()).isEqualTo(before + 1);
    }

    @Test
    @DisplayName("저장하지 않는 자리(null·미변경 행)는 MDM 필수 검사를 받지 않는다 — 필수 TITLE 정의여도 null 행이 E001 을 내지 않는다")
    void nullRowsDoNotRaiseMdmRequiredErrors() {
        long before = repository.count();
        List<Map<String, Object>> master = new java.util.ArrayList<>();
        master.add(null);
        master.add(newRow("정상 제목"));
        master.add(null);

        Map<String, Object> out = serviceWith(feed(false, 1000, true, true)).save(master);

        assertThat(out).containsEntry("cntMerge", 1);
        assertThat(repository.count()).isEqualTo(before + 1);
    }
}
