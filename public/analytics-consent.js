(() => {
  "use strict";
  const root = document.getElementById("site-analytics");
  if (!root) return;
  const id = root.dataset.measurementId;
  const domain = root.dataset.domain;
  if (!/^G-[A-Z0-9]+$/.test(id) || ![domain, "www." + domain].includes(location.hostname)) return;
  const notice = document.getElementById("analytics-notice");
  const accept = document.getElementById("analytics-accept");
  const decline = document.getElementById("analytics-decline");
  const settings = document.getElementById("analytics-settings");
  const status = document.getElementById("analytics-status");
  const key = "site-analytics-consent-v1";
  const maxAge = 180 * 86400000;
  const privacySignal = navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";
  let started = false;
  let consent = null;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved && Date.now() - saved.time < maxAge && ["granted", "denied"].includes(saved.value)) consent = saved.value;
  } catch {}
  function cleanReferrer() {
    try { return document.referrer ? new URL(document.referrer).origin + "/" : ""; } catch { return ""; }
  }
  const page = { page_location: location.origin + location.pathname, page_referrer: cleanReferrer() };
  function start() {
    if (privacySignal) return;
    window["ga-disable-" + id] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    if (started) {
      window.gtag("consent", "update", { analytics_storage: "granted" });
      return;
    }
    started = true;
    window.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    window.gtag("set", "ads_data_redaction", true);
    window.gtag("js", new Date());
    window.gtag("config", id, { ...page, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_expires: 15552000 });
    const tag = document.createElement("script");
    tag.async = true;
    tag.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(tag);
  }
  function stop() {
    window["ga-disable-" + id] = true;
    if (window.gtag) window.gtag("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    document.cookie.split(";").map(value => value.trim().split("=")[0]).filter(name => /^_ga(?:_|$)/.test(name)).forEach(name => {
      ["", "; domain=" + domain, "; domain=." + domain, "; domain=" + location.hostname].forEach(scope => {
        document.cookie = name + "=; Max-Age=0; path=/" + scope + "; SameSite=Lax; Secure";
      });
    });
  }
  function choose(value) {
    consent = value;
    try { localStorage.setItem(key, JSON.stringify({ value, time: Date.now() })); } catch {}
    if (value === "granted") start(); else stop();
    notice.hidden = true;
    settings.focus({ preventScroll: true });
  }
  accept.addEventListener("click", () => choose("granted"));
  decline.addEventListener("click", () => choose("denied"));
  settings.addEventListener("click", () => {
    notice.hidden = false;
    status.textContent = privacySignal ? "Your browser privacy signal is respected. Analytics is off." : consent === "granted" ? "Analytics is on. Choose No thanks to withdraw your consent." : "Analytics is off. Your choice applies only to this website.";
    accept.disabled = privacySignal;
    decline.focus({ preventScroll: true });
  });
  notice.addEventListener("keydown", event => {
    if (event.key === "Escape") { notice.hidden = true; settings.focus({ preventScroll: true }); }
  });
  window.addEventListener("storage", event => {
    if (event.key !== key) return;
    try {
      const saved = JSON.parse(event.newValue || "null");
      consent = saved?.value || null;
      if (consent === "granted" && !privacySignal) start(); else stop();
    } catch { stop(); }
  });
  if (privacySignal) { consent = "denied"; stop(); }
  else if (consent === "granted") start();
  else if (consent === "denied") stop();
  else notice.hidden = false;
})();
