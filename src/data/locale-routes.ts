import { localeList, type LocaleSlug } from "./localized-girlfriendgpt";
import { comparisonKeys } from "./localized-articles";
import { site } from "./site";

export type SiteLocale = "en" | LocaleSlug;
const localeSlugs = new Set<string>(localeList.map((entry) => entry.slug));
const standardPaths = new Set(["/", "/blog/", "/about/", "/contact/", "/editorial-policy/", "/privacy/", "/terms/"]);
const articlePaths = new Set(comparisonKeys.map((key) => `/blog/girlfriendgpt-vs-${key}/`));

export function normalizedPath(pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return path.endsWith("/") ? path : `${path}/`;
}
export function localeFromPath(pathname: string): SiteLocale {
  const first = normalizedPath(pathname).split("/")[1];
  return localeSlugs.has(first) ? first as LocaleSlug : "en";
}
export function englishPath(pathname: string): string {
  const path = normalizedPath(pathname);
  const locale = localeFromPath(path);
  return locale === "en" ? path : normalizedPath(path.slice(locale.length + 1));
}
export function localePath(locale: SiteLocale, pathname: string): string {
  const base = englishPath(pathname);
  return locale === "en" ? base : `/${locale}${base}`;
}
export function isTranslatedRoute(pathname: string): boolean {
  const path = englishPath(pathname);
  return standardPaths.has(path) || articlePaths.has(path);
}
export function languageAlternates(pathname: string): { code: string; href: string }[] {
  if (!isTranslatedRoute(pathname)) return [];
  const locales: SiteLocale[] = ["en", ...localeList.map((entry) => entry.slug)];
  return [
    ...locales.map((locale) => ({
      code: locale === "en" ? "en" : localeList.find((entry) => entry.slug === locale)!.code,
      href: `${site.url}${localePath(locale, pathname)}`,
    })),
    { code: "x-default", href: `${site.url}${localePath("en", pathname)}` },
  ];
}
