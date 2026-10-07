package com.dongkuk.dmes.cactus.web.inbound;

import com.dongkuk.dmes.cactus.common.ApiResponse;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.Collections;
import java.util.List;

/**
 * 드롭다운/콤보용 마스터 코드 LoV 엔드포인트.
 *
 * <pre>
 * GET  /lov/master/{code}              ← MasterCodeProvider 가 등록된 경우만
 * GET  /lov/master/{code}/{group}      ← 그룹 분류 포함
 * </pre>
 *
 * <p>{@code /lov/query/{queryId}} 는 {@link QueryController}, {@code /lov/service/{serviceId}} 는
 * {@link ServiceController} 로 옮겼다(2026-10-07). 둘은 요청이 고른 매퍼 statement·BPMN 을 실행하는 경로라
 * 각자의 스위치(기본 꺼짐)를 따른다. 마스터 코드 LoV 는 로그인 사용자의 콤보 옵션이라 늘 켠다.
 *
 * <p>기존 {@code /query/*} / {@code /service/*} 와 분리한 이유는 LoV 호출이 드롭다운 초기화 시
 * 다수 동시 발생하는 패턴이라 캐시·로깅·메트릭 정책을 별도로 적용하기 위함. dmes-film 의
 * {@code LovController} 와 동일한 분리 의도.
 *
 * <p>응답: {@link ApiResponse}{@code <List<Lov>>}
 */
@ResponseBody
@RequestMapping
public class LovController {

    private static final Logger log = LoggerFactory.getLogger(LovController.class);

    private final ObjectProvider<MasterCodeProvider> masterCodeProvider;

    public LovController(ObjectProvider<MasterCodeProvider> masterCodeProvider) {
        this.masterCodeProvider = masterCodeProvider;
    }

    /**
     * 마스터 코드 LoV 조회 (그룹 미지정).
     */
    @GetMapping("/lov/master/{code}")
    public ApiResponse<List<Lov>> lovMasterRoot(@PathVariable("code") String code) {
        return lovMaster(code, "ROOT");
    }

    /**
     * 마스터 코드 LoV 조회.
     *
     * <p>{@link MasterCodeProvider} 빈이 컨텍스트에 없으면 {@link ErrorCode#UNKNOWN_ERROR} 로 응답한다.
     * (404 보다 상위 호환성 유지).
     */
    @GetMapping("/lov/master/{code}/{group}")
    public ApiResponse<List<Lov>> lovMaster(@PathVariable("code") String code,
                                            @PathVariable("group") String group) {
        MasterCodeProvider provider = masterCodeProvider.getIfAvailable();
        if (provider == null) {
            throw new BusinessException(ErrorCode.UNKNOWN_ERROR,
                    "MasterCodeProvider 가 등록되지 않았습니다");
        }
        List<Lov> rows = provider.findMasterCodeLov(code, group);
        if (rows == null) {
            rows = Collections.emptyList();
        }
        log.info("[lov.master] code={} group={} rows={}", code, group, rows.size());
        return ApiResponse.ok(rows, String.format("%d rows selected.", rows.size()));
    }
}
