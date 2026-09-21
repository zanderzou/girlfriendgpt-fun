export const site = {
  name: "GirlfriendGPT Guide",
  domain: "girlfriendgpt.fun",
  url: "https://girlfriendgpt.fun",
  description: "An independent GirlfriendGPT guide to AI girlfriend chat, character creation, roleplay, images, voice, privacy, pricing, and leading alternatives.",
  author: "GirlfriendGPT Guide editorial team",
  officialUrl: "https://www.gptgirlfriend.online/",
};
export const formatDate = (date: Date) => new Intl.DateTimeFormat("en-US", { year:"numeric", month:"long", day:"numeric", timeZone:"UTC" }).format(date);
export const toIsoDate = (date: Date) => date.toISOString().slice(0,10);
