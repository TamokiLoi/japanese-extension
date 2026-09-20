const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const BACKUP_FILE_NAME = "nihongo-nin-backup.json";

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken(config?: { prompt?: string }): void;
}

interface GoogleIdentityOauth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type?: string }) => void;
  }): GoogleTokenClient;
}

interface GoogleIdentityWindow extends Window {
  google?: {
    accounts?: {
      oauth2?: GoogleIdentityOauth2;
    };
  };
}

export interface GoogleDriveBackupFile {
  id: string;
  name: string;
  modifiedTime?: string;
  size?: string;
}

interface GoogleDriveFileList {
  files?: GoogleDriveBackupFile[];
}

export type GoogleDriveBackupErrorCode =
  | "not-configured"
  | "identity-load-failed"
  | "authorization-cancelled"
  | "authorization-failed"
  | "no-backup"
  | "drive-request-failed";

export class GoogleDriveBackupError extends Error {
  constructor(
    public readonly code: GoogleDriveBackupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GoogleDriveBackupError";
  }
}

export function isGoogleDriveBackupConfigured(): boolean {
  return !!import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
}

let identityScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  const oauth2 = (window as GoogleIdentityWindow).google?.accounts?.oauth2;
  if (oauth2) return Promise.resolve();
  if (identityScriptPromise) return identityScriptPromise;

  identityScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`);
    const script = existing ?? document.createElement("script");

    function handleLoad() {
      if ((window as GoogleIdentityWindow).google?.accounts?.oauth2) resolve();
      else reject(new GoogleDriveBackupError("identity-load-failed", "Google Identity Services không khởi tạo được."));
    }

    function handleError() {
      identityScriptPromise = null;
      reject(new GoogleDriveBackupError("identity-load-failed", "Không tải được Google Identity Services."));
    }

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (!existing) {
      script.src = GOOGLE_IDENTITY_SCRIPT;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return identityScriptPromise;
}

async function requestAccessToken(): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new GoogleDriveBackupError("not-configured", "Chưa cấu hình Google OAuth Client ID.");
  }

  await loadGoogleIdentityScript();
  const oauth2 = (window as GoogleIdentityWindow).google?.accounts?.oauth2;
  if (!oauth2) {
    throw new GoogleDriveBackupError("identity-load-failed", "Google Identity Services không khả dụng.");
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new GoogleDriveBackupError("authorization-cancelled", "Phiên đăng nhập Google đã hết thời gian."));
    }, 120_000);

    function finish(action: () => void) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      action();
    }

    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.access_token) {
          finish(() => resolve(response.access_token as string));
          return;
        }
        const detail = response.error_description || response.error || "Google không cấp quyền truy cập Drive.";
        finish(() => reject(new GoogleDriveBackupError("authorization-failed", detail)));
      },
      error_callback: (error) => {
        const cancelled = error.type === "popup_closed";
        finish(() =>
          reject(
            new GoogleDriveBackupError(
              cancelled ? "authorization-cancelled" : "authorization-failed",
              cancelled ? "Bạn đã đóng cửa sổ đăng nhập Google." : "Không thể mở cửa sổ đăng nhập Google.",
            ),
          ),
        );
      },
    });

    // Google remembers consent for this client ID. The first request shows
    // account selection + consent; later requests can issue a fresh short-lived
    // token without storing a refresh token or any credential in localStorage.
    client.requestAccessToken();
  });
}

async function driveFetch(accessToken: string, url: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...init?.headers,
      },
    });
  } catch {
    throw new GoogleDriveBackupError("drive-request-failed", "Không thể kết nối Google Drive.");
  }

  if (response.ok) return response;

  let detail = `Google Drive trả về lỗi ${response.status}.`;
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) detail = body.error.message;
  } catch {
    // Keep the status-based fallback when Drive doesn't return JSON.
  }
  throw new GoogleDriveBackupError("drive-request-failed", detail);
}

async function findLatestBackup(accessToken: string): Promise<GoogleDriveBackupFile | null> {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name = '${BACKUP_FILE_NAME}'`,
    orderBy: "modifiedTime desc",
    pageSize: "10",
    fields: "files(id,name,modifiedTime,size)",
  });
  const response = await driveFetch(accessToken, `${DRIVE_FILES_API}?${params}`);
  const result = (await response.json()) as GoogleDriveFileList;
  return result.files?.[0] ?? null;
}

async function createBackupFile(accessToken: string, json: string): Promise<GoogleDriveBackupFile> {
  const boundary = `nihongo_nin_${crypto.randomUUID?.() ?? Date.now().toString(36)}`;
  const metadata = JSON.stringify({
    name: BACKUP_FILE_NAME,
    mimeType: "application/json",
    parents: ["appDataFolder"],
  });
  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      json,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  );
  const params = new URLSearchParams({ uploadType: "multipart", fields: "id,name,modifiedTime,size" });
  const response = await driveFetch(accessToken, `${DRIVE_UPLOAD_API}?${params}`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return response.json() as Promise<GoogleDriveBackupFile>;
}

async function updateBackupFile(accessToken: string, fileId: string, json: string): Promise<GoogleDriveBackupFile> {
  const params = new URLSearchParams({ uploadType: "media", fields: "id,name,modifiedTime,size" });
  const response = await driveFetch(accessToken, `${DRIVE_UPLOAD_API}/${encodeURIComponent(fileId)}?${params}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: json,
  });
  return response.json() as Promise<GoogleDriveBackupFile>;
}

export async function saveBackupToGoogleDrive(json: string): Promise<GoogleDriveBackupFile> {
  const accessToken = await requestAccessToken();
  const existing = await findLatestBackup(accessToken);
  return existing
    ? updateBackupFile(accessToken, existing.id, json)
    : createBackupFile(accessToken, json);
}

export async function loadBackupFromGoogleDrive(): Promise<{ json: string; file: GoogleDriveBackupFile }> {
  const accessToken = await requestAccessToken();
  const file = await findLatestBackup(accessToken);
  if (!file) {
    throw new GoogleDriveBackupError("no-backup", "Tài khoản Google này chưa có bản sao lưu Nihongo Nin.");
  }
  const response = await driveFetch(
    accessToken,
    `${DRIVE_FILES_API}/${encodeURIComponent(file.id)}?alt=media`,
  );
  return { json: await response.text(), file };
}

export function googleDriveBackupErrorMessage(error: unknown): string {
  if (!(error instanceof GoogleDriveBackupError)) return "Có lỗi xảy ra khi làm việc với Google Drive.";
  if (error.code === "not-configured") return "Google Drive backup chưa được cấu hình cho bản build này.";
  if (error.code === "authorization-cancelled") return error.message;
  if (error.code === "identity-load-failed") return "Không tải được dịch vụ đăng nhập Google. Hãy kiểm tra kết nối hoặc trình chặn script.";
  if (error.code === "no-backup") return error.message;
  return `Không thể truy cập Google Drive: ${error.message}`;
}
