import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const CREDENTIAL_SERVICE = "wechat-layout-publisher";

export const CREDENTIAL_KEYS = ["WECHAT_APP_ID", "WECHAT_APP_SECRET"] as const;
export type CredentialKey = (typeof CREDENTIAL_KEYS)[number];

export interface RuntimeCredentials {
  wechatAppId?: string;
  wechatAppSecret?: string;
}

export function credentialStoreName(): string {
  if (process.platform === "darwin") return "macOS Keychain";
  if (process.platform === "win32") return "Windows Credential Manager";
  return "environment variables or .env";
}

function windowsScript(action: "read" | "write" | "delete"): string {
  const common = String.raw`
Add-Type @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public class CredMan {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public UInt32 Flags;
    public UInt32 Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  [DllImport("advapi32.dll", EntryPoint = "CredWriteW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool CredWrite(ref CREDENTIAL credential, UInt32 flags);

  [DllImport("advapi32.dll", EntryPoint = "CredReadW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool CredRead(string target, UInt32 type, UInt32 reservedFlag, out IntPtr credentialPtr);

  [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool CredDelete(string target, UInt32 type, UInt32 flags);

  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern void CredFree(IntPtr buffer);

  public static void Write(string target, string user, string secret) {
    byte[] bytes = Encoding.Unicode.GetBytes(secret);
    IntPtr blob = Marshal.AllocCoTaskMem(bytes.Length);
    Marshal.Copy(bytes, 0, blob, bytes.Length);
    CREDENTIAL credential = new CREDENTIAL();
    credential.Type = 1;
    credential.TargetName = target;
    credential.UserName = user;
    credential.CredentialBlob = blob;
    credential.CredentialBlobSize = (UInt32)bytes.Length;
    credential.Persist = 2;
    try {
      if (!CredWrite(ref credential, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
    } finally {
      Marshal.FreeCoTaskMem(blob);
    }
  }

  public static string Read(string target) {
    IntPtr credentialPtr;
    if (!CredRead(target, 1, 0, out credentialPtr)) return "";
    try {
      CREDENTIAL credential = (CREDENTIAL)Marshal.PtrToStructure(credentialPtr, typeof(CREDENTIAL));
      if (credential.CredentialBlob == IntPtr.Zero || credential.CredentialBlobSize == 0) return "";
      return Marshal.PtrToStringUni(credential.CredentialBlob, (int)credential.CredentialBlobSize / 2);
    } finally {
      CredFree(credentialPtr);
    }
  }

  public static void Delete(string target) {
    CredDelete(target, 1, 0);
  }
}
"@`;
  if (action === "read") return `${common}\n[CredMan]::Read($env:WLP_TARGET)`;
  if (action === "write") {
    return `${common}\n[CredMan]::Write($env:WLP_TARGET, $env:WLP_USER, $env:WLP_SECRET)`;
  }
  return `${common}\n[CredMan]::Delete($env:WLP_TARGET)`;
}

function targetFor(key: CredentialKey): string {
  return `${CREDENTIAL_SERVICE}:${key}`;
}

export function credentialLookupLabel(key: CredentialKey): string {
  if (process.platform === "darwin") return `service=${CREDENTIAL_SERVICE} account=${key}`;
  if (process.platform === "win32") return `target=${targetFor(key)} user=${key}`;
  return `environment variable ${key} or local .env`;
}

async function execPowerShell(script: string, env: NodeJS.ProcessEnv): Promise<string> {
  const exe = process.env.SystemRoot ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe` : "powershell.exe";
  const { stdout } = await execFileAsync(exe, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    env: { ...process.env, ...env },
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

export async function readStoredCredential(key: CredentialKey): Promise<string | undefined> {
  if (process.platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("security", ["find-generic-password", "-s", CREDENTIAL_SERVICE, "-a", key, "-w"]);
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  if (process.platform === "win32") {
    const value = await execPowerShell(windowsScript("read"), {
      WLP_TARGET: targetFor(key),
    });
    return value || undefined;
  }

  return undefined;
}

export async function writeStoredCredential(key: CredentialKey, value: string): Promise<void> {
  if (!value) return;
  if (/[\r\n]/.test(value)) throw new Error(`${key} must be a single-line value.`);

  if (process.platform === "darwin") {
    await new Promise<void>((resolve, reject) => {
      // `security` reads the secret from stdin when -w is the final option, keeping it out of argv/process listings.
      const child = spawn("security", ["add-generic-password", "-s", CREDENTIAL_SERVICE, "-a", key, "-U", "-w"], {
        stdio: ["pipe", "ignore", "ignore"],
      });
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`macOS Keychain write failed with exit code ${String(code)}.`));
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(`${value}\n`);
    });
    return;
  }

  if (process.platform === "win32") {
    await execPowerShell(windowsScript("write"), {
      WLP_TARGET: targetFor(key),
      WLP_USER: key,
      WLP_SECRET: value,
    });
    return;
  }

  throw new Error("Secure credential setup is supported on macOS and Windows. Use environment variables or a local .env file on this platform.");
}

export async function deleteStoredCredential(key: CredentialKey): Promise<void> {
  if (process.platform === "darwin") {
    try {
      await execFileAsync("security", ["delete-generic-password", "-s", CREDENTIAL_SERVICE, "-a", key]);
    } catch {
      // Already absent.
    }
    return;
  }

  if (process.platform === "win32") {
    await execPowerShell(windowsScript("delete"), {
      WLP_TARGET: targetFor(key),
    });
  }
}

export async function resolveRuntimeCredentials(env: Record<string, string | undefined>): Promise<RuntimeCredentials> {
  const value = async (key: CredentialKey): Promise<string | undefined> => env[key] || (await readStoredCredential(key));
  return {
    wechatAppId: await value("WECHAT_APP_ID"),
    wechatAppSecret: await value("WECHAT_APP_SECRET"),
  };
}

export function missingCredentialMessage(missing: string[]): string {
  return [
    `Missing ${missing.join(" / ")}.`,
    "Run `npm run setup` in the skill's scripts folder to save credentials in your system credential store.",
    "Advanced users may also set environment variables or create a local .env file from .env.example.",
  ].join(" ");
}
