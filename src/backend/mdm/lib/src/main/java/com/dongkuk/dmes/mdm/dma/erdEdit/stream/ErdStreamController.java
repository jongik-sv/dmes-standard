package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ResponseCodeAware;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * ERD 실시간 채널 — MDM 의 첫 @RestController(계획 P10). OASIS 프록시는 응답을 모아서 보내므로 스트림을 넘기지 못한다.
 * 포털 경유: /api/mdm/rest/erdEdit/view/api/mdm/erd/stream/{modelId} (RBAC 키 mdm/erdEdit/view).
 */
@RestController
@RequestMapping({"/erd", "/mdm/erd", "/api/mdm/erd"})
public class ErdStreamController {

    private final ErdEventHub hub;
    private final MdmCurrentUser currentUser;

    public ErdStreamController(ErdEventHub hub, MdmCurrentUser currentUser) {
        this.hub = hub;
        this.currentUser = currentUser;
    }

    @GetMapping(path = "/stream/{modelId}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@PathVariable String modelId, @RequestParam String session,
                             @RequestParam(defaultValue = "-1") long sinceRev,
                             @RequestParam(defaultValue = ErdSources.UI) String source) {
        return hub.subscribe(modelId, session, currentUser.userId(), source, sinceRev);
    }

    /**
     * 없는 모델은 404. 이 핸들러가 없으면 produces=text/event-stream 때문에 전역 핸들러의 JSON 응답을 못 만들어 오류 모양이 깨진다.
     * 스트림을 열기 전에 난 오류만 여기로 온다. 그 밖의 업무 오류는 전역 핸들러로 넘긴다.
     */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<String> notFound(BusinessException e) {
        if (e instanceof ResponseCodeAware r && MdmErrorCode.ERD_MODEL_NOT_FOUND.code().equals(r.responseCode())) {
            return ResponseEntity.status(404).contentType(MediaType.TEXT_PLAIN).body(e.getMessage());
        }
        throw e;
    }
}
