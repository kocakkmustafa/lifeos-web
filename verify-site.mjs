import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const results = [];

function check(label, assertion) {
  try {
    assert.ok(assertion, label);
    results.push({ label, ok: true });
  } catch {
    results.push({ label, ok: false });
  }
}

const [home, notFound, firebaseSource, sitemap] = await Promise.all([
  read("./index.html"),
  read("./404.html"),
  read("./firebase.json"),
  read("./sitemap.xml"),
]);
const support = await read("./destek/index.html").catch(() => "");
const firebase = JSON.parse(firebaseSource);
const normalized = (value) => value.replace(/\s+/g, " ").trim();
const homeFlat = normalized(home);
const homeLower = homeFlat.toLocaleLowerCase("tr-TR");

check("official LifeOS root marker exists", home.includes('data-lifeos-site="official"'));
check("foreign/template product copy is absent", !/Operating System for Life|Farr Industries|Apollo 1|Lorem ipsum/i.test(home));

const appStoreHref = "https://apps.apple.com/tr/app/lifeos-personal-life-os/id6771527233";
const appStoreAnchor = [...home.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)]
  .map((match) => match[0])
  .find((anchor) => /App Store/i.test(anchor)) ?? "";
check("App Store CTA uses the live LifeOS listing", home.includes(`href="${appStoreHref}"`));
check("App Store CTA is not marked Yakında", appStoreAnchor.length > 0 && !/Yakında/i.test(appStoreAnchor));

check("root links to the local support route", /href="\/destek\/?"/.test(home));
const localIconHrefs = [...home.matchAll(/<link\b[^>]*href="(\/[^\"]+)"/gi)].map(
  (match) => match[1],
);
const localIconAvailability = await Promise.all(
  localIconHrefs.map((href) => access(new URL(`.${href}`, import.meta.url)).then(
    () => true,
    () => false,
  )),
);
check(
  "root-local icon links do not point at missing files",
  localIconAvailability.every(Boolean),
);
check("support route has its own official marker", support.includes('data-lifeos-support="official"'));
check("support route publishes a contact address", support.includes("merhaba@yulalab.com"));
check("support document is not the 404 shell", support.length > 0 && normalized(support) !== normalized(notFound));
check("sitemap includes the support route", sitemap.includes("https://lifeos.app/destek/"));

const forbiddenClaims = [
  "uçtan uca şifrelidir",
  "yula lab okuyamaz",
  "sunucu hiçbir veriyi açık metin görmez",
  "cihazınızda kalır. sunucumuza gönderilmez.",
  "gemini analizini opt-in olarak açarsınız",
  "kvkk + gdpr uyumlu",
];
for (const claim of forbiddenClaims) {
  check(`unaccepted overclaim is absent: ${claim}`, !homeLower.includes(claim));
}
check("sync copy says cloud sync is optional", /bulut senkronu isteğe bağlı/i.test(home));
check("sync copy limits the promise to supported data types", /desteklenen veri tür/i.test(home));

check("Firebase serves the repository root", firebase.hosting?.public === ".");
check("Firebase clean URLs remain enabled", firebase.hosting?.cleanUrls === true);
check(
  "Firebase excludes the local verifier from deploy artifacts",
  Array.isArray(firebase.hosting?.ignore) &&
    firebase.hosting.ignore.includes("verify-site.mjs"),
);

for (const result of results) {
  console.log(`${result.ok ? "✅" : "❌"} ${result.label}`);
}

const failures = results.filter((result) => !result.ok);
console.log(`\n${results.length - failures.length}/${results.length} site contracts passed`);
if (failures.length > 0) process.exitCode = 1;
