import type { CapacitorConfig } from "@capacitor/cli";

// NOTE: appId is permanent once the app is published to the stores. Change it
// before your first release if you want a different bundle identifier.
const config: CapacitorConfig = {
  appId: "com.readability.app",
  appName: "Readability",
  // The static Next.js export produced by `npm run build:mobile`.
  webDir: "out",
  plugins: {
    LocalNotifications: {
      // Monochrome status-bar icon (res/drawable/ic_stat_notify.xml). Without
      // this Android shows the launcher icon as a featureless gray square.
      smallIcon: "ic_stat_notify",
      // Accent tint applied to the icon/expanded notification (brand gold).
      iconColor: "#ECC06B",
    },
  },
};

export default config;
