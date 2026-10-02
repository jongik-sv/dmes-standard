package com.dongkuk.dmes.mls.lsh.noticeMgmt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.mdm.MdmValidationRequest;
import com.dongkuk.dmes.cactus.mdm.MdmValidationResult;
import com.dongkuk.dmes.cactus.mdm.MdmValidator;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mls.lsh.noticeMgmt.service.NoticeMgmtService;
import com.dongkuk.dmes.mls.repository.NoticeRepository;
import com.dongkuk.dmes.mls.repository.NoticeTargetRepository;
import com.dongkuk.dmes.mls.testdb.MlsTestDb;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

/**
 * noticeMgmt save 의 MDM 저장 검증({@link MdmValidator#check}) 연결 — 하위 프로젝트 C spec §7 서버 부분.
 * 검증기는 가짜({@link MockitoBean})다. 실제 검증기 동작(길이·소수·룰 세트·검증 불가 정책)은 cactus-core {@code MdmValidatorTest} 몫이고,
 * 여기서는 서비스가 무엇을 어떻게 넘기고 결과를 어떻게 다루는지만 본다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@Transactional
class NoticeMgmtMdmSaveTest extends MlsTestDb {

    @Autowired
    NoticeMgmtService service;
    @Autowired
    NoticeRepository repository;
    @Autowired
    NoticeTargetRepository targetRepository;
    @MockitoBean
    MdmValidator mdmValidator;

    @BeforeEach
    void okByDefault() {
        when(mdmValidator.check(any())).thenReturn(new MdmValidationResult(List.of(), List.of(), Map.of()));
    }

    private static Map<String, Object> newRow(String title) {
        Map<String, Object> row = new HashMap<>();
        row.put("rowStatus", "C");
        row.put("TITLE", title);
        row.put("CONTENT", "본문");
        row.put("NOTICE_STATUS", "DRAFT");
        return row;
    }

    private MdmValidationRequest captured() {
        ArgumentCaptor<MdmValidationRequest> captor = ArgumentCaptor.forClass(MdmValidationRequest.class);
        verify(mdmValidator).check(captor.capture());
        return captor.getValue();
    }

    private static boolean skipped(Map<String, Object> row) {
        return "D".equals(row.get("rowStatus"));
    }

    @Test
    @DisplayName("저장할 행(C·U)만 grid=master·columns=TITLE 로 검증기에 넘기고, 삭제·미변경·빈 행은 자리를 지킨 채 건너뛰게 한다")
    void passesOnlySavedRowsKeepingIndexes() {
        long before = repository.count();
        Map<String, Object> unchanged = new HashMap<>();
        unchanged.put("rowStatus", "");
        unchanged.put("NOTICE_ID", "NT202609030001");
        unchanged.put("TITLE", "x".repeat(2000)); // 미변경 행의 옛 값은 검증하지 않는다
        Map<String, Object> deleted = new HashMap<>();
        deleted.put("rowStatus", "D");
        deleted.put("NOTICE_ID", "");
        List<Map<String, Object>> master = new ArrayList<>();
        master.add(newRow("첫째"));
        master.add(unchanged);
        master.add(null);
        master.add(deleted);
        master.add(newRow("다섯째"));
        master.get(4).put("rowStatus", "inserted"); // FE shared 그리드가 쓰는 표기도 저장 행이다

        service.save(master);

        MdmValidationRequest req = captured();
        assertThat(req.grid()).isEqualTo("master");
        assertThat(req.columns()).containsExactly("TITLE");
        assertThat(req.ruleSets()).isEmpty();
        assertThat(req.rows()).hasSize(5); // 자리(rowIndex)가 요청 목록과 같아야 오류가 화면의 그 행에 붙는다
        assertThat(skipped(req.rows().get(0))).isFalse();
        assertThat(req.rows().get(0)).containsEntry("TITLE", "첫째");
        assertThat(skipped(req.rows().get(1))).isTrue();
        assertThat(skipped(req.rows().get(2))).isTrue();
        assertThat(skipped(req.rows().get(3))).isTrue();
        assertThat(skipped(req.rows().get(4))).isFalse();
        assertThat(repository.count()).isEqualTo(before + 2);
    }

    @Test
    @DisplayName("저장할 행이 없으면(삭제만) 검증기를 부르지 않는다")
    void deleteOnlySkipsMdm() {
        Map<String, Object> deleted = new HashMap<>();
        deleted.put("rowStatus", "D");
        deleted.put("NOTICE_ID", "");

        service.save(List.of(deleted));

        verify(mdmValidator, never()).check(any());
    }

    @Test
    @DisplayName("MDM 값 오류는 수작업 검증 오류와 한 응답에 합쳐 내려가고, 아무것도 저장하지 않는다")
    void mdmValueErrorsMergedWithManualErrors() {
        long before = repository.count();
        ErrorDetail mdmError = new ErrorDetail("master", null, 0, "TITLE", ErrorCode.INVALID_VALUE.getCode(), "제목은(는) 최대 1000자입니다");
        when(mdmValidator.check(any())).thenThrow(
                new BusinessException(ErrorCode.INVALID_VALUE, "입력값을 확인해주세요.", List.of(mdmError)));
        Map<String, Object> noStatus = newRow("상태 없음");
        noStatus.put("NOTICE_STATUS", ""); // V-004 수작업 검증 위반

        BusinessException ex = assertThrows(BusinessException.class, () -> service.save(List.of(newRow("정상"), noStatus)));

        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE); // 기존 save 의 오류 봉투 그대로
        assertThat(ex.getMessage()).isEqualTo("입력값을 확인해주세요.");
        assertThat(ex.getErrors()).contains(mdmError);
        assertThat(ex.getErrors()).anyMatch(e -> "NOTICE_STATUS".equals(e.field()) && e.rowIndex() == 1);
        assertThat(repository.count()).isEqualTo(before);
    }

    @Test
    @DisplayName("MDM 검증 불가(MDM_UNAVAILABLE)는 그대로 던지고 아무것도 저장하지 않는다")
    void unavailablePropagates() {
        long before = repository.count();
        BusinessException unavailable = new BusinessException(ErrorCode.BUSINESS_ERROR, MdmValidator.UNAVAILABLE_MESSAGE,
                List.of(new ErrorDetail("master", null, null, null, MdmValidator.UNAVAILABLE_CODE, MdmValidator.UNAVAILABLE_MESSAGE)));
        when(mdmValidator.check(any())).thenThrow(unavailable);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.save(List.of(newRow("정상"))));

        assertThat(ex).isSameAs(unavailable);
        assertThat(repository.count()).isEqualTo(before);
    }

    @Test
    @DisplayName("검증기 빈이 없어도(cactus.mdm.enabled=false) 저장된다")
    void savesWithoutValidatorBean() {
        NoticeMgmtService withoutMdm = new NoticeMgmtService(repository, targetRepository,
                new StaticListableBeanFactory().getBeanProvider(MdmValidator.class));
        long before = repository.count();

        Map<String, Object> out = withoutMdm.save(List.of(newRow("MDM 없이")));

        assertThat(out).containsEntry("cntMerge", 1);
        assertThat(repository.count()).isEqualTo(before + 1);
        Mockito.verifyNoInteractions(mdmValidator);
    }
}
