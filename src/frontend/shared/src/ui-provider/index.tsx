"use client";

import type { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import "dayjs/locale/ko";
import { MessageProvider } from "../components/message-provider";
import { dmesTheme } from "./theme";

export { dmesTheme } from "./theme";
// ColorSchemeScript 는 컴포넌트라 서버 컴포넌트에서 클라이언트 참조로 렌더된다.
// 반면 mantineHtmlProps 는 평범한 객체여서, "use client" 모듈을 거치면
// 서버 컴포넌트에서 전개할 때 빈 객체가 되어 속성이 조용히 사라진다.
// 따라서 재노출하지 않으며, 호스트의 app/layout.tsx 가 @mantine/core 에서 직접 가져온다.
export { ColorSchemeScript } from "@mantine/core";

export function DmesUiProvider({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={dmesTheme} defaultColorScheme="light">
      <DatesProvider settings={{ locale: "ko", firstDayOfWeek: 0 }}>
        {/* 토스트는 화면 우측 상단의 조회·저장 버튼을 가리지 않도록 우측 하단, 상태줄 위에 띄운다(2026-09-23). */}
        <Notifications position="bottom-right" containerWidth={360} limit={3} zIndex={10000} />
        <ModalsProvider>
          <MessageProvider>{children}</MessageProvider>
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
