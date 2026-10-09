import { useLayoutEffect } from 'react';
import { applyPreviewTheme, personalThemeModel } from './personalThemes.js';

export function resolvedTheme(preference, systemDark = false) {
  if (preference === "premium") return "premium";
  return preference === "dark" || (preference === "system" && systemDark)
    ? "dark"
    : "light";
}
export function resolvedAppearance(preference, systemDark = false) {
  return preference === "dark" || (preference === "system" && systemDark)
    ? "dark"
    : "light";
}
export function legacyThemePreference(appearance, style) {
  return style === "premium" ? "premium" : appearance;
}
export function useResolvedTheme(
  appearancePreference = "system",
  stylePreference = "standard",
  personalTheme = null,
) {
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let releasePersonal = null;
    const apply = () => {
      releasePersonal?.();
      releasePersonal = null;
      const appearance = resolvedAppearance(
        appearancePreference,
        media.matches,
      );
      const style = stylePreference === "premium" ? "premium" : "standard";
      document.documentElement.dataset.appearance = appearance;
      document.documentElement.dataset.style = style;
      document.documentElement.dataset.theme = legacyThemePreference(
        appearance,
        style,
      );
      if (style === "premium")
        document.documentElement.dataset.premiumScheme = appearance;
      else delete document.documentElement.dataset.premiumScheme;
      document.documentElement.style.colorScheme = appearance;
      if (personalTheme) {
        releasePersonal = applyPreviewTheme(document.documentElement, { style, appearance, personal: personalTheme }, media.matches);
      }
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute(
          "content",
          personalTheme ? personalThemeModel(personalTheme, media.matches).background : style === "premium"
            ? appearance === "dark" ? "#11110f" : "#f7f5f0"
            : appearance === "dark"
              ? "#111413"
              : "#f6f5f2",
        );
    };
    apply();
    if (appearancePreference === "system" || personalTheme?.appearance === 'system') media.addEventListener?.("change", apply);
    return () => { media.removeEventListener?.("change", apply); releasePersonal?.(); };
  }, [appearancePreference, stylePreference, personalTheme]);
}
