// Cross-platform toast notifications.

import { exec } from "node:child_process";

const escaped = (s) => s.replace(/'/g, "''").replace(/`/g, "``");

/**
 * Fire an OS-level toast notification.
 * Windows: uses WinRT ToastNotificationManager.
 * macOS: uses osascript.
 * Linux: uses notify-send.
 * Fails silently on unsupported platforms.
 */
export function toast(title, message) {
  switch (process.platform) {
    case "win32": {
      const ps = `
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null;
        $xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02);
        $text = $xml.GetElementsByTagName('text');
        $text[0].AppendChild($xml.CreateTextNode('${escaped(title)}')) | Out-Null;
        $text[1].AppendChild($xml.CreateTextNode('${escaped(message)}')) | Out-Null;
        $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Genesis');
        $notifier.Show([Windows.UI.Notifications.ToastNotification]::new($xml))
      `.replace(/\n/g, " ");
      exec(`powershell -NoProfile -Command "${ps}"`, () => {});
      break;
    }
    case "darwin": {
      exec(`osascript -e 'display notification "${message}" with title "${title}"'`, () => {});
      break;
    }
    default: {
      exec(`notify-send "${title}" "${message}" 2>/dev/null`, () => {});
      break;
    }
  }
}
