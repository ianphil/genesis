import { execFileSync } from "node:child_process";

const CREDENTIAL_PREFIX = "copilot-cli/";

function getTokenWindows() {
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public class CredEnum {
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool CredEnumerateW(string filter, int flags, out int count, out IntPtr creds);
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool CredReadW(string target, int type, int flags, out IntPtr cred);
  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr cred);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags; public int Type; public string TargetName;
    public string Comment; public long LastWritten; public int CredentialBlobSize;
    public IntPtr CredentialBlob; public int Persist; public int AttributeCount;
    public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  public static string GetFirst(string prefix) {
    IntPtr creds; int count;
    if (!CredEnumerateW(prefix + "*", 0, out count, out creds)) return null;
    for (int i = 0; i < count; i++) {
      IntPtr entry = Marshal.ReadIntPtr(creds, i * IntPtr.Size);
      var c = Marshal.PtrToStructure<CREDENTIAL>(entry);
      if (c.TargetName != null && c.TargetName.StartsWith(prefix) && c.CredentialBlobSize > 0) {
        byte[] b = new byte[c.CredentialBlobSize];
        Marshal.Copy(c.CredentialBlob, b, 0, c.CredentialBlobSize);
        CredFree(creds);
        return System.Text.Encoding.UTF8.GetString(b);
      }
    }
    CredFree(creds);
    return null;
  }
}
"@
[CredEnum]::GetFirst('${CREDENTIAL_PREFIX}')
`;

  try {
    const token = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", script],
      { encoding: "utf8", timeout: 15000 },
    ).trim();

    if (token) {
      return token;
    }
  } catch {
    // Credential Manager unavailable or no matching entry.
  }

  return null;
}

export function getToken() {
  if (process.platform === "win32") {
    const token = getTokenWindows();
    if (token) {
      return token;
    }
  }

  throw new Error(
    "Could not retrieve Copilot token. "
    + (process.platform === "win32"
      ? "No copilot-cli/* entry found in Windows Credential Manager."
      : "Token retrieval is only supported on Windows via Credential Manager.")
    + " Ensure Copilot CLI is authenticated.",
  );
}
