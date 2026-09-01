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

const supportUrl = "https://lifeos.app/destek";
const supportPath = "/destek";
const slashfulSupportUrl = `${supportUrl}/`;
const slashfulSupportPath = `${supportPath}/`;
const staleSupportUrl = ["https://yulalab.com", "support"].join("/");

function supportContractFailures({ home, support, sitemap, readme, firebase }) {
  const failures = [];

  if (firebase.hosting?.trailingSlash !== false) {
    failures.push("firebase: trailingSlash must be false");
  }

  const canonicalTags = [...support.matchAll(/<link\b[^>]*>/gi)].filter((tag) =>
    attribute(tag[0], "rel").toLowerCase().split(/\s+/).includes("canonical"),
  );
  if (
    canonicalTags.length !== 1 ||
    attribute(canonicalTags[0][0], "href") !== supportUrl
  ) {
    failures.push("support: canonical must be the exact slashless URL");
  }

  const supportHrefs = [...home.matchAll(/<a\b[^>]*>/gi)]
    .map((match) => attribute(match[0], "href"))
    .filter((href) => href.replace(/\/+$/, "") === supportPath);
  if (supportHrefs.length === 0 || supportHrefs.some((href) => href !== supportPath)) {
    failures.push("home: support hrefs must use the exact slashless path");
  }

  const supportLocations = [...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => match[1])
    .filter((location) => location.replace(/\/+$/, "") === supportUrl);
  if (
    supportLocations.length !== 1 ||
    supportLocations[0] !== supportUrl
  ) {
    failures.push("sitemap: support loc must be the exact slashless URL");
  }

  const documentedSupportUrls = [
    ...readme.matchAll(/https:\/\/[^\s)<>'"]+/gi),
  ]
    .map((match) => match[0])
    .filter(
      (url) =>
        url.replace(/\/+$/, "") === supportUrl || url === staleSupportUrl,
    );
  if (
    documentedSupportUrls.length !== 2 ||
    documentedSupportUrls.some((url) => url !== supportUrl)
  ) {
    failures.push("readme: both support URLs must use the exact LifeOS URL");
  }

  return failures;
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

const [home, notFound, firebaseSource, sitemap, readme] = await Promise.all([
  read("./index.html"),
  read("./404.html"),
  read("./firebase.json"),
  read("./sitemap.xml"),
  read("./README.md"),
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

const validSupportFixture = {
  home: `<a href="${supportPath}">Destek</a>`,
  support: `<link rel="canonical" href="${supportUrl}">`,
  sitemap: `<loc>${supportUrl}</loc>`,
  readme: `Support: ${supportUrl}\nSupport URL: ${supportUrl}`,
  firebase: { hosting: { trailingSlash: false } },
};
check(
  "support validator accepts the slashless fixture",
  supportContractFailures(validSupportFixture).length === 0,
);
check(
  "support validator rejects trailingSlash configuration drift",
  supportContractFailures({
    ...validSupportFixture,
    firebase: { hosting: { trailingSlash: true } },
  }).some((failure) => failure.startsWith("firebase:")),
);
check(
  "support validator rejects a slashful canonical",
  supportContractFailures({
    ...validSupportFixture,
    support: validSupportFixture.support.replace(supportUrl, slashfulSupportUrl),
  }).some((failure) => failure.startsWith("support:")),
);
check(
  "support validator rejects a slashful internal link",
  supportContractFailures({
    ...validSupportFixture,
    home: validSupportFixture.home.replace(supportPath, slashfulSupportPath),
  }).some((failure) => failure.startsWith("home:")),
);
check(
  "support validator rejects a slashful sitemap location",
  supportContractFailures({
    ...validSupportFixture,
    sitemap: validSupportFixture.sitemap.replace(supportUrl, slashfulSupportUrl),
  }).some((failure) => failure.startsWith("sitemap:")),
);
check(
  "support validator rejects the stale README support URL",
  supportContractFailures({
    ...validSupportFixture,
    readme: validSupportFixture.readme.replace(supportUrl, staleSupportUrl),
  }).some((failure) => failure.startsWith("readme:")),
);
const actualSupportFailures = supportContractFailures({
  home,
  support,
  sitemap,
  readme,
  firebase,
});
check(
  `real support URLs match trailingSlash false${
    actualSupportFailures.length ? `: ${actualSupportFailures.join(", ")}` : ""
  }`,
  actualSupportFailures.length === 0,
);
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
