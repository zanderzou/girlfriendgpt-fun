export const site = {
  name: "Girlfriend GPT",
  domain: "girlfriendgpt.fun",
  url: "https://girlfriendgpt.fun",
  description: "An independent Girlfriend GPT guide to AI girlfriend chat, character creation, roleplay, images, voice, privacy, pricing, and leading alternatives.",
  author: "Girlfriend GPT Guide editorial team",
  officialUrl: "https://www.gptgirlfriend.online/",
};
export const formatDate = (date: Date) => new Intl.DateTimeFormat("en-US", { year:"numeric", month:"long", day:"numeric", timeZone:"UTC" }).format(date);
export const toIsoDate = (date: Date) => date.toISOString().slice(0,10);
