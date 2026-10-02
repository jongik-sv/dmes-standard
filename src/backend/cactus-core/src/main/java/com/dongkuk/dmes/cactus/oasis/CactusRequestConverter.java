package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * CactusRequest → Map&lt;String, TypedObject&gt; 변환기.
 * OASIS ServiceContext는 Map&lt;String, TypedObject&gt;를 입력으로 받는다.
 *
 * <p><b>action 은 URL 경로로만 정한다.</b> BFF proxy 와 BE EndpointPermissionFilter 는 URL 의 action 으로 권한을 판정하고,
 * BPMN 게이트웨이는 입력 맵의 {@value #ACTION_KEY} 로 분기한다. 요청 본문(params·grids)의 같은 이름 키가 경로 action 을
 * 덮어쓰면 권한을 판정한 action 과 실행되는 action 이 달라진다(2026-10-03 보안 지적 — 예: commWidgetMng/search 권한으로
 * previewQuery 실행, AUTH_ONLY secUser/myMenus 로 resetPassword 실행). 그래서 본문에 {@value #ACTION_KEY} 키가 있으면
 * 거절하고(E002), 경로 action 은 본문을 다 펼친 뒤 마지막에 넣는다(거절 검사가 빠지는 일이 생겨도 경로 action 이 이긴다).
 */
public class CactusRequestConverter {

    private static final Logger log = LoggerFactory.getLogger(CactusRequestConverter.class);

    /** BPMN 게이트웨이 분기 키 — 경로 action 만 이 이름으로 들어간다. 요청 본문에는 예약 키라 쓸 수 없다. */
    public static final String ACTION_KEY = "action";

    /** 본문에 예약 키를 썼을 때의 사용자 문구. */
    static final String MSG_RESERVED_ACTION =
            "요청 본문에 예약 키 'action' 을 쓸 수 없습니다(action 은 URL 경로로만 정합니다)";

    /**
     * CactusRequest를 OASIS ServiceContext 입력 형태로 변환한다.
     *
     * @param request CactusRequest
     * @param action  URL에서 추출한 액션
     * @return OASIS ServiceContext 입력 Map
     * @throws BusinessException 요청 본문 params·grids 에 {@value #ACTION_KEY} 키가 있을 때(INVALID_VALUE)
     */
    public Map<String, TypedObject> convert(CactusRequest request, String action) {
        rejectBodyAction(request, action);

        Map<String, TypedObject> map = new HashMap<>();

        // meta는 inputs Map에 넣지 않는다.
        // 이유: meta.userId/menuId 키가 DTO 필드(예: SecUserSearchRequest.userId)와 충돌하여
        //      클라이언트가 보낸 검색 파라미터를 덮어쓰는 문제가 있음.
        // meta는 OasisServiceExecutor에서 txId 생성/감사 컬럼 주입 용도로만 사용한다.
        // BPMN 내부에서 meta가 필요하면 별도 메커니즘(__meta_userId 등 prefix)을 추가할 것.

        // params → flat 전개
        if (request.getParams() != null) {
            request.getParams().forEach((key, value) ->
                    map.put(key, new TypedObject(value)));
        }

        // grids → gridId: List<Map> 형태로 전달
        if (request.getGrids() != null) {
            request.getGrids().forEach((gridId, gridData) ->
                    map.put(gridId, new TypedObject(gridData.getRows(),
                            new TypeReference<List<Map<String, Object>>>() {})));
        }

        // action (BPMN 게이트웨이 분기용) — 본문을 다 펼친 뒤 마지막에 넣어 경로 값이 늘 이긴다.
        map.put(ACTION_KEY, new TypedObject(action));

        return map;
    }

    /** 본문 params·grids 에 예약 키 action 이 있으면 거절한다. 로그에는 경로 action 과 위치만 남긴다(본문 값은 남기지 않는다). */
    private static void rejectBodyAction(CactusRequest request, String action) {
        String where = null;
        if (request.getParams() != null && request.getParams().containsKey(ACTION_KEY)) {
            where = "params";
        } else if (request.getGrids() != null && request.getGrids().containsKey(ACTION_KEY)) {
            where = "grids";
        }
        if (where != null) {
            log.warn("[oasis] 요청 본문 {} 의 예약 키 action 거절 — 경로 action={}", where, action);
            throw new BusinessException(ErrorCode.INVALID_VALUE, MSG_RESERVED_ACTION);
        }
    }
}
