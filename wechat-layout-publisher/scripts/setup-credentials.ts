import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CREDENTIAL_KEYS,
  CredentialKey,
  credentialLookupLabel,
  credentialStoreName,
  deleteStoredCredential,
  readStoredCredential,
  resolveRuntimeCredentials,
  writeStoredCredential,
} from "./credentials.ts";
import { getAccessToken } from "./wechat.ts";

function usage(): string {
  return [
    "Usage:",
    "  npm run setup              Save credentials to macOS Keychain or Windows Credential Manager",
    "  npm run check-credentials  Check saved WeChat credentials and IP whitelist",
    "  npm run diagnose-credentials  Show where credentials are read from, without revealing secrets",
    "  npm run import-credentials  Import WECHAT_* from environment or .env into the system credential store",
    "  npx tsx setup-credentials.ts clear",
  ].join("\n");
}

function loadEnv(scriptDir: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  const candidates = [join(process.cwd(), ".env"), resolve(scriptDir, "..", ".env")];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

async function promptSecret(label: string): Promise<string> {
  if (!input.isTTY || !output.isTTY) {
    const rl = createInterface({ input, output });
    const answer = await rl.question(label);
    rl.close();
    return answer.trim();
  }

  return new Promise((resolve) => {
    let value = "";
    output.write(label);
    input.setRawMode(true);
    input.resume();
    const onData = (buf: Buffer) => {
      const text = buf.toString("utf8");
      for (const char of text) {
        if (char === "\u0003") {
          output.write("\n");
          process.exit(130);
        }
        if (char === "\r" || char === "\n") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          output.write("\n");
          resolve(value.trim());
          return;
        }
        if (char === "\u007f") {
          value = value.slice(0, -1);
          output.write("\b \b");
          continue;
        }
        value += char;
        output.write("*");
      }
    };
    input.on("data", onData);
  });
}

async function currentPublicIp(): Promise<string> {
  try {
    const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(8000) });
    const data = (await res.json()) as { ip?: string };
    return data.ip || "";
  } catch {
    return "";
  }
}

async function check(): Promise<void> {
  const env = loadEnv(dirname(fileURLToPath(import.meta.url)));
  const credentials = await resolveRuntimeCredentials(env);
  const appId = credentials.wechatAppId;
  const appSecret = credentials.wechatAppSecret;
  if (!appId || !appSecret) {
    throw new Error("WeChat credentials were not found. Run `npm run diagnose-credentials` to see the lookup targets, then `npm run setup` or `npm run import-credentials`.");
  }

  const ip = await currentPublicIp();
  if (ip) console.log(`Current public IP: ${ip}`);
  console.log("Checking WeChat access_token...");
  const token = await getAccessToken(appId, appSecret);
  console.log(`OK: access_token received, expires in about ${token ? "7200" : "?"} seconds.`);
}

async function clear(): Promise<void> {
  for (const key of CREDENTIAL_KEYS) await deleteStoredCredential(key);
  console.log(`Removed saved credentials from ${credentialStoreName()}.`);
}

async function diagnose(): Promise<void> {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const env = loadEnv(scriptDir);
  console.log(`Credential store: ${credentialStoreName()}`);
  for (const key of CREDENTIAL_KEYS) {
    const envFound = Boolean(env[key]);
    const storedFound = Boolean(await readStoredCredential(key));
    console.log(`${key}`);
    console.log(`  standard lookup: ${credentialLookupLabel(key)}`);
    console.log(`  environment/.env: ${envFound ? "found" : "missing"}`);
    console.log(`  system store:     ${storedFound ? "found" : "missing"}`);
  }
  console.log("No secret values are printed.");
}

async function importCredentials(): Promise<void> {
  const env = loadEnv(dirname(fileURLToPath(import.meta.url)));
  const required: CredentialKey[] = ["WECHAT_APP_ID", "WECHAT_APP_SECRET"];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing ${missing.join(" / ")} in environment variables or local .env. Nothing was imported.`);
  }
  for (const key of CREDENTIAL_KEYS) {
    if (env[key]) await writeStoredCredential(key, env[key] || "");
  }
  console.log(`Imported available credentials into ${credentialStoreName()} using the standard service/accounts.`);
  console.log("No secret values were printed.");
}

async function setup(): Promise<void> {
  if (process.platform !== "darwin" && process.platform !== "win32") {
    throw new Error("Interactive secure setup currently supports macOS and Windows. Use environment variables or a local .env file on this platform.");
  }

  console.log(`This will save credentials to ${credentialStoreName()} on this computer.`);
  console.log("Get AppID/AppSecret from the WeChat Official Account backend: Settings and Development -> Basic Configuration.");
  console.log("Before publishing, add this computer's public IP to the Official Account IP whitelist.");
  const ip = await currentPublicIp();
  if (ip) console.log(`Current public IP: ${ip}`);

  const rl = createInterface({ input, output });
  const appId = (await rl.question("WECHAT_APP_ID: ")).trim();
  rl.close();
  const appSecret = await promptSecret("WECHAT_APP_SECRET: ");

  const pairs: [CredentialKey, string][] = [
    ["WECHAT_APP_ID", appId],
    ["WECHAT_APP_SECRET", appSecret],
  ];

  for (const [key, value] of pairs) await writeStoredCredential(key, value);
  console.log(`Saved credentials to ${credentialStoreName()}.`);

  try {
    await check();
  } catch (err) {
    console.log("Saved credentials, but the live WeChat check did not pass yet.");
    console.log(err instanceof Error ? err.message : String(err));
    console.log("Most common causes: wrong AppSecret, account lacks API permission, or the public IP is not in the WeChat whitelist.");
  }
}

async function main() {
  const command = process.argv[2] || "setup";
  if (command === "setup") return setup();
  if (command === "check") return check();
  if (command === "diagnose") return diagnose();
  if (command === "import") return importCredentials();
  if (command === "clear") return clear();
  if (command === "-h" || command === "--help" || command === "help") {
    console.log(usage());
    return;
  }
  throw new Error(`Unknown command: ${command}\n${usage()}`);
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
