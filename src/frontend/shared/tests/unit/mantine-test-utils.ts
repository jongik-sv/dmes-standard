import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { dmesTheme } from "../../src/ui-provider/theme";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

export interface Rendered {
  host: HTMLDivElement;
  root: Root;
  unmount: () => void;
}

/** MantineProvider 로 감싸 렌더한다. 각 테스트는 unmount() 로 정리한다. */
export function renderWithMantine(element: ReactElement): Rendered {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(createElement(MantineProvider, { theme: dmesTheme }, element));
  });
  return {
    host,
    root,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

export function rerender(r: Rendered, element: ReactElement) {
  act(() => {
    r.root.render(createElement(MantineProvider, { theme: dmesTheme }, element));
  });
}
