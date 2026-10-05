package com.dongkuk.dmes.cactus.oasis;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.common.ResponseCodeAware;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.oasis.PathElement;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.message.Message;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.transaction.TransactionException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionSystemException;

/**
 * BPMN 안에서 던진 예외의 meta.code — {@link ResponseCodeAware} 예외는 그 코드(MDM027 등), 사용자 예외는 E001, 업무 예외는 그
 * {@link ErrorCode} 의 코드(2026-10-05), 그 밖의 시스템 오류·커밋 실패는 S001.
 */
class CactusResponseConverterErrorCodeTest {

    private final CactusResponseConverter converter = new CactusResponseConverter();

    static final class CodedException extends BusinessException implements ResponseCodeAware {
        CodedException() {
            super(ErrorCode.ACCESS_DENIED, "시스템 관리자만 할 수 있습니다");
        }

        @Override
        public String responseCode() {
            return "MDM027";
        }
    }

    private static ServiceResult failed(ServiceResultCode code, Throwable e) {
        return new ServiceResult() {
            @Override public ServiceResultCode serviceResultCode() { return code; }
            @Override public String serviceResultMessage() { return e.getMessage(); }
            @Override public Throwable exception() { return e; }
            @Override public Map<String, TypedObject> results() { return Map.of(); }
            @Override public TypedObject result(String key) { return null; }
            @Override public List<PathElement> path() { return List.of(); }
            @Override public List<Message> messages() { return List.of(); }
        };
    }

    @Test
    void 일반_예외는_S001_이고_사용자_예외는_E001_이다() {
        CactusResponse system = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR, new IllegalStateException("시스템")), "tx");
        CactusResponse user = converter.convert(failed(ServiceResultCode.USER_ERROR, new RuntimeException("사용자")), "tx");

        assertThat(system.getMeta().code()).isEqualTo("S001");
        assertThat(user.getMeta().code()).isEqualTo("E001");
    }

    @Test
    void 업무_예외는_그_ErrorCode_의_코드를_meta_code_로_싣는다() {
        CactusResponse denied = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR,
                new BusinessException(ErrorCode.ACCESS_DENIED, "거부")), "tx");
        CactusResponse wrapped = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR,
                new RuntimeException("중복", new IllegalStateException("x", new BusinessException(ErrorCode.DUPLICATE_DATA, "중복")))), "tx");

        assertThat(denied.getMeta().code()).isEqualTo("A010");
        assertThat(denied.getMeta().message()).isEqualTo("거부");
        assertThat(wrapped.getMeta().code()).isEqualTo("E003");
    }

    @Test
    void 사용자_예외_코드는_원인_사슬의_업무_예외보다_앞선다() {
        CactusResponse r = converter.convert(failed(ServiceResultCode.USER_ERROR,
                new RuntimeException("사용자", new BusinessException(ErrorCode.INVALID_VALUE, "검증"))), "tx");

        assertThat(r.getMeta().code()).isEqualTo("E001");
    }

    @Test
    void 바깥이_트랜잭션_예외면_안쪽_업무_예외가_있어도_S001_이다() {
        CactusResponse oasisTx = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR,
                new TransactionException("커밋 실패", new BusinessException(ErrorCode.INVALID_VALUE, "검증"))), "tx");
        CactusResponse springTx = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR,
                new TransactionSystemException("커밋 실패", new BusinessException(ErrorCode.INVALID_VALUE, "검증"))), "tx");
        CactusResponse coded = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR,
                new TransactionException("커밋 실패", new CodedException())), "tx");

        assertThat(oasisTx.getMeta().code()).isEqualTo("S001");
        assertThat(springTx.getMeta().code()).isEqualTo("S001");
        assertThat(coded.getMeta().code()).isEqualTo("S001");
    }

    @Test
    void 사슬_가운데의_트랜잭션_예외도_경계라_안쪽_업무_예외는_S001_이다() {
        CactusResponse r = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR, new RuntimeException("감쌈",
                new TransactionException("커밋 실패", new BusinessException(ErrorCode.INVALID_VALUE, "검증")))), "tx");
        CactusResponse coded = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR, new RuntimeException("감쌈",
                new TransactionException("커밋 실패", new CodedException()))), "tx");

        assertThat(r.getMeta().code()).isEqualTo("S001");
        assertThat(coded.getMeta().code()).isEqualTo("S001");
    }

    @Test
    void ErrorCode_가_없는_업무_예외는_S001_이다() {
        CactusResponse r = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR, new BusinessException(null, "코드 없음")), "tx");

        assertThat(r.getMeta().code()).isEqualTo("S001");
    }

    @Test
    void 바깥이_업무_예외면_원인이_트랜잭션_예외여도_업무_코드다() {
        BusinessException rethrown = new BusinessException(ErrorCode.DUPLICATE_DATA, "이미 있습니다");
        rethrown.initCause(new TransactionException("커밋 실패", new IllegalStateException("UNIQUE")));

        CactusResponse r = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR, rethrown), "tx");

        assertThat(r.getMeta().code()).isEqualTo("E003");
    }

    @Test
    void 판정_도우미는_ResponseCodeAware_를_ErrorCode_보다_앞세운다() {
        assertThat(CactusResponseConverter.businessCode(new CodedException())).isEqualTo("MDM027");
        assertThat(CactusResponseConverter.businessCode(new BusinessException(ErrorCode.INVALID_VALUE, "x"))).isEqualTo("E002");
        assertThat(CactusResponseConverter.businessCode(new IllegalStateException("x"))).isNull();
    }

    @Test
    void ResponseCodeAware_예외는_감싸여_있어도_그_코드를_meta_code_로_싣고_메시지는_그대로다() {
        RuntimeException wrapped = new RuntimeException("시스템 관리자만 할 수 있습니다", new IllegalStateException("x", new CodedException()));

        CactusResponse r = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR, wrapped), "tx");

        assertThat(r.getMeta().success()).isFalse();
        assertThat(r.getMeta().code()).isEqualTo("MDM027");
        assertThat(r.getMeta().message()).isEqualTo("시스템 관리자만 할 수 있습니다");
    }
}
