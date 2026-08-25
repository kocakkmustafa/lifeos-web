import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

const requiredIcons = [
  {
    rel: "icon",
    href: "/favicon.ico",
    type: "image/x-icon",
    signature: Buffer.from([0x00, 0x00, 0x01, 0x00]),
  },
  {
    rel: "apple-touch-icon",
    href: "/apple-touch-icon.png",
    type: "image/png",
    signature: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
];

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2] ?? "";
}

async function iconContractFailures(html, readAsset) {
  const tags = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
  const failures = [];

  for (const expected of requiredIcons) {
    const matchingRel = tags.filter((tag) =>
      attribute(tag, "rel").toLowerCase().split(/\s+/).includes(expected.rel),
    );
    if (matchingRel.length !== 1) {
      failures.push(`${expected.rel}: expected exactly one link`);
      continue;
    }

    const [tag] = matchingRel;
    if (attribute(tag, "href") !== expected.href) {
      failures.push(`${expected.rel}: wrong href`);
      continue;
    }
    if (attribute(tag, "type").toLowerCase() !== expected.type) {
      failures.push(`${expected.rel}: wrong MIME type`);
      continue;
    }

    const bytes = await readAsset(expected.href);
    if (!bytes) {
      failures.push(`${expected.rel}: asset missing`);
      continue;
    }
    if (bytes.length === 0) {
      failures.push(`${expected.rel}: asset empty`);
      continue;
    }
    if (
      bytes.length < expected.signature.length ||
      !bytes.subarray(0, expected.signature.length).equals(expected.signature)
    ) {
      failures.push(`${expected.rel}: corrupt or wrong format`);
    }
  }
  return failures;
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
const homeSearch = `${homeLower}\n${homeFlat.toLowerCase()}`;

check("official LifeOS root marker exists", home.includes('data-lifeos-site="official"'));
check("foreign/template product copy is absent", !/Operating System for Life|Farr Industries|Apollo 1|Lorem ipsum/i.test(home));

const appStoreHref = "https://apps.apple.com/tr/app/lifeos-personal-life-os/id6771527233";
const appStoreAnchor = [...home.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)]
  .map((match) => match[0])
  .find((anchor) => /App Store/i.test(anchor)) ?? "";
check("App Store CTA uses the live LifeOS listing", home.includes(`href="${appStoreHref}"`));
check("App Store CTA is not marked Yakında", appStoreAnchor.length > 0 && !/Yakında/i.test(appStoreAnchor));

check("root links to the local support route", /href="\/destek\/?"/.test(home));
const validIconHtml = requiredIcons
  .map(({ rel, href, type }) => `<link rel="${rel}" href="${href}" type="${type}">`)
  .join("\n");
const validIconAssets = new Map(
  requiredIcons.map(({ href, signature }) => [
    href,
    Buffer.concat([signature, Buffer.from([1])]),
  ]),
);
const virtualRead = (assets) => async (href) => assets.get(href) ?? null;

check(
  "icon validator rejects missing required rels",
  (await iconContractFailures("", virtualRead(validIconAssets))).length === 2,
);
check(
  "icon validator rejects rels whose assets are missing",
  (await iconContractFailures(validIconHtml, virtualRead(new Map()))).every(
    (failure) => failure.endsWith("asset missing"),
  ),
);
check(
  "icon validator rejects an incorrect rel",
  (await iconContractFailures(
    validIconHtml.replace('rel="icon"', 'rel="shortcut"'),
    virtualRead(validIconAssets),
  )).some((failure) => failure.startsWith("icon:")),
);
check(
  "icon validator rejects wrong href or MIME",
  (await iconContractFailures(
    validIconHtml
      .replace('href="/favicon.ico"', 'href="/wrong.ico"')
      .replace('type="image/png"', 'type="image/jpeg"'),
    virtualRead(validIconAssets),
  )).length === 2,
);
check(
  "icon validator rejects empty and corrupt assets",
  (await iconContractFailures(
    validIconHtml,
    virtualRead(
      new Map([
        ["/favicon.ico", Buffer.alloc(0)],
        ["/apple-touch-icon.png", Buffer.from("not-a-png")],
      ]),
    ),
  )).length === 2,
);
const actualIconFailures = await iconContractFailures(home, async (href) =>
  readFile(new URL(`.${href}`, import.meta.url)).catch(() => null),
);
check(
  `required icon links and assets are valid${
    actualIconFailures.length ? `: ${actualIconFailures.join(", ")}` : ""
  }`,
  actualIconFailures.length === 0,
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
  "konuşmanız cihazda metne dönüştürülür",
  "sqlcipher",
  "aes-256",
  "verin cihazında kalır",
  "cihazında şifreli",
  "cihazda şifreli",
  "cihaz içinde okur",
  "bulut ai bu sürümde kapalıdır",
  "reklamsız, izleme yok",
  "reklam veya davranışsal takip yoktur",
  "0 reklam",
];
for (const claim of forbiddenClaims) {
  check(`unaccepted overclaim is absent: ${claim}`, !homeSearch.includes(claim));
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
