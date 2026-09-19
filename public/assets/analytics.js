/**
 * Cookie consent + analytics for the static mcp.popapi.io pages.
 *
 * Same setup as popapi.io, blog.popapi.io and docs.popapi.io, so a visitor sees one banner across
 * the properties and is counted once:
 *
 *  - iubenda Cookie Solution, site 3784851, with the per-language cookie policy.
 *  - GA4 G-3TN99VJ6HD — the same property the other three report into. The tags are injected as
 *    `type="text/plain" class="_iub_cs_activate" data-iub-purposes="4"` placeholders that iubenda
 *    swaps in once the visitor consents to the measurement purpose. Nothing loads before that.
 *
 * Injected from JS rather than pasted into each page's <head> because these pages are hand-written
 * HTML with no build step — five copies of the snippet would drift. Same injection approach
 * pop-site uses (src/components/Analytics.tsx).
 *
 * No cross-domain (`linker`) config and no `cookie_domain` override: mcp.popapi.io is a subdomain
 * of the same registrable domain as the other three sites, so gtag's default `cookie_domain: auto`
 * writes `_ga` on `.popapi.io` and the session carries across all of them. GA4's "configure your
 * domains" is only needed for genuinely different domains.
 */
(function () {
  "use strict";

  var GA_MEASUREMENT_ID = "G-3TN99VJ6HD";
  var IUBENDA_SITE_ID = 3784851;

  /** iubenda publishes a separate cookie-policy document per language. */
  var COOKIE_POLICY_ID = { en: 53605833, it: 36398488 };

  /**
   * GA4 only fires on the production hostname. A local or preview deploy still shows the banner —
   * so the consent UX stays testable — but no hit reaches the property.
   */
  var GA_HOSTNAMES = ["mcp.popapi.io"];

  /**
   * The language declared on the document when this runs. The in-page EN/IT switcher rewrites
   * `document.documentElement.lang` afterwards, but iubenda reads its configuration once at load,
   * so the banner keeps the language the page was served in. That is the English default today;
   * if the language choice ever becomes part of the URL or gets persisted, this picks it up.
   */
  var lang = (document.documentElement.lang || "en").slice(0, 2).toLowerCase();
  if (!COOKIE_POLICY_ID[lang]) lang = "en";

  window._iub = window._iub || [];
  window._iub.csConfiguration = {
    siteId: IUBENDA_SITE_ID,
    cookiePolicyId: COOKIE_POLICY_ID[lang],
    lang: lang,
    storage: { useSiteId: true },
    perPurposeConsent: true,
    askConsentAtCookiePolicyUpdate: true,
    cookiePolicyInOtherWindow: true,
    floatingPreferencesButtonDisplay: "anchored-center-left",
    floatingPreferencesButtonCaption: true,
    floatingPreferencesButtonIcon: false,
    floatingPreferencesButtonZIndex: 2147483644,
    logLevel: "warn",
    preferenceCookie: { expireAfter: 180 },
    banner: {
      acceptButtonCaptionColor: "#FFFFFF",
      acceptButtonColor: "#FF5F5E",
      acceptButtonDisplay: true,
      backgroundColor: "#FFFFFF",
      brandBackgroundColor: "#FF5F5E",
      closeButtonDisplay: false,
      customizeButtonCaptionColor: "#555555",
      customizeButtonColor: "#D5F4F5",
      customizeButtonDisplay: true,
      explicitWithdrawal: true,
      fontSizeBody: "13px",
      linksColor: "#1A1A1A",
      listPurposes: true,
      logo: "https://popapi.io/wp-content/uploads/2024/10/pop-logo-on-red.svg",
      ownerName: "POP",
      position: "float-bottom-left",
      rejectButtonCaptionColor: "#555555",
      rejectButtonColor: "#D5F4F5",
      rejectButtonDisplay: true,
      showTitle: false,
      textColor: "#1A1A1A",
      usesThirdParties: false,
    },
  };

  function inject(attrs, text) {
    var s = document.createElement("script");
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) s.setAttribute(k, attrs[k]);
    }
    if (text) s.textContent = text;
    document.head.appendChild(s);
  }

  // iubenda's own loaders. `_iub_cs_skip` marks them so autoblocking does not block itself.
  inject({
    src: "https://cs.iubenda.com/autoblocking/" + IUBENDA_SITE_ID + ".js",
    class: "_iub_cs_skip",
  });
  inject({
    src: "https://cdn.iubenda.com/cs/iubenda_cs.js",
    class: "_iub_cs_skip",
    charset: "UTF-8",
    async: "",
  });

  if (GA_HOSTNAMES.indexOf(window.location.hostname) === -1) return;

  inject({
    src: "https://www.googletagmanager.com/gtag/js?id=" + GA_MEASUREMENT_ID,
    type: "text/plain",
    class: "_iub_cs_activate",
    "data-iub-purposes": "4",
    async: "",
  });
  inject(
    { type: "text/plain", class: "_iub_cs_activate", "data-iub-purposes": "4" },
    "window.dataLayer=window.dataLayer||[];" +
      "function gtag(){dataLayer.push(arguments);}" +
      "gtag('js',new Date());" +
      "gtag('config','" +
      GA_MEASUREMENT_ID +
      "',{anonymize_ip:true});"
  );
})();
