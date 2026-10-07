package com.dongkuk.dmes.mcm.cma.masterCodeUploadFilePopup.service;

import com.dongkuk.dmes.mcm.cma.masterCodeMng.service.MasterCodeMngService;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.repository.MasterCodeCategoryRepository;
import com.dongkuk.dmes.mcm.repository.MasterCodeDetailRepository;
import com.dongkuk.dmes.mcm.repository.MasterCodeRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * PK 칸 빈 값 사전 검증 — Oracle 은 {@code ''} 를 NULL 로 받아(oracle-1007) PK INSERT 가 ORA-01400 으로 실패하고
 * 삭제·존재 확인은 조용히 0 건이 된다. 두 서비스가 null·빈 글자·공백 PK 를 DB 에 보내기 전에 거르는지 확인한다.
 */
@ExtendWith(MockitoExtension.class)
class MasterCodeUploadFilePopupServicePkBlankTest {

    @Mock MasterCodeDetailRepository detailRepository;
    @Mock MasterCodeRepository masterCodeRepository;
    @Mock MasterCodeCategoryRepository categoryRepository;

    @Test
    @DisplayName("엑셀 업로드 — PK 칸(MASTER_CODE·CATEGORY_ID·CODE_VAL) 이 빈 글자·공백·null 이면 REQUIRED_VALUE, 저장 안 함")
    void upload_blankPk_rejected() {
        MasterCodeUploadFilePopupService service = new MasterCodeUploadFilePopupService(detailRepository);
        for (Map<String, Object> row : List.of(
                row("", "SZ0000", "A"),
                row("MC1", "  ", "A"),
                row("MC1", "SZ0000", null))) {
            assertThatThrownBy(() -> service.saveMasterCodeFileUpload("MC1", "false", List.of(row)))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(e -> {
                        BusinessException be = (BusinessException) e;
                        assertThat(be.getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE);
                        assertThat(be.getErrors()).hasSize(1);
                        assertThat(be.getErrors().get(0).toString()).contains("REQ");
                    });
        }
        verify(detailRepository, never()).save(any());
        verify(detailRepository, never()).deleteByMasterCodeAsIs(any());
    }

    @Test
    @DisplayName("상세 저장 — PK 칸이 빈 글자·공백이면 그 행은 건너뛴다(저장·삭제 안 함)")
    void saveDetail_blankPk_skipped() {
        MasterCodeMngService service = new MasterCodeMngService(masterCodeRepository, detailRepository, categoryRepository);
        Map<String, Object> ins = row("MC1", "", "A");
        ins.put("rowStatus", "inserted");
        Map<String, Object> del = row("MC1", "SZ0000", " ");
        del.put("rowStatus", "deleted");

        Map<String, Object> out = service.saveDetail(List.of(ins, del));

        assertThat(out.get("cnt_mergeDetail")).isEqualTo(0);
        verify(detailRepository, never()).save(any());
        verify(detailRepository, never()).existsById(any());
        verify(detailRepository, never()).deleteById(any());
    }

    private static Map<String, Object> row(String masterCode, String categoryId, String codeVal) {
        Map<String, Object> m = new HashMap<>();
        m.put("MASTER_CODE", masterCode);
        m.put("CATEGORY_ID", categoryId);
        m.put("CODE_VAL", codeVal);
        return m;
    }
}
