package com.dongkuk.caravan.console.host.dto;

import lombok.Getter;
import lombok.Setter;

/**
 * 호스트 관리 화면 검색 필터.
 *
 * <p>{@code worksCd} 미지정 시 caravan-console 인스턴스의 자기 공장 (console.works-code) 으로 자동 필터.</p>
 */
@Getter
@Setter
public class AppHostSearchRequest {

    private String appHostId;
    private String worksCd;
    private String appHostNm;
}
