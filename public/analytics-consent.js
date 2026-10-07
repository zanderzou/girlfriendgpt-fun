(() => {
  "use strict";
  const root = document.getElementById("site-analytics");
  if (!root) return;
  const id = root.dataset.measurementId;
  const domain = root.dataset.domain;
  if (!/^G-[A-Z0-9]+$/.test(id) || ![domain, "www." + domain].includes(location.hostname)) return;
  // Do not send measurements for identifiable crawlers or automated browsers.
  // A user-agent check cannot identify a bot that fully impersonates a visitor.
  const knownAutomation = /googlebot|google-inspectiontool|bingbot|bingpreview|baiduspider|yandexbot|yandeximages|duckduckbot|applebot|petalbot|bytespider|gptbot|oai-searchbot|chatgpt-user|claudebot|anthropic-ai|ccbot|amazonbot|facebookexternalhit|facebot|twitterbot|slackbot|discordbot|telegrambot|pinterestbot|linkedinbot|ahrefsbot|semrushbot|mj12bot|dotbot|rogerbot|screaming frog|uptimerobot|pingdom|headlesschrome|phantomjs|lighthouse|pagespeed|(?:^|[\s;/()])(?:bot|crawler|spider)(?:[\s;/()]|$)/i;
  if (navigator.webdriver === true || knownAutomation.test(navigator.userAgent || "")) return;
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || window["ga-disable-" + id] === true) return;
  if (window.__siteAnalyticsStarted) return;
  window.__siteAnalyticsStarted = true;
  function cleanReferrer() {
    try { return document.referrer ? new URL(document.referrer).origin + "/" : ""; } catch { return ""; }
  }
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  // Advertising features remain disabled; no user consent event is fabricated.
  window.gtag("consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  window.gtag("set", "ads_data_redaction", true);
  window.gtag("js", new Date());
  window.gtag("config", id, {
    page_location: location.origin + location.pathname,
    page_referrer: cleanReferrer(),
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_expires: 15552000
  });
  const tag = document.createElement("script");
  tag.async = true;
  tag.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
  document.head.appendChild(tag);
})();
