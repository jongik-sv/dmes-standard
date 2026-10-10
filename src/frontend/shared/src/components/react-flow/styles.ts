/**
 * react-flow 부품 스타일 — 룰 세트 편집기 styles/{menu,toolbox,viewport,snap}.ts 에서 옮겼다.
 * 컴포넌트가 `<style href precedence>` 로 직접 넣는다(Part B §18-3(2) — 포털은 원격 모듈의 CSS 파일을 싣지 않는다).
 * 클래스 접두(기본 "rfx")로 규칙을 만들고 href 에도 접두를 넣는다. 접두가 다르면 규칙이 따로 들어간다.
 * 색·간격·글자 크기는 공통 토큰만 쓴다. 모서리·그림자도 공통 토큰(--radius-*, --shadow-dropdown)이다(JsonView 와 같다).
 */
export const DEFAULT_CLASS_PREFIX = "rfx";

export type StylePart = "menu" | "tool" | "find" | "viewport" | "snap";
export const styleHref = (part: StylePart, prefix: string): string => `dk-react-flow-${part}-${prefix}`;

export const menuCss = (p: string) => `
.${p}-menu {
  position: fixed; z-index: 400; min-width: 160px; max-width: 320px; padding: 4px 0;
  display: flex; flex-direction: column;
  background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-dropdown);
}
.${p}-menu-item {
  display: block; width: 100%; padding: 4px var(--spacing-md); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: none; border: none; color: var(--color-text); font: inherit; cursor: pointer;
}
.${p}-menu-item:hover:not(:disabled), .${p}-menu-item:focus-visible { background: var(--color-bg-hover); outline: none; }
.${p}-menu-item:disabled { color: var(--color-text-muted); cursor: default; }
.${p}-menu-item[data-danger="true"]:not(:disabled) { color: var(--color-danger); }
.${p}-menu-item-nested { padding-left: calc(var(--spacing-md) * 2); }
.${p}-menu-item-icon { display: flex; align-items: center; gap: var(--spacing-xs); }
.${p}-menu-group { display: flex; flex-direction: column; }
.${p}-menu-swatches { display: grid; grid-template-columns: repeat(3, 28px); gap: 8px; padding: 8px var(--spacing-md); }
.${p}-menu-swatch {
  box-sizing: border-box; width: 28px; height: 28px; margin: 0; padding: 0; cursor: pointer;
  background: var(--color-bg); border: 2px solid var(--color-border-strong); border-radius: var(--radius-md);
}
.${p}-menu-swatch:hover, .${p}-menu-swatch:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.${p}-menu-swatch[aria-pressed="true"] { box-shadow: 0 0 0 4px var(--color-border-light), 0 0 0 5px var(--color-border-strong); }
.${p}-menu-group-title { padding: 4px var(--spacing-md); font-size: var(--font-size-sm); color: var(--color-text-secondary); }
`;

export const toolCss = (p: string) => `
.${p}-tip { position: relative; display: inline-flex; }
.${p}-tip > .${p}-tool-btn { width: 26px; min-width: 26px; height: 26px; min-height: 26px; padding: 0; }
.${p}-tip:hover::after, .${p}-tip:focus-within::after {
  content: attr(data-tip); position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%); z-index: 10;
  padding: 2px var(--spacing-sm); white-space: nowrap; pointer-events: none; font-size: var(--font-size-sm); font-weight: normal;
  color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  box-shadow: var(--shadow-dropdown);
}
.${p}-tip[data-tip-off]::after { display: none; }
.${p}-tip[data-tip-align="end"]:hover::after, .${p}-tip[data-tip-align="end"]:focus-within::after { left: auto; right: 0; transform: none; }
`;

export const findCss = (p: string) => `
.${p}-find-widget {
  position: absolute; top: 8px; right: 15px; z-index: 6;
  display: flex; align-items: center; gap: 2px; padding: 4px;
  background: var(--color-bg); border: 1px solid var(--color-border-light); border-radius: var(--radius-md);
  box-shadow: var(--shadow-dropdown);
}
.${p}-find-field { position: relative; display: flex; align-items: center; }
.${p}-find-widget .${p}-find-input { width: 240px; height: 26px; min-height: 26px; padding-right: 70px; font-size: var(--font-size-sm); }
.${p}-find-opts { position: absolute; top: 50%; right: 3px; transform: translateY(-50%); display: flex; gap: 1px; }
.${p}-find-opt {
  display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0;
  border: 1px solid transparent; border-radius: var(--radius-sm); background: none; color: var(--color-text-secondary);
  font: inherit; font-size: var(--font-size-xs); font-weight: 600; line-height: 1; cursor: pointer;
}
.${p}-find-opt:hover { background: var(--color-bg-hover); color: var(--color-text); }
.${p}-find-opt[aria-pressed="true"] { background: var(--color-primary-soft); border-color: var(--color-primary); color: var(--color-primary); }
.${p}-find-opt:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.${p}-find-opt[data-opt="wholeWord"] > span { text-decoration: underline; text-underline-offset: 2px; }
.${p}-find-count { min-width: 64px; padding: 0 var(--spacing-xs); font-size: var(--font-size-sm); color: var(--color-text-secondary); white-space: nowrap; }
.${p}-find-count[data-empty] { color: var(--color-danger); }
.${p}-find-widget .${p}-tool-btn { border-color: transparent; background: none; }
.${p}-find-widget .${p}-tool-btn:hover:not(:disabled) { background: var(--color-bg-hover); border-color: transparent; }
`;

export const viewportCss = (p: string) => `
.${p}-lost { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.${p}-lost-card {
  pointer-events: auto; display: flex; flex-direction: column; align-items: center; gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg); font-size: var(--font-size-sm); color: var(--color-text-secondary);
  background: var(--color-bg); border: 1px solid var(--color-border-light); border-radius: var(--radius-md); box-shadow: var(--shadow-dropdown);
}
.${p}-lost-btn {
  display: inline-flex; align-items: center; gap: var(--spacing-xs); padding: 4px var(--spacing-md); cursor: pointer;
  font: inherit; color: var(--color-primary); background: var(--color-primary-soft); border: 1px solid var(--color-primary); border-radius: var(--radius-sm);
}
.${p}-lost-btn:hover { filter: brightness(0.97); }
.${p}-lost-btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.${p}-lost-btn kbd { font: inherit; font-size: var(--font-size-xs); color: var(--color-text-secondary); }
`;

export const snapCss = (p: string) => `
.${p}-snap-guide { position: absolute; pointer-events: none; border: 0 solid var(--color-primary); }
.${p}-snap-guide[data-axis="x"] { width: 0; border-left-style: solid; }
.${p}-snap-guide[data-axis="y"] { height: 0; border-top-style: solid; }
`;
