// Minimal type declaration for url-regex-safe (the package ships no types).
// Only the surface parsing.ts uses is declared.
declare module "url-regex-safe" {
  interface UrlRegexSafeOptions {
    exact?: boolean;
    strict?: boolean;
    auth?: boolean;
    localhost?: boolean;
    parens?: boolean;
    apostrophes?: boolean;
    trailingPeriod?: boolean;
    ipv4?: boolean;
    ipv6?: boolean;
    tlds?: string[];
    re2?: boolean;
    returnString?: boolean;
  }
  export default function urlRegexSafe(options?: UrlRegexSafeOptions): RegExp;
}
